"use client";

// 가구배치(시뮬레이션) 전용 독립 화면.
// "이 시뮬레이션 프로그램만 별도로 만든다는 뜻이야" + "큰 화면에서 자유롭게 쓰고 싶다"는 요청으로,
// 리마켓 영업관리 시스템(로그인 후 여러 메뉴가 있는 화면) 전체가 아니라 가구배치(시뮬레이션) 화면
// 하나만 따로 열리는 독립된 페이지를 새로 만들었다. 메인 시스템과 완전히 같은 로그인 계정을 그대로
// 쓰고(같은 Supabase 프로젝트), 같은 브라우저에서 메인 시스템에 이미 로그인돼 있으면 이 페이지도
// 로그인 화면 없이 바로 열린다. 이 주소를 즐겨찾기하거나, 크롬/엣지의 "앱으로 설치" 기능으로
// 바탕화면·시작프로그램에 아이콘을 만들어두면, 다른 메뉴들을 거치지 않고 이 화면 하나만 주소창 없는
// 큰 독립창으로 바로 열어 쓸 수 있다(app/gagu-layout/layout.js에 이 화면 전용 앱 이름·아이콘
// 정보(manifest-gagu-layout.json)를 따로 둬서, 메인 시스템과는 다른 별도의 앱으로 설치된다).
//
// 아래 코드는 메인 시스템(app/page.js)의 가구배치(시뮬레이션) 부분과 그 부분이 쓰는 공용 색상·버튼
// 스타일·도형 계산 함수들을 그대로 옮겨온 것이다 — 다른 파일에 기대지 않고 이 파일 하나로 그대로
// 동작하도록(메인 시스템 파일은 그대로 두고 복사) 만들었다. 그래서 메인 시스템의 가구배치(시뮬레이션)
// 화면을 나중에 고치면, 이 화면에도 그 수정을 똑같이 옮겨와야 계속 같은 기능을 유지할 수 있다.

import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";

const C = {
  bg: "#FAF9F5",
  panel: "#FFFFFF",
  ink: "#1C2B3A",
  inkSoft: "#4B5A6A",
  line: "#DDD8CC",
  lineSoft: "#EAE6DB",
  amber: "#C98A2C",
  amberBg: "#FBF0DD",
  green: "#3F7A5C",
  greenBg: "#E8F1EC",
  brick: "#B0402E",
  brickBg: "#F7E9E6",
  purple: "#6B5CA5",
  purpleBg: "#EFEBFA",
  mutedBg: "#EEEEEC",
  muted: "#6B7280",
};

const serif = "'Noto Serif KR','Georgia',serif";
const sans = "'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif";

const todayISO = () => new Date().toISOString().slice(0, 10);

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  fontSize: 14.5,
  border: `1px solid ${C.line}`,
  borderRadius: 6,
  background: C.bg,
  color: C.ink,
  outline: "none",
  fontFamily: sans,
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};
const smallInputStyle = { ...inputStyle, padding: "6px 8px", fontSize: 13, borderRadius: 5 };
const primaryBtnStyle = {
  width: "100%",
  padding: "11px 0",
  background: C.ink,
  color: "#fff",
  border: "none",
  borderRadius: 7,
  fontSize: 14.5,
  fontWeight: 600,
  letterSpacing: 0.1,
  cursor: "pointer",
  fontFamily: sans,
  boxShadow: "0 2px 8px rgba(28,43,58,0.18)",
  transition: "transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease",
};
const primaryBtnStyle2 = { ...primaryBtnStyle, width: "auto", padding: "9px 16px", fontSize: 13.5 };
const ghostBtnStyle = {
  padding: "8px 14px",
  background: "transparent",
  border: `1px solid ${C.line}`,
  borderRadius: 7,
  color: C.inkSoft,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: sans,
  transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
};
const miniBtnStyle = { ...ghostBtnStyle, padding: "5px 10px", fontSize: 12, borderRadius: 6 };
const miniBtnStylePrimary = {
  ...miniBtnStyle,
  background: C.green,
  border: `1px solid ${C.green}`,
  color: "#fff",
  fontWeight: 600,
  boxShadow: "0 2px 6px rgba(63,122,92,0.22)",
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12.5, color: C.inkSoft, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

// 로그인 아이디에 "@"가 없으면(직원용 짧은 아이디, 예: re001) 내부적으로 가짜 도메인을 붙여
// 이메일 형식으로 만들어 로그인한다 — 메인 시스템과 완전히 같은 계정을 그대로 쓴다.
const STAFF_LOGIN_DOMAIN = "remarket-staff.local";
function resolveLoginEmail(idOrEmail) {
  const v = (idOrEmail || "").trim();
  return v.includes("@") ? v : `${v}@${STAFF_LOGIN_DOMAIN}`;
}

function LoginScreen() {
  const [idOrEmail, setIdOrEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: resolveLoginEmail(idOrEmail), password: pw });
      if (error) setErr("아이디 또는 비밀번호가 올바르지 않습니다.");
    } catch (e2) {
      setErr("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요. (네트워크 또는 서버 점검 중일 수 있습니다)");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 380, maxWidth: "100%" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: serif, fontSize: 27, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink }}>가구배치(시뮬레이션)</div>
          <div style={{ fontSize: 13.5, color: C.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
            리마켓 영업관리 시스템과 같은 계정으로 로그인합니다.
          </div>
        </div>
        <form onSubmit={submit} style={{ background: C.panel, border: `1px solid ${C.line}`, padding: 28 }}>
          <Field label="아이디">
            <input value={idOrEmail} onChange={(e) => setIdOrEmail(e.target.value)} style={inputStyle} placeholder="예: re001" autoFocus />
          </Field>
          <Field label="비밀번호">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={inputStyle} placeholder="••••••••" />
          </Field>
          {err && <div style={{ color: C.brick, fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <button type="submit" disabled={busy} style={primaryBtnStyle}>
            {busy ? "로그인 중…" : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}

function shapePolygonPoints(shapeType, widthCm, depthCm, notchWidthCm, notchDepthCm) {
  const W = Number(widthCm) || 0;
  const D = Number(depthCm) || 0;
  if (shapeType === "l") {
    const nw = Math.min(Math.max(Number(notchWidthCm) || 0, 0), Math.max(W - 1, 0));
    const nd = Math.min(Math.max(Number(notchDepthCm) || 0, 0), Math.max(D - 1, 0));
    return [
      [0, 0],
      [W - nw, 0],
      [W - nw, nd],
      [W, nd],
      [W, D],
      [0, D],
    ];
  }
  if (shapeType === "u") {
    const nw = Math.min(Math.max(Number(notchWidthCm) || 0, 0), Math.max(W - 2, 0));
    const nd = Math.min(Math.max(Number(notchDepthCm) || 0, 0), Math.max(D - 1, 0));
    const armW = (W - nw) / 2;
    return [
      [0, 0],
      [armW, 0],
      [armW, nd],
      [armW + nw, nd],
      [armW + nw, 0],
      [W, 0],
      [W, D],
      [0, D],
    ];
  }
  return [
    [0, 0],
    [W, 0],
    [W, D],
    [0, D],
  ];
}

// 한쪽 끝만 둥근 테이블(U형테이블 등: 위쪽은 폭 그대로 사각형으로 내려오다가, 맨 아래에서 폭과 같은
// 지름의 반원으로 둥글게 마무리되는 모양) 외곽선을 SVG path로 그린다. 직선만으로는 표현할 수 없는
// 곡선(반원)이 있어서 shapePolygonPoints(다각형)와 달리 path의 "d" 속성 문자열을 만들어 돌려준다.
function roundEndTablePathD(widthCm, depthCm) {
  const W = Number(widthCm) || 0;
  const D = Number(depthCm) || 0;
  const radius = Math.min(W / 2, D);
  const rectDepth = D - radius;
  return `M 0,0 L ${W},0 L ${W},${rectDepth} A ${radius},${radius} 0 0 1 0,${rectDepth} Z`;
}

// 사무용 의자를 캐드(CAD) 도면처럼 위에서 내려다본 모양으로 그린다. 사용자가 직접 올려준 참고 이미지
// (주차배치도 안 의자 기호 — 의자가 옆으로 돌아간 채 찍혀 있었다)를 확대해서 확인해보니 "방석과 헤드가
// 있고 양옆에 팔걸이가 있는" 사무의자를 위에서 본 모습이었다: 둥근 네모 두 덩어리(헤드/등받이 + 방석)가
// 위아래로 살짝 겹치며 붙어 있고, 그 좌우로 가늘고 긴 타원 모양 팔걸이가 볼록하게 튀어나와 있다. 좌판
// 앞쪽엔 쿠션 경계를 나타내는 얇은 곡선이 하나 더 있다. width_cm×depth_cm 박스 안에 맞춰 그려서
// 등받이(헤드)가 위(0)쪽, 좌판이 아래(depth)쪽을 향하도록 기본 방향을 잡아뒀고, 회전 버튼으로 다른
// 방향도 그대로 돌릴 수 있다.
//
// 팔걸이(타원)와 몸통(둥근 네모 두 덩어리)을 "따로따로 테두리선까지 그려 넣은 도형 여러 개"로 서로
// 크게 겹치게 그리면, 겹치는 안쪽에서 서로 다른 도형의 테두리선이 그대로 드러나 보여 지저분해진다
// (예전에 "의자 모양이 이상하다"는 문제가 생겼던 것과 같은 이유). 그래서 팔걸이 타원의 중심을 몸통의
// 옆면 선에 딱 맞춰 둬서, 타원이 가장 볼록한 세로 가운데 부분만 몸통 밖으로 자연스럽게 튀어나오고
// (여기는 겹치는 도형이 없어 깨끗함), 위아래로 갈수록 타원이 점점 좁아지면서 몸통 테두리 안쪽으로
// 들어가는 부분은 나중에 그려지는 몸통(둥근 네모)이 통째로 덮어 가리도록 했다. 이러면 별도의 겹침
// 보정 없이도 안쪽에 지저분한 선이 생기지 않는다.
function ChairTopIcon({ w, d, fill, stroke }) {
  const W = Number(w) || 0;
  const D = Number(d) || 0;
  const minWD = Math.min(W, D);
  const strokeW = Math.max(minWD * 0.025, 0.4);

  // 팔걸이(양옆) — 세로로 길고 가느다란 타원. 중심을 몸통 옆면에 둬서 세로 가운데만 볼록하게 삐져나온다.
  const armRx = W * 0.09;
  const armRy = D * 0.42;
  const bodyW = W * 0.74;
  const bodyX = (W - bodyW) / 2;

  // 몸통 = 헤드(위, 등받이) + 좌판(아래) 두 덩어리가 가운데서 살짝 겹치며 만난다.
  const marginY = D * 0.03;
  const bodyTop = marginY;
  const bodyBottom = D - marginY;
  const lobeH = (bodyBottom - bodyTop) * 0.56;
  const headY = bodyTop;
  const seatY = bodyBottom - lobeH;
  const lobeRx = Math.min(bodyW, lobeH) * 0.34;

  // 좌판 앞쪽 쿠션 경계선 — 참고 이미지에 있는, 좌판 아래쪽의 살짝 휘어진 얇은 곡선 하나.
  const seamY = seatY + lobeH * 0.72;
  const seamHalfW = bodyW * 0.28;

  return (
    <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round">
      {/* 팔걸이는 원래 몸통과 같은 색으로 꽉 채워 그렸는데, 사용자가 "손잡이(팔걸이) 부분이 다 칠해져
          있는데 이거 빈공간으로 해달라"고 요청 — 실제 사무의자 팔걸이는 안쪽이 뚫린 가느다란 손잡이
          형태이지, 속이 꽉 찬 덩어리가 아니기 때문이다. fill을 none으로 바꿔서 몸통 밖으로 볼록 튀어난
          부분(겹치는 도형이 없는 자리)은 테두리선만 있는 빈 손잡이 모양으로 보이게 하고, 몸통과 겹치는
          안쪽 절반은 여전히 나중에 그려지는 몸통(rect)이 그대로 덮어 가려서 지저분한 선이 남지 않는다. */}
      <ellipse cx={bodyX} cy={D / 2} rx={armRx} ry={armRy} fill="none" />
      <ellipse cx={W - bodyX} cy={D / 2} rx={armRx} ry={armRy} fill="none" />
      <rect x={bodyX} y={headY} width={bodyW} height={lobeH} rx={lobeRx} ry={lobeRx} />
      <rect x={bodyX} y={seatY} width={bodyW} height={lobeH} rx={lobeRx} ry={lobeRx} />
      <path
        d={`M ${W / 2 - seamHalfW} ${seamY} Q ${W / 2} ${seamY + strokeW * 1.4} ${W / 2 + seamHalfW} ${seamY}`}
        fill="none"
        strokeWidth={strokeW * 0.75}
      />
    </g>
  );
}

// 회의실·테이블 앞에 놓는 회의(응접)의자를 위에서 내려다본 모양으로 그린다. "그냥 둥글게만 되어있음
// <-- 첨부한 회의의자 이미지로 수정" 요청을 받고, 사용자가 올려준 참고 아이콘(87×87px 흑백 CAD
// 기호)을 확대·윤곽선(contour) 분석해서 구조를 다시 확인했다: 둥근 배럴(모서리를 큼직하게 둥글린
// 사각형에 가까운, 타원보다는 각진) 몸통 안에, 몸통 중심에서 왼쪽으로 살짝 치우친 자리에 세로로 긴
// 사각형(등받이·좌판의 이음새/쿠션 경계를 나타냄) 하나가 겹쳐 있고, 그 사각형의 위아래 끝이 몸통의
// 둥근 곡선보다 살짝 더 길게 튀어나와 작은 사각 탭처럼 보인다(참고 이미지에서 위아래로 삐죽 나온
// 부분). 몸통은 채워 그리고, 이음새 사각형은 안이 빈 채(fill:none)로 그 위에 겹쳐서, 몸통과 겹치는
// 가운데 부분은 얇은 선(솔기)처럼, 몸통 곡선 밖으로 나가는 위아래 부분만 자연스럽게 작은 빈 탭처럼
// 보이게 했다(사무의자 팔걸이와 같은 "속이 빈 손잡이" 원리).
function MeetingChairTopIcon({ w, d, fill, stroke }) {
  const W = Number(w) || 0;
  const D = Number(d) || 0;
  const minWD = Math.min(W, D);
  const strokeW = Math.max(minWD * 0.025, 0.4);

  // 몸통: 위아래로 살짝 여백을 두고, 좌우로는 폭에 거의 맞춰 그린 큼직하게 둥근 사각형(배럴 모양).
  const marginY = D * 0.08;
  const bodyY = marginY;
  const bodyH = D - marginY * 2;
  const bodyRx = W * 0.24;
  const bodyRy = bodyH * 0.32;

  // 등받이·좌판 이음새: 몸통 가운데보다 살짝 왼쪽에 치우친 세로 사각형. 위아래로는 몸통 여백(marginY)
  // 만큼 몸통 곡선 밖으로 튀어나가도록 0~D 전체 높이로 그린다(캔버스 밖으로는 못 나가므로, 튀어나오는
  // 정도는 딱 이 여백만큼이 최대치다).
  const seamX = W * 0.3;
  const seamW = W * 0.36;

  return (
    <g stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round">
      <rect x={0} y={bodyY} width={W} height={bodyH} rx={bodyRx} ry={bodyRy} fill={fill} />
      <rect x={seamX} y={0} width={seamW} height={D} fill="none" />
    </g>
  );
}
function LayoutSimTab({ managerName = "", insideAppShell = true }) {
  const [shapes, setShapes] = useState([]);
  const [loadingShapes, setLoadingShapes] = useState(true);
  const [newShapeName, setNewShapeName] = useState("");
  const [newShapeType, setNewShapeType] = useState("rect"); // "rect" | "l"(ㄱ자) | "u"(U자) | "circle"(원형) | "roundend"(한쪽둥근) | "chair"(사무의자) | "meetingchair"(회의의자)
  const [newShapeWidth, setNewShapeWidth] = useState("");
  const [newShapeDepth, setNewShapeDepth] = useState("");
  const [newShapeNotchWidth, setNewShapeNotchWidth] = useState(""); // ㄱ자: 잘려나간 모서리, U자: 안쪽 파인 부분
  const [newShapeNotchDepth, setNewShapeNotchDepth] = useState("");
  const [newShapeCategory, setNewShapeCategory] = useState(""); // 비워두면 "기타"로 등록됨
  const [savingShape, setSavingShape] = useState(false);

  // 모형 목록: 품목이 많아지니 큰 카테고리(책상류/테이블류 등)로 접었다 펼 수 있게 하고,
  // 검색으로 카테고리를 몰라도 이름으로 바로 찾을 수 있게 한다.
  const [shapeViewMode, setShapeViewMode] = useState("category"); // "category" | "search"
  const [shapeSearchQuery, setShapeSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState({});
  // "그냥 소팅되게 해줘 위아래 옮길 수 있게도 해줘" 요청: 모형 목록을 이름 가나다순으로만 보여주는
  // 대신, 카테고리별로 위/아래 화살표를 눌러 직접 순서를 바꿀 수 있게 한다. 지금 순서를 바꾸는 중인
  // 모형의 id를 담아뒤서 그 버튼들만 잠깐 비활성화한다(중복 클릭 방지).
  const [movingShapeId, setMovingShapeId] = useState(null);

  const [widthInput, setWidthInput] = useState("5");
  const [depthInput, setDepthInput] = useState("4");
  const [spaceWidthM, setSpaceWidthM] = useState(5);
  const [spaceDepthM, setSpaceDepthM] = useState(4);

  // 배치판 위에 실제로 놓인 모형들. cm 단위 좌표로 들고 있다가 화면에 그릴 때만 축척(scale)을 곱해 px로 바꾼다.
  const [placedItems, setPlacedItems] = useState([]);
  const nextPlacedIdRef = useRef(0);
  const nextPlacedId = () => {
    nextPlacedIdRef.current += 1;
    return `p${nextPlacedIdRef.current}`;
  };
  // 키보드로 옮기려면 "지금 어떤 모형을(들) 고른 상태인지"가 있어야 해서, 모형을 누르면 선택되고
  // 빈 캔버스를 누르면 선택이 풀리게 한다(선택된 모형은 테두리를 강조해서 보여준다). 마우스로 캔버스의
  // 빈 자리를 끌면(마퀴/드래그 선택) 그 사각 범위 안에 걸리는 모형을 한꺼번에 여러 개 선택할 수 있고,
  // 여러 개를 묶어서(그룹화) 같이 움직이거나 복사·붙여넣기 할 수도 있어서 하나짜리 id 대신 Set으로 관리한다.
  const [selectedPlacedIds, setSelectedPlacedIds] = useState(() => new Set());
  // 캔버스의 빈 자리를 눌러서 끄는 드래그 선택(마퀴) 상태. moved:false인 채로 손을 떼면 "그냥 클릭"으로
  // 본다(선택 해제 또는 줄자 찍기).
  const marqueeDragRef = useRef(null);
  const marqueeRectRef = useRef(null); // marqueeRect state와 같은 값을 들고 있는 ref(마우스를 뗀 순간 최신값을 바로 읽기 위함)
  const [marqueeRect, setMarqueeRect] = useState(null); // { xCm, yCm, wCm, hCm } | null
  // Ctrl+C로 복사해둔 모형(들)을 임시로 담아두는 곳(화면에는 안 보임). 여러 개를 함께 복사하면
  // 서로의 상대적인 위치(간격)를 그대로 유지해서 붙여넣을 수 있도록 원래 좌표를 그대로 저장해둔다.
  const clipboardRef = useRef([]);

  const [boards, setBoards] = useState([]);
  const [currentBoardId, setCurrentBoardId] = useState(null);
  const [boardName, setBoardName] = useState("");
  const [savingBoard, setSavingBoard] = useState(false);
  const [loadingBoardId, setLoadingBoardId] = useState(null);

  // 줄자 기능: 캔버스를 두 번 눌러 그 사이 실제 거리(cm/m)를 재본다. 세 번째 클릭부터는 새로 잰다.
  const [rulerMode, setRulerMode] = useState(false);
  const [rulerPoints, setRulerPoints] = useState([]); // [{xCm, yCm}] 0~2개

  // "이미지 임포트" 요청: 실제 도면(사진·스캔 등)을 배경으로 깔아두고 그 위에 정확한 축척으로 모형을
  // 배치할 수 있게 한다. 도면을 올리면 그 안에서 실제 거리를 아는 두 지점을 순서대로 찍고 그 실제
  // 거리(cm)를 입력하는 "축척 맞추기" 과정을 거치는데, 그 비율로 도면 전체의 실제 가로·세로(cm)를
  // 계산해서 공간 크기(spaceWidthM/spaceDepthM)에 그대로 맞춰준다 — 그러면 이후 배치판 위에 이미지가
  // 그 실제 크기로 깔리고, 다른 모형들과 같은 눈금(cm)으로 정확히 겹쳐 보인다.
  const [bgImageUrl, setBgImageUrl] = useState(null); // 화면에 보여줄 blob: URL
  const [bgImagePath, setBgImagePath] = useState(null); // Storage(layout-images 버킷)에 저장된 경로 — 배치안을 저장할 때 이 경로를 같이 저장해서, 나중에 다시 불러올 때 재사용한다.
  // 축척 맞추기 진행 중 상태(모달) — null이면 진행 중이 아님.
  const [calibrating, setCalibrating] = useState(null); // { file, url, naturalW, naturalH, previewW, previewH, previewScale, points: [{xPx,yPx}] }
  const [calibDistanceInput, setCalibDistanceInput] = useState("");
  const [applyingCalibration, setApplyingCalibration] = useState(false);
  // "바둑판 없애기 넣기" 요청: 배치판의 눈금(격자) 배경을 껐다 켰다 할 수 있게 한다. 도면 사진을
  // 올리면 격자가 사진을 가려 지저분해 보일 수 있어서 자동으로 꺼주지만, 언제든 버튼으로 다시 켤 수 있다.
  const [showGrid, setShowGrid] = useState(true);

  // "전체보기 버튼 만들어서 시야확보를 좋게해주고" 요청: 켜면 이 화면(모형 목록+배치판)이 메인
  // 시스템의 바깥 틀(최대폭 1600px, 왼쪽 전체 메뉴)까지 다 걷어내고 화면 전체를 덮는 오버레이로
  // 떠서, 세로 최대 크기(MAX_CANVAS_H)를 평소보다 훨씬 넉넉하게(창 높이 기준) 쓸 수 있다. 가로는
  // 이제 outerWrapRef로 실제 남는 폭을 직접 재기 때문에 평소·전체보기 상관없이 항상 정확하다. Esc를
  // 누르거나 버튼을 다시 누르면 원래 화면으로 돌아온다.
  const [isFullView, setIsFullView] = useState(false);
  useEffect(() => {
    if (!isFullView) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setIsFullView(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullView]);

  const canvasRef = useRef(null);

  useEffect(() => {
    fetchShapes();
    fetchBoards();
  }, []);

  async function fetchShapes() {
    setLoadingShapes(true);
    // 순서(sort_order)를 직접 정해둔 모형은 그 순서대로, 아직 순서를 안 정해둔(값이 비어있는) 예전
    // 모형들은 예전처럼 이름 가나다순으로 맨 뒤에 붙는다(nullsFirst: false) — 그래서 기존 목록은
    // 이 기능을 켠다고 갑자기 순서가 뒤바뀌지 않는다.
    const { data, error } = await supabase
      .from("layout_shapes")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (!error) setShapes(data || []);
    setLoadingShapes(false);
  }

  async function fetchBoards() {
    const { data, error } = await supabase
      .from("layout_boards")
      .select("id, name, width_m, depth_m, updated_at")
      .order("updated_at", { ascending: false });
    if (!error) setBoards(data || []);
  }

  async function handleAddShape() {
    const w = Number(newShapeWidth);
    const d = Number(newShapeDepth);
    const isPoly = newShapeType === "l" || newShapeType === "u";
    const nw = isPoly ? Number(newShapeNotchWidth) : null;
    const nd = isPoly ? Number(newShapeNotchDepth) : null;
    if (!newShapeName.trim()) {
      alert("모형 이름을 입력해주세요.");
      return;
    }
    if (!w || !d) {
      alert("전체 가로·세로 크기(cm)를 입력해주세요.");
      return;
    }
    if (isPoly) {
      if (!nw || !nd) {
        alert(newShapeType === "l" ? "잘려나간 모서리의 가로·세로 크기(cm)를 입력해주세요." : "안쪽 파인 부분의 가로·세로 크기(cm)를 입력해주세요.");
        return;
      }
      if (nw >= w || nd >= d) {
        alert("파인 부분 크기는 전체 가로·세로보다 작아야 해요.");
        return;
      }
    }
    setSavingShape(true);
    // 새로 추가하는 모형은 일단 그 카테고리의 맨 아래에 놓이게 한다(필요하면 아래 목록에서 ▲ 버튼으로
    // 위로 옮기면 됨).
    const targetCategory = (newShapeCategory || "기타").trim();
    const newSortOrder = (shapesByCategory[targetCategory] || []).length;
    const { error } = await supabase.from("layout_shapes").insert({
      name: newShapeName.trim(),
      shape_type: newShapeType,
      width_cm: w,
      depth_cm: d,
      notch_width_cm: nw,
      notch_depth_cm: nd,
      category: targetCategory,
      sort_order: newSortOrder,
    });
    setSavingShape(false);
    if (error) {
      alert("모형 저장 중 오류가 발생했어요: " + error.message);
      return;
    }
    setNewShapeName("");
    setNewShapeType("rect");
    setNewShapeWidth("");
    setNewShapeDepth("");
    setNewShapeNotchWidth("");
    setNewShapeNotchDepth("");
    setNewShapeCategory("");
    fetchShapes();
  }

  async function handleDeleteShape(id) {
    if (!confirm("이 모형을 목록에서 삭제할까요? (이미 배치판에 놓아둔 것들은 그대로 남아요)")) return;
    const { error } = await supabase.from("layout_shapes").delete().eq("id", id);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    fetchShapes();
  }

  // "위아래 옮길 수 있게도 해줘" 요청: 같은 카테고리 안에서만 순서를 바꾼다(다른 카테고리로 옮기는
  // 기능은 아님). 눌린 모형과 그 위/아래 이웃의 자리를 바꾼 뒤, 그 카테고리 안의 모든 모형에 0부터
  // 다시 순서 번호(sort_order)를 매겨서 저장한다 — 순서가 없던 예전 데이터가 섞여 있어도 한 번
  // 옮기고 나면 그 카테고리 전체가 항상 또렷한 순서를 갖게 된다.
  async function handleMoveShape(shape, direction) {
    if (movingShapeId) return;
    const cat = shape.category || "기타";
    const items = shapesByCategory[cat] || [];
    const idx = items.findIndex((x) => x.id === shape.id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    setMovingShapeId(shape.id);
    const reordered = items.slice();
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, moved);
    const results = await Promise.all(
      reordered.map((it, i) => supabase.from("layout_shapes").update({ sort_order: i }).eq("id", it.id))
    );
    setMovingShapeId(null);
    const failed = results.find((r) => r.error);
    if (failed) {
      alert("순서 변경 중 오류가 발생했어요: " + failed.error.message);
      return;
    }
    fetchShapes();
  }

  // 모형이 많아져도 한눈에 찾기 쉽게 큰 카테고리(책상류/테이블류 등)로 묶는다. 카테고리가 안 적혀있으면
  // "기타"로 묶고, 알려진 카테고리를 먼저 보여준 뒤 나머지는 이름순으로 뒤에 붙인다.
  const CATEGORY_ORDER = ["책상류", "의자류", "테이블류", "책장류", "소파·파티션·기타", "컨테이너", "기타"];
  const shapesByCategory = useMemo(() => {
    const map = {};
    for (const s of shapes) {
      const cat = s.category || "기타";
      if (!map[cat]) map[cat] = [];
      map[cat].push(s);
    }
    return map;
  }, [shapes]);
  const categoryNames = useMemo(() => {
    const names = Object.keys(shapesByCategory);
    names.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, "ko");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return names;
  }, [shapesByCategory]);
  function toggleCategory(cat) {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }
  // 검색: 카테고리를 몰라도 이름으로 바로 찾을 수 있게, 전체 모형 중 이름에 검색어가 들어간 것만 골라낸다.
  const shapeSearchResults = useMemo(() => {
    const q = shapeSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return shapes.filter((s) => s.name.toLowerCase().includes(q));
  }, [shapes, shapeSearchQuery]);

  // 모형 목록 한 줄(카테고리 펼친 목록·검색 결과 둘 다 이걸로 그린다) — 드래그해서 배치판에 놓는 것도,
  // 모양별 미리보기(사각형/ㄱ자·U자 다각형/원형/캐드식 사무의자·회의의자)도, 삭제 버튼도 여기서 한 군데만 관리한다.
  function renderShapeRow(s) {
    const shapeType = s.shape_type || "rect";
    const isPoly = shapeType === "l" || shapeType === "u";
    const isCircle = shapeType === "circle";
    const isRoundEnd = shapeType === "roundend";
    const isChair = shapeType === "chair";
    const isMeetingChair = shapeType === "meetingchair";
    const previewPoints = isPoly
      ? shapePolygonPoints(shapeType, s.width_cm, s.depth_cm, s.notch_width_cm, s.notch_depth_cm)
          .map((p) => p.join(","))
          .join(" ")
      : null;
    // "파임 문구를 아예 없애줘 괜히 헷갈리니까" 요청: ㄱ자·U자 모형도 다른 모형과 똑같이 전체
    // 가로×세로만 보여주고, 안쪽에 파인 부분의 세부 치수(파임 가로×세로)는 목록에 따로 적지 않는다
    // (실제 도형 모양·치수 자체는 그대로 유지되고, 목록에 보이는 글자만 간단해짐).
    const sizeLabel = isCircle && s.width_cm === s.depth_cm ? `지름 ${s.width_cm}cm` : `${s.width_cm}×${s.depth_cm}cm`;
    // 같은 카테고리 안에서 몇 번째인지를 알아야 맨 위/맨 아래에서는 ▲/▼ 버튼을 비활성화할 수 있다.
    const catItems = shapesByCategory[s.category || "기타"] || [s];
    const posInCat = catItems.findIndex((x) => x.id === s.id);
    const isFirstInCat = posInCat <= 0;
    const isLastInCat = posInCat === -1 || posInCat >= catItems.length - 1;
    const isMoving = movingShapeId === s.id;
    return (
      <div
        key={s.id}
        draggable
        onDragStart={(e) => handleDragStartCatalog(e, s)}
        title="끌어서 배치판에 놓으세요"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
          padding: "8px 10px",
          marginBottom: 6,
          border: `1px solid ${C.lineSoft}`,
          background: C.bg,
          borderRadius: 6,
          cursor: "grab",
          fontSize: 12.5,
        }}
      >
        {isPoly ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <polygon points={previewPoints} fill={C.purpleBg} stroke={C.purple} strokeWidth={Math.max(s.width_cm, s.depth_cm) / 12} />
          </svg>
        ) : isCircle ? (
          <svg width={14} height={14} style={{ flexShrink: 0 }}>
            <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={C.purpleBg} stroke={C.purple} strokeWidth={1} />
          </svg>
        ) : isRoundEnd ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <path d={roundEndTablePathD(s.width_cm, s.depth_cm)} fill={C.purpleBg} stroke={C.purple} strokeWidth={Math.max(s.width_cm, s.depth_cm) / 12} />
          </svg>
        ) : isChair ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <ChairTopIcon w={s.width_cm} d={s.depth_cm} fill={C.purpleBg} stroke={C.purple} />
          </svg>
        ) : isMeetingChair ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <MeetingChairTopIcon w={s.width_cm} d={s.depth_cm} fill={C.purpleBg} stroke={C.purple} />
          </svg>
        ) : (
          <div style={{ width: 14, height: 14, background: C.purpleBg, border: `1px solid ${C.purple}`, borderRadius: 2, flexShrink: 0 }} />
        )}
        <span style={{ flex: 1 }}>
          {s.name} <span style={{ color: C.muted, fontSize: 11 }}>({sizeLabel})</span>
        </span>
        <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => handleMoveShape(s, "up")}
            disabled={isFirstInCat || isMoving}
            title="같은 카테고리 안에서 위로 옮기기"
            style={{
              border: "none",
              background: "transparent",
              color: isFirstInCat ? C.lineSoft : C.muted,
              cursor: isFirstInCat || isMoving ? "default" : "pointer",
              fontSize: 9,
              lineHeight: 1,
              padding: "1px 2px",
            }}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => handleMoveShape(s, "down")}
            disabled={isLastInCat || isMoving}
            title="같은 카테고리 안에서 아래로 옮기기"
            style={{
              border: "none",
              background: "transparent",
              color: isLastInCat ? C.lineSoft : C.muted,
              cursor: isLastInCat || isMoving ? "default" : "pointer",
              fontSize: 9,
              lineHeight: 1,
              padding: "1px 2px",
            }}
          >
            ▼
          </button>
        </div>
        <button
          onClick={() => handleDeleteShape(s.id)}
          title="모형 삭제"
          style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 12 }}
        >
          ×
        </button>
      </div>
    );
  }

  function handleCreateSpace() {
    const w = Number(widthInput);
    const d = Number(depthInput);
    if (!w || !d || w <= 0 || d <= 0) {
      alert("가로·세로 크기(m)를 입력해주세요.");
      return;
    }
    setSpaceWidthM(w);
    setSpaceDepthM(d);
    // 새로 방을 만들면 이전에 확대·이동해서 보고 있던 화면은 의미가 없으니 다시 방 전체가 딱
    // 보이는 상태로 되돌린다.
    setZoomLevel(1);
    setViewPan({ x: 0, y: 0 });
  }

  // 도면 이미지 파일을 고르면 곧바로 Storage에 올리지 않는다 — 축척 맞추기를 끝내기 전에 취소할
  // 수도 있어서, 일단 브라우저 안에서만(blob: URL) 미리 보여주고 실제 업로드는 축척을 확정한
  // 뒤(handleApplyCalibration)에만 한다.
  function handleBgImageFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일(JPG, PNG 등)만 올릴 수 있어요.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // "도면 업로드 화면도 크게" 요청: 미리보기의 "기본(확대 전) 크기"는 창 크기에 맞춰 정한
      // 미리보기 창(CALIB_VIEWPORT_W×H) 안에 들어오게 줄인다(원본 사진 파일 자체는 그대로 두고
      // 화면 표시 비율만 줄이는 것 — 이 비율(previewScale)은 이후 실제 거리 계산에도 그대로 쓰인다).
      // 더 세밀하게 보고 싶으면 모달 안에서 마우스 휠로 추가 확대할 수 있다.
      const previewScale = Math.min(CALIB_VIEWPORT_W / img.naturalWidth, CALIB_VIEWPORT_H / img.naturalHeight, 1);
      setCalibrating({
        file,
        url,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        previewW: img.naturalWidth * previewScale,
        previewH: img.naturalHeight * previewScale,
        previewScale,
        points: [],
      });
      setCalibDistanceInput("");
      setCalibZoom(1);
      setCalibPan({ x: 0, y: 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert("이미지를 불러오는 데 실패했어요. 다른 파일로 시도해주세요.");
    };
    img.src = url;
  }

  // 축척 맞추기 모달에서 두 지점을 찍은 뒤 실제 거리(cm)를 입력하고 "적용"을 누르면 여기로 온다.
  // 화면에 보이는(줄어든) 미리보기 위에서 찍은 두 점 사이 거리를, previewScale로 나눠서 원본 사진의
  // "진짜" 픽셀 거리로 되돌린 다음, 입력받은 실제 거리(cm)와 비교해 "원본 사진 1px = 몇 cm"인지를
  // 구한다. 그 값에 원본 사진의 가로·세로 픽셀 수를 곱하면 도면 전체의 실제 가로·세로(cm)가 나오고,
  // 그걸 그대로 공간 크기(spaceWidthM/spaceDepthM)에 맞춰서 이후 배치판 위에 사진이 실제 크기로
  // 깔리게 한다.
  async function handleApplyCalibration() {
    if (!calibrating || calibrating.points.length !== 2) return;
    const distCm = Number(calibDistanceInput);
    if (!distCm || distCm <= 0) {
      alert("두 지점 사이의 실제 거리(cm)를 입력해주세요.");
      return;
    }
    const [p1, p2] = calibrating.points;
    const displayedPxDist = Math.hypot(p2.xPx - p1.xPx, p2.yPx - p1.yPx);
    if (displayedPxDist < 2) {
      alert("두 지점이 너무 가까워요. 다시 찍어주세요.");
      return;
    }
    const naturalPxDist = displayedPxDist / calibrating.previewScale;
    const cmPerNaturalPx = distCm / naturalPxDist;
    const imageRealWidthCm = calibrating.naturalW * cmPerNaturalPx;
    const imageRealHeightCm = calibrating.naturalH * cmPerNaturalPx;
    const newWidthM = Math.round((imageRealWidthCm / 100) * 100) / 100;
    const newDepthM = Math.round((imageRealHeightCm / 100) * 100) / 100;
    if (!newWidthM || !newDepthM || newWidthM <= 0 || newDepthM <= 0) {
      alert("계산된 공간 크기가 올바르지 않아요. 두 지점을 다시 찍어주세요.");
      return;
    }
    setApplyingCalibration(true);
    const safeName = (calibrating.file.name || "layout.jpg").replace(/[^a-zA-Z0-9.\-_]/g, "");
    const path = `bg-${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("layout-images").upload(path, calibrating.file, { upsert: false });
    setApplyingCalibration(false);
    if (uploadError) {
      alert("도면 이미지를 저장하는 중 오류가 발생했어요: " + uploadError.message);
      return;
    }
    // 예전에 다른 배경 도면이 있었다면 Storage에 파일이 계속 쌓이지 않도록 정리한다(실패해도 새
    // 도면 적용 자체는 그대로 진행).
    if (bgImagePath) {
      supabase.storage.from("layout-images").remove([bgImagePath]).catch(() => {});
    }
    setSpaceWidthM(newWidthM);
    setSpaceDepthM(newDepthM);
    setWidthInput(String(newWidthM));
    setDepthInput(String(newDepthM));
    setBgImageUrl(calibrating.url);
    setBgImagePath(path);
    setShowGrid(false); // 실제 사진 위에는 격자가 지저분해 보일 수 있어 일단 꺼둔다(버튼으로 언제든 다시 켤 수 있음).
    setCalibrating(null);
    setCalibDistanceInput("");
  }

  function handleCancelCalibration() {
    if (calibrating) URL.revokeObjectURL(calibrating.url);
    setCalibrating(null);
    setCalibDistanceInput("");
  }

  async function handleRemoveBgImage() {
    if (!confirm("배경 도면을 지울까요? (방 크기는 지금 그대로 남아있어요)")) return;
    if (bgImagePath) {
      supabase.storage.from("layout-images").remove([bgImagePath]).catch(() => {});
    }
    if (bgImageUrl) URL.revokeObjectURL(bgImageUrl);
    setBgImageUrl(null);
    setBgImagePath(null);
  }

  // "전체판 자체가 너무 협소해 크게 키워줘 화면에 꽉차게" 요청: 배치판을 늘 고정된 크기(760×520px)로만
  // 보여주지 않고, 지금 보고 있는 브라우저 창 크기에 맞춰 화면을 최대한 꽉 채우도록 한다. 서버에서
  // 미리 그려질 때는 창 크기를 알 수 없어서(typeof window === "undefined") 일단 적당한 기본값으로
  // 그려두고, 화면에 실제로 뜬 뒤(useEffect, 클라이언트에서만 실행됨) 진짜 창 크기로 바로 다시
  // 계산한다 — 이렇게 해야 서버가 미리 그린 화면과 처음 뜨는 화면이 같아서 화면이 깜빡이며 어긋나는
  // 일이 없다. 창 크기를 바꾸면(resize) 그때그때 다시 계산해서 항상 화면에 꽉 차게 보여준다.
  const [viewportSize, setViewportSize] = useState({ w: 1400, h: 900 });
  useEffect(() => {
    function updateViewportSize() {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    }
    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  // "전체판은 거대한 대지 같은 개념이야, 고정값이고 결코 움직이지 않아" 요청으로 배치판 크기 계산
  // 방식을 다시 짰다. 예전에는(위 주석에 남아있던 사연대로) 메인 시스템 바깥 틀의 maxWidth·왼쪽 전체
  // 메뉴·여백 같은 값을 여기서 하나하나 숫자로 추측해서 "실제로 남는 가로 폭"을 계산했는데, 이 방식은
  // 바깥 틀이 조금만 바뀌어도(모바일 폭 기준, 메뉴 폭 등) 자꾸 어긋나서 벽 밖으로 튀어나가거나 실제
  // 남는 자리보다 좁게/넓게 계산되는 등 여러 번 같은 종류의 버그가 났었다. 이제는 그 숫자들을 더는
  // 추측하지 않는다.
  //
  // (버그 수정) 맨 처음엔 이 화면 전체를 감싸는 제일 바깥 상자의 폭을 재고 거기서 모형 목록 칸(240)·
  // 간격(16)을 "빼서" 배치판 폭을 구했는데, 이렇게 하니 실제 화면에서 "떨리는"(화면이 미세하게
  // 흔들리며 배치판이 자꾸 움직이는) 버그가 났다. 원인은 그 바깥 상자가 모형 목록 칸·배치판을 감싸는
  // "가장 바깥" 요소라 다른 요소들의 폭 계산에 민감했기 때문으로 보인다. 그래서 재는 대상을 바꿨다 —
  // 모형 목록 칸(#layoutsim-print-area 바로 옆, flex:"1 1 480px"로 이미 "모형 목록 칸을 뺀 나머지"를
  // 스스로 계산하는) 오른쪽 칸(canvasColRef, #layoutsim-print-area) 자체의 실제 렌더된 폭을 직접
  // 잰다 — 이러면 240·16을 빼는 계산이 아예 필요 없어지고(브라우저의 flex 레이아웃이 이미 계산해줌),
  // 이 칸은 콘텐츠 크기와 무관하게 flex-basis(480px)로 정해지는 값이라 더 안정적이다. 그리고 혹시
  // 있을 소수점 단위의 미세한 흔들림까지 완전히 차단하기 위해, 값을 정수로 반올림하고 이전 값과 2px
  // 이상 차이 날 때만 실제로 반영한다(그 이하는 사람 눈에 어차피 안 보이는 차이라 그냥 무시).
  const canvasColRef = useRef(null);
  const [canvasColWidthPx, setCanvasColWidthPx] = useState(1040);
  useEffect(() => {
    const el = canvasColRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    function measure() {
      const next = Math.round(el.getBoundingClientRect().width);
      setCanvasColWidthPx((prev) => (Math.abs(prev - next) >= 2 ? next : prev));
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const MAX_CANVAS_W = Math.max(360, canvasColWidthPx);
  // "전체판은... 고정값이고 결코 움직이지 않아 / 세로는 4칸 정도면 되겠다" 요청대로, 평소(전체보기
  // 아닐 때)의 세로 크기는 창 높이에 따라 늘었다 줄었다 하지 않는 고정 크기로 못박았다 — 방이 아무리
  // 커도(또는 창이 아무리 커도) 이 안에서 줌인·줌아웃으로 들여다보는 식이다. "전체보기" 버튼을 눌러
  // 화면 전체로 키운 상태는 별개로, 그때는 여전히 창 높이만큼 넉넉하게 쓴다.
  const NORMAL_CANVAS_H = 600;
  const MAX_CANVAS_H = isFullView ? Math.max(420, viewportSize.h - 220) : NORMAL_CANVAS_H;
  const scale = Math.min(MAX_CANVAS_W / (spaceWidthM * 100), MAX_CANVAS_H / (spaceDepthM * 100));
  const canvasWidthPx = spaceWidthM * 100 * scale;
  const canvasHeightPx = spaceDepthM * 100 * scale;

  // "마우스 휠로 줌인/줌아웃, 시프트+끌기로 화면 이동" 요청: 위 scale(방 전체를 딱 맞춰 보여주는
  // 배율)은 그대로 "기본값"으로 두고, 그 위에 곱해지는 확대 배율(zoomLevel)을 하나 더 둔다. 방이
  // 아주 크면(예: 가로 32m) 딱 맞춰 보이는 배율로는 화면에서 1cm가 채 1px도 안 돼서 정확한 지점을
  // 클릭하기가 어려운데, 확대하면 그 자리를 훨씬 크게 볼 수 있어 줄자로 정확히 찍거나 모형을 딱
  // 맞는 자리에 놓기 쉬워진다.
  const ZOOM_MIN = 1; // 딱 맞춰 보여주는 배율보다 더 축소할 필요는 없다(방 밖에 빈 여백만 늘어남).
  const ZOOM_MAX = 12;
  const [zoomLevel, setZoomLevel] = useState(1);
  // 확대했을 때 "보이는 위치"를 옮기는 값(px). 기본은 방 가운데를 그대로 보여주고, 거기에 이 값을 더해서 옮긴다.
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [isPanningView, setIsPanningView] = useState(false); // 지금 Shift+끌기로 화면을 옮기는 중인지(커서 모양에만 씀)
  const viewportRef = useRef(null); // 실제로 눈에 보이는 창(그 밖으로 나간 부분은 잘려서 안 보임)
  const panDragRef = useRef(null);
  const suppressClickAfterPanRef = useRef(false); // 화면을 실제로 끌어서 옮긴 뒤에는, 손을 뗀 자리에서 엉뚱하게 모형이 선택/줄자점이 찍히지 않게 그 다음 클릭 한 번을 무시한다.

  // 실제로 화면에 그릴 때 쓰는 배율 = 딱 맞춤 배율(scale) × 확대 배율(zoomLevel). 배치판 위 모든
  // 모형·줄자·선택 표시·마우스 좌표 계산은 이제 이 값을 기준으로 한다.
  const renderScale = scale * zoomLevel;
  // 배치판(canvasRef, 실제 방 크기만큼 그려지는 "내용물")은 확대할수록 커지지만, 그걸 담는 바깥 창
  // (viewportRef)은 항상 같은 크기로 고정해서 옆 목록 등 다른 화면 배치가 확대 배율에 따라 흔들리지
  // 않게 한다. VIEW_BLEED는 확대하지 않은 기본 상태에서도 선택된 모형의 테두리·그림자가("오른쪽과
  // 하단은 여전히 제품을 먹고 있어" 신고로 없앤 overflow:hidden 대신 이번엔 이 여유 공간으로) 창
  // 가장자리에 잘리지 않도록 두는 안전 여백이다.
  const VIEW_BLEED = 14;
  const viewportWidthPx = canvasWidthPx + VIEW_BLEED * 2;
  const viewportHeightPx = canvasHeightPx + VIEW_BLEED * 2;
  const worldWidthPx = spaceWidthM * 100 * renderScale;
  const worldHeightPx = spaceDepthM * 100 * renderScale;

  // 주어진 확대 배율(zoom)·이동값(pan)일 때, 배치판(canvasRef)이 바깥 창(viewportRef) 안에서
  // 왼쪽/위로 얼마나 떨어진 자리에 놓이는지 계산한다. pan이 (0,0)이면 방 가운데가 창 가운데에
  // 오도록 두고, 거기에 pan을 더한다 — 마우스 휠 확대(어느 지점을 기준으로 확대할지)와 Shift+끌기
  // (화면 이동) 양쪽에서 똑같이 이 계산을 써야 화면이 어긋나지 않는다.
  function computeWorldOffset(zoom, pan) {
    const renderScaleAt = scale * zoom;
    const wPx = spaceWidthM * 100 * renderScaleAt;
    const hPx = spaceDepthM * 100 * renderScaleAt;
    const baseLeft = VIEW_BLEED - (wPx - canvasWidthPx) / 2;
    const baseTop = VIEW_BLEED - (hPx - canvasHeightPx) / 2;
    return { left: baseLeft + pan.x, top: baseTop + pan.y, baseLeft, baseTop, worldWidthPx: wPx, worldHeightPx: hPx, renderScaleAt };
  }
  const worldOffset = computeWorldOffset(zoomLevel, viewPan);

  // 화면 이동(pan)이 너무 커져서 방 전체가 창 밖으로 나가버리면("잃어버린" 것처럼 보여서 되돌리기
  // 어려움) 곤란하므로, 방의 적어도 일부(MIN_OVERLAP_PX)는 항상 창 안에 걸쳐 있도록 막아준다.
  function clampPan(pan, zoom) {
    const { worldWidthPx: wPx, worldHeightPx: hPx, baseLeft, baseTop } = computeWorldOffset(zoom, { x: 0, y: 0 });
    const MIN_OVERLAP_PX = 80;
    const lowX = Math.min(MIN_OVERLAP_PX - wPx - baseLeft, viewportWidthPx - MIN_OVERLAP_PX - baseLeft);
    const highX = Math.max(MIN_OVERLAP_PX - wPx - baseLeft, viewportWidthPx - MIN_OVERLAP_PX - baseLeft);
    const lowY = Math.min(MIN_OVERLAP_PX - hPx - baseTop, viewportHeightPx - MIN_OVERLAP_PX - baseTop);
    const highY = Math.max(MIN_OVERLAP_PX - hPx - baseTop, viewportHeightPx - MIN_OVERLAP_PX - baseTop);
    return { x: Math.min(Math.max(pan.x, lowX), highX), y: Math.min(Math.max(pan.y, lowY), highY) };
  }

  // 배율을 바꿀 때(마우스 휠이든 +/- 버튼이든) 공통으로 쓰는 함수: 기준점(anchorX, anchorY — 창
  // 안에서의 px 위치)이 배치판의 어느 cm 지점을 가리키고 있었는지 구해두고, 배율을 바꾼 뒤에도 그
  // cm 지점이 화면의 같은 자리에 그대로 있도록 pan을 다시 계산한다. 이렇게 해야 마우스가 가리키던
  // 자리를 기준으로 확대되어, 확대할수록 원하는 지점이 화면 밖으로 자꾸 밀려나지 않고 정확히 그
  // 자리를 계속 파고들어 볼 수 있다.
  function zoomTo(nextZoomRaw, anchorX, anchorY) {
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoomRaw));
    if (nextZoom === zoomLevel) return;
    // (버그 수정) "줌 아웃하면 원래 상태로 돌아와야 하는데 안 된다" 신고 — 마우스가 가리키던 지점을
    // 기준으로 계산하는 이 방식은, 확대한 채로 이리저리 옮겨본(pan) 다음 휠로 다시 딱 맞춤 배율까지
    // 줌아웃해도 그 계산식 자체가 pan을 0으로 되돌려줄 이유가 없어서, 방이 화면에 다 들어오는데도
    // 살짝 치우친 채로 멈춰 있었다(clampPan도 "방이 화면 밖으로 아예 안 나가게"만 막을 뿐, 방이 이미
    // 다 들어와 있을 땐 가운데로 되돌리지 않는다). 다 줌아웃해서 딱 맞춤 배율(ZOOM_MIN)로 돌아오면
    // "화면 맞춤" 버튼(handleResetView)과 똑같이 pan도 무조건 처음 상태(0,0, 방 가운데)로 고정한다 —
    // 그래야 어디를 기준으로 줌아웃했든 항상 같은 자리로 돌아온다.
    if (nextZoom <= ZOOM_MIN) {
      setZoomLevel(nextZoom);
      setViewPan({ x: 0, y: 0 });
      return;
    }
    const before = computeWorldOffset(zoomLevel, viewPan);
    const cmX = (anchorX - before.left) / before.renderScaleAt;
    const cmY = (anchorY - before.top) / before.renderScaleAt;
    const after = computeWorldOffset(nextZoom, { x: 0, y: 0 });
    const nextPan = { x: anchorX - cmX * after.renderScaleAt - after.baseLeft, y: anchorY - cmY * after.renderScaleAt - after.baseTop };
    setZoomLevel(nextZoom);
    setViewPan(clampPan(nextPan, nextZoom));
  }

  // 마우스 휠: deltaY(휠을 굴린 정도)에 따라 부드럽게 배율을 바꾸고, 마우스가 가리키던 지점을
  // 기준으로 확대한다(zoomTo). 이 화면에서 휠은 페이지 스크롤 용도가 아니라 배치판 전용 확대·축소로
  // 쓰므로 브라우저 기본 동작(페이지 스크롤)은 막아준다. React의 onWheel은 기본적으로
  // "passive"(preventDefault가 안 먹힘)로 등록돼서, 아래 useEffect로 이 창(viewportRef)에 직접
  // 리스너를 달아 막는다(passive: false).
  const wheelHandlerRef = useRef(() => {});
  wheelHandlerRef.current = function handleCanvasWheel(e) {
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomTo(zoomLevel * factor, e.clientX - rect.left, e.clientY - rect.top);
  };
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function listener(e) {
      wheelHandlerRef.current(e);
    }
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, []);

  // 툴바의 확대(+)/축소(-) 버튼 — 마우스 위치 대신 창 가운데를 기준으로 확대·축소한다. "화면 맞춤"은
  // 방 전체가 다시 딱 보이도록 배율·이동을 처음 상태로 되돌린다.
  function handleZoomButton(factor) {
    zoomTo(zoomLevel * factor, viewportWidthPx / 2, viewportHeightPx / 2);
  }
  function handleResetView() {
    setZoomLevel(1);
    setViewPan({ x: 0, y: 0 });
  }

  // Shift를 누른 채 배치판 창을 끌면(확대돼서 방의 일부만 보일 때) 그 보이는 위치를 옮긴다. 마퀴
  // (드래그로 여러 모형 선택)·모형 끌기·크기조절·줄자 찍기 등 기존 동작은 모두 Shift 없이 그대로 쓸
  // 수 있게, 캡처 단계(bubble 이전)에서 Shift가 눌려있을 때만 가로채서(stopPropagation) 화면 이동으로
  // 처리하고, 그렇지 않으면 그대로 흘려보내 기존 동작에 아무 영향이 없게 한다. 딱 맞춰 보이는
  // 배율(zoomLevel<=1)에서는 옮겨봐도 더 볼 게 없어 의미가 없으므로 그때는 가로채지 않는다(그러면
  // 예전처럼 Shift+끌기가 빈 캔버스 마퀴 선택으로 그대로 동작한다 — 다만 마퀴에 무언가를 "더하는"
  // 동작의 단축키는 아래에서 Ctrl(⌘)로 옮겨졌다. Shift는 이제 "화면 이동" 전용으로 통일한다).
  function handleViewportMouseDownCapture(e) {
    if (!e.shiftKey || e.button !== 0 || zoomLevel <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    panDragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPan: { x: viewPan.x, y: viewPan.y }, moved: false };
    setIsPanningView(true);
  }
  // 실제로 화면을 끌어서(moved) 옮긴 뒤에는, 마우스를 뗀 그 자리에서 클릭 이벤트가 한 번 더 발생해도
  // (예: 모형 위에서 손을 뗀 경우) 무시한다 — 화면을 옮기려던 것뿐인데 그 자리의 모형이 선택되거나
  // 줄자 점이 찍혀버리는 것을 막는다.
  function handleViewportClickCapture(e) {
    if (!suppressClickAfterPanRef.current) return;
    suppressClickAfterPanRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }
  useEffect(() => {
    function onPanMove(e) {
      const drag = panDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (Math.hypot(dx, dy) > 2) drag.moved = true;
      setViewPan(clampPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy }, zoomLevel));
    }
    function onPanUp() {
      const drag = panDragRef.current;
      if (!drag) return;
      if (drag.moved) suppressClickAfterPanRef.current = true;
      panDragRef.current = null;
      setIsPanningView(false);
    }
    window.addEventListener("mousemove", onPanMove);
    window.addEventListener("mouseup", onPanUp);
    return () => {
      window.removeEventListener("mousemove", onPanMove);
      window.removeEventListener("mouseup", onPanUp);
    };
  }, [zoomLevel]);

  // 방 크기를 바꾸거나(handleCreateSpace) 확대 배율이 바뀔 때마다, 지금 이동값(pan)이 여전히 유효한
  // 범위 안에 있는지 다시 확인해서 벗어나 있으면 안쪽으로 당겨온다(방을 작게 줄였는데 예전 이동값이
  // 그대로 남아 방이 화면 밖으로 나가버리는 것을 막는 안전망).
  useEffect(() => {
    setViewPan((prev) => clampPan(prev, zoomLevel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceWidthM, spaceDepthM, zoomLevel]);

  // 줄자 모드에서 지금 마우스가 배치판의 정확히 어느 cm 지점을 가리키고 있는지 실시간으로 보여주는
  // 상태("줄자 기능을 좀 더 고급지게" 요청) — 확대한 상태에서 점을 찍기 전에 좌표를 먼저 눈으로
  // 확인할 수 있어서 더 정확하게 찍을 수 있다.
  const [hoverCm, setHoverCm] = useState(null);
  useEffect(() => {
    if (!rulerMode) setHoverCm(null);
  }, [rulerMode]);
  function handleCanvasMouseMoveForRuler(e) {
    if (!rulerMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setHoverCm({ xCm: (e.clientX - rect.left) / renderScale, yCm: (e.clientY - rect.top) / renderScale });
  }

  // "도면 업로드 화면도 크게 만들어서 줌인/아웃 기능 넣어줘 세부적으로 거리 체킹 가능하게" 요청:
  // 축척 맞추기 모달의 도면 미리보기 자리도 배치판처럼 창 크기에 맞춰 크게 잡고(CALIB_VIEWPORT_W/H),
  // 마우스 휠로 확대해서 두 지점을 더 정확히 찍을 수 있게 한다. 확대·이동 계산 방식은 위 배치판의
  // zoomLevel/viewPan과 같은 원리이지만, 여기서는 방 벽(overflow:hidden으로 잘려도 문제없는 그냥
  // 사진)이라 VIEW_BLEED·clampPan 같은 안전장치까지는 필요 없어 좀 더 단순하게 뒀다.
  const CALIB_ZOOM_MIN = 1;
  const CALIB_ZOOM_MAX = 12;
  const CALIB_VIEWPORT_W = Math.min(1400, Math.max(480, viewportSize.w - 160));
  const CALIB_VIEWPORT_H = Math.min(760, Math.max(360, viewportSize.h - 300));
  const [calibZoom, setCalibZoom] = useState(1);
  const [calibPan, setCalibPan] = useState({ x: 0, y: 0 });
  const [isCalibPanning, setIsCalibPanning] = useState(false);
  const calibViewportRef = useRef(null);
  const calibPanDragRef = useRef(null);
  const suppressCalibClickRef = useRef(false);

  // 확대 배율(zoom)·이동값(pan)에 따라, 도면 사진이 미리보기 창(CALIB_VIEWPORT_W×H) 안에서 얼마나
  // 떨어진 자리에 놓이는지 계산한다. pan이 (0,0)이면 사진이 창 가운데 오도록 두고, 거기에 pan을 더한다.
  function computeCalibOffset(zoom, pan) {
    const w = (calibrating ? calibrating.previewW : 0) * zoom;
    const h = (calibrating ? calibrating.previewH : 0) * zoom;
    const baseLeft = (CALIB_VIEWPORT_W - w) / 2;
    const baseTop = (CALIB_VIEWPORT_H - h) / 2;
    return { left: baseLeft + pan.x, top: baseTop + pan.y, baseLeft, baseTop, w, h };
  }
  // 마우스 휠(또는 확대·축소 버튼)로 배율을 바꿀 때, 기준점(anchorX, anchorY — 미리보기 창 안에서의
  // px 위치)이 가리키던 사진 위 지점이 배율이 바뀐 뒤에도 화면의 같은 자리에 그대로 있도록 pan을
  // 다시 계산한다(마우스가 가리키던 지점을 기준으로 확대).
  function calibZoomTo(nextZoomRaw, anchorX, anchorY) {
    if (!calibrating) return;
    const nextZoom = Math.min(CALIB_ZOOM_MAX, Math.max(CALIB_ZOOM_MIN, nextZoomRaw));
    if (nextZoom === calibZoom) return;
    const before = computeCalibOffset(calibZoom, calibPan);
    const pxX = (anchorX - before.left) / calibZoom;
    const pxY = (anchorY - before.top) / calibZoom;
    const after = computeCalibOffset(nextZoom, { x: 0, y: 0 });
    setCalibZoom(nextZoom);
    setCalibPan({ x: anchorX - pxX * nextZoom - after.baseLeft, y: anchorY - pxY * nextZoom - after.baseTop });
  }
  const calibWheelHandlerRef = useRef(() => {});
  calibWheelHandlerRef.current = function handleCalibWheel(e) {
    if (!calibrating) return;
    e.preventDefault();
    const el = calibViewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0015);
    calibZoomTo(calibZoom * factor, e.clientX - rect.left, e.clientY - rect.top);
  };
  // 모달은 파일을 고를 때만 뜨고 평소엔 없어서(calibViewportRef.current가 그때만 생김), 모달이
  // 열리고 닫힐 때마다(!!calibrating이 바뀔 때마다) 리스너를 다시 달아준다.
  useEffect(() => {
    const el = calibViewportRef.current;
    if (!el) return;
    function listener(e) {
      calibWheelHandlerRef.current(e);
    }
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, [!!calibrating]);
  function handleCalibZoomButton(factor) {
    calibZoomTo(calibZoom * factor, CALIB_VIEWPORT_W / 2, CALIB_VIEWPORT_H / 2);
  }
  function handleCalibResetView() {
    setCalibZoom(1);
    setCalibPan({ x: 0, y: 0 });
  }
  // 배치판과 마찬가지로 Shift+끌기로 화면을 이동한다(확대된 상태에서만). 점 찍기(onClick)와 헷갈리지
  // 않도록 캡처 단계에서 Shift가 눌려있을 때만 가로채고, 실제로 끌어서 옮긴 뒤에는 그 다음 클릭
  // 한 번을 무시해서 엉뚱한 자리에 점이 찍히지 않게 한다(배치판의 handleViewportMouseDownCapture와 같은 원리).
  function handleCalibMouseDownCapture(e) {
    if (!e.shiftKey || e.button !== 0 || calibZoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    calibPanDragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPan: { x: calibPan.x, y: calibPan.y }, moved: false };
    setIsCalibPanning(true);
  }
  function handleCalibClickCapture(e) {
    if (!suppressCalibClickRef.current) return;
    suppressCalibClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }
  useEffect(() => {
    function onCalibPanMove(e) {
      const drag = calibPanDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (Math.hypot(dx, dy) > 2) drag.moved = true;
      setCalibPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
    }
    function onCalibPanUp() {
      const drag = calibPanDragRef.current;
      if (!drag) return;
      if (drag.moved) suppressCalibClickRef.current = true;
      calibPanDragRef.current = null;
      setIsCalibPanning(false);
    }
    window.addEventListener("mousemove", onCalibPanMove);
    window.addEventListener("mouseup", onCalibPanUp);
    return () => {
      window.removeEventListener("mousemove", onCalibPanMove);
      window.removeEventListener("mouseup", onCalibPanUp);
    };
  }, []);
  const calibOffset = calibrating ? computeCalibOffset(calibZoom, calibPan) : null;

  // 모형 목록(왼쪽)에서 새로 끌어올 때 — 드래그하는 게 "카탈로그의 어떤 모형"인지만 담아 보낸다.
  function handleDragStartCatalog(e, shape) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "catalog", shapeId: shape.id }));
  }

  // 배치판 위에 이미 놓인 모형을 다시 끌 때 — 마우스가 그 모형의 왼쪽 위 모서리에서 얼마나 떨어진
  // 지점을 잡았는지(offset)도 같이 담아서, 놓았을 때 모형이 마우스 쪽으로 툭 튀지 않고 자연스럽게 옮겨지게 한다.
  function handleDragStartPlaced(e, placed) {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetXCm = (e.clientX - rect.left) / renderScale;
    const offsetYCm = (e.clientY - rect.top) / renderScale;
    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "placed", placedId: placed.id, offsetXCm, offsetYCm }));
  }

  // 모형을 새로 놓거나 옮길 때, 근처(화면 기준 15px 이내)에 이미 놓인 모형의 변이 있으면 자석처럼
  // 그 변에 딱 붙여준다(왼쪽/오른쪽/위/아래로 붙이기, 변끼리 줄맞추기). 세로 범위가 겹칠 때만 좌우로,
  // 가로 범위가 겹칠 때만 위아래로 붙이는 게 자연스러워서 그 경우에만 후보로 고려한다.
  function snapPlacement(xCm, yCm, wCm, hCm, excludeId) {
    const thresholdCm = 15 / renderScale;
    let snappedX = xCm;
    let snappedY = yCm;
    let bestXDist = thresholdCm;
    let bestYDist = thresholdCm;
    const myTop = yCm;
    const myBottom = yCm + hCm;
    const myLeft = xCm;
    const myRight = xCm + wCm;

    function tryX(candidate) {
      const dist = Math.abs(candidate - xCm);
      if (dist < bestXDist) {
        bestXDist = dist;
        snappedX = candidate;
      }
    }
    function tryY(candidate) {
      const dist = Math.abs(candidate - yCm);
      if (dist < bestYDist) {
        bestYDist = dist;
        snappedY = candidate;
      }
    }

    for (const other of placedItems) {
      if (other.id === excludeId) continue;
      const rotation = other.rotation != null ? other.rotation : other.rotated ? 90 : 0;
      const swapped = rotation === 90 || rotation === 270;
      const ow = swapped ? other.depthCm : other.widthCm;
      const oh = swapped ? other.widthCm : other.depthCm;
      const oLeft = other.xCm;
      const oRight = other.xCm + ow;
      const oTop = other.yCm;
      const oBottom = other.yCm + oh;

      if (myTop < oBottom + thresholdCm && myBottom > oTop - thresholdCm) {
        tryX(oLeft - wCm); // 상대 왼쪽에 붙이기
        tryX(oRight); // 상대 오른쪽에 붙이기
        tryX(oLeft); // 왼쪽 변끼리 맞추기
        tryX(oRight - wCm); // 오른쪽 변끼리 맞추기
      }
      if (myLeft < oRight + thresholdCm && myRight > oLeft - thresholdCm) {
        tryY(oTop - hCm); // 상대 위쪽에 붙이기
        tryY(oBottom); // 상대 아래쪽에 붙이기
        tryY(oTop); // 위쪽 변끼리 맞추기
        tryY(oBottom - hCm); // 아래쪽 변끼리 맞추기
      }
    }

    // 배치판 벽(공간 경계)도 다른 모형과 똑같이 자석처럼 붙는다 — 벽은 캔버스 전체에 걸쳐있어서
    // 다른 모형과 달리 세로·가로 범위가 겹치는지 따질 필요 없이 항상 후보로 본다.
    const spaceWidthCm = spaceWidthM * 100;
    const spaceDepthCm = spaceDepthM * 100;
    tryX(0); // 왼쪽 벽
    tryX(spaceWidthCm - wCm); // 오른쪽 벽
    tryY(0); // 위쪽 벽
    tryY(spaceDepthCm - hCm); // 아래쪽 벽

    return { xCm: snappedX, yCm: snappedY };
  }

  // 자석 스냅으로도 다른 모형과 겹친 채로 남아있으면(예: 다른 모형 한가운데에 떨어뜨린 경우),
  // 겹친 폭·높이 중 더 적게 밀어내도 되는 방향으로 딱 붙을 때까지 밀어내서 서로 영역을 침범하지 않게 한다.
  // excludeId는 보통 모형 하나의 id(문자열/숫자)지만, 그룹(또는 여러 개를 선택해 한꺼번에 옮길 때)은
  // 그룹에 속한 모든 모형 id 배열을 넘겨서, 그룹 안 모형끼리는 서로 겹침 검사를 하지 않도록 한다.
  function resolveOverlap(xCm, yCm, wCm, hCm, excludeId) {
    const excludeSet = new Set(Array.isArray(excludeId) ? excludeId : [excludeId]);
    let x = xCm;
    let y = yCm;
    for (const other of placedItems) {
      if (excludeSet.has(other.id)) continue;
      const rotation = other.rotation != null ? other.rotation : other.rotated ? 90 : 0;
      const swapped = rotation === 90 || rotation === 270;
      const ow = swapped ? other.depthCm : other.widthCm;
      const oh = swapped ? other.widthCm : other.depthCm;
      const oLeft = other.xCm;
      const oRight = other.xCm + ow;
      const oTop = other.yCm;
      const oBottom = other.yCm + oh;
      const myLeft = x;
      const myRight = x + wCm;
      const myTop = y;
      const myBottom = y + hCm;
      const overlapX = Math.min(myRight, oRight) - Math.max(myLeft, oLeft);
      const overlapY = Math.min(myBottom, oBottom) - Math.max(myTop, oTop);
      if (overlapX > 0 && overlapY > 0) {
        if (overlapX < overlapY) {
          const myCenterX = myLeft + wCm / 2;
          const oCenterX = oLeft + ow / 2;
          x = myCenterX < oCenterX ? oLeft - wCm : oRight;
        } else {
          const myCenterY = myTop + hCm / 2;
          const oCenterY = oTop + oh / 2;
          y = myCenterY < oCenterY ? oTop - hCm : oBottom;
        }
      }
    }
    return { xCm: x, yCm: y };
  }

  // 자석 스냅 → 그래도 겹치면 밀어내기, 순서로 적용한다(최대 4번 반복해서 여러 모형에 연달아
  // 걸리는 경우도 웬만큼 처리한다). 마지막엔 배치판(공간) 밖으로 절대 넘어가지 않도록 가로·세로
  // 범위를 벽 안쪽으로 딱 고정한다(모형이 방보다 큰 극단적인 경우만 왼쪽·위쪽 벽에 맞춰둔다).
  function placeWithSnap(xCm, yCm, wCm, hCm, excludeId) {
    let { xCm: x, yCm: y } = snapPlacement(xCm, yCm, wCm, hCm, excludeId);
    for (let i = 0; i < 4; i++) {
      const resolved = resolveOverlap(x, y, wCm, hCm, excludeId);
      if (resolved.xCm === x && resolved.yCm === y) break;
      x = resolved.xCm;
      y = resolved.yCm;
    }
    const maxX = Math.max(0, spaceWidthM * 100 - wCm);
    const maxY = Math.max(0, spaceDepthM * 100 - hCm);
    return { xCm: Math.min(Math.max(0, x), maxX), yCm: Math.min(Math.max(0, y), maxY) };
  }

  // 방향키로 옮길 때 쓰는 버전 — 다른 모형과는 안 겹치게 밀어내고 배치판 밖으로는 못 나가게 막지만,
  // placeWithSnap과 달리 벽·다른 모형에 자석처럼 달라붙는 부분(snapPlacement)은 적용하지 않는다.
  // 벽에 붙어있던 모형을 5cm씩 떼어내려 해도, 그 움직인 거리가 자석 스냅 범위(15cm) 안에 들어가면
  // 다시 벽으로 끌려가 버려서 "붙은 뒤에는 움직이지 않는" 것처럼 보이던 문제를 막기 위함이다.
  function moveWithClamp(xCm, yCm, wCm, hCm, excludeId) {
    let x = xCm;
    let y = yCm;
    for (let i = 0; i < 4; i++) {
      const resolved = resolveOverlap(x, y, wCm, hCm, excludeId);
      if (resolved.xCm === x && resolved.yCm === y) break;
      x = resolved.xCm;
      y = resolved.yCm;
    }
    const maxX = Math.max(0, spaceWidthM * 100 - wCm);
    const maxY = Math.max(0, spaceDepthM * 100 - hCm);
    return { xCm: Math.min(Math.max(0, x), maxX), yCm: Math.min(Math.max(0, y), maxY) };
  }

  // 안전망: 끌기·크기조절·회전·방향키처럼 사용자가 직접 조작할 때는 각 동작마다 벽 밖으로 못 나가게
  // 막아뒀지만, 예전에(이 규칙이 생기기 전에) 저장해둔 배치안을 불러오거나(handleLoadBoard), 이미
  // 모형을 놓아둔 상태에서 방 가로·세로 크기를 더 작게 바꾸면(handleCreateSpace) 그 좌표는 아무도
  // 손대지 않았으니 여전히 벽 밖으로 나가 있는 채로 남아있을 수 있다(화면 오른쪽·아래쪽만 살짝
  // 삐져나오는 것처럼 보이는 문제). 방 크기나 배치 목록이 바뀔 때마다 벽 밖으로 나간 모형이 있는지
  // 확인해서 자동으로 안쪽으로 맞춰준다. 고칠 게 없으면 원래 배열을 그대로 돌려줘서(참조 동일)
  // 불필요한 재렌더링·무한 루프 없이 조용히 지나간다.
  useEffect(() => {
    setPlacedItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
        const swapped = rotation === 90 || rotation === 270;
        const wCm = swapped ? it.depthCm : it.widthCm;
        const hCm = swapped ? it.widthCm : it.depthCm;
        const maxX = Math.max(0, spaceWidthM * 100 - wCm);
        const maxY = Math.max(0, spaceDepthM * 100 - hCm);
        const xCm = Math.min(Math.max(0, it.xCm), maxX);
        const yCm = Math.min(Math.max(0, it.yCm), maxY);
        if (xCm !== it.xCm || yCm !== it.yCm) {
          changed = true;
          return { ...it, xCm, yCm };
        }
        return it;
      });
      return changed ? next : prev;
    });
  }, [spaceWidthM, spaceDepthM, placedItems]);

  // 이 모형을 끌 때 "같이 움직여야 하는" 모형 id들을 구한다. 여러 개를 선택해둔 상태에서 그 중 하나를
  // 끌면 선택된 전체가 같이 움직이고(피피티·피그마 등에서 흔한 동작), 그게 아니면 그룹으로 묶어둔
  // 모형이라면 그 그룹 전체가, 둘 다 아니면 자기 자신만 움직인다.
  function getMoveGroupIds(it) {
    if (selectedPlacedIds.size > 1 && selectedPlacedIds.has(it.id)) return [...selectedPlacedIds];
    if (it.groupId) return placedItems.filter((p) => p.groupId === it.groupId).map((p) => p.id);
    return [it.id];
  }

  // 그룹(또는 여러 개 선택)을 한 덩어리로 옮길 때, 그 중 하나라도 벽에 닿으면 전체가 그 자리에서 같이
  // 멈추도록(따로따로 벽에서 멈추면 대열이 흐트러져 보이므로) dx/dy를 모두에게 공통으로 적용해도 되는
  // 값으로 줄여준다.
  function clampGroupDelta(memberIds, dx, dy) {
    let cdx = dx;
    let cdy = dy;
    for (const id of memberIds) {
      const m = placedItems.find((p) => p.id === id);
      if (!m) continue;
      const rotation = m.rotation != null ? m.rotation : m.rotated ? 90 : 0;
      const swapped = rotation === 90 || rotation === 270;
      const wCm = swapped ? m.depthCm : m.widthCm;
      const hCm = swapped ? m.widthCm : m.depthCm;
      const maxX = Math.max(0, spaceWidthM * 100 - wCm);
      const maxY = Math.max(0, spaceDepthM * 100 - hCm);
      if (m.xCm + cdx < 0) cdx = -m.xCm;
      if (m.xCm + cdx > maxX) cdx = maxX - m.xCm;
      if (m.yCm + cdy < 0) cdy = -m.yCm;
      if (m.yCm + cdy > maxY) cdy = maxY - m.yCm;
    }
    return { dx: cdx, dy: cdy };
  }

  function handleCanvasDrop(e) {
    e.preventDefault();
    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const cmX = (e.clientX - rect.left) / renderScale;
    const cmY = (e.clientY - rect.top) / renderScale;

    if (payload.type === "catalog") {
      const shape = shapes.find((s) => s.id === payload.shapeId);
      if (!shape) return;
      const widthCm = Number(shape.width_cm);
      const depthCm = Number(shape.depth_cm);
      // (신규) 모형이 지금 방보다 가로나 세로가 더 크면 어느 벽에 놓든 왼쪽·위쪽 구석에 고정된 채
      // 나머지가 방 밖으로 넘어가 보일 수밖에 없다("치수를 mm로 잘못 등록해서 실제보다 10배 큰"
      // 경우가 대표적 — "가로(cm)"라고 적힌 칸에 실측 도면의 mm 숫자를 그대로 입력하면 이렇게 된다).
      // 겉보기엔 "벽에 붙였는데도 자꾸 튀어나간다"는 버그처럼 보이지만 실제로는 모형 크기 자체가
      // 잘못 등록된 것이라, 놓기 전에 바로 알려줘서 헷갈리지 않게 한다.
      if (widthCm > spaceWidthM * 100 || depthCm > spaceDepthM * 100) {
        alert(
          `"${shape.name}"의 등록된 크기(가로 ${widthCm}cm × 세로 ${depthCm}cm)가 지금 방(가로 ${spaceWidthM * 100}cm × 세로 ${spaceDepthM * 100}cm)보다 큽니다.\n\n이대로 놓으면 어느 벽에 붙여도 한쪽 구석에 고정된 채 나머지 부분이 방 밖으로 튀어나와 보여요. 모형 등록 시 실측 도면의 mm 값을 cm 칸에 그대로 입력한 건 아닌지(예: 1400mm → 140cm) 확인해보시거나, 방 크기를 늘려주세요.`
        );
        return;
      }
      const rawX = Math.max(0, cmX - widthCm / 2);
      const rawY = Math.max(0, cmY - depthCm / 2);
      const placed = placeWithSnap(rawX, rawY, widthCm, depthCm, null);
      setPlacedItems((prev) => [
        ...prev,
        {
          id: nextPlacedId(),
          shapeId: shape.id,
          name: shape.name,
          shapeType: shape.shape_type || "rect",
          widthCm,
          depthCm,
          notchWidthCm: shape.notch_width_cm != null ? Number(shape.notch_width_cm) : null,
          notchDepthCm: shape.notch_depth_cm != null ? Number(shape.notch_depth_cm) : null,
          xCm: placed.xCm,
          yCm: placed.yCm,
          rotation: 0,
          flipped: false,
          groupId: null,
        },
      ]);
    } else if (payload.type === "placed") {
      const moving = placedItems.find((it) => it.id === payload.placedId);
      if (!moving) return;
      const rotation = moving.rotation != null ? moving.rotation : moving.rotated ? 90 : 0;
      const swapped = rotation === 90 || rotation === 270;
      const wCm = swapped ? moving.depthCm : moving.widthCm;
      const hCm = swapped ? moving.widthCm : moving.depthCm;
      const rawX = Math.max(0, cmX - (payload.offsetXCm || 0));
      const rawY = Math.max(0, cmY - (payload.offsetYCm || 0));
      const moveGroupIds = getMoveGroupIds(moving);
      if (moveGroupIds.length > 1) {
        // 여러 개(선택 전체 또는 그룹)를 한꺼번에 옮길 때는 자석처럼 붙거나(snap) 서로 밀어내는 동작은
        // 하지 않는다(그러면 모형들 사이의 간격·대열이 흐트러지므로) — 대표로 잡은 모형이 옮겨진 만큼
        // 나머지도 똑같이 옮기고, 벽에 닿으면 전체가 같은 자리에서 함께 멈춘다.
        const dx = rawX - moving.xCm;
        const dy = rawY - moving.yCm;
        const { dx: cdx, dy: cdy } = clampGroupDelta(moveGroupIds, dx, dy);
        setPlacedItems((prev) => prev.map((it) => (moveGroupIds.includes(it.id) ? { ...it, xCm: it.xCm + cdx, yCm: it.yCm + cdy } : it)));
      } else {
        const placed = placeWithSnap(rawX, rawY, wCm, hCm, moving.id);
        setPlacedItems((prev) => prev.map((it) => (it.id === payload.placedId ? { ...it, xCm: placed.xCm, yCm: placed.yCm } : it)));
      }
    }
  }

  function handleRemovePlaced(id) {
    setPlacedItems((prev) => prev.filter((it) => it.id !== id));
    setSelectedPlacedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // 여러 개를 골라둔 채로 한꺼번에 지우기(선택 도구모음의 "삭제" 버튼).
  function handleRemoveSelected() {
    if (selectedPlacedIds.size === 0) return;
    setPlacedItems((prev) => prev.filter((it) => !selectedPlacedIds.has(it.id)));
    setSelectedPlacedIds(new Set());
  }

  // 두 개 이상 선택한 상태에서 "그룹화"를 누르면 같은 groupId를 부여해서, 이후로는 그 중 하나만 눌러도
  // 전체가 같이 선택되고, 하나를 끌면 전체가 같이 움직인다.
  function handleGroupSelected() {
    if (selectedPlacedIds.size < 2) return;
    const gid = `g${Date.now()}`;
    setPlacedItems((prev) => prev.map((it) => (selectedPlacedIds.has(it.id) ? { ...it, groupId: gid } : it)));
  }

  // 선택한 모형(들)이 속한 그룹을 통째로 풀어준다(그 그룹의 다른 모형이 지금 선택 안 되어 있어도 같이 풀린다).
  function handleUngroupSelected() {
    const groupIdsToClear = new Set();
    for (const it of placedItems) {
      if (selectedPlacedIds.has(it.id) && it.groupId) groupIdsToClear.add(it.groupId);
    }
    if (groupIdsToClear.size === 0) return;
    setPlacedItems((prev) => prev.map((it) => (it.groupId && groupIdsToClear.has(it.groupId) ? { ...it, groupId: null } : it)));
  }

  // 사각형은 0/90도만 돌려도 충분하지만, ㄱ자·U자는 방 구석·방향에 맞춰 4방향 모두 필요해서
  // 누를 때마다 0→90→180→270→0으로 한 바퀴 돈다. 예전에 저장된 배치(rotated: true/false만 있던
  // 옛 데이터)도 그대로 이어받을 수 있도록 rotation이 없으면 rotated 값으로 대신 계산한다.
  // 가로·세로가 다른 모형(예: W1400×D1200)은 90도로 돌리면 화면에 보이는 가로·세로가 서로 바뀌는데,
  // 위치(xCm/yCm)는 그대로 두면 커진 쪽 끝이 배치판 벽 밖으로 삐져나갈 수 있어서(하단·우측 침범),
  // 회전 직후 새로 보이는 가로·세로 기준으로 위치를 벽 안쪽으로 다시 맞춰준다.
  function handleRotatePlaced(id) {
    setPlacedItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const current = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
        const nextRotation = (current + 90) % 360;
        const swapped = nextRotation === 90 || nextRotation === 270;
        const wCm = swapped ? it.depthCm : it.widthCm;
        const hCm = swapped ? it.widthCm : it.depthCm;
        const maxX = Math.max(0, spaceWidthM * 100 - wCm);
        const maxY = Math.max(0, spaceDepthM * 100 - hCm);
        return {
          ...it,
          rotation: nextRotation,
          xCm: Math.min(Math.max(0, it.xCm), maxX),
          yCm: Math.min(Math.max(0, it.yCm), maxY),
        };
      })
    );
  }

  // ㄱ자·U자는 회전만으로는 거울에 비친 반대쪽 모양(예: 퍼즐책상 좌향/우향)을 만들 수 없어서
  // (돌리기만 하면 파인 모서리 위치는 바뀌어도 "꺾인 방향" 자체는 안 바뀜) 좌우 반전을 따로 둔다.
  // 사각형은 반전해도 모양이 똑같아서 버튼을 아예 안 보여준다.
  function handleFlipPlaced(id) {
    setPlacedItems((prev) => prev.map((it) => (it.id === id ? { ...it, flipped: !it.flipped } : it)));
  }

  // 크기 조절: 놓인 모형 오른쪽 아래 손잡이를 끌면 가로·세로(widthCm/depthCm)를 직접 바꿀 수 있다.
  // 90도·270도로 돌려놓은 상태에서는 화면에 보이는 가로/세로가 실제 값과 서로 바뀌어 있어서,
  // 화면에서 보이는 방향 그대로 끌리도록 늘어난 만큼을 반대로 적용해준다(startResizePlaced의 swapped).
  const resizeDragRef = useRef(null);
  useEffect(() => {
    function onResizeMove(e) {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const dxCm = (e.clientX - drag.startX) / renderScale;
      const dyCm = (e.clientY - drag.startY) / renderScale;
      let newWidthCm = Math.max(10, drag.swapped ? drag.startWidthCm + dyCm : drag.startWidthCm + dxCm);
      let newDepthCm = Math.max(10, drag.swapped ? drag.startDepthCm + dxCm : drag.startDepthCm + dyCm);
      // 손잡이가 오른쪽 아래에 있어 왼쪽·위쪽 위치(xCm/yCm)는 그대로인 채 커지므로, 화면에 보이는
      // 가로·세로(swapped 반영)가 배치판 오른쪽·아래쪽 벽을 넘지 않도록 커지는 만큼만 제한한다.
      // (하단·우측을 침범하지 않게: 크기 조절로 방 밖까지 늘어나던 문제를 막는다.)
      // (버그 수정) 여기 있던 Math.max(10, ...)는 "최소 10cm는 늘어날 수 있게"라는 의도였는데, 하필
      // 벽까지 남은 실제 공간이 10cm보다 더 좁은 자리(예: 벽에서 3cm만 남은 자리)에서는 그 "최소 10cm"가
      // 오히려 실제로 남은 공간(3cm)보다 더 크게 잡혀버려서, 크기 조절로 모형이 방보다 더 커지며 벽을
      // 넘어가 버렸다. 여기서는 "늘어날 수 있는 최소 보장 크기"가 아니라 "벽까지 실제로 남은 공간"을
      // 구하는 것이므로, 남은 공간이 아무리 좁아도(심지어 0에 가까워도) 그 실제 값을 그대로 써야 한다.
      const maxOnScreenW = Math.max(0, spaceWidthM * 100 - drag.xCm);
      const maxOnScreenH = Math.max(0, spaceDepthM * 100 - drag.yCm);
      if (drag.swapped) {
        newDepthCm = Math.min(newDepthCm, maxOnScreenW);
        newWidthCm = Math.min(newWidthCm, maxOnScreenH);
      } else {
        newWidthCm = Math.min(newWidthCm, maxOnScreenW);
        newDepthCm = Math.min(newDepthCm, maxOnScreenH);
      }
      setPlacedItems((prev) => prev.map((it) => (it.id === drag.id ? { ...it, widthCm: newWidthCm, depthCm: newDepthCm } : it)));
    }
    function onResizeUp() {
      resizeDragRef.current = null;
    }
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeUp);
    return () => {
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeUp);
    };
  }, [renderScale, spaceWidthM, spaceDepthM]);

  function startResizePlaced(it, swapped) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizeDragRef.current = { id: it.id, startX: e.clientX, startY: e.clientY, startWidthCm: it.widthCm, startDepthCm: it.depthCm, xCm: it.xCm, yCm: it.yCm, swapped };
    };
  }

  // "모든 품목 가로/세로 사이즈 넣을 수 있는 칸을 만들어줘(적용버튼)" 요청으로 추가된 기능. 손잡이를
  // 마우스로 끌어서 크기를 조절하는 것 말고도, 정확한 숫자를 직접 입력해서 한 번에 맞출 수 있게
  // 한다. 딱 하나만 선택했을 때만 의미가 있으므로(여러 개를 한꺼번에 선택했을 때는 "가로·세로"가
  // 하나로 정해지지 않는다) selectedSingleItem이 있을 때만 입력칸이 보인다.
  const selectedSingleItem = selectedPlacedIds.size === 1 ? placedItems.find((it) => selectedPlacedIds.has(it.id)) || null : null;
  const [manualWidthInput, setManualWidthInput] = useState("");
  const [manualDepthInput, setManualDepthInput] = useState("");
  // 선택이 "다른 모형으로" 바뀔 때만 입력칸을 그 모형의 현재 크기로 다시 채운다(id 기준) — 입력하는
  // 도중에 같은 모형의 다른 값(예: 드래그로 살짝 움직인 좌표) 때문에 타이핑 중인 값이 지워지지 않게.
  const selectedSingleItemId = selectedSingleItem?.id ?? null;
  useEffect(() => {
    if (selectedSingleItem) {
      setManualWidthInput(String(selectedSingleItem.widthCm));
      setManualDepthInput(String(selectedSingleItem.depthCm));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSingleItemId]);

  function handleApplyManualSize() {
    if (!selectedSingleItem) return;
    const it = selectedSingleItem;
    const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
    const swapped = rotation === 90 || rotation === 270;
    let newWidthCm = Math.max(10, Number(manualWidthInput) || it.widthCm);
    let newDepthCm = Math.max(10, Number(manualDepthInput) || it.depthCm);
    // 화면에 보이는(회전 반영) 가로·세로가 배치판 오른쪽·아래쪽 벽을 넘지 않도록 제한한다(손잡이로
    // 끌어서 크기를 조절할 때와 똑같은 규칙 — 남은 공간이 좁으면 그 실제 값까지만 허용).
    const maxOnScreenW = Math.max(0, spaceWidthM * 100 - it.xCm);
    const maxOnScreenH = Math.max(0, spaceDepthM * 100 - it.yCm);
    if (swapped) {
      newDepthCm = Math.min(newDepthCm, maxOnScreenW);
      newWidthCm = Math.min(newWidthCm, maxOnScreenH);
    } else {
      newWidthCm = Math.min(newWidthCm, maxOnScreenW);
      newDepthCm = Math.min(newDepthCm, maxOnScreenH);
    }
    setPlacedItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, widthCm: newWidthCm, depthCm: newDepthCm } : p)));
    setManualWidthInput(String(newWidthCm));
    setManualDepthInput(String(newDepthCm));
  }

  // 키보드 화살표로 선택한 모형(들)을 옮긴다. 기본 5cm씩, Shift를 누르면 20cm씩 움직이고, 하나만
  // 골랐고 그룹도 아니면 마우스로 끌 때와 똑같이 다른 모형과 안 겹치게·배치판 밖으로 못 나가게
  // 제한(moveWithClamp)을 그대로 적용해서 마우스 없이도 세밀하게 위치를 맞출 수 있게 한다. 단,
  // 벽·다른 모형에 자석처럼 달라붙는 동작(placeWithSnap의 snapPlacement)은 일부러 적용하지 않는다 —
  // 벽에 붙은 모형을 방향키로 떼어내려 해도 움직인 거리가 자석 범위 안이면 도로 끌려가서 "붙은 뒤에는
  // 움직이지 않는" 것처럼 보이기 때문이다. 여러 개를 골랐거나 그룹으로 묶어둔 모형이면 대열이
  // 흐트러지지 않게 전체를 한 덩어리로 같이 옮긴다. 이름 입력칸 등 다른 곳에 포커스가 가 있을 때는
  // 그 칸의 원래 동작(커서 이동, 복사·붙여넣기)을 방해하지 않도록 건드리지 않는다. Escape를 누르면
  // 선택만 해제한다. Ctrl+C(맥은 Cmd+C)/Ctrl+V(맥은 Cmd+V)로 선택한 모형(들)을 복사·붙여넣기할 수 있다.
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
        if (selectedPlacedIds.size === 0) return;
        e.preventDefault();
        // 여러 개를 같이 복사해두면, 붙여넣을 때 서로의 간격을 그대로 유지할 수 있도록 원래 좌표를
        // 그대로 담아둔다(붙여넣을 때 한꺼번에 같은 만큼만 이동시킨다).
        clipboardRef.current = placedItems.filter((it) => selectedPlacedIds.has(it.id)).map((it) => ({ ...it }));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
        if (clipboardRef.current.length === 0) return;
        e.preventDefault();
        const offsetCm = 20; // 원래 자리에 딱 겹치면 뭐가 새로 생겼는지 안 보이니 살짝 오른쪽 아래로 떨어뜨려 놓는다.
        const newGroupId = clipboardRef.current.length > 1 ? `g${Date.now()}` : null;
        const newIds = [];
        const newItems = clipboardRef.current.map((src) => {
          const rotation = src.rotation != null ? src.rotation : src.rotated ? 90 : 0;
          const swapped = rotation === 90 || rotation === 270;
          const wCm = swapped ? src.depthCm : src.widthCm;
          const hCm = swapped ? src.widthCm : src.depthCm;
          const maxX = Math.max(0, spaceWidthM * 100 - wCm);
          const maxY = Math.max(0, spaceDepthM * 100 - hCm);
          const id = nextPlacedId();
          newIds.push(id);
          return {
            ...src,
            id,
            groupId: newGroupId,
            xCm: Math.min(Math.max(0, src.xCm + offsetCm), maxX),
            yCm: Math.min(Math.max(0, src.yCm + offsetCm), maxY),
          };
        });
        setPlacedItems((prev) => [...prev, ...newItems]);
        setSelectedPlacedIds(new Set(newIds));
        return;
      }

      if (selectedPlacedIds.size === 0) return;
      if (e.key === "Escape") {
        setSelectedPlacedIds(new Set());
        return;
      }
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? 20 : 5;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;

      if (selectedPlacedIds.size === 1) {
        const it = placedItems.find((p) => selectedPlacedIds.has(p.id));
        if (!it) return;
        if (!it.groupId) {
          const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
          const swapped = rotation === 90 || rotation === 270;
          const wCm = swapped ? it.depthCm : it.widthCm;
          const hCm = swapped ? it.widthCm : it.depthCm;
          const placed = moveWithClamp(it.xCm + dx, it.yCm + dy, wCm, hCm, it.id);
          setPlacedItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, xCm: placed.xCm, yCm: placed.yCm } : p)));
          return;
        }
      }
      const anyItem = placedItems.find((p) => selectedPlacedIds.has(p.id));
      if (!anyItem) return;
      const memberIds = getMoveGroupIds(anyItem);
      const { dx: cdx, dy: cdy } = clampGroupDelta(memberIds, dx, dy);
      setPlacedItems((prev) => prev.map((p) => (memberIds.includes(p.id) ? { ...p, xCm: p.xCm + cdx, yCm: p.yCm + cdy } : p)));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPlacedIds, placedItems, spaceWidthM, spaceDepthM]);

  function handleClearBoard() {
    if (placedItems.length > 0 && !confirm("현재 배치를 전부 지우고 새로 시작할까요? (저장하지 않은 배치는 사라져요)")) return;
    setPlacedItems([]);
    setCurrentBoardId(null);
    setBoardName("");
    setRulerPoints([]);
    setSelectedPlacedIds(new Set());
    if (bgImageUrl) URL.revokeObjectURL(bgImageUrl);
    setBgImageUrl(null);
    setBgImagePath(null);
    setShowGrid(true);
    setZoomLevel(1);
    setViewPan({ x: 0, y: 0 });
  }

  // 줄자로 찍을 수 있는 "끝점" 후보: 놓인 모형들의 네 모서리(회전된 상태면 화면에 보이는 대로).
  // 줄자 모드일 때 이 점들을 화면에 옅게 보여줘서 어디를 누르면 딱 붙는지 미리 알 수 있게 한다.
  const rulerSnapPoints = useMemo(() => {
    if (!rulerMode) return [];
    const pts = [];
    for (const it of placedItems) {
      const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
      const swapped = rotation === 90 || rotation === 270;
      const wCm = swapped ? it.depthCm : it.widthCm;
      const hCm = swapped ? it.widthCm : it.depthCm;
      pts.push({ xCm: it.xCm, yCm: it.yCm });
      pts.push({ xCm: it.xCm + wCm, yCm: it.yCm });
      pts.push({ xCm: it.xCm, yCm: it.yCm + hCm });
      pts.push({ xCm: it.xCm + wCm, yCm: it.yCm + hCm });
    }
    return pts;
  }, [rulerMode, placedItems]);

  // 클릭 지점 근처(화면 기준 12px 안)에 모형 끝점이 있으면 그 점에 딱 맞춰 찍는다("끝점 인식") —
  // 손으로 정확히 모서리를 맞추기 어려운 걸 보완해준다. 근처에 없으면 클릭한 자리 그대로 찍는다.
  function nearestSnapPoint(xCm, yCm) {
    const thresholdCm = 12 / renderScale;
    let best = null;
    let bestDist = thresholdCm;
    for (const p of rulerSnapPoints) {
      const dist = Math.hypot(p.xCm - xCm, p.yCm - yCm);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return best;
  }

  // 줄자 점을 하나 추가한다. "줄자는 처음 찍었던 점에서 동서남북(가로·세로) 직선으로만 움직이게"
  // 요청대로, 첫 번째 점은 그대로 찍히지만 두 번째 점은 첫 점 기준으로 대각선이 되지 않게 보정한다 —
  // 첫 점에서 가로로 더 많이 움직였으면 세로 좌표를 첫 점과 똑같이 맞추고(완전히 가로선), 세로로 더
  // 많이 움직였으면 가로 좌표를 첫 점과 똑같이 맞춘다(완전히 세로선). 이렇게 하면 두 점을 잇는 선이
  // 항상 반듯한 가로선 또는 세로선이 되어, 방 가로·세로 길이나 벽 사이 거리를 잴 때 손이 살짝
  // 삐뚤어져도 비스듬한 값이 나오지 않는다. 세 번째 클릭부터는(이미 두 점이 있으면) 이전 측정을
  // 지우고 그 자리를 새 첫 점으로 삼아 다시 잰다(기존 동작 그대로).
  function addRulerPoint(xCm, yCm) {
    setRulerPoints((prev) => {
      if (prev.length === 1) {
        const first = prev[0];
        const dx = Math.abs(xCm - first.xCm);
        const dy = Math.abs(yCm - first.yCm);
        const second = dx >= dy ? { xCm, yCm: first.yCm } : { xCm: first.xCm, yCm };
        return [first, second];
      }
      return prev.length >= 2 ? [{ xCm, yCm }] : [...prev, { xCm, yCm }];
    });
  }

  // 회전된 상태(swapped)까지 반영해서, 화면에 실제로 보이는 모형의 사각 범위(cm)를 구한다 — 마퀴
  // 선택에서 "이 범위 안에 걸리는 모형"을 판단할 때 쓴다.
  function itemOnScreenBox(it) {
    const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
    const swapped = rotation === 90 || rotation === 270;
    const wCm = swapped ? it.depthCm : it.widthCm;
    const hCm = swapped ? it.widthCm : it.depthCm;
    return { left: it.xCm, top: it.yCm, right: it.xCm + wCm, bottom: it.yCm + hCm };
  }

  // 캔버스의 빈 자리(모형이 없는 곳)를 마우스로 누르는 동작 하나로 세 가지 경우를 모두 처리한다:
  //  1) 거의 안 움직이고 손을 뗐으면("그냥 클릭") — 줄자 모드면 그 자리에 점을 찍고(예전 handleCanvasClick과
  //     같은 동작), 아니면 선택만 해제한다.
  //  2) 어느 정도 끌고 손을 뗐으면(마퀴/드래그 선택) — 그 사각 범위에 걸리는 모형을 한꺼번에 선택한다.
  //     Ctrl(맥은 ⌘)을 누른 채로 하면 지금 선택돼 있던 것에 더한다("이전엔 Shift+끌기였는데, 이제
  //     Shift+끌기는 화면 확대 상태에서 보이는 위치를 옮기는 데 쓰여서 Ctrl로 옮겼다).
  // 모형이나 그 위의 버튼을 눌렀을 때는 그 모형의 onClick이 stopPropagation을 하므로 여기 로직과는
  // 상관없이 그쪽 클릭 처리(선택/그룹 선택)가 그대로 동작한다 — 여기서는 실제로 캔버스 배경 자체를
  // 누른 경우(e.target === canvasRef.current)만 걸러서 처리한다. Shift를 누른 채 누른 경우는(확대
  // 상태에서) 위 handleViewportMouseDownCapture가 화면 이동으로 먼저 가로채서 여기까지 오지 않는다.
  function handleCanvasMouseDown(e) {
    if (e.target !== canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    marqueeDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXCm: (e.clientX - rect.left) / renderScale,
      startYCm: (e.clientY - rect.top) / renderScale,
      moved: false,
      addToSelection: e.ctrlKey || e.metaKey,
    };
  }

  useEffect(() => {
    function onMarqueeMove(e) {
      const drag = marqueeDragRef.current;
      if (!drag || !canvasRef.current) return;
      // 줄자 모드에서는 마퀴(드래그 선택) 자체를 아예 하지 않는다 — "줄자 사용이 불편하다, 클릭하면
      // 전체선택과 맞물린다"는 신고의 원인이, 점을 정확히 찍으려고 클릭하는 순간 손이 살짝 떨려서
      // 몇 px만 움직여도 그게 "드래그"로 인식되어 마퀴 선택(여러 모형이 한꺼번에 선택됨)으로 바뀌어
      // 버리는 것이었다. 줄자 모드일 때는 아무리 움직여도 moved를 true로 만들지 않고 마퀴 사각형도
      // 그리지 않아서, 손을 떼는 순간 항상(예전처럼) "그냥 클릭"으로만 처리되어 그 자리에 점이 찍힌다.
      if (rulerMode) return;
      const distPx = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      if (distPx > 3) drag.moved = true;
      if (!drag.moved) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const curXCm = (e.clientX - rect.left) / renderScale;
      const curYCm = (e.clientY - rect.top) / renderScale;
      const next = {
        xCm: Math.min(drag.startXCm, curXCm),
        yCm: Math.min(drag.startYCm, curYCm),
        wCm: Math.abs(curXCm - drag.startXCm),
        hCm: Math.abs(curYCm - drag.startYCm),
      };
      marqueeRectRef.current = next;
      setMarqueeRect(next);
    }
    function onMarqueeUp() {
      const drag = marqueeDragRef.current;
      if (!drag) return;
      marqueeDragRef.current = null;
      const finalRect = marqueeRectRef.current;
      marqueeRectRef.current = null;
      setMarqueeRect(null);

      if (!drag.moved || !finalRect) {
        // "그냥 클릭"으로 본다: 줄자 모드면 그 자리에 점을 찍고, 아니면(Ctrl을 누르지 않은 한) 선택을 해제한다.
        if (rulerMode) {
          const snapped = nearestSnapPoint(drag.startXCm, drag.startYCm);
          const xCm = snapped ? snapped.xCm : drag.startXCm;
          const yCm = snapped ? snapped.yCm : drag.startYCm;
          addRulerPoint(xCm, yCm);
        } else if (!drag.addToSelection) {
          setSelectedPlacedIds(new Set());
        }
        return;
      }

      const hitIds = new Set();
      for (const it of placedItems) {
        const box = itemOnScreenBox(it);
        const overlaps = box.left < finalRect.xCm + finalRect.wCm && box.right > finalRect.xCm && box.top < finalRect.yCm + finalRect.hCm && box.bottom > finalRect.yCm;
        if (!overlaps) continue;
        if (it.groupId) {
          placedItems.forEach((p) => {
            if (p.groupId === it.groupId) hitIds.add(p.id);
          });
        } else {
          hitIds.add(it.id);
        }
      }
      setSelectedPlacedIds((prev) => (drag.addToSelection ? new Set([...prev, ...hitIds]) : hitIds));
    }
    window.addEventListener("mousemove", onMarqueeMove);
    window.addEventListener("mouseup", onMarqueeUp);
    return () => {
      window.removeEventListener("mousemove", onMarqueeMove);
      window.removeEventListener("mouseup", onMarqueeUp);
    };
  }, [renderScale, rulerMode, placedItems]);

  // 줄자: 캔버스를 누를 때마다(정확히는, 거의 안 끈 채로 손을 뗄 때마다) 점을 하나씩 찍고, 두 점이
  // 모이면 그 사이 실제 거리를 계산해 보여준다. 세 번째부터는 이전 측정을 지우고 새로 잰다(위
  // handleCanvasMouseDown/onMarqueeUp에서 처리).
  function handleClearRuler() {
    setRulerPoints([]);
  }

  const rulerDistanceCm =
    rulerPoints.length === 2 ? Math.hypot(rulerPoints[1].xCm - rulerPoints[0].xCm, rulerPoints[1].yCm - rulerPoints[0].yCm) : null;

  async function handleSaveBoard() {
    const name = (boardName || "").trim();
    if (!name) {
      alert("배치 이름을 입력해주세요.");
      return;
    }
    setSavingBoard(true);
    const payload = {
      name,
      width_m: spaceWidthM,
      depth_m: spaceDepthM,
      items: placedItems,
      manager: managerName || null,
      updated_at: new Date().toISOString(),
      // 배경 도면(있으면 Storage 경로)과 격자 표시 여부도 같이 저장해서, 나중에 이 배치안을 다시
      // 불러오면 도면·격자 설정까지 그대로 복원된다.
      bg_image_path: bgImagePath,
      show_grid: showGrid,
    };
    let error;
    if (currentBoardId) {
      ({ error } = await supabase.from("layout_boards").update(payload).eq("id", currentBoardId));
    } else {
      const { data, error: insertError } = await supabase.from("layout_boards").insert(payload).select().single();
      error = insertError;
      if (!error && data) setCurrentBoardId(data.id);
    }
    setSavingBoard(false);
    if (error) {
      alert("저장 중 오류가 발생했어요: " + error.message);
      return;
    }
    fetchBoards();
  }

  async function handleLoadBoard(id) {
    if (!id) return;
    setLoadingBoardId(id);
    const { data, error } = await supabase.from("layout_boards").select("*").eq("id", id).single();
    setLoadingBoardId(null);
    if (error || !data) {
      alert("불러오는 중 오류가 발생했어요: " + (error?.message || "알 수 없는 오류"));
      return;
    }
    setSpaceWidthM(Number(data.width_m));
    setSpaceDepthM(Number(data.depth_m));
    setWidthInput(String(data.width_m));
    setDepthInput(String(data.depth_m));
    setPlacedItems(Array.isArray(data.items) ? data.items : []);
    setCurrentBoardId(data.id);
    setBoardName(data.name);
    // 이 배치안이 배경 도면을 저장해뒀으면(bg_image_path) Storage에서 다시 받아와 보여준다. 예전에
    // 화면에 떠 있던 도면(blob: URL)이 있었다면 먼저 정리한다.
    if (bgImageUrl) URL.revokeObjectURL(bgImageUrl);
    if (data.bg_image_path) {
      const { data: fileData, error: dlError } = await supabase.storage.from("layout-images").download(data.bg_image_path);
      if (!dlError && fileData) {
        setBgImageUrl(URL.createObjectURL(fileData));
        setBgImagePath(data.bg_image_path);
      } else {
        setBgImageUrl(null);
        setBgImagePath(null);
      }
    } else {
      setBgImageUrl(null);
      setBgImagePath(null);
    }
    // 컬럼이 아직 없던 예전 배치안(show_grid가 없음, undefined)은 격자를 보여주던 그대로 true로 둔다.
    setShowGrid(data.show_grid !== false);
    // 불러온 배치안은 항상 방 전체가 딱 보이는 배율로 시작한다(확대·이동 상태는 저장하지 않음).
    setZoomLevel(1);
    setViewPan({ x: 0, y: 0 });
  }

  async function handleDeleteBoard(id) {
    if (!confirm("이 배치안을 삭제할까요? 되돌릴 수 없어요.")) return;
    const { error } = await supabase.from("layout_boards").delete().eq("id", id);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    if (currentBoardId === id) {
      setCurrentBoardId(null);
      setBoardName("");
    }
    fetchBoards();
  }

  return (
    <div
      className="layoutsim-full-view-wrap"
      style={
        isFullView
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 500,
              background: C.bg,
              padding: "14px 20px",
              overflow: "auto",
            }
          : undefined
      }
    >
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body * { visibility: hidden; }
          #layoutsim-print-area, #layoutsim-print-area * { visibility: visible; }
          #layoutsim-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 12px; }
          .layoutsim-no-print { display: none !important; }
          .layoutsim-print-only { display: block !important; }
        }
        /* 배치판 위 모형을 마우스로 가리키면 살짝 떠 보이도록(elevation) 그림자를 키워서, 지금 어떤
           모형 위에 있는지 더 또렷하게 느껴지게 한다. 이미 선택된 모형은 선택 강조(보라색 테두리+글로우)가
           우선이라 이 hover 그림자를 덮어 그대로 유지한다. */
        .layoutsim-placed-item:hover {
          box-shadow: 0 3px 8px rgba(28, 43, 58, 0.22) !important;
        }
        .layoutsim-placed-item.layoutsim-placed-item--selected:hover {
          box-shadow: 0 0 0 5px rgba(107, 92, 165, 0.16), 0 3px 8px rgba(28, 43, 58, 0.26) !important;
        }
      `}</style>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>가구배치(시뮬레이션)</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        현장 공간 크기를 입력하고, 왼쪽 모형 목록에서 원하는 걸 끌어다 놓아보세요. 처음 쓰는 모형은 가로·세로 크기(cm)를
        한 번 등록해두면 다음부터 목록에 계속 남아있어요. 배치가 마음에 들면 이름을 붙여 저장해두고 나중에 다시 불러올 수 있어요.
      </div>

      <div className="layoutsim-no-print" style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
        <Field label="공간 가로(m)">
          <input
            type="number"
            step="0.1"
            min="0.1"
            style={{ ...inputStyle, width: 100 }}
            value={widthInput}
            onChange={(e) => setWidthInput(e.target.value)}
          />
        </Field>
        <Field label="공간 세로(m)">
          <input
            type="number"
            step="0.1"
            min="0.1"
            style={{ ...inputStyle, width: 100 }}
            value={depthInput}
            onChange={(e) => setDepthInput(e.target.value)}
          />
        </Field>
        <button onClick={handleCreateSpace} style={primaryBtnStyle2}>배치판 만들기</button>
        <div style={{ flex: 1, minWidth: 8 }} />
        <Field label="배치 이름">
          <input
            style={{ ...inputStyle, width: 160 }}
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            placeholder="예: 쌍령공원 2단지"
          />
        </Field>
        <button onClick={handleSaveBoard} disabled={savingBoard} style={miniBtnStylePrimary}>
          {savingBoard ? "저장 중…" : currentBoardId ? "배치 저장(덮어쓰기)" : "배치 저장"}
        </button>
        <button onClick={handleClearBoard} style={ghostBtnStyle}>새로 만들기</button>
        <button onClick={() => window.print()} style={ghostBtnStyle} title="배치판만 인쇄하거나 PDF로 저장해요(인쇄 대화상자에서 '대상'을 PDF로 저장으로 바꾸면 됩니다)">
          PDF로 출력
        </button>
      </div>

      {boards.length > 0 && (
        <div className="layoutsim-no-print" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.muted }}>저장된 배치안:</div>
          {boards.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => handleLoadBoard(b.id)}
                disabled={loadingBoardId === b.id}
                style={{ ...miniBtnStyle, borderColor: currentBoardId === b.id ? C.ink : undefined }}
              >
                {loadingBoardId === b.id ? "불러오는 중…" : b.name}
              </button>
              <button
                onClick={() => handleDeleteBoard(b.id)}
                title="이 배치안 삭제"
                style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 13 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 모형 목록(왼쪽)과 배치판(오른쪽)을 나란히 두 칸으로 배치한다. "배치판이 오른쪽에 있어야
          배치가 되는데 아래로 내려가 있다"는 신고를 보고 확인해보니, 오른쪽 칸(#layoutsim-print-area)
          에 너비를 전혀 지정해두지 않아서 생긴 문제였다 — 그 안의 안내문구(공간 5m × 4m... 로 시작하는
          긴 문장)가 줄바꿈 없이 한 줄로 다 펼쳐졌을 때의 폭을 기준으로 이 칸의 "선호 폭"이 계산되다보니
          몇 천 px에 달하는 값이 나왔고, flexWrap:"wrap" 때문에 그 폭을 감당 못 해 왼쪽 모형 목록 칸과
          같은 줄에 못 들어가고 그 아래 줄로 통째로 밀려났던 것이다(화면이 아무리 넓어도 항상 아래로
          내려가 보였던 이유). 오른쪽 칸에 flex:"1 1 480px"(남는 공간을 차지하되 필요하면 480px까지는
          줄어들 수 있음)와 minWidth:0(안내문구의 긴 텍스트 때문에 폭이 무한정 커지지 않게 막음)을 줘서
          평소엔 모형 목록 옆 오른쪽에 나란히 붙게 하고, 화면이 아주 좁을 때만(모바일 등) 그 아래로
          자연스럽게 줄바꿈되게 했다. */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="layoutsim-no-print" style={{ width: 240, flexShrink: 0, border: `1px solid ${C.line}`, background: C.panel, padding: 14 }}>
          <div style={{ fontFamily: serif, fontSize: 14, marginBottom: 10 }}>모형 목록</div>
          {loadingShapes ? (
            <div style={{ fontSize: 12.5, color: C.muted }}>불러오는 중…</div>
          ) : shapes.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>아직 등록된 모형이 없어요. 아래에서 추가해보세요.</div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              {/* 카테고리별로 접어보기 / 이름으로 검색하기, 두 가지 방식으로 모형을 찾을 수 있다. */}
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {[
                  { key: "category", label: "카테고리" },
                  { key: "search", label: "검색" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setShapeViewMode(opt.key)}
                    style={{
                      ...miniBtnStyle,
                      flex: 1,
                      background: shapeViewMode === opt.key ? C.ink : "transparent",
                      color: shapeViewMode === opt.key ? "#fff" : C.inkSoft,
                      borderColor: shapeViewMode === opt.key ? C.ink : C.lineSoft,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {shapeViewMode === "search" ? (
                <div>
                  <input
                    style={{ ...smallInputStyle, width: "100%", marginBottom: 8, boxSizing: "border-box" }}
                    placeholder="모형 이름으로 검색 (예: 책상, 원형)"
                    value={shapeSearchQuery}
                    onChange={(e) => setShapeSearchQuery(e.target.value)}
                  />
                  {shapeSearchQuery.trim() === "" ? (
                    <div style={{ fontSize: 12, color: C.muted }}>찾으시는 모형 이름을 입력해보세요.</div>
                  ) : shapeSearchResults.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.muted }}>"{shapeSearchQuery}"와(과) 일치하는 모형이 없어요.</div>
                  ) : (
                    shapeSearchResults.map((s) => renderShapeRow(s))
                  )}
                </div>
              ) : (
                <div>
                  {categoryNames.map((cat) => {
                    const items = shapesByCategory[cat];
                    const isOpen = !!expandedCategories[cat];
                    return (
                      <div key={cat} style={{ marginBottom: 6 }}>
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          style={{
                            width: "100%",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 10px",
                            border: `1px solid ${C.lineSoft}`,
                            background: isOpen ? C.ink : C.bg,
                            color: isOpen ? "#fff" : C.ink,
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 12.5,
                            fontFamily: serif,
                          }}
                        >
                          <span>{cat}</span>
                          <span style={{ fontSize: 11, opacity: 0.8 }}>
                            {items.length}개 {isOpen ? "▲" : "▼"}
                          </span>
                        </button>
                        {isOpen && <div style={{ marginTop: 6, paddingLeft: 4 }}>{items.map((s) => renderShapeRow(s))}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>+ 새 모형 추가</div>
            <input
              style={{ ...smallInputStyle, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
              placeholder="모형 이름 (예: 탑책상, ㄱ자 퍼즐책상)"
              value={newShapeName}
              onChange={(e) => setNewShapeName(e.target.value)}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              {/* "ㄱ자·U자·한쪽둥근"은 새로 추가하는 화면에서는 더 이상 고를 수 없게 뺐다(요청: "새 모형
                  추가에서 ㄱ자 U자 한쪽둥근 없애주고"). 예전에 이미 이 모양으로 등록해둔 모형·배치판은
                  그대로 남아있고 화면에도 그대로 나오므로(isPoly/isRoundEnd 렌더 로직은 그대로 둠),
                  기존 데이터에는 영향이 없다 — 앞으로 "새로" 만들 때만 이 세 가지를 선택할 수 없다.
                  "(캐드형)"이라는 표기도 사무의자·회의의자 둘 다 없앴다(요청: "(캐드형)이라는 글자 없애주고"). */}
              {[
                { key: "rect", label: "사각형" },
                { key: "circle", label: "원형" },
                { key: "chair", label: "사무의자" },
                { key: "meetingchair", label: "회의의자" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setNewShapeType(opt.key)}
                  style={{
                    ...miniBtnStyle,
                    flex: 1,
                    padding: "5px 4px",
                    background: newShapeType === opt.key ? C.ink : "transparent",
                    color: newShapeType === opt.key ? "#fff" : C.inkSoft,
                    borderColor: newShapeType === opt.key ? C.ink : C.lineSoft,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input
                type="number"
                style={{ ...smallInputStyle, width: "50%", boxSizing: "border-box" }}
                placeholder="전체 가로(cm)"
                value={newShapeWidth}
                onChange={(e) => setNewShapeWidth(e.target.value)}
              />
              <input
                type="number"
                style={{ ...smallInputStyle, width: "50%", boxSizing: "border-box" }}
                placeholder="전체 세로(cm)"
                value={newShapeDepth}
                onChange={(e) => setNewShapeDepth(e.target.value)}
              />
            </div>
            {(newShapeType === "l" || newShapeType === "u") && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  {newShapeType === "l" ? "잘려나간 모서리 크기(cm)" : "안쪽 파인 부분 크기(cm)"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    style={{ ...smallInputStyle, width: "50%", boxSizing: "border-box" }}
                    placeholder="가로(cm)"
                    value={newShapeNotchWidth}
                    onChange={(e) => setNewShapeNotchWidth(e.target.value)}
                  />
                  <input
                    type="number"
                    style={{ ...smallInputStyle, width: "50%", boxSizing: "border-box" }}
                    placeholder="세로(cm)"
                    value={newShapeNotchDepth}
                    onChange={(e) => setNewShapeNotchDepth(e.target.value)}
                  />
                </div>
              </div>
            )}
            {/* 카테고리는 기존 목록에서 골라도 되고(자동완성), 새 이름을 직접 입력해도 된다. 비워두면 "기타"로 등록. */}
            <input
              style={{ ...smallInputStyle, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
              placeholder="카테고리 (예: 책상류, 테이블류 — 비워두면 기타)"
              value={newShapeCategory}
              onChange={(e) => setNewShapeCategory(e.target.value)}
              list="layoutsim-category-list"
            />
            <datalist id="layoutsim-category-list">
              {categoryNames.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
            <button onClick={handleAddShape} disabled={savingShape} style={{ ...miniBtnStyle, width: "100%" }}>
              {savingShape ? "저장 중…" : "+ 모형 추가"}
            </button>
          </div>
        </div>

        <div ref={canvasColRef} id="layoutsim-print-area" style={{ flex: "1 1 480px", minWidth: 0 }}>
          {/* 인쇄/PDF로 저장할 때는 화면의 안내문구 대신 이 제목만 보이게 한다(평소엔 숨겨둠). */}
          <div className="layoutsim-print-only" style={{ display: "none", fontFamily: serif, fontSize: 16, marginBottom: 8 }}>
            {boardName || "가구배치(시뮬레이션)"} — 공간 {spaceWidthM}m × {spaceDepthM}m ({todayISO()} 기준)
          </div>
          {/* 줄자를 켜면 버튼 글자가 "줄자"→"줄자 (켜짐)"로 길어지고 "줄자 지우기" 버튼까지 새로 생기는데,
              예전에는 이 안내문구 칸과 버튼 칸이 폭을 두고 빠듯하게 나눠 쓰고 있어서, 버튼 쪽이 길어지는
              순간 이 줄 전체가 두 줄로 접히며(flexWrap) 그 아래 배치판(캔버스)이 한 줄만큼 아래로 밀려나
              보였다. 안내문구 칸에 flex:1 + minWidth:0을 줘서, 버튼이 길어질 땐 안내문구 쪽이 먼저 줄어들며
              (필요하면 문구 자체가 내부에서 줄바꿈) 흡수하게 하고, 버튼 칸은 flexShrink:0으로 항상 제 크기를
              유지하게 해서 이 줄 자체가 두 줄로 접히는 일이 없도록 한다. */}
          <div className="layoutsim-no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: C.muted, flex: "1 1 auto", minWidth: 0 }}>
              공간 {spaceWidthM}m × {spaceDepthM}m — 모형을 끌어다 놓거나, 이미 놓은 모형을 끌어서 옮겨보세요. 모형을 클릭하면 선택되고(테두리 강조), 빈 곳을 끌면 여러 개를 한꺼번에 선택할 수 있어요(Ctrl+끌면 기존 선택에 더하기). 방향키로 세밀하게 옮기고(Shift+방향키는 더 크게), Ctrl+C/Ctrl+V로 복사·붙여넣기도 할 수 있어요. 마우스 휠로 확대·축소할 수 있고, 확대한 상태에서는 Shift를 누른 채 끌면 화면을 이동할 수 있어요.
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              <button
                onClick={() => setRulerMode((v) => !v)}
                title="캔버스를 두 번 눌러 두 지점 사이 거리를 재보세요"
                style={{
                  ...miniBtnStyle,
                  background: rulerMode ? C.ink : "transparent",
                  color: rulerMode ? "#fff" : C.inkSoft,
                  borderColor: rulerMode ? C.ink : C.lineSoft,
                  whiteSpace: "nowrap",
                }}
              >
                📏 줄자{rulerMode ? " (켜짐)" : ""}
              </button>
              {rulerPoints.length > 0 && (
                <button onClick={handleClearRuler} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>줄자 지우기</button>
              )}
              {/* "줄자 기능을 좀 더 고급지게" 요청: 줄자 모드에서 점을 찍기 전에, 지금 마우스가 배치판의
                  정확히 어느 cm 위치를 가리키고 있는지 실시간으로 보여준다. 확대해서 정확한 자리를
                  찾는 걸 도와준다. */}
              {rulerMode && hoverCm && (
                <span style={{ fontSize: 11, color: C.inkSoft, whiteSpace: "nowrap" }}>
                  → {hoverCm.xCm.toFixed(1)}cm, {hoverCm.yCm.toFixed(1)}cm
                </span>
              )}
              {/* "이미지 임포트" 요청: 실제 도면(사진·스캔) 파일을 올려서 배경으로 깔아두고, 그 위에
                  정확한 축척으로 모형을 배치할 수 있다. 파일을 고르면 바로 올라가지 않고 먼저 축척
                  맞추기 모달(아래)이 뜬다. */}
              <label
                title="실제 도면(사진·스캔) 파일을 올려서 배경으로 깔아두고 축척을 맞춰보세요"
                style={{ ...miniBtnStyle, whiteSpace: "nowrap", cursor: "pointer", display: "inline-block" }}
              >
                🖼 도면 업로드
                <input type="file" accept="image/*" onChange={handleBgImageFileSelected} style={{ display: "none" }} />
              </label>
              {bgImageUrl && (
                <button onClick={handleRemoveBgImage} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>도면 지우기</button>
              )}
              {/* "바둑판 없애기 넣기" 요청: 배치판의 눈금(격자) 배경을 껐다 켰다 할 수 있다. */}
              <button
                onClick={() => setShowGrid((v) => !v)}
                title="배치판의 눈금(격자) 배경을 껐다 켰다 해요"
                style={{
                  ...miniBtnStyle,
                  background: showGrid ? C.ink : "transparent",
                  color: showGrid ? "#fff" : C.inkSoft,
                  borderColor: showGrid ? C.ink : C.lineSoft,
                  whiteSpace: "nowrap",
                }}
              >
                # 격자{showGrid ? " (켜짐)" : " (꺼짐)"}
              </button>
              {/* "마우스 휠로 줌인/줌아웃" 요청: 휠 말고도 버튼으로 확대·축소할 수 있게 하고, 지금
                  배율(%)을 숫자로도 보여준다. 방을 딱 맞춰 보는 상태(100%)가 아닐 때만 "화면 맞춤"
                  버튼이 나타나 언제든 원래 화면으로 되돌릴 수 있다. */}
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button
                  onClick={() => handleZoomButton(1 / 1.25)}
                  disabled={zoomLevel <= ZOOM_MIN}
                  title="화면 축소"
                  style={{ ...miniBtnStyle, padding: "4px 9px", opacity: zoomLevel <= ZOOM_MIN ? 0.4 : 1 }}
                >
                  −
                </button>
                <span style={{ fontSize: 11, color: C.inkSoft, minWidth: 36, textAlign: "center" }}>
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => handleZoomButton(1.25)}
                  disabled={zoomLevel >= ZOOM_MAX}
                  title="화면 확대"
                  style={{ ...miniBtnStyle, padding: "4px 9px", opacity: zoomLevel >= ZOOM_MAX ? 0.4 : 1 }}
                >
                  ＋
                </button>
                {(zoomLevel !== 1 || viewPan.x !== 0 || viewPan.y !== 0) && (
                  <button onClick={handleResetView} title="방 전체가 다시 딱 보이도록 되돌려요" style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>
                    화면 맞춤
                  </button>
                )}
                {/* "전체보기 버튼 만들어서 시야확보를 좋게해주고" 요청: 눌러서 켜면 위쪽 전체 메뉴·페이지
                    여백까지 걷어낸 전체 화면 오버레이로 배치판을 띄워, 배치판 자체를 더 크게 볼 수 있게
                    한다(위 MAX_CANVAS_W/H가 isFullView를 반영해 그만큼 더 크게 계산됨). Esc로도 닫힌다. */}
                <button
                  onClick={() => setIsFullView((v) => !v)}
                  title={isFullView ? "전체보기를 끄고 원래 화면으로 돌아가요(Esc)" : "배치판을 화면 전체로 크게 봐요"}
                  className="layoutsim-no-print"
                  style={{
                    ...miniBtnStyle,
                    whiteSpace: "nowrap",
                    background: isFullView ? C.ink : "transparent",
                    color: isFullView ? "#fff" : C.inkSoft,
                    borderColor: isFullView ? C.ink : C.lineSoft,
                  }}
                >
                  {isFullView ? "⤡ 전체보기 닫기" : "⤢ 전체보기"}
                </button>
              </div>
            </div>
          </div>
          {/* (예전엔 선택 도구모음을 배치판 "위"에 별도 줄로 두고, 선택 여부에 따라 minHeight+
              visibility로 자리만 차지한 채 숨겼었다. 그런데 그렇게 하면 선택된 게 하나도 없을 때도
              그 줄의 자리(높이)가 항상 예약돼 있어서, 배치판이 그 예약된 높이만큼 아래로 내려와
              보이는 문제가 있었다("배치표 내려와 있다"는 신고). 배치판을 정말로 "위에 고정"시키려면
              그 줄 자체가 배치판 앞에서 layout 공간을 차지하지 않아야 하므로, 도구모음을 배치판보다
              먼저 그리는 대신 배치판(canvasRef, 이미 position:relative) 안쪽에 절대좌표(position:
              absolute)로 떠 있는 오버레이로 옮겼다 — 이러면 선택된 게 없을 때는 배치판 바로 위에
              빈 공간이 전혀 없이 붙고, 선택했을 때만 배치판 왼쪽 위에 살짝 떠서 나타날 뿐 배치판
              자체의 위치·크기는 절대 흔들리지 않는다. */}
          {/* "마우스 휠로 줌인/줌아웃, 시프트+끌기로 화면 이동" 요청: 배치판(canvasRef)을 감싸는 바깥
              창(viewportRef)을 하나 더 두었다. 이 창은 항상 같은 크기(딱 맞춤 배율 기준 + 여유
              VIEW_BLEED)로 고정돼 있어서 확대해도 옆 화면 배치가 흔들리지 않고, 확대돼서 방보다
              커진 배치판은 이 창 밖으로 나간 부분만 잘려서(overflow:hidden) 안 보인다 — 확대하지
              않은 기본 상태에서는 배치판이 이 창보다 항상 작아서(VIEW_BLEED만큼 여유가 있어서)
              선택 테두리·그림자가 잘리는 일은 없다(overflow:hidden을 없앤 원래 취지 그대로). 마우스
              휠(wheel)과 Shift+끌기(pan)는 이 창에서 받아서 처리한다. */}
          <div
            ref={viewportRef}
            onMouseDownCapture={handleViewportMouseDownCapture}
            onClickCapture={handleViewportClickCapture}
            style={{
              position: "relative",
              width: viewportWidthPx,
              height: viewportHeightPx,
              overflow: "hidden",
              cursor: isPanningView ? "grabbing" : "default",
              touchAction: "none",
            }}
          >
          <div
            ref={canvasRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleCanvasDrop}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMoveForRuler}
            style={{
              position: "absolute",
              left: worldOffset.left,
              top: worldOffset.top,
              width: worldWidthPx,
              height: worldHeightPx,
              border: `2px solid ${C.ink}`,
              // (디자인 다듬기로 한때 배치판 테두리를 둥글렸었는데, 모형을 벽에 딱 붙여 놓으면 각진
              // 모형 모서리가 이 둥근 테두리 곡선에 걸려 살짝 잘려 보이는 "디자인을 침범하는" 문제가
              // 생겼다. 그래서 테두리는 다시 각지게 되돌렸다 — 벽에 붙는 모형은 늘 각진 모양이라, 테두리도
              // 각져야 서로 부딪히지 않는다.)
              // (여기 overflow를 둘러싸고 정반대 방향의 신고가 두 번 있었다. ① 예전엔 overflow:hidden이
              // 걸려있었는데, 벽에 딱 붙인 모형을 선택하면 생기는 보라색 테두리·그림자가 모형 박스보다
              // 몇 px 더 바깥으로 번져 그려지다 보니 배치판 오른쪽·아래쪽 가장자리에서 그 그림자가
              // 뭉텅 잘려나가 보였다("제품을 먹고 있어" 신고) — 그래서 overflow:hidden을 뺐다. ② 그런데
              // 그렇게 하니 이번엔 그 번져나간 테두리·그림자(그리고 회전·삭제 버튼까지)가 배치판
              // 검은 벽 선을 그대로 넘어 방 바깥 여백에 고스란히 보여서 "도면이 튀어 나간다"는 정반대
              // 신고로 이어졌다(실제로 재현 테스트로도 확인됨). 둘 다 결국 같은 원인(선택 표시가 모형
              // 박스보다 몇 px 더 크게 그려짐)인데, 그걸 배치판 안에서 자르면 "먹힌 것"처럼 보이고
              // 안 자르면 "튀어나온 것"처럼 보이는 딜레마였다 — 생각해보면 방의 벽이라는 게 원래
              // "그 안의 것만 보이고 벽 밖으로는 아무것도 안 보이는" 경계이니, 다시 overflow:hidden을
              // 두는 쪽이 실제 방의 느낌과도 맞다. 벽에 딱 붙인 모형은 그 벽 쪽 테두리·그림자가 살짝
              // 안 보일 수 있지만(방 안쪽 다른 3면은 그대로 다 보인다), 그게 "방 밖으로 아무것도
              // 넘지 않는다"는 원칙에는 훨씬 맞는 모습이다. 확대(줌인)·화면 이동 때 방 전체가 잘리는
              // 것은 이거와 무관한, 바깥 창(viewportRef)의 overflow:hidden + VIEW_BLEED 여백이 계속
              // 따로 맡는다.
              overflow: "hidden",
              backgroundColor: C.panel,
              // 격자(showGrid)와 배경 도면(bgImageUrl)은 각각 있을 수도 없을 수도 있어서, 배경
              // 레이어 목록을 그때그때 다르게 구성한다(CSS는 여러 배경을 쉼표로 겹쳐 그릴 수 있고,
              // 먼저 적은 게 위로 온다 — 그래서 격자를 도면 사진보다 앞에 적어 항상 사진 위에 격자가
              // 겹쳐 보이게 한다). 도면 사진은 배치판 전체 크기(worldWidthPx×worldHeightPx, 확대
              // 배율에 따라 커짐)에 꽉 차게 늘려서(backgroundSize: 100% 100%) 그리는데, 이게 바로
              // 축척 맞추기에서 방 크기(spaceWidthM/spaceDepthM)를 도면의 실제 크기와 똑같이 맞춰두는
              // 이유다 — 그래야 사진과 배치판의 눈금(cm)이 확대해도 항상 정확히 겹친다(격자 한 칸도
              // renderScale 기준이라 확대할수록 커진다).
              ...(() => {
                const gridLayers = showGrid
                  ? [
                      `repeating-linear-gradient(0deg, ${C.lineSoft} 0, ${C.lineSoft} 1px, transparent 1px, transparent ${renderScale * 100}px)`,
                      `repeating-linear-gradient(90deg, ${C.lineSoft} 0, ${C.lineSoft} 1px, transparent 1px, transparent ${renderScale * 100}px)`,
                    ]
                  : [];
                const imageLayers = bgImageUrl ? [`url(${bgImageUrl})`] : [];
                const layers = [...gridLayers, ...imageLayers];
                if (layers.length === 0) return { backgroundImage: "none" };
                return {
                  backgroundImage: layers.join(", "),
                  backgroundSize: [...gridLayers.map(() => "auto"), ...imageLayers.map(() => "100% 100%")].join(", "),
                  backgroundRepeat: [...gridLayers.map(() => "repeat"), ...imageLayers.map(() => "no-repeat")].join(", "),
                };
              })(),
              cursor: rulerMode ? "crosshair" : "default",
              boxShadow: "inset 0 1px 4px rgba(28,43,58,0.06)",
            }}
          >
            {/* 선택 도구모음 — 여러 개를 묶어서 그룹으로 만들거나 풀고, 한꺼번에 지우거나 선택을 해제할
                수 있다. 배치판(canvasRef) 안쪽에 position:absolute로 떠 있는 오버레이라서, 선택된 게
                있을 때만 조건부로 그려도(마운트/언마운트) 배치판 자체의 크기·위치에는 전혀 영향을
                주지 않는다(배치판이 항상 같은 자리에 "고정"돼 있음). */}
            {selectedPlacedIds.size > 0 && (
              <div
                className="layoutsim-no-print"
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  zIndex: 40,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  background: C.purpleBg,
                  border: `1px solid ${C.purple}`,
                  borderRadius: 8,
                  flexWrap: "wrap",
                  boxShadow: "0 2px 6px rgba(28,43,58,0.18)",
                }}
              >
                <span style={{ fontSize: 12, color: C.purple, fontWeight: 600 }}>
                  {selectedPlacedIds.size}개 선택됨
                </span>
                {/* 하나만 선택했을 때만 가로·세로를 숫자로 직접 입력해서 정확히 맞출 수 있다(여러 개를
                    한꺼번에 선택했을 때는 "가로·세로"가 하나로 정해지지 않으므로 안 보여준다). */}
                {selectedSingleItem && (
                  <>
                    <input
                      type="number"
                      value={manualWidthInput}
                      onChange={(e) => setManualWidthInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleApplyManualSize();
                      }}
                      placeholder="가로(cm)"
                      title="가로(cm)"
                      style={{ ...smallInputStyle, width: 68, boxSizing: "border-box" }}
                    />
                    <span style={{ fontSize: 12, color: C.muted }}>×</span>
                    <input
                      type="number"
                      value={manualDepthInput}
                      onChange={(e) => setManualDepthInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleApplyManualSize();
                      }}
                      placeholder="세로(cm)"
                      title="세로(cm)"
                      style={{ ...smallInputStyle, width: 68, boxSizing: "border-box" }}
                    />
                    <button onClick={handleApplyManualSize} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>적용</button>
                  </>
                )}
                {selectedPlacedIds.size >= 2 && (
                  <button onClick={handleGroupSelected} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>🔗 그룹화</button>
                )}
                {placedItems.some((it) => selectedPlacedIds.has(it.id) && it.groupId) && (
                  <button onClick={handleUngroupSelected} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>⛓️‍💥 그룹 해제</button>
                )}
                <button onClick={handleRemoveSelected} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>🗑 삭제</button>
                <button onClick={() => setSelectedPlacedIds(new Set())} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>선택 해제</button>
              </div>
            )}
            {placedItems.map((it) => {
              // 예전에 저장된 배치(rotated: true/false만 있던 옛 데이터)도 그대로 이어받는다.
              const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
              const swapped = rotation === 90 || rotation === 270;
              const outerWPx = (swapped ? it.depthCm : it.widthCm) * renderScale;
              const outerHPx = (swapped ? it.widthCm : it.depthCm) * renderScale;
              const baseWPx = it.widthCm * renderScale;
              const baseHPx = it.depthCm * renderScale;
              const isPoly = it.shapeType === "l" || it.shapeType === "u";
              const isCircle = it.shapeType === "circle";
              const isRoundEnd = it.shapeType === "roundend";
              const isChair = it.shapeType === "chair";
              const isMeetingChair = it.shapeType === "meetingchair";
              const polyPoints = isPoly
                ? shapePolygonPoints(it.shapeType, it.widthCm, it.depthCm, it.notchWidthCm, it.notchDepthCm)
                    .map((p) => p.join(","))
                    .join(" ")
                : null;
              const isSelected = selectedPlacedIds.has(it.id);
              const isGrouped = !!it.groupId;
              // (버그 수정) "잘라낸 부분이 바탕화면 색상과 매끄럽게 연결이 안됨 / 잘라낸 듯한 이미지로
              // 보이지 않게" 신고 — ㄱ자·U자처럼 실제 모양이 네모난 바깥 박스(outerWPx×outerHPx)보다
              // 작게 파인 모형은, 선택했을 때의 보라색 테두리·글로우가 이 바깥 박스 전체(파인 부분까지)를
              // 그대로 감싸고 있었다. 그러다 보니 파인 자리는 아무 칠도 안 된 채(배치판 바탕이 그대로
              // 비쳐 보임) 그 위로만 네모반듯한 보라색 테두리가 지나가서, 마치 이미지를 네모나게 잘라
              // 붙였다가 그 잘린 자리만 배경과 안 맞아 뜬 것처럼 보였다. 원, 반원 테이블(roundend),
              // 의자류도 정도만 다를 뿐 같은 문제(둥근 모양 바깥의 네 귀퉁이가 안 칠해짐)를 안고 있다.
              // 그래서 이런 모양들은 바깥 네모 박스에는 더 이상 테두리·글로우를 주지 않고, 실제 모양을
              // 그리는 SVG 쪽에(파인 부분·둥근 모서리를 그대로 따라가도록) 선택 표시를 옮겼다.
              const isNonRectShape = isPoly || isCircle || isRoundEnd || isChair || isMeetingChair;
              const shapeStrokeWidth = isSelected ? 3 : isGrouped ? 2 : 1;
              const shapeStrokeDasharray = isGrouped && !isSelected ? "4 3" : undefined;
              const shapeSvgStyle = { display: "block", ...(isSelected ? { filter: "drop-shadow(0 0 4px rgba(107,92,165,0.6))" } : {}) };
              return (
                <div
                  key={it.id}
                  className={`layoutsim-placed-item${isSelected ? " layoutsim-placed-item--selected" : ""}`}
                  // 줄자 모드에서는 끌기(draggable)를 꺼둔다 — 브라우저 기본 드래그가 살짝이라도
                  // 시작되면 그 순간 클릭(onClick)이 아예 안 먹히는 경우가 있어서, 정확히 점을 찍으려는
                  // 클릭이 모형을 옮기는 동작으로 오인되지 않게 막는다.
                  draggable={!rulerMode}
                  onDragStart={(e) => handleDragStartPlaced(e, it)}
                  onClick={(e) => {
                    e.stopPropagation();
                    // 줄자 모드일 때는 모형을 클릭해도 선택하지 않고, 그 자리(가장 가까운 모형 끝점에
                    // 딱 맞춰서)에 줄자 점을 찍는다. 실제로 거리를 재고 싶은 지점은 대부분 모형의
                    // 모서리라서, 모형 위를 클릭하면 늘 "선택"으로 처리되던 것이 "줄자 사용이 불편하다"
                    // 신고의 또 다른 원인이었다 — 모형이 아니라 빈 캔버스를 정확히 클릭해야만 줄자가
                    // 먹혔기 때문이다. 이제는 줄자 모드에서는 모형 위든 빈 곳이든 어디를 클릭해도
                    // 똑같이 점이 찍힌다.
                    if (rulerMode) {
                      const rect = canvasRef.current.getBoundingClientRect();
                      // (버그 수정) 여기가 줌인 기능을 넣을 때 renderScale로 안 바뀌고 예전 scale로
                      // 남아있었다 — 확대한 상태에서 모형 위를 클릭해 줄자를 찍으면 실제 클릭한 자리와
                      // 다른 엉뚱한 cm 좌표로 찍히던 문제라, 빈 캔버스를 클릭할 때(아래 handleCanvasMouseDown
                      // 쪽)와 똑같이 renderScale 기준으로 맞춘다.
                      const xCm = (e.clientX - rect.left) / renderScale;
                      const yCm = (e.clientY - rect.top) / renderScale;
                      const snapped = nearestSnapPoint(xCm, yCm);
                      const px = snapped ? snapped.xCm : xCm;
                      const py = snapped ? snapped.yCm : yCm;
                      addRulerPoint(px, py);
                      return;
                    }
                    // 그룹으로 묶인 모형이면 하나만 눌러도 그룹 전체가 같이 선택된다. Shift를 누른 채
                    // 클릭하면 지금 선택 상태에 더하거나(없던 것) 빼는(있던 것) "토글"로 동작한다.
                    const groupIds = it.groupId ? placedItems.filter((p) => p.groupId === it.groupId).map((p) => p.id) : [it.id];
                    setSelectedPlacedIds((prev) => {
                      if (e.shiftKey) {
                        const next = new Set(prev);
                        const allIn = groupIds.every((id) => next.has(id));
                        groupIds.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
                        return next;
                      }
                      return new Set(groupIds);
                    });
                  }}
                  title={
                    rulerMode
                      ? "줄자 모드 — 클릭하면 이 모형의 가장 가까운 모서리에 점이 찍혀요"
                      : `${it.name} (${it.widthCm}×${it.depthCm}cm)${isGrouped ? " · 그룹" : ""} — 눌러서 선택(Shift+클릭으로 여러 개, 빈 곳을 끌면 마퀴 선택) 후 방향키로 이동(Shift+방향키는 크게), 끌어서 옮기거나 모서리를 끌어 크기 조절, 버튼으로 회전·삭제, Ctrl+C/Ctrl+V로 복사`
                  }
                  style={{
                    position: "absolute",
                    left: it.xCm * renderScale,
                    top: it.yCm * renderScale,
                    width: outerWPx,
                    height: outerHPx,
                    cursor: rulerMode ? "crosshair" : "grab",
                    userSelect: "none",
                    borderRadius: 3,
                    transition: "box-shadow 120ms ease, outline-color 120ms ease",
                    outline: isNonRectShape ? "none" : isSelected ? `2px solid ${C.purple}` : isGrouped ? `1.5px dashed ${C.purple}` : "none",
                    outlineOffset: isSelected ? 1 : 2,
                    boxShadow: isNonRectShape
                      ? "0 1px 3px rgba(28,43,58,0.12)"
                      : isSelected
                      ? "0 0 0 5px rgba(107, 92, 165, 0.16), 0 2px 6px rgba(28,43,58,0.18)"
                      : "0 1px 3px rgba(28,43,58,0.12)",
                    zIndex: isSelected ? 1 : 0,
                  }}
                >
                  {/* 실제 모양(사각형 또는 ㄱ자/U자 다각형)은 회전 각도만큼 돌리고, 아래 이름표·버튼은
                      항상 똑바로 보이도록 따로 겹쳐 그린다(글자가 돌아가면 읽기 불편하므로). */}
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      width: baseWPx,
                      height: baseHPx,
                      transform: `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${it.flipped ? -1 : 1})`,
                    }}
                  >
                    {isPoly ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <polygon
                          points={polyPoints}
                          fill={C.purpleBg}
                          stroke={C.purple}
                          strokeWidth={shapeStrokeWidth}
                          strokeDasharray={shapeStrokeDasharray}
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    ) : isCircle ? (
                      <svg width={baseWPx} height={baseHPx} style={shapeSvgStyle}>
                        <ellipse
                          cx="50%"
                          cy="50%"
                          rx="50%"
                          ry="50%"
                          fill={C.purpleBg}
                          stroke={C.purple}
                          strokeWidth={shapeStrokeWidth}
                          strokeDasharray={shapeStrokeDasharray}
                        />
                      </svg>
                    ) : isRoundEnd ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <path
                          d={roundEndTablePathD(it.widthCm, it.depthCm)}
                          fill={C.purpleBg}
                          stroke={C.purple}
                          strokeWidth={shapeStrokeWidth}
                          strokeDasharray={shapeStrokeDasharray}
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    ) : isChair ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <ChairTopIcon w={it.widthCm} d={it.depthCm} fill={C.purpleBg} stroke={C.purple} />
                      </svg>
                    ) : isMeetingChair ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <MeetingChairTopIcon w={it.widthCm} d={it.depthCm} fill={C.purpleBg} stroke={C.purple} />
                      </svg>
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: C.purpleBg, border: `1px solid ${C.purple}`, borderRadius: 3, boxSizing: "border-box" }} />
                    )}
                  </div>
                  {/* "가구 이름이 지저분하게 나오니까 깔끔하게" 요청 — 이름 대신 규격(가로×세로)만
                      짧게 보여주기로 함(사용자 선택: "규격만 깔끔하게"). 이름이 길어도 늘 짧고 정돈된
                      한 줄로 보이고, 전체 이름은 위 title 속성(마우스 올리면 뜨는 말풍선)에서 그대로
                      볼 수 있다. */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      color: C.ink,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      pointerEvents: "none",
                    }}
                  >
                    {it.widthCm}×{it.depthCm}
                  </div>
                  {/* ㄱ자·U자만 좌우반전(퍼즐책상 좌향/우향)이 의미가 있어서, 사각형에는 안 보여준다.
                      버튼 클릭이 캔버스까지 올라가서 줄자 클릭으로 잘못 잡히지 않도록 stopPropagation. */}
                  {isPoly && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFlipPlaced(it.id);
                      }}
                      title="좌우 반전(퍼즐책상 좌향/우향 등)"
                      className="layoutsim-no-print"
                      style={{ position: "absolute", top: 1, right: 31, border: "none", background: "transparent", cursor: "pointer", fontSize: 10, padding: 1 }}
                    >
                      ⇋
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRotatePlaced(it.id);
                    }}
                    title="90도 회전"
                    className="layoutsim-no-print"
                    style={{ position: "absolute", top: 1, right: 16, border: "none", background: "transparent", cursor: "pointer", fontSize: 10, padding: 1 }}
                  >
                    ⟳
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemovePlaced(it.id);
                    }}
                    title="삭제"
                    className="layoutsim-no-print"
                    style={{ position: "absolute", top: 1, right: 1, border: "none", background: "transparent", cursor: "pointer", fontSize: 11, padding: 1 }}
                  >
                    ×
                  </button>
                  {/* 크기 조절 손잡이: 오른쪽 아래 모서리를 끌면 가로·세로가 바뀐다. 이 손잡이에서 시작한
                      드래그는 항목 전체를 옮기는 draggable 동작이나 줄자 클릭으로 잘못 이어지지 않도록
                      막아준다(stopPropagation + dragstart 취소). 예전에는 bottom/right를 -4로 줘서 이
                      손잡이가 모형 박스 밖으로 살짝 삐져나오게 그렸는데, 배치판에 overflow:hidden 안전
                      장치를 추가한 뒤로 모형이 배치판 아래·오른쪽 벽에 딱 붙었을 때 이 손잡이의 튀어나온
                      부분이 그 안전장치에 잘려서 반쪽만 보이는 등 "디자인을 침범하는" 것처럼 보이는
                      문제가 있었다. 그래서 손잡이를 모형 박스 안쪽에 완전히 들어오도록(0,0 기준) 옮겨서,
                      모형이 배치판 어느 벽에 붙어 있어도 손잡이가 잘리는 일이 없게 했다. */}
                  <div
                    onMouseDown={startResizePlaced(it, swapped)}
                    onDragStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    title="끌어서 크기 조절"
                    className="layoutsim-no-print"
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: C.ink,
                      border: "1px solid #fff",
                      cursor: "nwse-resize",
                    }}
                  />
                </div>
              );
            })}
            {placedItems.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 12.5, pointerEvents: "none" }}>
                왼쪽 모형 목록에서 끌어다 놓아보세요
              </div>
            )}
            {/* 빈 곳을 끌어서 여러 모형을 한꺼번에 고르는 중(마퀴/드래그 선택)일 때, 지금 끌고 있는
                사각 범위를 옅은 보라색으로 보여준다. 클릭·드래그를 막지 않도록 pointerEvents는 항상 none. */}
            {marqueeRect && (
              <div
                className="layoutsim-no-print"
                style={{
                  position: "absolute",
                  left: marqueeRect.xCm * renderScale,
                  top: marqueeRect.yCm * renderScale,
                  width: marqueeRect.wCm * renderScale,
                  height: marqueeRect.hCm * renderScale,
                  background: "rgba(107, 92, 165, 0.12)",
                  border: `1px dashed ${C.purple}`,
                  pointerEvents: "none",
                }}
              />
            )}
            {/* 줄자 모드일 때는 모형 끝점(모서리)마다 옅은 점을 미리 보여줘서, 어디를 누르면
                딱 붙는지("끝점 인식") 미리 알 수 있게 한다. */}
            {rulerMode &&
              rulerSnapPoints.map((p, idx) => (
                <div
                  key={`ruler-snap-${idx}`}
                  className="layoutsim-no-print"
                  style={{
                    position: "absolute",
                    left: p.xCm * renderScale - 3,
                    top: p.yCm * renderScale - 3,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    border: `1px solid ${C.purple}`,
                    background: "#fff",
                    pointerEvents: "none",
                  }}
                />
              ))}
            {/* 줄자: 찍은 점(1~2개)과, 두 점이 모이면 그 사이를 잇는 선 + 실제 거리(cm/m) 표시.
                클릭/드래그를 막지 않도록 pointerEvents는 항상 none. */}
            {rulerPoints.map((p, idx) => (
              <div
                key={`ruler-pt-${idx}`}
                style={{
                  position: "absolute",
                  left: p.xCm * renderScale - 4,
                  top: p.yCm * renderScale - 4,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#e11d48",
                  border: "1px solid #fff",
                  pointerEvents: "none",
                }}
              />
            ))}
            {rulerPoints.length === 2 && (
              <svg
                width={worldWidthPx}
                height={worldHeightPx}
                style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
              >
                <line
                  x1={rulerPoints[0].xCm * renderScale}
                  y1={rulerPoints[0].yCm * renderScale}
                  x2={rulerPoints[1].xCm * renderScale}
                  y2={rulerPoints[1].yCm * renderScale}
                  stroke="#e11d48"
                  strokeWidth={2}
                  strokeDasharray="6,4"
                />
              </svg>
            )}
            {rulerDistanceCm != null && (
              <div
                className="layoutsim-no-print"
                style={{
                  position: "absolute",
                  left: ((rulerPoints[0].xCm + rulerPoints[1].xCm) / 2) * renderScale,
                  top: ((rulerPoints[0].yCm + rulerPoints[1].yCm) / 2) * renderScale,
                  transform: "translate(-50%, -50%)",
                  background: "#e11d48",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                {rulerDistanceCm >= 100 ? `${(rulerDistanceCm / 100).toFixed(2)}m (${rulerDistanceCm.toFixed(0)}cm)` : `${rulerDistanceCm.toFixed(1)}cm`}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* 축척 맞추기 모달: 도면 파일을 고르면(calibrating이 채워지면) 화면 전체를 덮는 오버레이로
          뜬다. position:fixed라서 배치판의 flex 레이아웃과는 완전히 분리돼 있어 서로 영향을 주지
          않는다. */}
      {calibrating && (
        <div
          className="layoutsim-no-print"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(28,43,58,0.55)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 20,
              maxWidth: CALIB_VIEWPORT_W + 40,
              width: "100%",
              boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ fontFamily: serif, fontSize: 15, marginBottom: 8, color: C.ink }}>도면 축척 맞추기</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
              {calibrating.points.length === 0 && "도면 위에서 실제 거리를 알고 있는 두 지점을 순서대로 클릭해주세요(예: 문 폭 양쪽 끝, 벽 모서리 사이 등). 정확히 찍기 어려우면 마우스 휠로 확대해서 세밀하게 찍을 수 있어요."}
              {calibrating.points.length === 1 && "이제 두 번째 지점을 클릭해주세요."}
              {calibrating.points.length === 2 && "두 지점 사이의 실제 거리를 입력하고 '적용'을 눌러주세요."}
            </div>
            {/* "도면 업로드 화면도 크게 만들어서 줌인/아웃 기능 넣어줘 세부적으로 거리 체킹 가능하게"
                요청: 배치판과 같은 방식(마우스 휠 확대 + 확대한 상태에서 Shift+끌기로 이동)을 이 미리보기
                에도 적용했다 — 두 지점을 세밀하게 찍어야 축척이 정확해지므로, 특히 이 화면에서 정밀한
                확대가 중요하다. */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => handleCalibZoomButton(1 / 1.25)}
                disabled={calibZoom <= CALIB_ZOOM_MIN}
                title="도면 축소"
                style={{ ...miniBtnStyle, padding: "4px 9px", opacity: calibZoom <= CALIB_ZOOM_MIN ? 0.4 : 1 }}
              >
                −
              </button>
              <span style={{ fontSize: 11, color: C.inkSoft, minWidth: 36, textAlign: "center" }}>{Math.round(calibZoom * 100)}%</span>
              <button
                onClick={() => handleCalibZoomButton(1.25)}
                disabled={calibZoom >= CALIB_ZOOM_MAX}
                title="도면 확대"
                style={{ ...miniBtnStyle, padding: "4px 9px", opacity: calibZoom >= CALIB_ZOOM_MAX ? 0.4 : 1 }}
              >
                ＋
              </button>
              {(calibZoom !== 1 || calibPan.x !== 0 || calibPan.y !== 0) && (
                <button onClick={handleCalibResetView} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>화면 맞춤</button>
              )}
              <span style={{ fontSize: 11, color: C.muted }}>마우스 휠로 확대·축소, 확대한 상태에서 Shift+끌면 화면 이동</span>
            </div>
            <div
              ref={calibViewportRef}
              onMouseDownCapture={handleCalibMouseDownCapture}
              onClickCapture={handleCalibClickCapture}
              style={{
                position: "relative",
                width: CALIB_VIEWPORT_W,
                height: CALIB_VIEWPORT_H,
                border: `1px solid ${C.lineSoft}`,
                overflow: "hidden",
                background: C.bg,
                cursor: isCalibPanning ? "grabbing" : calibrating.points.length < 2 ? "crosshair" : "default",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: calibOffset.left,
                  top: calibOffset.top,
                  width: calibOffset.w,
                  height: calibOffset.h,
                }}
                onClick={(e) => {
                  if (calibrating.points.length >= 2) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const xPx = (e.clientX - rect.left) / calibZoom;
                  const yPx = (e.clientY - rect.top) / calibZoom;
                  setCalibrating((prev) => ({ ...prev, points: [...prev.points, { xPx, yPx }] }));
                }}
              >
                <img
                  src={calibrating.url}
                  alt="배경 도면 미리보기"
                  draggable={false}
                  style={{ display: "block", width: calibOffset.w, height: calibOffset.h }}
                />
                {calibrating.points.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: p.xPx * calibZoom - 5,
                      top: p.yPx * calibZoom - 5,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: C.purple,
                      border: "2px solid #fff",
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
                      pointerEvents: "none",
                    }}
                  />
                ))}
                {calibrating.points.length === 2 && (
                  <svg style={{ position: "absolute", top: 0, left: 0, width: calibOffset.w, height: calibOffset.h, pointerEvents: "none" }}>
                    <line
                      x1={calibrating.points[0].xPx * calibZoom}
                      y1={calibrating.points[0].yPx * calibZoom}
                      x2={calibrating.points[1].xPx * calibZoom}
                      y2={calibrating.points[1].yPx * calibZoom}
                      stroke={C.purple}
                      strokeWidth={2}
                      strokeDasharray="4 3"
                    />
                  </svg>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              {calibrating.points.length === 2 && (
                <>
                  <input
                    type="number"
                    placeholder="두 지점 사이 실제 거리(cm)"
                    value={calibDistanceInput}
                    onChange={(e) => setCalibDistanceInput(e.target.value)}
                    style={{ ...inputStyle, width: 200 }}
                  />
                  <button onClick={handleApplyCalibration} disabled={applyingCalibration} style={primaryBtnStyle2}>
                    {applyingCalibration ? "적용 중…" : "적용"}
                  </button>
                  <button onClick={() => setCalibrating((prev) => ({ ...prev, points: [] }))} style={ghostBtnStyle}>
                    다시 찍기
                  </button>
                </>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={handleCancelCalibration} style={ghostBtnStyle}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 로그인 여부를 확인해서, 이미 메인 시스템에 로그인돼 있으면(같은 브라우저) 곧바로 가구배치
// (시뮬레이션) 화면을 보여주고, 아니면 로그인 화면부터 보여준다. 관리자/영업담당자 구분 같은 메인
// 시스템의 다른 권한 로직은 이 화면에는 필요 없어서 담당자 이름(manager_name)만 가져와 배치안 저장
// 시 "담당자" 칸에 자동으로 채워지게 한다.
export default function Page() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [managerName, setManagerName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadProfile(data.session);
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (sess) loadProfile(sess);
      else {
        setSession(null);
        setManagerName("");
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(sess) {
    setSession(sess);
    const { data } = await supabase.from("profiles").select("manager_name").eq("id", sess.user.id).single();
    setManagerName(data?.manager_name || "");
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, color: C.inkSoft }}>
        불러오는 중…
      </div>
    );
  }
  if (!session) return <LoginScreen />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans }}>
      <div
        style={{
          borderBottom: `1px solid ${C.line}`,
          background: C.panel,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, color: C.ink }}>리마켓 가구배치(시뮬레이션)</div>
        <button onClick={() => supabase.auth.signOut()} style={ghostBtnStyle}>
          로그아웃
        </button>
      </div>
      <div style={{ padding: 20 }}>
        {/* 이 독립 화면은 메인 시스템의 전체 메뉴·maxWidth 같은 바깥 틀이 없어서(그냥 이 페이지 자체가
            전부) insideAppShell을 false로 알려준다 — 그래야 LayoutSimTab이 배치판 가로 최대 크기를
            계산할 때 메인 시스템에만 있는 왼쪽 메뉴(232px)·maxWidth(1600px) 같은 걸 빼지 않고, 이
            화면 자체의 padding(20px 양쪽)만 고려해서 창 너비를 훨씬 더 넉넉하게 쓴다. */}
        <LayoutSimTab managerName={managerName} insideAppShell={false} />
      </div>
    </div>
  );
}
