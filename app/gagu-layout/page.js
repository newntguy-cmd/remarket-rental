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
  // (2026-09-30) page.js와 같은 포인트 컬러로 맞춰서 두 화면이 서로 어긋나지 않게 통일했다.
  purple: "#5B4FE5",
  purpleDark: "#4638C2",
  purpleBg: "#EEECFF",
  // (2026-09-30) "가구 테두리를 세련된 브라운으로" 요청 반영 — page.js의 LayoutSimTab 코드가 이 두
  // 색을 그대로 참조하므로, 이 화면에도 똑같이 정의해둬야 한다(값도 page.js와 동일하게 맞춤).
  brownAccent: "#8C6A42",
  furnitureBg: "#F3EAD9",
  mutedBg: "#EEEEEC",
  muted: "#6B7280",
};

const serif = "'Noto Serif KR','Georgia',serif";
const sans = "'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif";

const todayISO = () => new Date().toISOString().slice(0, 10);

// "좀 더 프로페셔널하고 전문적인 모던 SaaS 느낌으로" 요청(2026-09-30)에 맞춰 메인 시스템(app/page.js)과
// 똑같이 버튼·입력창 기본값을 다듬었다(둥근 정도·입력창 배경·호버 반응). 메인 시스템과 똑같은 공용
// 값을 쓰는 파일이라 여기도 같이 맞춰야 두 화면이 계속 같은 느낌을 유지한다.
const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  fontSize: 14.5,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  background: C.panel, // 예전엔 페이지 배경(C.bg)과 같은 색이라 입력창이 밋밋하게 묻혀 보였는데, 흰색으로 또렷하게 구분되게 했다.
  color: C.ink,
  outline: "none",
  fontFamily: sans,
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};
const smallInputStyle = { ...inputStyle, padding: "6px 8px", fontSize: 13, borderRadius: 7 };
const primaryBtnStyle = {
  width: "100%",
  padding: "11px 0",
  background: C.ink,
  color: "#fff",
  border: "none",
  borderRadius: 9,
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
  borderRadius: 9,
  color: C.inkSoft,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: sans,
  transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
};
const miniBtnStyle = { ...ghostBtnStyle, padding: "5px 10px", fontSize: 12, borderRadius: 7 };
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

// "줄자 좀 섹시하게 편하게" 요청: 줄자 선 양쪽 끝에 도면(CAD)에서 흔히 보는 치수선처럼 짧은 수직
// 눈금(tick)을 그려서 단순한 점보다 "정확히 여기부터 여기까지"라는 느낌이 나게 한다. 줄자 선은 항상
// 완전히 가로 또는 완전히 세로(axisConstrainedSecondPoint)라서, 눈금은 그 선과 직각 방향으로만
// 그리면 된다 — 가로선이면 세로 눈금을, 세로선이면 가로 눈금을 양 끝에 하나씩.
function perpendicularTicks(x1, y1, x2, y2, tickLen) {
  const horizontal = Math.abs(y1 - y2) < 0.5;
  if (horizontal) {
    return {
      a: { x1, y1: y1 - tickLen / 2, x2: x1, y2: y1 + tickLen / 2 },
      b: { x1: x2, y1: y2 - tickLen / 2, x2: x2, y2: y2 + tickLen / 2 },
    };
  }
  return {
    a: { x1: x1 - tickLen / 2, y1, x2: x1 + tickLen / 2, y2: y1 },
    b: { x1: x2 - tickLen / 2, y1: y2, x2: x2 + tickLen / 2, y2: y2 },
  };
}

// ㄱ자(퍼즐책상 등)·U자(테이블 등) 모형의 외곽선을 그리기 위한 좌표를 계산한다. shapeType이 "rect"가
// 아니면, 전체 바깥 크기(widthCm×depthCm)에서 안쪽으로 파인 부분(notchWidthCm×notchDepthCm)을 뺀
// 다각형 좌표를 만든다. "ㄱ"자는 한쪽 모서리를 잘라낸 모양, "U"자는 한쪽 변 가운데를 파낸 모양이다.
// 실제 가구 도면처럼 정밀하진 않지만, 배치 시뮬레이션에서 크기·모양을 가늠하는 용도로는 충분하다.
function shapePolygonPoints(shapeType, widthCm, depthCm, notchWidthCm, notchDepthCm) {
  const W = Number(widthCm) || 0;
  const D = Number(depthCm) || 0;
  if (shapeType === "l" || shapeType === "curvedl") {
    // ("곡선ㄱ자" 책상은 파인 모서리가 직각 대신 부드러운 곡선으로 이어질 뿐, 어느 모서리가 파였는지를
    // 정하는 규칙(가로·세로 값의 부호)과 다각형 좌표 자체는 ㄱ자와 완전히 같다 — 실제 곡선 윤곽선은
    // curvedLDeskPathD가 따로 그리고, 이 다각형은 충돌 판정 등 보조 용도로만 쓰인다.)
    // "ㄱ자 퍼즐책상이 메뉴에 뒤집어져 있다" 신고: 예전엔 파인 모서리가 항상 "오른쪽 위" 한 가지로만
    // 고정돼 있었는데, 실제 ㄱ자 퍼즐책상은 제품마다 어느 모서리가 파였는지가 다르다(참고 사진은
    // "왼쪽 아래"가 파인 모양). DB에 새 칼럼을 추가하지 않고 이미 있는 "파인 모서리 가로/세로" 값의
    // 부호만으로 네 모서리를 전부 표현한다: 가로 값이 음수면 "왼쪽"이 파인 것, 세로 값이 음수면
    // "아래쪽"이 파인 것(둘 다 양수면 예전 그대로 오른쪽 위 — 기존에 이미 등록해둔 모든 모형은 항상
    // 양수였으니 100% 그대로 호환된다). 새 모형 추가 화면에서는 이 부호를 직접 입력하는 대신, 모서리
    // 아이콘 버튼 4개 중 하나를 고르면 자동으로 맞는 부호가 저장된다.
    const rawNw = Number(notchWidthCm) || 0;
    const rawNd = Number(notchDepthCm) || 0;
    const cutLeft = rawNw < 0;
    const cutBottom = rawNd < 0;
    const nw = Math.min(Math.max(Math.abs(rawNw), 0), Math.max(W - 1, 0));
    const nd = Math.min(Math.max(Math.abs(rawNd), 0), Math.max(D - 1, 0));
    if (cutLeft && cutBottom) {
      // 왼쪽 아래가 파임(참고 사진의 ㄱ자 퍼즐책상 기본 모양)
      return [
        [0, 0],
        [W, 0],
        [W, D],
        [nw, D],
        [nw, D - nd],
        [0, D - nd],
      ];
    }
    if (cutLeft) {
      // 왼쪽 위가 파임
      return [
        [nw, 0],
        [W, 0],
        [W, D],
        [0, D],
        [0, nd],
        [nw, nd],
      ];
    }
    if (cutBottom) {
      // 오른쪽 아래가 파임
      return [
        [0, 0],
        [W, 0],
        [W, D - nd],
        [W - nw, D - nd],
        [W - nw, D],
        [0, D],
      ];
    }
    // 기본값(예전부터 있던 데이터와 100% 호환): 오른쪽 위가 파임
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

// "배치도에 잘려나간 부분이 여전히 공간을 차지하고 있어... 의자를 ㄱ자 빈공간에 넣지 못해" 버그 수정.
// 그동안 다른 모형과 겹치는지(resolveOverlap) 검사할 때는 ㄱ자·U자도 항상 "파인 부분까지 포함한
// 네모난 바깥 박스" 하나로만 취급해왔다. 그래서 실제로는 비어 있는 ㄱ자 안쪽 구석에 의자를 넣으려
// 해도 그 자리가 이 네모 박스 범위 안이라는 이유만으로 자꾸 밖으로 밀려났다. 이 함수는 ㄱ자·U자 모양을
// "실제로 채워진 부분"만 남도록 작은 사각형 1~2개로 쪼갠다(이 사각형들을 합치면 shapePolygonPoints가
// 그리는 다각형과 정확히 같은 모양이 된다) — 겹침 검사를 이 조각들끼리만 하면, 파인 자리는 애초에
// 조각이 없으니 자연스럽게 "빈 자리"로 취급되어 의자가 들어갈 수 있다. 사각형·원형·의자류처럼 원래도
// 통짜인 모양은 그대로 사각형 하나만 돌려준다(기존과 100% 동일하게 동작 — 회귀 없음).
function shapeSubRects(shapeType, widthCm, depthCm, notchWidthCm, notchDepthCm) {
  const W = Number(widthCm) || 0;
  const D = Number(depthCm) || 0;
  if (shapeType === "l" || shapeType === "curvedl") {
    // ("곡선ㄱ자" 책상의 충돌 판정은 ㄱ자와 똑같이 직각으로 파인 사각형 2조각으로 근사한다 — 실제
    // 곡선은 이 사각형 모서리보다 아주 살짝 안쪽으로만 들어가는 정도라, 자리 차지 계산에는 차이가
    // 거의 없다.)
    const rawNw = Number(notchWidthCm) || 0;
    const rawNd = Number(notchDepthCm) || 0;
    const cutLeft = rawNw < 0;
    const cutBottom = rawNd < 0;
    const nw = Math.min(Math.max(Math.abs(rawNw), 0), Math.max(W - 1, 0));
    const nd = Math.min(Math.max(Math.abs(rawNd), 0), Math.max(D - 1, 0));
    if (cutLeft && cutBottom) {
      return [
        { x: 0, y: 0, w: W, h: D - nd },
        { x: nw, y: D - nd, w: W - nw, h: nd },
      ];
    }
    if (cutLeft) {
      return [
        { x: 0, y: nd, w: W, h: D - nd },
        { x: nw, y: 0, w: W - nw, h: nd },
      ];
    }
    if (cutBottom) {
      return [
        { x: 0, y: 0, w: W, h: D - nd },
        { x: 0, y: D - nd, w: W - nw, h: nd },
      ];
    }
    return [
      { x: 0, y: nd, w: W, h: D - nd },
      { x: 0, y: 0, w: W - nw, h: nd },
    ];
  }
  if (shapeType === "u") {
    const nw = Math.min(Math.max(Math.abs(Number(notchWidthCm) || 0), 0), Math.max(W - 2, 0));
    const nd = Math.min(Math.max(Math.abs(Number(notchDepthCm) || 0), 0), Math.max(D - 1, 0));
    const armW = (W - nw) / 2;
    return [
      { x: 0, y: nd, w: W, h: D - nd },
      { x: 0, y: 0, w: armW, h: nd },
      { x: armW + nw, y: 0, w: armW, h: nd },
    ];
  }
  return [{ x: 0, y: 0, w: W, h: D }];
}

// 위 shapeSubRects가 돌려준 조각 사각형 하나(회전·반전 전, 모형 자기 자신의 원래 가로×세로 기준
// 좌표)를, 실제로 화면에 놓인 회전(rotation: 0/90/180/270)·좌우반전(flipped)까지 반영해서 배치판
// 기준 절대좌표(cm)로 바꿔준다. 회전은 항상 90도 단위라서 변환 후에도 항상 축에 나란한 사각형으로
// 남는다 — 그래서 마주보는 두 귀퉁이(왼쪽위·오른쪽아래)만 옮기고 min/max로 다시 정렬하면 충분하다.
// (화면에 실제로 보이는 모양은 CSS의 `rotate(${rotation}deg) scaleX(flipped?-1:1)`로 그려지는데,
// CSS 변환은 오른쪽에 있는 함수부터 적용되므로 여기서도 반전을 먼저, 회전을 나중에 적용한다.)
function transformLocalRectToWorld(rect, W, D, rotation, flipped, originXCm, originYCm) {
  function mapPoint(x, y) {
    const fx = flipped ? W - x : x;
    const fy = y;
    if (rotation === 90) return { x: D - fy, y: fx };
    if (rotation === 180) return { x: W - fx, y: D - fy };
    if (rotation === 270) return { x: fy, y: W - fx };
    return { x: fx, y: fy };
  }
  const p1 = mapPoint(rect.x, rect.y);
  const p2 = mapPoint(rect.x + rect.w, rect.y + rect.h);
  return {
    left: Math.min(p1.x, p2.x) + originXCm,
    right: Math.max(p1.x, p2.x) + originXCm,
    top: Math.min(p1.y, p2.y) + originYCm,
    bottom: Math.max(p1.y, p2.y) + originYCm,
  };
}

// 모형 하나(회전·반전·파인 부분까지 전부 반영)를 실제로 채워진 작은 사각형들(배치판 기준 절대좌표,
// cm)의 배열로 바꿔준다 — resolveOverlap의 겹침 검사에서 "네모난 바깥 박스" 하나 대신 이걸 쓴다.
// "제품 클릭하면 동그라미 기능 넣어서 회전 자유자재로도 가능하게" 요청으로 회전이 더 이상 90도
// 단위가 아닐 수 있게 됐다 — transformLocalRectToWorld의 조각 변환 공식은 90도 단위 회전에서만
// 정확하므로, 그 외 각도(자유 회전 중)에는 조각을 정밀하게 나누는 대신 안전하게 전체를 감싸는
// 사각형(rotatedAabbSize) 하나로만 겹침 검사를 한다 — ㄱ자·U자를 비스듬히 돌렸을 때 파인 자리까지
// 정밀하게 인식하진 못하지만(드문 사용 사례), 최소한 겹침 계산 자체가 틀어지지는 않는다.
// 중심(cxCm,cyCm)에 놓인 wCm×hCm 사각형을 임의 각도(rotationDeg, 90도 단위가 아니어도 됨)로 그
// 중심을 축으로 돌렸을 때의 네 꼭짓점(배치판 기준 절대좌표, cm)을 구한다. CSS의 `rotate(deg)`와
// 같은 방향(화면 좌표계에서 양수 각도 = 시계방향)으로 돈다 — 실제 화면에 그려지는 모양과 정확히
// 일치해야 아래 satPush의 겹침 계산도 화면에 보이는 그대로 맞는다.
function rotatedRectCorners(cxCm, cyCm, wCm, hCm, rotationDeg) {
  const rad = ((Number(rotationDeg) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = wCm / 2;
  const hh = hCm / 2;
  const local = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return local.map(([lx, ly]) => ({ x: cxCm + lx * cos - ly * sin, y: cyCm + lx * sin + ly * cos }));
}

// 분리축 정리(SAT): "나"(myCorners, myRotDeg만큼 기울어져 있을 수 있음)와 "상대"(otherCorners,
// otherRotDeg만큼 기울어져 있을 수 있음)가 실제로 겹치는지, 겹친다면 어느 방향으로 얼마나 밀어야
// 가장 적게 움직여서 떨어지는지를 구한다. (버그 수정: "회의용 의자를 돌려서 원형테이블에 딱
// 붙이려는데 안 붙는다" 신고 — 처음엔 "나"는 항상 축에 나란하다고 가정했는데, 옮기는(끌리는) 쪽인
// "나"가 회전해 있는 경우(바로 이 신고 상황)에는 그 회전한 실제 모양의 변 방향 축도 검사해야
// 정확하다. 이제 두 사각형 각각의 변 방향(축에 나란하면 그냥 x·y축과 같음)을 모두 모아서 검사한다
// — 겹치는 축이 하나도 같으면(둘 다 축에 나란하거나 둘 다 똑같이 기울어짐) 중복 없이 x축·y축
// 두 개만 쓰고, 이때는 예전의 "겹친 가로·세로 중 더 적은 쪽으로 민다" 계산과 결과가 완전히 같다
// (회귀 없음). 겹치지 않으면 null을 돌려준다.
function satPush(myCorners, otherCorners, myRotDeg, otherRotDeg) {
  const axes = [];
  function addAxesFor(rotDeg) {
    const rad = ((Number(rotDeg) || 0) * Math.PI) / 180;
    axes.push([Math.cos(rad), Math.sin(rad)]);
    axes.push([-Math.sin(rad), Math.cos(rad)]);
  }
  const myMod = ((Number(myRotDeg) % 90) + 90) % 90;
  const otherMod = ((Number(otherRotDeg) % 90) + 90) % 90;
  addAxesFor(myRotDeg);
  if (Math.abs(otherMod - myMod) > 1e-9) addAxesFor(otherRotDeg);
  let minOverlap = Infinity;
  let pushX = 0;
  let pushY = 0;
  for (const [ax, ay] of axes) {
    let aMin = Infinity, aMax = -Infinity;
    for (const p of myCorners) {
      const proj = p.x * ax + p.y * ay;
      if (proj < aMin) aMin = proj;
      if (proj > aMax) aMax = proj;
    }
    let bMin = Infinity, bMax = -Infinity;
    for (const p of otherCorners) {
      const proj = p.x * ax + p.y * ay;
      if (proj < bMin) bMin = proj;
      if (proj > bMax) bMax = proj;
    }
    const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      const sign = (aMin + aMax) / 2 < (bMin + bMax) / 2 ? -1 : 1;
      pushX = ax * sign * overlap;
      pushY = ay * sign * overlap;
    }
  }
  return { pushX, pushY, overlap: minOverlap };
}

// 모형 하나(회전·반전·파인 부분까지 전부 반영)를 실제로 채워진 작은 사각형들(배치판 기준 절대좌표,
// cm — 겹침 계산용 꼭짓점 corners까지 포함)의 배열로 바꿔준다.
// (버그 수정) "도려낸 곳의 잔상이 남아있어 딱 붙이고 싶은데 안 붙는다" 신고 — 임의 각도로 회전한
// 모형을 예전엔 축에 나란한 바깥 테두리(rotatedAabbSize) 하나로만 겹침 검사를 해서, 사각형이
// 대각선으로 기울며 생기는 네 귀퉁이의 빈 여백까지 "차지한 것"처럼 다른 모형을 밀어냈다 — 옆에
// 다가가면 실제 모형에 닿기 한참 전에 이 보이지 않는 여백(잔상)에 막혀 멈췄다. 이제 진짜 회전한
// 사각형의 네 꼭짓점을 그대로 돌려주고, resolveOverlap이 SAT로 그 실제 모양과만 정밀하게 겹침
// 검사를 하도록 바꿨다. 원(circle)은 회전해도 모양이 똑같으므로(원은 회전 불변) 애초에 회전이 없는
// 실제 지름 그대로 쓴다 — 원은 절대 여백이 생기지 않는다. ㄱ자·U자를 비스듬히 돌린 경우(드문 사용
// 사례)는 여전히 조각을 나누지 않고 하나의 바깥 사각형으로 근사한다.
function worldSubRects(xCm, yCm, widthCm, depthCm, shapeType, notchWidthCm, notchDepthCm, rotation, flipped) {
  const W = Number(widthCm) || 0;
  const D = Number(depthCm) || 0;
  if (rotation % 90 !== 0) {
    const isCircle = shapeType === "circle";
    const { w: aabbW, h: aabbH } = rotatedAabbSize(W, D, rotation);
    const cx = xCm + aabbW / 2;
    const cy = yCm + aabbH / 2;
    const pieceW = isCircle ? W : W;
    const pieceH = isCircle ? D : D;
    const pieceRot = isCircle ? 0 : rotation;
    const corners = rotatedRectCorners(cx, cy, pieceW, pieceH, pieceRot);
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return [{ left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), corners, rotDeg: pieceRot }];
  }
  return shapeSubRects(shapeType, W, D, notchWidthCm, notchDepthCm).map((r) => {
    const rect = transformLocalRectToWorld(r, W, D, rotation, flipped, xCm, yCm);
    return {
      ...rect,
      corners: [
        { x: rect.left, y: rect.top },
        { x: rect.right, y: rect.top },
        { x: rect.right, y: rect.bottom },
        { x: rect.left, y: rect.bottom },
      ],
      rotDeg: 0,
    };
  });
}

// 회전(임의 각도 가능)까지 반영했을 때, 이 모형이 화면에서 실제로 차지하는 "축에 나란한 바깥 테두리"
// 크기(가로·세로, cm)를 구한다. 0/90/180/270도에서는 예전의 swapped(가로·세로 맞바꿈) 계산과 정확히
// 똑같은 값이 나오고(회귀 없음), 그 사이 각도에서는 회전한 사각형을 완전히 감싸는 최소 크기로 자연스럽게
// 이어진다 — 벽 밖으로 못 나가게 막거나(wall clamp), 다른 모형과 안 겹치게 밀어낼 때(collision) 등
// "이 모형이 화면에서 어디까지 차지하나"를 알아야 하는 모든 곳에서 공통으로 쓴다.
function rotatedAabbSize(widthCm, depthCm, rotationDeg) {
  const rad = ((Number(rotationDeg) || 0) * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  return {
    w: widthCm * cosA + depthCm * sinA,
    h: widthCm * sinA + depthCm * cosA,
  };
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

// "책상류 퍼즐은... 하단이 직각이 아니라 아로져있어" 요청으로 추가한 "곡선ㄱ자" 책상(깊은 몸통과 얕은
// 날개가 부드러운 곡선으로 이어지는 모양) 외곽선을 SVG path로 그린다. 파인 모서리가 네 곳 중 어디인지
// 정하는 규칙(notchWidthCm·notchDepthCm 값의 부호로 왼쪽/아래쪽이 파였는지 정함)은 ㄱ자(l)와 완전히
// 똑같다 — 다만 ㄱ자는 그 모서리를 직각(꺾인 두 직선)으로 그리는데, 이 모양은 같은 자리를 3차 베지어
// 곡선 하나로 매끄럽게 잇는다. sCurve 헬퍼는 원래 직각을 이루던 두 점(ax,ay)→(bx,by) 사이를, 서로
// 반대쪽 끝에 제어점을 맞춰서(대칭) "먼저 한쪽으로, 이어서 반대쪽으로 볼록"하게 흐르는 S자 곡선으로
// 잇는다 — 참고 도면(3종류 폭 1400/1600/1800mm, 몸통 깊이 1200mm·날개 깊이 690mm)에 나온 것과 같은
// 느낌의 부드러운 전환이다. 파인 부분이 없으면(날개 폭이 0, 예: 1400mm 폭 기본형) 그냥 사각형이 된다.
function curvedLDeskPathD(widthCm, depthCm, notchWidthCm, notchDepthCm) {
  const W = Number(widthCm) || 0;
  const D = Number(depthCm) || 0;
  const rawNw = Number(notchWidthCm) || 0;
  const rawNd = Number(notchDepthCm) || 0;
  const cutLeft = rawNw < 0;
  const cutBottom = rawNd < 0;
  const nw = Math.min(Math.max(Math.abs(rawNw), 0), Math.max(W - 1, 0));
  const nd = Math.min(Math.max(Math.abs(rawNd), 0), Math.max(D - 1, 0));
  const sCurve = (ax, ay, bx, by) => `C ${ax},${by} ${bx},${ay} ${bx},${by}`;
  if (nw <= 0 || nd <= 0) return `M 0,0 L ${W},0 L ${W},${D} L 0,${D} Z`;
  if (cutLeft && cutBottom) {
    return `M 0,0 L ${W},0 L ${W},${D} L ${nw},${D} ${sCurve(nw, D, 0, D - nd)} L 0,0 Z`;
  }
  if (cutLeft) {
    return `M ${nw},0 L ${W},0 L ${W},${D} L 0,${D} L 0,${nd} ${sCurve(0, nd, nw, 0)} Z`;
  }
  if (cutBottom) {
    return `M 0,0 L ${W},0 L ${W},${D - nd} ${sCurve(W, D - nd, W - nw, D)} L 0,${D} Z`;
  }
  return `M 0,0 L ${W - nw},0 ${sCurve(W - nw, 0, W, nd)} L ${W},${D} L 0,${D} Z`;
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

// 회의실·테이블 앞에 놓는 회의(응접)의자를 위에서 내려다본 모양으로 그린다. "회의의자 이거 위에서
// 내려다본 느낌으로 센스있게 수정해줘" 요청으로, 새로 올려준 참고 사진(검은 가죽에 누빔 누빔(퀄팅)
// 사각 패턴이 있는 등받이·좌판, 크롬 팔걸이, 캐스터 바퀴가 달린 크롬 다리)을 반영해 다시 그렸다.
// 양옆에 통통한 팔걸이 패드를 추가하고, 등받이·좌판에는 참고 사진의 누빔 패턴을 가는 격자선 몇 개로
// 단순화해서 표현했다. 좌판 밑 캐스터 다리는 몸통보다 먼저(안 보이게) 그려서, 몸통·팔걸이가 안쪽을
// 덮고 남은 대각선 네 귀퉁이에만 작은 바퀴 원이 살짝 삐져나온 것처럼 보이게 했다(사무의자 팔걸이와
// 같은 "속이 빈 손잡이" 원리 — 겹치는 도형을 따로 보정하지 않아도 지저분한 선이 남지 않는다).
function MeetingChairTopIcon({ w, d, fill, stroke }) {
  const W = Number(w) || 0;
  const D = Number(d) || 0;
  const minWD = Math.min(W, D);
  const strokeW = Math.max(minWD * 0.022, 0.35);

  // 캐스터(바퀴) 달린 크롬 다리 — 좌판 중심에서 대각선 네 방향으로 살짝 떨어진 자리에 작은 원으로
  // 표시. fill:none으로 그려서 이후에 그려지는 팔걸이·몸통(불투명)에 안쪽 절반이 가려지고, 몸통 밖
  // 대각선 귀퉁이만 자연스럽게 톡 튀어나온 바퀴처럼 보인다.
  const casterR = minWD * 0.05;
  const casterDx = W * 0.4;
  const casterDy = D * 0.42;
  const cx0 = W / 2;
  const cy0 = D / 2;

  // 팔걸이(양옆) — 참고 사진처럼 가는 고리형이 아니라 도톰한 크롬 팔걸이라서, 통통한 둥근 사각형으로.
  const armW = W * 0.11;
  const armMarginY = D * 0.24;
  const armH = D - armMarginY * 2;
  const armRx = armW * 0.5;

  // 몸통(등받이+좌판) — 팔걸이 안쪽 폭 기준으로, 참고 사진처럼 사무의자보다 각진 사각 쿠션 느낌을 준다.
  const bodyX = armW * 1.05;
  const bodyW = W - bodyX * 2;
  const marginY = D * 0.04;
  const bodyTop = marginY;
  const bodyBottom = D - marginY;
  const lobeH = (bodyBottom - bodyTop) * 0.54;
  const headY = bodyTop;
  const seatY = bodyBottom - lobeH;
  const lobeRx = Math.min(bodyW, lobeH) * 0.14;

  // 누빔(퀄팅) 사각 패턴 — 참고 사진의 바둑판 누빔을 등받이·좌판 안에 가는 격자선 몇 개로 단순화.
  const quiltLines = (x, y, w, h) => (
    <>
      <line x1={x + w * 0.33} y1={y + h * 0.14} x2={x + w * 0.33} y2={y + h * 0.86} />
      <line x1={x + w * 0.67} y1={y + h * 0.14} x2={x + w * 0.67} y2={y + h * 0.86} />
      <line x1={x + w * 0.1} y1={y + h * 0.5} x2={x + w * 0.9} y2={y + h * 0.5} />
    </>
  );

  return (
    <g stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round">
      <circle cx={cx0 - casterDx / 2} cy={cy0 - casterDy / 2} r={casterR} fill="none" />
      <circle cx={cx0 + casterDx / 2} cy={cy0 - casterDy / 2} r={casterR} fill="none" />
      <circle cx={cx0 - casterDx / 2} cy={cy0 + casterDy / 2} r={casterR} fill="none" />
      <circle cx={cx0 + casterDx / 2} cy={cy0 + casterDy / 2} r={casterR} fill="none" />
      <rect x={0} y={armMarginY} width={armW} height={armH} rx={armRx} fill={fill} />
      <rect x={W - armW} y={armMarginY} width={armW} height={armH} rx={armRx} fill={fill} />
      <rect x={bodyX} y={headY} width={bodyW} height={lobeH} rx={lobeRx} fill={fill} />
      <rect x={bodyX} y={seatY} width={bodyW} height={lobeH} rx={lobeRx} fill={fill} />
      <g fill="none" strokeWidth={strokeW * 0.55} opacity={0.5}>
        {quiltLines(bodyX, headY, bodyW, lobeH)}
        {quiltLines(bodyX, seatY, bodyW, lobeH)}
      </g>
    </g>
  );
}

// 쇼파를 위에서 내려다본(bird's-eye) 모양으로 그린다. "쇼파는 위 사이즈대로 만들고 위에서 내려다본
// 디자인으로 해줘(센스있게!!)" 요청으로 추가 — 참고 사진(프린스쇼파, 나무 롤암 손잡이가 있는 가죽
// 소파)을 보고, 양옆에 둥글게 마감된 팔걸이(롤암)와 등받이 띠, 좌석 쿠션이 나뉘어 있는 구조를 다른
// 아이콘들과 같은 캐드 기호 방식으로 단순화했다. 색은 넣지 않고(fill·stroke만 그대로 받아 써서 다른
// 모형들과 통일감을 유지) 솔기(seam)선만으로 팔걸이·등받이·쿠션 경계를 나타낸다. 좌석 개수는 폭(W)으로
// 자동으로 정해져서(좁으면 1인용, 넓으면 3인용 식) 별도 입력 없이도 크기에 맞는 쿠션 구성이 나온다 —
// 프린스쇼파 1인용(W950)은 쿠션 1개, 3인용(W1900)은 쿠션 3개로 자동으로 그려진다.
function SofaTopIcon({ w, d, fill, stroke }) {
  const W = Number(w) || 0;
  const D = Number(d) || 0;
  const minWD = Math.min(W, D);
  const strokeW = Math.max(minWD * 0.02, 0.4);
  const seats = W <= 1300 ? 1 : W <= 1700 ? 2 : 3;

  // 양옆 팔걸이(롤암) — 안쪽에 작은 둥근 테두리선을 하나 더 그려서 나무 롤암 특유의 볼록한 느낌을 낸다.
  const armW = W * 0.09;
  const bodyRx = minWD * 0.05;

  // 등받이 띠 — 뒤쪽(위)에 있는 가로로 긴 쿠션 띠.
  const backH = D * 0.26;

  // 좌석 쿠션 — 팔걸이 안쪽 폭을 좌석 개수만큼 똑같이 나눠서 하나씩 그린다.
  const seatX0 = armW;
  const seatX1 = W - armW;
  const seatAreaW = Math.max(seatX1 - seatX0, 0);
  const seatW = seatAreaW / seats;

  return (
    <g stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round">
      {/* 몸통(팔걸이 포함 전체 외곽) */}
      <rect x={0} y={0} width={W} height={D} rx={bodyRx} ry={bodyRx} fill={fill} />
      {/* 팔걸이와 좌석 사이 솔기선 */}
      <line x1={seatX0} y1={0} x2={seatX0} y2={D} fill="none" />
      <line x1={seatX1} y1={0} x2={seatX1} y2={D} fill="none" />
      {/* 팔걸이 안쪽의 작은 둥근 테두리선(나무 롤암의 볼록한 느낌) */}
      <rect x={armW * 0.22} y={D * 0.06} width={armW * 0.56} height={D * 0.88} rx={armW * 0.28} fill="none" />
      <rect x={W - armW + armW * 0.22} y={D * 0.06} width={armW * 0.56} height={D * 0.88} rx={armW * 0.28} fill="none" />
      {/* 등받이와 좌석 사이 솔기선 */}
      <line x1={seatX0} y1={backH} x2={seatX1} y2={backH} fill="none" />
      {/* 좌석 쿠션 사이 경계선(2인용 이상일 때만 보임) */}
      {Array.from({ length: seats - 1 }).map((_, i) => {
        const cx = seatX0 + seatW * (i + 1);
        return <line key={i} x1={cx} y1={backH} x2={cx} y2={D * 0.97} fill="none" />;
      })}
      {/* 각 쿠션 앞쪽의 살짝 휘어진 경계선(사무의자 아이콘과 같은 기법) */}
      {Array.from({ length: seats }).map((_, i) => {
        const cx = seatX0 + seatW * (i + 0.5);
        const halfW = seatW * 0.32;
        const seamY = D * 0.82;
        return (
          <path
            key={`c${i}`}
            d={`M ${cx - halfW} ${seamY} Q ${cx} ${seamY + strokeW * 1.6} ${cx + halfW} ${seamY}`}
            fill="none"
            strokeWidth={strokeW * 0.8}
          />
        );
      })}
    </g>
  );
}

// ---------- 배치 시뮬레이션 ----------
// 공간 크기(가로×세로, m)를 입력하면 그 비율의 네모 박스가 나오고, 미리 등록해둔 모형(품목명+가로×세로,
// 사각형 외에 ㄱ자·U자 모양도 가능)을 드래그앤드랍으로 박스 안에 가져다 놓아볼 수 있다. 모형 크기는
// 처음 쓸 때 한 번 등록해두면(톤수 기준표와 같은 방식) 다음부터는 목록에서 바로 꺼내 쓸 수 있고, 배치한
// 결과는 이름을 붙여 저장해뒀다가 나중에 다시 불러올 수 있다.
function LayoutSimTab({ managerName = "", insideAppShell = true }) {
  const [shapes, setShapes] = useState([]);
  const [loadingShapes, setLoadingShapes] = useState(true);
  const [newShapeName, setNewShapeName] = useState("");
  const [newShapeType, setNewShapeType] = useState("rect"); // "rect" | "l"(ㄱ자) | "curvedl"(곡선ㄱ자책상) | "u"(U자) | "circle"(원형) | "roundend"(한쪽둥근) | "chair"(사무의자) | "meetingchair"(회의의자) | "sofa"(쇼파)
  const [newShapeWidth, setNewShapeWidth] = useState("");
  const [newShapeDepth, setNewShapeDepth] = useState("");
  const [newShapeNotchWidth, setNewShapeNotchWidth] = useState(""); // ㄱ자: 잘려나간 모서리, U자: 안쪽 파인 부분
  const [newShapeNotchDepth, setNewShapeNotchDepth] = useState("");
  // "ㄱ자 퍼즐책상은 메뉴에도 위 모양대로" 요청으로 ㄱ자를 다시 등록할 수 있게 하면서, 어느 모서리가
  // 파였는지를 사용자가 부호 없이 아이콘 버튼으로 고를 수 있게 추가한 상태값. "ㄱ자에서 왼쪽2개
  // 없애주고(오른쪽 위, 왼쪽 위)" 요청으로 위쪽이 파인 두 버튼을 없애면서, 기본값도 이제 실제로 고를
  // 수 있는 값인 "오른쪽 아래"로 바꿨다. handleAddShape에서 이 값에 따라 notch_width_cm/notch_depth_cm의
  // 부호를 정한다.
  const [newShapeCutCorner, setNewShapeCutCorner] = useState("br"); // "br" | "bl" (예전엔 "tr"·"tl"도 있었지만 버튼에서 뺌)
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
  // "품목명 수정할 수 있게 기능 넣어줘" + "카테고리 잘못 설정해도 수정해서 원하는 카테고리에 넣을 수
  // 있게" 요청: 모형 목록(카탈로그)에 등록해둔 모형의 이름과 카테고리를 직접 고칠 수 있게 한다.
  // editingShapeId에 지금 고치는 중인 모형의 id를 담아두고, 그 줄만 이름·카테고리 입력칸을 보여준다
  // (배치판에 이미 놓인 개별 모형의 이름을 고치는 manualNameInput과는 다른, 카탈로그 자체의 이름·
  // 카테고리를 바꾸는 기능 — 한 번 고치면 그 모형을 앞으로 새로 끌어다 놓을 때부터 반영된다).
  const [editingShapeId, setEditingShapeId] = useState(null);
  const [editingShapeName, setEditingShapeName] = useState("");
  const [editingShapeCategory, setEditingShapeCategory] = useState("");
  // "하단에 전체 카테고리 다 뜨게" 요청 — 카테고리 입력칸에 포커스가 잡히는 순간 값을 잠깐
  // 비워서(datalist 필터링을 피해) 전체 카테고리를 보여주는데, 그동안 원래 값을 여기 담아뒀다가
  // 아무것도 새로 고르지 않고 포커스를 벗어나면 되돌린다.
  const editingShapeCategoryPrevRef = useRef("");
  const newShapeCategoryPrevRef = useRef("");

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
  const [rulerCopied, setRulerCopied] = useState(false); // "복사됨" 표시를 잠깐 보여줬다가 되돌리는 용도

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
    const isPoly = newShapeType === "l" || newShapeType === "curvedl" || newShapeType === "u";
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
        alert(newShapeType === "l" || newShapeType === "curvedl" ? "잘려나간 모서리의 가로·세로 크기(cm)를 입력해주세요." : "안쪽 파인 부분의 가로·세로 크기(cm)를 입력해주세요.");
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
    // ㄱ자(l)는 화면에서 고른 "파인 모서리" 아이콘(newShapeCutCorner)에 맞춰, 저장 직전에 여기서만
    // notch_width_cm/notch_depth_cm의 부호를 정한다(왼쪽이 파였으면 가로를 음수로, 아래쪽이 파였으면
    // 세로를 음수로) — DB 칼럼을 새로 추가하지 않고도 shapePolygonPoints/shapeSubRects가 그 부호를
    // 보고 어느 모서리인지 알아낸다. 화면 입력칸(newShapeNotchWidth/Depth)에는 항상 양수 크기만 넣게
    // 해서 사용자가 직접 음수를 입력할 일은 없다.
    const isLShaped = newShapeType === "l" || newShapeType === "curvedl";
    const signedNw = isPoly && isLShaped && (newShapeCutCorner === "tl" || newShapeCutCorner === "bl") ? -Math.abs(nw) : nw;
    const signedNd = isPoly && isLShaped && (newShapeCutCorner === "bl" || newShapeCutCorner === "br") ? -Math.abs(nd) : nd;
    const { error } = await supabase.from("layout_shapes").insert({
      name: newShapeName.trim(),
      shape_type: newShapeType,
      width_cm: w,
      depth_cm: d,
      notch_width_cm: signedNw,
      notch_depth_cm: signedNd,
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
    setNewShapeCutCorner("tr");
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

  // "품목명 수정할 수 있게 기능 넣어줘" + "카테고리 잘못 설정해도 수정해서 원하는 카테고리에 넣을 수
  // 있게" 요청 — 카탈로그(모형 목록)에 등록된 모형의 이름·카테고리를 함께 고쳐서 저장한다(예: 잘못
  // 붙인 이름 "44"를 바로잡거나, 엉뚱한 카테고리에 들어간 모형을 원하는 카테고리로 옮기기). 카테고리를
  // 실제로 바꾼 경우에는 새로 등록할 때와 똑같이 그 카테고리의 맨 아래로 놓이도록 sort_order도 새로
  // 매긴다(카테고리를 안 바꿨으면 원래 순서 그대로 둔다). 이름이 비어있으면 저장하지 않고, 아무것도
  // 안 바꿨으면 서버에 불필요한 요청을 보내지 않는다.
  async function handleSaveShapeEdit(id) {
    const newName = (editingShapeName || "").trim();
    const newCategory = (editingShapeCategory || "").trim() || "기타";
    setEditingShapeId(null);
    const current = shapes.find((s) => s.id === id);
    if (!newName || !current) return;
    const nameChanged = newName !== current.name;
    const categoryChanged = newCategory !== (current.category || "기타");
    if (!nameChanged && !categoryChanged) return;
    const payload = {};
    if (nameChanged) payload.name = newName;
    if (categoryChanged) {
      payload.category = newCategory;
      payload.sort_order = (shapesByCategory[newCategory] || []).length;
    }
    // 화면에는 바로 반영해서 기다리는 느낌 없이 즉시 바뀐 것처럼 보이게 하고, 저장이 실패하면 되돌린다.
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...payload } : s)));
    const { error } = await supabase.from("layout_shapes").update(payload).eq("id", id);
    if (error) {
      alert("수정 중 오류가 발생했어요: " + error.message);
      fetchShapes();
    }
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
    const isCurvedL = shapeType === "curvedl";
    const isChair = shapeType === "chair";
    const isMeetingChair = shapeType === "meetingchair";
    const isSofa = shapeType === "sofa";
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
    const isEditingName = editingShapeId === s.id;
    return (
      <div
        key={s.id}
        draggable={!isEditingName}
        onDragStart={(e) => handleDragStartCatalog(e, s)}
        title={isEditingName ? undefined : "끌어서 배치판에 놓으세요"}
        style={{
          display: "flex",
          flexWrap: "wrap",
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
            <polygon points={previewPoints} fill={C.furnitureBg} stroke={C.brownAccent} strokeWidth={Math.max(s.width_cm, s.depth_cm) / 12} />
          </svg>
        ) : isCircle ? (
          <svg width={14} height={14} style={{ flexShrink: 0 }}>
            <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={C.furnitureBg} stroke={C.brownAccent} strokeWidth={1} />
          </svg>
        ) : isRoundEnd ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <path d={roundEndTablePathD(s.width_cm, s.depth_cm)} fill={C.furnitureBg} stroke={C.brownAccent} strokeWidth={Math.max(s.width_cm, s.depth_cm) / 12} />
          </svg>
        ) : isCurvedL ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <path
              d={curvedLDeskPathD(s.width_cm, s.depth_cm, s.notch_width_cm, s.notch_depth_cm)}
              fill={C.furnitureBg}
              stroke={C.brownAccent}
              strokeWidth={Math.max(s.width_cm, s.depth_cm) / 12}
            />
          </svg>
        ) : isChair ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <ChairTopIcon w={s.width_cm} d={s.depth_cm} fill={C.furnitureBg} stroke={C.brownAccent} />
          </svg>
        ) : isMeetingChair ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <MeetingChairTopIcon w={s.width_cm} d={s.depth_cm} fill={C.furnitureBg} stroke={C.brownAccent} />
          </svg>
        ) : isSofa ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <SofaTopIcon w={s.width_cm} d={s.depth_cm} fill={C.furnitureBg} stroke={C.brownAccent} />
          </svg>
        ) : (
          <div style={{ width: 14, height: 14, background: C.furnitureBg, border: `1px solid ${C.brownAccent}`, borderRadius: 2, flexShrink: 0 }} />
        )}
        {isEditingName ? (
          <input
            autoFocus
            value={editingShapeName}
            onChange={(e) => setEditingShapeName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveShapeEdit(s.id);
              else if (e.key === "Escape") setEditingShapeId(null);
            }}
            style={{ ...smallInputStyle, flex: 1, minWidth: 0, boxSizing: "border-box" }}
          />
        ) : (
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.name} <span style={{ color: C.muted, fontSize: 11 }}>({sizeLabel})</span>
          </span>
        )}
        {!isEditingName && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditingShapeId(s.id);
              setEditingShapeName(s.name);
              setEditingShapeCategory(s.category || "기타");
            }}
            title="품목명·카테고리 수정"
            style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 12, flexShrink: 0, padding: "1px 2px" }}
          >
            ✏️
          </button>
        )}
        {/* "카테고리 잘못 설정해도 수정해서 원하는 카테고리에 넣을 수 있게" 요청 — 이름 입력칸 바로
            아래에 카테고리 입력칸을 한 줄 더 보여준다(flexBasis:100%로 줄바꿈). 기존 카테고리 이름을
            datalist로 미리 보여줘서 오타 없이 골라 쓸 수 있고, 직접 새 이름을 입력해도 된다. 저장·취소
            버튼을 따로 둬서 이름·카테고리 두 칸을 한 번에 확정하거나 되돌릴 수 있게 했다. */}
        {isEditingName && (
          <div style={{ flexBasis: "100%", display: "flex", gap: 6, marginTop: 2 }} onClick={(e) => e.stopPropagation()}>
            <input
              value={editingShapeCategory}
              onChange={(e) => setEditingShapeCategory(e.target.value)}
              onDragStart={(e) => e.stopPropagation()}
              onFocus={() => {
                // "하단에 전체 카테고리 다 뜨게 수정해줭" 요청 — 이 칸에는 이미 현재 카테고리
                // 이름(예: "기타")이 들어가 있어서, 브라우저가 datalist 목록을 그 글자를 포함하는
                // 항목으로만 걸러서 보여주고 있었다(그래서 "소파·파티션·기타"·"기타"만 보이고 나머지
                // 카테고리는 안 보였음). 포커스가 잡히는 순간 값을 잠깐 비워서 전체 카테고리가 다
                // 보이게 하고, 아무것도 고르거나 새로 입력하지 않은 채 포커스를 벗어나면(onBlur)
                // 원래 값으로 되돌려서 실수로 비어버리지 않게 한다.
                editingShapeCategoryPrevRef.current = editingShapeCategory;
                setEditingShapeCategory("");
              }}
              onBlur={() => {
                setEditingShapeCategory((cur) => (cur ? cur : editingShapeCategoryPrevRef.current || ""));
              }}
              placeholder="카테고리 (예: 책상류, 테이블류)"
              list="layoutsim-category-datalist"
              style={{ ...smallInputStyle, flex: 1, minWidth: 0, boxSizing: "border-box" }}
            />
            <button
              type="button"
              onClick={() => handleSaveShapeEdit(s.id)}
              title="저장"
              style={{ border: "none", background: C.ink, color: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 11, padding: "0 8px", flexShrink: 0 }}
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditingShapeId(null)}
              title="취소"
              style={{ border: `1px solid ${C.lineSoft}`, background: "transparent", color: C.muted, borderRadius: 4, cursor: "pointer", fontSize: 11, padding: "0 8px", flexShrink: 0 }}
            >
              취소
            </button>
          </div>
        )}
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
  // 배치판(canvasRef, 실제 방 크기만큼 그려지는 "내용물")은 확대할수록 커지지만, 그걸 담는 바깥 창
  // (viewportRef)은 항상 같은 크기로 고정해서 옆 목록 등 다른 화면 배치가 확대 배율에 따라 흔들리지
  // 않게 한다. VIEW_BLEED는 확대하지 않은 기본 상태에서도 선택된 모형의 테두리·그림자가("오른쪽과
  // 하단은 여전히 제품을 먹고 있어" 신고로 없앤 overflow:hidden 대신 이번엔 이 여유 공간으로) 창
  // 가장자리에 잘리지 않도록 두는 안전 여백이다(대지(layoutsim-ground) 크기 계산에서도 쓰기 때문에,
  // MAX_CANVAS_W/H보다 먼저 선언해둔다).
  const VIEW_BLEED = 14;
  // "전체보기에서 대지 부분이 마우스로 스크롤 안 내려도 한 화면에 다 들어와야 한다" 요청 — 대지
  // (layoutsim-ground)에 직접 ref를 달아, 화면(전체보기 오버레이) 맨 위에서 대지가 실제로 시작하는
  // 지점(groundTopPx)을 매번 실측한다(canvasColWidthPx를 실측하는 것과 같은 방식). 처음 그려지기
  // 전에는 잴 수 없으니 예전에 쓰던 "220"과 비슷한 값을 기본값으로 두고, 그려진 뒤(아래 useLayoutEffect)
  // 바로 정확한 값으로 고쳐 잰다. 대지 위쪽 내용(안내문구가 몇 줄로 접히는지, 저장된 배치안 목록이
  // 있는지 등)이 바뀔 때마다 다시 재도록, 그 값들을 의존값으로 둔다.
  const groundRef = useRef(null);
  const [groundTopPx, setGroundTopPx] = useState(220);
  useLayoutEffect(() => {
    if (!isFullView || !groundRef.current) return;
    const top = Math.round(groundRef.current.getBoundingClientRect().top);
    setGroundTopPx((prev) => (Math.abs(prev - top) >= 2 ? top : prev));
  }, [isFullView, boards.length, spaceWidthM, spaceDepthM, viewportSize.w, viewportSize.h, canvasColWidthPx]);
  const MAX_CANVAS_W = Math.max(360, canvasColWidthPx);
  // "전체판은... 고정값이고 결코 움직이지 않아 / 세로는 4칸 정도면 되겠다" 요청대로, 평소(전체보기
  // 아닐 때)의 세로 크기는 창 높이에 따라 늘었다 줄었다 하지 않는 고정 크기로 못박았다 — 방이 아무리
  // 커도(또는 창이 아무리 커도) 이 안에서 줌인·줌아웃으로 들여다보는 식이다. "전체보기" 버튼을 눌러
  // 화면 전체로 키운 상태는 별개로, 그때는 여전히 창 높이만큼 넉넉하게 쓴다.
  const NORMAL_CANVAS_H = 600;
  // (버그 수정) "전체보기에서 대지 부분이 마우스로 스크롤 안 내려도 한 화면에 다 들어와야 하는데, 지금은
  // 스크롤을 내려야 대지 아래쪽이 보인다" 신고 — 예전엔 대지 위(제목·안내문구·공간 크기 입력줄·저장된
  // 배치안 목록·안내문구+도구모음줄 등)에 실제로 얼마나 자리를 차지하는지 "220"이라는 숫자 하나로
  // 대충 짐작해서 뺐는데, 이 숫자가 실제 상황(안내문구가 화면 폭에 따라 몇 줄로 접히는지, 저장된
  // 배치안이 있어서 그 줄이 하나 더 생기는지 등)과 안 맞으면 늘 이런 식으로 틀어졌다(가로 폭 계산을
  // canvasColWidthPx로 실제 재는 것과 똑같은 문제였다). 그래서 세로도 똑같이, "대지가 실제로 화면
  // 어디서부터 시작하는지"(groundTopPx, 아래 groundRef로 직접 잰 값)를 직접 재서 그 자리까지 빼는
  // 방식으로 바꿨다 — 위에 있는 내용이 몇 줄이 되든, 저장된 배치안이 몇 개가 있든 상관없이 항상
  // 정확하게 화면 안에 맞아떨어진다.
  const BOTTOM_GAP_PX = 14; // 전체보기 오버레이 자체의 아래쪽 padding(14px)과 맞춰, 대지 아래에도 숨쉴 틈을 남겨둔다.
  const MAX_CANVAS_H = isFullView
    ? Math.max(420, viewportSize.h - groundTopPx - BOTTOM_GAP_PX - VIEW_BLEED * 2)
    : NORMAL_CANVAS_H;
  const scale = Math.min(MAX_CANVAS_W / (spaceWidthM * 100), MAX_CANVAS_H / (spaceDepthM * 100));
  const canvasWidthPx = spaceWidthM * 100 * scale;
  const canvasHeightPx = spaceDepthM * 100 * scale;

  // "마우스 휠로 줌인/줌아웃, 시프트+끌기로 화면 이동" 요청: 위 scale(방 전체를 딱 맞춰 보여주는
  // 배율)은 그대로 "기본값"으로 두고, 그 위에 곱해지는 확대 배율(zoomLevel)을 하나 더 둔다. 방이
  // 아주 크면(예: 가로 32m) 딱 맞춰 보이는 배율로는 화면에서 1cm가 채 1px도 안 돼서 정확한 지점을
  // 클릭하기가 어려운데, 확대하면 그 자리를 훨씬 크게 볼 수 있어 줄자로 정확히 찍거나 모형을 딱
  // 맞는 자리에 놓기 쉬워진다.
  // "줌아웃은 점이 될 정도까지 아웃을 시켜도 돼" 요청으로, 딱 맞춤 배율(1) 밑으로도 훨씬 더 축소할 수
  // 있게 열어뒀다 — 가로로 아주 넓고 낮은 방(예: 20m×3m)처럼 대지의 가로 폭에 거의 딱 맞아떨어지는
  // 방은 평소(줌 1배)엔 대지 좌우 끝에 거의 붙어 보이는데, 이렇게 더 줌아웃하면 방을 대지 가운데로
  // 더 작게 줄여서 대지와 방 사이에 여백을 원하는 만큼 만들어볼 수 있다.
  const ZOOM_MIN = 0.05;
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
  // (VIEW_BLEED는 이제 MAX_CANVAS_W/H 바로 앞에서 선언한다 — 대지 크기 계산에도 쓰기 때문.)
  // (버그 수정) "대지 안에서는 시프트 마우스로 자유롭게 움직여야 하는데... 확대 후 움직이는 과정에서
  // 어느 선까지만 이동이 되는구나 끝까지 갈수가 없음" 신고 — 예전엔 이 창(viewportRef, 실제로 Shift+
  // 끌기가 먹히는 잘리는 범위)이 방의 "딱 맞춤" 크기(canvasWidthPx/HeightPx)에 여백만 살짝 더한
  // 크기로 고정돼 있었다. 그래서 대지(점선 테두리, MAX_CANVAS_W×MAX_CANVAS_H)가 훨씬 넓어도, 확대한
  // 방을 끌어서 옮길 수 있는 실제 범위는 그 작은 창 안으로만 한정됐고, 창 밖으로는 제아무리 끌어도
  // 더 나가지지 않아 "끝까지 갈 수 없는" 것처럼 보였다 — 대지의 남는 공간이 통째로 낭비되고 있었던
  // 셈이다. 이제 이 창을 대지 크기(MAX_CANVAS_W×MAX_CANVAS_H) 밑으로는 절대 작아지지 않게
  // Math.max로 키워서, 대지 안의 모든 공간을 실제로 Shift+끌기 이동 범위로 쓸 수 있게 한다 — 방이
  // 딱 맞춤 배율에서 이미 한쪽 방향으로 대지 끝까지 꽉 차 있는 경우(scale을 정한 바로 그 방향)만
  // 예전처럼 canvasWidthPx/HeightPx+여백 크기를 그대로 쓴다(그래야 그 방향에서 대지보다 창이 더
  // 작아지는 일 없이 항상 최소한 이전과 동일하게 동작한다).
  const viewportWidthPx = Math.max(canvasWidthPx + VIEW_BLEED * 2, MAX_CANVAS_W);
  const viewportHeightPx = Math.max(canvasHeightPx + VIEW_BLEED * 2, MAX_CANVAS_H);
  const worldWidthPx = spaceWidthM * 100 * renderScale;
  const worldHeightPx = spaceDepthM * 100 * renderScale;

  // ("대지에 먹는 공간 안생기게 해줘" 요청으로 줌아웃하면 대지 자체를 함께 줄이는 시도를 잠깐
  // 해봤었는데, 대지 크기가 viewportRef(고정 크기 창)보다 작아지면 그 안에서 flex 가운데 정렬된
  // viewport가 대지 경계를 넘어 위·아래·양옆으로 걸쳐 있게 되고, 실제 배치판(canvasRef, worldOffset
  // 기준으로 "viewport 가운데"에 위치)은 이 viewport 안 어딘가에 있다 보니 대지 창(overflow:hidden)에
  // 걸리는 부분이 한쪽 구석의 아주 가느다란 선 한 줄만 남는 식으로 완전히 깨져 보였다("대지 다
  // 깨졌어, 줌아웃도 안되고" 신고). "대지는 고정값인데" / "배치판도 대지를 넘어다니지 말고 그 안에서만
  // 놀 수 있게" 요청대로, 대지는 줌과 무관하게 다시 예전처럼 항상 MAX_CANVAS_W×MAX_CANVAS_H로
  // 고정한다 — 대지가 늘 viewport보다 크거나 같으니(viewport는 scale 기준으로 항상 MAX_CANVAS_W/H
  // 이하로 계산됨) 배치판은 줌·이동과 무관하게 항상 대지 테두리 안에서만 보인다. "빈 공간이 생긴다"는
  // 문제는 나중에 이 부작용 없이 다른 방식으로 다시 다뤄야 한다.

  // 주어진 확대 배율(zoom)·이동값(pan)일 때, 배치판(canvasRef)이 바깥 창(viewportRef) 안에서
  // 왼쪽/위로 얼마나 떨어진 자리에 놓이는지 계산한다. pan이 (0,0)이면 방 가운데가 창 가운데에
  // 오도록 두고, 거기에 pan을 더한다 — 마우스 휠 확대(어느 지점을 기준으로 확대할지)와 Shift+끌기
  // (화면 이동) 양쪽에서 똑같이 이 계산을 써야 화면이 어긋나지 않는다.
  function computeWorldOffset(zoom, pan) {
    const renderScaleAt = scale * zoom;
    const wPx = spaceWidthM * 100 * renderScaleAt;
    const hPx = spaceDepthM * 100 * renderScaleAt;
    // (위 viewportWidthPx/HeightPx 수정과 짝을 이루는 부분) 예전엔 "VIEW_BLEED - (wPx-canvasWidthPx)/2"
    // 식으로, 창 크기가 늘 canvasWidthPx+VIEW_BLEED*2라는 걸 전제로 한 공식이었다. 이제 창이 대지
    // 크기까지 커질 수 있으므로, 실제 창 크기(viewportWidthPx/HeightPx)를 기준으로 방을 가운데
    // 놓는 일반적인 공식으로 바꿨다 — 창이 예전 크기 그대로일 때는 두 식이 수학적으로 완전히 같아서
    // (VIEW_BLEED - (wPx-canvasWidthPx)/2 = (canvasWidthPx+VIEW_BLEED*2 - wPx)/2 = (viewportWidthPx-wPx)/2)
    // 기존 동작은 그대로 유지된다.
    const baseLeft = (viewportWidthPx - wPx) / 2;
    const baseTop = (viewportHeightPx - hPx) / 2;
    return { left: baseLeft + pan.x, top: baseTop + pan.y, baseLeft, baseTop, worldWidthPx: wPx, worldHeightPx: hPx, renderScaleAt };
  }
  const worldOffset = computeWorldOffset(zoomLevel, viewPan);

  // (버그 수정) "대지 안에서 배치판이 자연스럽게 움직여야지 옆으로 가면 화면을 먹어버리는데" 신고 —
  // 예전엔 "방의 적어도 80px만 창 안에 걸쳐 있으면 된다"는 느슨한 기준(MIN_OVERLAP_PX)이라, Shift+
  // 끌기로 옆으로 조금만 세게 이동해도 배치판 대부분(벽·눈금·놓인 모형·선택 도구모음까지)이 바깥
  // 창(viewportRef) 밖으로 밀려나 잘려 보였다 — 벽이 "화면을 먹는" 게 아니라 이동 가능 범위 자체가
  // 너무 넓어서 배치판이 통째로 창 밖으로 잘려나갔던 것이다(줌을 안 하거나 줌아웃해서 배치판이 창보다
  // 작을 때도 마찬가지로 잘렸다). 이제는 "적어도 일부만" 대신 "배치판이 창보다 작으면 항상 전체가 창
  // 안에 다 보이고, 배치판이 창보다 크면(확대했을 때) 창이 배치판으로 항상 꽉 채워지도록"(사진 앱·지도
  // 앱에서 흔한 방식) 완전히 바꿔서, 어떤 크기·줌 상태에서도 대지 바깥 여백이 창 안쪽에 드러나거나
  // 배치판이 어중간하게 잘려 보이는 일이 없다.
  function clampPan(pan, zoom) {
    const { worldWidthPx: wPx, worldHeightPx: hPx, baseLeft, baseTop } = computeWorldOffset(zoom, { x: 0, y: 0 });
    const xA = -baseLeft; // 배치판 왼쪽 끝이 창 왼쪽 끝(0)에 오는 지점
    const xB = viewportWidthPx - wPx - baseLeft; // 배치판 오른쪽 끝이 창 오른쪽 끝에 오는 지점
    const lowX = Math.min(xA, xB);
    const highX = Math.max(xA, xB);
    const yA = -baseTop;
    const yB = viewportHeightPx - hPx - baseTop;
    const lowY = Math.min(yA, yB);
    const highY = Math.max(yA, yB);
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

  // 마우스 휠: deltaY(휠을 굴린 정도)에 따라 부드럽게 배율을 바꾼다. 이 화면에서 휠은 페이지 스크롤
  // 용도가 아니라 배치판 전용 확대·축소로 쓰므로 브라우저 기본 동작(페이지 스크롤)은 막아준다.
  // React의 onWheel은 기본적으로 "passive"(preventDefault가 안 먹힘)로 등록돼서, 아래 useEffect로
  // 이 창(viewportRef)에 직접 리스너를 달아 막는다(passive: false).
  // (버그 수정) 예전엔 마우스 커서가 가리키던 지점을 기준으로 확대했는데(지도 앱처럼), 그러면 커서가
  // 방 가장자리 쪽에 있는 채로 휠을 굴렸을 때 배치판이 그 커서 쪽으로 쏠려 보였다("5×4로 하면 대지
  // 속으로 사라진다"는 신고 — 20m처럼 아주 넓은 방은 어차피 대지 가로 폭에 거의 꽉 차 있어서 덜
  // 티가 났을 뿐, 원리는 같았다). 방 크기·비율과 무관하게 절대 안 쏠리도록, 아래 버튼(+/-)과
  // 완전히 똑같이 휠도 항상 창(viewport) 정가운데를 기준으로만 확대·축소한다 — 이러면 아무리 확대·
  // 축소해도 배치판은 항상 정가운데에 그대로 있다.
  const wheelHandlerRef = useRef(() => {});
  wheelHandlerRef.current = function handleCanvasWheel(e) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomTo(zoomLevel * factor, viewportWidthPx / 2, viewportHeightPx / 2);
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

  // Shift를 누른 채 배치판 창을 끌면 그 보이는 위치를 옮긴다. 마퀴(드래그로 여러 모형 선택)·모형
  // 끌기·크기조절·줄자 찍기 등 기존 동작은 모두 Shift 없이 그대로 쓸 수 있게, 캡처 단계(bubble
  // 이전)에서 Shift가 눌려있을 때만 가로채서(stopPropagation) 화면 이동으로 처리하고, 그렇지 않으면
  // 그대로 흘려보내 기존 동작에 아무 영향이 없게 한다. Shift는 "화면 이동" 전용으로 통일한다(마퀴에
  // 더하는 동작의 단축키는 Ctrl(⌘)).
  // ("줌아웃이든 줌인이든 시프트 누르고 자유자재로 이동" 요청 전에는, 딱 맞춤 배율(zoomLevel<=1)일
  // 땐 방이 창 안에 다 들어와 있어 옮겨봐도 의미가 없다고 보고 그때는 가로채지 않았었다. 그런데
  // "줌아웃은 점이 될 정도까지"로 딱 맞춤보다 더 축소할 수 있게 되면서, 축소된 상태에서도 방을
  // 대지(전체판) 안 원하는 자리로 옮겨보고 싶은 경우가 생겨 — 이제 배율과 상관없이 항상 Shift+끌기로
  // 화면을 이동할 수 있게 열어뒀다.)
  function handleViewportMouseDownCapture(e) {
    if (!e.shiftKey || e.button !== 0) return;
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
  // ("줄자 좀 섹시하게 편하게" 요청으로 손을 눌러서 끌고 가서 놓는(drag) 동작을 지원하면서, 놓는
  // 순간(onMarqueeUp)에도 "지금 마우스가 어디 있는지"를 읽어야 하는데, 그 핸들러는 useEffect
  // 안에서 한 번만 만들어지고(의존값 [renderScale, rulerMode, placedItems]이 바뀔 때만 다시 만들어짐)
  // hoverCm은 마우스가 움직일 때마다 훨씬 자주 바뀌므로, onMarqueeUp 클로저 안에서 state(hoverCm)를
  // 직접 참조하면 항상 오래된(맨 처음) 값만 보게 된다. ref에 최신 값을 늘 복사해두고 onMarqueeUp에서는
  // 이 ref를 읽는다.)
  const hoverCmRef = useRef(null);
  hoverCmRef.current = hoverCm;
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
      const { w: ow, h: oh } = rotatedAabbSize(other.widthCm, other.depthCm, rotation);
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
  // (버그 수정) "잘려나간 부분이 여전히 공간을 차지하고 있어... 의자를 ㄱ자 빈공간에 넣지 못해" 신고
  // — 예전엔 상대 모형(other)을 항상 "파인 부분까지 포함한 네모 박스" 하나로만 보고 밀어냈는데,
  // 이제 ㄱ자·U자는 worldSubRects로 실제 채워진 조각들로 쪼개서, 그 조각들과만 겹치는지 본다. 파인
  // 자리는 애초에 조각이 없으니 겹침으로 잡히지 않아서 의자가 자연스럽게 그 안에 들어갈 수 있다.
  // 사각형·원형 등 원래 통짜인 모양은 조각이 하나뿐이라 예전과 완전히 똑같이 동작한다(회귀 없음).
  // (추가 버그 수정) "회의용 의자를 돌려서 원형테이블에 딱 붙이려는데 안 붙는다" 신고 — 위 수정은
  // 가만히 있는 "상대"만 정밀하게 봤을 뿐, 옮기는(끌리는) 쪽인 "나"는 여전히 항상 축에 나란한
  // 바깥 테두리(AABB)로만 봤다 — 그래서 "나"를 회전시켜 놓은 경우(이 신고처럼) 정작 옮기는 모형
  // 자신의 회전은 반영되지 않아 여전히 같은 잔상이 남았다. 이제 옮기는 모형이 90도 단위가 아닌
  // 자유 각도로 회전해 있으면(원은 회전해도 모양이 그대로라 항상 제외) rotatedRectCorners로 그
  // 실제 꼭짓점을 구해서 쓴다 — 축에 나란한 경우(0/90/180/270도)는 예전과 정확히 같은 네모
  // 꼭짓점이라 회귀가 없다.
  function resolveOverlap(xCm, yCm, widthCm, depthCm, rotation, isCircle, excludeId) {
    const excludeSet = new Set(Array.isArray(excludeId) ? excludeId : [excludeId]);
    const myRotDeg = isCircle ? 0 : Number(rotation) || 0;
    const { w: wCm, h: hCm } = rotatedAabbSize(widthCm, depthCm, myRotDeg);
    let x = xCm;
    let y = yCm;
    for (const other of placedItems) {
      if (excludeSet.has(other.id)) continue;
      const rotation2 = other.rotation != null ? other.rotation : other.rotated ? 90 : 0;
      const otherRects = worldSubRects(
        other.xCm,
        other.yCm,
        other.widthCm,
        other.depthCm,
        other.shapeType || "rect",
        other.notchWidthCm,
        other.notchDepthCm,
        rotation2,
        !!other.flipped
      );
      const myLeft = x;
      const myRight = x + wCm;
      const myTop = y;
      const myBottom = y + hCm;
      const myCorners =
        myRotDeg % 90 !== 0
          ? rotatedRectCorners(myLeft + wCm / 2, myTop + hCm / 2, widthCm, depthCm, myRotDeg)
          : [
              { x: myLeft, y: myTop },
              { x: myRight, y: myTop },
              { x: myRight, y: myBottom },
              { x: myLeft, y: myBottom },
            ];
      // 실제로 겹치는 조각들 중에서 "가장 적게 밀어내도 되는" 조각 하나를 골라 그 방향으로만 뺀다
      // (조각이 아예 안 겹치면 그 자리는 빈 자리이므로 무시한다). 먼저 바깥 테두리(AABB)로 빠르게
      // 겹칠 가능성이 있는지만 거르고(회전한 조각도 테두리 안에 실제 모양이 온전히 들어있어 안전한
      // 걸러내기다), 실제 겹침·밀어낼 방향과 거리는 satPush(분리축 정리)로 정밀하게 구한다 — 나와
      // 상대 둘 다 축에 나란하면(rotDeg 0) 예전 계산과 결과가 완전히 같고, 둘 중 하나라도 기울어져
      // 있으면 그 실제 모양의 꼭짓점까지 정확히 반영한다.
      let best = null;
      for (const r of otherRects) {
        const overlapX = Math.min(myRight, r.right) - Math.max(myLeft, r.left);
        const overlapY = Math.min(myBottom, r.bottom) - Math.max(myTop, r.top);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const push = satPush(myCorners, r.corners, myRotDeg, r.rotDeg || 0);
        if (!push) continue;
        if (!best || push.overlap < best.overlap) best = push;
      }
      if (best) {
        x += best.pushX;
        y += best.pushY;
      }
    }
    return { xCm: x, yCm: y };
  }

  // 자석 스냅 → 그래도 겹치면 밀어내기, 순서로 적용한다(최대 4번 반복해서 여러 모형에 연달아
  // 걸리는 경우도 웬만큼 처리한다). 마지막엔 배치판(공간) 밖으로 절대 넘어가지 않도록 가로·세로
  // 범위를 벽 안쪽으로 딱 고정한다(모형이 방보다 큰 극단적인 경우만 왼쪽·위쪽 벽에 맞춰둔다).
  // (버그 수정에 맞춰 시그니처 변경) "회의용 의자를 돌려서 원형테이블에 딱 붙이려는데 안 붙는다" 신고를
  // 고치면서, resolveOverlap이 옮기는 모형 자신의 회전까지 정확히 반영하려면 회전 전 원래 가로·세로
  // (widthCm/depthCm)와 회전값(rotation)이 그대로 필요해졌다 — 그래서 예전엔 호출하는 쪽에서 미리
  // rotatedAabbSize로 부풀린 wCm/hCm만 넘겨받았지만, 이제 원래 크기·회전값·원인지 여부(isCircle, 원은
  // 회전해도 모양이 그대로라 항상 제외)를 받아서 안에서 직접 rotatedAabbSize로 부풀린 크기를 구한다 —
  // 0/90/180/270도(또는 원)일 때는 결과가 예전과 완전히 같다(회귀 없음).
  function placeWithSnap(xCm, yCm, widthCm, depthCm, rotation, isCircle, excludeId) {
    const myRotDeg = isCircle ? 0 : Number(rotation) || 0;
    const { w: wCm, h: hCm } = rotatedAabbSize(widthCm, depthCm, myRotDeg);
    let { xCm: x, yCm: y } = snapPlacement(xCm, yCm, wCm, hCm, excludeId);
    for (let i = 0; i < 4; i++) {
      const resolved = resolveOverlap(x, y, widthCm, depthCm, rotation, isCircle, excludeId);
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
  // (placeWithSnap과 같은 이유로 시그니처가 원래 크기·회전값·isCircle을 받도록 바뀌었다 — 회귀 없음.)
  function moveWithClamp(xCm, yCm, widthCm, depthCm, rotation, isCircle, excludeId) {
    const myRotDeg = isCircle ? 0 : Number(rotation) || 0;
    const { w: wCm, h: hCm } = rotatedAabbSize(widthCm, depthCm, myRotDeg);
    let x = xCm;
    let y = yCm;
    for (let i = 0; i < 4; i++) {
      const resolved = resolveOverlap(x, y, widthCm, depthCm, rotation, isCircle, excludeId);
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
        const { w: wCm, h: hCm } = rotatedAabbSize(it.widthCm, it.depthCm, rotation);
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
      const { w: wCm, h: hCm } = rotatedAabbSize(m.widthCm, m.depthCm, rotation);
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
      const placed = placeWithSnap(rawX, rawY, widthCm, depthCm, 0, (shape.shape_type || "rect") === "circle", null);
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
        const placed = placeWithSnap(rawX, rawY, moving.widthCm, moving.depthCm, rotation, moving.shapeType === "circle", moving.id);
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

  // "가로든 세로든 제품들이 3개 이상 나란히 있을 때는 간격 동일하게" 요청 — 피그마·파워포인트의
  // "가로 간격 동일하게/세로 간격 동일하게"와 같은 방식. 3개 이상 고른 상태에서 누르면, 맨 처음(가장
  // 왼쪽 또는 위)과 맨 끝(가장 오른쪽 또는 아래) 모형은 그 자리에 그대로 두고, 그 사이 모형들만 옮겨서
  // 모형과 모형 사이의 "빈 간격"이 전부 똑같아지도록 다시 배치한다. 가로·세로 중 어느 쪽 버튼을 따로
  // 고를 필요 없이, 선택한 모형들이 가로로 더 넓게 퍼져 있으면 가로(x)로, 세로로 더 넓게 퍼져 있으면
  // 세로(y)로 알아서 맞춘다("가로든 세로든" 요청과 일치). 회전한 모형은 화면에 실제로 보이는(회전
  // 반영된) 가로·세로 크기를 기준으로 간격을 계산해야 진짜 빈 틈이 똑같아지므로, rotatedAabbSize로
  // 구한 값을 쓴다.
  function handleDistributeSelected() {
    if (selectedPlacedIds.size < 3) return;
    const entries = placedItems
      .filter((it) => selectedPlacedIds.has(it.id))
      .map((it) => {
        const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
        const aabb = rotatedAabbSize(it.widthCm, it.depthCm, rotation);
        return { it, w: aabb.w, h: aabb.h };
      });
    const spanX = Math.max(...entries.map((e) => e.it.xCm + e.w)) - Math.min(...entries.map((e) => e.it.xCm));
    const spanY = Math.max(...entries.map((e) => e.it.yCm + e.h)) - Math.min(...entries.map((e) => e.it.yCm));
    const horizontal = spanX >= spanY;
    const totalSpan = horizontal ? spanX : spanY;
    const sorted = [...entries].sort((a, b) => (horizontal ? a.it.xCm - b.it.xCm : a.it.yCm - b.it.yCm));
    const totalSize = sorted.reduce((sum, e) => sum + (horizontal ? e.w : e.h), 0);
    const gap = Math.max(0, (totalSpan - totalSize) / (sorted.length - 1));
    const updates = new Map();
    let cursor = (horizontal ? sorted[0].it.xCm : sorted[0].it.yCm) + (horizontal ? sorted[0].w : sorted[0].h) + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      const e = sorted[i];
      updates.set(e.it.id, cursor);
      cursor += (horizontal ? e.w : e.h) + gap;
    }
    if (updates.size === 0) return;
    setPlacedItems((prev) =>
      prev.map((it) => {
        if (!updates.has(it.id)) return it;
        const pos = updates.get(it.id);
        return horizontal ? { ...it, xCm: pos } : { ...it, yCm: pos };
      })
    );
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
        // "제품 클릭하면 동그라미 기능 넣어서 회전 자유자재로도" 요청으로 회전이 더 이상 항상 90도
        // 단위가 아닐 수 있게 됐다 — 동그라미 손잡이로 37도처럼 어중간한 각도로 돌려둔 채로 이
        // 버튼을 눌러도 "37+90=127도" 같은 어중간한 값이 되지 않도록, 먼저 가장 가까운 0/90/180/270
        // 중 하나로 스냅한 뒤 거기서 90도를 더한다(원래 90도 단위였을 때는 nearest90이 항상 current와
        // 같으므로 예전 동작 그대로다 — 회귀 없음).
        const nearest90 = (Math.round(current / 90) * 90) % 360;
        const nextRotation = (nearest90 + 90) % 360;
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
      // (버그 수정) "파티션 기본얇기 4.5로... 직접 입력하면 입력값으로 수정되게" 신고 — 손잡이로 끌 때도
      // 여기 있던 최소 10cm 제한 때문에 파티션처럼 10cm보다 얇은 모형은 그 밑으로 못 줄였다. 직접 입력
      // 칸(handleApplyManualSize)과 똑같이 0.1cm까지만 막고 나머지는 끄는 대로 그대로 반영한다.
      let newWidthCm = Math.max(0.1, drag.swapped ? drag.startWidthCm + dyCm : drag.startWidthCm + dxCm);
      let newDepthCm = Math.max(0.1, drag.swapped ? drag.startDepthCm + dxCm : drag.startDepthCm + dyCm);
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

  // "제품 클릭하면 동그라미 기능 넣어서 회전 자유자재로도 가능하게" 요청: 기존 회전 버튼(⟳)은 90도
  // 단위로만 딱딱 꺾이는데, 모형을 선택하면 그 위쪽에 작은 동그라미 손잡이가 나타나서(피그마·
  // 파워포인트 등에서 흔한 방식) 그걸 마우스로 끌면 임의의 각도로 자유롭게 돌릴 수 있다. 손잡이를
  // 누른 순간의 모형 중심(cm 기준, 그때 회전 상태의 바깥 테두리 기준)을 고정점으로 삼아, 그 뒤로는
  // 그 중심에서 마우스 커서까지의 각도만 계속 따라가며 rotation을 갱신한다 — 회전 중에도 모형의
  // 중심 위치는 항상 그대로 유지되어("중심을 축으로 돈다"는 자연스러운 느낌), 모서리가 방을 벗어나는
  // 등 예측 못 할 위치로 튀지 않는다. 다른 모형과의 충돌(밀어내기)은 드래그 도중엔 검사하지 않는다
  // (크기 조절 손잡이와 같은 방식 — 끌던 중에 갑자기 밀려나면 오히려 조작하기 어색하다).
  const rotateDragRef = useRef(null);
  useEffect(() => {
    function onRotateMove(e) {
      const drag = rotateDragRef.current;
      if (!drag || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const centerClientX = rect.left + drag.centerXCm * renderScale;
      const centerClientY = rect.top + drag.centerYCm * renderScale;
      const dxPx = e.clientX - centerClientX;
      const dyPx = e.clientY - centerClientY;
      // 손잡이가 원래 모형 정 위쪽에서 시작하므로, 마우스가 정 위쪽에 있을 때 0도가 되도록 표준
      // atan2(오른쪽 기준·시계방향)에서 축을 90도 돌려서 "위쪽 기준" 각도로 바꾼다.
      let deg = Math.round((Math.atan2(dxPx, -dyPx) * 180) / Math.PI);
      deg = ((deg % 360) + 360) % 360;
      const aabb = rotatedAabbSize(drag.widthCm, drag.depthCm, deg);
      const maxX = Math.max(0, spaceWidthM * 100 - aabb.w);
      const maxY = Math.max(0, spaceDepthM * 100 - aabb.h);
      const newXCm = Math.min(Math.max(0, drag.centerXCm - aabb.w / 2), maxX);
      const newYCm = Math.min(Math.max(0, drag.centerYCm - aabb.h / 2), maxY);
      setPlacedItems((prev) => prev.map((it) => (it.id === drag.id ? { ...it, rotation: deg, xCm: newXCm, yCm: newYCm } : it)));
    }
    function onRotateUp() {
      rotateDragRef.current = null;
    }
    window.addEventListener("mousemove", onRotateMove);
    window.addEventListener("mouseup", onRotateUp);
    return () => {
      window.removeEventListener("mousemove", onRotateMove);
      window.removeEventListener("mouseup", onRotateUp);
    };
  }, [renderScale, spaceWidthM, spaceDepthM]);

  function startRotatePlaced(it) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
      const aabb = rotatedAabbSize(it.widthCm, it.depthCm, rotation);
      rotateDragRef.current = {
        id: it.id,
        widthCm: it.widthCm,
        depthCm: it.depthCm,
        centerXCm: it.xCm + aabb.w / 2,
        centerYCm: it.yCm + aabb.h / 2,
      };
    };
  }

  // "모든 품목 가로/세로 사이즈 넣을 수 있는 칸을 만들어줘(적용버튼)" 요청으로 추가된 기능. 손잡이를
  // 마우스로 끌어서 크기를 조절하는 것 말고도, 정확한 숫자를 직접 입력해서 한 번에 맞출 수 있게
  // 한다. 딱 하나만 선택했을 때만 의미가 있으므로(여러 개를 한꺼번에 선택했을 때는 "가로·세로"가
  // 하나로 정해지지 않는다) selectedSingleItem이 있을 때만 입력칸이 보인다.
  const selectedSingleItem = selectedPlacedIds.size === 1 ? placedItems.find((it) => selectedPlacedIds.has(it.id)) || null : null;
  const [manualWidthInput, setManualWidthInput] = useState("");
  const [manualDepthInput, setManualDepthInput] = useState("");
  // "도형 클릭 후 이름 수정할 수 있게 해주고" 요청으로 추가. 배치판 위 이름표에는 규격(가로×세로)만
  // 짧게 보이지만(윗 주석 참고), 모형 하나하나마다 자기만의 이름(예: "박대표 책상", "3층 회의실 A")을
  // 붙여두면 title(마우스 올리면 뜨는 말풍선)·저장된 배치 데이터에서 구분하기 편하다.
  const [manualNameInput, setManualNameInput] = useState("");
  // 선택이 "다른 모형으로" 바뀔 때만 입력칸을 그 모형의 현재 크기·이름으로 다시 채운다(id 기준) —
  // 입력하는 도중에 같은 모형의 다른 값(예: 드래그로 살짝 움직인 좌표) 때문에 타이핑 중인 값이
  // 지워지지 않게.
  const selectedSingleItemId = selectedSingleItem?.id ?? null;
  useEffect(() => {
    if (selectedSingleItem) {
      setManualWidthInput(String(selectedSingleItem.widthCm));
      setManualDepthInput(String(selectedSingleItem.depthCm));
      setManualNameInput(selectedSingleItem.name || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSingleItemId]);

  // 선택한 모형 하나의 이름만 바꾼다(가로·세로 크기는 그대로 둠). 빈 칸으로 지우고 적용하면 원래
  // 이름으로 되돌린다(이름이 아예 없어지면 나중에 혼란스러우므로).
  function handleApplyManualName() {
    if (!selectedSingleItem) return;
    const it = selectedSingleItem;
    const trimmed = manualNameInput.trim();
    const newName = trimmed || it.name;
    setPlacedItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, name: newName } : p)));
    setManualNameInput(newName);
  }

  function handleApplyManualSize() {
    if (!selectedSingleItem) return;
    const it = selectedSingleItem;
    const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
    const swapped = rotation === 90 || rotation === 270;
    // (버그 수정) "파티션 기본얇기 4.5로... 4라고 치고 입력해도 자동으로 10으로 됨" 신고 — 여기 있던
    // Math.max(10, ...)이 직접 입력한 값을 무조건 최소 10cm로 밀어올려서, 파티션처럼 원래 10cm보다
    // 얇은(예: 4.5cm, 실제 "45T" 파티션 두께) 값을 입력해도 그대로 반영되지 않고 10으로 바뀌어버렸다.
    // 직접 입력은 "정확히 이 숫자로 맞추기"가 목적이므로, 0이나 음수처럼 아예 말이 안 되는 값만
    // 걸러내고(최소 0.1cm) 나머지는 입력한 값 그대로 쓴다.
    let newWidthCm = Math.max(0.1, Number(manualWidthInput) || it.widthCm);
    let newDepthCm = Math.max(0.1, Number(manualDepthInput) || it.depthCm);
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
          const { w: wCm, h: hCm } = rotatedAabbSize(src.widthCm, src.depthCm, rotation);
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
      // "배치 후에 키보드로 움직이는거 미세조정 가능하게 0.1cm 단위로" 요청: 기존 방향키(5cm)·
      // Shift+방향키(20cm, 더 크게) 두 단계에, Ctrl(⌘)+방향키를 0.1cm 단위의 아주 미세한 조정용으로
      // 새로 추가했다. Ctrl은 다른 곳(복사·붙여넣기, 마퀴에 더하기)에서 이미 쓰고 있지만 방향키와는
      // 겹치지 않아 새로 써도 안전하다.
      const step = e.ctrlKey || e.metaKey ? 0.1 : e.shiftKey ? 20 : 5;
      // 0.1cm처럼 소수 단위로 계속 더하다 보면 부동소수점 오차가 쌓일 수 있어(예: 0.1+0.1+0.1 =
      // 0.30000000000000004), 실제로 적용하는 좌표는 항상 소수 첫째 자리로 반올림해서 깔끔하게 유지한다.
      const round1 = (v) => Math.round(v * 10) / 10;
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
          const placed = moveWithClamp(round1(it.xCm + dx), round1(it.yCm + dy), it.widthCm, it.depthCm, rotation, it.shapeType === "circle", it.id);
          setPlacedItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, xCm: round1(placed.xCm), yCm: round1(placed.yCm) } : p)));
          return;
        }
      }
      const anyItem = placedItems.find((p) => selectedPlacedIds.has(p.id));
      if (!anyItem) return;
      const memberIds = getMoveGroupIds(anyItem);
      const { dx: cdx, dy: cdy } = clampGroupDelta(memberIds, dx, dy);
      setPlacedItems((prev) => prev.map((p) => (memberIds.includes(p.id) ? { ...p, xCm: round1(p.xCm + cdx), yCm: round1(p.yCm + cdy) } : p)));
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
      const { w: wCm, h: hCm } = rotatedAabbSize(it.widthCm, it.depthCm, rotation);
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

  // "줄자는 처음 찍었던 점에서 동서남북(가로·세로) 직선으로만 움직이게" 요청대로, 두 번째 점은 첫
  // 점 기준으로 대각선이 되지 않게 보정한다 — 첫 점에서 가로로 더 많이 움직였으면 세로 좌표를 첫
  // 점과 똑같이 맞추고(완전히 가로선), 세로로 더 많이 움직였으면 가로 좌표를 첫 점과 똑같이 맞춘다
  // (완전히 세로선). "줄자 좀 섹시하게 편하게" 요청으로 이 계산을 별도 함수로 빼서, 실제로 찍히는
  // 점(addRulerPoint)과 찍기 전에 미리 보여주는 점선 미리보기(rulerPreviewPoint)가 항상 똑같은
  // 자리를 가리키게 한다(미리보기랑 실제로 찍히는 자리가 다르면 더 헷갈리므로).
  function axisConstrainedSecondPoint(first, xCm, yCm) {
    const dx = Math.abs(xCm - first.xCm);
    const dy = Math.abs(yCm - first.yCm);
    return dx >= dy ? { xCm, yCm: first.yCm } : { xCm: first.xCm, yCm };
  }
  // 줄자 점을 하나 추가한다. 세 번째 클릭부터는(이미 두 점이 있으면) 이전 측정을 지우고 그 자리를 새
  // 첫 점으로 삼아 다시 잰다(기존 동작 그대로).
  function addRulerPoint(xCm, yCm) {
    setRulerPoints((prev) => {
      if (prev.length === 1) {
        return [prev[0], axisConstrainedSecondPoint(prev[0], xCm, yCm)];
      }
      return prev.length >= 2 ? [{ xCm, yCm }] : [...prev, { xCm, yCm }];
    });
  }
  // "줄자 좀 섹시하게 편하게 안될까" 요청: 첫 점을 찍은 뒤 클릭을 두 번째로 또 하기 전에도, 지금
  // 마우스가 어디 있는지에 따라 두 번째 점이 어디에 찍힐지(끝점에 딱 붙는 것까지 포함해서) 점선으로
  // 미리 보여준다 — 실제로 클릭 한 번 안 해도 눈으로 재보면서 딱 맞는 자리를 찾을 수 있어서 훨씬
  // 편하다. hoverCm(실시간 마우스 좌표)에 nearestSnapPoint(끝점 인식)·axisConstrainedSecondPoint(가로·
  // 세로 직선 보정)를 똑같이 적용해서, 이 미리보기가 실제로 클릭했을 때 찍히는 자리와 항상 일치한다.
  const rulerPreviewPoint = useMemo(() => {
    if (!rulerMode || rulerPoints.length !== 1 || !hoverCm) return null;
    const snapped = nearestSnapPoint(hoverCm.xCm, hoverCm.yCm);
    const raw = snapped || hoverCm;
    return axisConstrainedSecondPoint(rulerPoints[0], raw.xCm, raw.yCm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulerMode, rulerPoints, hoverCm, rulerSnapPoints, renderScale]);
  const rulerPreviewDistanceCm = rulerPreviewPoint
    ? Math.hypot(rulerPreviewPoint.xCm - rulerPoints[0].xCm, rulerPreviewPoint.yCm - rulerPoints[0].yCm)
    : null;
  // 지금 마우스(hoverCm)가 어떤 끝점에 딱 붙을지(끝점 인식) 미리 알 수 있게, 그 점만 도드라지게
  // 표시하기 위한 값 — 줄자 모드에서 두 점 다 아직 안 찍혔을 때, 또는 두 번째 점을 찍기 전에 모두
  // 쓰인다(첫 점 찍을 때도, 두 번째 점 찍을 때도 "어디에 붙을지" 미리 보이면 편하다).
  const rulerActiveSnapPoint = rulerMode && hoverCm && rulerPoints.length < 2 ? nearestSnapPoint(hoverCm.xCm, hoverCm.yCm) : null;

  // 회전된 상태(swapped)까지 반영해서, 화면에 실제로 보이는 모형의 사각 범위(cm)를 구한다 — 마퀴
  // 선택에서 "이 범위 안에 걸리는 모형"을 판단할 때 쓴다.
  function itemOnScreenBox(it) {
    const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
    const { w: wCm, h: hCm } = rotatedAabbSize(it.widthCm, it.depthCm, rotation);
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
        // ("줄자 좀 섹시하게 편하게" 요청) 예전엔 여기서 항상 "누르기 시작한 자리"(drag.startXCm/Y)에
        // 점을 찍었는데, 그러면 손을 눌러서 드래그하듯 끌고 가서 놓아도 실제로는 "누른 순간"의 자리에
        // 찍혀서 "끌어서 재는" 동작이 안 됐다. 이제는 hoverCm(실시간 마우스 좌표 — 손을 뗀 그 자리까지
        // 계속 갱신됨)을 우선 쓰고, 무슨 이유로든 없으면 예전처럼 시작 자리를 그대로 쓴다 — 이러면
        // 가만히 클릭만 해도(hoverCm ≈ 시작 자리라 결과가 똑같음), 눌러서 끌고 가서 놓아도(hoverCm이
        // 놓은 자리를 가리킴) 둘 다 자연스럽게 동작하고, 위에서 보여주는 점선 미리보기(rulerPreviewPoint)
        // 랑도 항상 같은 자리를 가리킨다.
        if (rulerMode) {
          const raw = hoverCmRef.current || { xCm: drag.startXCm, yCm: drag.startYCm };
          const snapped = nearestSnapPoint(raw.xCm, raw.yCm);
          const xCm = snapped ? snapped.xCm : raw.xCm;
          const yCm = snapped ? snapped.yCm : raw.yCm;
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

  // "줄자로 재고 마우스 우클릭을 누르면 재어진 상태가 화면에 그대로 남고, 커서는 다시 자유롭게
  // 움직이는 원래 상태로 돌아가서 다른 가구를 또 배치할 수 있게" 요청. 두 점을 다 찍어 거리가 이미
  // 표시된 상태에서 캔버스를 오른쪽 클릭하면, 그 측정 결과(선·점·거리 말풍선)는 지우지 않고 그대로
  // 화면에 남겨둔 채(줄자 지우기는 여전히 위 "줄자 지우기" 버튼으로 따로 처리) 줄자 모드만 꺼서, 마우스가
  // 곧바로 모형을 선택·이동·배치하는 원래 동작으로 돌아간다(줄자 버튼을 다시 눌러 끄는 것과 동일한
  // 효과). 아직 점을 하나도 안 찍었거나 한 점만 찍은 상태에서는(측정이 끝나지 않았으므로) 브라우저의
  // 기본 우클릭 메뉴만 막고, 줄자 모드 자체는 그대로 켜둔다.
  function handleCanvasContextMenu(e) {
    if (!rulerMode) return;
    e.preventDefault();
    if (rulerPoints.length === 2) setRulerMode(false);
  }

  const rulerDistanceCm =
    rulerPoints.length === 2 ? Math.hypot(rulerPoints[1].xCm - rulerPoints[0].xCm, rulerPoints[1].yCm - rulerPoints[0].yCm) : null;

  // (2026-09-30 미세조정) "줄자 기능을 조금만 더 실용적으로" 요청 — 다 잰 거리를 굳이 손으로 다시
  // 타이핑하지 않고 그대로 복사해서 메모·견적서 등에 붙여넣을 수 있게 했다. 캔버스 위 말풍선과 똑같은
  // 형식(100cm 넘으면 "1.18m (118cm)", 안 넘으면 "83.0cm")으로 복사한다.
  function handleCopyRulerDistance() {
    if (rulerDistanceCm == null) return;
    const text = rulerDistanceCm >= 100 ? `${(rulerDistanceCm / 100).toFixed(2)}m (${rulerDistanceCm.toFixed(0)}cm)` : `${rulerDistanceCm.toFixed(1)}cm`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setRulerCopied(true);
    setTimeout(() => setRulerCopied(false), 1500);
  }

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
    // (버그 수정) "저장된 배치안 삭제가 반영이 안 됨" 신고 — 사진 라이브러리 "수정" 때와 똑같은 원인
    // (Supabase RLS)이었다. .delete()만 쓰면 삭제 권한 규칙이 막아도 오류 없이 조용히 0건만 지워지고
    // 끝나버려서(에러가 안 나니 "성공"으로 착각), 지워진 줄 알고 다시 목록을 불러오면 그대로 남아있는
    // 것처럼 보인다. .delete() 뒤에 .select()를 붙여 실제로 몇 건이 지워졌는지 확인하고, 0건이면
    // 명확하게 알려준다.
    const { data, error } = await supabase.from("layout_boards").delete().eq("id", id).select();
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("삭제가 반영되지 않았어요. Supabase에 layout_boards \"삭제(delete)\" 권한 규칙이 아직 없거나 다른 상태일 수 있어요. layout_sim_setup.sql을 Supabase SQL Editor에서 다시 실행해주세요.");
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
              // (버그 수정) "전체보기 눌렀더니 화면이 미친듯이 떤다" 신고 — 대지가 화면에 딱 맞춰지도록
              // 세로 여백을 실측(groundTopPx)해서 남는 공간이 거의 0에 가깝게 딱 맞춰놓다 보니, 아주
              // 살짝만 넘쳐도(운영체제·브라우저에 따라 세로 스크롤바가 실제로 폭을 차지하는 경우) 이
              // 세로 스크롤바가 나타났다 사라졌다 했다. 스크롤바가 나타나면 이 칸의 실제 가로 폭이 그만큼
              // 줄어드는데, 그 폭을 그대로 재서 쓰는 배치판 가로 크기(canvasColWidthPx)·안내문구 줄바꿈이
              // 따라 바뀌고, 그 바뀐 폭 때문에 대지 위 내용 높이(groundTopPx)까지 달라져서 다시 스크롤이
              // 필요 없어지고 → 스크롤바가 사라지고 → 폭이 다시 늘어나고 → 다시 스크롤이 필요해지는 식으로
              // 무한히 반복되며 화면이 떠는 것이었다(스크롤바가 나타나고 사라질 때마다 폭이 바뀌는 게
              // 근본 원인). 세로 스크롤바가 필요하든 아니든 그 자리를 항상 미리 비워두면(overflowY:
              // "scroll"), 스크롤바가 생기고 없어지면서 폭이 오락가락하는 일 자체가 없어져서 이 진동이
              // 완전히 사라진다 — 평소엔(스크롤이 필요 없을 때) 그 자리가 그냥 빈 여백처럼 보일 뿐이다.
              overflowY: "scroll",
              overflowX: "auto",
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
          /* (2026-09-30 버그 수정) "네모책상은 왜 색상이 비어있느냐" 신고 — ㄱ자·U자·원형 등은 색이 SVG의
             fill 속성(도형 자체를 색칠하는 방식)으로 칠해져 있어 인쇄에도 그대로 나왔지만, 평범한 사각형
             모형만 CSS의 background 속성으로 색을 칠하고 있었다. 브라우저는 인쇄(PDF 저장 포함) 시
             기본적으로 이런 배경색을 "배경 그래픽"으로 보고 생략해버려서(인쇄 대화상자의 "배경 그래픽"
             체크박스를 직접 켜야만 보임) 사각형만 유독 색이 빠진 채 테두리만 찍혀 나왔던 것이다.
             인쇄 영역 전체에 배경색을 항상 그대로 찍도록 강제해서, 사용자가 그 체크박스를 켜지 않아도
             모든 모형이 화면에서 보이는 색 그대로 인쇄되게 했다. */
          #layoutsim-print-area, #layoutsim-print-area * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
        /* 배치판 위 모형을 마우스로 가리키면 살짝 떠 보이도록(elevation) 그림자를 키워서, 지금 어떤
           모형 위에 있는지 더 또렷하게 느껴지게 한다. 이미 선택된 모형은 선택 강조(보라색 테두리+글로우)가
           우선이라 이 hover 그림자를 덮어 그대로 유지한다.
           (버그 수정) "동그라미 주위로 네모박스의 희미한 잔상이 안보이니?" / "누끼가 정확하게 안 따졌다"
           신고 — 위 인라인 스타일(boxShadow/shapeSvgStyle)에서 원·의자류는 이미 실제 모양(SVG)에 그림자를
           주도록 고쳤는데, 이 hover 전용 CSS 규칙(!important)이 인라인 스타일보다 우선순위가 높아서
           마우스를 올리기만 해도 바깥 네모 박스에 그림자가 다시 씌워지며 귀퉁이에 네모 잔상이 그대로
           재현됐다. 그래서 원·의자류(layoutsim-placed-item--nonrect)는 이 규칙에서 빼고, 대신 그 안의
           실제 모양(svg)에다 같은 값의 그림자를 줘서 hover 때도 늘 진짜 윤곽만 떠 보이게 했다.
           사각형·ㄱ자·U자처럼 바깥 박스와 모양이 일치하는(또는 파인 부분까지 포함해 일부러 통짜 박스로
           보여주는) 경우는 예전 그대로 바깥 박스에 그림자를 준다(회귀 없음). */
        .layoutsim-placed-item:not(.layoutsim-placed-item--nonrect):hover {
          box-shadow: 0 3px 8px rgba(28, 43, 58, 0.22) !important;
        }
        .layoutsim-placed-item.layoutsim-placed-item--selected:not(.layoutsim-placed-item--nonrect):hover {
          box-shadow: 0 0 0 5px rgba(91, 79, 229, 0.16), 0 3px 8px rgba(28, 43, 58, 0.26) !important;
        }
        /* (2026-09-30 재확인) "깎아내거나 파인 부분만 유독 진하게 보인다"는 신고가 위 평소(resting)
           상태 수정 후에도 안 없어져서, 배포된 실제 화면을 직접 열어 번들 코드를 확인해봤다 — 평소
           상태(shapeSvgStyle)는 이미 그림자가 "none"으로 잘 빠져있었는데, 바로 아래 이 hover 전용 CSS
           규칙(!important)이 따로 남아있어서 마우스를 얹기만 하면 방향(0 3px, 아래로 치우침) 있는
           그림자가 인라인 스타일을 덮어쓰며 그대로 되살아났다 — 화면을 스크린샷할 때 마우스가 모형
           위에 있으면 바로 이 경로로 재현된다. 평소 상태를 고칠 때와 같은 이유로, hover 때 살짝
           떠 보이게 하는 그림자도 방향을 없애 사방으로 고르게 퍼지게 바꿔서 곡선·파인 모서리에서도
           절대 두꺼워 보이지 않게 했다. */
        .layoutsim-placed-item--nonrect:hover svg {
          filter: drop-shadow(0 0 3px rgba(28, 43, 58, 0.35)) !important;
        }
        .layoutsim-placed-item--nonrect.layoutsim-placed-item--selected:hover svg {
          filter: drop-shadow(0 0 4px rgba(91, 79, 229, 0.6)) drop-shadow(0 0 3px rgba(28, 43, 58, 0.35)) !important;
        }
      `}</style>
      {/* (2026-09-30 미세조정) "글씨도 많고 디자인이 중구난방"이라는 피드백으로, 안내문구를 화면에
          항상 길게 펼쳐두는 대신 한 줄로 줄이고, 자세한 설명은 옆 ⓘ 아이콘에 마우스를 올리면(title)
          그대로 볼 수 있게 옮겼다 — 정보는 그대로 남기되 화면이 덜 복잡해 보이게 했다. */}
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>가구배치(시뮬레이션)</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16, display: "flex", alignItems: "center", gap: 5 }}>
        <span>공간 크기를 입력하고 왼쪽 모형 목록에서 끌어다 놓아보세요.</span>
        <span
          title="처음 쓰는 모형은 가로·세로 크기(cm)를 한 번 등록해두면 다음부터 목록에 계속 남아있어요. 배치가 마음에 들면 이름을 붙여 저장해두고 나중에 다시 불러올 수 있어요."
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, borderRadius: "50%", border: `1px solid ${C.line}`, color: C.muted, fontSize: 10, cursor: "help", flexShrink: 0 }}
        >
          ⓘ
        </span>
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
        {/* (2026-09-30 미세조정) "공간가로·공간세로 바로 옆에 같은 높이로 배치판 만들기가 있어야 한다"는
            요청 — 이 줄은 Field(라벨+입력창, 아래쪽에 marginBottom:16 여백 포함)와 버튼들을 alignItems:
            "flex-end"로 나란히 맞추고 있는데, 버튼은 그 16px 여백이 없다 보니 Field보다 16px 아래로
            처져 보였다(정렬 기준이 "바깥 테두리"라, Field 쪽만 여백만큼 더 내려가 있던 것). 버튼들을
            Field와 똑같은 marginBottom:16짜리 div로 한 번 감싸서, 실제 버튼과 입력창의 아랫변이 정확히
            같은 줄에 맞도록 했다(버튼 자체 크기·기능은 그대로). */}
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleCreateSpace} style={primaryBtnStyle2}>배치판 만들기</button>
        </div>
        <div style={{ flex: 1, minWidth: 8 }} />
        <Field label="배치 이름">
          <input
            style={{ ...inputStyle, width: 160 }}
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            placeholder="예: 쌍령공원 2단지"
          />
        </Field>
        <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
          <button onClick={handleSaveBoard} disabled={savingBoard} style={miniBtnStylePrimary}>
            {savingBoard ? "저장 중…" : currentBoardId ? "배치 저장(덮어쓰기)" : "배치 저장"}
          </button>
          <button onClick={handleClearBoard} style={ghostBtnStyle}>새로 만들기</button>
          <button onClick={() => window.print()} style={ghostBtnStyle} title="배치판만 인쇄하거나 PDF로 저장해요(인쇄 대화상자에서 '대상'을 PDF로 저장으로 바꾸면 됩니다)">
            PDF로 출력
          </button>
        </div>
      </div>

      {/* (2026-10-01 변경) "공간활용이 아쉽다 — 대지(검은 테두리 배치판 포함) 부분이 전체적으로 더 위로
          올라왔으면" 요청으로, 예전엔 따로따로 한 줄씩 차지하던 "저장된 배치안" 줄과(오른쪽 칸 맨 위에
          있던) "공간 WxH + 줄자·도면업로드·격자·확대축소·전체보기" 도구모음 줄을 한 줄로 합쳤다 —
          저장된 배치안이 없을 때 저 도구모음 줄 오른쪽 절반이 거의 비어있던 공간을 그대로 쓰는 것이다.
          버튼의 기능·동작·순서는 전혀 바뀌지 않았고 화면에 그려지는 위치(한 줄 위로)만 바뀌었다 — 그
          결과 오른쪽 칸(대지가 있는 곳)이 이 통합된 줄 바로 아래에서 곧장 시작해서, 왼쪽 "모형 목록"
          패널 맨 위와 거의 같은 높이에서 시작한다. "저장된 배치안"이 하나도 없을 때도 도구모음은 항상
          있어야 하므로, 이 줄 자체는 이제 boards.length 조건 없이 항상 그려진다(안엔 저장된 배치안이
          있을 때만 그 chip들이 보인다). */}
      <div className="layoutsim-no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: C.muted, flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {boards.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>저장된 배치안:</span>
              {boards.map((b) => (
                <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
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
                </span>
              ))}
            </div>
          )}
          {/* (2026-09-30 미세조정) "글씨도 많고 중구난방" 피드백으로, 조작법 전체를 항상 펼쳐두는 대신
              한 줄(공간 크기)만 보여주고 자세한 조작법은 옆 ⓘ에 마우스를 올리면 그대로 볼 수 있게
              옮겼다. */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span>공간 {spaceWidthM}m × {spaceDepthM}m</span>
            <span
              title="모형을 끌어다 놓거나, 이미 놓은 모형을 끌어서 옮겨보세요. 모형을 클릭하면 선택되고(테두리 강조), 빈 곳을 끌면 여러 개를 한꺼번에 선택할 수 있어요(Ctrl+끌면 기존 선택에 더하기). 방향키로 세밀하게 옮기고(Shift+방향키는 더 크게, Ctrl+방향키는 0.1cm 단위로 아주 정밀하게), Ctrl+C/Ctrl+V로 복사·붙여넣기도 할 수 있어요. 마우스 휠로 확대·축소할 수 있고, Shift를 누른 채 끌면 화면을 자유롭게 이동할 수 있어요."
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, borderRadius: "50%", border: `1px solid ${C.lineSoft}`, color: C.muted, fontSize: 10, cursor: "help", flexShrink: 0 }}
            >
              ⓘ
            </span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <button
            onClick={() => setRulerMode((v) => !v)}
            title="캔버스를 두 번 클릭하거나, 누른 채로 끌었다 놓아서 두 지점 사이 거리를 재보세요(실시간 미리보기)"
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
          {/* (2026-09-30 미세조정) "줄자 옆에 좌표체킹 하는 부분 없애주고" 요청으로, 마우스 위치의
              cm 좌표(→ 389.0cm, 130.7cm)를 실시간으로 보여주던 부분을 없앴다 — 실제로 잰 거리
              자체는 캔버스 위 빨간 말풍선(📏 1.18m)에 그대로 나오니 정보 손실은 없다. 대신
              "줄자 기능을 조금 더 실용적으로" 요청에 맞춰, 다 잰 거리를 한 번에 복사해서 메모·견적서
              등에 바로 붙여넣을 수 있는 "복사" 버튼을 추가했다. */}
          {rulerDistanceCm != null && (
            <button
              onClick={handleCopyRulerDistance}
              title="방금 잰 거리를 복사해요(메모·견적서 등에 바로 붙여넣기)"
              style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}
            >
              {rulerCopied ? "복사됨 ✓" : "📋 거리 복사"}
            </button>
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
          {/* "카테고리 잘못 설정해도 수정해서 원하는 카테고리에 넣을 수 있게" 요청으로 추가한, 카탈로그
              이름 수정칸에서 쓰는 카테고리 자동완성 목록(모형 목록 전체에서 딱 한 번만 그림). */}
          <datalist id="layoutsim-category-datalist">
            {categoryNames.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
          <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>+ 새 모형 추가</div>
            <input
              style={{ ...smallInputStyle, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
              placeholder="모형 이름 (예: 탑책상, ㄱ자 퍼즐책상)"
              value={newShapeName}
              onChange={(e) => setNewShapeName(e.target.value)}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              {/* "U자·한쪽둥근"은 새로 추가하는 화면에서는 여전히 고를 수 없다(예전 요청: "새 모형 추가에서
                  ㄱ자 U자 한쪽둥근 없애주고"). 다만 "ㄱ자 퍼즐책상은 메뉴에도 위 모양대로" 요청으로 ㄱ자는
                  다시 고를 수 있게 되돌렸다(어느 모서리가 파였는지는 아래 모서리 아이콘으로 고른다).
                  예전에 이미 U자·한쪽둥근으로 등록해둔 모형·배치판은 그대로 남아있고 화면에도 그대로
                  나오므로(isPoly/isRoundEnd 렌더 로직은 그대로 둠), 기존 데이터에는 영향이 없다.
                  "(캐드형)"이라는 표기도 사무의자·회의의자 둘 다 없앴다(요청: "(캐드형)이라는 글자 없애주고").
                  "곡선ㄱ자"도 한 번 추가됐다가 "곡선ㄱ자 없애줘" 요청으로 다시 뺐다 — U자·한쪽둥근과
                  똑같이 이미 이걸로 등록해둔 모형이 있으면 그대로 남아있고 렌더 로직(isCurvedL)도
                  그대로 두어서 기존 데이터에는 영향이 없다. */}
              {[
                { key: "rect", label: "사각형" },
                { key: "l", label: "ㄱ자" },
                { key: "circle", label: "원형" },
                { key: "chair", label: "사무의자" },
                { key: "meetingchair", label: "회의의자" },
                { key: "sofa", label: "쇼파" },
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
              {/* "소수점까지 인식되게 해줘" 요청 — 새로 등록하는 모형의 가로·세로·파인 크기도 0.1cm
                  단위 소수점을 자연스럽게 입력할 수 있게 step을 맞췄다(예: 파티션 두께 4.5cm). */}
              <input
                type="number"
                step="0.1"
                style={{ ...smallInputStyle, width: "50%", boxSizing: "border-box" }}
                placeholder="전체 가로(cm)"
                value={newShapeWidth}
                onChange={(e) => setNewShapeWidth(e.target.value)}
              />
              <input
                type="number"
                step="0.1"
                style={{ ...smallInputStyle, width: "50%", boxSizing: "border-box" }}
                placeholder="전체 세로(cm)"
                value={newShapeDepth}
                onChange={(e) => setNewShapeDepth(e.target.value)}
              />
            </div>
            {(newShapeType === "l" || newShapeType === "curvedl" || newShapeType === "u") && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  {newShapeType === "l" || newShapeType === "curvedl" ? "잘려나간 모서리 크기(cm)" : "안쪽 파인 부분 크기(cm)"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    step="0.1"
                    style={{ ...smallInputStyle, width: "50%", boxSizing: "border-box" }}
                    placeholder="가로(cm)"
                    value={newShapeNotchWidth}
                    onChange={(e) => setNewShapeNotchWidth(e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.1"
                    style={{ ...smallInputStyle, width: "50%", boxSizing: "border-box" }}
                    placeholder="세로(cm)"
                    value={newShapeNotchDepth}
                    onChange={(e) => setNewShapeNotchDepth(e.target.value)}
                  />
                </div>
              </div>
            )}
            {/* "ㄱ자 퍼즐책상이 메뉴에 뒤집어져 있다" 요청으로 추가한 모서리 선택 — 잘려나간 모서리가
                네 곳 중 어디인지 부호를 몰라도 아이콘만 보고 그대로 고를 수 있게 한다(고른 값은
                handleAddShape에서 notch_width_cm/notch_depth_cm의 부호로 바뀌어 저장됨). 미니 아이콘은
                24×24 정사각형에서 한쪽 모서리가 파인 모양을 그대로 그려서, 실제 결과와 똑같이 보인다.
                "ㄱ자에서 왼쪽2개 없애주고(오른쪽 위, 왼쪽 위)" 요청으로 실제로 쓰는 "아래쪽이 파인"
                두 가지(오른쪽 아래·왼쪽 아래)만 남기고 위쪽 두 가지는 뺐다 — handleAddShape의 부호
                계산 로직은 그대로라 예전에 위쪽이 파인 걸로 이미 등록해둔 모형은 계속 그대로 보인다. */}
            {(newShapeType === "l" || newShapeType === "curvedl") && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>어느 모서리가 파였나요?</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { key: "br", label: "오른쪽 아래", points: "0,0 24,0 24,16 16,16 16,24 0,24" },
                    { key: "bl", label: "왼쪽 아래", points: "0,0 24,0 24,24 8,24 8,16 0,16" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setNewShapeCutCorner(opt.key)}
                      title={opt.label}
                      style={{
                        ...miniBtnStyle,
                        flex: 1,
                        padding: 4,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        background: newShapeCutCorner === opt.key ? C.purpleBg : "transparent",
                        borderColor: newShapeCutCorner === opt.key ? C.purple : C.lineSoft,
                      }}
                    >
                      <svg width={22} height={22} viewBox="0 0 24 24">
                        <polygon points={opt.points} fill={newShapeCutCorner === opt.key ? C.purple : C.lineSoft} />
                      </svg>
                      <span style={{ fontSize: 9.5, color: newShapeCutCorner === opt.key ? C.purple : C.muted }}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* 카테고리는 기존 목록에서 골라도 되고(자동완성), 새 이름을 직접 입력해도 된다. 비워두면 "기타"로 등록. */}
            <input
              style={{ ...smallInputStyle, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
              placeholder="카테고리 (예: 책상류, 테이블류 — 비워두면 기타)"
              value={newShapeCategory}
              onChange={(e) => setNewShapeCategory(e.target.value)}
              onFocus={() => {
                // 위 카테고리 수정칸과 같은 이유 — 이미 글자가 입력돼 있으면 datalist가 그 글자를
                // 포함하는 카테고리로만 걸러져 전체 목록이 다 안 보였다. 포커스 시 잠깐 비워서
                // 전체 카테고리가 다 뜨게 하고, 그대로 포커스를 벗어나면 원래 값으로 되돌린다.
                newShapeCategoryPrevRef.current = newShapeCategory;
                setNewShapeCategory("");
              }}
              onBlur={() => {
                setNewShapeCategory((cur) => (cur ? cur : newShapeCategoryPrevRef.current || ""));
              }}
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
          {/* (2026-10-01 변경) "공간 WxH + 줄자·도면업로드·격자·확대축소·전체보기" 도구모음은 더 이상
              여기(오른쪽 칸 맨 위)에서 별도로 한 줄을 차지하지 않는다 — "대지가 더 위로 올라왔으면"
              요청으로 "저장된 배치안" 줄과 한 줄로 합쳐서 그 위(모형 목록/배치판 두 칸으로 나뉘기 전)로
              옮겼다. 버튼들의 기능·동작은 전혀 바뀌지 않았고 그려지는 위치만 바뀌었다 — 자세한 경위는
              그 통합된 줄 바로 위 주석 참고. 그 결과 이 칸(canvasColRef)은 인쇄용 숨김 제목 바로 다음
              "대지" 박스로 곧장 이어진다. */}
          {/* (예전엔 선택 도구모음을 배치판 "위"에 별도 줄로 두고, 선택 여부에 따라 minHeight+
              visibility로 자리만 차지한 채 숨겼었다. 그런데 그렇게 하면 선택된 게 하나도 없을 때도
              그 줄의 자리(높이)가 항상 예약돼 있어서, 배치판이 그 예약된 높이만큼 아래로 내려와
              보이는 문제가 있었다("배치표 내려와 있다"는 신고). 배치판을 정말로 "위에 고정"시키려면
              그 줄 자체가 배치판 앞에서 layout 공간을 차지하지 않아야 하므로, 도구모음을 배치판보다
              먼저 그리는 대신 배치판(canvasRef, 이미 position:relative) 안쪽에 절대좌표(position:
              absolute)로 떠 있는 오버레이로 옮겼다 — 이러면 선택된 게 없을 때는 배치판 바로 위에
              빈 공간이 전혀 없이 붙고, 선택했을 때만 배치판 왼쪽 위에 살짝 떠서 나타날 뿐 배치판
              자체의 위치·크기는 절대 흔들리지 않는다. */}
          {/* "대지는 고정이고 배치판을 누르면 대지에 새로운 배치판이 생겨야 한다"(리룩스 같은
              공간설계 프로그램에서 방 하나하나가 늘 같은 크기의 고정 도면 위에 놓이는 방식) 요청으로,
              "대지"(고정 크기 판)와 "배치판"(그 위에 놓이는, 방 크기에 맞춰 자동으로 딱 맞춰지는 방
              모양 박스)을 이제 실제로 서로 다른, 눈에 보이는 두 개의 박스로 나눈다. 예전에는 이 구분이
              코드 계산(MAX_CANVAS_W/H)에만 있고 화면에는 "방 박스" 하나만 그 계산값에 맞춰 그때그때
              커졌다 작아졌다 하며 그려졌었다 — 그래서 방 크기를 바꿀 때마다(가로가 긴 방 → 세로가 긴
              방 등) 화면에 보이는 유일한 박스(그래서 사용자에게는 "대지"로 보였던 바로 그 테두리)의
              폭·높이·모양이 매번 바뀌어 마치 "대지 자체가 움직인다"는 인상을 줬다. 이제 바깥에 절대
              움직이지 않는 고정 크기(MAX_CANVAS_W×MAX_CANVAS_H)의 "대지" 박스를 두고, 그 안 가운데에
              방 크기에 맞춰 커졌다 작아졌다 하는 배치판(viewportRef/canvasRef)을 띄운다 — 대지의
              바깥 테두리는 어떤 방을 만들어도 절대 흔들리지 않고, 그 안의 배치판만 방 크기·비율에 맞게
              달라진다.
              ("대지에 먹는 공간 안생기게 해줘" 요청으로 줌아웃 때 대지 자체도 줄여보는 시도를
              해봤었는데, 그러면 고정 크기인 viewportRef가 줄어든 대지보다 커져서 그 안 어딘가에 있는
              실제 배치판(canvasRef)이 대지의 아주 좁은 구석에만 살짝 걸리는 식으로 완전히 깨져
              보이는 훨씬 나쁜 문제가 생겼다("대지 다 깨졌어" 신고). "대지는 고정값인데" 요청대로
              다시 줌과 무관하게 항상 MAX_CANVAS_W×MAX_CANVAS_H로 고정한다 — 대지가 늘 viewport보다
              크거나 같아서(viewport는 scale 기준으로 항상 대지 이하로 계산됨) 배치판은 줌·이동과
              무관하게 항상 대지 테두리를 절대 넘어가지 않는다.) */}
          {/* (버그 수정) "배치판은 대지 안에서 자유롭게 이동 가능해야 하는데, 줌인해서 Shift+끌기로
              끝까지 밀어봐도 배치판의 진짜 끝단(테두리)은 여전히 안 보인다"는 신고 — 원인은 이 "대지"
              박스 자체였다. 위 viewportWidthPx/HeightPx(실제 Shift+끌기가 먹히는 범위, VIEW_BLEED만큼
              여유를 더한 크기)는 방향에 따라 대지(MAX_CANVAS_W×MAX_CANVAS_H)보다 최대 VIEW_BLEED*2(28px)
              더 커질 수 있는데(예: 15m×10m처럼 대지 비율과 방 비율이 정확히 안 맞아떨어지는 "빡빡한"
              방향), 정작 대지 박스는 여전히 옛날 크기(MAX_CANVAS_W×MAX_CANVAS_H) 그대로라서, 그 창
              (viewportRef)이 대지 테두리 밖으로 살짝 튀어나온 채로 대지의 overflow:hidden에 걸려
              가장자리 부분이 통째로 잘려나가고 있었다 — 끝까지 끌어도 딱 그 잘린 부분(방의 진짜 벽선)만
              영원히 안 보이는 것이었다. 대지 박스를 그 최댓값(VIEW_BLEED*2까지 여유)만큼 항상 넉넉하게
              키워두면, viewportRef가 대지 밖으로 튀어나올 일이 없어 이 잘림이 사라진다 — 대지 크기는
              여전히 방 크기·줌과 무관하게 화면 크기(canvasColWidthPx 등)에만 좌우되는 고정값 그대로다
              (딱 28px만큼만 항상 더 넉넉해질 뿐, 방을 만들거나 줌을 해도 전혀 흔들리지 않는다). */}
          <div
            ref={groundRef}
            className="layoutsim-ground"
            style={{
              position: "relative",
              width: MAX_CANVAS_W + VIEW_BLEED * 2,
              height: MAX_CANVAS_H + VIEW_BLEED * 2,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: C.bg,
              // (가로로 아주 넓고 낮은 방처럼 대지 가로 폭에 거의 딱 맞는 방을 만들면, 방 박스가 대지
              // 좌우 끝에 거의 붙어버려서 옅은 색(C.line)의 점선 테두리로는 대지 경계 자체가 잘 안
              // 보였다 — "대지 안에서 놀아야 하는데 오류난다"는 신고로 이어짐. 더 또렷하게 보이도록
              // 테두리 색을 C.muted로, 굵기도 살짝 키웠다.)
              border: `1.5px dashed ${C.muted}`,
              borderRadius: 6,
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            {/* "대지"라는 게 뭔지 한눈에 알 수 있도록 왼쪽 위에 아주 옅게 라벨만 하나 둔다(인쇄할 때는
                안 보임) — 실제로 두 박스가 나뉘어 있다는 걸 눈으로 바로 확인할 수 있게. */}
            <div
              className="layoutsim-no-print"
              style={{
                position: "absolute",
                top: 6,
                left: 8,
                fontSize: 10.5,
                color: C.muted,
                letterSpacing: 0.2,
                pointerEvents: "none",
              }}
            >
              대지
            </div>
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
            onContextMenu={handleCanvasContextMenu}
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
                      type="text"
                      value={manualNameInput}
                      onChange={(e) => setManualNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleApplyManualName();
                      }}
                      onBlur={handleApplyManualName}
                      placeholder="이름"
                      title="이 모형만의 이름(마우스를 올리면 보이는 말풍선·저장된 배치에 쓰임)"
                      style={{ ...smallInputStyle, width: 100, boxSizing: "border-box" }}
                    />
                    <span style={{ fontSize: 12, color: C.lineSoft }}>|</span>
                    {/* "소수점까지 인식되게 해줘" 요청 — step="0.1"을 줘서 4.5처럼 소수점 있는 값도
                        스핀 버튼(▲▼)이 0.1 단위로 자연스럽게 움직이고, 직접 타이핑한 소수점 값도
                        아무 위화감 없이 그대로 입력되게 한다(Number()로 읽는 부분은 원래부터 소수점을
                        그대로 인식했다 — step만 정수 1로 남아있던 게 어색함의 원인이었다). */}
                    <input
                      type="number"
                      step="0.1"
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
                      step="0.1"
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
                {selectedPlacedIds.size >= 3 && (
                  <button onClick={handleDistributeSelected} title="양 끝 모형은 그대로 두고, 그 사이 모형들의 간격을 똑같이 맞춰요(가로로 나란하면 가로로, 세로로 나란하면 세로로 자동 판단)" style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>↔ 간격 동일하게</button>
                )}
                <button onClick={handleRemoveSelected} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>🗑 삭제</button>
                <button onClick={() => setSelectedPlacedIds(new Set())} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>선택 해제</button>
              </div>
            )}
            {placedItems.map((it) => {
              // 예전에 저장된 배치(rotated: true/false만 있던 옛 데이터)도 그대로 이어받는다.
              const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
              const swapped = rotation === 90 || rotation === 270;
              // "제품 클릭하면 동그라미 기능 넣어서 회전 자유자재로도 가능하게" 요청으로 회전이 더
              // 이상 90도 단위가 아닐 수 있어서, 바깥 테두리 크기는 rotatedAabbSize로 일반화했다 —
              // 0/90/180/270도에서는 예전의 swapped 계산과 정확히 같은 값이 나온다(회귀 없음).
              const outerAabb = rotatedAabbSize(it.widthCm, it.depthCm, rotation);
              const outerWPx = outerAabb.w * renderScale;
              const outerHPx = outerAabb.h * renderScale;
              const baseWPx = it.widthCm * renderScale;
              const baseHPx = it.depthCm * renderScale;
              const isPoly = it.shapeType === "l" || it.shapeType === "u";
              const isCircle = it.shapeType === "circle";
              const isRoundEnd = it.shapeType === "roundend";
              const isCurvedL = it.shapeType === "curvedl";
              const isChair = it.shapeType === "chair";
              const isMeetingChair = it.shapeType === "meetingchair";
              const isSofa = it.shapeType === "sofa";
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
              const isNonRectShape = isPoly || isCircle || isRoundEnd || isCurvedL || isChair || isMeetingChair || isSofa;
              // ("테두리도 그리다 만 것 같고... 아마추어 느낌이야, 테두리 마감을 프로페셔널하게" 요청)
              // 예전엔 평소(선택 안 됐을 때) 테두리가 1px밖에 안 돼서, 특히 확대하지 않은 기본 배율에선
              // 거의 안 보이다시피 가늘어 "그리다 만" 스케치처럼 보였다. 1.4px로 살짝 더 또렷하게 올렸다
              // — 그래도 선택(3px)보다는 여전히 가늘어서 강조 위계는 그대로 유지된다.
              // ("그룹화 되었을 때도 그냥 점선표시 없이 반응을 안 해주면 더 좋겠어" 요청 — 예전엔 그룹인데
              // 선택은 안 된 모형에 굵기(2px)·점선(4 3) 표시를 따로 줬는데, 이제 그룹 여부는 화면에
              // 아무 표시도 하지 않는다 — 실제로 선택됐을 때만 반응하고, 그 전까지는 다른 모형과 똑같이
              // 보인다. groupId 자체(한 번에 같이 선택·이동되는 동작)는 그대로 남아있고, 눈에 보이는
              // 표시만 없앴다.
              const shapeStrokeWidth = isSelected ? 3 : 1.4;
              const shapeStrokeDasharray = undefined;
              // (위 요청 계속) ㄱ자·U자처럼 파인 모서리가 있는 모양은 꺾이는 자리(특히 안쪽으로 오목하게
              // 파인 모서리)의 테두리가 뾰족한 직각(miter, SVG 기본값)으로 그려지면 그 자리만 유독
              // 날카롭고 거칠어 보여 "미완성" 인상을 준다. 캐드 도면·가구 카탈로그에서 흔히 쓰는 방식대로
              // 모서리를 살짝 둥글려(round) 매끄럽게 마감했다 — 모형의 실제 치수·꼭짓점 좌표는 전혀
              // 안 바뀌고, 그 테두리선을 그리는 붓끝 모양만 부드러워진다.
              const shapeStrokeJoin = "round";
              // (버그 수정) "동그라미 주위로 네모박스의 희미한 잔상이 안보이니?" 신고 — 선택했을 때
              // 생기는 보라색 테두리·글로우는 예전에 이미 SVG 쪽(실제 모양)으로 옮겨서 고쳤는데
              // (위 14152번째 줄 주석 참고), 정작 "평소에 늘 켜져 있는" 은은한 입체감 그림자(아래
              // boxShadow의 "0 1px 3px" 부분)는 그대로 바깥 네모 박스(wrapper div)에 남아있었다 —
              // 이 박스는 borderRadius가 3px뿐이라 사실상 네모라서, 원·의자처럼 둥글거나 파인 모양
              // 바깥의 네 귀퉁이에서 이 네모난 그림자만 살짝 삐져나와 "네모 잔상"처럼 보였다. 이제
              // 이 그림자도 선택 글로우와 똑같이 실제 모양(SVG)을 따라가도록 옮겨서, 항상(선택
              // 여부와 상관없이) 네모가 아니라 진짜 모양의 윤곽을 따라 은은하게 깔리게 했다.
              // (위 요청 계속) 평소 그림자도 아주 옅게(0.12) 깔려 있어서 입체감이 잘 안 느껴졌다 —
              // 살짝만 더 짙고 깊게(0.18, 퍼짐도 4px로) 줘서, 배치판 바탕 위에 실제로 "놓여 있는" 느낌이
              // 나도록 다듬었다.
              // (2026-09-30 미세조정, 2차례 수정에도 해결 안 돼서 원인 근본적으로 다시 확인) "테두리
              // 마감이 불안정하다, 깎아내거나 파인 부분만 유독 진하게 보인다"는 신고가 계속 이어졌다.
              // 1차로 그림자 번짐 반경을 줄이고, 2차로 그림자 방향(offset)까지 없앴는데도 ㄱ자의 파인
              // 모서리·반원 테이블의 둥근 변 쪽만 여전히 살짝 진하게 보인다는 지적을 받고, 실제로 도형을
              // 확대 렌더링해서 "그림자 있음 vs 그림자 완전히 없음"을 나란히 비교해봤다 — 그 결과 방향이
              // 없는 그림자라도 blur 자체가 존재하는 한, 반원 테이블의 둥근 변처럼 굽은 구간이나 ㄱ자의
              // 파인 모서리 주변에서는 그 미세한 번짐이 눈에 띄게 남는다는 걸 확인했다(반면 그림자를
              // 아예 없앤 도형은 곡선·모서리 어디서도 전혀 진해 보이지 않고 사각형 모형의 테두리처럼
              // 완벽하게 균일했다). 애초에 사각형 모형이 항상 깔끔했던 이유도 그림자 없이 순수 테두리선
              // (border)만 쓰고 있었기 때문이다. 그래서 평소(선택 안 됐을 때) 켜져 있던 입체감 그림자를
              // 아예 없애고, 사각형과 똑같이 테두리선(stroke)만으로 마감해서 어떤 모양·어떤 자리에서도
              // 티가 안 나게 완전히 균일한 굵기로 보이게 했다. 선택했을 때의 보라색 글로우는 신고 대상이
              // 아니었으므로 그대로 남겨뒀다.
              const shapeSvgStyle = {
                display: "block",
                filter: isSelected ? "drop-shadow(0 0 4px rgba(91, 79, 229,0.6))" : "none",
              };
              return (
                <div
                  key={it.id}
                  className={`layoutsim-placed-item${isSelected ? " layoutsim-placed-item--selected" : ""}${isNonRectShape ? " layoutsim-placed-item--nonrect" : ""}`}
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
                    // ("가구 클릭하고 컨트롤 누르고 다른 가구 클릭하면 클릭으로 다 지정되게" 요청 —
                    // Ctrl(맥은 Cmd)도 Shift와 똑같이 "더하기/빼기 토글"로 동작하게 했다. 마퀴(빈 곳을
                    // 끌어서 여러 개 고르는 것)에서 이미 Ctrl을 "더하기" 단축키로 쓰고 있어서, 낱개
                    // 클릭에서도 같은 손가락(Ctrl)으로 일관되게 여러 개를 고를 수 있다.)
                    const groupIds = it.groupId ? placedItems.filter((p) => p.groupId === it.groupId).map((p) => p.id) : [it.id];
                    setSelectedPlacedIds((prev) => {
                      if (e.shiftKey || e.ctrlKey || e.metaKey) {
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
                      : `${it.name} (${it.widthCm}×${it.depthCm}cm)${isGrouped ? " · 그룹" : ""} — 눌러서 선택(Shift+클릭 또는 Ctrl+클릭으로 여러 개, 빈 곳을 끌면 마퀴 선택) 후 방향키로 이동(Shift+방향키는 크게), 끌어서 옮기거나 모서리를 끌어 크기 조절, 버튼으로 회전·삭제, Ctrl+C/Ctrl+V로 복사`
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
                    // ("그룹화 되었을 때도... 반응을 안 해주면 더 좋겠어" 요청 — 그룹인데 선택은 안 된
                    // 사각형 모형에 주던 점선 테두리(1.5px dashed)를 없앴다. 이제 그룹 여부는 화면에
                    // 아무 표시가 없고, 실제로 선택됐을 때만 반응한다.
                    outline: isNonRectShape ? "none" : isSelected ? `2px solid ${C.purple}` : "none",
                    outlineOffset: isSelected ? 1 : 2,
                    // (위 shapeSvgStyle 수정과 같은 이유로) 둥글거나 파인 모양은 이제 이 바깥 네모
                    // 박스에 그림자를 안 주고, 실제 모양을 그리는 SVG의 drop-shadow가 대신한다 —
                    // 그래야 귀퉁이에 네모난 그림자가 삐져나오지 않는다.
                    boxShadow: isNonRectShape
                      ? "none"
                      : isSelected
                      ? "0 0 0 5px rgba(91, 79, 229, 0.16), 0 2px 6px rgba(28,43,58,0.18)"
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
                          fill={C.furnitureBg}
                          stroke={C.brownAccent}
                          strokeWidth={shapeStrokeWidth}
                          strokeDasharray={shapeStrokeDasharray}
                          strokeLinejoin={shapeStrokeJoin}
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
                          fill={C.furnitureBg}
                          stroke={C.brownAccent}
                          strokeWidth={shapeStrokeWidth}
                          strokeDasharray={shapeStrokeDasharray}
                          strokeLinejoin={shapeStrokeJoin}
                        />
                      </svg>
                    ) : isRoundEnd ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <path
                          d={roundEndTablePathD(it.widthCm, it.depthCm)}
                          fill={C.furnitureBg}
                          stroke={C.brownAccent}
                          strokeWidth={shapeStrokeWidth}
                          strokeDasharray={shapeStrokeDasharray}
                          strokeLinejoin={shapeStrokeJoin}
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    ) : isCurvedL ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <path
                          d={curvedLDeskPathD(it.widthCm, it.depthCm, it.notchWidthCm, it.notchDepthCm)}
                          fill={C.furnitureBg}
                          stroke={C.brownAccent}
                          strokeWidth={shapeStrokeWidth}
                          strokeDasharray={shapeStrokeDasharray}
                          strokeLinejoin={shapeStrokeJoin}
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    ) : isChair ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <ChairTopIcon w={it.widthCm} d={it.depthCm} fill={C.furnitureBg} stroke={C.brownAccent} />
                      </svg>
                    ) : isMeetingChair ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <MeetingChairTopIcon w={it.widthCm} d={it.depthCm} fill={C.furnitureBg} stroke={C.brownAccent} />
                      </svg>
                    ) : isSofa ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <SofaTopIcon w={it.widthCm} d={it.depthCm} fill={C.furnitureBg} stroke={C.brownAccent} />
                      </svg>
                    ) : (
                      // (위 요청 계속) 사각형은 선택 강조를 이 안쪽 테두리가 아니라 바깥 wrapper의
                      // outline·그림자가 이미 맡고 있어서(위쪽 style의 outline/boxShadow 참고), 여기
                      // 안쪽 테두리는 selection 여부와 무관하게 다른 모양들의 "평소" 굵기(1.4px)에
                      // 맞춰 통일감만 준다 — 선택했을 때 outline과 겹쳐 두꺼워 보이는 일이 없도록.
                      <div style={{ width: "100%", height: "100%", background: C.furnitureBg, border: `1.4px solid ${C.brownAccent}`, borderRadius: 3, boxSizing: "border-box" }} />
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
                  {/* ㄱ자·U자·곡선ㄱ자만 좌우반전(퍼즐책상 좌향/우향)이 의미가 있어서, 사각형에는 안 보여준다.
                      버튼 클릭이 캔버스까지 올라가서 줄자 클릭으로 잘못 잡히지 않도록 stopPropagation. */}
                  {(isPoly || isCurvedL) && (
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
                  {/* "제품 클릭하면 동그라미 기능 넣어서 회전 자유자재로도" 요청: 선택된 모형 위에만
                      나타나는 동그라미 손잡이 — 끌면 90도 단위가 아니라 원하는 각도로 자유롭게 돌아간다
                      (피그마·파워포인트 방식). 줄자 모드에선 클릭이 전부 줄자 점 찍기로 쓰이므로
                      숨긴다. 손잡이와 몸통을 잇는 가는 줄기(stem)도 함께 그려서 "이게 회전 손잡이"라는
                      게 한눈에 보이게 했다. */}
                  {isSelected && !rulerMode && (
                    <>
                      <div
                        className="layoutsim-no-print"
                        style={{ position: "absolute", top: -14, left: "50%", width: 1, height: 14, background: C.purple, opacity: 0.6, transform: "translateX(-50%)", pointerEvents: "none" }}
                      />
                      <div
                        onMouseDown={startRotatePlaced(it)}
                        onDragStart={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title="끌어서 자유롭게 회전"
                        className="layoutsim-no-print"
                        style={{
                          position: "absolute",
                          top: -20,
                          left: "50%",
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: C.purple,
                          border: "1.5px solid #fff",
                          boxShadow: "0 1px 3px rgba(28,43,58,0.3)",
                          transform: "translateX(-50%)",
                          cursor: "grab",
                        }}
                      />
                    </>
                  )}
                  {/* 크기 조절 손잡이: 오른쪽 아래 모서리를 끌면 가로·세로가 바뀐다. 이 손잡이에서 시작한
                      드래그는 항목 전체를 옮기는 draggable 동작이나 줄자 클릭으로 잘못 이어지지 않도록
                      막아준다(stopPropagation + dragstart 취소). 예전에는 bottom/right를 -4로 줘서 이
                      손잡이가 모형 박스 밖으로 살짝 삐져나오게 그렸는데, 배치판에 overflow:hidden 안전
                      장치를 추가한 뒤로 모형이 배치판 아래·오른쪽 벽에 딱 붙었을 때 이 손잡이의 튀어나온
                      부분이 그 안전장치에 잘려서 반쪽만 보이는 등 "디자인을 침범하는" 것처럼 보이는
                      문제가 있었다. 그래서 손잡이를 모형 박스 안쪽에 완전히 들어오도록(0,0 기준) 옮겨서,
                      모형이 배치판 어느 벽에 붙어 있어도 손잡이가 잘리는 일이 없게 했다.
                      ("제품 클릭하면... 회전 자유자재로" 요청으로 회전이 90도 단위를 벗어날 수 있게
                      되면서, 이 손잡이의 "오른쪽 아래를 끌면 가로·세로가 커진다"는 계산은 90도 단위
                      회전에서만 정확하므로, 자유 각도로 돌아간 상태에서는 혼란을 막기 위해 숨긴다 —
                      그 상태에서 크기를 바꾸려면 위 가로·세로 직접 입력칸을 쓰면 된다.) */}
                  {rotation % 90 === 0 && (
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
                  )}
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
                  background: "rgba(91, 79, 229, 0.12)",
                  border: `1px dashed ${C.purple}`,
                  pointerEvents: "none",
                }}
              />
            )}
            {/* "줄자 좀 섹시하게 편하게 안될까" 요청으로 줄자 전체를 다듬었다. 예전엔 점 두 번 찍기
                전까지는 화면에 아무 것도 안 보이다가 두 번째를 찍는 순간 갑자기 선이 나타났는데, 이제는
                첫 점을 찍자마자 지금 마우스 위치를 따라 점선 미리보기(선+거리)가 실시간으로 따라다녀서
                두 번째 점을 어디에 찍을지 눈으로 미리 재보면서 정할 수 있다("편하게"). 손을 눌러서
                그대로 끌고 가서 놓아도(드래그) 그 자리에 바로 찍히므로 "클릭-클릭"이든 "누르고 끌기"든
                둘 다 자연스럽게 된다. 끝점(모서리)마다 있는 옅은 점도, 지금 붙으려는 자리(끝점 인식)는
                꽉 찬 점으로 도드라지게 보여준다. 찍힌 선은 단순한 점선 대신 도면(CAD)에서 보는 치수선
                처럼 양 끝에 짧은 눈금을 달고, 흰 테두리로 배경 격자와 안 섞이게 했다. */}
            {rulerMode &&
              rulerSnapPoints.map((p, idx) => {
                const isActive =
                  !!rulerActiveSnapPoint &&
                  Math.abs(p.xCm - rulerActiveSnapPoint.xCm) < 1e-6 &&
                  Math.abs(p.yCm - rulerActiveSnapPoint.yCm) < 1e-6;
                const r = isActive ? 5 : 3;
                return (
                  <div
                    key={`ruler-snap-${idx}`}
                    className="layoutsim-no-print"
                    style={{
                      position: "absolute",
                      left: p.xCm * renderScale - r,
                      top: p.yCm * renderScale - r,
                      width: r * 2,
                      height: r * 2,
                      borderRadius: "50%",
                      border: `1.5px solid ${C.purple}`,
                      background: isActive ? C.purple : "#fff",
                      boxShadow: isActive ? "0 0 0 3px rgba(91, 79, 229,0.25)" : "none",
                      transition: "all 80ms ease-out",
                      pointerEvents: "none",
                    }}
                  />
                );
              })}
            {/* 줄자: 찍은 점(1~2개) + 아직 안 찍힌 두 번째 점의 실시간 미리보기, 그 사이를 잇는 선
                (찍힌 건 실선+눈금, 미리보기는 옅은 점선) + 실제 거리(cm/m) 표시. 클릭/드래그를 막지
                않도록 pointerEvents는 항상 none. */}
            {(rulerPoints.length === 2 || (rulerPoints.length === 1 && rulerPreviewPoint)) && (
              <svg
                width={worldWidthPx}
                height={worldHeightPx}
                style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
              >
                {(() => {
                  const isLocked = rulerPoints.length === 2;
                  const p0 = rulerPoints[0];
                  const p1 = isLocked ? rulerPoints[1] : rulerPreviewPoint;
                  const x1 = p0.xCm * renderScale, y1 = p0.yCm * renderScale;
                  const x2 = p1.xCm * renderScale, y2 = p1.yCm * renderScale;
                  const ticks = perpendicularTicks(x1, y1, x2, y2, 9);
                  const stroke = "#e11d48";
                  const opacity = isLocked ? 1 : 0.55;
                  return (
                    <g opacity={opacity}>
                      {/* 배경 격자·모형 위에서도 잘 보이도록, 색 있는 선보다 살짝 굵은 흰 테두리를 먼저 깔아둔다. */}
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={isLocked ? 4 : 3} strokeLinecap="round" />
                      <line
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={stroke}
                        strokeWidth={isLocked ? 2 : 1.5}
                        strokeDasharray={isLocked ? undefined : "5,4"}
                        strokeLinecap="round"
                      />
                      {/* 치수선처럼 양 끝에 직각으로 짧은 눈금을 그려서 "정확히 여기부터 여기까지"를 표시한다. */}
                      <line x1={ticks.a.x1} y1={ticks.a.y1} x2={ticks.a.x2} y2={ticks.a.y2} stroke={stroke} strokeWidth={isLocked ? 2 : 1.5} strokeLinecap="round" />
                      <line x1={ticks.b.x1} y1={ticks.b.y1} x2={ticks.b.x2} y2={ticks.b.y2} stroke={stroke} strokeWidth={isLocked ? 2 : 1.5} strokeLinecap="round" />
                    </g>
                  );
                })()}
              </svg>
            )}
            {rulerPoints.map((p, idx) => (
              <div
                key={`ruler-pt-${idx}`}
                style={{
                  position: "absolute",
                  left: p.xCm * renderScale - 5,
                  top: p.yCm * renderScale - 5,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#e11d48",
                  border: "2px solid #fff",
                  boxShadow: "0 1px 3px rgba(28,43,58,0.35)",
                  pointerEvents: "none",
                }}
              />
            ))}
            {/* 아직 확정되지 않은 두 번째 점(미리보기) — 손을 떼기 전이라 속이 빈 고스트 점으로 구분한다. */}
            {rulerPoints.length === 1 && rulerPreviewPoint && (
              <div
                className="layoutsim-no-print"
                style={{
                  position: "absolute",
                  left: rulerPreviewPoint.xCm * renderScale - 5,
                  top: rulerPreviewPoint.yCm * renderScale - 5,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "rgba(225,29,72,0.25)",
                  border: "2px solid #e11d48",
                  pointerEvents: "none",
                }}
              />
            )}
            {(rulerDistanceCm != null || rulerPreviewDistanceCm != null) && (() => {
              const isLocked = rulerDistanceCm != null;
              const dist = isLocked ? rulerDistanceCm : rulerPreviewDistanceCm;
              const p1 = isLocked ? rulerPoints[1] : rulerPreviewPoint;
              return (
                <div
                  className="layoutsim-no-print"
                  style={{
                    position: "absolute",
                    left: ((rulerPoints[0].xCm + p1.xCm) / 2) * renderScale,
                    top: ((rulerPoints[0].yCm + p1.yCm) / 2) * renderScale,
                    transform: "translate(-50%, -50%)",
                    background: isLocked ? "#e11d48" : "rgba(225,29,72,0.85)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 7px",
                    borderRadius: 999,
                    boxShadow: isLocked ? "0 2px 6px rgba(28,43,58,0.3)" : "none",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  📏 {dist >= 100 ? `${(dist / 100).toFixed(2)}m (${dist.toFixed(0)}cm)` : `${dist.toFixed(1)}cm`}
                </div>
              );
            })()}
          </div>
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
      <style>{`
        /* 메인 시스템(app/page.js)과 똑같은 버튼 눌림 반응·입력창 포커스 링을 여기도 그대로 넣었다. */
        button:not(:disabled) {
          transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease, filter 0.12s ease;
        }
        button:not(:disabled):hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
          box-shadow: 0 4px 10px rgba(28,43,58,0.14);
          border-color: ${C.purple};
        }
        button:not(:disabled):active {
          transform: translateY(0);
          filter: brightness(0.97);
        }
        input:not([type="checkbox"]):not([type="radio"]):focus,
        select:focus,
        textarea:focus {
          border-color: ${C.purple} !important;
          box-shadow: 0 0 0 3px ${C.purpleBg} !important;
        }
        input[type="checkbox"], input[type="radio"] { accent-color: ${C.purple}; }
      `}</style>
      <div
        style={{
          borderBottom: `3px solid ${C.purple}`,
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
