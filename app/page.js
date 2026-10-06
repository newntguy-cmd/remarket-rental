"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { deriveLoginId } from "../lib/accountRecovery";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

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
  // (2026-09-30 재수정) "메뉴바 남색/보라색 별로" 피드백으로, 칙칙한 남색+탁한 보라 조합을 걷어내고
  // 더 또렷하고 세련된 인디고 바이올렛 포인트 컬러로 바꿨다(밝을 때 배경용 purpleBg, 눌렀을 때/그라데이션
  // 진한 쪽 purpleDark도 같이 정리). 이 값들은 사이드바 강조, 헤더 밑줄, 버튼 포커스 링, 표 조절바 hover
  // 등 앱 전체 곳곳에서 재사용되므로, 여기 한 곳만 바꿔도 전체 화면이 같은 톤으로 통일되게 맞춰뒀다.
  purple: "#5B4FE5",
  purpleDark: "#4638C2",
  purpleBg: "#EEECFF",
  // 사이드바·모바일 메뉴 서랍의 배경. 검정 → 브라운 → 독자적인 아이보리까지 계속 "구리다"는 피드백이
  // 이어졌는데(2026-09-30 6차 수정), "옆(본문 배경)이랑 색을 맞춰라"는 지적을 듣고 보니 원인은 사이드바만
  // 따로 정한 색(#F7F2E6)이 바로 옆 본문 배경(C.bg)과 미묘하게 달라서 서로 안 어울려 보였던 것이었다.
  // 그래서 별도 색을 만들지 않고 본문과 완전히 같은 C.bg를 그대로 쓰고, 테두리(C.line, 카드 등 앱 전체가
  // 쓰는 바로 그 테두리색)로만 구분한다 — 이러면 사이드바가 "다른 색 블록"이 아니라 같은 배경 위에 테두리로
  // 살짝 구획된 영역으로 자연스럽게 녹아든다. hover는 포인트 컬러의 아주 옅은 배경(C.purpleBg)을 재사용해서
  // 새 색을 추가하지 않았다. (2026-09-30 7차 수정) "테두리만 고급지게 브라운으로" 요청으로, 이 테두리색을
  // 딱 하나 따뜻한 브라운(brownAccent)으로 골라 넣었다 — 배경은 계속 본문과 같은 C.bg 그대로다. 이후
  // (2026-09-30 8차 수정) "가구배치 화면의 가구 테두리도 세련된 브라운으로" 요청으로, 사이드바 전용이던
  // 이 브라운을 이름을 더 일반적으로 바꿔(sidebarBorder → brownAccent) 가구 모형의 테두리·채우기에도
  // 그대로 재사용한다 — 같은 브라운 한 톤이 앱 여러 군데(사이드바 테두리, 가구 테두리)에 통일되게 쓰인다.
  brownAccent: "#8C6A42",
  // 가구 모형 안쪽 채우기 색. 예전엔 옅은 라벤더(purpleBg)였는데, 브라운 테두리와 어울리게 나무 느낌이
  // 나는 따뜻한 크림 톤으로 바꿨다.
  furnitureBg: "#F3EAD9",
  // "파티션 넣기 기능... 색상은 짙은 녹색으로" 요청으로 처음엔 짙은 숲녹색이었는데, (2026-10-01 변경)
  // "파티션 색상은 이거와 최대한 비슷하게 해줘"라며 실제 PW505 파티션 패브릭 사진을 보여줘서, 그 사진
  // 속 색(청록빛 회색조 패브릭)에서 직접 뽑아낸 값으로 바꿨다. 이름도 더는 "녹색"이 아니므로
  // partitionGreen → partitionColor로 바꿨다.
  partitionColor: "#6C9BA5",
  mutedBg: "#EEEEEC",
  muted: "#6B7280",
};

const serif = "'Noto Serif KR','Georgia',serif";
const sans = "'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif";

const todayISO = () => new Date().toISOString().slice(0, 10);
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}
// 렌탈개시일 + 렌탈기간(개월) - 1일 = 렌탈만료일
function addMonthsMinusDay(dateStr, months) {
  if (!dateStr || !months) return "";
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + Number(months));
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
// 구분(렌탈/구매)이 바뀔 때 출하창고를 자동으로 맞춰준다. 사람이 직접 다른 값으로 고쳐놓은 경우(자동값 00007/00008이
// 아닌 값)는 덮어쓰지 않고 그대로 둔다.
function autoWarehouseFor(transactionType, current) {
  const auto = transactionType === "rental" ? "00008" : transactionType === "purchase" ? "00007" : "";
  if (!current || current === "00007" || current === "00008") return auto;
  return current;
}
// 사업자등록번호는 "000-00-00000"(3-2-5자리) 형식으로 통일해서 보여준다. 숫자만 남기고 자동으로 하이픈을 붙여준다.
function formatBizRegNo(v) {
  const digits = (v || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
// 회수일자·거래일자 같은 칸은 사람이 직접 "2026-09-30(수)"처럼 요일을 붙여 적을 수 있게 자유 텍스트로 열어뒀는데,
// 이 값을 그대로 DB의 날짜(date) 칼럼에 넣으면 "invalid input syntax for type date" 오류가 난다.
// 문자열 안에서 YYYY-MM-DD 형태만 뽑아 쓰고, 그런 형태가 없으면 null로(오류 대신 그냥 날짜 없이 저장되게) 처리한다.
function extractIsoDate(s) {
  if (!s) return null;
  const m = String(s).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}
// 등록(오늘) 날짜 기준으로 "YYMMDD + 오늘 등록 순번" 형태의 전표번호를 자동 생성 (예: 오늘 첫 건 26091701, 두 번째 26091702 ...)
// 배송일자와 무관하게 항상 "오늘" 기준으로 매겨서, 언제 등록했는지로 일련번호가 매겨지게 한다.
function nextVoucherNo(rentals) {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const prefix = `${yy}${mm}${dd}`;
  const used = new Set((rentals || []).filter((r) => r.voucher_no && r.voucher_no.startsWith(prefix)).map((r) => r.voucher_no));
  let seq = 1;
  while (used.has(`${prefix}${String(seq).padStart(2, "0")}`)) seq++;
  return `${prefix}${String(seq).padStart(2, "0")}`;
}
// 전표번호(voucher_no) 기준으로 rentals 행들을 하나의 "전표" 단위로 묶는다. 전표번호가 없는 건은 각각 단독 전표로 취급.
function groupRentalsByVoucher(rentals) {
  const map = new Map();
  for (const r of rentals) {
    const key = r.voucher_no || `__single_${r.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return Array.from(map.entries()).map(([key, rowsRaw]) => {
    // 같은 전표 안 품목은 견적서/등록 순서(line_no) 그대로 보이도록 정렬한다.
    // line_no가 없는 옛 데이터는 id(등록된 순서) 기준으로 정렬해 최대한 원래 순서에 가깝게 보여준다.
    const rows = [...rowsRaw].sort((a, b) => {
      const la = a.line_no ?? a.id ?? 0;
      const lb = b.line_no ?? b.id ?? 0;
      return la - lb;
    });
    const head = rows[0];
    const amount = rows.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return { key, voucherNo: head.voucher_no || "", rows, head, amount };
  });
}
const rentalListGrid = "28px 120px 110px 120px 90px 100px 1fr 90px 100px 100px 110px 90px";
function fmtWon(n) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return Number(n).toLocaleString("ko-KR") + "원";
}
function fmtWonShort(n) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  if (n >= 100000000) return (n / 100000000).toFixed(1) + "억";
  if (n >= 10000) return Math.round(n / 10000) + "만";
  return String(n);
}

function getStatus(item) {
  if (item.transaction_type === "purchase") return "purchase";
  if (item.collected) return "collected";
  if (!item.due_date) return "normal";
  const diff = daysBetween(todayISO(), item.due_date);
  if (diff < 0) return "overdue";
  if (diff <= 7) return "soon";
  return "normal";
}
const STATUS_META = {
  normal: { label: "정상", fg: C.green, bg: C.greenBg },
  soon: { label: "반납임박", fg: C.amber, bg: C.amberBg },
  overdue: { label: "연체", fg: C.brick, bg: C.brickBg },
  collected: { label: "회수완료", fg: C.muted, bg: C.mutedBg },
  purchase: { label: "구매완료", fg: C.purple, bg: C.purpleBg },
};

// "좀 더 프로페셔널하고 전문적인 모던 SaaS 느낌으로" 요청(2026-09-30)에 따라 버튼·입력창의 기본
// 값(둥근 정도·그림자·입력창 배경)을 전체적으로 다듬었다. 화면 레이아웃 자체는 그대로 두고, 이
// 값들을 쓰는 모든 화면(견적서 업로드·렌탈내역·가구배치 등)에 자동으로 함께 반영되도록 공용
// 상수만 손봤다. 호버·포커스 때 반응하는 부분(버튼 눌림 효과, 입력창 포커스 링)은 아래 전역
// <style> 블록에서 한 곳에 모아 처리한다(개별 화면 코드는 손대지 않아도 전체에 적용됨).
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
// 품목 표(RentalDetailPanel)의 행별 "+ / ↑ / ↓" 버튼처럼 아주 작은 아이콘 버튼용.
const rowActionBtnStyle = {
  width: 20,
  height: 20,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${C.line}`,
  background: C.panel,
  color: C.inkSoft,
  fontSize: 12,
  lineHeight: 1,
  borderRadius: 5,
  cursor: "pointer",
};
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

// ---------- 담당자/거래처 등 자주 반복 입력하는 검색어의 "최근 입력 내역" ----------
// 브라우저(localStorage)에만 저장되는, 이 컴퓨터·이 브라우저 한정 최근 검색어 목록이다.
const RECENT_VALUES_MAX = 8;

function getRecentValues(storageKey) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function addRecentValue(storageKey, value) {
  if (typeof window === "undefined") return;
  const v = (value || "").trim();
  if (!v) return;
  try {
    const existing = getRecentValues(storageKey).filter((x) => x !== v);
    const next = [v, ...existing].slice(0, RECENT_VALUES_MAX);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // 프라이빗 모드 등 localStorage를 못 쓰는 환경이면 그냥 무시(최근 입력 기능만 안 될 뿐, 검색 자체는 정상 동작)
  }
}

// ---------- "내 이름"(작성자 자동입력용) ----------
// 관리자 계정을 여러 직원이 같이 쓰다 보니 로그인 정보만으로는 실제로 누가 쓰고 있는지 알 수 없어서,
// 이 컴퓨터·이 브라우저에 "내 이름"을 한 번 저장해두면 A/S·회수 등록 시 작성자 칸에 자동으로 채워준다.
const MY_NAME_STORAGE_KEY = "remarket_my_name";

function getMyName() {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(MY_NAME_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setMyName(name) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MY_NAME_STORAGE_KEY, (name || "").trim());
  } catch {
    // 프라이빗 모드 등 localStorage를 못 쓰는 환경이면 그냥 무시(다시 입력해야 할 뿐, 나머지는 정상 동작)
  }
}

// ---------- "품목별 수량 통계" 출력물에서 숨긴 품목(이 출력물에서만 안 보이게, 원본 렌탈 데이터는 그대로 둔다) ----------
// 전표별로 구분해서 저장한다(다른 전표에 영향 없게). 브라우저(localStorage)에만 저장되므로 이 컴퓨터·이 브라우저에서만 유지된다.
function hiddenItemStatsStorageKey(voucherKey) {
  return `remarket_hidden_itemstats:${voucherKey || ""}`;
}

function getHiddenItemStatKeys(voucherKey) {
  if (typeof window === "undefined" || !voucherKey) return [];
  try {
    const raw = window.localStorage.getItem(hiddenItemStatsStorageKey(voucherKey));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function setHiddenItemStatKeys(voucherKey, keys) {
  if (typeof window === "undefined" || !voucherKey) return;
  try {
    if (!keys || keys.length === 0) {
      window.localStorage.removeItem(hiddenItemStatsStorageKey(voucherKey));
    } else {
      window.localStorage.setItem(hiddenItemStatsStorageKey(voucherKey), JSON.stringify(keys));
    }
  } catch {
    // 프라이빗 모드 등 localStorage를 못 쓰는 환경이면 그냥 무시(숨기기 기능만 안 될 뿐, 다른 동작엔 지장 없음)
  }
}

// 오른쪽 화살표(▾)를 누르면 이 필드에 최근 입력·검색했던 값 목록이 드롭다운으로 뜨고, 클릭하면 바로 채워진다.
// extraOptions를 넘기면(예: 실제 등록된 업체명 전체 목록) 최근 입력 내역이 없어도 타이핑 중인 글자가
// 이름 "중간"에 포함되기만 해도(부분일치) 후보로 함께 떠서 바로 골라 채울 수 있다.
function RecentValueInput({ storageKey, value, onChange, onKeyDown, onBlur, placeholder, style, extraOptions }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState([]);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (open) setRecent(getRecentValues(storageKey));
  }, [open, storageKey]);

  useEffect(() => {
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const q = value.trim().toLowerCase();
  const matchedRecent = recent.filter((v) => !q || v.toLowerCase().includes(q));
  const matchedExtra = (extraOptions || []).filter((v) => v && (!q || v.toLowerCase().includes(q)) && !matchedRecent.includes(v)).slice(0, 12);
  const filtered = [...matchedRecent, ...matchedExtra];

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        style={{ ...(style || inputStyle), paddingRight: 30 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={(e) => onBlur && onBlur(e)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()} // 입력창 포커스가 먼저 빠지지 않게
        onClick={() => setOpen((o) => !o)}
        tabIndex={-1}
        aria-label="최근 입력 내역"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 28,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: C.muted,
          fontSize: 11,
        }}
      >
        ▾
      </button>
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 20,
            background: C.panel,
            border: `1px solid ${C.line}`,
            boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
            maxHeight: 220,
            overflowY: "auto",
            marginTop: 2,
          }}
        >
          {filtered.map((v) => (
            <div
              key={v}
              onMouseDown={(e) => {
                e.preventDefault(); // 클릭 처리 전에 blur가 먼저 일어나 드롭다운이 닫혀버리는 걸 방지
                onChange(v);
                setOpen(false);
              }}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", color: C.ink }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {v}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 단가/금액처럼 숫자를 콤마(1,200,000)로 보여주면서 값은 숫자로 다루는 입력창
function NumberInput({ value, onChange, style, placeholder }) {
  const fmt = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? "" : Number(v).toLocaleString("ko-KR"));
  const [text, setText] = useState(fmt(value));

  useEffect(() => {
    const formatted = fmt(value);
    setText((prev) => (prev === formatted ? prev : formatted));
  }, [value]);

  const handleChange = (e) => {
    const cleaned = e.target.value.replace(/[^0-9-]/g, "");
    const hasDigits = /\d/.test(cleaned);
    const numeric = hasDigits ? Number(cleaned) : null;
    setText(hasDigits && !isNaN(numeric) ? numeric.toLocaleString("ko-KR") : cleaned);
    onChange(hasDigits && !isNaN(numeric) ? numeric : null);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      style={{ ...style, textAlign: "right" }}
      value={text}
      onChange={handleChange}
      placeholder={placeholder}
    />
  );
}

// 표 헤더 칸 경계를 마우스로 드래그해서 좌우로 늘이고 줄일 수 있게 해주는 훅.
// widths: 각 칸의 px 너비 배열, ColResizeHandle: 각 헤더 칸 오른쪽 끝에 넣는 드래그 손잡이
function useResizableColumns(initialWidths) {
  const [widths, setWidths] = useState(initialWidths);
  const dragRef = useRef(null);

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current) return;
      const { idx, startX, startWidth } = dragRef.current;
      const next = Math.max(40, startWidth + (e.clientX - startX));
      setWidths((prev) => {
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      });
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = (idx) => (e) => {
    e.preventDefault();
    dragRef.current = { idx, startX: e.clientX, startWidth: widths[idx] };
  };

  return [widths, startResize];
}

// 표 헤더 칸 경계에 놓는 드래그 손잡이. 마우스가 놓일 수 있는 영역은 10px로 넉넉하게 잡되, 그 자리를
// 평소에도 옅은 세로선으로 보여주고 마우스를 올리면 진해지게 해서 "여기를 드래그하면 되는구나"를 바로 알 수 있게 한다.
function ColResizeHandle({ onMouseDown }) {
  return (
    <div
      className="col-resize-handle"
      onMouseDown={onMouseDown}
      style={{ position: "absolute", top: 0, bottom: 0, right: -6, width: 10, cursor: "col-resize", zIndex: 2, display: "flex", justifyContent: "center" }}
      onClick={(e) => e.stopPropagation()}
      title="드래그해서 칸 너비 조절"
    >
      <div className="col-resize-bar" style={{ width: 3, alignSelf: "stretch", borderRadius: 2 }} />
    </div>
  );
}

// ---------- 엑셀 견적서 파싱 ----------
// 배송비·DC(할인)는 품목이 아니라 별도 계산 항목처럼 보이지만, 실제 청구 금액(계/합계)에
// 포함되는 항목이라 건너뛰지 않고 그대로 품목 내역에 포함시킨다 (등록 전 미리보기에서 확인·수정 가능).
const SKIP_NAMES = [];
const STOP_NAMES = ["계", "합계(vat 포함)", "합계", "납품확인", "[조건 / condition]", "[조건/condition]"];

function cellText(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // 엑셀에서 "날짜" 서식으로 입력된 칸은 (아래 sheet_to_json에 cellDates:true를 줬기 때문에) 숫자가 아니라
    // JS Date로 들어온다. 그대로 문자열로 바꾸면 시간대 때문에 하루가 밀릴 수 있어서 UTC 기준으로 맞춰 적는다.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

// 견적서 표 안의 "— 사무집기 —"/"ㅡ 소장실 ㅡ"/"-- 이전 및 설치 --"처럼, 실제 품목이 아니라 구역을 나누는
// 구획 제목 줄인지 판단한다. 이런 줄은 앞뒤로 대시류 기호(하이픈/엔대시/엠대시/한글 채움 기호 "ㅡ" 등)가
// 있고 그 사이에 실제 라벨 글자가 있는 형태라, 대시가 하나뿐이든(예: "— 사무집기 —") 여러 개든(예:
// "-- 이전 및 설치 --") 상관없이 같은 기준으로 인식한다. 이 줄은 품목명으로 등록하면 안 되고(구역 이름일
// 뿐), 그 줄의 "규격" 칸에 우연히 다른 텍스트(예: 배송지 주소)가 같이 찍혀 있어도 그건 실제 규격이 아니므로
// 함께 버려야 한다(안 그러면 "— 사무집기 —"라는 이상한 품목이 주소를 규격 삼아 그대로 등록돼버린다).
function isSectionDividerLabel(s) {
  const t = (s || "").trim();
  if (!t) return false;
  if (t.includes("ㅡ")) return true;
  const DASH = "\\-\u2013\u2014=_"; // -, –, —, =, _
  const startsWithDash = new RegExp(`^[${DASH}]`).test(t);
  const endsWithDash = new RegExp(`[${DASH}]$`).test(t);
  if (!startsWithDash || !endsWithDash) return false;
  const inner = t.replace(new RegExp(`^[${DASH}\\s]+|[${DASH}\\s]+$`, "g"), "");
  return inner.length > 0;
}

// 자동완성 후보 목록을 만들 때 쓰는 두 헬퍼. 빈 값 제거 + 대소문자/앞뒤공백 무시하고 중복 제거 + 가나다순 정렬.
function normalizeMatchText(s) {
  return (s || "").trim().toLowerCase();
}
function dedupeSorted(values) {
  const seen = new Map(); // normalizeMatchText(원본) -> 처음 만난 원본 표기 그대로 유지
  for (const v of values) {
    const t = (v || "").trim();
    if (!t) continue;
    const key = normalizeMatchText(t);
    if (!seen.has(key)) seen.set(key, t);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "ko"));
}

// 견적서 "수신" 칸에 "거래처 - 현장명"처럼 거래처명과 현장명이 하이픈 하나로 같이 적혀 있는 경우가 많다.
// 사람마다 "거래처 - 현장명"(하이픈 앞뒤 공백 있음)뿐 아니라 "거래처-현장명"(공백 없음)으로도 적기 때문에
// 공백 유무와 상관없이 인식한다. 다만 "LG-CNS"처럼 회사명 자체에 하이픈이 들어간 경우까지 잘라버리면
// 오히려 거래처명이 망가지므로, 하이픈 뒤쪽이 "누가 봐도 현장/프로젝트명처럼 보일 때"(공백이 있거나
// 숫자가 섞여 있거나 어느 정도 길이가 있는 문구)만 현장명으로 떼어내고, 애매하면 원문을 그대로 거래처명에 둔다.
function splitCustomerAndSite(raw) {
  const text = (raw || "").trim();
  const m = text.match(/^(.+?)\s*-\s*(.+)$/);
  if (!m) return { customer: text, siteName: "" };
  const left = m[1].trim();
  const right = m[2].trim();
  const looksLikeSite = /\s/.test(right) || /\d/.test(right) || right.length >= 4;
  if (left && right && looksLikeSite) return { customer: left, siteName: right };
  return { customer: text, siteName: "" };
}

// 표 머리글 행을 찾아 실제 열 위치(품목/규격/수량/단가/금액/비고)를 감지한다.
// 견적서 양식마다 표가 시작되는 열이 다를 수 있어(B열부터 vs C열부터), 고정 인덱스 대신 헤더 텍스트로 찾는다.
function detectColumns(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const cols = {};
    row.forEach((cell, idx) => {
      const t = cellText(cell).replace(/\s/g, "");
      if (!t) return;
      if (t.includes("품") && t.includes("목")) cols.item = idx;
      else if (t.includes("규격")) cols.spec = idx;
      else if (t.includes("수량")) cols.qty = idx;
      else if (t.includes("단가")) cols.price = idx;
      else if (t.includes("금액")) cols.amount = idx;
      else if (t.includes("비고")) cols.note = idx;
    });
    if (cols.item !== undefined && cols.qty !== undefined && cols.amount !== undefined) {
      return { headerRowIdx: i, cols };
    }
  }
  return null;
}

// 견적서 상단(제목 바로 아래)에 "#2609232"처럼 "#" + 숫자만 단독으로 찍혀 있는 줄은 그 견적서 자체의
// 관리번호이고, 실제로 뜯어보면 "260923"(발행일 YYMMDD) + "2"(그날의 순번) 형태로 사내 전표번호
// 자동 생성 규칙(nextVoucherNo, YYMMDD+순번)과 사실상 같은 체계라 전표번호로 그대로 써도 안전하다.
// 다만 이 값이 진짜 관리번호가 맞는지는 사람이 한 번 더 확인하는 게 안전하니, 자동으로 채워주되
// 전표번호 칸은 계속 직접 수정 가능하게 두고 등록 전 확인 화면에서 눈으로 검토할 수 있게 한다.
// "#"과 숫자 사이/숫자 사이에 공백이 섞여 나오는 경우(PDF 좌표 인식 특성)까지 감안해 공백은 모두 제거하고
// "칸 전체가 '#'+숫자뿐"인 경우만 인정한다(다른 텍스트 안에 우연히 '#숫자'가 섞여 있는 경우의 오탐 방지).
function extractQuoteVoucherNoFromText(raw) {
  if (!raw) return "";
  const compact = String(raw).replace(/\s+/g, "");
  const m = compact.match(/^#(\d{5,10})$/);
  return m ? m[1] : "";
}

// "렌탈기간" 칸 텍스트에서 "YYYY.MM.DD~YYYY.MM.DD"처럼 일 단위까지 적힌 시작~종료 날짜 범위를 찾는다.
// (예: "렌탈기간 : 15개월(2026.09.20~2027.12.19)") 구분자는 "."/"-"/"/"/"년,월,일", 범위 기호는 "~"/"∼"/"-" 모두 허용.
function parseRentalPeriodDateRange(cell) {
  const DATE = "(\\d{4})[.\\-/년]\\s*(\\d{1,2})[.\\-/월]\\s*(\\d{1,2})\\s*일?";
  const re = new RegExp(DATE + "\\s*[~∼\\-]\\s*" + DATE);
  const m = cell.match(re);
  if (!m) return null;
  // "(2025-00-00~2025-00-00)"처럼 실제 날짜를 아직 안 채운 견적서 양식의 틀(placeholder)이 그대로 남아있는
  // 경우가 있어, 월/일이 달력상 있을 수 없는 값(00월, 00일, 13월 이상 등)이면 날짜를 못 찾은 것으로 처리한다.
  const mo1 = Number(m[2]), da1 = Number(m[3]), mo2 = Number(m[5]), da2 = Number(m[6]);
  if (mo1 < 1 || mo1 > 12 || da1 < 1 || da1 > 31 || mo2 < 1 || mo2 > 12 || da2 < 1 || da2 > 31) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return {
    start: `${m[1]}-${pad(m[2])}-${pad(m[3])}`,
    end: `${m[4]}-${pad(m[5])}-${pad(m[6])}`,
  };
}

async function parseQuoteExcel(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // 엑셀 하단에 시트 탭이 여러 개 있어도(예: "최초 견적서" 탭에 수정 요청이 들어올 때마다 "수정된견적서" 탭이
  // 옆에 추가되는 경우) 항상 가장 왼쪽(첫 번째) 탭 하나만 읽는다. 숨겨진 시트가 맨 앞에 끼어 있으면 그건 건너뛰고
  // 화면에 실제로 보이는 첫 탭을 고른다.
  const visibleSheetNames = wb.SheetNames.filter((name) => {
    const meta = (wb.Workbook?.Sheets || []).find((s) => s.name === name);
    return !meta || !meta.Hidden; // Hidden: 0(또는 없음)=보임, 1=숨김, 2=매우숨김
  });
  const firstSheetName = visibleSheetNames[0] || wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, cellDates: true });
  return parseQuoteRows(rows);
}

// 엑셀에서 긁어 온(클립보드에 복사한) 견적서 텍스트도 "셀이 2차원 배열로 늘어선 표" 형태라는 점은
// 엑셀 파일과 동일하다(엑셀 복사 시 탭/줄바꿈으로 구분된 TSV로 클립보드에 담기므로). 그래서 파일 업로드와
// 완전히 같은 인식 로직(parseQuoteRows)을 그대로 재사용해서, 붙여넣기로 등록해도 파일 업로드와 똑같이 동작한다.
function parsePastedQuoteText(text) {
  const rows = parsePastedTable(text);
  return parseQuoteRows(rows);
}

// 엑셀 파일이든 붙여넣은 텍스트든, "셀이 2차원 배열로 늘어선 표"만 주어지면 거래처/배송지/담당자 같은
// 전표 상단 정보와 품목 표를 똑같은 방식으로 인식한다(견적서 업로드와 붙여넣기 등록이 동일한 결과를 내는 핵심).
function parseQuoteRows(rows) {
  let customer = "";
  let site = "";
  let manager = "";
  let issueDate = todayISO();
  let transactionType = "purchase";
  let outDate = issueDate;
  let dueDate = null;
  let periodDays = null;
  let periodMonths = null;
  let refContact = ""; // 거래처 담당자(참조)
  let email = "";
  let phone = "";
  let recipient = ""; // 수령자/연락처
  let deliveryDate = ""; // 배송일자 (발행일과 다를 수 있음)
  let rentalPeriodRange = null; // "렌탈기간" 칸에 일 단위 시작~종료 날짜가 적혀 있으면 그 값 ({start, end})
  let voucherNo = ""; // 견적서 상단 "#숫자" 관리번호를 찾으면 전표번호로 자동 채움(못 찾으면 그대로 공란, 직접 입력)

  let siteName = ""; // "수신" 칸의 "거래처 - 현장명" 표기에서 나오는 현장명(있을 때만)

  const headerScanRows = rows.slice(0, 15);
  for (const row of headerScanRows) {
    // 셀을 한 줄로 합치면 옆 칸(같은 행의 다른 라벨) 텍스트가 붙어버릴 수 있어
    // 라벨:값 형태의 정보는 셀 단위로 각각 따로 검사한다.
    const cells = (row || []).map(cellText).filter((t) => t.trim());
    // "렌탈기간" 라벨과 실제 기간 값(예: "납품일로부터 21개월까지")이 같은 칸이 아니라
    // 같은 행의 다른 칸에 나뉘어 있는 양식도 있어, 셀 단위 검사 외에 "이 행 어딘가에 렌탈기간 라벨이
    // 있는지"도 같이 봐서 그런 경우까지 렌탈개월수를 놓치지 않게 한다.
    const rowHasRentalLabel = cells.some((c) => c.replace(/\s/g, "").includes("렌탈기간") || c.includes("렌탈"));
    for (const cell of cells) {
      if (!voucherNo) {
        const vn = extractQuoteVoucherNoFromText(cell);
        if (vn) voucherNo = vn;
      }

      let m = cell.match(/수\s*신\s*[:：]\s*([^\n]+)/);
      if (m) {
        const split = splitCustomerAndSite(m[1]);
        customer = split.customer;
        if (split.siteName) siteName = split.siteName;
      }

      // "수신" 칸에 거래처명만 적고 현장명은 "현장명 : ..."처럼 별도 칸에 딱 밝혀 적는 양식도 있다.
      // 이렇게 명시적으로 라벨이 붙은 값은 "수신" 칸에서 하이픈으로 추측해 떼어낸 값보다 확실하므로 항상 우선한다.
      m = cell.match(/현장명\s*[:：]\s*([^\n]+)/);
      if (m) siteName = m[1].trim();

      m = cell.match(/배송지\s*[:：]\s*([^\n]+)/);
      if (m) site = m[1].trim();

      // 참조 = 거래처 담당자
      m = cell.match(/참\s*조\s*[:：]\s*([^\/\n]+)/);
      if (m) refContact = m[1].trim();

      // 전화
      m = cell.match(/전\s*화\s*[:：]\s*([\d\-]+)/);
      if (m) phone = m[1].trim();

      // 이 견적서 양식은 "팩스" 라벨 칸에 실제로는 이메일을 적는 경우가 있어 이메일 형태면 그대로 사용
      m = cell.match(/팩\s*스\s*[:：]\s*([^\s]+@[^\s]+)/);
      if (m) email = m[1].trim();
      if (!email) {
        m = cell.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
        if (m) email = m[1].trim();
      }

      // 수령자/연락처
      m = cell.match(/수령자\s*\/?\s*연락처\s*[:：]\s*([^\n]+)/);
      if (m) recipient = m[1].trim();

      // 배송일자 (YYYY-MM-DD, YYYY.MM.DD, YYYY년 MM월 DD일 등)
      m = cell.match(/배송일자\s*[:：]\s*(\d{4})[.\-\/년]\s*(\d{1,2})[.\-\/월]\s*(\d{1,2})/);
      if (m) deliveryDate = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

      m = cell.match(/발행일\s*[:：]\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
      if (m) {
        issueDate = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
        outDate = issueDate;
      }

      // "담당자"는 우리 쪽 영업담당자를 가리킴 (거래처 담당자는 "참조"로 따로 옴)
      m = cell.match(/담당자\s*[:：]\s*([^\/\n]+)/);
      if (m) manager = m[1].trim();

      // 렌탈/구매 구분은 "렌탈기간" 항목이 있는지 여부로 체크한다(값 형식이 무엇이든 라벨만 있으면 렌탈로 판단).
      if (cell.replace(/\s/g, "").includes("렌탈기간")) transactionType = "rental";

      // "렌탈 10개월"뿐 아니라 "10개월 렌탈기준"처럼 순서가 반대인 표기도 인식한다.
      m = cell.match(/(\d+)\s*개월/);
      if (m && !periodMonths && (cell.includes("렌탈") || rowHasRentalLabel)) {
        transactionType = "rental";
        periodMonths = Number(m[1]);
        periodDays = Number(m[1]) * 30;
      }
      // "렌탈기간" 라벨과 실제 날짜가 같은 칸에 있든("렌탈기간: 2026.09.20~2027.12.19"),
      // 라벨은 옆 칸에 따로 있고 값 칸에 "렌탈 15개월 기준 (2026-09-15~2027-12-14)"처럼 적혀 있든,
      // "렌탈"이 들어간 칸(또는 같은 행에 "렌탈기간" 라벨이 있는 칸)에서 일 단위 시작~종료 날짜를
      // 찾으면 그걸 렌탈개시일의 최우선 근거로 쓴다.
      if (!rentalPeriodRange && (cell.includes("렌탈") || rowHasRentalLabel)) {
        rentalPeriodRange = parseRentalPeriodDateRange(cell);
      }
      // "(YYYY-MM~YYYY-MM)" 요약 표기는 월 단위라 정확도가 떨어지므로,
      // "렌탈 N개월" 값도, 일 단위 날짜 범위도 못 찾았을 때만 보조적으로 사용한다. 구분자가 "."인 표기도 인식한다.
      m = cell.match(/\((\d{4})[.\-](\d{2})~(\d{4})[.\-](\d{2})\)/);
      if (m && !periodMonths && !rentalPeriodRange) {
        transactionType = "rental";
        outDate = `${m[1]}-${m[2]}-01`;
        const endYear = Number(m[3]);
        const endMonth = Number(m[4]);
        const lastDay = new Date(endYear, endMonth, 0).getDate();
        dueDate = `${m[3]}-${m[4]}-${String(lastDay).padStart(2, "0")}`;
      }
    }
  }

  // 렌탈개시일(=배송일자) 우선순위: 1) 명시적 "배송일자:" 라벨  2) "렌탈기간" 칸에 적힌 일 단위 날짜 범위
  // 3) (위에서 처리한) "렌탈 N개월" 월 요약 범위  4) 마지막 수단으로 발행일자.
  // "렌탈기간"에 실제 시작~종료일이 적혀 있으면, 그게 영업사원이 실제로 잡은 배송일이라
  // 견적서를 만든 날짜(발행일자)보다 훨씬 정확하다.
  if (deliveryDate) {
    outDate = deliveryDate;
  } else if (rentalPeriodRange) {
    outDate = rentalPeriodRange.start;
    deliveryDate = outDate;
  } else {
    deliveryDate = outDate;
  }
  if (rentalPeriodRange) dueDate = rentalPeriodRange.end;
  else if (periodMonths) dueDate = addMonthsMinusDay(outDate, periodMonths);

  // 품목 표 시작 행 + 실제 열 위치 찾기 (양식마다 B열부터 시작하거나 C열부터 시작할 수 있음)
  const detected = detectColumns(rows);
  const headerRowIdx = detected ? detected.headerRowIdx : 13;
  let cols = detected ? detected.cols : { item: 2, spec: 3, qty: 4, price: 5, amount: 6, note: 7 };
  let specCol = cols.spec ?? cols.item + 1;
  let noteCol = cols.note ?? cols.amount + 1;

  // 보통은 품목표 헤더 다음 "행"부터 품목이 하나씩 이어지지만, 엑셀에서 복사(Ctrl+C)한 내용을 그대로
  // 붙여넣었을 때 행 구분(줄바꿈)이 통째로 사라지고 탭만 남아서 표 전체가 첫 번째 행 하나에 다 들어있는
  // 경우가 실제로 있다(복사한 프로그램/환경에 따라 발생). 이러면 rows.length가 사실상 1이라 아래 for문이
  // 한 번도 안 돌아서 품목을 하나도 못 찾는다. 품목~비고 칸이 한 행 안에서 서로 일정한 간격으로 발견되면,
  // 그 간격(폭)만큼씩 끊어 읽어서 "가상의 품목 행"들을 다시 만들어준다.
  let itemSource = rows;
  let startIdx = headerRowIdx + 1;
  const colVals = [cols.item, specCol, cols.qty, cols.price, cols.amount, noteCol].filter((v) => v !== undefined && v !== null);
  const headerRow = rows[headerRowIdx] || [];
  const flatWidth = colVals.length === 6 ? Math.max(...colVals) - Math.min(...colVals) + 1 : 0;
  const isFlattenedSingleRow = rows.length <= headerRowIdx + 2 && flatWidth > 0 && headerRow.length > Math.max(...colVals) + flatWidth;
  if (isFlattenedSingleRow) {
    // 중간에 빈 칸("소계" 위 여백 줄 등)이 섞여 있어도 그 뒤에 진짜 품목(배송비 등)이 더 있을 수 있으므로,
    // 빈 chunk를 만나도 멈추지 않고 끝까지(또는 STOP_NAMES를 만날 때까지, 아래 소비 루프에서 처리) 자른다.
    const base = Math.min(...colVals);
    const chunks = [];
    for (let p = base + flatWidth; p < headerRow.length; p += flatWidth) {
      chunks.push(headerRow.slice(p, p + flatWidth));
    }
    // chunk 안에서 품목/규격/수량/단가/금액/비고가 원래 칸 순서 그대로 오도록, 감지된 칸 위치 순서로
    // chunk 안 상대 위치(0~5)를 다시 매긴다(양식마다 칸 순서가 다를 수 있어도 안전하게 대응).
    const order = [
      ["item", cols.item],
      ["spec", specCol],
      ["qty", cols.qty],
      ["price", cols.price],
      ["amount", cols.amount],
      ["note", noteCol],
    ].sort((a, b) => a[1] - b[1]);
    const relCols = {};
    order.forEach(([key], idx) => {
      relCols[key] = idx;
    });
    cols = { item: relCols.item, qty: relCols.qty, price: relCols.price, amount: relCols.amount, note: relCols.note };
    specCol = relCols.spec;
    noteCol = relCols.note;
    itemSource = chunks;
    startIdx = 0;
  }

  const items = [];
  let currentItem = "";
  // 품목별 "현장/구역"은 배송지 주소와는 별개의 정보라, 엑셀 표 안의 소제목 줄(예: "— 사무집기 —")
  // 텍스트만 그대로 쓴다. 배송지 주소를 섞어 넣지 않는다(주소는 상단 "배송지 주소"에 별도로 있음).
  let currentSite = "";

  for (let i = startIdx; i < itemSource.length; i++) {
    const row = itemSource[i] || [];
    const itemCell = cellText(row[cols.item]);
    const specCell = cellText(row[specCol]);
    const qtyRaw = row[cols.qty];
    const priceRaw = row[cols.price];
    const amountRaw = row[cols.amount];
    const noteCell = cellText(row[noteCol]);

    const lower = itemCell.toLowerCase();
    if (STOP_NAMES.includes(lower)) break;
    if (SKIP_NAMES.includes(lower)) continue;
    if (itemCell.startsWith("*") || itemCell.startsWith("※")) continue; // 안내 문구 줄은 건너뜀
    // 품목/규격 칸이 둘 다 비어있으면 표와 무관한 잡음 행(예: 총계 옆 "납품확인" 라벨)이므로 건너뜀
    if (!itemCell && !specCell) continue;

    // 빈 칸 표기가 소스마다 다르다: 엑셀 파일은 빈 칸이 null로 오지만, 붙여넣기는 빈 문자열("")로 온다.
    // 어느 쪽이든 "실제로 텍스트가 있는지"로 판단해야 "ㅡ 소장실 ㅡ" 같은 구획 제목 줄이 품목으로 잘못
    // 등록되지 않는다(빈 문자열은 hasData로 치지 않음).
    const hasData = cellText(qtyRaw) !== "" || cellText(priceRaw) !== "" || cellText(amountRaw) !== "";
    // "— 사무집기 —"처럼 구획 제목인 줄은, 그 줄의 "규격" 칸에 배송지 주소 등 다른 텍스트가 같이 찍혀
    // 있어도(원본 양식에서 병합된 셀 때문에 그렇게 보일 수 있음) 그 텍스트는 진짜 규격이 아니므로 함께
    // 버리고 구역 이름으로만 취급한다. 구획 제목이 아닌 일반 줄은 기존처럼 규격 칸이 정말 비어있을 때만
    // 구역 이름으로 취급한다(규격 있는 일반 품목을 잘못 건너뛰지 않도록).
    if (itemCell && !hasData && (!specCell || isSectionDividerLabel(itemCell))) {
      currentSite = itemCell;
      continue;
    }

    if (itemCell) currentItem = itemCell;
    if (!currentItem) continue;

    // 단가/금액 칸이 "-"(회계서식의 0원 표기)이거나 "47,000"처럼 콤마가 섞여 있어도(붙여넣기는 셀이
    // 항상 문자열로 온다) 안전하게 숫자로 바꾼다.
    const toNum = (v) => {
      const t = cellText(v).replace(/,/g, "");
      if (t === "" || t === "-") return null;
      const n = Number(t);
      return isNaN(n) ? null : n;
    };
    const qty = toNum(qtyRaw) ?? 1;
    const unitPrice = toNum(priceRaw);
    const amount = toNum(amountRaw) ?? (unitPrice != null ? unitPrice * qty : null);

    items.push({
      item: currentItem,
      spec: specCell,
      qty: isNaN(qty) ? 1 : qty,
      unit_price: unitPrice,
      amount: amount,
      note: noteCell,
      site: currentSite,
    });
  }

  return {
    customer,
    site,
    manager,
    voucherNo,
    transactionType,
    outDate,
    dueDate,
    periodDays,
    periodMonths,
    refContact,
    email,
    phone,
    recipient,
    siteName, // "수신" 칸에 "거래처 - 현장명" 식으로 적혀 있으면 자동 인식, 없으면 공란
    // ECOUNT 스타일 입력 화면용, 데이터에서 유추할 수 없어 고정값/공란으로 두는 필드
    warehouse: transactionType === "rental" ? "00008" : transactionType === "purchase" ? "00007" : "",
    dealType: "소매매출",
    currency: "내자",
    project: "",
    headerNote: "", // 특이사항 (전표 전체에 대한 비고, 품목별 비고와는 별개)
    taxInvoice: "",
    items,
  };
}

// ---------- PDF 견적서 파싱 ----------
// 엑셀은 셀 단위라 라벨:값을 깔끔히 구분할 수 있지만, PDF는 글자의 x/y 좌표만 알 수 있어
// (1) 좌표가 비슷한 글자들을 같은 "행"으로 묶고, (2) 같은 행 안에서도 좌/우 2단 구성(예: "발행일 : ..."
// 옆에 "담당자 : ..."가 나란히 붙어있는 경우)을 x 간격이 크게 벌어지는 지점마다 조각으로 나눠 각 조각을
// 엑셀과 동일한 정규식으로 검사하고, (3) 품목 표는 "품목/규격/수량/단가/금액" 머리글 글자의 x 중심 좌표를
// 기준 삼아 그 아래 각 글자를 가장 가까운 열로 분류하는 방식으로 재구성한다.
function pdfGroupRows(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows = [];
  for (const it of sorted) {
    let row = rows.find((r) => Math.abs(r.y - it.y) < 2.5);
    if (!row) {
      row = { y: it.y, items: [] };
      rows.push(row);
    }
    row.items.push(it);
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

// boundaryKeywords를 주면(품목표 머리글을 찾을 때만 씀), 지금까지 이어붙인 단어가 이미 그 목록의 글자와
// "정확히" 같아지는 순간 거기서 끊고 새 단어를 시작한다(간격이 좁아도 더 이어붙이지 않음). 이렇게 해야
// "규 격"처럼 한 라벨 안에서 글자 사이 간격이 넓게 찍힌 경우(간격 기준만으로 붙여야 함)와, "수량"·"단 가"·
// "금 액"처럼 서로 다른 라벨이 폭 좁은 표에서 오히려 더 가깝게 붙어 찍힌 경우(간격 기준만으로는 잘못 붙어버림)를
// 동시에 정확히 구분할 수 있다 — boundaryKeywords가 없으면(일반 데이터 행 처리 등) 기존과 완전히 같게 동작한다.
function pdfMergeWords(rowItems, gapThreshold, boundaryKeywords) {
  const words = [];
  let lastX = null;
  for (const it of rowItems) {
    const last = words[words.length - 1];
    const lastNorm = last ? last.str.replace(/\s/g, "") : "";
    const lastIsCompleteKeyword = !!(boundaryKeywords && boundaryKeywords.includes(lastNorm));
    if (last && lastX !== null && it.x - lastX < gapThreshold && !lastIsCompleteKeyword) {
      last.str += it.str;
      last.endX = it.x + (it.w || 0);
    } else {
      words.push({ str: it.str, x: it.x, endX: it.x + (it.w || 0) });
    }
    lastX = it.x;
  }
  return words.map((w) => ({ ...w, centerX: (w.x + w.endX) / 2 }));
}

// 품목 표 머리글(품목/규격/수량/단가/금액/비고)을 찾을 때 pdfMergeWords에 넘기는 경계 키워드 목록.
const PDF_HEADER_LABEL_KEYWORDS = ["품목", "규격", "수량", "단가", "금액", "비고"];

// 한 행에 라벨:값 쌍이 여러 개(좌/우 2단 구성) 있을 수 있어, x 간격이 크게 벌어지는 지점마다 조각을 나눈다.
function pdfSplitRowSegments(rowItems, gapThreshold = 35) {
  const sorted = [...rowItems].sort((a, b) => a.x - b.x);
  const segments = [];
  let cur = [];
  let lastEnd = null;
  for (const it of sorted) {
    if (lastEnd != null && it.x - lastEnd > gapThreshold) {
      if (cur.length) segments.push(cur);
      cur = [];
    }
    cur.push(it);
    lastEnd = it.x + (it.w || it.str.length * 6);
  }
  if (cur.length) segments.push(cur);
  return segments.map((seg) => seg.map((i) => i.str).join("").trim()).filter(Boolean);
}

function pdfParseNum(str) {
  if (str == null) return null;
  const cleaned = String(str).replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

// 품목 표의 한 줄(row.items = pdf.js 텍스트 조각들)을 품목/규격/수량/단가/금액/비고 칸으로 분류한다.
// 두 가지 흔한 오분류를 막는다.
// 1) 왼쪽 정렬된 넓은 칸(예: "규격"에 긴 스펙 설명)은 글자가 칸 가운데가 아니라 칸의 왼쪽 끝(=옆 칸에 더
//    가까운 위치)에서 시작하는 경우가 많다. 조각의 "시작 위치"만 보고 칸을 정하면 옆의 좁은 칸(예: "품목")
//    쪽으로 잘못 판정될 수 있어, 조각 전체의 "가운데 위치"(x + 너비/2)로 판정한다.
// 2) 일부 견적서 양식은 "수량 + 단가 + 금액"처럼 서로 다른 칸에 걸친 값들을, 칸 사이 넓은 간격을 공백 여러
//    칸으로만 표현한 채 하나의 텍스트 조각으로 통째로 찍어낸다(별도로 위치를 다시 잡지 않는 PDF 생성 방식).
//    이 경우 조각 하나를 통째로 한 칸에 넣으면 "수량"만 이상하게 큰 숫자로 찍히고 "단가"·"금액"은 비어버린다.
//    그래서 공백 두 칸 이상(칸 사이만큼 넓은 간격)이 조각 안에 있으면 그 지점 기준으로 잘게 쪼개고, 조각별로
//    글자 폭 비례로 위치를 추정해 각자 따로 칸을 판정한다. 보통 문장 안의 단어 사이 한 칸 공백(예: "규격"
//    설명 안의 "W1800*D800, 보조포함")은 이 기준(2칸 이상)에 걸리지 않아 하나의 칸 값으로 그대로 유지된다.
function classifyPdfRowItems(rowItems, colCenters) {
  const classify = (x) => {
    let best = null;
    let bestDist = Infinity;
    for (const [k, cx] of Object.entries(colCenters)) {
      const d = Math.abs(x - cx);
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    }
    return best;
  };
  const bucket = { item: [], spec: [], qty: [], price: [], amount: [], note: [] };
  for (const it of rowItems || []) {
    const w = it.w || it.str.length * 6;
    const pieces = it.str.split(/\s{2,}/).filter(Boolean);
    if (pieces.length > 1) {
      const charW = it.str.length ? w / it.str.length : 6;
      let searchFrom = 0;
      for (const piece of pieces) {
        const idx = it.str.indexOf(piece, searchFrom);
        searchFrom = idx + piece.length;
        const pieceCenterX = it.x + (idx + piece.length / 2) * charW;
        bucket[classify(pieceCenterX)].push(piece);
      }
      continue;
    }
    bucket[classify(it.x + w / 2)].push(it.str);
  }
  return bucket;
}

async function parseQuotePdf(file) {
  const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
  // 워커 파일을 프로젝트 번들 안에 직접 넣으면 Vercel 빌드 압축 도구(Terser)가 이 파일의 최신 모듈 문법을
  // 처리하지 못해 빌드가 실패한다. 그래서 번들에 포함시키지 않고 CDN 주소를 그대로 가리키게 한다.
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const allPagesItems = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))
      .filter((it) => it.str !== "");
    allPagesItems.push(items);
  }

  let customer = "";
  let site = "";
  let manager = "";
  let issueDate = todayISO();
  let transactionType = "purchase";
  let outDate = issueDate;
  let dueDate = null;
  let periodDays = null;
  let periodMonths = null;
  let refContact = "";
  let email = "";
  let phone = "";
  let recipient = "";
  let deliveryDate = "";
  let rentalPeriodRange = null; // "렌탈기간" 칸에 일 단위 시작~종료 날짜가 적혀 있으면 그 값 ({start, end})
  let siteName = "";
  let voucherNo = ""; // 견적서 상단 "#숫자" 관리번호를 찾으면 전표번호로 자동 채움(못 찾으면 그대로 공란, 직접 입력)

  // 1) 첫 페이지 위쪽 정보 영역에서 라벨:값 스캔 (엑셀 버전과 동일한 정규식을 그대로 사용)
  const firstPageRows = pdfGroupRows(allPagesItems[0] || []);
  for (const row of firstPageRows) {
    const segs = pdfSplitRowSegments(row.items);
    // "렌탈기간" 라벨과 실제 기간 값이 같은 칸이 아니라 같은 줄의 다른 칸에 나뉘어 있는 양식도 있어,
    // 셀 단위 검사 외에 "이 줄 어딘가에 렌탈기간 라벨이 있는지"도 같이 봐서 렌탈개월수를 놓치지 않게 한다.
    const rowHasRentalLabel = segs.some((c) => c.replace(/\s/g, "").includes("렌탈기간") || c.includes("렌탈"));
    for (const cell of segs) {
      if (!voucherNo) {
        const vn = extractQuoteVoucherNoFromText(cell);
        if (vn) voucherNo = vn;
      }

      let m = cell.match(/수\s*신\s*[:：]\s*([^\n]+)/);
      if (m) {
        const split = splitCustomerAndSite(m[1]);
        customer = split.customer;
        if (split.siteName) siteName = split.siteName;
      }

      // "수신" 칸과 별도로 "현장명 : ..."처럼 명시적으로 적힌 양식은 그 값을 그대로 우선 사용한다.
      m = cell.match(/현장명\s*[:：]\s*([^\n]+)/);
      if (m) siteName = m[1].trim();

      m = cell.match(/배송지\s*[:：]\s*([^\n]+)/);
      if (m) site = m[1].trim();

      m = cell.match(/참\s*조\s*[:：]\s*([^\/\n]+)/);
      if (m) refContact = m[1].trim();

      m = cell.match(/전\s*화\s*[:：]\s*([\d\-]+)/);
      if (m) phone = m[1].trim();

      m = cell.match(/팩\s*스\s*[:：]\s*([^\s]+@[^\s]+)/);
      if (m) email = m[1].trim();
      if (!email) {
        m = cell.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
        if (m) email = m[1].trim();
      }

      m = cell.match(/수령자\s*\/?\s*연락처\s*[:：]\s*([^\n]+)/);
      if (m) recipient = m[1].trim();

      m = cell.match(/배송일자\s*[:：]\s*(\d{4})[.\-\/년]\s*(\d{1,2})[.\-\/월]\s*(\d{1,2})/);
      if (m) deliveryDate = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

      m = cell.match(/발행일\s*[:：]\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
      if (m) {
        issueDate = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
        outDate = issueDate;
      }

      m = cell.match(/담당자\s*[:：]\s*([^\/\n]+)/);
      if (m) manager = m[1].trim();

      // 렌탈/구매 구분은 "렌탈기간" 항목이 있는지 여부로 체크한다(값 형식이 무엇이든 라벨만 있으면 렌탈로 판단).
      if (cell.replace(/\s/g, "").includes("렌탈기간")) transactionType = "rental";

      // "렌탈 10개월"뿐 아니라 "10개월 렌탈기준"처럼 순서가 반대인 표기도 인식한다.
      m = cell.match(/(\d+)\s*개월/);
      if (m && !periodMonths && (cell.includes("렌탈") || rowHasRentalLabel)) {
        transactionType = "rental";
        periodMonths = Number(m[1]);
        periodDays = Number(m[1]) * 30;
      }
      // "렌탈기간" 라벨과 실제 날짜가 같은 칸에 있든("렌탈기간: 2026.09.20~2027.12.19"),
      // 라벨은 옆 칸에 따로 있고 값 칸에 "렌탈 15개월 기준 (2026-09-15~2027-12-14)"처럼 적혀 있든,
      // "렌탈"이 들어간 칸(또는 같은 줄에 "렌탈기간" 라벨이 있는 칸)에서 일 단위 시작~종료 날짜를
      // 찾으면 그걸 렌탈개시일의 최우선 근거로 쓴다.
      if (!rentalPeriodRange && (cell.includes("렌탈") || rowHasRentalLabel)) {
        rentalPeriodRange = parseRentalPeriodDateRange(cell);
      }
      // 구분자가 "."인 표기("(YYYY.MM~YYYY.MM)")도 인식한다. "렌탈 N개월" 값도, 일 단위 날짜 범위도 못 찾았을 때만 보조적으로 사용.
      m = cell.match(/\((\d{4})[.\-](\d{2})~(\d{4})[.\-](\d{2})\)/);
      if (m && !periodMonths && !rentalPeriodRange) {
        transactionType = "rental";
        outDate = `${m[1]}-${m[2]}-01`;
        const endYear = Number(m[3]);
        const endMonth = Number(m[4]);
        const lastDay = new Date(endYear, endMonth, 0).getDate();
        dueDate = `${m[3]}-${m[4]}-${String(lastDay).padStart(2, "0")}`;
      }
    }
  }
  // 렌탈개시일(=배송일자) 우선순위: 1) 명시적 "배송일자:" 라벨  2) "렌탈기간" 칸에 적힌 일 단위 날짜 범위
  // 3) (위에서 처리한) "렌탈 N개월" 월 요약 범위  4) 마지막 수단으로 발행일자.
  if (deliveryDate) {
    outDate = deliveryDate;
  } else if (rentalPeriodRange) {
    outDate = rentalPeriodRange.start;
    deliveryDate = outDate;
  } else {
    deliveryDate = outDate;
  }
  if (rentalPeriodRange) dueDate = rentalPeriodRange.end;
  else if (periodMonths) dueDate = addMonthsMinusDay(outDate, periodMonths);

  // 2) 품목 표 파싱 (여러 페이지에 걸쳐 있을 수 있음)
  let colCenters = null;
  const items = [];
  let currentItem = "";
  // 품목별 "현장/구역"은 배송지 주소와는 별개의 정보라, PDF 표 안의 구획 제목 텍스트만 그대로 쓴다.
  let currentSite = "";
  let stopped = false;

  for (const pageItems of allPagesItems) {
    if (stopped) break;
    const rows = pdfGroupRows(pageItems);

    let headerRow = null;
    let headerCols = null;
    for (const row of rows) {
      // 견적서 양식에 따라 "규격" 같은 헤더 글자 사이 간격이 유독 넓게 찍히는 경우가 있어(예: 규/격 사이 38px),
      // 기존 30px 기준으로는 두 글자가 합쳐지지 않아 헤더를 못 찾고 그 페이지 전체를 건너뛰는 문제가 있었다.
      // 헤더 줄은 어차피 몇 글자 안 되는 라벨만 있는 줄이라 기준을 넉넉히 늘려도 다른 오탐 위험은 거의 없다.
      // 다만 표 폭이 좁은 양식은 반대로 "수량"·"단가"·"금액"처럼 서로 다른 라벨끼리 오히려 이 기준보다 더
      // 가깝게 붙어 찍히는 경우가 있어(예: 수량↔단가 27px), boundaryKeywords로 라벨이 완성되는 순간 거기서
      // 끊어서 서로 다른 라벨이 하나로 합쳐지지 않게 한다(그대로 두면 단가·금액 칸이 통째로 수량 칸에
      // 뒤섞여 들어가서 수량이 어마어마하게 큰 숫자로 잘못 인식되고 단가·금액은 빈 칸이 돼버린다).
      const words = pdfMergeWords(row.items, 45, PDF_HEADER_LABEL_KEYWORDS);
      const norm = words.map((w) => w.str.replace(/\s/g, ""));
      const find = (pred) => words[norm.findIndex(pred)];
      const item = find((s) => s.includes("품") && s.includes("목"));
      const spec = find((s) => s.includes("규격"));
      const qty = find((s) => s.includes("수량"));
      const price = find((s) => s.includes("단가"));
      const amount = find((s) => s.includes("금액"));
      const note = find((s) => s.includes("비고"));
      if (item && spec && qty && price && amount) {
        headerRow = row;
        headerCols = { item, spec, qty, price, amount, note };
        break;
      }
    }
    if (headerCols) {
      colCenters = {
        item: headerCols.item.centerX,
        spec: headerCols.spec.centerX,
        qty: headerCols.qty.centerX,
        price: headerCols.price.centerX,
        amount: headerCols.amount.centerX,
        note: headerCols.note ? headerCols.note.centerX : headerCols.amount.centerX + 60,
      };
    }
    if (!colCenters) continue; // 이 페이지엔 아직 품목 표 머리글이 없음(정보 영역만 있는 페이지 등)

    const dataRows = headerRow ? rows.filter((r) => r.y < headerRow.y - 3) : rows;

    for (const row of dataRows) {
      const bucket = classifyPdfRowItems(row.items, colCenters);
      const itemStr = bucket.item.join("").trim();
      const specStr = bucket.spec.join(" ").trim();
      const qtyStr = bucket.qty.join("").trim();
      const priceStr = bucket.price.join("").trim();
      const amountStr = bucket.amount.join("").trim();
      const noteStr = bucket.note.join(" ").trim();

      if (!itemStr && !specStr && !qtyStr && !priceStr && !amountStr && !noteStr) continue;
      // "(Product)/(Description)/..." 같은 영문 보조헤더 줄은 실제 데이터가 아니므로 통째로 건너뜀
      if (itemStr.startsWith("(") || specStr.startsWith("(")) continue;

      const lowerItem = itemStr.toLowerCase();
      const lowerSpec = specStr.toLowerCase();
      if (STOP_NAMES.includes(lowerItem) || STOP_NAMES.includes(lowerSpec)) {
        stopped = true;
        break;
      }

      const qtyNum = pdfParseNum(qtyStr);
      const priceNum = pdfParseNum(priceStr);
      const amountNum = pdfParseNum(amountStr);
      const hasData = qtyNum != null || priceNum != null || amountNum != null;
      // "ㅡ 사무집기 ㅡ"/"— 사무집기 —" 같은 구획 제목인지 판단(엑셀 파싱과 같은 공통 기준 사용)
      const isDivider = isSectionDividerLabel(itemStr);

      // 구획 제목 줄은, 좌표 인식 특성상 그 줄의 "규격" 칸 위치에 배송지 주소 등 다른 텍스트가 같이 찍혀도
      // (병합된 셀 등) 그건 진짜 규격이 아니므로 함께 버리고 구역 이름으로만 취급한다(엑셀 파싱과 동일 기준).
      if (itemStr && !hasData && (isDivider || !specStr)) {
        if (isDivider) {
          // 품목별 "현장/구역"은 배송지 주소와 별개라, 배송지 주소를 섞지 않고 구획 제목 텍스트만 그대로 쓴다.
          currentSite = itemStr;
          continue;
        }
        // 병합된 셀 라벨(예: "파티션")은 위아래 두 데이터 행 사이 중앙에 자기 혼자만 있는 줄로 찍혀 나오는
        // 경우가 있어, 그 라벨이 실제로는 "바로 위 데이터 행"의 품목명인데 그 행에는 직접 붙어있지 않고 지금
        // 이 줄로 따로 찍힌 것이다. 바로 위 행이 자기 줄에 직접 품목명을 갖고 있지 않았다면(=이전 품목명을
        // 그냥 이어받은 것뿐이라면) 지금 읽은 진짜 이름으로 소급 정정한다.
        currentItem = itemStr;
        const last = items[items.length - 1];
        if (last && !last._explicitItem) last.item = itemStr;
        continue;
      }

      if (itemStr && !isDivider) currentItem = itemStr;
      if (itemStr.startsWith("*") || itemStr.startsWith("※")) continue;
      if (!hasData) continue;

      items.push({
        item: currentItem,
        spec: specStr,
        qty: qtyNum ?? 1,
        unit_price: priceNum,
        amount: amountNum ?? (priceNum != null ? priceNum * (qtyNum ?? 1) : null),
        note: noteStr,
        site: currentSite,
        _explicitItem: !!(itemStr && !isDivider), // 이 줄 자체에 품목명이 직접 찍혀 있었는지(파싱 내부용, DB에는 저장 안 함)
      });
    }
  }

  return {
    customer,
    site,
    manager,
    voucherNo,
    transactionType,
    outDate,
    dueDate,
    periodDays,
    periodMonths,
    refContact,
    email,
    phone,
    recipient,
    siteName,
    warehouse: transactionType === "rental" ? "00008" : transactionType === "purchase" ? "00007" : "",
    dealType: "소매매출",
    currency: "내자",
    project: "",
    headerNote: "",
    taxInvoice: "",
    items,
  };
}

// ---------- 일반 PDF → 엑셀 변환 (새 메뉴 "PDF를 엑셀로 변환", 2026-10-06 추가) ----------
// "피디에프 파일 올리면 엑셀로 이상하게 말고 보이는 화면 똑같이 엑셀로 변환해주는 기능" 요청으로 추가.
// 위의 parseQuotePdf는 우리 회사 견적서 양식을 안다는 전제로 품목/금액 등 정해진 자리를 찾아 읽지만,
// 이 변환기는 어떤 PDF든 양식을 전혀 모른 채 "글자가 찍힌 위치"만 보고 줄·칸으로 나눠 그대로 엑셀에 옮긴다.
//
// (2026-10-06 재작성) 처음엔 "페이지 전체에서 비슷한 x 위치끼리 하나의 칸으로 묶는" 방식이었는데,
// 실제 한글(HWP)로 만든 공문 PDF로 테스트해보니 엉망으로 깨졌다("호환 좀 신경써줘" 신고). 원인은
// 두 가지였다: ① 표가 아닌 일반 문서는 줄마다 글자가 전혀 다른 x 위치에서 시작해서, 페이지 전체
// 기준으로 "칸"을 잡으면 사실상 거의 모든 글자 조각이 자기 혼자만의 칸이 돼버린다. ② "수  신"처럼
// 라벨 글자 사이에 정렬용으로 넓은 공백을 일부러 넣어둔 경우, 같은 단어의 글자들마저 서로 다른
// 칸으로 쪼개져 버린다. 그래서 페이지 전체를 아우르는 칸 경계를 만드는 대신, 줄마다 따로 "그 줄
// 안에서 간격이 넓게 벌어지는 지점"만 기준으로 칸을 나누는 방식으로 바꿨다(견적서 업로드의 라벨:값
// 2단 인식에 이미 쓰고 있던 pdfSplitRowSegments와 같은 방식). 표의 진짜 칸 사이는 보통 글자 한 칸
// 너비보다 훨씬 넓게 벌어져 있어서 이 기준으로도 잘 갈라지고, 반대로 한 문장 안의 단어 사이나 "수 신"
// 같은 라벨 안의 글자 사이는 간격이 좁아 한 칸으로 자연스럽게 합쳐진다. 줄마다 칸 개수가 다를 수
// 있지만(표가 아닌 문서는 대부분 한 줄에 칸이 하나뿐), 표 형식 문서는 보통 모든 줄의 칸 개수가
// 똑같이 나와서 결과적으로 엑셀에서도 줄끼리 칸이 잘 맞는다.
//
// (2026-10-06 추가 보완) 실제 엑셀/한글 혼합 양식의 "렌탈 견적서" PDF로 다시 테스트해보니("차이가
// 심각하다" 신고), 품목명 칸이 유난히 좁고 규격 칸의 글자가 길어서 칸 경계에 거의 붙는 줄에서는
// gapThreshold=35로도 품목명과 규격이 한 칸으로 잘못 합쳐지는 경우가 있었다. 실제 PDF 데이터로
// "반드시 합쳐져야 하는 간격(라벨 안 글자 사이, 최대 약 29)"과 "반드시 나뉘어야 하는 간격(진짜 칸
// 사이, 최소 약 31.6)"을 직접 비교해 그 사이 값인 30으로 낮췄다 — 한글 공문 PDF 쪽은 이 값으로 바꿔도
// 결과가 그대로였고(여유 있는 범위라 안전), 렌탈 견적서 쪽은 품목명/규격이 더 잘 나뉘는 것으로 확인됨.
// (참고: pdfSplitRowSegments 자체의 기본값 35는 그대로 둠 — 견적서 업로드의 2단 라벨:값 인식이
// 이미 그 기본값에 맞춰 잘 동작하고 있어서, 거기엔 영향이 가지 않도록 이 함수 호출 쪽에서만 30을 썼다.)
function buildPdfPageGridAOA(items, gapThreshold = 30) {
  const rows = pdfGroupRows(items); // 위→아래 순, 각 줄 안에서는 왼쪽→오른쪽 순
  return rows.map((r) => pdfSplitRowSegments(r.items, gapThreshold));
}

// 업로드한 PDF 파일(여러 페이지 가능)을 읽어 페이지별 엑셀 시트 내용을 만든다. parseQuotePdf와 똑같은
// 방식(pdfjs-dist로 글자 조각의 x/y 좌표를 읽음)을 쓰되, 특정 항목을 찾아내지 않고 줄·칸 구성만 그대로 돌려준다.
async function convertPdfFileToSheets(file) {
  const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
  // 이유는 parseQuotePdf와 동일: 워커 파일을 번들에 포함시키면 Vercel 빌드 압축 도구가 처리하지 못해
  // 빌드가 실패하므로, 번들에 넣지 않고 CDN 주소를 그대로 가리키게 한다.
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;

  const sheets = [];
  let anyTextFound = false;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))
      .filter((it) => it.str.trim() !== "");
    if (items.length > 0) anyTextFound = true;
    const aoa = buildPdfPageGridAOA(items);
    sheets.push({ name: doc.numPages > 1 ? `${p}페이지` : "Sheet1", aoa: aoa.length ? aoa : [[""]] });
  }
  return { sheets, anyTextFound };
}

// ---------- A/S 접수 및 처리보고서 엑셀 파싱 ----------
// 이 양식은 품목표처럼 행이 반복되는 표가 아니라, "라벨 칸 + 값 칸"이 나란히 있는 1장짜리 양식이다(예:
// "고 객 명" 칸 바로 오른쪽에 실제 고객명이 적힌 칸이 옴). 그래서 견적서 파싱과 달리, 각 행을 훑으면서
// 라벨 칸을 찾으면 그 오른쪽에서 처음 만나는 비어있지 않은 칸을 값으로 삼는 방식으로 읽는다.
// 라벨 사이에 공백/줄바꿈이 들어가 있어도(예: "고 객 명", "귀책사유\n발생시점") 비교 전에 모두 지워서 맞춘다.
function normalizeLabel(s) {
  return (s || "").replace(/\s/g, "");
}

const AS_FORM_LABELS = [
  { key: "faultDept", label: "귀책사유부서" },
  { key: "customerName", label: "고객명" },
  { key: "contact", label: "전화번호" },
  { key: "address", label: "주소" },
  { key: "shipmentPlace", label: "출하장소" },
  { key: "productName", label: "제품명" },
  { key: "purchaseDate", label: "구입일" },
  { key: "productType", label: "상품유형" },
  { key: "seller", label: "판매자" },
  { key: "courier", label: "배송자" },
  { key: "visitDate", label: "방문일" },
  { key: "receiver", label: "접수자" },
  { key: "issueType", label: "유형" },
  { key: "content", label: "A/S원인및상담내용" },
  { key: "faultPoint", label: "귀책사유발생시점" },
];
const AS_FORM_LABEL_SET = new Set(AS_FORM_LABELS.map((f) => normalizeLabel(f.label)));
// "귀책사유부서" 칸 바로 옆에는 우리가 읽지 않는 결재란("결재/담당/팀장/본부장/대표이사")이 붙어있는 양식이 많아,
// 그 칸들이 비어있는 값 칸으로 잘못 읽히지 않도록 값 찾기에서 함께 건너뛴다.
const AS_FORM_NONVALUE_TOKENS = new Set(["결재", "담당", "팀장", "본부장", "대표이사"].map(normalizeLabel));

// NO.(관리번호)는 양식 맨 위쪽에 "NO. 21048"처럼 라벨과 숫자가 한 칸에 같이 적혀 있는 경우가 많아
// 위쪽 몇 줄만 따로 훑어서 찾는다(ECOUNT 등 기존 시스템의 A/S 관리번호와 그대로 연결하기 위한 값).
function extractAsManagementNo(rows) {
  const topRows = rows.slice(0, 5);
  for (const row of topRows) {
    for (const cell of row || []) {
      const t = cellText(cell);
      const m = t.match(/NO\.?\s*[:.]?\s*(\d{3,10})/i);
      if (m) return m[1];
    }
  }
  return "";
}

function parseAsRequestRows(rows) {
  const result = {
    managementNo: extractAsManagementNo(rows),
    faultDept: "",
    customerName: "",
    contact: "",
    address: "",
    shipmentPlace: "",
    productName: "",
    purchaseDate: "",
    productType: "",
    seller: "",
    courier: "",
    visitDate: "",
    receiver: "",
    issueType: "",
    content: "",
    faultPoint: "",
  };

  for (const row of rows) {
    const cells = (row || []).map(cellText);
    for (let i = 0; i < cells.length; i++) {
      const norm = normalizeLabel(cells[i]);
      if (!norm) continue;
      const field = AS_FORM_LABELS.find((f) => normalizeLabel(f.label) === norm);
      if (!field || result[field.key]) continue; // 라벨 칸 자체는 값이 아니고, 이미 채워진 항목은 건드리지 않는다(첫 값 우선).
      for (let j = i + 1; j < cells.length; j++) {
        if (!cells[j].trim()) continue; // 빈 칸은 건너뛴다
        // 다음으로 만난 비어있지 않은 칸이 또 다른 라벨이면(예: "귀책사유부서" 칸이 비어있고 바로 옆이 "결재"
        // 칸인 경우), 그 라벨을 값으로 잘못 채우지 않도록 이 라벨의 값은 못 찾은 것으로 남겨둔다.
        const jNorm = normalizeLabel(cells[j]);
        if (AS_FORM_LABEL_SET.has(jNorm) || AS_FORM_NONVALUE_TOKENS.has(jNorm)) break;
        result[field.key] = cells[j].trim();
        break;
      }
    }
  }

  return result;
}

async function parseAsRequestExcel(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const visibleSheetNames = wb.SheetNames.filter((name) => {
    const meta = (wb.Workbook?.Sheets || []).find((s) => s.name === name);
    return !meta || !meta.Hidden;
  });
  const firstSheetName = visibleSheetNames[0] || wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, cellDates: true });
  return parseAsRequestRows(rows);
}

// 엑셀에서 긁어 붙여넣은 텍스트도(클립보드에 탭/줄바꿈으로 구분된 TSV로 담기므로) 파일 업로드와 같은 방식으로 읽는다.
function parseAsRequestPastedText(text) {
  const rows = parsePastedTable(text);
  return parseAsRequestRows(rows);
}

// 파싱 결과(camelCase)를 as_requests 테이블 컬럼(snake_case)으로 옮긴다.
function asParsedToDbFields(parsed) {
  return {
    management_no: parsed.managementNo || null,
    fault_dept: parsed.faultDept || null,
    customer_name: parsed.customerName || "",
    contact: parsed.contact || null,
    address: parsed.address || null,
    shipment_place: parsed.shipmentPlace || null,
    product_name: parsed.productName || null,
    purchase_date: parsed.purchaseDate || null,
    product_type: parsed.productType || null,
    seller: parsed.seller || null,
    courier: parsed.courier || null,
    visit_date: parsed.visitDate || null,
    receiver: parsed.receiver || null,
    issue_type: parsed.issueType || null,
    content: parsed.content || "",
    fault_point: parsed.faultPoint || null,
    status: "접수",
  };
}

// ---------- 렌탈품목 회수 지시서 엑셀 파싱 ----------
// A/S 양식과 같은 "라벨 칸 + 값 칸" 구조지만, 아래쪽에 품목/규격/수량이 반복되는 표(회수할 물건 목록)가
// 추가로 붙어있다. 그래서 (1) 표가 시작되는 줄 앞까지는 라벨:값 스캔으로 상단 정보를 읽고,
// (2) 표가 시작되는 줄부터는 견적서 품목표와 같은 방식(품목 칸이 비어있으면 바로 위 품목명을 이어받음)으로 읽는다.
const COLLECTION_FORM_LABELS = [
  { key: "voucherNoRaw", label: "전표번호" },
  { key: "requestType", label: "구분" },
  { key: "customerName", label: "상호" },
  { key: "collectionDate", label: "회수일" },
  { key: "contact", label: "담당자" },
  { key: "address", label: "주소" },
  { key: "phone", label: "TEL" },
  { key: "originalCourier", label: "최초배송자" },
  { key: "author", label: "작성자" },
];
const COLLECTION_FORM_LABEL_SET = new Set(COLLECTION_FORM_LABELS.map((f) => normalizeLabel(f.label)));
// A/S 양식과 마찬가지로 "최초배송자" 옆이 비어있고 그 옆이 바로 "작성자" 라벨인 식으로, 라벨끼리 붙어있는
// 경우가 있어 값 찾기에서 다른 라벨은 항상 건너뛴다(COLLECTION_FORM_LABEL_SET). 결재란처럼 라벨이 아닌
// 잡음 토큰도 섞일 수 있어 A/S와 같은 방식으로 별도 토큰도 건너뛴다.
const COLLECTION_FORM_NONVALUE_TOKENS = new Set(["담당", "팀장", "본부장", "대표이사", "서명"].map(normalizeLabel));

// 품목표 머리글 행을 찾는다. 견적서 표(detectColumns)와 달리 이 양식엔 단가/금액 칸이 없어서
// "품목" + "수량" 칸만 있으면 인정한다("규격" 칸은 있을 수도, 없을 수도 있다).
function detectCollectionItemColumns(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const cols = {};
    row.forEach((cell, idx) => {
      const t = cellText(cell).replace(/\s/g, "");
      if (!t) return;
      if (t.includes("품") && t.includes("목")) cols.item = idx;
      else if (t.includes("규격")) cols.spec = idx;
      else if (t.includes("수량")) cols.qty = idx;
    });
    if (cols.item !== undefined && cols.qty !== undefined) {
      return { headerRowIdx: i, cols };
    }
  }
  return null;
}

// 표 시작 행 다음 줄부터 "품목/규격/수량이 모두 빈 줄"을 만날 때까지 읽는다(그 다음부터는 리모컨 회수
// 체크란 등 표와 무관한 안내 문구 구간). "파티션"처럼 같은 품목이 규격만 다른 여러 줄로 이어질 때
// 품목 칸을 첫 줄에만 적고 아래 줄은 비워두는 경우가 많아, 견적서 품목표 파싱과 동일하게 직전 품목명을 이어받는다.
function parseCollectionItemRows(rows, headerRowIdx, cols) {
  const specCol = cols.spec ?? cols.item + 1;
  const items = [];
  let currentItem = "";
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const itemCell = cellText(row[cols.item]);
    const specCell = cellText(row[specCol]);
    const qtyText = cellText(row[cols.qty]);
    if (!itemCell && !specCell && !qtyText) break;
    if (itemCell) currentItem = itemCell;
    if (!currentItem) continue;
    const n = Number(qtyText.replace(/,/g, ""));
    const qty = qtyText === "" || isNaN(n) ? 1 : n;
    items.push({ item: currentItem, spec: specCell, qty });
  }
  return items;
}

function parseCollectionRequestRows(rows) {
  const result = {
    managementNo: extractAsManagementNo(rows),
    voucherNoRaw: "",
    voucherNo: "",
    requestType: "",
    customerName: "",
    contact: "",
    collectionDate: "",
    address: "",
    phone: "",
    originalCourier: "",
    author: "",
    items: [],
  };

  const detected = detectCollectionItemColumns(rows);
  const headerScanRows = detected ? rows.slice(0, detected.headerRowIdx) : rows;
  for (const row of headerScanRows) {
    const cells = (row || []).map(cellText);
    for (let i = 0; i < cells.length; i++) {
      const norm = normalizeLabel(cells[i]);
      if (!norm) continue;
      const field = COLLECTION_FORM_LABELS.find((f) => normalizeLabel(f.label) === norm);
      if (!field || result[field.key]) continue;
      for (let j = i + 1; j < cells.length; j++) {
        if (!cells[j].trim()) continue;
        const jNorm = normalizeLabel(cells[j]);
        if (COLLECTION_FORM_LABEL_SET.has(jNorm) || COLLECTION_FORM_NONVALUE_TOKENS.has(jNorm)) break;
        result[field.key] = cells[j].trim();
        break;
      }
    }
  }

  // "전표번호" 칸의 값은 "#2609231"처럼 적혀 있어 견적서 전표번호와 같은 방식(숫자만)으로 뽑아내되,
  // 혹시 "#"+숫자 정확한 형식이 아니면 "#"만 떼어낸 값이라도 그대로 쓴다.
  result.voucherNo = extractQuoteVoucherNoFromText(result.voucherNoRaw) || result.voucherNoRaw.replace(/^#/, "").trim();
  delete result.voucherNoRaw;

  if (detected) result.items = parseCollectionItemRows(rows, detected.headerRowIdx, detected.cols);

  return result;
}

async function parseCollectionRequestExcel(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const visibleSheetNames = wb.SheetNames.filter((name) => {
    const meta = (wb.Workbook?.Sheets || []).find((s) => s.name === name);
    return !meta || !meta.Hidden;
  });
  const firstSheetName = visibleSheetNames[0] || wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, cellDates: true });
  return parseCollectionRequestRows(rows);
}

function parseCollectionRequestPastedText(text) {
  const rows = parsePastedTable(text);
  return parseCollectionRequestRows(rows);
}

// 파싱 결과(camelCase)를 collection_requests 테이블 컬럼(snake_case)으로 옮긴다.
function collectionParsedToDbFields(parsed) {
  return {
    management_no: parsed.managementNo || null,
    voucher_no: parsed.voucherNo || null,
    request_type: parsed.requestType || null,
    customer_name: parsed.customerName || "",
    contact: parsed.contact || null,
    collection_date: parsed.collectionDate || null,
    address: parsed.address || null,
    phone: parsed.phone || null,
    original_courier: parsed.originalCourier || null,
    author: parsed.author || null,
    items: parsed.items || [],
    status: "접수",
  };
}

// A/S 접수 내용(자유 텍스트)에서 "품목명 + 수량"을 최대한 자동으로 읽어본다. 줄바꿈/쉼표/모점으로 나눈 뒤
// 각 조각 끝의 숫자(+ea/개)를 수량으로 삼고 나머지를 품목명으로 쓴다. 정확하지 않을 수 있어, 이 결과는
// 전표로 등록하기 전에 사람이 확인·수정하는 화면에서만 초안으로 쓰인다(현장별 렌탈잔량의 A/S 전표 추가).
// 견적서는 품목/규격/색상/수량이 칸으로 나뉘어 있지만, A/S장에는 같은 내용을 "사무책상, 탑책상,
// W1600*D800, 연체리, 2개"처럼 쉼표로 나열한 한 줄짜리 글로 적는다(첫 칸이 품목, 마지막 칸이 수량,
// 그 사이가 규격·색상). 이 줄바꿈·쉼표 구조를 견적서 표와 같은 방식(품목〓규격〓색상 키)으로 갈라 읽으면,
// 이미 등록된 같은 품목(사무책상)에 정확히 합쳐진다 — 이 함수가 그 변환을 담당한다.
// (줄에 쉼표가 하나도 없으면 예전처럼 "품목명 + 끝자리 수량"만 보고 통짜 품목명으로 처리한다.)
function parseAsContentItems(text) {
  if (!text) return [];
  const chunks = String(text)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const results = [];
  for (const chunk of chunks) {
    const cleaned = chunk.replace(/\s*외\s*$/, "");
    let parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    let qty = null;
    const last = parts[parts.length - 1];
    // 마지막 칸이 "2개"/"3ea"처럼 수량만 딱 있으면 그대로 떼어낸다.
    let m = last.match(/^(\d+)\s*(?:ea|개)?$/i);
    if (m) {
      qty = Number(m[1]);
      parts = parts.slice(0, -1);
    } else {
      // "연체리 2ea"처럼 마지막 칸에 글자+수량이 붙어있으면, 수량만 떼어내고 남은 글자는 그대로 규격/색상에 둔다.
      m = last.match(/^(.*?)\s+(\d+)\s*(?:ea|개)?$/i);
      if (m && m[1].trim()) {
        qty = Number(m[2]);
        parts = [...parts.slice(0, -1), m[1].trim()];
      }
    }
    if (parts.length === 0) continue;
    if (qty == null) qty = 1;

    if (parts.length === 1) {
      results.push({ item: parts[0], spec: "", qty });
    } else {
      // 첫 칸은 품목, 나머지는 견적서 규격 칸과 똑같이 이어붙여둔다(끝 칸이 등록된 색상명과 일치하면
      // splitLedgerSpecColor가 견적서 전표 추가와 동일하게 색상을 따로 떼어내 같은 품목으로 맞춰준다).
      results.push({ item: parts[0], spec: parts.slice(1).join(", "), qty });
    }
  }
  return results;
}

// ---------- 메인 ----------
// 핸드폰처럼 좁은 화면(768px 이하)인지 감지한다. 화면 회전·창 크기 변경에도 실시간으로 반영되도록
// resize 이벤트를 듣는다. 서버 렌더링 시점에는 window가 없어 일단 false(PC 기준)로 시작하고,
// 화면에 붙은 뒤(useEffect) 실제 폭을 읽어온다.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  // 로그인(인증) 자체는 성공했는데 계정 정보(profiles 테이블) 조회가 실패하는 경우를 화면에 알려주기 위한 상태.
  // 예전에는 이 경우 아무 안내 없이 조용히 로그인 화면으로 되돌아가서, 사용자 입장에서는 "로그인이 무반응"인 것처럼 보였다.
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadProfile(data.session);
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (sess) loadProfile(sess);
      else {
        setSession(null);
        setProfile(null);
        setProfileError("");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(sess) {
    setSession(sess);
    setProfileError("");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", sess.user.id).single();
    if (error) {
      setProfile(null);
      setProfileError(
        "로그인은 되었지만 계정 정보를 불러오지 못했습니다. 관리자에게 문의해 주세요. (" + (error.message || "profiles 조회 실패") + ")"
      );
    } else {
      setProfile(data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, color: C.inkSoft }}>
        불러오는 중…
      </div>
    );
  }
  if (session && profileError) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, padding: 24 }}>
        <div style={{ width: 420, maxWidth: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 14.5, color: C.brick, marginBottom: 20, lineHeight: 1.6 }}>{profileError}</div>
          <button onClick={() => supabase.auth.signOut()} style={primaryBtnStyle}>
            다시 로그인
          </button>
        </div>
      </div>
    );
  }
  if (!session || !profile) return <LoginScreen />;
  return <Dashboard profile={profile} session={session} onLogout={() => supabase.auth.signOut()} />;
}

// 로그인 아이디에 "@"가 없으면(직원용 짧은 아이디, 예: re001) 내부적으로 가짜 도메인을 붙여
// 이메일 형식으로 만들어 로그인한다. "@"가 포함돼 있으면(실제 이메일) 입력값을 그대로 쓴다.
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
  // "로그인 아이디/비밀번호를 잊으셨나요?" 요청(2026-10-04)에 따라 추가한 계정 찾기 모달 노출 여부.
  const [showRecovery, setShowRecovery] = useState(false);

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
          <div style={{ fontFamily: serif, fontSize: 31, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink }}>리마켓 영업관리 시스템</div>
          <div style={{ fontSize: 13.5, color: C.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
            출고부터 회수까지, 렌탈·구매 현황을 한 곳에서 확인합니다.
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
          <button
            type="button"
            onClick={() => setShowRecovery(true)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "center",
              background: "transparent",
              border: "none",
              color: C.inkSoft,
              fontSize: 12.5,
              marginTop: 14,
              cursor: "pointer",
              fontFamily: sans,
              textDecoration: "underline",
            }}
          >
            아이디/비밀번호를 잊으셨나요?
          </button>
        </form>
      </div>
      {showRecovery && <AccountRecoveryModal onClose={() => setShowRecovery(false)} />}
    </div>
  );
}

// "아이디/비밀번호를 잊으셨나요?" 모달(2026-10-04 추가).
// 이름+휴대전화번호가 profiles 테이블에 등록된 값과 정확히 일치하는 직원 1명을 서버(/api/account-recovery)가
// 찾아서, 로그인 아이디와 새로 발급한 임시 비밀번호를 알려준다. (전화번호를 등록해두지 않은 직원은
// 이 기능을 쓸 수 없고, 관리자가 Supabase 대시보드에서 직접 비밀번호를 재설정해줘야 한다.)
function AccountRecoveryModal({ onClose }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { loginId, tempPassword }
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!name.trim() || !phone.trim()) {
      setErr("이름과 휴대전화번호를 모두 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const resp = await fetch("/api/account-recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setErr(data.error || "일치하는 계정을 찾을 수 없어요. 관리자에게 문의해주세요.");
      } else {
        setResult(data);
      }
    } catch (e2) {
      setErr("서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,20,0.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", width: "min(380px, 100%)", border: `1px solid ${C.line}`, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: serif, fontSize: 16 }}>아이디/비밀번호 찾기</div>
          <button type="button" onClick={onClose} style={ghostBtnStyle}>닫기</button>
        </div>

        {result ? (
          <div>
            <div style={{ fontSize: 13.5, lineHeight: 1.9, marginBottom: 16 }}>
              <div>로그인 아이디: <b>{result.loginId}</b></div>
              <div>임시 비밀번호: <b>{result.tempPassword}</b></div>
            </div>
            <div style={{ fontSize: 12.5, color: C.brick, marginBottom: 16, lineHeight: 1.6 }}>
              이 임시 비밀번호는 지금만 보이고 다시는 확인할 수 없어요. 꼭 적어두신 뒤 로그인하시고, 로그인 후
              오른쪽 위 "내 정보"에서 바로 원하는 비밀번호로 바꿔주세요.
            </div>
            <button type="button" onClick={onClose} style={primaryBtnStyle}>확인했어요</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 14, lineHeight: 1.6 }}>
              등록된 이름과 휴대전화번호가 모두 일치하면, 로그인 아이디와 새 임시 비밀번호를 알려드려요.
            </div>
            <Field label="이름">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} autoFocus />
            </Field>
            <Field label="휴대전화번호 (등록된 번호)">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="예: 01012345678" />
            </Field>
            {err && <div style={{ color: C.brick, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <button type="submit" disabled={busy} style={primaryBtnStyle}>
              {busy ? "확인 중…" : "확인"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value, color, active, onClick, last }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: "left",
        padding: "14px 16px",
        background: active ? C.bg : "transparent",
        border: "none",
        borderRight: last ? "none" : `1px solid ${C.line}`,
        cursor: "pointer",
        fontFamily: sans,
      }}
    >
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontFamily: serif, color: color || C.ink }}>{value}</div>
    </button>
  );
}

// "내 정보" 모달(2026-10-04 추가) — 이름/로그인 아이디/역할을 보여주고, 본인 비밀번호를 바꿀 수 있게 한다.
// 비밀번호를 바꾸기 전에 "현재 비밀번호"를 한 번 더 확인(재로그인 시도)해서, 자리를 비운 사이 다른
// 사람이 함부로 비밀번호를 바꿔버리는 일을 막는다.
function MyInfoModal({ profile, session, onClose }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loginId = deriveLoginId(session?.user?.email);
  const isAdmin = profile.role === "admin";
  const isSales = profile.role === "sales";

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!currentPw || !newPw || !confirmPw) {
      setErr("모든 칸을 입력해주세요.");
      return;
    }
    if (newPw.length < 6) {
      setErr("새 비밀번호는 6자 이상이어야 해요.");
      return;
    }
    if (newPw !== confirmPw) {
      setErr("새 비밀번호와 확인이 서로 달라요.");
      return;
    }
    setBusy(true);
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPw,
      });
      if (verifyErr) {
        setErr("현재 비밀번호가 올바르지 않아요.");
        setBusy(false);
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) {
        setErr("비밀번호 변경에 실패했어요. (" + (updateErr.message || "") + ")");
      } else {
        setMsg("비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용해주세요.");
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      }
    } catch (e2) {
      setErr("서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,20,0.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", width: "min(420px, 100%)", maxHeight: "92vh", overflow: "auto", border: `1px solid ${C.line}`, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: serif, fontSize: 17 }}>내 정보</div>
          <button type="button" onClick={onClose} style={ghostBtnStyle}>닫기</button>
        </div>

        <div style={{ fontSize: 13.5, color: C.inkSoft, marginBottom: 20, lineHeight: 1.8 }}>
          <div><span style={{ color: C.muted }}>이름 </span>{profile.name}</div>
          <div><span style={{ color: C.muted }}>로그인 아이디 </span>{loginId}</div>
          <div>
            <span style={{ color: C.muted }}>역할 </span>
            {isAdmin ? "관리자" : isSales ? `영업담당자 (${profile.manager_name || ""})` : `${profile.company || ""} 담당자`}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>비밀번호 변경</div>
          <form onSubmit={submit}>
            <Field label="현재 비밀번호">
              <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} style={inputStyle} autoFocus />
            </Field>
            <Field label="새 비밀번호 (6자 이상)">
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="새 비밀번호 확인">
              <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle} />
            </Field>
            {err && <div style={{ color: C.brick, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            {msg && <div style={{ color: C.green, fontSize: 13, marginBottom: 12 }}>{msg}</div>}
            <button type="submit" disabled={busy} style={primaryBtnStyle}>
              {busy ? "변경 중…" : "비밀번호 변경"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ profile, session, onLogout }) {
  // "내 정보" 화면(이름/로그인 아이디/역할 확인 + 비밀번호 변경) 노출 여부(2026-10-04 추가).
  const [showMyInfo, setShowMyInfo] = useState(false);
  const isAdmin = profile.role === "admin";
  const isSales = profile.role === "sales"; // 영업담당자 계정: 본인 담당자명과 일치하는 데이터만 보고 관리할 수 있음
  const isStaff = isAdmin || isSales; // 내부 직원(관리자+영업담당자)은 같은 화면 구성을 쓰고, 실제 데이터 범위는 DB 권한(RLS)이 갈라준다.
  const managerName = profile.manager_name || "";
  // 실제로 사이드바·헤더를 그리는 게 이 컴포넌트라 핸드폰 화면 감지도 여기서 해야 한다(Home이 아니라).
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // 관리자 계정을 여러 직원이 같이 쓰다 보니, "내 이름"을 이 브라우저에 저장해두면 A/S·회수 등록 시
  // 작성자 칸에 자동으로 채워준다(로그인 계정과 별개로, 실제로 이 화면을 쓰고 있는 사람 이름).
  const [myName, setMyNameState] = useState(() => getMyName());
  const [rentals, setRentals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [shares, setShares] = useState([]);
  // 지분관리 목록의 비고(전표/행 단위) — voucher_shares의 지분사별 비고와는 별개의 새 테이블(voucher_equity_notes)에서 불러온다.
  const [equityNotes, setEquityNotes] = useState([]);
  const [tonOverrides, setTonOverrides] = useState([]); // 기준표에 없어 직원이 직접 입력해 저장해둔 톤수(품목/규격별), 다음 견적서부터 자동으로 채워짐
  const [activeTab, setActiveTab] = useState(null); // 로그인/새로고침 직후엔 메뉴 아무것도 선택 안 된 "무" 상태로 시작하고, 직접 눌러야만 해당 화면으로 이동한다.
  // 지분관리 화면은 목록/상세 중 어디에 있었는지를 자체적으로 기억하고 있어서, 메뉴의 "지분관리"를
  // 다시 눌러도(이미 그 탭이어도) 항상 목록 화면으로 되돌아가도록 이 값을 바꿔서 강제로 새로 마운트시킨다.
  const [sharesResetKey, setSharesResetKey] = useState(0);
  // 렌탈내역도 마찬가지로, 메뉴의 "렌탈내역"을 다시 눌렀을 때(이미 그 탭이어도) 상세화면이 아니라
  // 항상 목록 화면으로 되돌아가도록 이 값을 바꿔서 강제로 새로 마운트시킨다.
  const [rentalsResetKey, setRentalsResetKey] = useState(0);
  // 구매내역(렌탈내역에서 구분된 별도 메뉴)도 같은 이유로 리셋 키를 따로 둔다.
  const [purchasesResetKey, setPurchasesResetKey] = useState(0);
  // 판매현황도 전표번호를 눌러 상세화면으로 들어갈 수 있게 됐으니, 메뉴를 다시 눌렀을 때 항상 검색화면으로 되돌아가게 한다.
  const [salesResetKey, setSalesResetKey] = useState(0);
  // 출고/회수 내역서도 대장 상세화면에 들어갈 수 있으니, 메뉴를 다시 눌렀을 때 항상 대장 목록으로 되돌아가게 한다.
  const [ledgerResetKey, setLedgerResetKey] = useState(0);
  // 현장별 렌탈잔량(자동등록)도 같은 이유로 리셋 키를 따로 둔다.
  const [ledgerAutoResetKey, setLedgerAutoResetKey] = useState(0);
  const [asboardResetKey, setAsboardResetKey] = useState(0);
  const [collectionboardResetKey, setCollectionboardResetKey] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [importState, setImportState] = useState(null); // parsed preview
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchRentals();
    fetchCustomers();
    fetchShares();
    fetchEquityNotes();
    fetchTonOverrides();
  }, []);

  async function fetchRentals() {
    setLoadingData(true);
    const { data, error } = await supabase.from("rentals").select("*").order("due_date", { ascending: true, nullsFirst: false });
    if (!error) setRentals(data || []);
    setLoadingData(false);
  }

  async function fetchCustomers() {
    const { data, error } = await supabase.from("customers").select("*");
    if (!error) setCustomers(data || []);
  }

  async function fetchShares() {
    const { data, error } = await supabase.from("voucher_shares").select("*");
    if (!error) setShares(data || []);
  }

  async function fetchEquityNotes() {
    const { data, error } = await supabase.from("voucher_equity_notes").select("*");
    if (!error) setEquityNotes(data || []);
    // 테이블이 아직 안 만들어져 있어도(마이그레이션 전) 에러를 조용히 무시한다.
  }

  async function fetchTonOverrides() {
    const { data, error } = await supabase.from("ton_overrides").select("*");
    if (!error) setTonOverrides(data || []);
    // 테이블이 아직 안 만들어져 있어도(마이그레이션 전) 에러를 조용히 무시하고 기준표만으로 계산한다.
  }

  async function processQuoteFile(file) {
    if (!file) return;
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    try {
      const parsed = isPdf ? await parseQuotePdf(file) : await parseQuoteExcel(file);
      parsed.isPdf = isPdf;
      // 품목/규격 기준으로 기준표(+직원이 이전에 저장해둔 값)를 찾아 화물차 적재 톤수를 자동으로 채운다.
      parsed.items = withComputedTons(parsed.items, tonOverrides, parsed.site);
      // 전표번호는 견적서 상단의 "#숫자" 관리번호를 찾았으면 자동으로 채워두되(parseQuotePdf/parseQuoteExcel에서
      // 처리), 못 찾았을 땐 예전처럼 그대로 공란이라 직접 입력해야 한다. 어느 쪽이든 등록 확인 화면에서
      // 직접 수정할 수 있고, 비어있으면 등록 버튼(confirmImport)이 막아준다.
      // 영업담당자 계정은 견적서에 어떤 이름이 적혀 있든 항상 본인 이름으로 담당자를 고정한다(다른 사람 이름으로 잘못 등록되는 것을 방지).
      if (!isAdmin) parsed.manager = managerName;
      parsed._sourceFile = file; // 원본 파일 자체(등록 확정 시 Storage에 업로드해서 나중에 다시 다운로드할 수 있게 함)
      setImportState(parsed);
      if (isPdf && parsed.items.length === 0) {
        alert("PDF에서 품목을 인식하지 못했어요. 표 형식이 다를 수 있으니 아래 내용을 직접 채워주시거나 엑셀 버전으로 올려주세요.");
      }
    } catch (err) {
      alert(isPdf ? "PDF 파일을 읽는 중 문제가 발생했어요. 형식을 확인하시거나 엑셀 버전으로 올려주세요." : "엑셀 파일을 읽는 중 문제가 발생했어요. 형식을 확인해주세요.");
      console.error(err);
    }
  }

  // 엑셀 파일을 올리는 대신, 엑셀에서 긁은(복사한) 견적서 내용을 그대로 붙여넣어도 파일 업로드와 똑같이
  // 전표 정보/품목이 채워지게 한다(관리 중인 엑셀 탭이 여러 개라 파일로 저장/업로드하기보다 바로 복사해서
  // 붙여넣는 게 더 간편하다는 요청). 이후 흐름(확인 화면, 등록)은 파일 업로드와 완전히 동일하다.
  function processPastedQuote(text) {
    if (!text || !text.trim()) return;
    try {
      const parsed = parsePastedQuoteText(text);
      parsed.isPdf = false;
      parsed.items = withComputedTons(parsed.items, tonOverrides, parsed.site);
      // 전표번호는 parsePastedQuoteText에서 "#숫자" 관리번호를 찾았으면 이미 채워져 있고, 못 찾았으면
      // 예전처럼 공란이라 직접 입력해야 한다(등록 확인 화면에서 언제든 직접 수정 가능).
      if (!isAdmin) parsed.manager = managerName;
      // 붙여넣기는 원본 파일이 없으니 Storage 업로드(원본 파일 저장) 단계는 건너뛴다.
      setImportState(parsed);
      if (parsed.items.length === 0) {
        alert("붙여넣은 내용에서 품목을 인식하지 못했어요. 품목/규격/수량이 있는 표까지 포함해서 다시 붙여넣어주세요.");
      }
    } catch (err) {
      alert("붙여넣은 내용을 읽는 중 문제가 발생했어요.");
      console.error(err);
    }
  }

  async function confirmImport() {
    if (!importState) return;
    if (!(importState.voucherNo || "").trim()) {
      alert("전표번호를 입력해주세요.");
      return;
    }
    setImporting(true);

    const rows = importState.items.map((it, idx) => ({
      // 견적서에 나온 순서 그대로 화면에 보이도록 등록 순번을 저장해둔다.
      line_no: idx,
      transaction_type: importState.transactionType,
      customer: importState.customer,
      site: it.site,
      // site(현장/구역)는 품목별 소제목(예: "1층", "사무집기")까지 섞여 들어갈 수 있는 값이라,
      // 전표 상세 화면의 "배송지 주소"는 여기 오염되지 않도록 별도 칼럼에 원본 배송지 주소를 그대로 저장해둔다.
      site_address: importState.site || null,
      item: it.item,
      spec: it.spec,
      qty: it.qty,
      unit_price: it.unit_price,
      amount: it.amount,
      out_date: importState.outDate,
      period_days: importState.periodDays,
      period_months: importState.periodMonths || null,
      due_date: importState.dueDate,
      collected: false,
      collect_date: null,
      manager: importState.manager,
      voucher_no: importState.voucherNo || null,
      note: it.note,
      site_name: importState.siteName || null,
      ref_contact: importState.refContact || null,
      email: importState.email || null,
      phone: importState.phone || null,
      recipient: importState.recipient || null,
      warehouse: importState.warehouse || null,
      deal_type: importState.dealType || null,
      project: importState.project || null,
      tax_invoice: importState.taxInvoice || null,
    }));
    const { error } = await supabase.from("rentals").insert(rows);
    if (error) {
      setImporting(false);
      alert("등록 중 오류가 발생했어요: " + error.message);
      return;
    }

    // 원본 견적서 파일(엑셀/PDF)을 Storage에 올려서 나중에 전표 상세화면에서 그대로 다시 다운로드할 수 있게 한다.
    // rentals 행이 이미 등록된 뒤에 업로드해야, 업로드 권한 검사(RLS)가 "이 전표번호가 내 담당 데이터인지"를 확인할 수 있다.
    const sourceFile = importState._sourceFile;
    if (sourceFile && importState.voucherNo) {
      // Supabase Storage는 파일 키(경로)에 한글 등 비-ASCII 문자가 들어가면 "Invalid key" 오류를 낸다.
      // 실제 파일명은 source_file_name 컬럼에 그대로 저장해 다운로드 시 보여주고,
      // 저장 경로 자체는 전표번호/확장자 등 안전한 문자만 남겨서 만든다.
      const safeVoucherNo = (importState.voucherNo || "").replace(/[^a-zA-Z0-9_-]/g, "") || "voucher";
      const extMatch = sourceFile.name.match(/\.[a-zA-Z0-9]+$/);
      const ext = extMatch ? extMatch[0] : "";
      const path = `quotes/${safeVoucherNo}/${Date.now()}${ext}`;
      const { error: uploadError } = await supabase.storage.from("quote-files").upload(path, sourceFile, { upsert: false });
      if (uploadError) {
        console.error("원본 파일 업로드 실패:", uploadError);
        alert("데이터는 정상 등록됐지만, 원본 파일 저장에는 실패했어요: " + uploadError.message);
      } else {
        await supabase
          .from("rentals")
          .update({ source_file_path: path, source_file_name: sourceFile.name })
          .eq("voucher_no", importState.voucherNo);
      }
    }

    // 사업자등록증을 이번에 새로 올렸으면(견적서입력 화면에서 첨부) 같은 방식으로 Storage에 저장한다.
    // (rentals 행이 등록된 뒤라야 업로드 권한 검사를 통과하므로 원본 견적서 파일과 같은 시점에 처리한다)
    let bizCertPath = importState.bizCertPath || null;
    const bizCertFile = importState._bizCertFile;
    if (bizCertFile && importState.voucherNo) {
      const safeVoucherNo = (importState.voucherNo || "").replace(/[^a-zA-Z0-9_-]/g, "") || "voucher";
      const extMatch = bizCertFile.name.match(/\.[a-zA-Z0-9]+$/);
      const ext = extMatch ? extMatch[0] : "";
      const path = `quotes/${safeVoucherNo}/biz-cert-${Date.now()}${ext}`;
      const { error: certUploadError } = await supabase.storage.from("quote-files").upload(path, bizCertFile, { upsert: false });
      if (certUploadError) {
        console.error("사업자등록증 업로드 실패:", certUploadError);
        alert("데이터는 정상 등록됐지만, 사업자등록증 저장에는 실패했어요: " + certUploadError.message);
      } else {
        bizCertPath = path;
      }
    }

    // 거래처 정보(담당자/연락처/메일/사업자등록번호/사업자등록증)를 customers 테이블에도 반영해둔다.
    // 사업자등록번호가 있으면 그걸 기준으로 합쳐서(같은 번호=같은 거래처) 이름 표기가 달라도 하나로 통일되게 하고,
    // 사업자등록번호가 없으면(옛 방식) 이름 기준으로 합친다.
    if (importState.customer && (importState.refContact || importState.phone || importState.email || importState.bizRegNo || bizCertPath)) {
      const patch = { name: importState.customer };
      if (importState.refContact) patch.contact_name = importState.refContact;
      if (importState.phone) patch.phone = importState.phone;
      if (importState.email) patch.email = importState.email;
      if (importState.bizRegNo) patch.business_reg_no = importState.bizRegNo;
      if (bizCertPath) patch.biz_cert_path = bizCertPath;
      const conflictKey = importState.bizRegNo ? "business_reg_no" : "name";
      const { error: customerUpsertError } = await supabase.from("customers").upsert(patch, { onConflict: conflictKey });
      if (customerUpsertError) console.error("거래처 정보 저장 실패:", customerUpsertError);
    }

    setImporting(false);
    setImportState(null);
    fetchCustomers();
    fetchRentals();
  }

  // "배치 시뮬레이션을 견적서 업로드 메뉴 위(전체 2번째)로 옮겨달라"는 요청에 따라, 원래
  // "품목별데이터/톤수/배송비" 다음(견적서 업로드 앞)에 있던 것을 여기(품목별데이터/톤수/배송비 바로
  // 다음, 견적서 업로드 바로 앞)로 옮겼다. 순서만 바뀐 것이고 각 메뉴의 key·화면은 그대로다.
  // 그 뒤 문구도 "배치 시뮬레이션" → "가구배치(시뮬레이션)"으로 바뀌었다(key는 그대로 layoutSim).
  const menuItems = [
    ...(isStaff ? [{ key: "quickcalc", label: "품목별데이터/톤수/배송비" }] : []),
    ...(isStaff ? [{ key: "layoutSim", label: "가구배치(시뮬레이션)" }] : []),
    ...(isStaff ? [{ key: "photoLibrary", label: "제품사진 라이브러리" }] : []),
    ...(isStaff ? [{ key: "pdfToExcel", label: "PDF를 엑셀로 변환" }] : []),
    ...(isStaff ? [{ key: "quote", label: "견적서 업로드" }] : []),
    ...(isStaff ? [{ key: "rentals", label: "렌탈내역" }] : []),
    ...(isStaff ? [{ key: "purchases", label: "구매내역" }] : []),
    ...(isStaff ? [{ key: "shares", label: "지분관리" }] : []),
    ...(isStaff ? [{ key: "sales", label: "판매현황" }] : []),
    ...(isStaff ? [{ key: "customerData", label: "업체별데이터" }] : []),
    ...(isStaff ? [{ key: "asboard", label: "A/S관리대장" }] : []),
    ...(isStaff ? [{ key: "collectionboard", label: "렌탈회수관리" }] : []),
    ...(isStaff ? [{ key: "ledgerAuto", label: "현장별 렌탈잔량(자동등록)", star: true }] : []),
    ...(isStaff ? [{ key: "ledger", label: "현장별 렌탈잔량(심화관리)", star: true, starColor: "#FF1E1E" }] : []),
  ];

  // 데스크톱 사이드바와 핸드폰 슬라이드 메뉴 둘 다 같은 메뉴 버튼 목록을 그대로 재사용한다
  // (핸드폰에서는 메뉴를 고르면 바로 닫히도록 mobileMenuOpen을 같이 꺼준다).
  const menuButtonsJsx = menuItems.map((m) => {
    const active = activeTab === m.key;
    return (
      <button
        key={m.key}
        className={`rm-menu-btn${active ? "" : " is-inactive"}`}
        onClick={() => {
          setMobileMenuOpen(false);
          setActiveTab(m.key);
          if (m.key === "shares") setSharesResetKey((k) => k + 1); // 지분관리는 눌릴 때마다 목록 화면으로 리셋
          if (m.key === "rentals") setRentalsResetKey((k) => k + 1); // 렌탈내역도 눌릴 때마다 목록 화면으로 리셋
          if (m.key === "purchases") setPurchasesResetKey((k) => k + 1); // 구매내역도 눌릴 때마다 목록 화면으로 리셋
          if (m.key === "sales") setSalesResetKey((k) => k + 1); // 판매현황도 눌릴 때마다 검색 화면으로 리셋
          if (m.key === "ledger") setLedgerResetKey((k) => k + 1); // 출고/회수 내역서도 눌릴 때마다 대장 목록으로 리셋
          if (m.key === "ledgerAuto") setLedgerAutoResetKey((k) => k + 1); // 현장별 렌탈잔량(자동등록)도 눌릴 때마다 목록으로 리셋
          if (m.key === "asboard") setAsboardResetKey((k) => k + 1); // A/S관리대장도 눌릴 때마다 목록 화면으로 리셋
          if (m.key === "collectionboard") setCollectionboardResetKey((k) => k + 1); // 렌탈회수관리도 눌릴 때마다 목록 화면으로 리셋
          if (m.key === "quote") setImportState(null); // 견적서 업로드도 다른 메뉴 갔다가 눌릴 때마다 업로드/붙여넣기 미리보기를 리셋
        }}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "13px 12px",
          marginBottom: 2,
          borderRadius: 8,
          // (2026-09-30 재수정) "메뉴바 남색/보라색이 별로다, 더 섹시하고 세련되게" 피드백으로, 선택된
          // 메뉴를 밋밋한 단색 대신 그라데이션 + 은은한 글로우로 채워서 입체감을 줬다(사이드바가 아이보리
          // 밝은 톤으로 바뀐 뒤에도 선택된 메뉴는 이 보라색 알약 모양으로 또렷하게 도드라진다).
          background: active ? `linear-gradient(135deg, ${C.purple}, ${C.purpleDark})` : "transparent",
          border: "none",
          boxShadow: active ? "0 4px 16px rgba(91, 79, 229,0.45)" : "none",
          color: active ? "#fff" : C.inkSoft,
          fontSize: 14,
          fontWeight: active ? 600 : 500,
          cursor: "pointer",
          fontFamily: sans,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "inline-block", width: 15, color: m.starColor || (active ? "#fff" : "#F2C744") }}>
          {m.star ? "★" : ""}
        </span>
        {m.label}
      </button>
    );
  });
  const activeMenuItem = menuItems.find((m) => m.key === activeTab);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans, color: C.ink }}>
      <style>{`
        .rm-menu-btn { transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease; }
        .rm-menu-btn.is-inactive:hover { background: ${C.purpleBg} !important; color: ${C.ink} !important; }
        .rm-logout-btn:hover { background: ${C.bg}; border-color: ${C.ink}; color: ${C.ink}; }
        .col-resize-bar { background: #C7CDD6; transition: background 0.12s ease, width 0.12s ease; }
        .col-resize-handle:hover .col-resize-bar { background: ${C.ink}; width: 4px; }
        /* "좀 더 프로페셔널하고 전문적인 모던 SaaS 느낌으로" 요청(2026-09-30)에 맞춰, 버튼을 누를 수
           있다는 반응과 입력창에 지금 포커스가 가 있다는 표시를 화면 전체에 한 번에 통일해서 넣었다.
           개별 버튼·입력창 하나하나를 고친 게 아니라 여기 전역 규칙 하나로 모든 화면에 똑같이 적용되게
           했고, 이미 자기만의 hover 효과가 따로 정의된 버튼(로그아웃·왼쪽 메뉴 등)은 그쪽이 우선 적용돼
           그대로 유지된다. */
        button:not(.rm-menu-btn):not(:disabled) {
          transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease, filter 0.12s ease;
        }
        button:not(.rm-menu-btn):not(:disabled):hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
          box-shadow: 0 4px 10px rgba(28,43,58,0.14);
          border-color: ${C.purple}; /* border가 none인 버튼(진한 남색 버튼 등)은 안 보이는 값이라 영향 없음 */
        }
        button:not(.rm-menu-btn):not(:disabled):active {
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
        /* 핸드폰(768px 이하)에서 입력칸 글씨가 16px보다 작으면 아이폰 사파리가 탭할 때마다 화면을
           자동으로 확대해버려서 계속 다시 축소해야 하는 게 제일 불편했던 부분이라, 여기서만 강제로 16px로 키운다.
           나머지 화면은 원래 디자인 그대로 유지된다. */
        @media (max-width: 768px) {
          input, select, textarea { font-size: 16px !important; }
        }
      `}</style>
      {/* "과감하게" 요청으로 제목 아래 브랜드 바를 넣어서, 어느 화면을 열어도 "리마켓" 제품임이
          한눈에 각인되도록 했다(예전엔 옅은 회색 줄 하나뿐이었다). (2026-09-30 재수정) 톤을 더 또렷한
          인디고 바이올렛으로 바꾸고, 바 아래에 은은한 포인트 컬러 그림자를 살짝 깔아서 입체감을 더했다.
          (2026-10-01 재수정) "보라색 줄을 섹시한 브라운으로" 요청에 따라, 이 머리글 밑줄을 비롯해 아래
          카드들 위쪽에 깔린 같은 보라색 포인트 줄(3px 굵기 accent bar)을 전부 brownAccent로 바꿨다 —
          버튼 hover·입력창 focus처럼 "지금 반응 중"임을 알려주는 보라색은 그대로 남겨, 평소에 늘 보이는
          장식용 줄만 브라운으로 통일했다. */}
      <div style={{ borderBottom: `3px solid ${C.brownAccent}`, background: C.panel, boxShadow: "0 1px 0 rgba(28,43,58,0.06), 0 10px 24px -16px rgba(140,106,66,0.35)" }}>
        {/* (2026-09-30 미세조정) "왼쪽으로 공간이 더 있으니 왼쪽으로 이동시켜달라"는 요청으로, 가운데
            정렬(margin: 0 auto)을 없애고 왼쪽에 바짝 붙였다. maxWidth도 1600→1900으로 넓혀서 오른쪽
            본문 영역(화면 폭이 넓은 표 등)이 더 시원하게 쓸 수 있게 했다. 아래 본문 줄(사이드바+본문)도
            이 줄과 정확히 같은 maxWidth·정렬·좌우 패딩(24px)을 쓰기 때문에, 이 제목 글씨의 시작점과
            사이드바 메뉴판의 왼쪽 끝이 항상 같은 x좌표에서 시작한다. */}
        <div style={{ maxWidth: 1900, margin: 0, padding: isMobile ? "12px 14px" : "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                aria-label="메뉴 열기"
                style={{ flexShrink: 0, width: 38, height: 38, border: `1px solid ${C.line}`, background: "transparent", borderRadius: 6, fontSize: 17, color: C.ink, cursor: "pointer" }}
              >
                ☰
              </button>
            )}
            {/* "제목 글씨를 약간만 더 섹시하게" 요청으로, 단색 대신 잉크색→포인트 컬러로 은은하게
                번지는 그러데이션 글자색을 줬다(과하지 않게 살짝만). (2026-09-30 미세조정) "약간만 더
                오른쪽으로 와도 되겠다"는 요청으로 살짝만(marginLeft) 오른쪽으로 밀었다 — 사이드바 자체
                위치는 그대로다. */}
            <div
              style={{
                fontFamily: serif,
                fontSize: isMobile ? 17.5 : 22,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                marginLeft: isMobile ? 0 : 6,
                background: `linear-gradient(115deg, ${C.ink} 35%, ${C.purple} 115%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              리마켓 영업관리 시스템
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {isStaff && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 2 }}>내 이름 (작성자 자동입력)</div>
                <input
                  value={myName}
                  onChange={(e) => setMyNameState(e.target.value)}
                  onBlur={(e) => setMyName(e.target.value)}
                  placeholder="예: 신상헌"
                  title="여기 적어두면 A/S·회수 등록 시 작성자 칸에 자동으로 채워져요(이 컴퓨터·브라우저에만 저장돼요)"
                  style={{ ...smallInputStyle, width: 110, textAlign: "right" }}
                />
              </div>
            )}
            <div style={{ fontSize: 13, color: C.inkSoft, textAlign: "right" }}>
              <div style={{ color: C.ink, fontWeight: 600 }}>{profile.name}</div>
              <div style={{ fontSize: 11.5 }}>{isAdmin ? "관리자" : isSales ? `${managerName} 담당자` : `${profile.company} 담당자`}</div>
            </div>
            <button className="rm-logout-btn" onClick={() => setShowMyInfo(true)} style={ghostBtnStyle}>내 정보</button>
            <button className="rm-logout-btn" onClick={onLogout} style={ghostBtnStyle}>로그아웃</button>
          </div>
        </div>
      </div>
      {showMyInfo && <MyInfoModal profile={profile} session={session} onClose={() => setShowMyInfo(false)} />}

      {/* (2026-09-30 미세조정) 위 헤더 줄과 똑같이 maxWidth 1900 + margin 0(왼쪽 고정)으로 맞췄다.
          예전엔 둘 다 "margin: 0 auto"로 가운데 정렬돼 있었는데, 그러면 화면 세로 스크롤바가 생겼다
          없어졌다 할 때마다(탭을 옮겨다닐 때 본문 높이가 바뀌면서) 가운데 정렬 기준점 자체가 미세하게
          움직여서 사이드바 전체가 옆으로 몇 픽셀씩 "덜컹"거리며 흔들려 보이는 원인이 됐다("메뉴판이 버튼
          누를 때마다 약간씩 이동한다"는 신고). 왼쪽에 고정하면 스크롤바 유무와 무관하게 이 블록의 왼쪽
          끝은 항상 같은 자리라 더 이상 흔들리지 않는다. */}
      <div style={{ maxWidth: 1900, margin: 0, padding: isMobile ? "14px 12px 50px" : "28px 24px 60px", display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 24, alignItems: "flex-start" }}>
        {!isMobile && (
          // 왼쪽 메뉴를 본문과 구분되는 별도 "탐색 영역"으로 보이게 한다. 검정→브라운→독자 아이보리까지
          // 계속 "구리다"는 반응이었는데(2026-09-30 6~7차 수정) "옆 본문 배경이랑 색을 맞춰라" +
          // "테두리만 고급지게 브라운으로" 요청대로, 배경은 본문과 완전히 같은 C.bg를 쓰고 테두리 한
          // 줄만 고급스러운 브라운(sidebarBorder)으로 골라 넣었다. 무거운 그림자 대신 아주 옅은 그림자만
          // 살짝 남겨 붕 뜨지 않고 자연스럽게 붙어 보이게 했다.
          <aside
            style={{
              width: 232,
              flexShrink: 0,
              border: `1.5px solid ${C.brownAccent}`,
              borderRadius: 10,
              background: C.bg,
              padding: 6,
              position: "sticky",
              top: 20,
              boxShadow: "0 2px 10px rgba(28,43,58,0.06)",
            }}
          >
            <div style={{ padding: "10px 12px 8px", fontSize: 10.5, color: C.muted, letterSpacing: 1.2, fontWeight: 600 }}>MENU</div>
            {menuButtonsJsx}
          </aside>
        )}

        {isMobile && (
          <button
            onClick={() => setMobileMenuOpen(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 6, background: C.panel, color: C.ink, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            <span>{activeMenuItem?.star ? "★ " : ""}{activeMenuItem?.label || "메뉴"}</span>
            <span style={{ color: C.muted, fontSize: 12, fontWeight: 500 }}>메뉴 ▾</span>
          </button>
        )}

        {isMobile && mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(20,20,20,0.45)", zIndex: 60, display: "flex" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: "80vw", maxWidth: 300, height: "100%", background: C.bg, borderRight: `1.5px solid ${C.brownAccent}`, padding: 6, overflowY: "auto", boxShadow: "2px 0 14px rgba(28,43,58,0.18)" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 8px 8px 12px" }}>
                <div style={{ fontSize: 10.5, color: C.muted, letterSpacing: 1.2, fontWeight: 600 }}>MENU</div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="메뉴 닫기"
                  style={{ border: "none", background: "transparent", fontSize: 22, lineHeight: 1, color: C.inkSoft, cursor: "pointer", padding: 4 }}
                >
                  ×
                </button>
              </div>
              {menuButtonsJsx}
            </div>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
        {activeTab === "quote" && isStaff && (
          <QuoteUploadPanel
            importState={importState}
            onFile={processQuoteFile}
            onPasteText={processPastedQuote}
            onCancel={() => setImportState(null)}
            onConfirm={confirmImport}
            importing={importing}
            setImportState={setImportState}
            isAdmin={isAdmin}
            tonOverrides={tonOverrides}
            onTonOverrideSaved={fetchTonOverrides}
            customers={customers}
          />
        )}

        {activeTab === "pdfToExcel" && isStaff && <PdfToExcelTab />}

        {activeTab === "quickcalc" && isStaff && (
          <QuickTonCalcPanel tonOverrides={tonOverrides} onTonOverrideSaved={fetchTonOverrides} />
        )}

        {activeTab === "rentals" && isStaff && (
          <RentalListTab key={rentalsResetKey} rentals={rentals} onRefresh={fetchRentals} isAdmin={isAdmin} managerName={managerName} tonOverrides={tonOverrides} onTonOverrideSaved={fetchTonOverrides} dealType="rental" />
        )}

        {activeTab === "purchases" && isStaff && (
          <RentalListTab key={purchasesResetKey} rentals={rentals} onRefresh={fetchRentals} isAdmin={isAdmin} managerName={managerName} tonOverrides={tonOverrides} onTonOverrideSaved={fetchTonOverrides} dealType="purchase" />
        )}

        {activeTab === "shares" && isStaff && (
          <EquityTab key={sharesResetKey} rentals={rentals} shares={shares} equityNotes={equityNotes} onRefresh={fetchShares} onNotesRefresh={fetchEquityNotes} />
        )}

        {activeTab === "sales" && isStaff && (
          <SalesStatusTab key={salesResetKey} rentals={rentals} onRefresh={fetchRentals} isAdmin={isAdmin} managerName={managerName} />
        )}

        {activeTab === "customerData" && isStaff && (
          <CustomerDataTab rentals={rentals} onRefresh={fetchRentals} customers={customers} onCustomersRefresh={fetchCustomers} />
        )}

        {activeTab === "ledger" && isStaff && (
          <LedgerTab key={ledgerResetKey} rentals={rentals} customers={customers} isAdmin={isAdmin} managerName={managerName} />
        )}

        {activeTab === "ledgerAuto" && isStaff && (
          <LedgerAutoSummaryTab
            key={ledgerAutoResetKey}
            rentals={rentals}
            onRefresh={fetchRentals}
            isAdmin={isAdmin}
            managerName={managerName}
            tonOverrides={tonOverrides}
            onTonOverrideSaved={fetchTonOverrides}
          />
        )}

        {activeTab === "asboard" && isStaff && (
          <AsBoardTab key={asboardResetKey} isAdmin={isAdmin} managerName={managerName} />
        )}

        {activeTab === "collectionboard" && isStaff && (
          <CollectionBoardTab key={collectionboardResetKey} isAdmin={isAdmin} managerName={managerName} />
        )}

        {activeTab === "layoutSim" && isStaff && <LayoutSimTab managerName={managerName} />}

        {activeTab === "photoLibrary" && isStaff && <PhotoLibraryTab />}

        {activeTab == null && isStaff && (
          <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 40, textAlign: "center", color: C.muted, fontSize: 13.5 }}>
            왼쪽 메뉴에서 원하는 화면을 선택해주세요.
          </div>
        )}

        {!isStaff && (
          <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 40, textAlign: "center", color: C.muted, fontSize: 13.5 }}>
            현재 화면을 새로 만드는 중이에요. 곧 이용하실 수 있어요.
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// 카드 형태 입력 영역 공통 헤더(아이콘+제목+설명) — 붙여넣기/파일업로드 두 방법을 한눈에 구분되게 보여준다.
// 카드 제목/설명 헤더. 색 아이콘 대신 카드 자체의 borderTop 강조색으로 구분하고, 텍스트만 깔끔하게 보여준다.
function InputCardHeader({ title, desc }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{title}</div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{desc}</div>
    </div>
  );
}

// 관리 중인 엑셀 탭이 여러 개일 때 파일로 저장/업로드하는 것보다 그냥 긁어서 붙여넣는 게 더 간편하다는
// 요청으로 추가된 붙여넣기 입력창. 상단 거래처/배송지 정보부터 품목표까지 한 번에 긁어서 넣으면
// 견적서 파일 업로드와 완전히 동일한 인식 로직(parsePastedQuoteText → parseQuoteRows)으로 채워진다.
function QuotePasteBox({ onPasteText, hasData }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  function handleChange(e) {
    const v = e.target.value;
    setText(v);
    if (v.trim()) onPasteText && onPasteText(v);
  }
  const active = focused || text.trim().length > 0;
  return (
    <div
      style={{
        flex: "1 1 320px",
        minWidth: 260,
        border: `1px solid ${active ? C.green : C.line}`,
        borderTop: `3px solid ${C.green}`,
        background: C.panel,
        padding: 16,
      }}
    >
      <InputCardHeader title="① 엑셀에서 긁어서 붙여넣기" desc="여러 탭을 파일로 저장할 필요 없이, 복사한 내용을 바로 넣으면 돼요" />
      <textarea
        value={text}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="거래처/배송지 정보부터 품목표까지 한 번에 긁어서 여기에 Ctrl+V로 붙여넣으세요"
        style={{
          width: "100%",
          minHeight: hasData ? 64 : 96,
          boxSizing: "border-box",
          border: `1px solid ${C.lineSoft}`,
          padding: 10,
          fontSize: 12.5,
          fontFamily: sans,
          resize: "vertical",
        }}
      />
    </div>
  );
}

function QuoteDropZone({ onFile, hasData }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      style={{
        flex: "1 1 320px",
        minWidth: 260,
        border: `1px solid ${dragOver ? C.purple : C.line}`,
        borderTop: `3px solid ${C.brownAccent}`,
        background: C.panel,
        padding: 16,
      }}
    >
      <InputCardHeader title="② 견적서 파일 올리기" desc="엑셀(.xlsx) 또는 PDF 파일을 그대로 업로드해요" />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? C.purple : C.lineSoft}`,
          background: dragOver ? C.purpleBg : C.bg,
          padding: hasData ? 14 : 26,
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.pdf"
          ref={inputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
          style={{ display: "none" }}
        />
        {hasData ? (
          <div style={{ fontSize: 12.5, color: C.inkSoft }}>다른 견적서로 다시 채우려면 여기로 새 파일을 드래그하거나 클릭하세요</div>
        ) : (
          <>
            <div style={{ fontSize: 22, marginBottom: 6 }}>⬆️</div>
            <div style={{ fontSize: 13.5, color: C.ink, marginBottom: 4 }}>파일을 끌어다 놓으세요</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>또는 클릭해서 파일 선택 (.xlsx, .xls, .pdf)</div>
          </>
        )}
      </div>
    </div>
  );
}

// A/S 접수 및 처리보고서 업로드용 붙여넣기 상자. QuotePasteBox와 같은 구조를 A/S 문구로 바꿔 그대로 재사용한다.
function AsUploadPasteBox({ onPasteText, hasData }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  function handleChange(e) {
    const v = e.target.value;
    setText(v);
    if (v.trim()) onPasteText && onPasteText(v);
  }
  const active = focused || text.trim().length > 0;
  return (
    <div
      style={{
        flex: "1 1 320px",
        minWidth: 260,
        border: `1px solid ${active ? C.green : C.line}`,
        borderTop: `3px solid ${C.green}`,
        background: C.panel,
        padding: 16,
      }}
    >
      <InputCardHeader title="① 엑셀에서 긁어서 붙여넣기" desc="A/S 접수 및 처리보고서 내용을 그대로 복사해서 여기에 붙여넣으세요" />
      <textarea
        value={text}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="A/S 접수 및 처리보고서 시트를 통째로 긁어서 여기에 Ctrl+V로 붙여넣으세요"
        style={{
          width: "100%",
          minHeight: hasData ? 64 : 96,
          boxSizing: "border-box",
          border: `1px solid ${C.lineSoft}`,
          padding: 10,
          fontSize: 12.5,
          fontFamily: sans,
          resize: "vertical",
        }}
      />
    </div>
  );
}

// A/S 접수 및 처리보고서 업로드용 드롭존. QuoteDropZone과 같은 구조이되 PDF는 받지 않고 엑셀만 받는다.
function AsUploadDropZone({ onFile, hasData }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      style={{
        flex: "1 1 320px",
        minWidth: 260,
        border: `1px solid ${dragOver ? C.purple : C.line}`,
        borderTop: `3px solid ${C.brownAccent}`,
        background: C.panel,
        padding: 16,
      }}
    >
      <InputCardHeader title="② A/S 접수 및 처리보고서 파일 올리기" desc="엑셀(.xlsx) 파일을 그대로 업로드해요" />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? C.purple : C.lineSoft}`,
          background: dragOver ? C.purpleBg : C.bg,
          padding: hasData ? 14 : 26,
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          ref={inputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
          style={{ display: "none" }}
        />
        {hasData ? (
          <div style={{ fontSize: 12.5, color: C.inkSoft }}>다른 파일로 다시 채우려면 여기로 새 파일을 드래그하거나 클릭하세요</div>
        ) : (
          <>
            <div style={{ fontSize: 22, marginBottom: 6 }}>⬆️</div>
            <div style={{ fontSize: 13.5, color: C.ink, marginBottom: 4 }}>파일을 끌어다 놓으세요</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>또는 클릭해서 파일 선택 (.xlsx, .xls)</div>
          </>
        )}
      </div>
    </div>
  );
}

// 렌탈품목 회수 지시서 업로드용 붙여넣기 상자. AsUploadPasteBox와 같은 구조를 회수 지시서 문구로 바꿔 재사용한다.
function CollectionUploadPasteBox({ onPasteText, hasData }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  function handleChange(e) {
    const v = e.target.value;
    setText(v);
    if (v.trim()) onPasteText && onPasteText(v);
  }
  const active = focused || text.trim().length > 0;
  return (
    <div
      style={{
        flex: "1 1 320px",
        minWidth: 260,
        border: `1px solid ${active ? C.green : C.line}`,
        borderTop: `3px solid ${C.green}`,
        background: C.panel,
        padding: 16,
      }}
    >
      <InputCardHeader title="① 엑셀에서 긁어서 붙여넣기" desc="회수 지시서(렌탈제품) 내용을 그대로 복사해서 여기에 붙여넣으세요" />
      <textarea
        value={text}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="회수 지시서 시트를 통째로 긁어서 여기에 Ctrl+V로 붙여넣으세요"
        style={{
          width: "100%",
          minHeight: hasData ? 64 : 96,
          boxSizing: "border-box",
          border: `1px solid ${C.lineSoft}`,
          padding: 10,
          fontSize: 12.5,
          fontFamily: sans,
          resize: "vertical",
        }}
      />
    </div>
  );
}

// 렌탈품목 회수 지시서 업로드용 드롭존. AsUploadDropZone과 같은 구조로, 엑셀 파일만 받는다.
function CollectionUploadDropZone({ onFile, hasData }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      style={{
        flex: "1 1 320px",
        minWidth: 260,
        border: `1px solid ${dragOver ? C.purple : C.line}`,
        borderTop: `3px solid ${C.brownAccent}`,
        background: C.panel,
        padding: 16,
      }}
    >
      <InputCardHeader title="② 회수 지시서 파일 올리기" desc="엑셀(.xlsx) 파일을 그대로 업로드해요" />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? C.purple : C.lineSoft}`,
          background: dragOver ? C.purpleBg : C.bg,
          padding: hasData ? 14 : 26,
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          ref={inputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
          style={{ display: "none" }}
        />
        {hasData ? (
          <div style={{ fontSize: 12.5, color: C.inkSoft }}>다른 파일로 다시 채우려면 여기로 새 파일을 드래그하거나 클릭하세요</div>
        ) : (
          <>
            <div style={{ fontSize: 22, marginBottom: 6 }}>⬆️</div>
            <div style={{ fontSize: 13.5, color: C.ink, marginBottom: 4 }}>파일을 끌어다 놓으세요</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>또는 클릭해서 파일 선택 (.xlsx, .xls)</div>
          </>
        )}
      </div>
    </div>
  );
}

// 사업자등록번호 입력칸 + 사업자등록증 업로드 칸. QuoteHeaderForm/RentalDetailPanel에서 공용으로 쓴다.
// - 사업자등록증(이미지/PDF)은 파일 그대로 첨부해서 보관해둔다(자동 글자 인식은 비용이 들어 넣지 않음 — 상호명은 직접 입력).
// - 사업자등록번호를 입력하면, 이미 우리 시스템에 등록된 같은 번호의 거래처가 있는 경우 그 거래처명으로 자동 통일한다.
//   (예: 예전에 "금강주택"으로 등록했어도, 이번에 사업자등록번호가 같으면 자동으로 "(주)금강주택"으로 맞춰준다 — 반대로도 동일)
function BizRegFields({ state, update, customers }) {
  const [downloading, setDownloading] = useState(false);

  const regNoDigits = (state.bizRegNo || "").replace(/\D/g, "");
  const matched = useMemo(() => {
    if (regNoDigits.length !== 10) return null;
    return (customers || []).find((c) => (c.business_reg_no || "").replace(/\D/g, "") === regNoDigits) || null;
  }, [customers, regNoDigits]);

  const handleRegNoChange = (raw) => {
    const formatted = formatBizRegNo(raw);
    const patch = { bizRegNo: formatted };
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    if (digits.length === 10) {
      const hit = (customers || []).find((c) => (c.business_reg_no || "").replace(/\D/g, "") === digits);
      if (hit) {
        patch.customer = hit.name;
        if (hit.biz_cert_path) patch.bizCertPath = hit.biz_cert_path;
      }
    }
    update(patch);
  };

  // 자동 글자 인식 없이, 첨부한 파일만 그대로 등록 확정 시 Storage에 올려서 보관한다(견적서 원본 파일과 같은 방식).
  const handleCertFile = (file) => {
    if (!file) return;
    update({ _bizCertFile: file, _bizCertFileName: file.name });
  };

  const handleDownloadCert = async () => {
    if (!state.bizCertPath) return;
    setDownloading(true);
    const { data, error } = await supabase.storage.from("quote-files").download(state.bizCertPath);
    setDownloading(false);
    if (error || !data) {
      alert("사업자등록증 파일을 불러오지 못했어요: " + (error?.message || ""));
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "사업자등록증";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Field label="사업자등록번호 (선택)">
        <input
          style={inputStyle}
          value={state.bizRegNo || ""}
          onChange={(e) => handleRegNoChange(e.target.value)}
          placeholder="예: 123-45-67890"
          maxLength={12}
        />
        {matched && (
          <div style={{ fontSize: 11.5, color: C.brick, marginTop: 4 }}>
            ✓ 기존 등록된 거래처 "{matched.name}"와 같은 사업자등록번호예요. 거래처명을 자동으로 맞췄어요.
          </div>
        )}
      </Field>
      <Field label="사업자등록증 업로드 (선택)">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => handleCertFile(e.target.files?.[0])}
            style={{ fontSize: 12.5 }}
          />
          {state.bizCertPath && (
            <button type="button" onClick={handleDownloadCert} disabled={downloading} style={miniBtnStyle}>
              {downloading ? "불러오는 중…" : "등록된 파일 보기"}
            </button>
          )}
        </div>
        {state._bizCertFileName && (
          <div style={{ fontSize: 11.5, color: C.brick, marginTop: 4 }}>✓ 첨부됨: {state._bizCertFileName} (등록 확정 시 저장돼요)</div>
        )}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>거래처명·사업자등록번호는 증명서를 보고 직접 입력해주세요.</div>
      </Field>
    </>
  );
}

function QuoteHeaderForm({ state, update, isAdmin = true, customers }) {
  const isRental = state.transactionType === "rental";
  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 16 }}>견적서입력(수정)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="구분">
          <select
            style={inputStyle}
            value={state.transactionType}
            onChange={(e) => {
              const transactionType = e.target.value;
              update({ transactionType, warehouse: autoWarehouseFor(transactionType, state.warehouse) });
            }}
          >
            <option value="rental">렌탈</option>
            <option value="purchase">구매</option>
          </select>
        </Field>
        <Field label="전표번호 (직접 입력해주세요)">
          <input style={inputStyle} value={state.voucherNo || ""} onChange={(e) => update({ voucherNo: e.target.value })} placeholder="예: 26031401" />
        </Field>
        <Field label={isAdmin ? "담당자" : "담당자 (본인 계정으로 고정)"}>
          {isAdmin ? (
            <input style={inputStyle} value={state.manager || ""} onChange={(e) => update({ manager: e.target.value })} placeholder="예: 김영업" />
          ) : (
            <input style={{ ...inputStyle, background: C.mutedBg, color: C.inkSoft }} value={state.manager || ""} readOnly />
          )}
        </Field>
        <Field label="거래처">
          <input style={inputStyle} value={state.customer || ""} onChange={(e) => update({ customer: e.target.value })} placeholder="예: 한우리건설" />
        </Field>
        <BizRegFields state={state} update={update} customers={customers} />
        <Field label="거래처 담당자">
          <input style={inputStyle} value={state.refContact || ""} onChange={(e) => update({ refContact: e.target.value })} placeholder="예: 양지훈 대리" />
        </Field>
        <Field label="메일">
          <input style={inputStyle} value={state.email || ""} onChange={(e) => update({ email: e.target.value })} placeholder="예: name@company.com" />
        </Field>
        <Field label="출하창고">
          <input style={inputStyle} value={state.warehouse || ""} onChange={(e) => update({ warehouse: e.target.value })} />
        </Field>
        <Field label="거래유형">
          <input style={inputStyle} value={state.dealType || ""} onChange={(e) => update({ dealType: e.target.value })} />
        </Field>
        <Field label={isRental ? "배송일자 (= 렌탈개시일)" : "배송일자"}>
          <input
            type="date"
            style={inputStyle}
            value={state.outDate || ""}
            onChange={(e) => {
              const outDate = e.target.value;
              update({ outDate, dueDate: state.periodMonths ? addMonthsMinusDay(outDate, state.periodMonths) : state.dueDate });
            }}
          />
        </Field>
        {isRental ? (
          <Field label="렌탈기간 (개월)">
            <input
              type="number"
              min={1}
              style={inputStyle}
              value={state.periodMonths ?? ""}
              onChange={(e) => {
                const months = Number(e.target.value);
                update({ periodMonths: months, periodDays: months * 30, dueDate: addMonthsMinusDay(state.outDate, months) });
              }}
            />
          </Field>
        ) : (
          <Field label="통화">
            <select style={inputStyle} value={state.currency || "내자"} onChange={(e) => update({ currency: e.target.value })}>
              <option value="내자">내자</option>
              <option value="외자">외자</option>
            </select>
          </Field>
        )}
        {isRental && (
          <>
            <Field label="렌탈만료일 (자동계산, 직접 수정 가능)">
              <input type="date" style={inputStyle} value={state.dueDate || ""} onChange={(e) => update({ dueDate: e.target.value })} />
            </Field>
            <Field label="통화">
              <select style={inputStyle} value={state.currency || "내자"} onChange={(e) => update({ currency: e.target.value })}>
                <option value="내자">내자</option>
                <option value="외자">외자</option>
              </select>
            </Field>
          </>
        )}
        <Field label="현장명 (선택 입력, 공란 가능)">
          <input style={inputStyle} value={state.siteName || ""} onChange={(e) => update({ siteName: e.target.value })} />
        </Field>
        <Field label="배송지 주소">
          <input style={inputStyle} value={state.site || ""} onChange={(e) => update({ site: e.target.value })} placeholder="예: 경북 청도군 ..." />
        </Field>
        <Field label="프로젝트 (선택)">
          <input style={inputStyle} value={state.project || ""} onChange={(e) => update({ project: e.target.value })} />
        </Field>
        <Field label="세금계산서발행여부 (선택)">
          <input style={inputStyle} value={state.taxInvoice || ""} onChange={(e) => update({ taxInvoice: e.target.value })} />
        </Field>
        <div style={{ gridColumn: "span 2" }}>
          <Field label="수령자/연락처">
            <input style={inputStyle} value={state.recipient || ""} onChange={(e) => update({ recipient: e.target.value })} placeholder="예: 홍길동 과장 / 010-0000-0000" />
          </Field>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <Field label="특이사항 (선택 입력)">
            <input style={inputStyle} value={state.headerNote || ""} onChange={(e) => update({ headerNote: e.target.value })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ---------- 톤수(화물차 적재 기준) 계산 ----------
// 회사에서 쓰는 "품목/규격별 1개당 용적(톤)" 기준표를 그대로 옮겨왔다(2026.02 기준표 엑셀).
// 규칙: 품목+규격이 정확히 일치하는 행을 우선 찾고, 없으면 규격 텍스트만으로 기준표에서 먼저 나오는 행을 찾는다
// (회사에서 기존에 쓰던 엑셀의 VLOOKUP(규격, 기준표, ...) 방식과 동일하게 동작).
const TON_REFERENCE_TABLE = [
  { item: "사무용책상", spec: "퍼즐, W1400*D1200, 연체리", per: 0.025 },
  { item: "사무용책상", spec: "퍼즐, W1600*D1200, 연체리", per: 0.025 },
  { item: "사무용책상", spec: "퍼즐, W1800*D1200, 연체리", per: 0.025 },
  { item: "사무용책상", spec: "퍼즐, W1400*D1200, 망비", per: 0.025 },
  { item: "사무용책상", spec: "퍼즐, W1600*D1200, 망비", per: 0.025 },
  { item: "사무용책상", spec: "퍼즐, W1800*D1200, 망비", per: 0.025 },
  { item: "사무용책상", spec: "퍼즐, W1400*D1200, 월넛", per: 0.025 },
  { item: "사무용책상", spec: "퍼즐, W1600*D1200, 월넛", per: 0.025 },
  { item: "사무용책상", spec: "퍼즐, W1800*D1200, 월넛", per: 0.025 },
  { item: "사무용책상", spec: "탑책상, W1200*D800, 연체리", per: 0.016667 },
  { item: "사무용책상", spec: "탑책상, W1400*D800, 연체리", per: 0.02 },
  { item: "사무용책상", spec: "탑책상, W1600*D800, 연체리", per: 0.02 },
  { item: "사무용책상", spec: "탑책상, W1800*D800, 연체리", per: 0.02 },
  { item: "사무용책상", spec: "탑책상, W1200*D800, 망비", per: 0.016667 },
  { item: "사무용책상", spec: "탑책상, W1400*D800, 망비", per: 0.02 },
  { item: "사무용책상", spec: "탑책상, W1600*D800, 망비", per: 0.02 },
  { item: "사무용책상", spec: "탑책상, W1800*D800, 망비", per: 0.02 },
  { item: "사무용책상", spec: "탑책상, W1200*D800, 월넛", per: 0.016667 },
  { item: "사무용책상", spec: "탑책상, W1400*D800, 월넛", per: 0.02 },
  { item: "사무용책상", spec: "탑책상, W1600*D800, 월넛", per: 0.02 },
  { item: "사무용책상", spec: "탑책상, W1800*D800, 월넛", per: 0.02 },
  { item: "마스터책상", spec: "마스터, W1800*D800, 연체리", per: 0.02 },
  { item: "마스터책상", spec: "마스터, W1800*D800, 망비", per: 0.02 },
  { item: "마스터책상", spec: "마스터, W1800*D800, 월넛", per: 0.02 },
  { item: "보조책상", spec: "U형테이블, W600*D1200, 연체리", per: 0.02 },
  { item: "보조책상", spec: "U형테이블, W600*D1200, 망비", per: 0.02 },
  { item: "보조책상", spec: "U형테이블, W600*D1200, 월넛", per: 0.02 },
  { item: "보조책상", spec: "U형테이블(세발), 월넛", per: 0.02 },
  { item: "이동서랍", spec: "3단, 연체리", per: 0.0125 },
  { item: "이동서랍", spec: "3단, 망비", per: 0.0125 },
  { item: "이동서랍", spec: "3단, 월넛", per: 0.0125 },
  { item: "회의테이블", spec: "포밍, W1200*D900, 연체리", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1500*D900, 연체리", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1800*D900, 연체리", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1200*D900, 망비", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1500*D900, 망비", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1800*D900, 망비", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1200*D900, 월넛", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1500*D900, 월넛", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1800*D900, 월넛", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1200*D600, 연체리", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1500*D600, 연체리", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1800*D600, 연체리", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1200*D600, 월넛", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1500*D600, 월넛", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1800*D600, 월넛", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1200*D600, 망비", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1500*D600, 망비", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1800*D600, 망비", per: 0.02 },
  { item: "회의테이블", spec: "VIP, W1500*D900, 연체리", per: 0.05 },
  { item: "회의테이블", spec: "VIP, W1800*D900, 연체리", per: 0.05 },
  { item: "회의테이블", spec: "VIP, W2400*D1200, 연체리", per: 0.1 },
  { item: "회의테이블", spec: "VIP, W1500*D900, 망비", per: 0.05 },
  { item: "회의테이블", spec: "VIP, W1800*D900, 망비", per: 0.05 },
  { item: "회의테이블", spec: "VIP, W2400*D1200, 망비", per: 0.1 },
  { item: "회의테이블", spec: "VIP, W1500*D900, 월넛", per: 0.05 },
  { item: "회의테이블", spec: "VIP, W1800*D900, 월넛", per: 0.05 },
  { item: "회의테이블", spec: "VIP, W2400*D1200, 월넛", per: 0.1 },
  { item: "접이식테이블", spec: "접탁자, W1200*D600, 연체리", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1500*D600, 연체리", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1800*D600, 연체리", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1200*D600, 망비", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1500*D600, 망비", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1800*D600, 망비", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1200*D600, 월넛", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1500*D600, 월넛", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1800*D600, 월넛", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1200*D450, 연체리", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1500*D450, 연체리", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1800*D450, 연체리", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1200*D450, 망비", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1500*D450, 망비", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1800*D450, 망비", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1200*D450, 월넛", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1500*D450, 월넛", per: 0.02 },
  { item: "접이식테이블", spec: "접탁자, W1800*D450, 월넛", per: 0.02 },
  { item: "원형테이블", spec: "D900, 연체리", per: 0.02 },
  { item: "원형테이블", spec: "D1050, 연체리", per: 0.02 },
  { item: "원형테이블", spec: "D1200, 연체리", per: 0.02 },
  { item: "원형테이블", spec: "D900, 망비", per: 0.02 },
  { item: "원형테이블", spec: "D1050, 망비", per: 0.02 },
  { item: "원형테이블", spec: "D1200, 망비", per: 0.02 },
  { item: "원형테이블", spec: "D900, 월넛", per: 0.02 },
  { item: "원형테이블", spec: "D1050, 월넛", per: 0.02 },
  { item: "원형테이블", spec: "D1200, 월넛", per: 0.02 },
  { item: "중역의자", spec: "뉴펄", per: 0.014286 },
  { item: "사무용의자", spec: "닥스, 이중락킹, 메쉬블랙", per: 0.014286 },
  { item: "회의의자", spec: "밀대, 바퀴", per: 0.0125 },
  { item: "회의의자", spec: "밀대, 고정", per: 0.0125 },
  { item: "회의의자", spec: "구멀티의자, 팔무", per: 0.0125 },
  { item: "회의의자", spec: "신멀티의자, 팔유", per: 0.0125 },
  { item: "접의자", spec: "접의자(밤색)", per: 0.01 },
  { item: "책장", spec: "2단오픈장, 그레이", per: 0.033333 },
  { item: "책장", spec: "2단올문장, 연체리", per: 0.033333 },
  { item: "책장", spec: "3단오픈장, 그레이", per: 0.05 },
  { item: "책장", spec: "3단반문장, 연체리", per: 0.05 },
  { item: "책장", spec: "3단올문장, 연체리", per: 0.05 },
  { item: "책장", spec: "5단오픈장, 그레이", per: 0.1 },
  { item: "책장", spec: "5단반문장, 연체리", per: 0.1 },
  { item: "책장", spec: "5단올문장, 연체리", per: 0.1 },
  { item: "책장", spec: "5단반유리장, 연체리", per: 0.1 },
  { item: "책장", spec: "2단올문장, 망비", per: 0.033333 },
  { item: "책장", spec: "3단반문장, 망비", per: 0.05 },
  { item: "책장", spec: "3단올문장, 망비", per: 0.05 },
  { item: "책장", spec: "5단반문장, 망비", per: 0.1 },
  { item: "책장", spec: "5단올문장, 망비", per: 0.1 },
  { item: "책장", spec: "5단반유리장, 망비", per: 0.1 },
  { item: "책장", spec: "2단올문장, 월넛", per: 0.033333 },
  { item: "책장", spec: "3단반문장, 월넛", per: 0.05 },
  { item: "책장", spec: "3단올문장, 월넛", per: 0.05 },
  { item: "책장", spec: "5단반문장, 월넛", per: 0.1 },
  { item: "책장", spec: "5단올문장, 월넛", per: 0.1 },
  { item: "책장", spec: "5단반유리장, 월넛", per: 0.1 },
  { item: "옷장", spec: "1인용, 연체리", per: 0.1 },
  { item: "옷장", spec: "2인용, 연체리", per: 0.1 },
  { item: "옷장", spec: "4인용, 연체리", per: 0.2 },
  { item: "옷장", spec: "6인용, 연체리", per: 0.2 },
  { item: "옷장", spec: "1인용, 망비", per: 0.1 },
  { item: "옷장", spec: "2인용, 망비", per: 0.1 },
  { item: "옷장", spec: "4인용, 망비", per: 0.2 },
  { item: "옷장", spec: "6인용, 망비", per: 0.2 },
  { item: "옷장", spec: "1인용, 월넛", per: 0.1 },
  { item: "옷장", spec: "2인용, 월넛", per: 0.1 },
  { item: "옷장", spec: "4인용, 월넛", per: 0.2 },
  { item: "옷장", spec: "6인용, 월넛", per: 0.2 },
  { item: "화일박스", spec: "2단, 연체리", per: 0.025 },
  { item: "화일박스", spec: "3단, 연체리", per: 0.025 },
  { item: "화일박스", spec: "4단, 연체리", per: 0.025 },
  { item: "화일박스", spec: "2단, 망비", per: 0.025 },
  { item: "화일박스", spec: "3단, 망비", per: 0.025 },
  { item: "화일박스", spec: "4단, 망비", per: 0.025 },
  { item: "화일박스", spec: "2단, 월넛", per: 0.025 },
  { item: "화일박스", spec: "3단, 월넛", per: 0.025 },
  { item: "화일박스", spec: "4단, 월넛", per: 0.025 },
  { item: "캐비닛", spec: "철제, 5단올문", per: 0.1 },
  { item: "사무용쇼파", spec: "1인용", per: 0.05 },
  { item: "사무용쇼파", spec: "3인용", per: 0.1 },
  { item: "사무용쇼파", spec: "1+1+3", per: 0.2 },
  { item: "중역쇼파", spec: "1인용", per: 0.05 },
  { item: "중역쇼파", spec: "3인용", per: 0.1 },
  { item: "중역쇼파", spec: "1+1+3", per: 0.2 },
  { item: "쇼파탁자", spec: "일반, W1200*D570", per: 0.033333 },
  { item: "쇼파탁자", spec: "중역, W1500*D600", per: 0.033333 },
  { item: "파티션", spec: "H1200*W600, PW505", per: 0.0125 },
  { item: "파티션", spec: "H1200*W700, PW505", per: 0.0125 },
  { item: "파티션", spec: "H1200*W800, PW505", per: 0.0125 },
  { item: "파티션", spec: "H1200*W900, PW505", per: 0.0125 },
  { item: "파티션", spec: "H1200*W1000, PW505", per: 0.0125 },
  { item: "파티션", spec: "H1200*W1100, PW505", per: 0.0125 },
  { item: "파티션", spec: "H1200*W1200, PW505", per: 0.0125 },
  { item: "파티션", spec: "H1200*W1400, PW505", per: 0.014286 },
  { item: "파티션", spec: "H1200*W1600, PW505", per: 0.014286 },
  { item: "파티션", spec: "H1200*W1800, PW505", per: 0.02 },
  { item: "파티션", spec: "H1500*W600, PW505", per: 0.014286 },
  { item: "파티션", spec: "H1500*W700, PW505", per: 0.014286 },
  { item: "파티션", spec: "H1500*W800, PW505", per: 0.014286 },
  { item: "파티션", spec: "H1500*W900, PW505", per: 0.014286 },
  { item: "파티션", spec: "H1500*W1000, PW505", per: 0.014286 },
  { item: "파티션", spec: "H1500*W1100, PW505", per: 0.014286 },
  { item: "파티션", spec: "H1500*W1200, PW505", per: 0.014286 },
  { item: "파티션", spec: "H1800*W600, PW505", per: 0.02 },
  { item: "파티션", spec: "H1800*W700, PW505", per: 0.02 },
  { item: "파티션", spec: "H1800*W800, PW505", per: 0.02 },
  { item: "파티션", spec: "H1800*W900, PW505", per: 0.02 },
  { item: "파티션", spec: "H1800*W1000, PW505", per: 0.02 },
  { item: "파티션", spec: "H1800*W1100, PW505", per: 0.02 },
  { item: "파티션", spec: "H1800*W1200, PW505", per: 0.02 },
  { item: "화이트보드", spec: "화이트보드, W900*H600", per: 0.01 },
  { item: "화이트보드", spec: "화이트보드, W1200*H800", per: 0.01 },
  { item: "화이트보드", spec: "화이트보드, W1500*H900", per: 0.014286 },
  { item: "화이트보드", spec: "화이트보드, W1800*H900", per: 0.016667 },
  { item: "화이트보드", spec: "화이트보드, W2400*H1200", per: 0.02 },
  { item: "화이트보드", spec: "화이트보드 거치대", per: 0.05 },
  { item: "월중행사표", spec: "월중행사표, W900*H600", per: 0.01 },
  { item: "월중행사표", spec: "월중행사표, W1200*H800", per: 0.01 },
  { item: "근무상황판", spec: "근무상황판, W900*H600", per: 0.01 },
  { item: "근무상황판", spec: "근무상황판, W1200*H800", per: 0.01 },
  { item: "신발장", spec: "5단오픈, 안전화 가능", per: 0.1 },
  { item: "씽크대", spec: "W900, 1구", per: 0.1 },
  { item: "씽크대", spec: "W1200, 2구", per: 0.1 },
  { item: "옷걸이", spec: "스탠드", per: 0.02 },
  { item: "행거", spec: "이동형, 행거", per: 0.033333 },
  { item: "강연대", spec: "W400", per: 0.02 },
  { item: "책꽂이", spec: "W600", per: 0.006667 },
  { item: "냉장고", spec: "150리터급", per: 0.1 },
  { item: "냉장고", spec: "200리터급", per: 0.1 },
  { item: "냉장고", spec: "300리터급", per: 0.2 },
  { item: "냉장고", spec: "500리터급", per: 0.2 },
  { item: "세탁기", spec: "통돌이 12kg", per: 0.1 },
  { item: "LED TV", spec: "32인치", per: 0.05 },
  { item: "LED TV", spec: "42인치", per: 0.05 },
  { item: "전자레인지", spec: "20리터급", per: 0.01 },
  { item: "시계", spec: "벽걸이형", per: 0.005 },
  { item: "청소기", spec: "가정용", per: 0.014286 },
  { item: "청소기", spec: "산업용", per: 0.014286 },
  { item: "공기청정기", spec: "10평형", per: 0.033333 },
  { item: "공기청정기", spec: "20평형", per: 0.033333 },
  { item: "냉난방기", spec: "벽걸이 7평", per: 0.05 },
  { item: "냉난방기", spec: "벽걸이 9평", per: 0.05 },
  { item: "냉난방기", spec: "벽걸이 11평", per: 0.05 },
  { item: "냉난방기", spec: "벽걸이 13평", per: 0.05 },
  { item: "냉난방기", spec: "스탠드 16평", per: 0.1 },
  { item: "냉난방기", spec: "스탠드 18평", per: 0.1 },
  { item: "냉난방기", spec: "스탠드 25평", per: 0.2 },
  { item: "냉난방기", spec: "스탠드 30평", per: 0.2 },
  { item: "냉난방기", spec: "스탠드 40평", per: 0.2 },
  { item: "에어컨", spec: "벽걸이 6평", per: 0.05 },
  { item: "에어컨", spec: "벽걸이 8평", per: 0.05 },
  { item: "에어컨", spec: "벽걸이 10평", per: 0.05 },
  { item: "에어컨", spec: "스탠드 15평", per: 0.1 },
  { item: "에어컨", spec: "스탠드 18평", per: 0.1 },
  { item: "에어컨", spec: "스탠드 23평", per: 0.2 },
  { item: "선풍기", spec: "스탠드 14인치", per: 0.0125 },
  { item: "라디에이터", spec: "7핀", per: 0.0125 },
  { item: "라디에이터", spec: "11핀", per: 0.0125 },
  { item: "파쇄기", spec: "A3, 대형", per: 0.05 },
  { item: "파쇄기", spec: "A4, 중형", per: 0.05 },
  { item: "복합기", spec: "A3, 대형", per: 0.1 },
  { item: "침대", spec: "슈퍼싱글", per: 0.1 },
  { item: "마감바", spec: "H1500", per: 0.002 },
  { item: "안전각", spec: "철제", per: 0.003333 },
  { item: "사무용의자", spec: "닥스, 이중럭킹, 메쉬블랙", per: 0.014286 },
  { item: "화이트보드", spec: "월중행사표 W1200", per: 0.01 },
  { item: "포스트", spec: "H1200", per: 0.002 },
  { item: "마감바", spec: "H1200", per: 0.002 },
  { item: "사무용의자", spec: "올메쉬 블랙", per: 0.014286 },
  { item: "TV", spec: "40인치", per: 0.05 },
  { item: "TV다이", spec: "W1200", per: 0.01 },
  { item: "행거", spec: "이동형", per: 0.033333 },
  { item: "중역책상", spec: "탑, 1800*800, 연체리", per: 0.02 },
  { item: "사무용의자", spec: "닥스메쉬", per: 0.014286 },
  { item: "사무의자", spec: "젠틀맨", per: 0.014286 },
  { item: "보조책상", spec: "U형테이블(세발), W600*D1200, 연체리", per: 0.02 },
  { item: "이동서랍", spec: "3단, (색상무관)", per: 0.0125 },
  { item: "보조책상", spec: "U형테이블(세발), W600*D1200, (색상무관)", per: 0.02 },
  { item: "접의자", spec: "접의자(색상무관)", per: 0.01 },
  { item: "화일박스", spec: "4단, (색상무관)", per: 0.025 },
  { item: "옷장", spec: "1인용, (색상무관)", per: 0.1 },
  { item: "보드판", spec: "화이트보드, W1800", per: 0.016667 },
  { item: "보드판", spec: "월중행사표, W900", per: 0.01 },
  { item: "보드판", spec: "근무상황판, W900", per: 0.01 },
  { item: "회의테이블", spec: "포밍, W1800*D900, 파스텔", per: 0.02 },
  { item: "냉난방기", spec: "스탠드 18평/인버터 (YI-8956, 8957)", per: 0.1 },
  { item: "냉난방기", spec: "벽걸이 13평/인버터", per: 0.05 },
  { item: "냉장고", spec: "90리터급", per: 0.05 },
  { item: "냉장고", spec: "3*3 철제 (W850*H890)", per: 0.1 },
  { item: "냉장고", spec: "3*6 철제 (W850*H1790)", per: 0.1 },
  { item: "냉장고", spec: "스탠드 18평 (40㎡)", per: 0.1 },
  { item: "냉장고", spec: "스탠드 40평 (100㎡)", per: 0.2 },
  { item: "냉장고", spec: "벽걸이 7평(14㎡)", per: 0.05 },
  { item: "퍼즐책상", spec: "퍼즐(좌), W1600*D1200, 월넛", per: 0.025 },
  { item: "퍼즐책상", spec: "VIP테이블, W2400*D1200, 월넛", per: 0.1 },
  { item: "퍼즐책상", spec: "알파고 회의의자", per: 0.0125 },
  { item: "퍼즐책상", spec: "중역용, W1500", per: 0.033333 },
  { item: "퍼즐책상", spec: "퍼즐(좌), W1600*D1200, 연체리", per: 0.025 },
  { item: "퍼즐책상", spec: "퍼즐(우), W1600*D1200, 연체리", per: 0.025 },
  { item: "퍼즐책상", spec: "VIP테이블, W2400*D1200, 연체리", per: 0.1 },
  { item: "사무용책상", spec: "퍼즐(좌), W1400*D1200, 연체리", per: 0.025 },
  { item: "사무용책상", spec: "퍼즐(우), W1400*D1200, 연체리", per: 0.025 },
  { item: "캐비닛", spec: "철제 5단올문", per: 0.1 },
  { item: "냉장고", spec: "250리터급", per: 0.1 },
  { item: "탑책상", spec: "W1600*D800*H720, 연체리", per: 0.033333 },
  { item: "이동서랍", spec: "3단, 연체리", per: 0.033333 },
  { item: "닥스의자", spec: "이중럭킹, 헤드유, 블랙, 매쉬", per: 0.033333 },
  { item: "포밍테이블", spec: "W1800*D900, 연체리", per: 0.1 },
  { item: "접의자", spec: "밤색, 고정", per: 0.0125 },
  { item: "원형테이블", spec: "D1050", per: 0.1 },
  { item: "옷걸이", spec: "스탠드형", per: 0.1 },
  { item: "대형복합기", spec: "A3, 칼라, 팩스포함", per: 0.1 },
  { item: "캐비닛", spec: "5단올문, 철제", per: 0.1 },
  { item: "사무용쇼파", spec: "1+1+3+탁자", per: 0.2 },
  { item: "사무용쇼파", spec: "마스터 W1800*D800, 월넛(보조책상 포함)", per: 0.02 },
  { item: "사무용쇼파", spec: "3단오픈장, 월넛", per: 0.05 },
  { item: "사무용쇼파", spec: "3단오픈장, 연체리", per: 0.05 },
  { item: "사무용쇼파", spec: "4단오픈장, 연체리", per: 0.1 },
  { item: "소장실책상", spec: "ㄱ자퍼즐책상, W1800*D1200, 월넛", per: 0.025 },
  { item: "LED TV", spec: "43인치", per: 0.05 },
  { item: "세탁기", spec: "10~12kg 통돌이", per: 0.1 },
  { item: "세탁기", spec: "통돌이 10kg급", per: 0.1 },
  { item: "보조책상", spec: "U형테이블, 선반형, 연체리", per: 0.02 },
  { item: "회의테이블", spec: "VIP테이블, W1800*D900, 연체리", per: 0.05 },
  { item: "회의의자", spec: "구멀티의자", per: 0.0125 },
  { item: "보드판", spec: "월중행사표, W1200", per: 0.01 },
  { item: "보드판", spec: "화이트보드, W1500", per: 0.01 },
  { item: "거치대", spec: "화이트보드 W1500용 거치대", per: 0.01 },
  { item: "행거", spec: "이동형 행거", per: 0.033333 },
  { item: "책꽂이", spec: "W600, 연체리", per: 0.006667 },
  { item: "냉장고", spec: "400리터급", per: 0.2 },
  { item: "냉난방기", spec: "스탠드 40평 (YI-6501, 5387)", per: 0.2 },
  { item: "냉난방기", spec: "스탠드 25평 (YI-7097)", per: 0.2 },
  { item: "보조책상", spec: "U형테이블, 세발식, 연체리", per: 0.02 },
  { item: "냉장고", spec: "205리터", per: 0.1 },
  { item: "세탁기", spec: "10kg급 통돌이", per: 0.1 },
  { item: "사회대", spec: "", per: 0.02 },
  { item: "접의자", spec: "밤색", per: 0.01 },
  { item: "소장용책상", spec: "마스터, W1800*D800, 보조포함, 월넛", per: 0.02 },
  { item: "냉장고", spec: "262리터", per: 0.1 },
  { item: "보조책상", spec: "U형테이블, W1200*D600, 월넛", per: 0.02 },
  { item: "신발장", spec: "5단오픈, W800*D300*H1200", per: 0.1 },
  { item: "보조책상", spec: "U형테이블, W1200*D600, 연체리", per: 0.02 },
  { item: "원형테이블", spec: "원형 D900, 연체리", per: 0.02 },
  { item: "청소기", spec: "업소용", per: 0.014286 },
  { item: "냉난방기", spec: "스탠드 40평, 3상", per: 0.2 },
  { item: "책장", spec: "4단오픈장, 그레이", per: 0.1 },
  { item: "냉장고", spec: "루컴즈 205리터", per: 0.1 },
  { item: "쇼파탁자", spec: "쇼파탁자, W1500", per: 0.033333 },
  { item: "파티션", spec: "H1200*W1600, PW507", per: 0.014286 },
  { item: "파티션", spec: "H1200*W800, PW507", per: 0.0125 },
  { item: "파티션", spec: "2단 사무의자 확인!", per: 0.014286 },
  { item: "화일박스", spec: "2단, 연체리 / SV", per: 0.025 },
  { item: "냉난방기", spec: "스탠드 25평 (단상/인버터/YI-4500)", per: 0.2 },
  { item: "냉난방기", spec: "벽걸이 11평 (단상/인버터/YI-6445)", per: 0.05 },
  { item: "이동서랍", spec: "3단, 화이트", per: 0.0125 },
  { item: "책장", spec: "5단올문장 / 시건장치 / 화이트", per: 0.1 },
  { item: "캐비닛", spec: "5단올문, 철제", per: 0.1 },
  { item: "사무책상", spec: "라온, W1400*D800, 화이트", per: 0.02 },
  { item: "사무책상", spec: "라온, W1200*D800, 화이트", per: 0.02 },
  { item: "회의테이블", spec: "포밍, W1800*D900, 화이트", per: 0.02 },
  { item: "일반 파티션\n45T", spec: "H1800*W1000, PW503", per: 0.02 },
  { item: "일반 파티션\n45T", spec: "H1800*W600, PW503", per: 0.02 },
  { item: "일반 파티션\n45T", spec: "H1800*W1000, PW503", per: 0.02 },
  { item: "일반 파티션\n45T", spec: "H1800*W800, PW503", per: 0.02 },
  { item: "일반 파티션\n45T", spec: "H1800*W1000, PW503", per: 0.02 },
  { item: "일반 파티션\n45T", spec: "H1800*W700, PW503", per: 0.02 },
  { item: "일반 파티션\n45T", spec: "H1800*W1000, PW503", per: 0.02 },
  { item: "일반 파티션\n45T", spec: "H1800*W700, PW503", per: 0.02 },
  { item: "냉난방기", spec: "벽걸이 11평 (YI-6445)", per: 0.05 },
  { item: "근무상황판", spec: "근무현황판, W900", per: 0.01 },
  { item: "냉난방기", spec: "스탠드 25평 (YI-3998)", per: 0.2 },
  { item: "냉장고", spec: "150리터", per: 0.1 },
  { item: "냉난방기", spec: "벽걸이 9평 (단상, 인버터)", per: 0.05 },
  { item: "책장", spec: "4단올문장, 연체리", per: 0.1 },
  { item: "냉난방기", spec: "스탠드 30평 (3상, 인버터)", per: 0.2 },
  { item: "냉난방기", spec: "벽걸이 13평 (단상, 인버터)", per: 0.05 },
  { item: "냉난방기", spec: "스탠드 25평 (단상, 인버터)", per: 0.2 },
  { item: "냉난방기", spec: "벽걸이 7평 (단상, 인버터)", per: 0.05 },

  // 아래는 기준표 원본에 단위수량/용적이 비어있던(=실측이 없던) 품목들이다.
  // 같은 품목군의 다른 규격이나 비슷한 크기/무게의 물건을 기준으로 추정해서 채워넣었다(실측치가 아니라 추정치).
  { item: "사무의자", spec: "닥스, 이중럭킹, 메쉬블랙", per: 0.014286 }, // "이중락킹" 표기와 같은 제품(오타 차이)
  { item: "회의의자", spec: "접의자, 이동형, 알파고D", per: 0.0125 }, // 알파고 회의의자와 동일 취급
  { item: "빔프로젝터", spec: "4500안시", per: 0.02 }, // 추정: 소형 전자기기, 모니터급
  { item: "빔스크린", spec: "100인치 유압식", per: 0.03 }, // 추정: 삼각대형 스크린, 화이트보드 거치대급
  { item: "키박스", spec: "72P", per: 0.01 }, // 추정: 소형 벽부착함
  { item: "플랫 파티션 30T", spec: "H1170*W800", per: 0.0125 }, // 추정: 일반 파티션 H1200*W800급과 동일 취급
  { item: "안전각", spec: "플랫파티션 전용 안전각", per: 0.003333 }, // 추정: 기존 안전각(철제)과 동일 취급
  { item: "시계", spec: "리마켓 벽시계(판촉용)", per: 0.005 }, // 추정: 기존 벽걸이형 시계와 동일 취급
  { item: "모니터", spec: "24인치", per: 0.01 }, // 추정: TV다이급 소형 전자기기
];

function normalizeTonText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

// 콤마/공백/* 기준으로 토큰을 쪼갠다(치수, 색상, 재질 등 각 구성요소가 토큰 하나씩 된다).
// 공백으로도 쪼개기 때문에 "12kg 통돌이"와 "통돌이 12kg"처럼 순서만 다른 표기도 같은 토큰 집합으로 인식된다.
// "200리터급"처럼 숫자+단위 뒤에 "급"이 붙은 표기는 "200리터"와 같은 걸로 보고 "급"을 뗀다(기준표에 두 표기가 섞여 있음).
function tonTokens(s) {
  return normalizeTonText(s)
    .replace(/(\d+(?:\.\d+)?)\s*(리터|kg|평|인치|톤|mm|cm)\s*급/g, "$1$2")
    .split(/[,\*\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// 정확히 일치하는 규격이 없을 때, 같은 품목(또는 기준표 전체) 안에서 치수/구성이 가장 비슷한 규격을 찾아 그 값을 대신 쓴다.
// (예: "화이트" 색상만 다르고 치수가 같은 제품, "3단오픈장"처럼 핵심 구성은 같고 부가 설명만 다른 경우)
function fuzzyTonMatch(item, spec, sameItemOnly) {
  const ni = normalizeTonText(item);
  const ns = normalizeTonText(spec);
  const qTokens = tonTokens(ns);
  if (qTokens.length === 0) return null;
  const pool = sameItemOnly ? TON_REFERENCE_TABLE.filter((r) => normalizeTonText(r.item) === ni) : TON_REFERENCE_TABLE;
  let best = null;
  let bestScore = 0;
  for (const r of pool) {
    const rTokens = tonTokens(r.spec);
    const shared = qTokens.filter((t) => rTokens.includes(t)).length;
    if (shared > bestScore) {
      bestScore = shared;
      best = r;
    }
  }
  return bestScore > 0 ? best.per : null;
}

// 규격 끝에 "(신품)", "(중고)", "(단상)"처럼 실측치에는 영향 없는 부가 설명이 괄호로 붙어 있으면,
// 기준표에 있는 것과 사실상 같은 규격인데도 문자열이 달라 정확일치를 못 찾는 경우가 있다.
// 그래서 정확일치를 시도할 때 원문 그대로뿐 아니라 끝의 괄호 설명을 뗀 버전으로도 같이 비교한다.
function stripTrailingParen(s) {
  return normalizeTonText((s || "").replace(/\s*\([^)]*\)\s*$/, ""));
}

// 기준표에 "200리터급"처럼 숫자+단위 뒤에 "급"이 붙어 있는데 실제 입력은 "200리터"처럼 "급"이 없는 경우(혹은 그 반대)도
// 같은 규격으로 봐야 한다. 양쪽 다 "급"을 뗀 형태로 정규화해서 비교할 수 있게 한다.
function stripGeupSuffix(s) {
  return normalizeTonText(s).replace(/(\d+(?:\.\d+)?)\s*(리터|kg|평|인치|톤|mm|cm)\s*급/g, "$1$2");
}

// 품목/규격으로 "개당 용적(톤)"을 찾는다.
// 0) 직원이 이전에 직접 입력해서 저장해둔 값(ton_overrides, DB) → 1) 기준표에서 품목+규격 정확히 일치(끝 괄호 설명 뗀 버전/"급" 뗀 버전 포함)
// → 2) 규격만 정확히 일치(마찬가지) → 3) 같은 품목 안에서 치수/구성이 가장 비슷한 규격
// → 4) 기준표 전체에서 가장 비슷한 규격(품목 자체가 기준표에 없는 경우). 그래도 하나도 안 겹치면 null(직접 입력 대상).
// customOverrides: [{item, spec, per}] — 직원이 한 번 채워넣으면 다음부터 자동으로 채워지는 학습된 값.
function lookupTonPerUnit(item, spec, customOverrides) {
  const ni = normalizeTonText(item);
  const ns = normalizeTonText(spec);
  const nsStripped = stripTrailingParen(spec);
  const nsNoGeup = stripGeupSuffix(ns);
  const nsStrippedNoGeup = stripGeupSuffix(nsStripped);
  const specMatches = (rSpec) => {
    const rn = normalizeTonText(rSpec);
    if (rn === ns || (!!nsStripped && rn === nsStripped)) return true;
    const rnNoGeup = stripGeupSuffix(rn);
    return rnNoGeup === nsNoGeup || (!!nsStrippedNoGeup && rnNoGeup === nsStrippedNoGeup);
  };
  if (!ns) return null;
  if (customOverrides && customOverrides.length) {
    const overrideHit = customOverrides.find((r) => normalizeTonText(r.item) === ni && specMatches(r.spec));
    if (overrideHit) return overrideHit.per;
  }
  const pairHit = TON_REFERENCE_TABLE.find((r) => normalizeTonText(r.item) === ni && specMatches(r.spec));
  if (pairHit) return pairHit.per;
  const specHit = TON_REFERENCE_TABLE.find((r) => specMatches(r.spec));
  if (specHit) return specHit.per;
  const sameItemFuzzy = fuzzyTonMatch(item, spec, true);
  if (sameItemFuzzy != null) return sameItemFuzzy;
  return fuzzyTonMatch(item, spec, false);
}

// DC(할인), 기본설치비, 배송비처럼 실제로 트럭에 실리는 "물건"이 아니라 요금/비용 성격의 품목은
// 애초에 톤수 계산 대상이 아니다. "DC"는 실제 제품명(예: "DC 인버터")에도 섞여 나올 수 있어 품목명이
// 정확히 "DC"일 때만 제외하고, 나머지는 이 글자가 품목명에 들어있으면 제외한다.
// 배관/전선/용접은 실제 배관공사·전기공사·용접 "시공"이라 트럭에 실리는 물건이 아니므로 기본설치비와
// 같은 성격으로 보고 제외 목록에 넣었다(m당/개당 단가로 청구되는 공임·자재비 항목들).
// 가스보충은 냉난방기 설치 때 같이 청구되는 "작업" 성격이라 마찬가지로 제외. 배수펌프/실외기 앵글은 냉난방기에
// 딸려가는 부속 자재라 별도 물건으로 세지 않고 제외한다(실외기앵글/실외기 앵글 둘 다 쓰일 수 있어 같이 넣음).
const TON_EXCLUDED_EXACT = ["dc"];
const TON_EXCLUDED_KEYWORDS = [
  "설치비",
  "배송비",
  "운반비",
  "운송비",
  "상차비",
  "하차비",
  "수수료",
  "할인",
  "배관",
  "전선",
  "용접",
  "가스보충",
  "배수펌프",
  "실외기앵글",
  "실외기 앵글",
];
// 위 키워드에 없는 품목이라도, 규격에 "OO당 OO원"(m당 20,000원 등) 형태의 단가가 적혀 있으면
// 개수가 아니라 시공 길이·횟수 기준으로 청구하는 공임/자재비 항목이라는 뜻이라 마찬가지로 제외한다.
const TON_EXCLUDED_SPEC_PATTERN = /(m|미터|개|회|평|㎡)\s*당\s*[\d,]+\s*원/;
function isTonExcludedItem(item, spec) {
  const t = normalizeTonText(item).toLowerCase();
  if (t) {
    if (TON_EXCLUDED_EXACT.includes(t)) return true;
    if (TON_EXCLUDED_KEYWORDS.some((kw) => t.includes(kw))) return true;
  }
  if (spec && TON_EXCLUDED_SPEC_PATTERN.test(spec)) return true;
  return false;
}

// 품목 리스트(items)를 받아 각 행에 톤수(수량 × 개당용적)를 채워서 반환한다. 정말 비슷한 품목조차 없을 때만 톤수를 null로 둔다.
// DC/설치비/배송비 등 요금성 품목은 tonExcluded:true로 표시하고 애초에 톤수 조회 대상에서 뺀다
// ("미확인"이 아니라 "해당 없음"이므로, 화면에서 노란 칸으로 직접 입력을 요구하지 않는다).
// address가 수도권(서울/경기/인천)이면 냉난방기도 마찬가지로 tonExcluded 처리한다(8번 요청).
function withComputedTons(items, customOverrides, address) {
  const excludeAirconTon = isMetroAreaAddress(address);
  return (items || []).map((it) => {
    if (isTonExcludedItem(it.item, it.spec)) return { ...it, ton: null, tonExcluded: true };
    if (excludeAirconTon && normalizeTonText(it.item).includes("냉난방기")) return { ...it, ton: null, tonExcluded: true };
    const per = lookupTonPerUnit(it.item, it.spec, customOverrides);
    const ton = per != null && it.qty ? Math.round(Number(it.qty) * per * 1000) / 1000 : null;
    return { ...it, ton, tonExcluded: false };
  });
}

// 카드②(톤수 계산) 표를 품목/규격/수량/톤수 기준으로 정렬한다. rows는 {it, idx} 쌍의 배열
// (idx는 원본 items 배열 인덱스 — 체크박스·직접입력·저장 버튼이 이 idx로 동작하므로 정렬해도 그대로 맞는다).
// sortKey가 null이면(기본값) 정렬하지 않고 붙여넣은 원본 순서 그대로 반환한다.
function sortVisibleRows(rows, sortKey, sortDir) {
  if (!sortKey) return rows;
  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sortKey === "qty") return ((Number(a.it.qty) || 0) - (Number(b.it.qty) || 0)) * dir;
    if (sortKey === "ton") {
      const av = a.it.ton == null ? -Infinity : Number(a.it.ton);
      const bv = b.it.ton == null ? -Infinity : Number(b.it.ton);
      return (av - bv) * dir;
    }
    const av = sortKey === "item" ? a.it.item : a.it.spec;
    const bv = sortKey === "item" ? b.it.item : b.it.spec;
    return (av || "").localeCompare(bv || "", "ko") * dir;
  });
  return sorted;
}

// 품목명+규격별로 수량을 합산해서 "현장에 총 몇 개인지" 보여주는 품목별 데이터 집계.
// 배송비/설치비 등 요금성 품목(withComputedTons가 이미 tonExcluded로 표시해둔 것)은 물리적 수량이 아니므로 자동으로 뺀다.
// excludedIdxs에 들어있는 행(사용자가 직접 선택삭제한 행)도 함께 뺀다.
// idxs에는 이 그룹으로 합쳐진 원본 items 배열의 인덱스를 모아둬서, 그룹 단위 선택삭제 시 어떤 행을 뺄지 알 수 있게 한다.
// 정렬은 화면(컴포넌트)에서 사용자가 고른 기준으로 하므로, 여기서는 정렬하지 않고 그대로 반환한다.
function groupItemQuantities(items, excludedIdxs) {
  const map = new Map();
  (items || []).forEach((it, idx) => {
    if (it.tonExcluded) return;
    if (excludedIdxs && excludedIdxs.has(idx)) return;
    const itemName = (it.item || "").trim() || "(품목명 없음)";
    const specName = (it.spec || "").trim();
    const key = `${itemName}〓${specName}`;
    if (!map.has(key)) map.set(key, { key, item: itemName, spec: specName, qty: 0, idxs: [] });
    const e = map.get(key);
    e.qty += Number(it.qty) || 0;
    e.idxs.push(idx);
  });
  return Array.from(map.values());
}

// ---------- 견적서를 등록하지 않고 붙여넣기만으로 톤수/배송비를 미리 확인하는 기능 ----------
// 엑셀에서 표 영역을 복사하면 셀 사이는 탭(\t), 행 사이는 줄바꿈으로 구분된 텍스트가 클립보드에 담긴다.
// 다만 "품목\n(Product)"처럼 한 칸 안에 줄바꿈이 있는 셀(견적서 헤더에 흔함)은 엑셀이 그 칸 전체를
// 큰따옴표로 감싸서 내보내므로, 단순히 줄바꿈마다 행을 나누면 그런 칸이 서로 다른 행으로 쪼개져버린다.
// 그래서 따옴표 밖의 탭/줄바꿈만 열/행 구분자로 쓰고, 따옴표 안의 줄바꿈·탭은 셀 내용 그대로 살린다.
function parsePastedTable(text) {
  const norm = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    if (inQuotes) {
      if (c === '"') {
        if (norm[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (c === "\t") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((c) => cellText(c)));
}

// detectColumns와 같은 방식(헤더 글자로 열 위치 찾기)이지만, 붙여넣기는 톤수 계산이 목적이라
// 단가/금액 칸이 없어도(품목+수량만 있어도) 헤더로 인정한다.
function detectPasteColumns(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const cols = {};
    row.forEach((cell, idx) => {
      const t = cellText(cell).replace(/\s/g, "");
      if (!t) return;
      if (t.includes("품") && t.includes("목")) cols.item = idx;
      else if (t.includes("규격")) cols.spec = idx;
      else if (t.includes("수량")) cols.qty = idx;
      else if (t.includes("단가")) cols.price = idx;
      else if (t.includes("금액")) cols.amount = idx;
      else if (t.includes("비고")) cols.note = idx;
    });
    if (cols.item !== undefined && cols.qty !== undefined) {
      return { headerRowIdx: i, cols };
    }
  }
  return null;
}

// 붙여넣은 표에서 품목/규격/수량 목록을 뽑아낸다. "품목/규격/수량" 같은 헤더 글자를 못 찾으면
// (담당자가 헤더 없이 데이터만 복사한 경우) 왼쪽부터 품목/규격/수량/단가/금액/비고 순으로 가정하고,
// 첫 줄의 수량 칸이 숫자가 아니면(=사실 헤더 줄인데 글자를 못 알아챈 경우) 그 줄은 건너뛴다.
function parsePastedItems(text) {
  const rows = parsePastedTable(text);
  if (rows.length === 0) return [];
  const detected = detectPasteColumns(rows);
  const cols = detected ? detected.cols : { item: 0, spec: 1, qty: 2, price: 3, amount: 4, note: 5 };
  const specCol = cols.spec ?? cols.item + 1;
  let startIdx = detected ? detected.headerRowIdx + 1 : 0;
  if (!detected) {
    const firstQty = cellText(rows[0][cols.qty]).replace(/,/g, "");
    if (firstQty && isNaN(Number(firstQty))) startIdx = 1;
  }

  const items = [];
  // 견적서 표는 같은 품목이 여러 규격으로 이어질 때 "품목" 칸을 첫 줄에만 적고 아래 줄은 비워두는 경우가
  // 많다(예: "책장" 아래 "4단올문장", "2단올문장"이 품목 칸 없이 규격만 이어짐). 엑셀 파싱과 동일하게
  // 마지막으로 나온 품목명을 이어받아 채운다.
  let currentItem = "";
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i] || [];
    const itemCell = cellText(row[cols.item]);
    const specCell = cellText(row[specCol]);
    const qtyRaw = row[cols.qty];
    const priceRaw = cols.price != null ? row[cols.price] : null;
    const amountRaw = cols.amount != null ? row[cols.amount] : null;
    const noteCell = cols.note != null ? cellText(row[cols.note]) : "";

    const lower = itemCell.toLowerCase();
    if (STOP_NAMES.includes(lower)) break;
    if (SKIP_NAMES.includes(lower)) continue;
    if (itemCell.startsWith("*") || itemCell.startsWith("※")) continue;
    if (!itemCell && !specCell) continue;

    const hasData = cellText(qtyRaw) !== "" || cellText(priceRaw) !== "" || cellText(amountRaw) !== "";
    if (itemCell && !hasData && !specCell) continue; // 구획 제목 줄(예: "ㅡ 소장실 ㅡ")은 톤수 계산과 무관하므로 건너뜀

    if (itemCell) currentItem = itemCell;
    if (!currentItem) continue;

    const toNum = (v) => {
      const t = cellText(v).replace(/,/g, "");
      if (t === "" || t === "-") return null;
      const n = Number(t);
      return isNaN(n) ? null : n;
    };
    const qty = toNum(qtyRaw) ?? 1;
    const unitPrice = toNum(priceRaw);
    const amount = toNum(amountRaw) ?? (unitPrice != null ? unitPrice * qty : null);

    items.push({ item: currentItem, spec: specCell, qty: isNaN(qty) ? 1 : qty, unit_price: unitPrice, amount, note: noteCell });
  }
  return items;
}

// 붙여넣은 견적서 텍스트에서 "배송지: ..." 값을 찾아온다(견적서 업로드 파싱과 같은 정규식).
// 품목표뿐 아니라 상단 정보(수신/참조/발행일 등)까지 통째로 붙여넣는 경우를 위한 것이라, 표 파싱과
// 별개로 붙여넣은 텍스트 전체(모든 셀)를 훑는다.
function extractPastedSiteAddress(text) {
  const rows = parsePastedTable(text);
  for (const row of rows) {
    for (const cell of row) {
      const m = cellText(cell).match(/배송지\s*[:：]\s*([^\n]+)/);
      if (m) return m[1].trim();
    }
  }
  return "";
}

// 붙여넣은 견적서 텍스트에서 렌탈/구매 여부를 자동으로 판단한다. 전표 등록용 견적서 파싱(parseQuoteRows)과
// 같은 기준을 쓴다 — "렌탈기간" 항목이 있거나 "렌탈 N개월"처럼 "렌탈"이 들어간 칸에 개월수가 적혀 있으면
// 렌탈, 그런 단서가 전혀 없으면 구매로 본다(전표 파싱의 기본값도 "구매"). 톤수/배송비 계산 화면에서
// 붙여넣은 견적서 내용에 맞게 "③ 배송비 계산"의 거래유형이 자동으로 골라지게 하기 위한 것 — 아직 아무것도
// 안 붙여넣었으면(rows가 없으면) 판단할 근거가 없으니 null을 돌려주고 기존 값을 그대로 둔다.
function detectPastedTransactionType(text) {
  const rows = parsePastedTable(text);
  if (rows.length === 0) return null;
  for (const row of rows) {
    for (const cell of row) {
      const raw = cellText(cell);
      if (!raw) continue;
      if (raw.replace(/\s/g, "").includes("렌탈기간")) return "rental";
      if (raw.includes("렌탈") && /\d+\s*개월/.test(raw)) return "rental";
      if (raw.includes("렌탈") && /\(\d{4}[.\-]\d{2}~\d{4}[.\-]\d{2}\)/.test(raw)) return "rental";
    }
  }
  return "purchase";
}

// 붙여넣은 견적서 텍스트에서 "수신: 거래처 - 현장명" / "담당자: ..." 값을 찾아온다(견적서 헤더 파싱과 같은 정규식,
// extractPastedSiteAddress와 같은 방식으로 붙여넣은 텍스트 전체를 훑는다). 품목별 데이터 출력물에 거래처·담당자를
// 표시하기 위한 것 — 업체별데이터의 "품목별 수량 통계" 출력물과 형식을 맞춘다.
function extractPastedCustomerInfo(text) {
  const rows = parsePastedTable(text);
  let customer = "";
  let siteName = "";
  let manager = "";
  for (const row of rows) {
    for (const cell of row) {
      const raw = cellText(cell);
      let m = raw.match(/수\s*신\s*[:：]\s*([^\n]+)/);
      if (m) {
        const split = splitCustomerAndSite(m[1]);
        customer = split.customer;
        if (split.siteName) siteName = split.siteName;
      }
      m = raw.match(/현장명\s*[:：]\s*([^\n]+)/);
      if (m) siteName = m[1].trim();
      m = raw.match(/담당자\s*[:：]\s*([^\/\n]+)/);
      if (m) manager = m[1].trim();
    }
  }
  return { customer, siteName, manager };
}

// 주소 문자열을 공백만 정리해서 비교/저장 키로 쓴다 (톤수의 normalizeTonText와 같은 방식).
function normalizeAddressText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

// 배송지 주소 옆에 다는 "배송지 정보" 버튼.
// 엘리베이터 유무·5톤/1톤 차량 진입 가능 여부·층고 같은 정보는 공개된 데이터로 자동 조회할 방법이 없어서,
// 지도/로드뷰 링크를 바로 열어 직접 확인할 수 있게 하고, 한 번 확인한 내용은 주소별로 저장해서
// 다음에 같은 배송지가 나오면 자동으로 보여주는 방식(직원들이 같이 채워가는 공용 메모)으로 만들었다.
function DeliverySiteInfoButton({ address }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState("");
  const [draft, setDraft] = useState("");
  const na = normalizeAddressText(address);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && na) {
      setLoading(true);
      const { data, error } = await supabase.from("delivery_site_notes").select("note").eq("address", na).maybeSingle();
      if (!error) {
        setSavedNote(data?.note || "");
        setDraft(data?.note || "");
        setLoaded(true);
      }
      setLoading(false);
    }
  };

  const save = async () => {
    if (!na) return;
    setSaving(true);
    const { error } = await supabase
      .from("delivery_site_notes")
      .upsert({ address: na, note: draft, updated_at: new Date().toISOString() }, { onConflict: "address" });
    setSaving(false);
    if (error) {
      alert("저장하지 못했어요: " + error.message + " (Supabase에 delivery_site_notes 테이블이 아직 없다면 관리자에게 설정을 요청해주세요.)");
      return;
    }
    setSavedNote(draft);
    alert("저장했어요. 다음에 같은 배송지가 나오면 자동으로 보여요.");
  };

  if (!address || !na) return null;

  const kakaoUrl = `https://map.kakao.com/link/search/${encodeURIComponent(na)}`;
  const naverUrl = `https://map.naver.com/p/search/${encodeURIComponent(na)}`;

  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 10 }}>
      <button type="button" onClick={toggle} style={{ ...miniBtnStyle, background: savedNote ? "#EAF3EC" : "none" }}>
        배송지 정보{savedNote ? " (메모 있음)" : ""}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 40,
            top: "calc(100% + 6px)",
            left: 0,
            width: 360,
            background: "#fff",
            border: `1px solid ${C.line}`,
            boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
            padding: 16,
            fontFamily: sans,
          }}
        >
          <div style={{ fontSize: 12.5, color: C.ink, marginBottom: 10, wordBreak: "break-all" }}>{na}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <a href={kakaoUrl} target="_blank" rel="noreferrer" style={{ ...miniBtnStyle, textDecoration: "none", textAlign: "center", flex: 1 }}>
              카카오맵·로드뷰
            </a>
            <a href={naverUrl} target="_blank" rel="noreferrer" style={{ ...miniBtnStyle, textDecoration: "none", textAlign: "center", flex: 1 }}>
              네이버지도
            </a>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
            엘리베이터 유무·5톤 차량 진입 가능 여부·지하주차장 제한·층고 등은 공개된 데이터로 자동 조회가 안 돼서(그런
            정보를 제공하는 곳이 없어요), 위 지도/로드뷰로 직접 확인해 아래에 적어두시면 다음에 같은 배송지가 나올 때
            자동으로 떠요.
          </div>
          {loading ? (
            <div style={{ fontSize: 12.5, color: C.muted }}>불러오는 중…</div>
          ) : (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="예: E/V 있음, 5톤 진입 가능, 지하주차장은 1톤만 가능, 층고 2.3m, 주변 도로 협소"
                rows={4}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: 8,
                  fontSize: 12.5,
                  border: `1px solid ${C.line}`,
                  fontFamily: sans,
                  marginBottom: 8,
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={save} disabled={saving} style={miniBtnStylePrimary}>
                  {saving ? "저장 중…" : "메모 저장"}
                </button>
                <button type="button" onClick={() => setOpen(false)} style={miniBtnStyle}>
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}

// ---------- 배송비 계산 ----------
// 사진으로 받은 "배송료 기준(용인배송기준)" 표와 "무빙트럭 화물 운임표"를 최대한 그대로 옮긴 값이다.
// 손으로 옮긴 표라 오탈자가 있을 수 있으니, 특히 아래 두 가지는 실제 표와 한 번 대조해서 확인해달라:
// 1) 구매제품의 "톤당배송료"는 사진상 모든 구간에서 동일하게 보여서 "1톤당 1만원"으로 읽어 반영했다(불확실).
// 2) 무빙트럭 표에서 다마스 요금이 없는 지역, 흐릿하게 찍힌 일부 라보 칸은 빈칸("-")으로 뒀다.

// "광주"는 경기도 광주시(분당·용인 인근)와 광주광역시(전라남도 인접, 별도 광역시)를 둘 다 가리킬 수 있는 애매한
// 키워드라, 주소에 "전남광주 고흥군..."처럼 다른 시/도 이름이 함께 적혀 있으면 경기 광주로 잘못 매칭될 수 있다.
// 그래서 "광주" 하나만으로 지역을 정하지 않고, 주소에 다른 시/도 이름이 같이 있으면 경기 광주 구역에서는 제외한다.
const AMBIGUOUS_GWANGJU_EXCLUDE = [
  "광주광역시",
  "전남",
  "전라남도",
  "경남",
  "경상남도",
  "전북",
  "전라북도",
  "경북",
  "경상북도",
  "충남",
  "충청남도",
  "충북",
  "충청북도",
  "강원",
  "강원도",
  "부산",
  "대구",
  "울산",
];

// 렌탈제품 설치/회수비 - 지역별 소량/0.5톤/1톤 요금(원 단위)
const RENTAL_DELIVERY_ZONES = [
  {
    zone: "분당/용인/수원/화성/광주",
    keywords: ["분당", "용인", "수원", "화성", "광주"],
    ambiguousKeywords: ["광주"],
    excludeIfIncludes: AMBIGUOUS_GWANGJU_EXCLUDE,
    small: 40000,
    half: 80000,
    one: 160000,
  },
  { zone: "서울전역/하남/안양/광명/과천/구리", keywords: ["서울", "하남", "안양", "광명", "과천", "구리"], small: 60000, half: 120000, one: 240000 },
  { zone: "기타 경기도, 인천 전지역", keywords: ["경기", "인천"], small: 80000, half: 160000, one: 320000 },
  { zone: "충청남도, 충청북도, 강원도 일부", keywords: ["충청남도", "충남", "충청북도", "충북", "강원"], half: 240000, one: 420000 },
  { zone: "전라북도, 경상북도, 강원도 일부", keywords: ["전라북도", "전북", "경상북도", "경북"], half: 360000, one: 540000 },
  { zone: "경상남도, 전라남도, 부산시, 대구시", keywords: ["경상남도", "경남", "전라남도", "전남", "부산", "대구"], half: 480000, one: 660000 },
];

// 구매제품 배송료 - 지역별 고정 추가금(지역배송료)에 톤당배송료(1톤당 1만원)를 더한다.
// 예: 인근지역(용인, 지역배송료 0원) 1톤 = 1만원 / 경기(원거리, 지역배송료 4만원) 1톤 = 4만원+1만원 = 5만원.
const PURCHASE_PER_TON_RATE = 10000;
const PURCHASE_DELIVERY_ZONES = [
  { zone: "인근지역(분당,용인,동탄 등)", keywords: ["분당", "용인", "동탄", "포곡", "둔전", "전대리", "대리", "에버랜드", "팔달", "영통", "반월", "반정", "능동"], surcharge: 0 },
  {
    zone: "서울/경기(인근)",
    keywords: ["서울", "오산", "광주", "수원", "양지", "모현", "천리", "송전", "원삼", "백암", "매송", "비봉", "정남"],
    ambiguousKeywords: ["광주"],
    excludeIfIncludes: AMBIGUOUS_GWANGJU_EXCLUDE,
    surcharge: 20000,
  },
  { zone: "경기(근거리)", keywords: ["광명", "과천", "시흥", "안양", "의왕", "안산", "부천", "하남", "평택", "군포", "화성"], surcharge: 30000 },
  { zone: "경기(원거리)", keywords: ["구리", "남양주", "의정부", "양주", "인천", "일산", "파주", "김포", "고양"], surcharge: 40000 },
  { zone: "경기(장거리)", keywords: ["양평", "여주", "이천", "안성", "가평", "포천", "동두천", "강화"], surcharge: 50000 },
  { zone: "충청도, 강원도(내륙지방)", keywords: ["충청", "충남", "충북", "강원"], surcharge: 70000 },
  { zone: "전라북도, 경상북도, 강원도(해안가)", keywords: ["전라북도", "전북", "경상북도", "경북"], surcharge: 150000 },
  { zone: "경상남도, 전라남도, 울산시, 부산시, 강원도(산지)", keywords: ["경상남도", "경남", "전라남도", "전남", "울산", "부산"], surcharge: 250000 },
  { zone: "제주도, 섬, 산간벽지", keywords: ["제주"], surcharge: null }, // 협의
];

// 무빙트럭(용차) 화물 운임표 - 단위 만원(계산 시 ×10,000). 도착지역별 1톤/2.5톤/5톤 요금.
// 다마스/라보는 계산에서 제외 요청에 따라 데이터에서도 뺐다(원래 체크박스 옵션에도 없었음).
// 거리 구간(10km 이하 ~ 90km 미만)은 출발지 용인시 기흥구 공세동 기준.
const CHARTERED_TRUCK_GROUPS = [
  {
    region: "서울/수도권",
    rows: [
      { label: "10km 이하", keywords: [], ton1: 5, ton2_5: 8, ton5: 14 },
      { label: "20km 미만", keywords: [], ton1: 6, ton2_5: 9, ton5: 15 },
      { label: "30km 미만", keywords: [], ton1: 7, ton2_5: 10, ton5: 17 },
      { label: "50km 미만", keywords: [], ton1: 8, ton2_5: 12, ton5: 19 },
      { label: "70km 미만", keywords: [], ton1: 9, ton2_5: 13, ton5: 20 },
      { label: "90km 미만", keywords: [], ton1: 10, ton2_5: 15, ton5: 21 },
    ],
  },
  {
    region: "강원",
    rows: [
      { label: "문막,철원,춘천", keywords: ["문막", "철원", "춘천"], ton1: 13, ton2_5: 18, ton5: 23 },
      { label: "원주,화천,횡성", keywords: ["원주", "화천", "횡성"], ton1: 16, ton2_5: 19, ton5: 25 },
      { label: "속초,양구,영월,인제,평창", keywords: ["속초", "양구", "영월", "인제", "평창"], ton1: 18, ton2_5: 28, ton5: 33 },
      { label: "강릉,고성,동해,삼척,태백", keywords: ["강릉", "고성", "동해", "삼척", "태백"], ton1: 24, ton2_5: 33, ton5: 38 },
    ],
  },
  {
    region: "충북",
    rows: [
      { label: "진천,청주", keywords: ["진천", "청주"], ton1: 13, ton2_5: 20, ton5: 24 },
      { label: "괴산,음성,제천,충주", keywords: ["괴산", "음성", "제천", "충주"], ton1: 14, ton2_5: 21, ton5: 26 },
      { label: "단양,보은,영동,옥천", keywords: ["단양", "보은", "영동", "옥천"], ton1: 16, ton2_5: 22, ton5: 28 },
    ],
  },
  {
    region: "충남",
    rows: [
      { label: "당진,아산,천안", keywords: ["당진", "아산", "천안"], ton1: 12, ton2_5: 18, ton5: 22 },
      { label: "공주,세종,예산,서산,청양,태안", keywords: ["공주", "세종", "예산", "서산", "청양", "태안"], ton1: 14, ton2_5: 20, ton5: 25 },
      { label: "대전,계룡,논산,보령,부여,홍성", keywords: ["대전", "계룡", "논산", "보령", "부여", "홍성"], ton1: 15, ton2_5: 22, ton5: 26 },
      { label: "안면도,금산,서천", keywords: ["안면도", "금산", "서천"], ton1: 16, ton2_5: 23, ton5: 28 },
    ],
  },
  {
    region: "전북",
    rows: [
      { label: "전주,군산,무주,익산,완주", keywords: ["전주", "군산", "무주", "익산", "완주"], ton1: 18, ton2_5: 25, ton5: 30 },
      { label: "김제,부안,임실,진안", keywords: ["김제", "부안", "임실", "진안"], ton1: 19, ton2_5: 28, ton5: 34 },
      { label: "고창,남원,장수,정읍", keywords: ["고창", "남원", "장수", "정읍"], ton1: 20, ton2_5: 30, ton5: 35 },
    ],
  },
  {
    region: "전남",
    rows: [
      { label: "광주,곡성,담양,영광,장성", keywords: ["곡성", "담양", "영광", "장성"], ton1: 22, ton2_5: 30, ton5: 40 },
      { label: "구례,나주,무안,순천,함평,화순", keywords: ["구례", "나주", "무안", "순천", "함평", "화순"], ton1: 23, ton2_5: 31, ton5: 41 },
      { label: "광양,목포,보성,여수,영암", keywords: ["광양", "목포", "보성", "여수", "영암"], ton1: 24, ton2_5: 34, ton5: 43 },
      { label: "강진,고흥,완도,장흥,진도,해남", keywords: ["강진", "고흥", "완도", "장흥", "진도", "해남"], ton1: 28, ton2_5: 35, ton5: 46 },
    ],
  },
  {
    region: "경북",
    rows: [
      { label: "문경,영주,예천,상주", keywords: ["문경", "영주", "예천", "상주"], ton1: 19, ton2_5: 27, ton5: 34 },
      { label: "안동,의성,봉화", keywords: ["안동", "의성", "봉화"], ton1: 21, ton2_5: 30, ton5: 35 },
      { label: "대구,구미,군위,영천,성주,경산", keywords: ["대구", "구미", "군위", "영천", "성주", "경산"], ton1: 22, ton2_5: 33, ton5: 37 },
      { label: "고령,울진,청도,칠곡", keywords: ["고령", "울진", "청도", "칠곡"], ton1: 23, ton2_5: 34, ton5: 40 },
      { label: "경주,영덕,영양,포항", keywords: ["경주", "영덕", "영양", "포항"], ton1: 24, ton2_5: 35, ton5: 42 },
    ],
  },
  {
    region: "경남",
    rows: [
      { label: "산청,함양", keywords: ["산청", "함양"], ton1: 23, ton2_5: 33, ton5: 40 },
      { label: "거창,진주,창녕,합천", keywords: ["거창", "진주", "창녕", "합천"], ton1: 25, ton2_5: 34, ton5: 42 },
      { label: "밀양,사천,하동,함안", keywords: ["밀양", "사천", "하동", "함안"], ton1: 26, ton2_5: 37, ton5: 45 },
      { label: "김해,남해,울주,양산,창원", keywords: ["김해", "남해", "울주", "양산", "창원"], ton1: 27, ton2_5: 38, ton5: 50 },
      { label: "부산,거제,울산,통영", keywords: ["부산", "거제", "울산", "통영"], ton1: 28, ton2_5: 39, ton5: 53 },
    ],
  },
];
// 체크박스에 보여줄 용차 옵션. "1톤(1.4톤+1)" 같은 표기는 "1톤 요금 + 1만원"으로 해석해 반영했다.
// "5톤(길이+3~5)"는 폭이 있는 범위라 중간값 4만원을 기본으로 넣었다(확인 필요).
const CHARTERED_TRUCK_OPTIONS = [
  { key: "ton1", label: "1톤", col: "ton1", extra: 0 },
  { key: "ton1_4", label: "1.4톤", col: "ton1", extra: 10000 },
  { key: "ton2_5", label: "2.5톤", col: "ton2_5", extra: 0 },
  { key: "ton3_5", label: "3.5톤", col: "ton2_5", extra: 20000 },
  { key: "ton5", label: "5톤", col: "ton5", extra: 0 },
  { key: "ton5_long", label: "5톤장축", col: "ton5", extra: 40000 },
];
const CHARTERED_TRUCK_ROWS = CHARTERED_TRUCK_GROUPS.flatMap((g) => g.rows.map((r) => ({ ...r, region: g.region })));

// 용차표 금액(rate 만원 단위 + extra)은 편도(배송 한 번) 기준이다. 렌탈은 계약이 끝나면 회수하러 다시 가야 해서
// 왕복(편도×2)으로 청구하고, 구매(판매)는 배송 한 번으로 끝나니 편도 그대로 둔다. 미리보기 가격과 실제 계산 결과가
// 같은 로직을 쓰도록 함수 하나로 뺐다.
function truckOptionCost(rate, extra, transactionType) {
  if (rate == null) return null;
  const oneWay = Math.round(rate * 10000) + extra;
  return transactionType === "rental" ? oneWay * 2 : oneWay;
}

// "계산하기"로 나온 결과 화면에서 용차 한 줄 옆의 "x"를 눌렀을 때, 그 줄만 빼고 합계를 다시 계산한다.
// result가 아직 없으면(계산 전) 그대로 둔다.
// (2026-10-02 수정) 사다리차 기능이 생긴 뒤로는 total이 기본배송비+용차+사다리차 세 가지를 합친
// 값인데, 여기선 사다리차를 빼놓고 계산해서 용차를 하나 지우면 사다리차 비용까지 같이 사라지는
// 버그가 있었다. ladderCost를 그대로 더해서 고쳤다.
function removeTruckDetailFromResult(result, key) {
  if (!result) return result;
  const remaining = result.truckDetails.filter((d) => d.key !== key);
  const truckTotal = remaining.reduce((sum, d) => sum + d.cost, 0);
  return { ...result, truckDetails: remaining, truckTotal, total: result.base + truckTotal + (result.ladderCost || 0) };
}

function findZoneIndex(zones, address) {
  const a = address || "";
  const idx = zones.findIndex((z) =>
    z.keywords.some((k) => {
      if (!a.includes(k)) return false;
      // "광주"처럼 다른 지역과 이름이 겹치는 애매한 키워드는, 주소에 그 지역과 무관한 다른 시/도 이름이
      // 함께 있으면 이 키워드로는 매칭시키지 않는다(같은 구역의 다른 키워드는 그대로 유효하게 매칭된다).
      if (z.ambiguousKeywords && z.ambiguousKeywords.includes(k) && z.excludeIfIncludes) {
        if (z.excludeIfIncludes.some((ex) => a.includes(ex))) return false;
      }
      return true;
    })
  );
  return idx >= 0 ? idx : null;
}

// "수도권"(서울/경기/인천) 판정 — 8번 요청: 수도권은 냉난방기를 톤수 계산에서 제외한다(왜: 수도권은 냉난방기를
// 별도 전문기사가 직접 차량으로 싣고 가서 설치하는 경우가 많아 화물차 적재 톤수에 넣지 않는다는 현업 기준).
// 주소에 "서울"/"경기"/"인천"이 직접 적혀 있으면 그대로 수도권으로 보고, 시/군 이름만 적혀 있어도(예: "용인시 기흥구")
// 구매 배송료 표의 인근지역~경기(장거리) 구역(0~4번, 전부 수도권)에 걸리면 수도권으로 판정한다. "광주"처럼 다른
// 지역과 이름이 겹치는 애매한 키워드는 findZoneIndex가 이미 처리해주는 예외 목록을 그대로 재사용한다.
function isMetroAreaAddress(address) {
  const a = address || "";
  if (a.includes("서울") || a.includes("경기") || a.includes("인천")) return true;
  const idx = findZoneIndex(PURCHASE_DELIVERY_ZONES, a);
  return idx != null && idx <= 4;
}

// ---------- 카카오맵으로 "용인시 기흥구 공세동(모든 용차 출발지 기준) ↔ 배송지" 실거리를 계산하는 기능 ----------
// 서울/수도권 용차 구간표(10km 이하 ~ 90km 미만)는 지역명이 아니라 "거리"로 나뉘어 있어서 주소 키워드 매칭으로는
// 자동 선택이 안 된다. 그래서 주소를 좌표로 변환(지오코딩)해서 실제 거리를 계산해 구간을 맞춘다.
// Vercel에 NEXT_PUBLIC_KAKAO_JS_KEY 환경변수(카카오 개발자센터에서 발급받은 JavaScript 키)가 설정돼 있어야
// 동작하고, 없으면 조용히 건너뛰어서(에러 없이) 지금처럼 직접 구간을 선택하면 된다.
const KAKAO_ORIGIN_ADDRESS = "경기도 용인시 기흥구 공세동";
let kakaoSdkPromise = null;
function loadKakaoMapsSdk() {
  if (typeof window === "undefined") return Promise.resolve(null);
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) return Promise.resolve(null);
  if (window.kakao && window.kakao.maps && window.kakao.maps.services) return Promise.resolve(window.kakao);
  if (kakaoSdkPromise) return kakaoSdkPromise;
  kakaoSdkPromise = new Promise((resolve) => {
    const onReady = () => window.kakao.maps.load(() => resolve(window.kakao));
    const existing = document.getElementById("kakao-maps-sdk");
    if (existing) {
      if (window.kakao && window.kakao.maps) onReady();
      else existing.addEventListener("load", onReady);
      return;
    }
    const script = document.createElement("script");
    script.id = "kakao-maps-sdk";
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services&autoload=false`;
    script.onload = onReady;
    script.onerror = () => {
      console.warn("[카카오맵] SDK 로드 실패(네트워크/키/도메인 설정 확인 필요)");
      resolve(null);
    };
    document.head.appendChild(script);
  }).then((kakao) => {
    // 실패한 결과는 캐시하지 않는다 — 다음 시도 때(예: 카카오 설정을 방금 고친 경우) 다시 로드를 시도하도록.
    if (!kakao) kakaoSdkPromise = null;
    return kakao;
  });
  return kakaoSdkPromise;
}

// 주소 문자열을 위도/경도로 변환한다. API 키가 없거나, 주소를 못 찾거나, 네트워크 오류가 나면 null(자동 실패 시
// 조용히 넘어가고 직접 선택하도록 둔다).
// 카카오 주소검색은 "N층", "OOO동 OOO호"처럼 도로명/지번 주소 뒤에 붙는 상세정보가 있으면
// 못 찾는 경우가 많다(ZERO_RESULT). 예: "서울시 강남구 테헤란로 410, 19~21층"은 실패하지만
// "서울시 강남구 테헤란로 410"은 성공한다. 그래서 검색 전에 상세정보를 잘라낸다.
function stripAddressDetail(address) {
  let s = (address || "").split(",")[0].trim(); // 콤마 뒤(대부분 층/호 상세정보)는 버림
  s = s.replace(/\s*(지하)?\s*\d+(~\d+)?\s*층\s*$/, "").trim(); // "...410 19~21층" 처럼 콤마 없이 붙은 경우
  s = s.replace(/\s*\d+동\s*\d*호?\s*$/, "").trim(); // "...101동 202호"
  return s || (address || "").trim();
}

async function geocodeAddress(address) {
  const kakao = await loadKakaoMapsSdk();
  if (!kakao || !address) return null;
  const clean = stripAddressDetail(address);
  return new Promise((resolve) => {
    try {
      const geocoder = new kakao.maps.services.Geocoder();
      geocoder.addressSearch(clean, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          resolve({ lat: Number(result[0].y), lng: Number(result[0].x) });
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

// 로드뷰를 화면에 직접 띄우지 않고, 카카오맵/네이버지도로 바로 이동해서 로드뷰·거리뷰를 볼 수 있는 링크 버튼만 보여준다.
// (배송지 정보 버튼에서 쓰는 것과 같은 링크 방식 — 새 탭에서 열려서 필요할 때만 클릭해서 본다)
function AddressMapLinks({ address }) {
  const na = normalizeAddressText(address);
  if (!na) return null;
  const kakaoUrl = `https://map.kakao.com/link/search/${encodeURIComponent(na)}`;
  const naverUrl = `https://map.naver.com/p/search/${encodeURIComponent(na)}`;
  return (
    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
      <a href={kakaoUrl} target="_blank" rel="noreferrer" style={{ ...miniBtnStyle, textDecoration: "none", textAlign: "center" }}>
        카카오맵·로드뷰
      </a>
      <a href={naverUrl} target="_blank" rel="noreferrer" style={{ ...miniBtnStyle, textDecoration: "none", textAlign: "center" }}>
        네이버지도
      </a>
    </div>
  );
}

// 출발지(용인시 기흥구 공세동)는 항상 같은 곳이라, 좌표를 한 번만 조회해서 세션 안에서 재사용한다.
// 단, 실패한 결과는 캐시하지 않는다 — 카카오 설정(도메인/서비스 활성화 등)을 나중에 고친 뒤 재시도할 수 있어야 하므로.
let originCoordsPromise = null;
function getOriginCoords() {
  if (originCoordsPromise) return originCoordsPromise;
  originCoordsPromise = geocodeAddress(KAKAO_ORIGIN_ADDRESS).then((coords) => {
    if (!coords) {
      console.warn("[카카오맵] 출발지(용인시 기흥구 공세동) 좌표 조회 실패");
      originCoordsPromise = null;
    }
    return coords;
  });
  return originCoordsPromise;
}

// 두 좌표 사이의 직선거리(km, 하버사인 공식).
function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// 직선거리는 실제 도로 주행거리보다 짧기 마련이라, 수도권 도로망 기준 대략적인 배율로 보정한다.
// 어디까지나 자동 추정치라 화면에서 항상 직접 구간으로 바꿔 선택할 수 있게 해둔다.
const ROAD_DISTANCE_FACTOR = 1.3;

// 보정된 거리(km)로 서울/수도권 용차 구간(10km 이하 ~ 90km 미만) 중 맞는 행을 찾는다.
// 표 자체가 90km까지만 있어서, 그보다 먼 곳은 더 이상 "서울/수도권" 성격이 아니라 지역별 요금표(강원/충청/전라/경상)
// 쪽에서 다뤄야 할 거리다. 예전엔 이런 경우도 그냥 "90km 미만" 칸에 억지로 끼워 넣어서, 실제로는 200km 넘게
// 떨어진 곳인데도 화면엔 "90km 미만"이라고 표시되고 요금도 그만큼 훨씬 저렴하게 잡히는 문제가 있었다(예: 용인 기흥구
// 공세동 ↔ 경북 경산시). 그래서 90km를 넘으면 자동 선택을 아예 하지 않고 null을 반환해서, 화면에서 "직접 확인
// 필요" 경고를 보여주고 사용자가 지역을 스스로 골라야만 하도록 바꿨다.
function findTruckRowByDistanceKm(km) {
  const seoul = CHARTERED_TRUCK_GROUPS.find((g) => g.region === "서울/수도권");
  if (!seoul || km == null) return null;
  const thresholds = [10, 20, 30, 50, 70, 90]; // rows 순서(10km 이하/20km 미만/.../90km 미만)와 1:1 대응
  const idx = thresholds.findIndex((t) => km <= t);
  if (idx === -1) return null; // 90km 초과 — 서울/수도권 구간표 밖이라 자동 선택하지 않는다.
  const row = seoul.rows[idx];
  if (!row) return null;
  return CHARTERED_TRUCK_ROWS.findIndex((r) => r.region === "서울/수도권" && r.label === row.label);
}

// "사다리차 시세 알아본 뒤에 배송비에 사다리차 1시간씩 추가할 수 있는 방법 넣어줘"(2026-10-02) 요청으로
// 추가. 사다리차·스카이차 요금은 업체·지역·톤수(차량 크기)·층수에 따라 차이가 커서(시세 조사 결과 기본
// 1시간이 보통 10~30만원대, 추가시간당 8만원대부터 시작하는 등 범위가 넓었다) 하나의 "정가"로 못 박기보다,
// 시세 조사로 확인한 일반적인 수준(기본 1시간 12만원, 추가 시간당 8만원 — 저층 기준 평균치)을 기본값으로
// 넣어두고 현장 견적에 맞게 직접 두 단가를 고쳐 쓸 수 있게 했다. 시간은 "1시간씩" 늘리고 줄이는 버튼으로만
// 조절해서(직접 숫자를 타이핑하다 실수로 이상한 값이 들어가는 걸 방지), 0시간이면 "사다리차 없음"이고
// 1시간부터는 기본요금, 2시간째부터는 그 위에 추가시간당 요금이 1시간씩 더 붙는다.
const LADDER_TRUCK_DEFAULT_BASE_RATE = 120000; // 기본 1시간 요금(원)
const LADDER_TRUCK_DEFAULT_EXTRA_RATE = 80000; // 2시간째부터 1시간당 추가요금(원)

// 사다리차 이용 시간(hours, 0=미이용)과 단가 두 가지로 사다리차 비용을 계산한다. 기본배송비·용차
// 계산과 같은 화면(아래 DeliveryFeeButton)에서 쓰고, "x"로 뺄 때도 같은 공식으로 0원 처리하면 되므로
// 함수 하나로 모아뒀다.
function ladderTruckCost(hours, baseRate, extraRate) {
  const h = Number(hours) || 0;
  if (h <= 0) return 0;
  return (Number(baseRate) || 0) + (h - 1) * (Number(extraRate) || 0);
}

// 결과 화면에서 사다리차 줄 옆의 "x"를 눌렀을 때, 그 비용만 빼고 합계를 다시 계산한다(용차 쪽의
// removeTruckDetailFromResult와 같은 방식).
function removeLadderFromResult(result) {
  if (!result) return result;
  return { ...result, ladderHours: 0, ladderCost: 0, total: result.base + result.truckTotal };
}

// 총 톤수 옆에 다는 "배송비" 버튼. 기본배송비(거래유형+배송지+톤수 기준 자동 계산)에
// 용차(추가 트럭)·사다리차를 체크/추가해서 더할 수 있는 계산기를 펼쳐서 보여준다.
function DeliveryFeeButton({ address, transactionType, totalTon }) {
  const [open, setOpen] = useState(false);
  const zones = transactionType === "purchase" ? PURCHASE_DELIVERY_ZONES : RENTAL_DELIVERY_ZONES;
  const autoZoneIdx = useMemo(() => findZoneIndex(zones, address), [zones, address]);
  const [zoneIdx, setZoneIdx] = useState(null); // null이면 자동감지 값을 그대로 쓴다
  const effectiveZoneIdx = zoneIdx != null ? zoneIdx : autoZoneIdx;
  const zone = effectiveZoneIdx != null ? zones[effectiveZoneIdx] : null;

  const base = useMemo(() => {
    if (!zone) return null;
    if (transactionType === "rental") {
      const bracket = (totalTon || 0) <= 0.5 ? "half" : "one"; // 0.5톤 이하는 0.5톤 요금, 초과는 1톤 요금(그 이상은 용차로 추가)
      const amount = zone[bracket];
      return amount != null ? { amount, label: bracket === "half" ? "0.5톤 기준" : "1톤 기준" } : null;
    }
    if (zone.surcharge == null) return { amount: null, negotiate: true };
    const tons = Math.max(1, Math.ceil(totalTon || 1)); // 1톤 미만은 1톤으로 산정
    return { amount: tons * PURCHASE_PER_TON_RATE + zone.surcharge, label: `${tons}톤 기준` };
  }, [zone, transactionType, totalTon]);

  const autoTruckRowIdx = useMemo(() => {
    const a = address || "";
    const idx = CHARTERED_TRUCK_ROWS.findIndex((r) => (r.keywords || []).some((k) => a.includes(k)));
    return idx >= 0 ? idx : null;
  }, [address]);
  // 강원/충북/충남/전북/전남/경북/경남처럼 지역명으로 못 찾으면(=대부분 서울/수도권 주소), 카카오맵으로
  // 용인시 기흥구 공세동↔배송지 실거리를 계산해서 거리 구간(10km 이하~90km 미만)을 자동으로 맞춘다.
  const [geoTruckRowIdx, setGeoTruckRowIdx] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoFailed, setGeoFailed] = useState(false);
  const [geoKm, setGeoKm] = useState(null); // 계산된 실거리(km, 보정 후) — 90km 초과 경고 문구에 사용
  useEffect(() => {
    setGeoTruckRowIdx(null);
    setGeoFailed(false);
    setGeoKm(null);
    if (!address || autoTruckRowIdx != null) return;
    let cancelled = false;
    setGeoLoading(true);
    (async () => {
      const [origin, dest] = await Promise.all([getOriginCoords(), geocodeAddress(address)]);
      if (cancelled) return;
      setGeoLoading(false);
      if (!origin || !dest) {
        setGeoFailed(true);
        return;
      }
      const km = haversineKm(origin, dest) * ROAD_DISTANCE_FACTOR;
      setGeoKm(km);
      setGeoTruckRowIdx(findTruckRowByDistanceKm(km));
    })();
    return () => {
      cancelled = true;
    };
  }, [address, autoTruckRowIdx]);

  const [truckRowIdx, setTruckRowIdx] = useState(null);
  const effectiveTruckRowIdx = truckRowIdx != null ? truckRowIdx : autoTruckRowIdx != null ? autoTruckRowIdx : geoTruckRowIdx;
  const truckRow = effectiveTruckRowIdx != null ? CHARTERED_TRUCK_ROWS[effectiveTruckRowIdx] : null;

  const [checked, setChecked] = useState({});
  const toggleTruck = (key) => setChecked((p) => ({ ...p, [key]: !p[key] }));
  // 사다리차: 0시간(미이용)에서 "+1시간" 버튼으로만 늘어난다. 단가 두 개(기본 1시간/추가 시간당)는
  // 시세 조사로 확인한 평균치를 기본값으로 넣어두고, 현장 견적에 따라 직접 고쳐 쓸 수 있게 열어뒀다.
  const [ladderHours, setLadderHours] = useState(0);
  const [ladderBaseRate, setLadderBaseRate] = useState(LADDER_TRUCK_DEFAULT_BASE_RATE);
  const [ladderExtraRate, setLadderExtraRate] = useState(LADDER_TRUCK_DEFAULT_EXTRA_RATE);
  const ladderPreviewCost = ladderTruckCost(ladderHours, ladderBaseRate, ladderExtraRate);
  const [result, setResult] = useState(null);
  const [applied, setApplied] = useState(null); // "적용"을 눌러 확정한 최종 배송비. 확정되면 버튼 자체에 표시해서 팝업을 닫아도 계속 보인다.

  function calculate() {
    if (!zone) {
      alert("배송 지역을 먼저 선택해주세요.");
      return;
    }
    if (!base || base.amount == null) {
      alert(base?.negotiate ? "이 지역은 협의 대상이라 자동 계산이 안 돼요. 직접 문의해주세요." : "이 지역의 기본배송비를 찾을 수 없어요.");
      return;
    }
    let truckTotal = 0;
    const truckDetails = [];
    for (const opt of CHARTERED_TRUCK_OPTIONS) {
      if (!checked[opt.key]) continue;
      if (!truckRow) {
        alert("용차를 추가하려면 용차 지역을 먼저 선택해주세요.");
        return;
      }
      const rate = truckRow[opt.col];
      if (rate == null) {
        alert(`선택하신 지역(${truckRow.label})엔 ${opt.label} 요금이 없어요. 다른 지역을 선택해주세요.`);
        return;
      }
      const cost = truckOptionCost(rate, opt.extra, transactionType);
      truckTotal += cost;
      truckDetails.push({ key: opt.key, label: transactionType === "rental" ? `${opt.label} (왕복 ×2)` : opt.label, cost });
    }
    const ladderCost = ladderTruckCost(ladderHours, ladderBaseRate, ladderExtraRate);
    setResult({ base: base.amount, truckTotal, truckDetails, ladderHours, ladderCost, total: base.amount + truckTotal + ladderCost });
  }

  // 결과에 이미 추가된 용차 한 줄을 "x"로 바로 삭제한다. 체크박스도 같이 해제해서, 팝업을 다시 열었을 때도
  // 지워진 상태 그대로 유지되게 한다(다시 "계산하기"를 누를 필요 없이 합계가 바로 갱신됨).
  function removeTruckDetail(key) {
    setChecked((p) => ({ ...p, [key]: false }));
    setResult((prev) => removeTruckDetailFromResult(prev, key));
  }

  // 결과에 이미 추가된 사다리차 줄을 "x"로 바로 삭제한다(0시간으로 되돌림). 용차와 같은 이유로
  // 팝업을 다시 열었을 때도 지워진 상태가 유지되게 시간 자체를 0으로 되돌린다.
  function removeLadder() {
    setLadderHours(0);
    setResult((prev) => removeLadderFromResult(prev));
  }

  // "배송비 관련해서 금액 수동으로도 수정 가능하게 해줘"(2026-10-02) 요청 — 자동 계산된 기본배송비·용차·
  // 사다리차 금액이 실제 현장 협의·할인 등으로 다를 때, 계산 결과 화면에서 각 줄의 금액을 직접
  // 타이핑해서 고칠 수 있게 했다. 세 함수 모두 그 줄의 금액만 바꾸고, 합계(total)는 그 자리에서
  // 나머지 두 금액과 다시 더해서 항상 화면과 맞게 유지한다.
  function updateResultBase(value) {
    setResult((prev) => {
      if (!prev) return prev;
      const base = value === "" ? 0 : Number(value);
      return { ...prev, base, total: base + prev.truckTotal + (prev.ladderCost || 0) };
    });
  }
  function updateResultTruckCost(key, value) {
    setResult((prev) => {
      if (!prev) return prev;
      const cost = value === "" ? 0 : Number(value);
      const truckDetails = prev.truckDetails.map((d) => (d.key === key ? { ...d, cost } : d));
      const truckTotal = truckDetails.reduce((sum, d) => sum + d.cost, 0);
      return { ...prev, truckDetails, truckTotal, total: prev.base + truckTotal + (prev.ladderCost || 0) };
    });
  }
  function updateResultLadderCost(value) {
    setResult((prev) => {
      if (!prev) return prev;
      const ladderCost = value === "" ? 0 : Number(value);
      return { ...prev, ladderCost, total: prev.base + prev.truckTotal + ladderCost };
    });
  }

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={miniBtnStyle}>
        배송비{applied ? <> · <strong>{fmtWon(applied.total)}</strong></> : ""}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 40,
            top: "calc(100% + 6px)",
            left: 0,
            width: 420,
            background: "#fff",
            border: `1px solid ${C.line}`,
            boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
            padding: 16,
            fontFamily: sans,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>기본배송비 ({transactionType === "purchase" ? "구매" : "렌탈"})</div>
          <select
            style={{ ...inputStyle, fontSize: 12.5, padding: "6px 8px", marginBottom: 6 }}
            value={effectiveZoneIdx ?? ""}
            onChange={(e) => setZoneIdx(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">지역을 선택하세요{autoZoneIdx != null ? " (자동감지: " + zones[autoZoneIdx].zone + ")" : ""}</option>
            {zones.map((z, i) => (
              <option key={i} value={i}>
                {z.zone}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 13, marginBottom: 14 }}>
            {base ? (
              base.negotiate ? (
                <span style={{ color: "#B45309" }}>협의 대상 지역이에요</span>
              ) : (
                <>
                  <strong>{fmtWon(base.amount)}</strong> <span style={{ color: C.muted, fontSize: 11.5 }}>({base.label}, 총 톤수 {(totalTon || 0).toFixed(3)}톤)</span>
                </>
              )
            ) : (
              <span style={{ color: C.muted }}>지역을 선택하면 기본배송비가 계산돼요</span>
            )}
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>용차 추가 (1톤을 넘거나 별도 차량이 필요할 때)</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>출발지: 용인시 기흥구 공세동 기준</div>
          <select
            style={{ ...inputStyle, fontSize: 12.5, padding: "6px 8px", marginBottom: 8 }}
            value={effectiveTruckRowIdx ?? ""}
            onChange={(e) => setTruckRowIdx(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">
              용차 지역을 선택하세요
              {autoTruckRowIdx != null
                ? " (자동감지: " + CHARTERED_TRUCK_ROWS[autoTruckRowIdx].label + ")"
                : geoTruckRowIdx != null
                ? " (거리 계산으로 자동감지: " + CHARTERED_TRUCK_ROWS[geoTruckRowIdx].label + ")"
                : geoLoading
                ? " (거리 계산 중…)"
                : ""}
            </option>
            {CHARTERED_TRUCK_GROUPS.map((g, gi) => (
              <optgroup key={gi} label={g.region}>
                {g.rows.map((r, ri) => {
                  const flatIdx = CHARTERED_TRUCK_ROWS.findIndex((x) => x.region === g.region && x.label === r.label);
                  return (
                    <option key={ri} value={flatIdx}>
                      {r.label}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
          {geoFailed && autoTruckRowIdx == null && (
            <div style={{ fontSize: 11, color: "#B45309", marginBottom: 6 }}>
              거리를 자동으로 계산하지 못했어요(지도 API 설정이 안 됐거나 주소를 못 찾았어요). 구간을 직접 선택해주세요.
            </div>
          )}
          {!geoFailed && !geoLoading && autoTruckRowIdx == null && geoKm != null && geoTruckRowIdx == null && (
            <div style={{ fontSize: 11, color: "#B45309", marginBottom: 6 }}>
              실거리 약 {Math.round(geoKm)}km로 90km 구간표를 넘어서 자동 선택을 못 했어요. 지역을 직접 확인해서 요금을 협의해주세요.
            </div>
          )}
          <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 4 }}>
            {transactionType === "rental" ? "※ 표시 금액은 회수까지 포함한 왕복(편도×2) 기준이에요" : "※ 표시 금액은 편도 기준이에요"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12 }}>
            {CHARTERED_TRUCK_OPTIONS.map((opt) => {
              const rate = truckRow ? truckRow[opt.col] : null;
              const previewCost = truckOptionCost(rate, opt.extra, transactionType);
              return (
                <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: rate == null && truckRow ? C.muted : C.ink }}>
                  <input type="checkbox" checked={!!checked[opt.key]} onChange={() => toggleTruck(opt.key)} />
                  {opt.label}
                  {truckRow && previewCost != null && <span style={{ color: C.muted, fontSize: 11 }}>({fmtWon(previewCost)})</span>}
                </label>
              );
            })}
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>🪜 사다리차 추가 (현장에 필요할 때 1시간씩)</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
            단가는 지역·층수·차량 크기에 따라 차이가 커요. 시세 조사 평균값이 기본값으로 들어가 있으니, 현장 견적에 맞게 아래 단가를 직접 고쳐주세요.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11.5, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
              기본 1시간
              <input
                type="number"
                value={ladderBaseRate}
                onChange={(e) => setLadderBaseRate(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ ...inputStyle, fontSize: 12, padding: "4px 6px", width: 80 }}
              />
              원
            </label>
            <label style={{ fontSize: 11.5, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
              추가 시간당
              <input
                type="number"
                value={ladderExtraRate}
                onChange={(e) => setLadderExtraRate(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ ...inputStyle, fontSize: 12, padding: "4px 6px", width: 80 }}
              />
              원
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setLadderHours((h) => Math.max(0, h - 1))}
              disabled={ladderHours <= 0}
              title="사다리차 1시간 줄이기"
              aria-label="사다리차 1시간 줄이기"
              style={{ ...miniBtnStyle, padding: "3px 10px", opacity: ladderHours <= 0 ? 0.5 : 1 }}
            >
              −
            </button>
            <span style={{ fontSize: 12.5, minWidth: 60, textAlign: "center" }}>{ladderHours}시간</span>
            <button
              type="button"
              onClick={() => setLadderHours((h) => h + 1)}
              title="사다리차 1시간 추가"
              aria-label="사다리차 1시간 추가"
              style={{ ...miniBtnStyle, padding: "3px 10px" }}
            >
              ＋
            </button>
            <span style={{ fontSize: 11.5, color: C.muted }}>
              {ladderHours > 0 ? <>({fmtWon(ladderPreviewCost)})</> : "사다리차 없음"}
            </span>
          </div>

          <button type="button" onClick={calculate} style={{ ...miniBtnStylePrimary, width: "100%", marginBottom: result ? 10 : 0 }}>
            계산하기
          </button>

          {result && (
            <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 10, fontSize: 12.5 }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>
                아래 금액은 자동 계산된 값이에요. 현장 협의·할인 등으로 다르면 직접 고쳐 쓸 수 있어요.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span>기본배송비:</span>
                <input
                  type="number"
                  value={result.base}
                  onChange={(e) => updateResultBase(e.target.value)}
                  style={{ ...smallInputStyle, width: 100, padding: "3px 6px", fontSize: 12.5 }}
                />
                <span style={{ color: C.muted, fontSize: 11 }}>원</span>
              </div>
              {result.truckDetails.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    용차 · {d.label}:
                    <input
                      type="number"
                      value={d.cost}
                      onChange={(e) => updateResultTruckCost(d.key, e.target.value)}
                      style={{ ...smallInputStyle, width: 100, padding: "3px 6px", fontSize: 12.5 }}
                    />
                    <span style={{ color: C.muted, fontSize: 11 }}>원</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeTruckDetail(d.key)}
                    title="이 용차 삭제"
                    aria-label="이 용차 삭제"
                    style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {result.ladderHours > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    사다리차 · {result.ladderHours}시간:
                    <input
                      type="number"
                      value={result.ladderCost}
                      onChange={(e) => updateResultLadderCost(e.target.value)}
                      style={{ ...smallInputStyle, width: 100, padding: "3px 6px", fontSize: 12.5 }}
                    />
                    <span style={{ color: C.muted, fontSize: 11 }}>원</span>
                  </span>
                  <button
                    type="button"
                    onClick={removeLadder}
                    title="사다리차 삭제"
                    aria-label="사다리차 삭제"
                    style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                  >
                    ×
                  </button>
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span>
                  합계 <strong>{fmtWon(result.total)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setApplied(result);
                    setOpen(false);
                  }}
                  style={{ ...miniBtnStylePrimary, padding: "5px 10px", fontSize: 12 }}
                >
                  적용
                </button>
              </div>
            </div>
          )}

          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10, lineHeight: 1.4 }}>
            참고용 계산이에요(VAT 별도). 사다리차 비용은 위에서 직접 시간·단가를 넣어 포함할 수 있어요(단가는 실제 업체 견적과 다를 수 있으니 확인해주세요). 기사작업비 등 그 외 현장 조건에 따른 추가비용은 별도로 확인해주세요.
          </div>
        </div>
      )}
    </span>
  );
}

// 견적서를 아직 전표로 등록하기 전이라도, 엑셀에서 품목표를 그대로 복사해서 붙여넣기만 하면
// 톤수와 배송비를 바로 확인할 수 있게 하는 화면. 업로드/등록 과정을 거치지 않는 순수 계산 용도라
// DB에 아무것도 저장하지 않는다(단, 톤수를 직접 입력해 "저장"을 누르면 그 품목 기준표에는 반영된다).
function QuickTonCalcPanel({ tonOverrides, onTonOverrideSaved }) {
  const [text, setText] = useState("");
  const [transactionType, setTransactionType] = useState("rental");
  // "구매로 올렸는데 왜 기본배송비가(렌탈)로 되어 있냐" 신고(2026-10-02) — 아래 "붙여넣은 견적서가
  // 구매 건이면 자동으로 '구매'를 골라준다" 자동감지 effect가, 사용자가 드롭다운에서 직접 "구매"로
  // 바꾼 뒤에도 붙여넣은 내용(text)이 조금이라도 바뀔 때마다(품목 한 줄 추가·수정 등) 또 다시
  // detectPastedTransactionType을 돌려서, 그 결과가 "렌탈"로 나오면 방금 직접 고른 "구매" 선택을
  // 아무 말 없이 되돌려버리는 게 원인이었다(자동감지는 처음 붙여넣을 때만 도와주는 "추천"일 뿐,
  // 사용자가 직접 드롭다운을 만지면 그 뒤로는 더 이상 끼어들지 않아야 한다). 드롭다운을 한 번이라도
  // 직접 바꾸면 이 표시(ref)를 세워서, 그 뒤로는 자동감지가 더 이상 거래유형을 건드리지 않게 막는다.
  const userEditedTransactionTypeRef = useRef(false);
  const [address, setAddress] = useState("");
  const [tonEdits, setTonEdits] = useState({});
  const [savingIdx, setSavingIdx] = useState(null);

  // 견적서를 통째로 붙여넣으면 그 안의 "배송지: ..." 값을 자동으로 배송지 주소 칸에 채워준다(직접 입력한 값도
  // 그대로 수정 가능 — 이후 붙여넣는 텍스트가 바뀌면 새로 찾은 주소로 다시 갱신된다).
  const extractedAddress = useMemo(() => extractPastedSiteAddress(text), [text]);
  useEffect(() => {
    if (extractedAddress) setAddress(extractedAddress);
  }, [extractedAddress]);

  // 붙여넣은 견적서가 구매 건이면 "③ 배송비 계산"의 거래유형도 "구매"로 자동으로 체크되게 한다(기존에는
  // 렌탈로 고정 시작해서, 구매 견적서를 붙여넣어도 직접 드롭다운을 바꿔야 했음).
  // (2026-10-02 수정) 예전엔 "직접 드롭다운을 바꾼 뒤에도 붙여넣은 내용이 바뀌면 새로 판단한 값으로
  // 다시 갱신된다"고 되어 있었는데, 이게 바로 "구매로 올렸는데 왜 렌탈로 되어 있냐" 신고의 원인이었다
  // — 이제는 사용자가 드롭다운을 한 번도 직접 안 건드렸을 때만(=아직 자동감지를 믿고 있는 상태일
  // 때만) 자동으로 골라주고, 한 번이라도 직접 바꾸면 그 뒤로는 붙여넣은 내용이 또 바뀌어도 자동감지가
  // 더 이상 끼어들지 않는다(바로 위 userEditedTransactionTypeRef 설명 참고).
  const detectedTransactionType = useMemo(() => detectPastedTransactionType(text), [text]);
  useEffect(() => {
    if (detectedTransactionType && !userEditedTransactionTypeRef.current) setTransactionType(detectedTransactionType);
  }, [detectedTransactionType]);

  // 붙여넣은 텍스트에 거래처/담당자 정보가 있으면 품목별 데이터 출력물 상단에 그대로 보여준다
  // (업체별데이터의 "품목별 수량 통계" 출력물과 같은 형식).
  const customerInfo = useMemo(() => extractPastedCustomerInfo(text), [text]);

  const rawItems = useMemo(() => parsePastedItems(text), [text]);
  const items = useMemo(
    () => withComputedTons(rawItems, tonOverrides, address).map((it, idx) => (tonEdits[idx] !== undefined ? { ...it, ton: tonEdits[idx] === "" ? null : Number(tonEdits[idx]) } : it)),
    [rawItems, tonOverrides, tonEdits, address]
  );

  // 사용자가 "선택삭제"로 이 계산에서 뺀 행(원본 items 배열의 인덱스 기준). 카드①(품목별 데이터)·카드②(톤수 계산)
  // 둘 중 어디서 빼도 같은 excludedIdxs를 공유해서, 톤수·배송비 계산에 곧바로 함께 반영된다.
  // 붙여넣은 내용이 바뀌면(행 구성이 달라지면) 이전 인덱스가 더 이상 맞지 않으므로 초기화한다.
  const [excludedIdxs, setExcludedIdxs] = useState(() => new Set());
  useEffect(() => {
    setExcludedIdxs(new Set());
  }, [rawItems]);

  const applicable = items.filter((it, idx) => !it.tonExcluded && !excludedIdxs.has(idx));
  const known = applicable.filter((it) => it.ton != null);
  const totalTon = known.reduce((sum, it) => sum + Number(it.ton), 0);
  const missingCount = applicable.length - known.length;

  // 품목별 데이터: 같은 품목명+규격끼리 수량을 합산해서 "현장에 총 몇 개인지" 한눈에 보여준다.
  // 품목/규격/총수량 머리글을 눌러 정렬 기준·방향을 바꿀 수 있다(기본은 총수량 많은순).
  const rawGroupedStats = useMemo(() => groupItemQuantities(items, excludedIdxs), [items, excludedIdxs]);

  // (2026-10-01) "품목별데이터에서 체크체크 해서 병합하면 수량 합산되게끔" 요청 — 품목명·규격이 달라
  // 자동으로는(위 groupItemQuantities) 안 합쳐지는 행들도(예: 파티션 H1800*W700 / H1800*W500처럼
  // 규격이 제각각인 경우) 체크박스로 직접 골라 수동으로 합칠 수 있게 한다. 여기는 등록된 데이터가
  // 아니라 그때그때 붙여넣어 쓰는 계산기라 DB에 저장하지 않고 화면 상태로만 가지고 있다가, 붙여넣은
  // 내용이 바뀌면(원본 행 구성이 달라지므로) 같이 초기화된다.
  const [manualMerges, setManualMerges] = useState([]); // [{ repKey, memberKeys: [key, ...] }]
  useEffect(() => {
    setManualMerges([]);
  }, [rawItems]);

  // rawGroupedStats에 manualMerges를 겹쳐서, 병합된 행은 대표 품목명·규격 하나로 수량을 합산해 보여주고
  // (memberKeys·mergedCount로 몇 건이 합쳐졌는지 추적) 병합 안 된 행은 그대로 둔다.
  const mergedGroupStats = useMemo(() => {
    if (manualMerges.length === 0) return rawGroupedStats.map((g) => ({ ...g, mergedCount: 1, memberKeys: [g.key] }));
    const keyToGroup = new Map(rawGroupedStats.map((g) => [g.key, g]));
    const consumedKeys = new Set();
    const merged = [];
    for (const m of manualMerges) {
      const rep = keyToGroup.get(m.repKey);
      if (!rep) continue;
      let qty = 0;
      let idxs = [];
      const memberKeys = [];
      for (const k of m.memberKeys) {
        const g = keyToGroup.get(k);
        if (!g) continue;
        qty += g.qty;
        idxs = idxs.concat(g.idxs);
        memberKeys.push(k);
        consumedKeys.add(k);
      }
      if (memberKeys.length > 0) merged.push({ key: rep.key, item: rep.item, spec: rep.spec, qty, idxs, mergedCount: memberKeys.length, memberKeys });
    }
    for (const g of rawGroupedStats) {
      if (!consumedKeys.has(g.key)) merged.push({ ...g, mergedCount: 1, memberKeys: [g.key] });
    }
    return merged;
  }, [rawGroupedStats, manualMerges]);

  const [groupSortKey, setGroupSortKey] = useState("qty"); // "item" | "spec" | "qty"
  const [groupSortDir, setGroupSortDir] = useState("desc"); // "asc" | "desc"
  function toggleGroupSort(key) {
    if (groupSortKey === key) {
      setGroupSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setGroupSortKey(key);
      setGroupSortDir(key === "qty" ? "desc" : "asc");
    }
  }
  const groupedItemStats = useMemo(() => {
    const arr = [...mergedGroupStats];
    const dir = groupSortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (groupSortKey === "qty") return (a.qty - b.qty) * dir;
      const av = groupSortKey === "item" ? a.item : a.spec;
      const bv = groupSortKey === "item" ? b.item : b.spec;
      return (av || "").localeCompare(bv || "", "ko") * dir;
    });
    return arr;
  }, [mergedGroupStats, groupSortKey, groupSortDir]);
  const groupedItemTotalQty = groupedItemStats.reduce((s, r) => s + r.qty, 0);

  // 카드① 품목별 데이터의 체크박스 선택삭제 상태(붙여넣은 내용이 바뀌면 초기화)
  const [checkedGroupKeys, setCheckedGroupKeys] = useState(() => new Set());
  useEffect(() => {
    setCheckedGroupKeys(new Set());
  }, [rawItems]);
  function toggleGroupChecked(key) {
    setCheckedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleGroupCheckedAll() {
    setCheckedGroupKeys((prev) => (prev.size === groupedItemStats.length ? new Set() : new Set(groupedItemStats.map((r) => r.key))));
  }
  // 선택한 품목(그룹)을 이 계산에서 제외한다 — 그 품목·규격으로 합쳐졌던 원본 행 전부(idxs)를 excludedIdxs에 더한다.
  function handleDeleteSelectedGroups() {
    const chosen = groupedItemStats.filter((r) => checkedGroupKeys.has(r.key));
    if (chosen.length === 0) return;
    if (!confirm(`선택한 품목 ${chosen.length}종을 이 계산에서 제외할까요? (다시 붙여넣으면 언제든 되돌아와요)`)) return;
    setExcludedIdxs((prev) => {
      const next = new Set(prev);
      for (const r of chosen) for (const idx of r.idxs) next.add(idx);
      return next;
    });
    setCheckedGroupKeys(new Set());
  }
  // 체크한 품목 2종 이상을 하나로 합친다 — 화면에 먼저 보이는(정렬 기준 첫 번째) 품목의 이름·규격을
  // 대표로 쓰고, 나머지 수량은 거기로 더해진다. 이미 합쳐진 행을 또 다른 행과 같이 체크해서 누르면,
  // 기존 병합은 통째로 풀어내고(memberKeys 전체를) 새로 고른 범위로 다시 합친다.
  function handleMergeSelectedGroups() {
    const chosen = groupedItemStats.filter((r) => checkedGroupKeys.has(r.key));
    if (chosen.length < 2) return;
    const repKey = chosen[0].key;
    const allMemberKeys = Array.from(new Set(chosen.flatMap((r) => r.memberKeys || [r.key])));
    setManualMerges((prev) => {
      const filtered = prev.filter((m) => !chosen.some((r) => r.key === m.repKey));
      return [...filtered, { repKey, memberKeys: allMemberKeys }];
    });
    setCheckedGroupKeys(new Set());
  }
  // 합친 걸 다시 원래 행들로 풀어낸다(원본 붙여넣은 데이터는 손댄 적이 없으니 그냥 병합 기록만 지우면 됨).
  function handleUnmergeGroup(repKey) {
    setManualMerges((prev) => prev.filter((m) => m.repKey !== repKey));
  }

  // 카드② 톤수 계산의 체크박스 선택삭제 상태(원본 행 인덱스 기준, 붙여넣은 내용이 바뀌면 초기화)
  const [checkedRowIdxs, setCheckedRowIdxs] = useState(() => new Set());
  useEffect(() => {
    setCheckedRowIdxs(new Set());
  }, [rawItems]);
  const visibleRowIdxs = items.map((_, idx) => idx).filter((idx) => !excludedIdxs.has(idx));

  // 카드② 톤수 계산: 품목/규격/수량/톤수 머리글을 눌러 정렬할 수 있다. 정렬은 화면에 보여주는 순서만 바꾸고,
  // 칸 안의 체크박스·직접입력·저장 버튼은 전부 원본 items 배열의 idx를 그대로 쓰니 정렬해도 정상 동작한다.
  // 기본값(rowSortKey=null)은 붙여넣은 원본 순서 그대로이고, 같은 머리글을 세 번째 누르면 다시 원본 순서로 돌아간다.
  const [rowSortKey, setRowSortKey] = useState(null); // null | "item" | "spec" | "qty" | "ton"
  const [rowSortDir, setRowSortDir] = useState("asc");
  function toggleRowSort(key) {
    if (rowSortKey === key) {
      if (rowSortDir === "asc") {
        setRowSortDir("desc");
      } else {
        setRowSortKey(null);
        setRowSortDir("asc");
      }
    } else {
      setRowSortKey(key);
      setRowSortDir("asc");
    }
  }
  const visibleRows = useMemo(() => {
    const rows = items.map((it, idx) => ({ it, idx })).filter(({ idx }) => !excludedIdxs.has(idx));
    return sortVisibleRows(rows, rowSortKey, rowSortDir);
  }, [items, excludedIdxs, rowSortKey, rowSortDir]);
  function toggleRowChecked(idx) {
    setCheckedRowIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }
  function toggleRowCheckedAll() {
    setCheckedRowIdxs((prev) => (prev.size === visibleRowIdxs.length ? new Set() : new Set(visibleRowIdxs)));
  }
  function handleDeleteSelectedRows() {
    if (checkedRowIdxs.size === 0) return;
    if (!confirm(`선택한 품목 ${checkedRowIdxs.size}개를 이 계산에서 제외할까요? (다시 붙여넣으면 언제든 되돌아와요)`)) return;
    setExcludedIdxs((prev) => new Set([...prev, ...checkedRowIdxs]));
    setCheckedRowIdxs(new Set());
  }

  // 카드①·② 어디서 뺐든 한 번에 되돌리는 복원 버튼(요약 바에 표시)
  function handleRestoreExcluded() {
    setExcludedIdxs(new Set());
  }

  // 카드① 품목별 데이터 인쇄/PDF 저장 — 인쇄 중엔 문서 제목을 잠깐 바꿔서 인쇄 머리글·PDF 기본 파일명도 "품목별 데이터"가 되게 한다.
  function handlePrintGroupedItems() {
    const prevTitle = document.title;
    document.title = "품목별 데이터";
    const restoreTitle = () => {
      document.title = prevTitle;
    };
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.print();
    setTimeout(restoreTitle, 2000); // afterprint가 못 붙는 브라우저를 위한 안전장치
  }

  async function saveTonOverride(idx) {
    const it = items[idx];
    if (it.ton == null || !it.qty) {
      alert("톤수와 수량을 먼저 입력해주세요.");
      return;
    }
    if (!(it.item || "").trim() || !(it.spec || "").trim()) {
      alert("품목명과 규격이 있어야 저장할 수 있어요.");
      return;
    }
    setSavingIdx(idx);
    const per = Math.round((Number(it.ton) / Number(it.qty)) * 1000000) / 1000000;
    const { error } = await supabase.from("ton_overrides").upsert({ item: it.item.trim(), spec: it.spec.trim(), per }, { onConflict: "item,spec" });
    setSavingIdx(null);
    if (error) {
      alert("저장하지 못했어요: " + error.message);
      return;
    }
    setTonEdits((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    onTonOverrideSaved && onTonOverrideSaved();
    alert("저장했어요. 다음부터 이 품목은 자동으로 채워져요.");
  }

  // 품목/규격/수량 등이 있는 표는 칸 경계를 드래그해서 너비를 조절할 수 있게 하는 게 이 앱의 기본 컨벤션
  // (렌탈내역·견적서 업로드 미리보기와 같은 방식) — 카드①·② 각각 자기 칸너비를 따로 기억한다.
  const [groupColWidths, startGroupResize] = useResizableColumns([220, 220, 110]); // 품목/규격/총수량
  const groupGridTemplate = "32px " + groupColWidths.map((w) => `${w}px`).join(" ");
  const [rowColWidths, startRowResize] = useResizableColumns([200, 200, 70, 130]); // 품목/규격/수량/톤수
  const rowGridTemplate = "26px " + rowColWidths.map((w) => `${w}px`).join(" ");

  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>품목별데이터/톤수/배송비</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
        견적서를 등록하지 않고도 품목별 수량·톤수·배송비를 한번에 확인할 수 있어요. 엑셀에서 품목표(품목/규격/수량 칸)를 그대로 복사해서 아래에 붙여넣어보세요.
        헤더(품목/규격/수량 등)까지 같이 복사하면 더 정확하게 읽혀요. 여기서 계산한 내용은 등록되지 않고, 톤수를 직접 입력해서 저장한 값만 기준표에 남아요.
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="여기에 엑셀에서 복사한 품목표를 붙여넣으세요 (Ctrl+V)"
        style={{ width: "100%", minHeight: 160, fontFamily: "monospace", fontSize: 12.5, padding: 10, border: `1px solid ${C.line}`, marginBottom: 14, boxSizing: "border-box" }}
      />

      {items.length > 0 && (
        <>
          <style>{`
            .qtc-print-only-table { display: none; }
            @media print {
              body * { visibility: hidden; }
              #qtc-itemstats-print-area, #qtc-itemstats-print-area * { visibility: visible; }
              #qtc-itemstats-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 24px; }
              .qtc-no-print { display: none !important; }
              .qtc-print-only-table { display: table !important; }
            }
          `}</style>

          <div className="qtc-no-print" style={{ display: "flex", border: `1px solid ${C.line}`, background: C.panel, marginBottom: 16 }}>
            <StatCell label="품목 종류" value={`${groupedItemStats.length}종`} />
            <StatCell label="총 수량" value={`${groupedItemTotalQty.toLocaleString("ko-KR")}개`} />
            <StatCell label="총 톤수" value={`${totalTon.toFixed(3)}톤`} color={missingCount > 0 ? C.amber : C.green} last />
          </div>
          {missingCount > 0 && (
            <div className="qtc-no-print" style={{ fontSize: 12, color: C.amber, marginTop: -10, marginBottom: 14 }}>
              주의: 톤수 미확인 {missingCount}건이 있어요 — 아래 "톤수 계산" 표의 노란 칸을 직접 채워주세요.
            </div>
          )}
          {excludedIdxs.size > 0 && (
            <div className="qtc-no-print" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted, marginTop: missingCount > 0 ? 0 : -10, marginBottom: 14 }}>
              <span>제외된 항목 {excludedIdxs.size}개는 이 계산(품목별 데이터·톤수·배송비)에서 빠져있어요.</span>
              <button type="button" onClick={handleRestoreExcluded} style={{ border: `1px solid ${C.line}`, background: "none", cursor: "pointer", fontSize: 11.5, padding: "3px 8px", color: C.inkSoft }}>
                복원
              </button>
            </div>
          )}

          {/* 카드① 품목별 데이터 — 현장에 흩어진 수량을 품목·규격별로 합쳐서 총 개수만 보여준다(요금성 품목은 자동 제외) */}
          <div style={{ border: `1px solid ${C.line}`, borderTop: `3px solid ${C.brownAccent}`, background: C.panel, padding: 18, marginBottom: 14 }}>
            <InputCardHeader
              title="① 품목별 데이터"
              desc="같은 품목·규격끼리 수량을 합쳐서 총 몇 개인지 한눈에 보여줘요 (배송비·설치비 등 요금성 항목은 자동으로 빠져요)"
            />
            <div className="qtc-no-print" style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button type="button" onClick={handlePrintGroupedItems} style={primaryBtnStyle2}>
                인쇄 / PDF로 저장
              </button>
              <button
                type="button"
                onClick={handleMergeSelectedGroups}
                disabled={checkedGroupKeys.size < 2}
                style={{ ...ghostBtnStyle, opacity: checkedGroupKeys.size < 2 ? 0.5 : 1 }}
              >
                {`선택 병합${checkedGroupKeys.size >= 2 ? ` (${checkedGroupKeys.size})` : ""}`}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedGroups}
                disabled={checkedGroupKeys.size === 0}
                style={{ ...ghostBtnStyle, opacity: checkedGroupKeys.size === 0 ? 0.5 : 1 }}
              >
                {`선택삭제${checkedGroupKeys.size > 0 ? ` (${checkedGroupKeys.size})` : ""}`}
              </button>
            </div>
            <div className="qtc-no-print" style={{ fontSize: 11.5, color: C.muted, marginTop: -6, marginBottom: 10 }}>
              * "선택 병합"은 이름·규격이 달라도 2개 이상 체크하면 수량을 하나로 더해서 보여줘요(먼저 체크박스로 고르세요). "선택삭제"는 이 계산(품목별 데이터·톤수·배송비)에서만 제외하는 거예요. 둘 다 붙여넣은 원본 텍스트는 그대로 있고, 다시 붙여넣으면 복원돼요.
            </div>
            <div className="qtc-no-print" style={{ fontSize: 11.5, color: C.muted, marginTop: -6, marginBottom: 10 }}>
              칸 경계를 드래그하면 너비를 늘이고 줄일 수 있어요.
            </div>
            <div id="qtc-itemstats-print-area" style={{ border: `1px solid ${C.line}`, background: "#fff", padding: 24 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontFamily: serif, fontSize: 20 }}>품목별 데이터</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 16 }}>
                <div>
                  <div>
                    거래처: {customerInfo.customer || "-"}
                    {customerInfo.siteName ? ` · 현장명: ${customerInfo.siteName}` : ""}
                  </div>
                  <div>담당자: {customerInfo.manager || "-"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>작성일: {new Date().toLocaleDateString("ko-KR")}</div>
                </div>
              </div>
              <div className="qtc-no-print" style={{ border: `1px solid ${C.line}`, overflowX: "auto" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: groupGridTemplate,
                    gap: 8,
                    padding: "8px 10px",
                    fontSize: 12.5,
                    background: C.bg,
                    borderBottom: `1px solid ${C.line}`,
                    minWidth: "max-content",
                  }}
                >
                  <div className="qtc-no-print">
                    <input
                      type="checkbox"
                      checked={groupedItemStats.length > 0 && checkedGroupKeys.size === groupedItemStats.length}
                      onChange={toggleGroupCheckedAll}
                    />
                  </div>
                  {[
                    { label: "품목", key: "item" },
                    { label: "규격", key: "spec" },
                    { label: "총수량", key: "qty" },
                  ].map((h, i) => (
                    <div
                      key={h.key}
                      onClick={() => toggleGroupSort(h.key)}
                      style={{ position: "relative", textAlign: h.key === "qty" ? "right" : "left", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    >
                      {h.label}
                      {groupSortKey === h.key ? (groupSortDir === "asc" ? " ▲" : " ▼") : ""}
                      <ColResizeHandle onMouseDown={startGroupResize(i)} />
                    </div>
                  ))}
                </div>
                {groupedItemStats.map((r) => (
                  <div
                    key={r.key}
                    style={{ display: "grid", gridTemplateColumns: groupGridTemplate, gap: 8, padding: "6px 10px", fontSize: 13, borderBottom: `1px solid ${C.line}`, alignItems: "center", minWidth: "max-content" }}
                  >
                    <div className="qtc-no-print">
                      <input type="checkbox" checked={checkedGroupKeys.has(r.key)} onChange={() => toggleGroupChecked(r.key)} />
                    </div>
                    <div>
                      {r.item}
                      {r.mergedCount > 1 && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: C.purple, background: C.purpleBg, borderRadius: 4, padding: "1px 5px" }}>
                          {r.mergedCount}건 합산
                        </span>
                      )}
                      {r.mergedCount > 1 && (
                        <button
                          type="button"
                          className="qtc-no-print"
                          onClick={() => handleUnmergeGroup(r.key)}
                          style={{ marginLeft: 6, border: "none", background: "none", cursor: "pointer", fontSize: 11, color: C.muted, textDecoration: "underline", padding: 0 }}
                        >
                          병합 해제
                        </button>
                      )}
                    </div>
                    <div>{r.spec || "-"}</div>
                    <div style={{ textAlign: "right" }}>{r.qty.toLocaleString("ko-KR")}</div>
                  </div>
                ))}
                {groupedItemStats.length === 0 && (
                  <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>집계할 품목이 없어요.</div>
                )}
                {groupedItemStats.length > 0 && (
                  <div
                    style={{ display: "grid", gridTemplateColumns: groupGridTemplate, gap: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600, background: C.bg, minWidth: "max-content" }}
                  >
                    <div className="qtc-no-print"></div>
                    <div style={{ gridColumn: "span 2", textAlign: "right" }}>합계</div>
                    <div style={{ textAlign: "right" }}>{groupedItemTotalQty.toLocaleString("ko-KR")}</div>
                  </div>
                )}
              </div>

              {/* 화면에서 칸 너비를 얼마나 드래그해서 조절했든 인쇄/PDF에는 영향이 없도록, 인쇄 전용으로 브라우저가 내용에
                  맞춰 알아서 폭을 잡아주는 일반 표를 따로 둔다("품목별 수량 통계" 인쇄본과 같은 방식). 화면에는 안 보이고
                  인쇄할 때만 나타난다. */}
              <table className="qtc-print-only-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {[
                      { label: "품목", key: "item" },
                      { label: "규격", key: "spec" },
                      { label: "총수량", key: "qty" },
                    ].map((h) => (
                      <th
                        key={h.key}
                        style={{ border: `1px solid ${C.line}`, padding: "8px 10px", background: C.bg, textAlign: h.key === "qty" ? "right" : "left", whiteSpace: "nowrap" }}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedItemStats.map((r) => (
                    <tr key={r.key}>
                      <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>
                        {r.item}
                        {r.mergedCount > 1 ? `(${r.mergedCount}건 합산)` : ""}
                      </td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.spec || "-"}</td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right" }}>{r.qty.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                  {groupedItemStats.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: 20, textAlign: "center", color: C.muted, border: `1px solid ${C.line}` }}>
                        집계할 품목이 없어요.
                      </td>
                    </tr>
                  )}
                </tbody>
                {groupedItemStats.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>
                        합계
                      </td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>
                        {groupedItemTotalQty.toLocaleString("ko-KR")}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* 카드② 톤수 계산 — 품목별 실제 톤수와 기준표에 없는 품목의 직접입력/저장 */}
          <div className="qtc-no-print" style={{ border: `1px solid ${C.line}`, borderTop: `3px solid ${C.green}`, background: C.panel, padding: 18, marginBottom: 14 }}>
            <InputCardHeader
              title="② 톤수 계산"
              desc="품목별 톤수를 확인하고, 기준표에 없는 품목(노란 칸)은 직접 입력해서 저장하면 다음부터 자동으로 채워져요"
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                onClick={handleDeleteSelectedRows}
                disabled={checkedRowIdxs.size === 0}
                style={{ ...ghostBtnStyle, opacity: checkedRowIdxs.size === 0 ? 0.5 : 1 }}
              >
                {`선택삭제${checkedRowIdxs.size > 0 ? ` (${checkedRowIdxs.size})` : ""}`}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: -6, marginBottom: 10 }}>칸 경계를 드래그하면 너비를 늘이고 줄일 수 있어요.</div>
            <div style={{ border: `1px solid ${C.lineSoft}`, overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: rowGridTemplate, gap: 8, padding: "8px 10px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.lineSoft}`, alignItems: "center", minWidth: "max-content" }}>
                <input type="checkbox" checked={visibleRowIdxs.length > 0 && checkedRowIdxs.size === visibleRowIdxs.length} onChange={toggleRowCheckedAll} />
                {[
                  { label: "품목", key: "item" },
                  { label: "규격", key: "spec" },
                  { label: "수량", key: "qty" },
                  { label: "톤수", key: "ton" },
                ].map((h, i) => (
                  <div
                    key={h.key}
                    onClick={() => toggleRowSort(h.key)}
                    style={{ position: "relative", cursor: "pointer", userSelect: "none" }}
                  >
                    {h.label}
                    {rowSortKey === h.key ? (rowSortDir === "asc" ? " ▲" : " ▼") : ""}
                    <ColResizeHandle onMouseDown={startRowResize(i)} />
                  </div>
                ))}
              </div>
              <div style={{ maxHeight: 260, overflow: "auto" }}>
                {visibleRows.map(({ it, idx }) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: rowGridTemplate, gap: 8, padding: "6px 10px", fontSize: 12.5, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: "max-content" }}>
                      <input type="checkbox" checked={checkedRowIdxs.has(idx)} onChange={() => toggleRowChecked(idx)} />
                      <div>{it.item}</div>
                      <div>{it.spec}</div>
                      <div>{it.qty}</div>
                      {it.tonExcluded ? (
                        <div style={{ fontSize: 11.5, color: C.muted }} title="DC·설치비·배송비 등은 톤수 계산에서 제외돼요">
                          제외
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            step="0.001"
                            style={{ ...smallInputStyle, background: it.ton == null ? "#FFF6E5" : smallInputStyle.background }}
                            value={tonEdits[idx] !== undefined ? tonEdits[idx] : it.ton ?? ""}
                            placeholder="직접입력"
                            onChange={(e) => setTonEdits((prev) => ({ ...prev, [idx]: e.target.value }))}
                          />
                          <button
                            type="button"
                            onClick={() => saveTonOverride(idx)}
                            disabled={savingIdx === idx}
                            style={{ border: `1px solid ${C.line}`, background: "none", cursor: "pointer", fontSize: 11.5, padding: "4px 6px", color: C.inkSoft, flexShrink: 0 }}
                          >
                            {savingIdx === idx ? "…" : "저장"}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 13.5 }}>
              총 톤수 <strong>{totalTon.toFixed(3)}톤</strong>
              {missingCount > 0 && <span style={{ color: "#B45309", fontSize: 12.5 }}> (미확인 {missingCount}건)</span>}
            </div>
          </div>

          {/* 카드③ 배송비 계산 — 거래유형·배송지를 입력하고 기본배송비+용차를 계산 */}
          <div className="qtc-no-print" style={{ border: `1px solid ${C.line}`, borderTop: `3px solid ${C.amber}`, background: C.panel, padding: 18 }}>
            <InputCardHeader
              title="③ 배송비 계산"
              desc="거래유형과 배송지를 입력하면 총 톤수를 기준으로 기본배송비와 용차 추가 비용을 계산할 수 있어요"
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <select
                style={{ ...inputStyle, fontSize: 12.5, padding: "5px 8px", width: "auto" }}
                value={transactionType}
                onChange={(e) => {
                  // "구매로 올렸는데 왜 렌탈로 되어 있냐" 신고(2026-10-02) — 여기서 직접 고르는 순간
                  // 표시를 세워서, 그 뒤로는 자동감지(위 useEffect)가 이 선택을 다시 덮어쓰지 않게 한다.
                  userEditedTransactionTypeRef.current = true;
                  setTransactionType(e.target.value);
                }}
              >
                <option value="rental">렌탈</option>
                <option value="purchase">구매</option>
              </select>
              <input
                style={{ ...inputStyle, fontSize: 12.5, padding: "5px 8px", width: 200 }}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="배송지 주소"
              />
              <DeliveryFeeButton address={address} transactionType={transactionType} totalTon={totalTon} />
            </div>
            <AddressMapLinks address={address} />
          </div>
        </>
      )}
    </div>
  );
}

// "PDF를 엑셀로 변환" 메뉴 화면. 다른 메뉴들과 달리 Supabase 데이터를 전혀 다루지 않는 순수 변환
// 도구라서, 상위(Dashboard)로부터 아무 prop도 받지 않는 독립 컴포넌트로 만들었다.
function PdfToExcelTab() {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [doneMsg, setDoneMsg] = useState("");

  async function handleFile(file) {
    if (!file) return;
    setErr("");
    setDoneMsg("");
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    if (!isPdf) {
      setErr("PDF 파일만 올릴 수 있어요.");
      return;
    }
    setBusy(true);
    try {
      const { sheets, anyTextFound } = await convertPdfFileToSheets(file);
      if (!anyTextFound) {
        setErr("이 PDF에서 글자를 읽어내지 못했어요. 스캔한 이미지로 만들어진 PDF는 아직 지원하지 않아요(엑셀·한글 프로그램에서 PDF로 저장한 파일이면 대부분 잘 변환돼요).");
        return;
      }
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      sheets.forEach((s) => {
        const ws = XLSX.utils.aoa_to_sheet(s.aoa);
        XLSX.utils.book_append_sheet(wb, ws, s.name);
      });
      const outName = file.name.replace(/\.pdf$/i, "") + "_변환.xlsx";
      XLSX.writeFile(wb, outName);
      setDoneMsg(`"${outName}" 파일로 내려받았어요. (총 ${sheets.length}페이지)`);
    } catch (e) {
      console.error(e);
      setErr("PDF를 변환하는 중 문제가 발생했어요. 파일 형식을 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>PDF를 엑셀로 변환</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16, maxWidth: 560, lineHeight: 1.7 }}>
        PDF 파일을 올리면 화면에 보이는 줄·칸 구성을 최대한 그대로 살려서 엑셀(.xlsx) 파일로 내려받아요.
        엑셀이나 한글 프로그램에서 PDF로 저장한 문서일수록 더 정확하게 변환돼요(표가 아닌 문서나 스캔한
        이미지 PDF는 줄·칸이 완벽히 맞지 않을 수 있어요).
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={busy ? undefined : handleDrop}
        onClick={() => !busy && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? C.purple : C.lineSoft}`,
          background: dragOver ? C.purpleBg : C.panel,
          padding: 40,
          textAlign: "center",
          cursor: busy ? "default" : "pointer",
          maxWidth: 520,
        }}
      >
        <input
          type="file"
          accept=".pdf,application/pdf"
          ref={inputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleFile(file);
          }}
          style={{ display: "none" }}
        />
        {busy ? (
          <div style={{ fontSize: 13.5, color: C.inkSoft }}>변환 중…</div>
        ) : (
          <>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⬆️</div>
            <div style={{ fontSize: 13.5, color: C.ink, marginBottom: 4 }}>PDF 파일을 끌어다 놓으세요</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>또는 클릭해서 파일 선택 (.pdf)</div>
          </>
        )}
      </div>

      {err && <div style={{ color: C.brick, fontSize: 13, marginTop: 14, maxWidth: 520 }}>{err}</div>}
      {doneMsg && <div style={{ color: C.green, fontSize: 13, marginTop: 14 }}>{doneMsg}</div>}
    </div>
  );
}

function QuoteUploadPanel({ importState, setImportState, onFile, onPasteText, onCancel, onConfirm, importing, isAdmin = true, tonOverrides, onTonOverrideSaved, customers }) {
  const update = (patch) => setImportState({ ...importState, ...patch });

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>견적서 업로드</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        엑셀 또는 PDF 견적서를 올리거나, 엑셀에서 내용을 그대로 복사해서 붙여넣어도 아래 전표 정보와 품목이 자동으로 채워져요. (PDF는 표 형식에 따라 인식률이 다를 수 있으니) 등록 전에 내용을 꼭 확인·수정해주세요.
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        <QuotePasteBox onPasteText={onPasteText} hasData={!!importState} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", fontSize: 11.5, fontWeight: 700, color: C.muted, padding: "0 2px" }}>
          또는
        </div>
        <QuoteDropZone onFile={onFile} hasData={!!importState} />
      </div>

      {importState && (
        <>
          <QuoteHeaderForm state={importState} update={update} isAdmin={isAdmin} customers={customers} />
          <ImportPreview
            state={importState}
            setState={setImportState}
            onCancel={onCancel}
            onConfirm={onConfirm}
            importing={importing}
            tonOverrides={tonOverrides}
            onTonOverrideSaved={onTonOverrideSaved}
          />
        </>
      )}
    </div>
  );
}

// "현장/구역"은 업로드 미리보기 화면에서는 굳이 보여줄 필요가 없어서 뺐다(품목 데이터에는 계속 남아있고,
// 등록 후 렌탈내역/전표 상세 화면에서는 그대로 보인다).
const importPreviewCols = ["품목", "규격", "수량", "단가", "금액", "톤수", "비고"];
const importPreviewInitialWidths = [170, 190, 55, 100, 100, 95, 180];

function ImportPreview({ state, setState, onCancel, onConfirm, importing, tonOverrides, onTonOverrideSaved }) {
  // 견적서 양식마다 소계·안내문구 같은 줄이 품목으로 잘못 딸려 들어오는 경우가 있어, 모든 양식을
  // 완벽하게 자동으로 걸러내려 하기보다 체크박스로 필요없는 줄을 직접 골라 지울 수 있게 한다.
  const [selected, setSelected] = useState(() => new Set());
  // 줄을 지우거나 하면 인덱스가 바뀌므로, 남아있는 품목 수보다 큰(유효하지 않은) 선택은 안전하게 정리한다.
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Set();
      prev.forEach((i) => {
        if (i < state.items.length) next.add(i);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [state.items.length]);
  const toggleSelected = (idx) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  const allSelected = state.items.length > 0 && selected.size === state.items.length;
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(state.items.map((_, i) => i)));
  const deleteSelected = () => {
    if (selected.size === 0) return;
    const items = state.items.filter((_, i) => !selected.has(i));
    setState({ ...state, items });
    setSelected(new Set());
  };

  const updateItem = (idx, patch) => {
    const items = [...state.items];
    items[idx] = { ...items[idx], ...patch };
    setState({ ...state, items });
  };
  const totalAmount = state.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  // 톤수를 못 찾아 비어있는(null) 품목이 있으면 "미확인 있음"으로 표시해서, 총 톤수만 보고 안심하지 않게 한다.
  // 단, DC/설치비/배송비처럼 애초에 톤수 대상이 아닌 품목(tonExcluded)은 "미확인"에서 빼서 헷갈리지 않게 한다.
  const tonApplicableItems = state.items.filter((it) => !it.tonExcluded);
  const tonItems = tonApplicableItems.filter((it) => it.ton != null);
  const totalTon = tonItems.reduce((sum, it) => sum + Number(it.ton), 0);
  const missingTonCount = tonApplicableItems.length - tonItems.length;
  const [savingTonIdx, setSavingTonIdx] = useState(null);

  // 이 품목(품목명+규격)의 톤수를 다음부터 자동으로 채워지도록 저장한다. 같은 품목+규격을 가진 다른 행에도 바로 반영한다.
  async function saveTonOverride(idx) {
    const it = state.items[idx];
    if (it.ton == null || !it.qty) {
      alert("톤수와 수량을 먼저 입력해주세요.");
      return;
    }
    if (!(it.item || "").trim() || !(it.spec || "").trim()) {
      alert("품목명과 규격을 먼저 입력해주세요.");
      return;
    }
    setSavingTonIdx(idx);
    const per = Math.round((Number(it.ton) / Number(it.qty)) * 1000000) / 1000000;
    const { error } = await supabase
      .from("ton_overrides")
      .upsert({ item: it.item.trim(), spec: it.spec.trim(), per }, { onConflict: "item,spec" });
    setSavingTonIdx(null);
    if (error) {
      alert("저장하지 못했어요: " + error.message + " (Supabase에 ton_overrides 테이블이 아직 없다면 관리자에게 설정을 요청해주세요.)");
      return;
    }
    // 같은 품목+규격을 가진 다른 행에도 이 값을 즉시 반영
    const ni = normalizeTonText(it.item);
    const ns = normalizeTonText(it.spec);
    const items = state.items.map((row) =>
      normalizeTonText(row.item) === ni && normalizeTonText(row.spec) === ns
        ? { ...row, ton: row.qty ? Math.round(Number(row.qty) * per * 1000) / 1000 : row.ton }
        : row
    );
    setState({ ...state, items });
    onTonOverrideSaved && onTonOverrideSaved();
    alert("저장했어요. 다음부터 이 품목은 자동으로 채워져요.");
  }

  const [colWidths, startResize] = useResizableColumns(importPreviewInitialWidths);
  const gridTemplate = colWidths.map((w) => `${w}px`).join(" ");

  // "견적서를 업로드하면 자동으로 사무집기 이미지를 출력물로 만들어달라"는 요청으로 추가된 기능 —
  // 미리 등록해둔 사진(제품사진 라이브러리)을 품목명 기준으로 자동 매칭해 보여주는 화면을 켜고 끈다.
  const [showPhotoOutput, setShowPhotoOutput] = useState(false);

  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>품목 내역</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>
        총 {state.items.length}개 품목이 인식됐어요. 등록 전에 내용을 확인·수정해주세요. (칸 경계를 드래그하면 너비를 늘이고 줄일 수 있어요)
        톤수는 기준표에서 자동으로 채워져요. 노란 칸은 비슷한 품목조차 없어 직접 입력이 필요한 경우인데, 입력 후 "저장"을 누르면 다음부터는 이 품목도 자동으로 채워져요.
        DC·설치비·배송비 등 요금성 품목은 톤수 계산에서 자동으로 제외돼요. 소계·안내문구처럼 품목이 아닌 줄이 잘못 섞여 들어왔으면
        왼쪽 체크박스로 골라서 지워주세요.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowPhotoOutput(true)}
          disabled={state.items.length === 0}
          style={{ ...ghostBtnStyle, opacity: state.items.length === 0 ? 0.4 : 1, cursor: state.items.length === 0 ? "not-allowed" : "pointer" }}
          title="제품사진 라이브러리에 등록해둔 사진을 품목명으로 자동 매칭해서 출력물로 보여줘요"
        >
          사진 출력물 보기
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={selected.size === 0}
          style={{ ...ghostBtnStyle, opacity: selected.size === 0 ? 0.4 : 1, cursor: selected.size === 0 ? "not-allowed" : "pointer" }}
        >
          선택 삭제{selected.size > 0 ? ` (${selected.size}건)` : ""}
        </button>
      </div>

      {showPhotoOutput && <QuotePhotoOutputView state={state} onClose={() => setShowPhotoOutput(false)} />}

      <div style={{ maxHeight: 360, overflow: "auto", border: `1px solid ${C.lineSoft}`, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${C.lineSoft}`, position: "sticky", top: 0, background: C.panel, minWidth: "max-content", zIndex: 1 }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            title="전체 선택/해제"
            style={{ flex: "0 0 auto", width: 15, height: 15, cursor: "pointer" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 8, fontSize: 11.5, color: C.muted, flex: 1 }}>
            {importPreviewCols.map((label, i) => (
              <div key={label} style={{ position: "relative" }}>
                {label}
                {i < importPreviewCols.length - 1 && <ColResizeHandle onMouseDown={startResize(i)} />}
              </div>
            ))}
          </div>
        </div>
        {state.items.map((it, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: "max-content", background: selected.has(idx) ? "#FDECEC" : "transparent" }}>
            <input
              type="checkbox"
              checked={selected.has(idx)}
              onChange={() => toggleSelected(idx)}
              style={{ flex: "0 0 auto", width: 15, height: 15, cursor: "pointer" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 8, fontSize: 12.5, alignItems: "center", flex: 1 }}>
            <input style={smallInputStyle} value={it.item || ""} onChange={(e) => updateItem(idx, { item: e.target.value })} />
            <input style={smallInputStyle} value={it.spec || ""} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
            <input type="number" style={smallInputStyle} value={it.qty ?? ""} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} />
            <NumberInput style={smallInputStyle} value={it.unit_price} onChange={(v) => updateItem(idx, { unit_price: v })} />
            <NumberInput style={smallInputStyle} value={it.amount} onChange={(v) => updateItem(idx, { amount: v })} />
            {it.tonExcluded ? (
              // DC/설치비/배송비 등 요금성 품목: 톤수 대상이 아니므로 직접 입력을 요구하지 않고 "제외"만 표시한다.
              <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center" }} title="DC·설치비·배송비 등은 톤수 계산에서 제외돼요">
                제외
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="number"
                  step="0.001"
                  style={{ ...smallInputStyle, background: it.ton == null ? "#FFF6E5" : smallInputStyle.background }}
                  value={it.ton ?? ""}
                  placeholder="직접입력"
                  onChange={(e) => updateItem(idx, { ton: e.target.value === "" ? null : Number(e.target.value) })}
                />
                <button
                  type="button"
                  title="이 품목의 톤수를 저장해서 다음부터 자동으로 채워지게 해요"
                  onClick={() => saveTonOverride(idx)}
                  disabled={savingTonIdx === idx}
                  style={{ border: `1px solid ${C.line}`, background: "none", cursor: "pointer", fontSize: 12, padding: "5px 6px", color: C.inkSoft, flexShrink: 0 }}
                >
                  {savingTonIdx === idx ? "…" : "저장"}
                </button>
              </div>
            )}
            <input style={smallInputStyle} value={it.note || ""} onChange={(e) => updateItem(idx, { note: e.target.value })} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 14, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        <span>
          합계 {fmtWon(totalAmount)} · 총 톤수 {totalTon.toFixed(3)}톤
          {missingTonCount > 0 && (
            <span style={{ color: "#B45309" }}> (기준표에 없어 톤수 미확인 {missingTonCount}건 — 노란 칸을 직접 채워주세요)</span>
          )}
        </span>
        <DeliverySiteInfoButton address={state.site} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onConfirm} disabled={importing} style={primaryBtnStyle2}>
          {importing ? "등록 중…" : `일괄 등록 (${state.items.length}건)`}
        </button>
        <button onClick={onCancel} style={ghostBtnStyle}>취소</button>
      </div>
    </div>
  );
}

// ---------- 견적서 품목 ↔ 사무집기 사진 자동 매칭 ----------
// "이미지 파일을 별도로 줄테니 견적서를 업로드하면 자동으로 사무집기 이미지를 출력물로 만들어달라"는
// 요청에 따라, 제품사진 라이브러리(item_photos)에 미리 등록해둔 사진을 품목명 기준으로 자동으로 찾아
// 붙여준다. 견적서마다 품목명이 완전히 똑같이 적혀있지 않을 수 있어(공백·괄호 등 표기 차이), 완전히
// 같은 이름이 없어도 최대한 "센스있게" 비슷한 걸 찾도록 했다: 1) 정리한 이름이 완전히 같으면 최우선,
// 2) 한쪽 이름이 다른 쪽에 포함되면 그다음, 3) 그것도 아니면 글자 2개씩 겹치는 정도(다이스 유사도)로
// 가장 비슷한 것을 고르고, 규격까지 등록돼 있으면 규격 일치 여부로 점수를 더 보정한다.
function normalizeForPhotoMatch(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .replace(/[\s()\[\]{}\-_/,.:;·※]/g, "")
    .trim();
}
function photoMatchBigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}
function photoMatchDiceCoefficient(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = photoMatchBigrams(a);
  const B = photoMatchBigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let common = 0;
  A.forEach((g) => {
    if (B.has(g)) common++;
  });
  return (2 * common) / (A.size + B.size);
}
// "우리는 이렇게 색상을 입력해" — 실제 A/S 문서를 보내주셔서 확인한 표기 방식 두 가지를 그대로
// 인식해서 뽑아낸다.
// 1) "접의자(밤색)"처럼 품목명 바로 뒤 괄호 안에 색상이 오는 경우
// 2) "탑책상, W1400*D800, 연체리 2ea"처럼 콤마로 나열한 마지막 항목이 "색상 수량"으로 오는 경우
//    (규격 자리는 W1400*D800처럼 숫자·W·D·*가 섞여있어 색상과 구분된다)
function extractColorFromItemText(text) {
  if (!text) return null;
  const s = String(text);
  // 1) 괄호 패턴 — 맨 뒤 괄호부터 본다. 안쪽이 숫자·규격 기호뿐이면(모델번호 등) 색상이 아니라고 보고 건너뜀.
  const parenMatches = [...s.matchAll(/\(([^()]+)\)/g)];
  for (let i = parenMatches.length - 1; i >= 0; i--) {
    const inner = parenMatches[i][1].trim();
    if (inner && !/^[\d.\s*x×WDwd]+$/.test(inner)) return inner;
  }
  // 2) 콤마로 나열된 마지막 항목 — 끝에 붙은 수량 표시(2ea, 3개 등)를 떼어내고, 남은 게 숫자나 규격
  //    기호(W/D/*/x) 없이 짧은 낱말이면 색상으로 본다.
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const stripped = last.replace(/\d+\s*(ea|EA|Ea|개)\s*$/, "").trim();
    if (stripped && stripped.length <= 8 && !/[\d*x×]/i.test(stripped) && !/^[WDwd]\d/.test(stripped)) {
      return stripped;
    }
  }
  return null;
}

function matchItemPhoto(itemName, spec, photos) {
  const ni = normalizeForPhotoMatch(itemName);
  if (!ni || !photos || photos.length === 0) return null;
  const ns = normalizeForPhotoMatch(spec);
  // 품목명·규격 어느 쪽에 적혀있든(위 두 표기 방식 다 대응) 색상을 뽑아 매칭 점수에 보탠다 —
  // 색상 정보가 없거나 사진에 색상이 등록 안 돼있어도 기존 이름·규격 매칭은 그대로 동작한다.
  const nColor = normalizeForPhotoMatch(extractColorFromItemText(itemName) || extractColorFromItemText(spec));
  let best = null;
  let bestScore = 0;
  for (const p of photos) {
    const pn = normalizeForPhotoMatch(p.item_name);
    if (!pn) continue;
    let score;
    if (pn === ni) {
      score = 1;
    } else if (pn.includes(ni) || ni.includes(pn)) {
      const shorter = Math.min(pn.length, ni.length);
      const longer = Math.max(pn.length, ni.length);
      score = 0.85 + (shorter / longer) * 0.1;
    } else {
      score = photoMatchDiceCoefficient(ni, pn) * 0.8; // 이름만 비슷한 경우엔 상한을 낮춰 규격 일치로 보완할 여지를 둔다
    }
    const ps = normalizeForPhotoMatch(p.spec);
    if (ns && ps) {
      if (ps === ns) score += 0.15;
      else if (ps.includes(ns) || ns.includes(ps)) score += 0.07;
    }
    const pColor = normalizeForPhotoMatch(p.color);
    if (nColor && pColor) {
      if (pColor === nColor) score += 0.2;
      else if (pColor.includes(nColor) || nColor.includes(pColor)) score += 0.1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

// 견적서 품목 목록에 등록된 사진을 자동으로 매칭해서 인쇄/PDF 저장할 수 있는 출력물로 보여주는 화면.
// ImportPreview의 "사진 출력물 보기" 버튼으로 열린다.
function QuotePhotoOutputView({ state, onClose }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [urlById, setUrlById] = useState({});

  useEffect(() => {
    let revoked = false;
    const urls = [];
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.from("item_photos").select("*").order("item_name", { ascending: true });
      if (error) {
        setLoading(false);
        alert(
          "사진 목록을 불러오지 못했어요: " + error.message + " (Supabase에 item_photos 테이블이 아직 없다면 관리자에게 설정을 요청해주세요.)"
        );
        return;
      }
      const list = data || [];
      setPhotos(list);
      const map = {};
      for (const p of list) {
        if (!p.image_path) continue;
        const { data: fileData, error: dlError } = await supabase.storage.from("item-photos").download(p.image_path);
        if (!dlError && fileData) {
          const url = URL.createObjectURL(fileData);
          urls.push(url);
          map[p.id] = url;
        }
      }
      if (!revoked) {
        setUrlById(map);
        setLoading(false);
      }
    }
    load();
    return () => {
      revoked = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function handlePrintPhotoOutput() {
    const prevTitle = document.title;
    document.title = `사무집기 이미지 출력물${state.voucherNo ? " #" + state.voucherNo : ""}`;
    const restoreTitle = () => {
      document.title = prevTitle;
    };
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.print();
    setTimeout(restoreTitle, 2000);
  }

  const rowsWithMatch = state.items.map((it) => ({ it, photo: matchItemPhoto(it.item, it.spec, photos) }));
  const matchedCount = rowsWithMatch.filter((r) => r.photo).length;

  return (
    <div
      className="qpo-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(20,20,20,0.5)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #qpo-print-area, #qpo-print-area * { visibility: visible; }
          #qpo-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 24px; }
          .qpo-no-print { display: none !important; }
          .qpo-overlay { position: static !important; background: none !important; padding: 0 !important; }
        }
      `}</style>
      <div style={{ background: "#fff", width: "min(920px, 100%)", maxHeight: "92vh", overflow: "auto", border: `1px solid ${C.line}`, padding: 24 }}>
        <div className="qpo-no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: serif, fontSize: 16 }}>
            사무집기 이미지 출력물{loading ? " (사진 불러오는 중…)" : ` — 사진 매칭 ${matchedCount}/${state.items.length}건`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handlePrintPhotoOutput} disabled={loading} style={primaryBtnStyle2}>
              인쇄 / PDF로 저장
            </button>
            <button type="button" onClick={onClose} style={ghostBtnStyle}>
              닫기
            </button>
          </div>
        </div>

        {/* (2026-10-04) "출력물에서 '사무집기 이미지 출력물'이란 단어는 다 빼줘" 요청으로, 인쇄 영역
            맨 위에 있던 큰 제목을 뺐다. 거래처·현장·전표번호 줄은 어떤 전표의 출력물인지 구분하는 데
            여전히 필요해서 그대로 남겨뒀다. */}
        <div id="qpo-print-area">
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.muted }}>
              {state.customer || state.recipient || ""}
              {state.siteName ? ` · ${state.siteName}` : ""}
              {state.voucherNo ? ` · #${state.voucherNo}` : ""}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {rowsWithMatch.map(({ it, photo }, idx) => (
              <div key={idx} style={{ border: `1px solid ${C.lineSoft}`, padding: 10, breakInside: "avoid" }}>
                <div style={{ width: "100%", height: 150, background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8, overflow: "hidden" }}>
                  {photo && urlById[photo.id] ? (
                    <img src={urlById[photo.id]} alt={it.item || ""} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ fontSize: 11.5, color: C.muted }}>사진 없음</span>
                  )}
                </div>
                {/* (2026-10-04) "사진 하단에 수량 단가 금액 등은 제외해줘" 요청으로 아래 수량/단가/금액
                    줄을 뺐다 — 사진으로 품목을 확인시켜주는 용도라 가격 정보는 필요없다고 판단한 것. */}
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: it.spec ? 2 : 0 }}>{it.item || "(품목명 없음)"}</div>
                {it.spec && <div style={{ fontSize: 11.5, color: C.muted }}>{it.spec}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// "사진파일 등록은 드래그앤 드랍버전, 파일 선택버전 2개로 구성해주고" 요청 — 위쪽 QuoteDropZone 등과
// 같은 구조로, 사진을 끌어다 놓아도 되고(드래그앤드롭) 클릭해서 파일탐색기로 골라도 되게(파일 선택)
// 한 영역 안에 두 방식을 같이 넣었다. 이미 고른 파일이 있으면 그 파일명을 보여주고, 다른 파일을
// 끌어다 놓거나 다시 클릭하면 바꿀 수 있다.
// "사진을 잘못 가져왔을 수도 있잖아 취소버튼을 하나 넣어주고" 요청으로, 파일을 고른 뒤(드래그든
// 클릭이든) 등록을 누르기 전에 다시 뺄 수 있는 × 버튼을 추가했다. onClear가 없으면(다른 곳에서
// 재사용할 때 대비) 취소 버튼 자체를 안 그린다.
function PhotoDropZone({ onFile, fileName, onClear }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        position: "relative",
        border: `2px dashed ${dragOver ? C.purple : C.lineSoft}`,
        background: dragOver ? C.purpleBg : C.bg,
        padding: "9px 12px",
        textAlign: "center",
        cursor: "pointer",
        minWidth: 220,
        boxSizing: "border-box",
      }}
    >
      <input
        type="file"
        accept="image/*"
        ref={inputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
        style={{ display: "none" }}
      />
      {fileName ? (
        <div style={{ fontSize: 11.5, color: C.ink }}>
          📷 {fileName}
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>다른 사진으로 바꾸려면 클릭하거나 끌어다 놓으세요</div>
          {onClear && (
            <button
              type="button"
              title="선택한 사진 취소"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 18,
                height: 18,
                lineHeight: "16px",
                padding: 0,
                border: `1px solid ${C.line}`,
                borderRadius: "50%",
                background: C.panel,
                color: C.muted,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: C.muted }}>
          사진을 끌어다 놓거나
          <br />
          클릭해서 파일 선택
        </div>
      )}
    </div>
  );
}

// (2026-10-06 추가) "품목끼리 자유롭게 이동 가능하게... 같은 제품은 보여지는 사이즈가 동일하게" 요청 —
// 카드를 보여줄 때, 실제 사진의 픽셀 크기가 아니라 여기 입력해둔 실제 가로/세로/높이(mm) 값을 기준으로
// 액자 안에서 차지하는 비율을 계산한다. 그러면 같은 제품(예: 이동서랍 W400*D520*H600)은 사진을 어떻게
// 찍었든(얼마나 확대해서 찍었든) 항상 똑같은 비율로 보이고, 치수가 다른 제품끼리는 큰 제품이 더 크게
// 보이도록 자연스럽게 차이가 난다. 가로/세로/높이를 하나도 안 넣은 사진(기존에 등록해둔 사진들 포함)은
// 예전처럼 액자를 꽉 채워서 보여준다(동작이 갑자기 바뀌지 않도록).
function photoSizeFrac(p) {
  const dims = [p.width_mm, p.depth_mm, p.height_mm].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (dims.length === 0) return 1;
  const basis = Math.max(...dims);
  const REFERENCE_MM = 2000; // 이 정도(2m) 이상이면 액자를 꽉 채운다
  const MIN_FRAC = 0.35; // 아무리 작은 제품이어도 액자의 35%보다 작게는 안 보이게(너무 작아 안 보이는 것 방지)
  return Math.min(1, Math.max(MIN_FRAC, basis / REFERENCE_MM));
}

// 카드에 표시할 "W400×D520×H600mm" 같은 치수 문구. 하나도 안 넣었으면 null.
function formatDims(p) {
  const parts = [];
  if (p.width_mm) parts.push(`W${p.width_mm}`);
  if (p.depth_mm) parts.push(`D${p.depth_mm}`);
  if (p.height_mm) parts.push(`H${p.height_mm}`);
  return parts.length ? parts.join("×") + "mm" : null;
}

// ---------- 제품사진 라이브러리 (사무집기 사진을 품목명과 함께 미리 등록해두는 관리 화면) ----------
// "이미지 파일을 별도로 줄거야"라는 요청에 맞춰, 화면에서 사진을 하나씩 올리고 품목명(+선택적으로
// 규격)을 입력해 등록하는 방식으로 만들었다. 여기 등록한 사진은 견적서 업로드 화면의 "사진 출력물
// 보기"에서 matchItemPhoto로 자동 매칭된다.
// (2026-10-06 추가) "품목끼리 자유롭게 이동 가능하게" 요청으로, 카드를 마우스로 드래그해서 순서를
// 자유롭게 바꿀 수 있게 했다(sort_order 컬럼에 저장). 가로/세로/높이(mm)도 입력할 수 있게 하고, 이
// 값으로 화면에 보여지는 사진 크기를 계산해 같은 제품끼리는 항상 같은 크기로 보이게 했다.
function PhotoLibraryTab() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [urlById, setUrlById] = useState({});
  const [newName, setNewName] = useState("");
  const [newSpec, setNewSpec] = useState("");
  // "규격 옆에 색상 넣는 칸을 하나 만들어서... 나중에 견적서 상의 색상하고도 매칭되게 해보자" 요청 —
  // 우선 색상을 입력·저장·수정할 수 있게 칸을 추가해뒀다. 견적서 쪽 색상과 자동으로 매칭하는 로직은
  // "나중에"라고 하셔서 아직은 안 붙였고, 이 색상 칼럼(color)을 나중에 그대로 활용하면 된다.
  const [newColor, setNewColor] = useState("");
  // "가로 세로 높이를 넣으면... 동일하게 구현되게" 요청 — 사진 자체의 픽셀 크기가 아니라 실제 치수(mm)로
  // 화면 표시 크기를 맞추기 위한 입력칸. 선택 입력(안 넣으면 예전처럼 액자를 꽉 채워 보여줌).
  const [newWidth, setNewWidth] = useState("");
  const [newDepth, setNewDepth] = useState("");
  const [newHeight, setNewHeight] = useState("");
  const [newFile, setNewFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // "등록이 됐을 때 이름을 수정할 수 있는 기능" 요청 — 카드마다 "이름 수정" 버튼을 누르면 그 카드만
  // 품목명·규격·색상을 입력칸으로 바꿔 고칠 수 있게 했다. 한 번에 하나만 수정 모드로 열리게 editingId로 관리.
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editSpec, setEditSpec] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editWidth, setEditWidth] = useState("");
  const [editDepth, setEditDepth] = useState("");
  const [editHeight, setEditHeight] = useState("");
  // "사진도 수정할 수 있게 해줘" 요청 — 수정 모드에서 새 사진 파일을 고르면 그걸로 교체하고, 안 고르면
  // (null로 두면) 원래 사진이 그대로 남는다.
  const [editFile, setEditFile] = useState(null);
  const [renaming, setRenaming] = useState(false);
  // "품목끼리 자유롭게 이동 가능하게" 요청 — 카드를 마우스로 끌어다 놓으면 순서가 바뀐다. dragId는
  // 지금 끌고 있는 카드, reordering은 끌어다 놓은 뒤 서버에 순서를 저장하는 중인지 표시용.
  const [dragId, setDragId] = useState(null);
  const [reordering, setReordering] = useState(false);
  // "컨트롤 Z로 뒤로 갈 수 있게... 수정 후 뒤로가기" 요청 — 정보 수정(품목명·규격·색상·가로/세로/높이)
  // 저장에 한해서, 바로 직전 저장 전 값을 undoSnapshot에 기억해뒀다가 Ctrl+Z(또는 Cmd+Z)를 누르면 그
  // 값으로 되돌린다. 한 단계(가장 최근 수정 1건)만 되돌릴 수 있다 — 여러 단계를 쌓아두지 않는 게 더
  // 안전하고 확실하다는 판단. 사진 교체·삭제·순서변경은 이 되돌리기 대상이 아니다(요청 범위 밖).
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [undoing, setUndoing] = useState(false);
  // "제품 왼쪽 상단에 체크박스 넣어서 A,B,C 클릭하고 보여지는 크기 동일하게" 요청 — 같은 품목인데
  // 사진을 찍을 때 확대 정도가 달라서 화면에 보이는 크기가 서로 다르게 느껴질 때, 사람이 직접 보고
  // 여러 장을 체크해서 한 번에 같은 확대 비율(zoom_pct)로 맞출 수 있게 한다. 체크만 해서는 아무 것도
  // 안 바뀌고, 아래 슬라이더를 움직여야 그 순간부터 선택된 카드들에 실시간 미리보기가 적용되며,
  // "적용"을 눌러야 실제로 저장된다(눌러보고 마음에 안 들면 "선택 해제"로 그냥 취소할 수 있음).
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkZoomValue, setBulkZoomValue] = useState(null);
  const [applyingZoom, setApplyingZoom] = useState(false);

  async function fetchPhotos() {
    setLoading(true);
    // sort_order가 있으면 그 순서(화면에서 드래그로 정한 순서)대로, 아직 순서를 안 정한(새로 등록했거나
    // sort_order 컬럼을 막 추가한 직후) 사진들은 등록한 최신순으로 뒤에 붙는다.
    let { data, error } = await supabase
      .from("item_photos")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error && /sort_order/i.test(error.message)) {
      // item_photos_size_order_setup.sql을 아직 실행 안 해서 sort_order 컬럼이 없는 경우 — 드래그 순서
      // 기능만 빠진 채로(예전처럼 최신순) 일단 화면은 뜨게 해준다.
      ({ data, error } = await supabase.from("item_photos").select("*").order("created_at", { ascending: false }));
    }
    if (error) {
      setLoading(false);
      alert(
        "사진 목록을 불러오지 못했어요: " + error.message + " (Supabase에 item_photos 테이블이 아직 없다면 관리자에게 설정을 요청해주세요.)"
      );
      return;
    }
    setPhotos(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchPhotos();
  }, []);

  useEffect(() => {
    let revoked = false;
    const urls = [];
    async function loadThumbs() {
      const map = {};
      for (const p of photos) {
        if (!p.image_path) continue;
        const { data, error } = await supabase.storage.from("item-photos").download(p.image_path);
        if (!error && data) {
          const url = URL.createObjectURL(data);
          urls.push(url);
          map[p.id] = url;
        }
      }
      if (!revoked) setUrlById(map);
    }
    if (photos.length > 0) loadThumbs();
    return () => {
      revoked = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photos]);

  async function handleAdd() {
    if (!newName.trim()) {
      alert("품목명을 입력해주세요.");
      return;
    }
    if (!newFile) {
      alert("사진 파일을 선택해주세요.");
      return;
    }
    setSaving(true);
    // Storage 경로에는 한글 등이 들어가면 오류가 나므로(다른 업로드와 같은 이유), 경로는 시간으로만
    // 안전하게 만들고 실제 품목명은 item_photos.item_name 컬럼에 그대로 저장해 화면에 보여준다.
    const extMatch = newFile.name.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0] : "";
    const path = `photo-${Date.now()}${ext}`;
    const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, newFile, { upsert: false });
    if (uploadError) {
      setSaving(false);
      // "row-level security policy" 오류는 대부분 Supabase에 item-photos 저장공간(버킷)이 아직 없거나,
      // 있어도 업로드를 허용하는 권한 규칙이 안 걸려있어서 생긴다 — item_photos_setup.sql을 한 번
      // 실행하면 해결된다.
      alert(
        "사진 업로드에 실패했어요: " +
          uploadError.message +
          (uploadError.message.includes("row-level security") || uploadError.message.includes("Bucket not found")
            ? " (Supabase에 item-photos 저장공간(버킷)·권한 규칙이 아직 설정되지 않았을 수 있어요. item_photos_setup.sql을 Supabase SQL Editor에서 한 번 실행해주세요.)"
            : "")
      );
      return;
    }
    // 가로/세로/높이는 선택 입력이라 비워두면 null로 저장한다(그러면 photoSizeFrac이 예전처럼 액자를
    // 꽉 채우는 걸로 처리한다). 숫자가 아닌 값을 넣었으면(실수로 "약 400" 처럼) 무시하고 null로 저장.
    const parseDim = (s) => {
      const n = Number(String(s).trim());
      return s && Number.isFinite(n) && n > 0 ? n : null;
    };
    const { error: insertError } = await supabase.from("item_photos").insert({
      item_name: newName.trim(),
      spec: newSpec.trim() || null,
      color: newColor.trim() || null,
      width_mm: parseDim(newWidth),
      depth_mm: parseDim(newDepth),
      height_mm: parseDim(newHeight),
      image_path: path,
    });
    setSaving(false);
    if (insertError) {
      // color/width_mm 등 컬럼이 아직 없는 예전 Supabase 테이블일 수 있다 — setup sql을 다시 실행하면 추가된다.
      alert(
        "등록에 실패했어요: " +
          insertError.message +
          (insertError.message.includes("color")
            ? " (Supabase의 item_photos 테이블에 color 컬럼이 아직 없을 수 있어요. item_photos_setup.sql을 다시 실행해주세요.)"
            : /width_mm|depth_mm|height_mm/.test(insertError.message)
            ? " (Supabase의 item_photos 테이블에 가로/세로/높이 컬럼이 아직 없을 수 있어요. item_photos_size_order_setup.sql을 Supabase SQL Editor에서 실행해주세요.)"
            : " (Supabase에 item_photos 테이블이 아직 없다면 관리자에게 설정을 요청해주세요.)")
      );
      return;
    }
    setNewName("");
    setNewSpec("");
    setNewColor("");
    setNewWidth("");
    setNewDepth("");
    setNewHeight("");
    setNewFile(null);
    fetchPhotos();
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditName(p.item_name || "");
    setEditSpec(p.spec || "");
    setEditColor(p.color || "");
    setEditWidth(p.width_mm != null ? String(p.width_mm) : "");
    setEditDepth(p.depth_mm != null ? String(p.depth_mm) : "");
    setEditHeight(p.height_mm != null ? String(p.height_mm) : "");
    setEditFile(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditSpec("");
    setEditColor("");
    setEditWidth("");
    setEditDepth("");
    setEditHeight("");
    setEditFile(null);
  }

  async function saveEdit(p) {
    if (!editName.trim()) {
      alert("품목명을 입력해주세요.");
      return;
    }
    setRenaming(true);
    const parseDim = (s) => {
      const n = Number(String(s).trim());
      return s && Number.isFinite(n) && n > 0 ? n : null;
    };
    // "사진도 수정할 수 있게 해줘" 요청 — 수정칸에서 새 사진을 골랐으면(editFile) 먼저 그 파일을
    // Storage에 새 경로로 올려두고(등록할 때와 같은 방식), 아래 update에 그 새 경로를 같이 저장한다.
    // 업로드가 실패하면 기존 정보(품목명 등)도 같이 틀어지지 않도록, 여기서 먼저 멈추고 기존 사진은
    // 그대로 남겨둔다.
    let newImagePath = null;
    if (editFile) {
      const extMatch = editFile.name.match(/\.[a-zA-Z0-9]+$/);
      const ext = extMatch ? extMatch[0] : "";
      newImagePath = `photo-${Date.now()}${ext}`;
      const { error: uploadError } = await supabase.storage.from("item-photos").upload(newImagePath, editFile, { upsert: false });
      if (uploadError) {
        setRenaming(false);
        alert(
          "새 사진 업로드에 실패했어요: " +
            uploadError.message +
            (uploadError.message.includes("row-level security") || uploadError.message.includes("Bucket not found")
              ? " (Supabase에 item-photos 저장공간(버킷)·권한 규칙이 아직 설정되지 않았을 수 있어요. item_photos_setup.sql을 Supabase SQL Editor에서 한 번 실행해주세요.)"
              : "")
        );
        return;
      }
    }
    // (버그 수정) "수정 후 저장을 해도 반영이 안되네" 신고 — Supabase에 item_photos "수정(update)" 권한
    // 규칙이 빠져있으면, 오류 없이 조용히 그냥 반영만 안 되는 경우가 있다(등록·삭제와 달리 이 문제는
    // 화면에 아무 표시가 안 나서 알아채기 어려웠다). .select()를 붙여 실제로 몇 건이 바뀌었는지
    // 확인해서, 0건이면 권한 규칙 문제라는 걸 명확히 알려준다.
    const { data, error } = await supabase
      .from("item_photos")
      .update({
        item_name: editName.trim(),
        spec: editSpec.trim() || null,
        color: editColor.trim() || null,
        width_mm: parseDim(editWidth),
        depth_mm: parseDim(editDepth),
        height_mm: parseDim(editHeight),
        ...(newImagePath ? { image_path: newImagePath } : {}),
      })
      .eq("id", p.id)
      .select();
    setRenaming(false);
    if (error) {
      // 새 사진까지 이미 올려놨는데 정보 수정 자체가 실패했으면, 방금 올린(아무도 안 쓰는) 파일은
      // 지워서 Storage에 쓸모없는 파일이 쌓이지 않게 한다(실패해도 그냥 넘어간다).
      if (newImagePath) supabase.storage.from("item-photos").remove([newImagePath]).catch(() => {});
      alert(
        "수정에 실패했어요: " +
          error.message +
          (error.message.includes("color")
            ? " (Supabase의 item_photos 테이블에 color 컬럼이 아직 없을 수 있어요. item_photos_setup.sql을 다시 실행해주세요.)"
            : /width_mm|depth_mm|height_mm/.test(error.message)
            ? " (Supabase의 item_photos 테이블에 가로/세로/높이 컬럼이 아직 없을 수 있어요. item_photos_size_order_setup.sql을 Supabase SQL Editor에서 실행해주세요.)"
            : "")
      );
      return;
    }
    if (!data || data.length === 0) {
      if (newImagePath) supabase.storage.from("item-photos").remove([newImagePath]).catch(() => {});
      alert(
        "수정 내용이 저장되지 않았어요. Supabase에 item_photos \"수정(update)\" 권한 규칙이 아직 없을 수 있어요. item_photos_setup.sql을 Supabase SQL Editor에서 다시 실행해주세요."
      );
      return;
    }
    // 사진을 새로 바꿨으면, 더 이상 안 쓰는 예전 사진 파일은 Storage에서 지운다(실패해도 그냥 넘어감 —
    // 안 지워져도 더 이상 화면 어디에서도 안 보이니 문제는 없다).
    if (newImagePath && p.image_path) {
      supabase.storage.from("item-photos").remove([p.image_path]).catch(() => {});
    }
    // 정보(품목명·규격·색상·가로/세로/높이) 저장이 끝난 시점에, 그 직전 값(p — 이번에 수정하기 전
    // 원래 값)을 기억해둔다. 사진(image_path)은 되돌리기 대상이 아니라서 여기엔 안 담는다.
    setUndoSnapshot({
      id: p.id,
      item_name: p.item_name,
      spec: p.spec,
      color: p.color,
      width_mm: p.width_mm,
      depth_mm: p.depth_mm,
      height_mm: p.height_mm,
    });
    setEditingId(null);
    setEditFile(null);
    fetchPhotos();
  }

  async function handleUndo() {
    if (!undoSnapshot) return;
    setUndoing(true);
    const { id, ...prevValues } = undoSnapshot;
    const { data, error } = await supabase.from("item_photos").update(prevValues).eq("id", id).select();
    setUndoing(false);
    if (error) {
      alert("되돌리기에 실패했어요: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      // 그 사이에 삭제된 경우 등 — 되돌릴 대상이 이제 없다는 뜻이라 조용히 안내만 하고 넘어간다.
      alert("되돌릴 사진을 찾지 못했어요. 이미 삭제됐을 수 있어요.");
      setUndoSnapshot(null);
      return;
    }
    setUndoSnapshot(null);
    fetchPhotos();
  }

  // Ctrl+Z(윈도우) / Cmd+Z(맥)를 누르면 바로 직전 수정을 되돌린다. 단, 다른 입력칸에 커서가 있을 때는
  // (예: 품목명을 타이핑하다가) 브라우저 기본 되돌리기(타이핑 취소)가 그대로 동작하도록 건드리지 않는다.
  useEffect(() => {
    function onKeyDown(e) {
      const isUndoKey = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z");
      if (!isUndoKey || !undoSnapshot) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement && document.activeElement.isContentEditable)) return;
      e.preventDefault();
      handleUndo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undoSnapshot]);

  async function handleDelete(p) {
    if (!confirm(`"${p.item_name}" 사진을 삭제할까요?`)) return;
    setDeletingId(p.id);
    const { error } = await supabase.from("item_photos").delete().eq("id", p.id);
    if (error) {
      setDeletingId(null);
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    if (p.image_path) {
      supabase.storage.from("item-photos").remove([p.image_path]).catch(() => {});
    }
    setDeletingId(null);
    fetchPhotos();
  }

  // "품목끼리 자유롭게 이동 가능하게" 요청 — 카드를 끌어다(drag) 다른 카드 위에 놓으면 그 자리로
  // 순서가 바뀐다. 끄는 동안은 화면에서만 즉시 순서를 바꿔 보여주고(바로바로 반응해야 자연스러우니까),
  // 손을 떼는 순간(dragEnd) 그 최종 순서를 1,2,3...으로 Supabase에 저장한다.
  function handleDragStart(id) {
    if (editingId != null) return; // 수정 중인 카드가 있으면 드래그 중간에 꼬이지 않도록 막는다
    setDragId(id);
  }
  function handleDragOverCard(e, overId) {
    e.preventDefault();
    if (dragId == null || dragId === overId) return;
    setPhotos((prev) => {
      const fromIdx = prev.findIndex((p) => p.id === dragId);
      const toIdx = prev.findIndex((p) => p.id === overId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const list = [...prev];
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return list;
    });
  }
  async function handleDragEnd() {
    if (dragId == null) return;
    setDragId(null);
    setReordering(true);
    try {
      await Promise.all(photos.map((p, i) => supabase.from("item_photos").update({ sort_order: i + 1 }).eq("id", p.id)));
    } catch (e) {
      // 저장이 실패해도 화면은 이미 바뀐 순서대로 보이고 있으니 조용히 넘어간다 — 새로고침하면
      // sort_order 컬럼이 없는 경우(setup sql 미실행) 다시 예전 순서로 돌아간다.
    }
    setReordering(false);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkZoomValue(null);
  }

  // 지금 체크된 카드들에 한해서, 슬라이더로 고른 확대 비율을 실시간 미리보기로 보여준다(아직 저장 전).
  // 체크 안 한 카드나, 슬라이더를 아직 한 번도 안 움직였으면(bulkZoomValue가 null) 원래 저장된 값 그대로.
  function effectiveZoomPct(p) {
    if (bulkZoomValue != null && selectedIds.has(p.id)) return bulkZoomValue;
    return p.zoom_pct || 100;
  }

  // 여러 장의 id에 같은 zoom_pct 값을 한꺼번에 저장하는 공용 함수. 직접 비율을 입력해서 맞출 때(applyBulkZoom)와
  // "이 사진 기준으로 맞추기" 버튼을 눌렀을 때(applyReferenceZoom) 둘 다 이 함수를 쓴다.
  async function persistZoomToIds(ids, zoomValue) {
    setApplyingZoom(true);
    const results = await Promise.all(ids.map((id) => supabase.from("item_photos").update({ zoom_pct: zoomValue }).eq("id", id)));
    setApplyingZoom(false);
    const err = results.find((r) => r.error)?.error;
    if (err) {
      alert(
        "크기 맞추기에 실패했어요: " +
          err.message +
          (/zoom_pct/.test(err.message)
            ? " (Supabase의 item_photos 테이블에 zoom_pct 컬럼이 아직 없을 수 있어요. item_photos_size_order_setup.sql을 Supabase SQL Editor에서 다시 실행해주세요.)"
            : "")
      );
      return false;
    }
    return true;
  }

  async function applyBulkZoom() {
    if (selectedIds.size === 0 || bulkZoomValue == null) return;
    const ok = await persistZoomToIds(Array.from(selectedIds), bulkZoomValue);
    if (!ok) return;
    clearSelection();
    fetchPhotos();
  }

  // "A와 B를 B 기준으로 동일하게, A 기준으로 동일하게" 요청 — 비율을 숫자로 직접 입력하는 대신, 선택한
  // 사진 중 하나를 "이 사진 기준으로 맞추기"로 고르면, 그 사진의 현재 배율을 나머지 선택된 사진들에
  // 그대로 복사해 저장한다(기준으로 고른 사진 자체는 그대로 둔다). 슬라이더로 값을 가늠할 필요 없이
  // 눈에 보이는 사진을 그대로 기준 삼을 수 있어 더 직관적이다.
  async function applyReferenceZoom(refId) {
    const ref = photos.find((x) => x.id === refId);
    if (!ref) return;
    const targetZoom = ref.zoom_pct || 100;
    const otherIds = Array.from(selectedIds).filter((id) => id !== refId);
    if (otherIds.length === 0) return;
    const ok = await persistZoomToIds(otherIds, targetZoom);
    if (!ok) return;
    clearSelection();
    fetchPhotos();
  }

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>제품사진 라이브러리</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        사무집기 사진을 품목명과 함께 등록해두면, 견적서 업로드 화면의 "사진 출력물 보기"에서 품목명이 비슷한 사진을 자동으로
        찾아 붙여줘요. 규격·색상까지 적어두면 더 정확하게 매칭돼요(둘 다 선택 입력) — 품목명 뒤 괄호 안 색상("접의자(밤색)")이나
        콤마로 나열한 마지막 색상("탑책상, W1400*D800, 연체리")도 자동으로 읽어서 비교해요. 가로·세로·높이(mm)를 적어두면 다른
        제품끼리는 실제 크기 차이가 나게 보이고, 카드를 마우스로 끌어다 놓으면 순서를 자유롭게 바꿀 수 있어요. 같은 제품인데
        사진마다 확대된 정도가 달라 화면에 보이는 크기가 다르게 느껴지면, 사진 왼쪽 위 체크박스로 여러 장을 고른 뒤 "이 사진
        기준으로 맞추기" 버튼으로 그중 가장 마음에 드는 사진에 나머지를 맞출 수 있어요(직접 비율을 입력하는 것도 가능해요).
        {reordering && <span style={{ color: C.purple }}> (순서 저장 중…)</span>}
      </div>

      {undoSnapshot && (
        <div
          style={{
            border: `1px solid ${C.purple}`,
            background: C.purpleBg,
            color: C.purpleDark,
            padding: "8px 14px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12.5,
          }}
        >
          <span>방금 수정한 정보를 되돌릴 수 있어요. (Ctrl+Z 또는 Cmd+Z)</span>
          <button type="button" onClick={handleUndo} disabled={undoing} style={{ ...ghostBtnStyle, fontSize: 12, padding: "4px 12px" }}>
            {undoing ? "되돌리는 중…" : "되돌리기"}
          </button>
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 16, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>품목명 *</div>
          <input style={{ ...smallInputStyle, width: 180 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 사무용 책상" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>규격 (선택)</div>
          <input style={{ ...smallInputStyle, width: 160 }} value={newSpec} onChange={(e) => setNewSpec(e.target.value)} placeholder="예: 1400×700" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>색상 (선택)</div>
          <input style={{ ...smallInputStyle, width: 120 }} value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="예: 메이플" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>가로mm (선택)</div>
          <input type="number" style={{ ...smallInputStyle, width: 80 }} value={newWidth} onChange={(e) => setNewWidth(e.target.value)} placeholder="예: 400" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>세로mm (선택)</div>
          <input type="number" style={{ ...smallInputStyle, width: 80 }} value={newDepth} onChange={(e) => setNewDepth(e.target.value)} placeholder="예: 520" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>높이mm (선택)</div>
          <input type="number" style={{ ...smallInputStyle, width: 80 }} value={newHeight} onChange={(e) => setNewHeight(e.target.value)} placeholder="예: 600" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>사진 파일 *</div>
          <PhotoDropZone onFile={setNewFile} fileName={newFile?.name} onClear={() => setNewFile(null)} />
        </div>
        <button type="button" onClick={handleAdd} disabled={saving} style={primaryBtnStyle2}>
          {saving ? "등록 중…" : "+ 등록"}
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div
          style={{
            border: `1px solid ${C.purple}`,
            background: C.purpleBg,
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 12.5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: selectedIds.size >= 2 ? 10 : 0 }}>
            <span style={{ color: C.purpleDark, fontWeight: 600 }}>{selectedIds.size}장 선택됨</span>
            <button type="button" onClick={clearSelection} style={{ ...ghostBtnStyle, fontSize: 12, padding: "4px 12px" }}>
              선택 해제
            </button>
          </div>

          {selectedIds.size >= 2 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ color: C.inkSoft }}>이 사진 기준으로 나머지 크기 맞추기:</span>
              {Array.from(selectedIds).map((id) => {
                const sp = photos.find((x) => x.id === id);
                if (!sp) return null;
                const label = [sp.item_name, sp.color].filter(Boolean).join(" · ");
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyReferenceZoom(id)}
                    disabled={applyingZoom}
                    style={{
                      ...ghostBtnStyle,
                      fontSize: 12,
                      padding: "4px 10px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {urlById[id] && <img src={urlById[id]} alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />}
                    "{label}" 기준으로
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: C.muted, fontSize: 11 }}>직접 비율을 입력해서 맞출 수도 있어요:</span>
            <input
              type="range"
              min={50}
              max={250}
              step={5}
              value={bulkZoomValue ?? 100}
              onChange={(e) => setBulkZoomValue(Number(e.target.value))}
              style={{ width: 180 }}
            />
            <span style={{ color: C.inkSoft, minWidth: 40, display: "inline-block" }}>{bulkZoomValue ?? 100}%</span>
            <button
              type="button"
              onClick={applyBulkZoom}
              disabled={applyingZoom || bulkZoomValue == null}
              style={{ ...primaryBtnStyle2, fontSize: 12, padding: "6px 14px" }}
            >
              {applyingZoom ? "적용 중…" : "적용"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12.5, color: C.muted }}>불러오는 중…</div>
      ) : photos.length === 0 ? (
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 40, textAlign: "center", color: C.muted, fontSize: 13.5 }}>
          아직 등록된 사진이 없어요. 위에서 품목명과 사진을 등록해보세요.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {photos.map((p) => (
            <div
              key={p.id}
              draggable={editingId == null}
              onDragStart={() => handleDragStart(p.id)}
              onDragOver={(e) => handleDragOverCard(e, p.id)}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              title="끌어다 놓으면 순서를 바꿀 수 있어요"
              style={{
                border: `1px solid ${C.lineSoft}`,
                padding: 10,
                cursor: editingId == null ? "grab" : "default",
                opacity: dragId === p.id ? 0.4 : 1,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: 130,
                  background: C.panel,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 8,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  title="체크해서 다른 사진들과 크기를 맞춰요"
                  style={{ position: "absolute", top: 6, left: 6, zIndex: 2, width: 16, height: 16, cursor: "pointer" }}
                />
                {urlById[p.id] ? (
                  <img
                    src={urlById[p.id]}
                    alt={p.item_name}
                    style={{
                      maxWidth: `${(photoSizeFrac(p) * 100).toFixed(1)}%`,
                      maxHeight: `${(photoSizeFrac(p) * 100).toFixed(1)}%`,
                      objectFit: "contain",
                      transform: `scale(${(effectiveZoomPct(p) / 100).toFixed(2)})`,
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 11, color: C.muted }}>불러오는 중…</span>
                )}
              </div>
              {editingId === p.id ? (
                <div style={{ marginBottom: 8 }}>
                  <input
                    style={{ ...smallInputStyle, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="품목명"
                  />
                  <input
                    style={{ ...smallInputStyle, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
                    value={editSpec}
                    onChange={(e) => setEditSpec(e.target.value)}
                    placeholder="규격 (선택)"
                  />
                  <input
                    style={{ ...smallInputStyle, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    placeholder="색상 (선택)"
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number"
                      style={{ ...smallInputStyle, width: "100%", boxSizing: "border-box" }}
                      value={editWidth}
                      onChange={(e) => setEditWidth(e.target.value)}
                      placeholder="가로mm"
                    />
                    <input
                      type="number"
                      style={{ ...smallInputStyle, width: "100%", boxSizing: "border-box" }}
                      value={editDepth}
                      onChange={(e) => setEditDepth(e.target.value)}
                      placeholder="세로mm"
                    />
                    <input
                      type="number"
                      style={{ ...smallInputStyle, width: "100%", boxSizing: "border-box" }}
                      value={editHeight}
                      onChange={(e) => setEditHeight(e.target.value)}
                      placeholder="높이mm"
                    />
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                      사진 교체 (선택 — 그대로 두면 지금 사진이 유지돼요)
                    </div>
                    <PhotoDropZone onFile={setEditFile} fileName={editFile?.name} onClear={() => setEditFile(null)} />
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{p.item_name}</div>
                  {(p.spec || p.color || formatDims(p)) && (
                    <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
                      {[p.spec, p.color, formatDims(p)].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </>
              )}
              {editingId === p.id ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => saveEdit(p)}
                    disabled={renaming}
                    style={{ ...primaryBtnStyle2, flex: 1, fontSize: 12, padding: "6px 0" }}
                  >
                    {renaming ? "저장 중…" : "저장"}
                  </button>
                  <button type="button" onClick={cancelEdit} disabled={renaming} style={{ ...ghostBtnStyle, flex: 1, fontSize: 12 }}>
                    취소
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => startEdit(p)} style={{ ...ghostBtnStyle, flex: 1, fontSize: 12 }}>
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    disabled={deletingId === p.id}
                    style={{ ...ghostBtnStyle, flex: 1, fontSize: 12 }}
                  >
                    {deletingId === p.id ? "삭제 중…" : "삭제"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 렌탈내역 (목록 + 상세) ----------
const emptyAdvSearch = {
  fromDate: "",
  toDate: "",
  dueFromDate: "",
  dueToDate: "",
  customer: "",
  manager: "",
  voucherNo: "",
  siteName: "",
  transactionType: "",
  status: "",
};

function RentalListTab({ rentals, onRefresh, isAdmin = true, managerName = "", tonOverrides, onTonOverrideSaved, dealType }) {
  // dealType이 있으면("rental" 또는 "purchase") 그 구분에 해당하는 전표만 보여준다(렌탈내역/구매내역 메뉴 분리용).
  // 지정하지 않으면(undefined) 예전처럼 전체를 다 보여준다.
  const label = dealType === "purchase" ? "구매내역" : "렌탈내역";
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [merging, setMerging] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [downloadingFiles, setDownloadingFiles] = useState(false);
  // "무영씨엠이든 (주)무영씨엠이든 무영씨엠건축사사무소든 다 같은 회사... 체크한 후 상단에 버튼을
  // 눌러 공식명칭(사업자등록증상 상호)으로 통일" 요청 — 목록에서 체크한 건들의 거래처명을 한 번에
  // 하나의 이름으로 바꿔주는 기능. CustomerDataTab의 handleMergeCustomerGroup(사업자등록번호가 이미
  // customers 테이블에 같이 등록돼 있어야 자동으로 찾아줌)과 달리, 여기는 그 번호가 없어도 사람이
  // 직접 보고 골라 체크한 건들을 그대로 원하는 이름으로 바꿀 수 있어 더 즉각적으로 쓸 수 있다.
  const [showMergeCustomerName, setShowMergeCustomerName] = useState(false);
  const [mergeCustomerNameInput, setMergeCustomerNameInput] = useState("");
  const [mergingCustomerName, setMergingCustomerName] = useState(false);
  const [showAdvSearch, setShowAdvSearch] = useState(false);
  const [advSearch, setAdvSearch] = useState(emptyAdvSearch);
  const [appliedAdv, setAppliedAdv] = useState(emptyAdvSearch);
  // 목록 표의 열(컬럼) 제목을 눌러서 정렬하는 기능(구매내역/렌탈내역 공용 — 이 컴포넌트를 그대로 재사용하기 때문).
  // sortKey가 없으면 예전처럼 배송일자 최신순(기본 순서) 그대로 보여준다.
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"
  const RENTAL_LIST_STATUS_RANK = { overdue: 0, soon: 1, normal: 2, collected: 3, purchase: 4 };
  const sortAccessors = {
    전표번호: (g) => g.voucherNo || "",
    거래처: (g) => g.head.customer || "",
    현장명: (g) => g.head.site_name || "",
    담당자: (g) => g.head.manager || "",
    배송일자: (g) => g.head.out_date || "",
    렌탈개시일: (g) => g.head.out_date || "",
    렌탈만료일: (g) => g.head.due_date || "",
    금액: (g) => g.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    상태: (g) => {
      const s = getStatus({ transaction_type: g.head.transaction_type, collected: g.rows.every((r) => r.collected), due_date: g.head.due_date });
      return RENTAL_LIST_STATUS_RANK[s] ?? 9;
    },
  };
  const handleSortClick = (label) => {
    if (!sortAccessors[label]) return;
    if (sortKey === label) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(label);
      setSortDir("asc");
    }
  };

  // "거래처 현장명 등 구분값 사이사이 간격조절 기능 넣어줘" 요청 — 예전엔 칸 너비가 rentalListGrid로
  // 고정돼 있어서(거래처·현장명처럼 긴 이름이 있으면 줄바꿈되며 줄이 늘어났었다), 업체별데이터·판매현황
  // 등 다른 표에서 이미 쓰고 있던 useResizableColumns(헤더 칸 오른쪽 끝을 마우스로 끌어서 너비를
  // 조절하는 공용 기능)를 여기도 그대로 적용한다. 순서는 예전 rentalListGrid와 동일하게 전표번호·거래처·
  // 현장명·담당자·배송일자·품목·렌탈기간·렌탈개시일·렌탈만료일·금액·상태 11칸이고, 시작 너비도 예전
  // 고정폭과 같게 맞췄다(품목 칸만 원래 1fr로 남는 공간을 다 썼던 걸 220px 고정값으로 바꿨다 — 너비
  // 조절 기능 자체가 "1fr(가변)"과는 같이 쓸 수 없어서, 필요하면 이 칸도 손잡이로 늘리면 된다).
  const [colWidths, startResize] = useResizableColumns([120, 110, 120, 90, 100, 220, 90, 100, 100, 110, 90]);
  const rentalListGridResizable = "28px " + colWidths.map((w) => `${w}px`).join(" ");

  const toggleCheck = (key) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groups = useMemo(() => {
    let g = groupRentalsByVoucher(rentals);
    if (dealType) g = g.filter((x) => (x.head.transaction_type || "rental") === dealType);
    g.sort((a, b) => (b.head.out_date || "").localeCompare(a.head.out_date || "") || (b.voucherNo || "").localeCompare(a.voucherNo || ""));
    return g;
  }, [rentals, dealType]);

  const advActive = Object.values(appliedAdv).some((v) => v);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = groups;

    if (q) {
      list = list.filter((g) =>
        [g.voucherNo, g.head.customer, g.head.site_name, g.head.manager, ...g.rows.map((r) => r.item)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    const a = appliedAdv;
    if (a.fromDate) list = list.filter((g) => g.head.out_date && g.head.out_date >= a.fromDate);
    if (a.toDate) list = list.filter((g) => g.head.out_date && g.head.out_date <= a.toDate);
    if (a.dueFromDate) list = list.filter((g) => g.head.due_date && g.head.due_date >= a.dueFromDate);
    if (a.dueToDate) list = list.filter((g) => g.head.due_date && g.head.due_date <= a.dueToDate);
    if (a.customer) list = list.filter((g) => (g.head.customer || "").toLowerCase().includes(a.customer.toLowerCase()));
    if (a.manager) list = list.filter((g) => (g.head.manager || "").toLowerCase().includes(a.manager.toLowerCase()));
    if (a.voucherNo) list = list.filter((g) => (g.voucherNo || "").toLowerCase().includes(a.voucherNo.toLowerCase()));
    if (a.siteName) list = list.filter((g) => (g.head.site_name || "").toLowerCase().includes(a.siteName.toLowerCase()));
    if (a.transactionType) list = list.filter((g) => g.head.transaction_type === a.transactionType);
    if (a.status) {
      list = list.filter((g) => {
        const status = getStatus({
          transaction_type: g.head.transaction_type,
          collected: g.rows.every((r) => r.collected),
          due_date: g.head.due_date,
        });
        return status === a.status;
      });
    }

    return list;
  }, [groups, query, appliedAdv]);

  // 열 제목을 눌러 정렬을 지정했으면 그 기준으로, 아니면 원래 순서(배송일자 최신순)를 그대로 유지한다.
  const sortedFiltered = useMemo(() => {
    if (!sortKey || !sortAccessors[sortKey]) return filtered;
    const acc = sortAccessors[sortKey];
    const list = [...filtered];
    list.sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      let cmp;
      if (typeof va === "number" || typeof vb === "number") cmp = (Number(va) || 0) - (Number(vb) || 0);
      else cmp = String(va).localeCompare(String(vb), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const applyAdvSearch = () => setAppliedAdv(advSearch);
  const resetAdvSearch = () => {
    setAdvSearch(emptyAdvSearch);
    setAppliedAdv(emptyAdvSearch);
  };

  const selected = groups.find((g) => g.key === selectedKey) || null;

  const visibleKeys = sortedFiltered.map((g) => g.key);
  const allChecked = visibleKeys.length > 0 && visibleKeys.every((k) => checkedKeys.has(k));
  const someChecked = visibleKeys.some((k) => checkedKeys.has(k));

  // 체크한 건들에 실제로 쓰인 거래처명들(중복 제거) — 여러 표기가 섞여 있으면 그대로 보여주고,
  // 새로 입력할 이름칸의 기본값은 그중 가장 긴 이름(보통 "무영씨엠건축사사무소"처럼 정식 상호가
  // 더 길다)으로 미리 채워준다.
  const checkedDistinctCustomers = useMemo(() => {
    const set = new Set();
    for (const g of groups) {
      if (checkedKeys.has(g.key)) {
        const c = (g.head.customer || "").trim();
        if (c) set.add(c);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [groups, checkedKeys]);
  const selectAllRef = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);

  const toggleSelectAll = () => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (allChecked) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  if (selected) {
    return (
      <RentalDetailPanel
        group={selected}
        onClose={() => setSelectedKey(null)}
        onSaved={() => {
          onRefresh();
          setSelectedKey(null);
        }}
        isAdmin={isAdmin}
        managerName={managerName}
        tonOverrides={tonOverrides}
        onTonOverrideSaved={onTonOverrideSaved}
      />
    );
  }

  async function handleMerge() {
    const chosen = groups.filter((g) => checkedKeys.has(g.key));
    if (chosen.length < 2) return;
    if (!confirm(`선택한 ${chosen.length}건을 하나의 전표로 합칠까요? (같은 전표번호로 묶여서 목록에 한 줄로 표시돼요)`)) return;
    setMerging(true);
    const allIds = chosen.flatMap((g) => g.rows.map((r) => r.id));
    const voucherNo = nextVoucherNo(rentals);
    const { error } = await supabase.from("rentals").update({ voucher_no: voucherNo }).in("id", allIds);
    setMerging(false);
    if (error) {
      alert("합치는 중 오류가 발생했어요: " + error.message);
      return;
    }
    setCheckedKeys(new Set());
    onRefresh();
  }

  // "무영씨엠이든 (주)무영씨엠이든... 체크박스 체크한 후 상단 버튼을 누르면 공식명칭으로 통일" 요청 —
  // 체크한 건들의 거래처명을 입력한 이름 하나로 한꺼번에 바꾼다.
  async function handleMergeCustomerName() {
    const finalName = mergeCustomerNameInput.trim();
    if (!finalName) return;
    const chosen = groups.filter((g) => checkedKeys.has(g.key));
    if (chosen.length === 0) return;
    const otherNames = checkedDistinctCustomers.filter((n) => n !== finalName);
    if (
      !confirm(
        `선택한 ${chosen.length}건의 거래처명을 전부 "${finalName}"(으)로 통일할까요?` +
          (otherNames.length > 0 ? `\n("${otherNames.join(", ")}" 표기도 전부 이 이름으로 바뀌어요)` : "") +
          `\n렌탈내역·구매내역·업체별데이터 등 모든 화면에 반영돼요.`
      )
    )
      return;
    setMergingCustomerName(true);
    const allIds = chosen.flatMap((g) => g.rows.map((r) => r.id));
    const { error } = await supabase.from("rentals").update({ customer: finalName }).in("id", allIds);
    if (error) {
      setMergingCustomerName(false);
      alert("거래처명 통합 중 오류가 발생했어요: " + error.message);
      return;
    }
    // customers 테이블(견적서 업로드 시 저장돼두는 거래처별 정보)에 예전 이름으로 남은 등록도 함께
    // 정리해서, 다음에 같은 거래처를 입력할 때 다시 예전 이름으로 자동완성되지 않게 한다(실패해도
    // 위 렌탈내역 통합 자체는 이미 끝났으므로 그냥 넘어간다).
    if (otherNames.length > 0) {
      await supabase.from("customers").delete().in("name", otherNames);
    }
    setMergingCustomerName(false);
    setShowMergeCustomerName(false);
    setMergeCustomerNameInput("");
    setCheckedKeys(new Set());
    onRefresh();
  }

  async function handleDeleteSelected() {
    const chosen = groups.filter((g) => checkedKeys.has(g.key));
    if (chosen.length === 0) return;
    const totalRows = chosen.reduce((s, g) => s + g.rows.length, 0);
    if (!confirm(`선택한 전표 ${chosen.length}건(품목 ${totalRows}개)을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setDeletingSelected(true);
    const allIds = chosen.flatMap((g) => g.rows.map((r) => r.id));
    const { error } = await supabase.from("rentals").delete().in("id", allIds);
    setDeletingSelected(false);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    setCheckedKeys(new Set());
    onRefresh();
  }

  async function handleDownloadSelectedFiles() {
    const chosen = groups.filter((g) => checkedKeys.has(g.key));
    if (chosen.length === 0) return;
    const withFiles = chosen.filter((g) => g.head.source_file_path);
    const noFileCount = chosen.length - withFiles.length;
    if (withFiles.length === 0) {
      alert("선택한 전표 중 원본 파일이 저장된 건이 없어요. (견적서 업로드로 새로 등록한 전표부터 원본 파일이 저장돼요)");
      return;
    }
    setDownloadingFiles(true);
    for (const g of withFiles) {
      const { data, error } = await supabase.storage.from("quote-files").download(g.head.source_file_path);
      if (error || !data) continue;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = g.head.source_file_name || `원본파일_${g.voucherNo || ""}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await new Promise((r) => setTimeout(r, 400));
    }
    setDownloadingFiles(false);
    if (noFileCount > 0) {
      alert(`${noFileCount}건은 원본 파일이 없어 다운로드에서 제외됐어요. (견적서 업로드로 새로 등록한 전표부터 원본 파일이 저장돼요)`);
    }
  }

  const totalAmount = filtered.reduce((s, g) => s + g.amount, 0);

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        전표번호를 클릭하면 세부 내역을 확인·수정할 수 있어요. (견적서 업로드로 등록된 전표 기준{dealType === "purchase" ? " · 구매 건만" : dealType === "rental" ? " · 렌탈 건만" : ""})
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input
          placeholder="거래처, 현장명, 담당자, 전표번호, 품목 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, width: 320 }}
        />
        <button onClick={() => setShowAdvSearch((v) => !v)} style={advActive ? { ...ghostBtnStyle, borderColor: C.ink, color: C.ink } : ghostBtnStyle}>
          상세검색{advActive ? " ●" : ""} {showAdvSearch ? "▲" : "▼"}
        </button>
      </div>

      {showAdvSearch && (
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 18, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <Field label="배송일자(시작)">
              <input type="date" style={inputStyle} value={advSearch.fromDate} onChange={(e) => setAdvSearch({ ...advSearch, fromDate: e.target.value })} />
            </Field>
            <Field label="배송일자(종료)">
              <input type="date" style={inputStyle} value={advSearch.toDate} onChange={(e) => setAdvSearch({ ...advSearch, toDate: e.target.value })} />
            </Field>
            {!dealType && (
              <Field label="구분">
                <select style={inputStyle} value={advSearch.transactionType} onChange={(e) => setAdvSearch({ ...advSearch, transactionType: e.target.value })}>
                  <option value="">전체</option>
                  <option value="rental">렌탈</option>
                  <option value="purchase">구매</option>
                </select>
              </Field>
            )}
            <Field label="렌탈만료일(시작)">
              <input type="date" style={inputStyle} value={advSearch.dueFromDate} onChange={(e) => setAdvSearch({ ...advSearch, dueFromDate: e.target.value })} />
            </Field>
            <Field label="렌탈만료일(종료)">
              <input type="date" style={inputStyle} value={advSearch.dueToDate} onChange={(e) => setAdvSearch({ ...advSearch, dueToDate: e.target.value })} />
            </Field>
            <Field label="상태">
              <select style={inputStyle} value={advSearch.status} onChange={(e) => setAdvSearch({ ...advSearch, status: e.target.value })}>
                <option value="">전체</option>
                <option value="normal">정상</option>
                <option value="soon">반납임박</option>
                <option value="overdue">연체</option>
                <option value="collected">회수완료</option>
                <option value="purchase">구매완료</option>
              </select>
            </Field>
            <Field label="거래처">
              <input style={inputStyle} value={advSearch.customer} onChange={(e) => setAdvSearch({ ...advSearch, customer: e.target.value })} />
            </Field>
            <Field label="현장명">
              <input style={inputStyle} value={advSearch.siteName} onChange={(e) => setAdvSearch({ ...advSearch, siteName: e.target.value })} />
            </Field>
            <Field label="담당자">
              <input style={inputStyle} value={advSearch.manager} onChange={(e) => setAdvSearch({ ...advSearch, manager: e.target.value })} />
            </Field>
            <Field label="전표번호">
              <input style={inputStyle} value={advSearch.voucherNo} onChange={(e) => setAdvSearch({ ...advSearch, voucherNo: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={applyAdvSearch} style={primaryBtnStyle2}>검색</button>
            <button onClick={resetAdvSearch} style={ghostBtnStyle}>초기화</button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 10 }}>
        검색결과 {filtered.length}건 · 합계 {fmtWon(totalAmount)}
      </div>

      {checkedKeys.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "8px 12px", background: C.amberBg, fontSize: 12.5 }}>
          <div>{checkedKeys.size}건 선택됨</div>
          {checkedKeys.size < 2 && <div style={{ color: C.muted }}>(2건 이상 선택하면 하나로 묶을 수 있어요)</div>}
          <button onClick={handleMerge} disabled={checkedKeys.size < 2 || merging} style={miniBtnStylePrimary}>
            {merging ? "합치는 중…" : "선택한 건 하나의 전표로 묶기"}
          </button>
          <button onClick={handleDownloadSelectedFiles} disabled={downloadingFiles} style={miniBtnStyle}>
            {downloadingFiles ? "다운로드 중…" : "원본 파일 다운로드"}
          </button>
          {/* "무영씨엠이든 (주)무영씨엠이든 무영씨엠건축사사무소든 다 같은 회사... 체크박스 체크한 후
              상단에 버튼을 하나 넣어주고 누르면 공식명칭(사업자등록증상 상호)으로 변환되어 같은 회사로
              인지되는 기능" 요청. */}
          <button
            onClick={() => {
              const longest = checkedDistinctCustomers.reduce((best, n) => (n.length > (best || "").length ? n : best), "");
              setMergeCustomerNameInput(longest);
              setShowMergeCustomerName(true);
            }}
            style={miniBtnStyle}
            title="체크한 건들의 거래처명(표기가 서로 달라도)을 하나의 공식 명칭으로 통일해요"
          >
            거래처명 통합
          </button>
          <button onClick={handleDeleteSelected} disabled={deletingSelected} style={{ ...miniBtnStyle, borderColor: C.brick, color: C.brick }}>
            {deletingSelected ? "삭제 중…" : "선택 삭제"}
          </button>
          <button
            onClick={() => {
              setCheckedKeys(new Set());
              setShowMergeCustomerName(false);
              setMergeCustomerNameInput("");
            }}
            style={miniBtnStyle}
          >
            선택 해제
          </button>
        </div>
      )}

      {checkedKeys.size > 0 && showMergeCustomerName && (
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 8 }}>
            선택한 {checkedKeys.size}건에 쓰인 거래처명: {checkedDistinctCustomers.join(", ") || "(없음)"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="통일할 공식 명칭(사업자등록증상 상호)을 입력하세요"
              value={mergeCustomerNameInput}
              onChange={(e) => setMergeCustomerNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleMergeCustomerName(); }}
              style={{ ...inputStyle, width: 320 }}
              autoFocus
            />
            <button
              onClick={handleMergeCustomerName}
              disabled={!mergeCustomerNameInput.trim() || mergingCustomerName}
              style={miniBtnStylePrimary}
            >
              {mergingCustomerName ? "통합하는 중…" : "이 이름으로 통합"}
            </button>
            <button onClick={() => setShowMergeCustomerName(false)} style={miniBtnStyle}>취소</button>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            선택한 {checkedKeys.size}건 전부의 거래처명이 이 이름으로 바뀌어요(렌탈내역·구매내역·업체별데이터 등 모든 화면에 반영).
          </div>
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: rentalListGridResizable,
            gap: 8,
            padding: "10px 14px",
            fontSize: 11.5,
            color: C.muted,
            borderBottom: `1px solid ${C.line}`,
            minWidth: 1100,
          }}
        >
          <div>
            <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleSelectAll} />
          </div>
          {["전표번호", "거래처", "현장명", "담당자", "배송일자", "품목", "렌탈기간", "렌탈개시일", "렌탈만료일", "금액", "상태"].map((label, i) => (
            <div key={label} style={{ position: "relative" }}>
              {sortAccessors[label] ? (
                <button
                  type="button"
                  onClick={() => handleSortClick(label)}
                  title="눌러서 정렬"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    fontSize: 11.5,
                    color: sortKey === label ? C.ink : C.muted,
                    fontWeight: sortKey === label ? 700 : 400,
                  }}
                >
                  {label}
                  <span style={{ fontSize: 9, opacity: sortKey === label ? 1 : 0.35 }}>{sortKey === label ? (sortDir === "asc" ? "▲" : "▼") : "▲"}</span>
                </button>
              ) : (
                label
              )}
              <ColResizeHandle onMouseDown={startResize(i)} />
            </div>
          ))}
        </div>

        {sortedFiltered.map((g) => {
          const status = getStatus({
            transaction_type: g.head.transaction_type,
            collected: g.rows.every((r) => r.collected),
            due_date: g.head.due_date,
          });
          const meta = STATUS_META[status];
          const first = g.rows[0];
          const extra = g.rows.length - 1;
          return (
            <div
              key={g.key}
              style={{
                display: "grid",
                gridTemplateColumns: rentalListGridResizable,
                gap: 8,
                padding: "12px 14px",
                fontSize: 13,
                alignItems: "center",
                borderBottom: `1px solid ${C.lineSoft}`,
                minWidth: 1100,
              }}
            >
              <div>
                <input type="checkbox" checked={checkedKeys.has(g.key)} onChange={() => toggleCheck(g.key)} />
              </div>
              <button
                onClick={() => setSelectedKey(g.key)}
                style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
              >
                {g.voucherNo || "(번호없음)"}
              </button>
              <div>{g.head.customer || "-"}</div>
              <div style={{ color: C.inkSoft, fontSize: 12.5 }}>{g.head.site_name || "-"}</div>
              <div>{g.head.manager || "-"}</div>
              <div style={{ fontSize: 12.5 }}>{g.head.out_date || "-"}</div>
              <div>
                {first.item}
                {extra > 0 ? ` 외 ${extra}건` : ""}
              </div>
              <div>{g.head.period_months ? `${g.head.period_months}개월` : g.head.period_days ? `${g.head.period_days}일` : "-"}</div>
              <div style={{ fontSize: 12.5 }}>{g.head.out_date || "-"}</div>
              <div style={{ fontSize: 12.5 }}>{g.head.due_date || "-"}</div>
              <div style={{ fontSize: 12.5 }}>{fmtWon(g.amount)}</div>
              <div>
                <span style={{ fontSize: 11.5, padding: "3px 9px", background: meta.bg, color: meta.fg }}>{meta.label}</span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>등록된 렌탈 내역이 없어요.</div>
        )}
      </div>
    </div>
  );
}

function RentalDetailPanel({ group, onClose, onSaved, isAdmin = true, managerName = "", tonOverrides, onTonOverrideSaved, hideInsteadOfDelete = false }) {
  const [header, setHeader] = useState(() => ({
    voucherNo: group.head.voucher_no || "",
    transactionType: group.head.transaction_type || "rental",
    manager: group.head.manager || "",
    customer: group.head.customer || "",
    refContact: group.head.ref_contact || "",
    email: group.head.email || "",
    // 옛날에 등록되어 출하창고 값이 비어있는 전표는 구분(렌탈/구매)에 맞춰 자동으로 채워준다.
    warehouse: group.head.warehouse || autoWarehouseFor(group.head.transaction_type || "rental", ""),
    dealType: group.head.deal_type || "",
    outDate: group.head.out_date || "",
    periodMonths: group.head.period_months || "",
    dueDate: group.head.due_date || "",
    currency: "내자",
    siteName: group.head.site_name || "",
    // site_address가 없는(이 기능 추가 전에 등록된) 옛 전표는 site(현장/구역) 값을 그대로 보여준다.
    siteAddress: group.head.site_address || group.head.site || "",
    project: group.head.project || "",
    taxInvoice: group.head.tax_invoice || "",
    recipient: group.head.recipient || "",
  }));
  const [items, setItems] = useState(() =>
    group.rows.map((r) => ({ id: r.id, item: r.item, spec: r.spec, qty: r.qty, unit_price: r.unit_price, amount: r.amount, note: r.note }))
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [colWidths, startResize] = useResizableColumns([180, 140, 55, 90, 100, 80, 180, 100]);
  const itemsGridTemplate = "28px " + colWidths.map((w) => `${w}px`).join(" ");
  const [checkedItemIdxs, setCheckedItemIdxs] = useState(new Set());

  const update = (patch) => setHeader((h) => ({ ...h, ...patch }));
  const updateItem = (idx, patch) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    setItems(next);
  };
  // 아직 저장 전이라 실제 id가 없는 새 품목 행을 구분하기 위한 임시 키(화면 표시용, 저장에는 안 쓰임).
  const tempKeyRef = useRef(0);
  const nextTempKey = () => {
    tempKeyRef.current += 1;
    return `new-${tempKeyRef.current}`;
  };
  const blankItem = () => ({ id: null, _tempKey: nextTempKey(), item: "", spec: "", qty: 1, unit_price: null, amount: null, note: "" });
  const addItem = () => setItems([...items, blankItem()]);
  // 특정 품목 "다음 줄"에 새 품목을 끼워넣는다(중역책상과 사무책상 사이처럼, 목록 중간에도 추가할 수 있도록).
  const insertItemAfter = (idx) => {
    const next = [...items];
    next.splice(idx + 1, 0, blankItem());
    setItems(next);
    setCheckedItemIdxs(new Set());
  };
  // 품목 순서를 위/아래로 한 칸씩 옮긴다. 저장 시 이 화면에 보이는 순서 그대로 저장되므로(line_no), 다음에 다시 열어도 같은 순서로 보인다.
  const moveItem = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next);
    setCheckedItemIdxs(new Set());
  };
  // 품목명 가나다순으로 한 번에 정렬(직접 위/아래로 옮기지 않아도 되도록). 정렬 후에도 위/아래 버튼으로 다시 미세조정 가능.
  const sortItemsAlpha = () => {
    setItems(
      [...items].sort((a, b) => (a.item || "").localeCompare(b.item || "", "ko") || (a.spec || "").localeCompare(b.spec || "", "ko"))
    );
    setCheckedItemIdxs(new Set());
  };
  // 품목 내역 표의 열 제목을 눌러서 정렬하는 기능(렌탈내역/자동등록 목록과 같은 방식). 이 표는 입력칸이라
  // 화면 표시만 따로 바꾸지 않고, "가나다순 정렬"처럼 실제 items 배열 순서 자체를 바꾼다(그래야 각 입력칸이
  // 계속 올바른 품목을 가리킨다). 저장하면 이 순서 그대로 line_no에 반영된다.
  const [itemSortKey, setItemSortKey] = useState(null);
  const [itemSortDir, setItemSortDir] = useState("asc");
  const itemSortAccessors = {
    "품목명": (it) => it.item || "",
    "규격": (it) => it.spec || "",
    "수량": (it) => Number(it.qty) || 0,
    "단가": (it) => Number(it.unit_price) || 0,
    "공급가액": (it) => Number(it.amount) || 0,
    "부가세": (it) => Math.round((Number(it.amount) || 0) * 0.1),
    "적요": (it) => it.note || "",
    "합계": (it) => (Number(it.amount) || 0) + Math.round((Number(it.amount) || 0) * 0.1),
  };
  const handleItemSortClick = (label) => {
    const accessor = itemSortAccessors[label];
    if (!accessor) return;
    const nextDir = itemSortKey === label && itemSortDir === "asc" ? "desc" : "asc";
    setItemSortKey(label);
    setItemSortDir(nextDir);
    setItems((prev) => {
      const list = [...prev];
      list.sort((a, b) => {
        const va = accessor(a);
        const vb = accessor(b);
        let cmp;
        if (typeof va === "number" || typeof vb === "number") cmp = (Number(va) || 0) - (Number(vb) || 0);
        else cmp = String(va).localeCompare(String(vb), "ko");
        return nextDir === "asc" ? cmp : -cmp;
      });
      return list;
    });
    setCheckedItemIdxs(new Set());
  };
  const toggleItemChecked = (idx) => {
    setCheckedItemIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  const toggleItemCheckedAll = () => {
    setCheckedItemIdxs((prev) => (prev.size === items.length ? new Set() : new Set(items.map((_, i) => i))));
  };
  // 체크박스로 선택한 품목만(헤더의 "전체선택" 체크박스로 전부 선택한 경우도 포함) 엑셀로 내려받는다.
  const [exportingItems, setExportingItems] = useState(false);
  async function handleExportCheckedItemsExcel() {
    if (checkedItemIdxs.size === 0) return;
    setExportingItems(true);
    const XLSX = await import("xlsx");
    const checked = items.filter((_, i) => checkedItemIdxs.has(i));
    const rows = checked.map((it) => {
      const vat = Math.round((Number(it.amount) || 0) * 0.1);
      return [
        it.item || "",
        it.spec || "",
        Number(it.qty) || 0,
        Number(it.unit_price) || 0,
        Number(it.amount) || 0,
        vat,
        it.note || "",
        (Number(it.amount) || 0) + vat,
      ];
    });
    const header2 = ["품목명", "규격", "수량", "단가", "공급가액", "부가세", "적요", "합계"];
    const aoa = [
      [`${header.voucherNo || "전표"} 품목 내역`],
      [`거래처: ${header.customer || ""}  현장명: ${header.siteName || ""}`],
      [`추출일: ${todayISO()}`],
      [],
      header2,
      ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 13 }, { wch: 11 }, { wch: 16 }, { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "품목 내역");
    XLSX.writeFile(wb, `${header.voucherNo || "전표"}_품목내역_${todayISO()}.xlsx`);
    setExportingItems(false);
  }

  const handleDeleteSelectedItems = () => {
    if (checkedItemIdxs.size === 0) return;
    const msg = hideInsteadOfDelete
      ? `선택한 ${checkedItemIdxs.size}개 품목을 제외할까요?\n저장하면 렌탈내역 원본은 그대로 두고 이 화면에서만 안 보이게 됩니다.`
      : `선택한 ${checkedItemIdxs.size}개 품목을 삭제할까요?`;
    if (!confirm(msg)) return;
    setItems(items.filter((_, i) => !checkedItemIdxs.has(i)));
    setCheckedItemIdxs(new Set());
  };

  const totalAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const isRental = header.transactionType === "rental";

  // 화물차 적재 톤수(기준표 + 저장된 커스텀 값 기준)와 미확인 품목 수. 상단에 바로 보이게 계산해둔다.
  // localTonOverrides: 이 화면에서 방금 "저장"한 값을, 상위 화면의 tonOverrides가 다시 불러와지기 전까지
  // 바로 반영해서 보여주기 위한 임시 값(ton_overrides 저장은 물론 별도로 함).
  const [localTonOverrides, setLocalTonOverrides] = useState([]);
  const effectiveTonOverrides = useMemo(() => [...(tonOverrides || []), ...localTonOverrides], [tonOverrides, localTonOverrides]);
  const itemsWithTon = useMemo(() => withComputedTons(items, effectiveTonOverrides, header.siteAddress), [items, effectiveTonOverrides, header.siteAddress]);
  const tonApplicableItems = itemsWithTon.filter((it) => !it.tonExcluded);
  const tonKnownItems = tonApplicableItems.filter((it) => it.ton != null);
  const totalTon = tonKnownItems.reduce((s, it) => s + Number(it.ton), 0);
  const missingTonCount = tonApplicableItems.length - tonKnownItems.length;
  const [tonDetailOpen, setTonDetailOpen] = useState(false);
  const [tonEdits, setTonEdits] = useState({}); // idx -> 사용자가 직접 고친 톤수(저장 전 임시 편집값)
  const [savingTonIdx, setSavingTonIdx] = useState(null);

  // "배송비 옆에 품목별데이터 버튼 넣어주고 체크박스·선택삭제·소팅·출력기능까지 넣어주는데, 실제 출력물은
  // 업체별데이터(CustomerDataTab)의 "품목별 수량 통계"와 똑같은 방식으로" 요청 — 그 화면에서 이미 잘 쓰고
  // 있던 체크박스 선택삭제·소팅·인쇄 방식을 그대로 옮겨오되, 여러 전표를 모은 게 아니라 지금 이 전표 하나의
  // 품목(items)만 기준으로 합산한다. (엑셀로 출력 버튼은 이 인쇄 기능과 헷갈릴 수 있어서 뺐다 — "선택
  // 엑셀출력"은 품목 내역 표에 있던 기존 기능이라 그대로 남아있다.)
  const [itemStatsOpen, setItemStatsOpen] = useState(false);

  // 품목/규격/총수량 머리글을 눌러 정렬 기준·방향을 바꿀 수 있게 한다(기본은 총수량 많은순 — CustomerDataTab과 동일).
  const [itemStatSortKey, setItemStatSortKey] = useState("qty"); // "item" | "spec" | "qty"
  const [itemStatSortDir, setItemStatSortDir] = useState("desc"); // "asc" | "desc"
  function toggleItemStatSort(key) {
    if (itemStatSortKey === key) {
      setItemStatSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setItemStatSortKey(key);
      setItemStatSortDir("asc");
    }
  }

  // 같은 품목명+규격끼리 수량을 합산한다. 업체별데이터의 "품목별 수량 통계"와 똑같이, 배송비·설치비 등도
  // (그 자체가 하나의 품목행으로 들어와 있다면) 그대로 포함한다 — 톤수 계산용 tonExcluded와는 무관한 화면이다.
  const rawItemStats = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const itemName = (it.item || "").trim() || "(품목명 없음)";
      const specName = (it.spec || "").trim();
      const key = `${itemName}〓${specName}`;
      if (!map.has(key)) map.set(key, { key, item: itemName, spec: specName, qty: 0 });
      map.get(key).qty += Number(it.qty) || 0;
    }
    return Array.from(map.values());
  }, [items]);

  // 이 출력물에서만 숨긴 품목 — 전표별로 구분해서 저장한다(다른 전표에 영향 없이, 이 컴퓨터·이 브라우저에서만 유지).
  // 업체별데이터의 "품목별 수량 통계"에서 이미 쓰던 저장 방식(getHiddenItemStatKeys/setHiddenItemStatKeys)을 그대로 재사용한다.
  const [hiddenItemStatKeysState, setHiddenItemStatKeysState] = useState(() => new Set(getHiddenItemStatKeys(group.key)));
  const [checkedItemStatKeys, setCheckedItemStatKeys] = useState(new Set());

  const itemStats = useMemo(() => {
    const arr = rawItemStats.filter((r) => !hiddenItemStatKeysState.has(r.key));
    const dir = itemStatSortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (itemStatSortKey === "qty") return (a.qty - b.qty) * dir;
      const av = itemStatSortKey === "item" ? a.item : a.spec;
      const bv = itemStatSortKey === "item" ? b.item : b.spec;
      return (av || "").localeCompare(bv || "", "ko") * dir;
    });
    return arr;
  }, [rawItemStats, hiddenItemStatKeysState, itemStatSortKey, itemStatSortDir]);
  const itemStatsTotalQty = itemStats.reduce((s, r) => s + r.qty, 0);
  const hiddenItemStatCount = rawItemStats.filter((r) => hiddenItemStatKeysState.has(r.key)).length;

  function toggleItemStatChecked(key) {
    setCheckedItemStatKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleItemStatCheckedAll() {
    setCheckedItemStatKeys((prev) => (prev.size === itemStats.length ? new Set() : new Set(itemStats.map((r) => r.key))));
  }
  // 선택한 품목을 "이 출력물에서만" 숨긴다. items(품목 내역 표)는 전혀 건드리지 않는다.
  function handleDeleteSelectedItemStats() {
    const chosen = itemStats.filter((r) => checkedItemStatKeys.has(r.key));
    if (chosen.length === 0) return;
    if (!confirm(`선택한 품목 ${chosen.length}종을 이 "품목별 수량 통계" 출력물에서만 숨길까요?\n(품목 내역 표의 원본 데이터에는 전혀 영향을 주지 않아요)`)) return;
    const next = new Set(hiddenItemStatKeysState);
    for (const r of chosen) next.add(r.key);
    setHiddenItemStatKeysState(next);
    setHiddenItemStatKeys(group.key, Array.from(next));
    setCheckedItemStatKeys(new Set());
  }
  function handleRestoreHiddenItemStats() {
    setHiddenItemStatKeysState(new Set());
    setHiddenItemStatKeys(group.key, []);
  }
  // 인쇄/PDF 저장 시 브라우저 상단에 뜨는 문서 제목을 잠깐 "품목별 수량통계"로 바꿔서, 인쇄 머리글과
  // "PDF로 저장" 시 기본 파일명이 모두 "품목별 수량통계"가 되게 한다(업체별데이터와 동일한 방식).
  function handlePrintItemStats() {
    const prevTitle = document.title;
    document.title = "품목별 수량통계";
    const restoreTitle = () => {
      document.title = prevTitle;
    };
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.print();
    setTimeout(restoreTitle, 2000);
  }

  // 이 품목(품목명+규격)의 톤수를 다음부터 자동으로 채워지도록 ton_overrides에 저장한다.
  // 같은 품목+규격을 가진 다른 전표/품목에도 바로 반영된다(ImportPreview의 저장 기능과 동일한 원리).
  async function saveTonOverride(idx) {
    const it = itemsWithTon[idx];
    const editedTon = tonEdits[idx];
    const ton = editedTon !== undefined ? (editedTon === "" ? null : Number(editedTon)) : it.ton;
    if (ton == null || !it.qty) {
      alert("톤수와 수량을 먼저 입력해주세요.");
      return;
    }
    if (!(it.item || "").trim() || !(it.spec || "").trim()) {
      alert("품목명과 규격이 있어야 저장할 수 있어요.");
      return;
    }
    setSavingTonIdx(idx);
    const per = Math.round((Number(ton) / Number(it.qty)) * 1000000) / 1000000;
    const { error } = await supabase
      .from("ton_overrides")
      .upsert({ item: it.item.trim(), spec: it.spec.trim(), per }, { onConflict: "item,spec" });
    setSavingTonIdx(null);
    if (error) {
      alert("저장하지 못했어요: " + error.message);
      return;
    }
    setLocalTonOverrides((prev) => [...prev.filter((r) => !(r.item === it.item.trim() && r.spec === it.spec.trim())), { item: it.item.trim(), spec: it.spec.trim(), per }]);
    setTonEdits((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    onTonOverrideSaved && onTonOverrideSaved();
    alert("저장했어요. 다음부터 이 품목은 자동으로 채워져요.");
  }

  async function handleSave() {
    if (!header.customer) {
      alert("거래처를 입력해주세요.");
      return;
    }
    if (items.length === 0) {
      alert("품목이 최소 1개 이상 있어야 해요.");
      return;
    }
    setSaving(true);

    const headerPatch = {
      transaction_type: header.transactionType,
      manager: header.manager,
      customer: header.customer,
      ref_contact: header.refContact,
      email: header.email,
      warehouse: header.warehouse,
      deal_type: header.dealType,
      out_date: header.outDate,
      period_months: header.periodMonths || null,
      period_days: header.periodMonths ? Number(header.periodMonths) * 30 : null,
      due_date: header.dueDate,
      site_name: header.siteName,
      // 품목별 "현장/구역"(site) 칼럼은 건드리지 않는다 — 예전엔 여기서 같이 덮어써서 저장할 때마다
      // 전 품목의 현장/구역 값이 배송지 주소 하나로 통일돼버리는 문제가 있었다.
      site_address: header.siteAddress,
      project: header.project,
      tax_invoice: header.taxInvoice,
      recipient: header.recipient,
      voucher_no: header.voucherNo || null,
    };

    const originalIds = group.rows.map((r) => r.id);
    const currentIds = items.filter((it) => it.id).map((it) => it.id);
    const removedIds = originalIds.filter((id) => !currentIds.includes(id));

    if (removedIds.length > 0) {
      // hideInsteadOfDelete가 켜진 화면(예: 자동등록)에서는 렌탈내역 원본(rentals)을 절대 지우지 않고,
      // 이 화면에서만 안 보이게 숨김 처리한다(자동등록의 "선택 제외"와 동일한 방식).
      if (hideInsteadOfDelete) {
        const { error } = await supabase
          .from("ledger_auto_hidden_rentals")
          .upsert(removedIds.map((id) => ({ rental_id: id })), { onConflict: "rental_id" });
        if (error) {
          alert("제외 처리 중 오류가 발생했어요: " + error.message);
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase.from("rentals").delete().in("id", removedIds);
        if (error) {
          alert("삭제 중 오류가 발생했어요: " + error.message);
          setSaving(false);
          return;
        }
      }
    }

    if (currentIds.length > 0) {
      const { error } = await supabase.from("rentals").update(headerPatch).in("id", currentIds);
      if (error) {
        alert("저장 중 오류가 발생했어요: " + error.message);
        setSaving(false);
        return;
      }
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        if (!it.id) continue;
        // 화면에 보이는 순서(items 배열 순서) 그대로 다음에도 표시되도록 순번을 같이 저장한다.
        await supabase
          .from("rentals")
          .update({ item: it.item, spec: it.spec, qty: it.qty, unit_price: it.unit_price, amount: it.amount, note: it.note, line_no: idx })
          .eq("id", it.id);
      }
    }

    const newItems = items.filter((it) => !it.id);
    if (newItems.length > 0) {
      const rows = newItems.map((it) => ({
        ...headerPatch,
        line_no: items.indexOf(it),
        item: it.item,
        spec: it.spec,
        qty: it.qty,
        unit_price: it.unit_price,
        amount: it.amount,
        note: it.note,
        collected: false,
        collect_date: null,
      }));
      const { error } = await supabase.from("rentals").insert(rows);
      if (error) {
        alert("등록 중 오류가 발생했어요: " + error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    const ids = group.rows.map((r) => r.id);
    // hideInsteadOfDelete가 켜진 화면(자동등록)에서는 전표 전체를 지우는 것도 실제 삭제가 아니라
    // 숨김 처리로 대신한다 — 렌탈내역 원본은 그대로 남는다.
    if (hideInsteadOfDelete) {
      if (
        !confirm(
          `이 전표를 목록에서 제외할까요?\n렌탈내역 원본 데이터는 지워지지 않고 그대로 남아있고, 이 화면에서만 안 보이게 됩니다.`
        )
      )
        return;
      setDeleting(true);
      const { error } = await supabase
        .from("ledger_auto_hidden_rentals")
        .upsert(ids.map((id) => ({ rental_id: id })), { onConflict: "rental_id" });
      setDeleting(false);
      if (error) {
        alert("제외 처리 중 오류가 발생했어요: " + error.message);
        return;
      }
      onSaved();
      return;
    }
    if (!confirm("이 전표를 삭제할까요? 되돌릴 수 없어요.")) return;
    setDeleting(true);
    const { error } = await supabase.from("rentals").delete().in("id", ids);
    setDeleting(false);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    onSaved();
  }

  // 첨부파일(엑셀·PDF 등) — "렌탈내역/구매내역 파일첨부 가능하게 해줘" 요청으로 새로 추가된 기능.
  // 원본 견적서 파일(source_file_path, 견적서 업로드 때 딱 한 번만 저장됨)과는 별개로, 전표 상세
  // 화면을 열어둔 채로 계약서·인수증·엑셀 명세 등 여러 개의 파일을 나중에도 계속 추가·삭제할 수 있게
  // 한다. 여러 개를 저장해야 해서 rentals 테이블에 칸을 추가하는 대신 voucher_attachments라는 별도
  // 표(전표번호별로 여러 줄)를 새로 만들어 쓰고, 실제 파일 자체는 원본 견적서 파일과 같은 Storage
  // 버킷(quote-files)에 저장한다(새 버킷을 따로 안 만들어도 되게).
  const [attachments, setAttachments] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(true);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAttachments() {
      if (!header.voucherNo) {
        setAttachments([]);
        setLoadingAttachments(false);
        return;
      }
      setLoadingAttachments(true);
      const { data, error } = await supabase
        .from("voucher_attachments")
        .select("*")
        .eq("voucher_no", header.voucherNo)
        .order("uploaded_at", { ascending: false });
      if (cancelled) return;
      if (error) console.error("첨부파일 목록 불러오기 실패:", error);
      setAttachments(data || []);
      setLoadingAttachments(false);
    }
    loadAttachments();
    return () => {
      cancelled = true;
    };
  }, [header.voucherNo]);

  async function handleUploadAttachment(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 onChange가 또 발생하도록 값을 비워둔다.
    if (!file) return;
    if (!header.voucherNo) {
      alert("전표번호가 없는 전표에는 파일을 첨부할 수 없어요. 전표번호를 먼저 지정한 뒤 저장해주세요.");
      return;
    }
    setUploadingAttachment(true);
    // Storage 경로에는 한글 등이 들어가면 오류가 나므로(원본 견적서 파일과 같은 이유), 경로는 전표번호·
    // 시간으로만 안전하게 만들고 실제 파일명은 voucher_attachments.file_name에 그대로 저장해 보여준다.
    const safeVoucherNo = (header.voucherNo || "").replace(/[^a-zA-Z0-9_-]/g, "") || "voucher";
    const extMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0] : "";
    const path = `quotes/${safeVoucherNo}/attach-${Date.now()}${ext}`;
    const { error: uploadError } = await supabase.storage.from("quote-files").upload(path, file, { upsert: false });
    if (uploadError) {
      setUploadingAttachment(false);
      alert("파일 첨부에 실패했어요: " + uploadError.message);
      return;
    }
    const { data: inserted, error: insertError } = await supabase
      .from("voucher_attachments")
      .insert({ voucher_no: header.voucherNo, file_path: path, file_name: file.name })
      .select()
      .single();
    setUploadingAttachment(false);
    if (insertError) {
      alert("파일은 저장됐지만 목록에 기록하는 데는 실패했어요: " + insertError.message);
      return;
    }
    setAttachments((prev) => [inserted, ...prev]);
  }

  async function handleDownloadAttachment(att) {
    setDownloadingAttachmentId(att.id);
    const { data, error } = await supabase.storage.from("quote-files").download(att.file_path);
    setDownloadingAttachmentId(null);
    if (error || !data) {
      alert("첨부파일을 불러오지 못했어요: " + (error?.message || "알 수 없는 오류"));
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.file_name || "첨부파일";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteAttachment(att) {
    if (!confirm(`"${att.file_name}" 파일을 삭제할까요?`)) return;
    setDeletingAttachmentId(att.id);
    await supabase.storage.from("quote-files").remove([att.file_path]);
    const { error } = await supabase.from("voucher_attachments").delete().eq("id", att.id);
    setDeletingAttachmentId(null);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
  }

  const [downloadingSource, setDownloadingSource] = useState(false);
  async function handleDownloadSourceFile() {
    const path = group.head.source_file_path;
    if (!path) return;
    setDownloadingSource(true);
    const { data, error } = await supabase.storage.from("quote-files").download(path);
    setDownloadingSource(false);
    if (error || !data) {
      alert("원본 파일을 불러오지 못했어요: " + (error?.message || "알 수 없는 오류"));
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = group.head.source_file_name || "원본파일";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontFamily: serif, fontSize: 16 }}>전표 상세 — {header.voucherNo || "(번호없음)"}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {group.head.source_file_path && (
            <button onClick={handleDownloadSourceFile} disabled={downloadingSource} style={ghostBtnStyle}>
              {downloadingSource ? "불러오는 중…" : `원본 파일 다운로드${group.head.source_file_name ? ` (${group.head.source_file_name})` : ""}`}
            </button>
          )}
          <button onClick={onClose} style={ghostBtnStyle}>← 목록으로</button>
        </div>
      </div>

      {/* 첨부파일(엑셀·PDF 등) — 견적서 원본 파일과 별개로, 계약서·인수증 등 여러 개를 언제든
          추가·삭제할 수 있다. 전표번호가 없는 전표(번호없음)는 파일을 어느 전표에 매어둘지 알 수
          없으므로 첨부 버튼 대신 안내문구만 보여준다. */}
      <div style={{ border: `1px solid ${C.line}`, background: "#F7F4EC", marginBottom: 16, padding: "12px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: !loadingAttachments && attachments.length > 0 ? 8 : 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>📎 첨부파일</span>
          {header.voucherNo ? (
            <label style={{ ...ghostBtnStyle, cursor: uploadingAttachment ? "default" : "pointer", opacity: uploadingAttachment ? 0.6 : 1, display: "inline-block" }}>
              {uploadingAttachment ? "업로드 중…" : "+ 파일 첨부 (엑셀·PDF 등)"}
              <input
                type="file"
                onChange={handleUploadAttachment}
                disabled={uploadingAttachment}
                style={{ display: "none" }}
                accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.hwp,.hwpx,.jpg,.jpeg,.png,.zip"
              />
            </label>
          ) : (
            <span style={{ fontSize: 11.5, color: C.muted }}>전표번호가 있어야 파일을 첨부할 수 있어요</span>
          )}
        </div>
        {loadingAttachments ? (
          <div style={{ fontSize: 12, color: C.muted }}>불러오는 중…</div>
        ) : attachments.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {attachments.map((att) => (
              <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.file_name}</span>
                <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>{(att.uploaded_at || "").slice(0, 10)}</span>
                <button onClick={() => handleDownloadAttachment(att)} disabled={downloadingAttachmentId === att.id} style={{ ...ghostBtnStyle, padding: "2px 8px", fontSize: 11.5, flexShrink: 0 }}>
                  {downloadingAttachmentId === att.id ? "받는 중…" : "다운로드"}
                </button>
                <button onClick={() => handleDeleteAttachment(att)} disabled={deletingAttachmentId === att.id} style={{ ...ghostBtnStyle, padding: "2px 8px", fontSize: 11.5, color: C.brick, flexShrink: 0 }}>
                  {deletingAttachmentId === att.id ? "삭제 중…" : "삭제"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ border: `1px solid ${C.line}`, background: "#F7F4EC", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, padding: "14px 18px" }}>
          <button
            type="button"
            onClick={() => setTonDetailOpen((v) => !v)}
            title="눌러서 품목별 톤수를 확인·수정해요"
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 14, color: C.ink, fontFamily: sans }}
          >
            총 톤수 <strong>{totalTon.toFixed(3)}톤</strong>
            {missingTonCount > 0 && (
              <span style={{ color: "#B45309", fontSize: 12.5 }}> (톤수 미확인 {missingTonCount}건)</span>
            )}
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 2 }}>{tonDetailOpen ? "▲ 접기" : "▼ 품목별 보기"}</span>
          </button>
          {header.siteAddress && <div style={{ width: 1, alignSelf: "stretch", background: C.line }} />}
          <DeliverySiteInfoButton address={header.siteAddress} />
          <DeliveryFeeButton address={header.siteAddress} transactionType={header.transactionType} totalTon={totalTon} />
          <div style={{ width: 1, alignSelf: "stretch", background: C.line }} />
          <button
            type="button"
            onClick={() => setItemStatsOpen((v) => !v)}
            title="눌러서 같은 품목·규격끼리 수량을 합친 데이터를 확인해요"
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 14, color: C.ink, fontFamily: sans }}
          >
            품목별데이터
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 2 }}>{itemStatsOpen ? "▲ 접기" : "▼ 보기"}</span>
          </button>
        </div>

        {itemStatsOpen && (
          <div className="rdp-itemstats-outer" style={{ borderTop: `1px solid ${C.line}`, padding: "16px 18px" }}>
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #rdp-itemstats-print-area, #rdp-itemstats-print-area * { visibility: visible; }
                #rdp-itemstats-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 24px; }
                .rdp-itemstats-no-print { display: none !important; }
              }
            `}</style>

            <div className="rdp-itemstats-no-print" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <button type="button" onClick={handlePrintItemStats} style={primaryBtnStyle2}>인쇄 / PDF로 저장</button>
              <button
                type="button"
                onClick={handleDeleteSelectedItemStats}
                disabled={checkedItemStatKeys.size === 0}
                style={{ ...ghostBtnStyle, opacity: checkedItemStatKeys.size === 0 ? 0.5 : 1 }}
              >
                {`선택삭제${checkedItemStatKeys.size > 0 ? ` (${checkedItemStatKeys.size})` : ""}`}
              </button>
              {hiddenItemStatCount > 0 && (
                <button type="button" onClick={handleRestoreHiddenItemStats} style={ghostBtnStyle}>
                  숨긴 품목 복원 ({hiddenItemStatCount})
                </button>
              )}
            </div>
            <div className="rdp-itemstats-no-print" style={{ fontSize: 11.5, color: C.muted, marginTop: -6, marginBottom: 12 }}>
              * 여기서 "선택삭제"는 이 출력물에서만 안 보이게 숨기는 거예요. 품목 내역 표의 원본 데이터에는 영향이 없어요.
            </div>

            <div id="rdp-itemstats-print-area" style={{ border: `1px solid ${C.line}`, background: "#fff", padding: 24 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontFamily: serif, fontSize: 20 }}>품목별 수량 통계</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 16 }}>
                <div>
                  <div>
                    거래처: {header.customer || "-"}
                    {header.siteName ? ` · 현장명: ${header.siteName}` : ""}
                  </div>
                  <div>담당자: {header.manager || "-"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>전표번호: {header.voucherNo || "(번호없음)"}</div>
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th className="rdp-itemstats-no-print" style={{ border: `1px solid ${C.line}`, padding: "8px 10px", background: C.bg, width: 32 }}>
                      <input
                        type="checkbox"
                        checked={itemStats.length > 0 && checkedItemStatKeys.size === itemStats.length}
                        onChange={toggleItemStatCheckedAll}
                      />
                    </th>
                    {[
                      { label: "품목", key: "item" },
                      { label: "규격", key: "spec" },
                      { label: "총수량", key: "qty" },
                    ].map((h) => (
                      <th
                        key={h.key}
                        onClick={() => toggleItemStatSort(h.key)}
                        style={{
                          border: `1px solid ${C.line}`,
                          padding: "8px 10px",
                          background: C.bg,
                          textAlign: h.key === "qty" ? "right" : "left",
                          cursor: "pointer",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h.label}
                        {itemStatSortKey === h.key ? (itemStatSortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itemStats.map((r) => (
                    <tr key={r.key}>
                      <td className="rdp-itemstats-no-print" style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>
                        <input type="checkbox" checked={checkedItemStatKeys.has(r.key)} onChange={() => toggleItemStatChecked(r.key)} />
                      </td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.item}</td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.spec || "-"}</td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right" }}>{r.qty.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="rdp-itemstats-no-print" style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}></td>
                    <td colSpan={2} style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>
                      합계
                    </td>
                    <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>
                      {itemStatsTotalQty.toLocaleString("ko-KR")}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {itemStats.length === 0 && (
                <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>표시할 품목이 없어요.</div>
              )}
            </div>
          </div>
        )}

        {tonDetailOpen && (
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 18px" }}>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>
              품목별 톤수예요. 잘못됐으면 직접 고치고 "저장"을 누르면, 같은 품목+규격은 앞으로 이 값으로 자동 채워져요.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px 130px", gap: 8, fontSize: 11.5, color: C.muted, padding: "4px 0", borderBottom: `1px solid ${C.line}` }}>
              <div>품목</div>
              <div>규격</div>
              <div>수량</div>
              <div>톤수</div>
            </div>
            {itemsWithTon.map((it, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px 130px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5 }}>
                <div>{it.item || "-"}</div>
                <div style={{ color: C.inkSoft }}>{it.spec || "-"}</div>
                <div>{it.qty ?? "-"}</div>
                {it.tonExcluded ? (
                  <div style={{ fontSize: 11.5, color: C.muted }} title="DC·설치비·배송비 등은 톤수 계산에서 제외돼요">제외</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="number"
                      step="0.001"
                      style={{ ...smallInputStyle, width: 70, background: it.ton == null ? "#FFF6E5" : smallInputStyle.background }}
                      value={tonEdits[idx] !== undefined ? tonEdits[idx] : it.ton ?? ""}
                      placeholder="직접입력"
                      onChange={(e) => setTonEdits((prev) => ({ ...prev, [idx]: e.target.value }))}
                    />
                    <button
                      type="button"
                      title="이 품목의 톤수를 저장해서 다음부터 자동으로 채워지게 해요"
                      onClick={() => saveTonOverride(idx)}
                      disabled={savingTonIdx === idx}
                      style={{ border: `1px solid ${C.line}`, background: "none", cursor: "pointer", fontSize: 12, padding: "5px 6px", color: C.inkSoft, flexShrink: 0 }}
                    >
                      {savingTonIdx === idx ? "…" : "저장"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="구분">
            <select
              style={inputStyle}
              value={header.transactionType}
              onChange={(e) => {
                const transactionType = e.target.value;
                update({ transactionType, warehouse: autoWarehouseFor(transactionType, header.warehouse) });
              }}
            >
              <option value="rental">렌탈</option>
              <option value="purchase">구매</option>
            </select>
          </Field>
          <Field label="전표번호">
            <input style={inputStyle} value={header.voucherNo} onChange={(e) => update({ voucherNo: e.target.value })} />
          </Field>
          <Field label={isAdmin ? "담당자" : "담당자 (본인 계정으로 고정)"}>
            {isAdmin ? (
              <input style={inputStyle} value={header.manager} onChange={(e) => update({ manager: e.target.value })} />
            ) : (
              <input style={{ ...inputStyle, background: C.mutedBg, color: C.inkSoft }} value={header.manager} readOnly />
            )}
          </Field>
          <Field label="거래처">
            <input style={inputStyle} value={header.customer} onChange={(e) => update({ customer: e.target.value })} />
          </Field>
          <Field label="거래처 담당자">
            <input style={inputStyle} value={header.refContact} onChange={(e) => update({ refContact: e.target.value })} />
          </Field>
          <Field label="메일">
            <input style={inputStyle} value={header.email} onChange={(e) => update({ email: e.target.value })} />
          </Field>
          <Field label="출하창고">
            <input style={inputStyle} value={header.warehouse} onChange={(e) => update({ warehouse: e.target.value })} />
          </Field>
          <Field label="거래유형">
            <input style={inputStyle} value={header.dealType} onChange={(e) => update({ dealType: e.target.value })} />
          </Field>
          <Field label={isRental ? "배송일자 (= 렌탈개시일)" : "배송일자"}>
            <input
              type="date"
              style={inputStyle}
              value={header.outDate || ""}
              onChange={(e) => {
                const outDate = e.target.value;
                update({ outDate, dueDate: header.periodMonths ? addMonthsMinusDay(outDate, header.periodMonths) : header.dueDate });
              }}
            />
          </Field>
          {isRental ? (
            <Field label="렌탈기간 (개월)">
              <input
                type="number"
                min={1}
                style={inputStyle}
                value={header.periodMonths ?? ""}
                onChange={(e) => {
                  const months = Number(e.target.value);
                  update({ periodMonths: months, dueDate: addMonthsMinusDay(header.outDate, months) });
                }}
              />
            </Field>
          ) : (
            <Field label="통화">
              <select style={inputStyle} value={header.currency} onChange={(e) => update({ currency: e.target.value })}>
                <option value="내자">내자</option>
                <option value="외자">외자</option>
              </select>
            </Field>
          )}
          {isRental && (
            <>
              <Field label="렌탈만료일 (자동계산, 직접 수정 가능)">
                <input type="date" style={inputStyle} value={header.dueDate || ""} onChange={(e) => update({ dueDate: e.target.value })} />
              </Field>
              <Field label="통화">
                <select style={inputStyle} value={header.currency} onChange={(e) => update({ currency: e.target.value })}>
                  <option value="내자">내자</option>
                  <option value="외자">외자</option>
                </select>
              </Field>
            </>
          )}
          <Field label="현장명">
            <input style={inputStyle} value={header.siteName} onChange={(e) => update({ siteName: e.target.value })} />
          </Field>
          <Field label="배송지 주소">
            <input style={inputStyle} value={header.siteAddress} onChange={(e) => update({ siteAddress: e.target.value })} />
          </Field>
          <Field label="프로젝트 (선택)">
            <input style={inputStyle} value={header.project} onChange={(e) => update({ project: e.target.value })} />
          </Field>
          <Field label="세금계산서발행여부 (선택)">
            <input style={inputStyle} value={header.taxInvoice} onChange={(e) => update({ taxInvoice: e.target.value })} />
          </Field>
          <div style={{ gridColumn: "span 2" }}>
            <Field label="수령자/연락처">
              <input style={inputStyle} value={header.recipient} onChange={(e) => update({ recipient: e.target.value })} />
            </Field>
          </div>
        </div>
      </div>

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: serif, fontSize: 16 }}>품목 내역</div>
          <div style={{ display: "flex", gap: 8 }}>
            {checkedItemIdxs.size > 0 && (
              <button onClick={handleExportCheckedItemsExcel} disabled={exportingItems} style={miniBtnStyle}>
                {exportingItems ? "내려받는 중…" : `선택 엑셀출력 (${checkedItemIdxs.size})`}
              </button>
            )}
            {checkedItemIdxs.size > 0 && (
              <button onClick={handleDeleteSelectedItems} style={{ ...miniBtnStyle, borderColor: C.brick, color: C.brick }}>
                {hideInsteadOfDelete ? "선택 제외" : "선택삭제"} ({checkedItemIdxs.size})
              </button>
            )}
            <button onClick={sortItemsAlpha} style={miniBtnStyle} title="품목명 가나다순으로 한 번에 정렬합니다">
              가나다순 정렬
            </button>
            <button onClick={addItem} style={miniBtnStyle}>+ 품목 추가</button>
          </div>
        </div>
        <div style={{ maxHeight: 360, overflow: "auto", border: `1px solid ${C.lineSoft}`, marginBottom: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: itemsGridTemplate + " 78px",
              gap: 8,
              padding: "8px 10px",
              fontSize: 11.5,
              color: C.muted,
              borderBottom: `1px solid ${C.lineSoft}`,
              position: "sticky",
              top: 0,
              background: C.panel,
              minWidth: "max-content",
            }}
          >
            <div>
              <input
                type="checkbox"
                checked={items.length > 0 && checkedItemIdxs.size === items.length}
                onChange={toggleItemCheckedAll}
              />
            </div>
            {["품목명", "규격", "수량", "단가", "공급가액", "부가세", "적요", "합계"].map((label, i) => (
              <div key={label} style={{ position: "relative" }}>
                <button
                  onClick={() => handleItemSortClick(label)}
                  title="눌러서 정렬"
                  style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 2 }}
                >
                  {label}
                  {itemSortKey === label && <span style={{ fontSize: 9 }}>{itemSortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
                <ColResizeHandle onMouseDown={startResize(i)} />
              </div>
            ))}
            <div>순서</div>
          </div>
          {items.map((it, idx) => {
            const vat = Math.round((Number(it.amount) || 0) * 0.1);
            const lineTotal = (Number(it.amount) || 0) + vat;
            const rowKey = it.id ?? it._tempKey ?? `new-${idx}`;
            return (
              <div
                key={rowKey}
                style={{ display: "grid", gridTemplateColumns: itemsGridTemplate + " 78px", gap: 8, padding: "6px 10px", fontSize: 12.5, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: "max-content" }}
              >
                <input type="checkbox" checked={checkedItemIdxs.has(idx)} onChange={() => toggleItemChecked(idx)} />
                <input style={smallInputStyle} value={it.item || ""} onChange={(e) => updateItem(idx, { item: e.target.value })} />
                <input style={smallInputStyle} value={it.spec || ""} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                <input type="number" style={smallInputStyle} value={it.qty ?? ""} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} />
                <NumberInput style={smallInputStyle} value={it.unit_price} onChange={(v) => updateItem(idx, { unit_price: v })} />
                <NumberInput style={smallInputStyle} value={it.amount} onChange={(v) => updateItem(idx, { amount: v })} />
                <div style={{ fontSize: 12.5, textAlign: "right", color: C.inkSoft }}>{fmtWon(vat)}</div>
                <input style={smallInputStyle} value={it.note || ""} onChange={(e) => updateItem(idx, { note: e.target.value })} />
                <div style={{ fontSize: 12.5, textAlign: "right" }}>{fmtWon(lineTotal)}</div>
                <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={() => insertItemAfter(idx)}
                    title="이 품목 다음 줄에 새 품목 추가"
                    style={rowActionBtnStyle}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(idx, -1)}
                    disabled={idx === 0}
                    title="위로 이동"
                    style={{ ...rowActionBtnStyle, opacity: idx === 0 ? 0.3 : 1, cursor: idx === 0 ? "default" : "pointer" }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(idx, 1)}
                    disabled={idx === items.length - 1}
                    title="아래로 이동"
                    style={{ ...rowActionBtnStyle, opacity: idx === items.length - 1 ? 0.3 : 1, cursor: idx === items.length - 1 ? "default" : "pointer" }}
                  >
                    ↓
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 13, color: C.inkSoft }}>
          공급가액 합계 {fmtWon(totalAmount)} · 부가세 합계 {fmtWon(Math.round(totalAmount * 0.1))} · 합계(VAT 포함) {fmtWon(Math.round(totalAmount * 1.1))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <button onClick={handleDelete} disabled={deleting} style={{ ...ghostBtnStyle, borderColor: C.brick, color: C.brick }}>
          {hideInsteadOfDelete ? (deleting ? "제외 중…" : "전표 제외") : deleting ? "삭제 중…" : "전표 삭제"}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={ghostBtnStyle}>취소</button>
          <button onClick={handleSave} disabled={saving} style={primaryBtnStyle2}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- 지분사 관리 ----------
const equityListGrid = "28px 140px 140px 130px 1fr 130px 170px";

// "맨 오른쪽에 비고란도 하나 넣어주고" 요청 — voucher_shares 테이블의 지분사별 비고와는 별개로,
// 전표(행) 단위로 남기는 비고. 전표번호가 없는 건도 있어서 voucher_no 대신 화면의 각 행 고유값(g.key)을
// 기준으로 저장·조회한다. delivery_site_notes에서 이미 쓰던 "입력칸에서 포커스 벗어나면(onBlur) 저장"
// 패턴을 그대로 따른다.
function EquityNoteCell({ noteKey, initialValue, onSaved }) {
  const [draft, setDraft] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);
  async function save() {
    if (draft === initialValue) return;
    setSaving(true);
    const { error } = await supabase
      .from("voucher_equity_notes")
      .upsert({ voucher_key: noteKey, note: draft.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "voucher_key" });
    setSaving(false);
    if (error) {
      alert("비고 저장 중 오류가 발생했어요: " + error.message);
      return;
    }
    onSaved && onSaved();
  }
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="비고"
      style={{ ...smallInputStyle, width: "100%", boxSizing: "border-box", fontSize: 12.5, opacity: saving ? 0.6 : 1 }}
      disabled={saving}
    />
  );
}

function EquityTab({ rentals, shares, equityNotes = [], onRefresh, onNotesRefresh }) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  // "거래처 옆에 현장명을 넣어줘, 맨 오른쪽에 비고란도 하나 넣어주고 전체적인 비율 밸런스 맞춰주고
  // 간격조절, 소팅기능 추가해줘" 요청 — 렌탈내역(RentalListTab)에서 이미 쓰던 useResizableColumns를
  // 여기도 그대로 적용한다. 예전엔 "지분사" 칸이 1fr(남는 공간을 다 먹는 가변폭)이라 화면이 넓으면
  // 그 칸만 유난히 커 보이고 나머지 칸들은 오른쪽 구석에 몰려 보였다 — 다른 칸들과 비슷한 비율의
  // 고정폭으로 바꿔서 전체 밸런스를 맞췄다.
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [colWidths, startResize] = useResizableColumns([110, 130, 140, 120, 220, 110, 130, 160]);
  const equityListGridResizable = "28px " + colWidths.map((w) => `${w}px`).join(" ");

  const toggleCheck = (key) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groups = useMemo(() => {
    const g = groupRentalsByVoucher(rentals);
    g.sort((a, b) => (b.head.out_date || "").localeCompare(a.head.out_date || "") || (b.voucherNo || "").localeCompare(a.voucherNo || ""));
    return g;
  }, [rentals]);

  const sharesByVoucher = useMemo(() => {
    const map = new Map();
    for (const s of shares) {
      const key = s.voucher_no || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [shares]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => [g.voucherNo, g.head.customer, g.head.site_name].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [groups, query]);

  // 전표번호가 없는 건(g.key가 "__single_숫자")까지 포함해서 모든 행에 비고를 남길 수 있도록, voucher_no가
  // 아니라 이 화면에서 각 행을 가리키는 고유값(g.key)으로 비고를 저장·조회한다.
  const notesByKey = useMemo(() => {
    const map = new Map();
    for (const n of equityNotes) map.set(n.voucher_key, n.note || "");
    return map;
  }, [equityNotes]);

  // 지분사 몫·발행/입금 건수까지 미리 계산해둬서, 화면에 그릴 때뿐 아니라 정렬 기준으로도 그대로 쓸 수 있게 한다.
  const rowsData = useMemo(() => {
    return filtered.map((g) => {
      const rows = sharesByVoucher.get(g.voucherNo) || [];
      const totalPercent = rows.reduce((s, r) => s + (Number(r.share_percent) || 0), 0);
      const amountVat = Math.round(g.amount * 1.1);
      const partnerAmount = Math.round(amountVat * (totalPercent / 100));
      const issuedCount = rows.filter((r) => r.tax_invoice_issued).length;
      const paidCount = rows.filter((r) => r.paid).length;
      return { ...g, shareRows: rows, amountVat, partnerAmount, issuedCount, paidCount };
    });
  }, [filtered, sharesByVoucher]);

  const sortAccessors = {
    전표번호: (g) => g.voucherNo || "",
    거래처: (g) => g.head.customer || "",
    현장명: (g) => g.head.site_name || "",
    "총금액(VAT포함)": (g) => g.amountVat,
    "지분사 몫": (g) => (g.shareRows.length === 0 ? 0 : g.partnerAmount),
  };
  const handleSortClick = (label) => {
    if (!sortAccessors[label]) return;
    if (sortKey === label) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(label);
      setSortDir("asc");
    }
  };
  const sortedRowsData = useMemo(() => {
    if (!sortKey || !sortAccessors[sortKey]) return rowsData;
    const acc = sortAccessors[sortKey];
    const list = [...rowsData];
    list.sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      let cmp;
      if (typeof va === "number" || typeof vb === "number") cmp = (Number(va) || 0) - (Number(vb) || 0);
      else cmp = String(va).localeCompare(String(vb), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsData, sortKey, sortDir]);

  const selected = groups.find((g) => g.key === selectedKey) || null;

  // 훅은 조건부 return보다 항상 먼저 호출돼야 하므로(React 규칙), 목록 화면에서만 쓰는 값이라도 여기서 계산해둔다.
  const visibleKeys = filtered.map((g) => g.key);
  const allChecked = visibleKeys.length > 0 && visibleKeys.every((k) => checkedKeys.has(k));
  const someChecked = visibleKeys.some((k) => checkedKeys.has(k));
  const selectAllRef = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);
  const toggleSelectAll = () => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (allChecked) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  if (selected) {
    return (
      <EquityDetailPanel
        group={selected}
        shares={sharesByVoucher.get(selected.voucherNo) || []}
        onClose={() => setSelectedKey(null)}
        onSaved={onRefresh}
      />
    );
  }

  async function handleDeleteSelected() {
    const chosen = filtered.filter((g) => checkedKeys.has(g.key) && g.voucherNo);
    const withShares = chosen.filter((g) => (sharesByVoucher.get(g.voucherNo) || []).length > 0);
    if (withShares.length === 0) {
      alert("선택한 전표에는 등록된 지분사가 없어요.");
      return;
    }
    if (!confirm(`선택한 ${withShares.length}건의 지분 등록을 삭제할까요? 거래처 단독(100%) 상태로 되돌아가고, 렌탈·매출 데이터는 그대로 유지돼요.`)) return;
    setDeletingSelected(true);
    const voucherNos = withShares.map((g) => g.voucherNo);
    const { error } = await supabase.from("voucher_shares").delete().in("voucher_no", voucherNos);
    setDeletingSelected(false);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    setCheckedKeys(new Set());
    onRefresh();
  }

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>지분관리</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        전표를 클릭하면 지분사를 추가하고, 지분율을 입력하면 지분금액이 자동으로 계산돼요. 지분사가 없는 전표는 거래처 단독(100%) 건이에요.
      </div>

      <input
        placeholder="거래처, 현장명, 전표번호 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ ...inputStyle, width: 320, marginBottom: 14 }}
      />

      <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 10 }}>검색결과 {filtered.length}건</div>

      {checkedKeys.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "8px 12px", background: C.amberBg, fontSize: 12.5 }}>
          <div>{checkedKeys.size}건 선택됨</div>
          <button onClick={handleDeleteSelected} disabled={deletingSelected} style={{ ...miniBtnStyle, borderColor: C.brick, color: C.brick }}>
            {deletingSelected ? "삭제 중…" : "선택 지분 삭제"}
          </button>
          <button onClick={() => setCheckedKeys(new Set())} style={miniBtnStyle}>선택 해제</button>
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: equityListGridResizable, gap: 8, padding: "10px 14px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.line}`, minWidth: 1150 }}>
          <div>
            <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleSelectAll} />
          </div>
          {["전표번호", "거래처", "현장명", "총금액(VAT포함)", "지분사", "지분사 몫", "세금계산서 · 입금", "비고"].map((label, i) => (
            <div key={label} style={{ position: "relative" }}>
              {sortAccessors[label] ? (
                <button
                  type="button"
                  onClick={() => handleSortClick(label)}
                  title="눌러서 정렬"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    fontSize: 11.5,
                    color: sortKey === label ? C.ink : C.muted,
                    fontWeight: sortKey === label ? 700 : 400,
                  }}
                >
                  {label}
                  <span style={{ fontSize: 9, opacity: sortKey === label ? 1 : 0.35 }}>{sortKey === label ? (sortDir === "asc" ? "▲" : "▼") : "▲"}</span>
                </button>
              ) : (
                label
              )}
              <ColResizeHandle onMouseDown={startResize(i)} />
            </div>
          ))}
        </div>

        {sortedRowsData.map((g) => {
          const rows = g.shareRows;
          return (
            <div
              key={g.key}
              style={{ display: "grid", gridTemplateColumns: equityListGridResizable, gap: 8, padding: "12px 14px", fontSize: 13, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 1150 }}
            >
              <div>
                <input type="checkbox" checked={checkedKeys.has(g.key)} onChange={() => toggleCheck(g.key)} />
              </div>
              <button
                onClick={() => setSelectedKey(g.key)}
                style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
              >
                {g.voucherNo || "(번호없음)"}
              </button>
              <div>{g.head.customer || "-"}</div>
              <div style={{ color: C.inkSoft, fontSize: 12.5 }}>{g.head.site_name || "-"}</div>
              <div style={{ fontSize: 12.5 }}>{fmtWon(g.amountVat)}</div>
              <div style={{ fontSize: 12.5 }}>
                {rows.length === 0 ? <span style={{ color: C.muted }}>{g.head.customer || "거래처"} 100%</span> : rows.map((r) => `${r.partner_name} ${r.share_percent}%`).join(", ")}
              </div>
              <div style={{ fontSize: 12.5 }}>{rows.length === 0 ? "-" : fmtWon(g.partnerAmount)}</div>
              <div style={{ fontSize: 12.5 }}>
                {rows.length === 0 ? (
                  <span style={{ color: C.muted }}>-</span>
                ) : (
                  <>
                    <span style={{ color: g.issuedCount === rows.length ? C.green : C.brick }}>{g.issuedCount}/{rows.length}</span>
                    {" · "}
                    <span style={{ color: g.paidCount === rows.length ? C.green : C.brick }}>{g.paidCount}/{rows.length}</span>
                  </>
                )}
              </div>
              <EquityNoteCell noteKey={g.key} initialValue={notesByKey.get(g.key) || ""} onSaved={onNotesRefresh} />
            </div>
          );
        })}

        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>등록된 전표가 없어요.</div>}
      </div>
    </div>
  );
}

function EquityDetailPanel({ group, shares, onClose, onSaved }) {
  const [rows, setRows] = useState(() =>
    shares.map((s) => ({
      id: s.id,
      partnerName: s.partner_name,
      sharePercent: s.share_percent,
      note: s.note || "",
      taxInvoiceIssued: !!s.tax_invoice_issued,
      paid: !!s.paid,
    }))
  );
  const [saving, setSaving] = useState(false);
  const totalAmount = group.amount;
  const totalAmountVat = Math.round(totalAmount * 1.1);

  if (!group.voucherNo) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: serif, fontSize: 16 }}>지분 관리</div>
          <button onClick={onClose} style={ghostBtnStyle}>← 목록으로</button>
        </div>
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 40, textAlign: "center", color: C.muted, fontSize: 13.5 }}>
          이 전표는 전표번호가 없어서 지분사 관리를 지원하지 않아요. 렌탈내역에서 먼저 전표번호를 지정(다른 건과 묶기)한 뒤 다시 시도해주세요.
        </div>
      </div>
    );
  }

  const updateRow = (idx, patch) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    setRows(next);
  };
  // "지분사명이 기본적으로 '주관사'라고 되어 있는데, '주관사'라고 하지 말고 그냥 거래처명을 자동으로
  // 넣어줘" 요청 — 첫 번째 지분사 행을 추가할 때 "주관사"라는 고정 문구 대신, 이 전표의 거래처명을 그대로 채워준다.
  const addRow = () =>
    setRows([...rows, { id: null, partnerName: rows.length === 0 ? (group.head.customer || "") : "", sharePercent: "", note: "", taxInvoiceIssued: false, paid: false }]);
  const removeRow = (idx) => setRows(rows.filter((_, i) => i !== idx));

  const totalPercent = rows.reduce((s, r) => s + (Number(r.sharePercent) || 0), 0);
  const remainingPercent = Math.max(0, 100 - totalPercent);

  async function handleSave() {
    for (const r of rows) {
      if (!r.partnerName.trim()) {
        alert("지분사명을 입력해주세요.");
        return;
      }
    }
    setSaving(true);

    const originalIds = shares.map((s) => s.id);
    const currentIds = rows.filter((r) => r.id).map((r) => r.id);
    const removedIds = originalIds.filter((id) => !currentIds.includes(id));

    if (removedIds.length > 0) {
      const { error } = await supabase.from("voucher_shares").delete().in("id", removedIds);
      if (error) {
        alert("삭제 중 오류가 발생했어요: " + error.message);
        setSaving(false);
        return;
      }
    }

    for (const r of rows.filter((x) => x.id)) {
      await supabase
        .from("voucher_shares")
        .update({
          partner_name: r.partnerName,
          share_percent: r.sharePercent === "" ? 0 : Number(r.sharePercent),
          note: r.note,
          tax_invoice_issued: r.taxInvoiceIssued,
          paid: r.paid,
        })
        .eq("id", r.id);
    }

    const newRows = rows.filter((r) => !r.id);
    if (newRows.length > 0) {
      const insertRows = newRows.map((r) => ({
        voucher_no: group.voucherNo,
        partner_name: r.partnerName,
        share_percent: r.sharePercent === "" ? 0 : Number(r.sharePercent),
        note: r.note,
        tax_invoice_issued: r.taxInvoiceIssued,
        paid: r.paid,
      }));
      const { error } = await supabase.from("voucher_shares").insert(insertRows);
      if (error) {
        alert("등록 중 오류가 발생했어요: " + error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
    onClose(); // 저장이 끝나면 목록 화면으로 돌아간다
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontFamily: serif, fontSize: 16 }}>지분 관리 — {group.voucherNo}</div>
        <button onClick={onClose} style={ghostBtnStyle}>← 목록으로</button>
      </div>

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, fontSize: 13 }}>
          <div>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>거래처</div>
            <div>{group.head.customer || "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>배송일자</div>
            <div>{group.head.out_date || "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>총금액(VAT포함)</div>
            <div style={{ fontFamily: serif }}>{fmtWon(totalAmountVat)}</div>
          </div>
        </div>
      </div>

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: serif, fontSize: 16 }}>지분사</div>
          <button onClick={addRow} style={miniBtnStyle}>+ 지분사 추가</button>
        </div>

        {rows.length === 0 && (
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>지분사가 없으면 이 전표는 {group.head.customer || "거래처"} 단독(100%) 건으로 처리돼요.</div>
        )}

        {rows.length > 0 && (
          <div style={{ border: `1px solid ${C.lineSoft}`, marginBottom: 12, overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 130px 1fr 80px 70px 32px", gap: 8, padding: "8px 10px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.lineSoft}`, minWidth: 720 }}>
              <div>지분사명</div>
              <div>지분율(%)</div>
              <div>지분금액</div>
              <div>비고</div>
              <div>세금계산서</div>
              <div>입금</div>
              <div></div>
            </div>
            {rows.map((r, idx) => {
              const amount = Math.round(totalAmountVat * ((Number(r.sharePercent) || 0) / 100));
              return (
                <div
                  key={r.id ?? `new-${idx}`}
                  style={{ display: "grid", gridTemplateColumns: "1fr 90px 130px 1fr 80px 70px 32px", gap: 8, padding: "6px 10px", fontSize: 12.5, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 720 }}
                >
                  <input style={smallInputStyle} value={r.partnerName} onChange={(e) => updateRow(idx, { partnerName: e.target.value })} placeholder="예: OO투자" />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    style={smallInputStyle}
                    value={r.sharePercent ?? ""}
                    onChange={(e) => updateRow(idx, { sharePercent: e.target.value === "" ? "" : Number(e.target.value) })}
                  />
                  <div style={{ fontSize: 12.5 }}>{fmtWon(amount)}</div>
                  <input style={smallInputStyle} value={r.note || ""} onChange={(e) => updateRow(idx, { note: e.target.value })} placeholder="선택 입력" />
                  <div style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={r.taxInvoiceIssued} onChange={(e) => updateRow(idx, { taxInvoiceIssued: e.target.checked })} />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={r.paid} onChange={(e) => updateRow(idx, { paid: e.target.checked })} />
                  </div>
                  <button onClick={() => removeRow(idx)} style={{ background: "none", border: "none", color: C.brick, cursor: "pointer", fontSize: 13 }}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ fontSize: 13, color: C.inkSoft }}>
          지분사 합계 {totalPercent}% ({fmtWon(Math.round(totalAmountVat * (totalPercent / 100)))}) · {group.head.customer || "거래처"} 몫 {remainingPercent}% ({fmtWon(Math.round(totalAmountVat * (remainingPercent / 100)))})
        </div>
        {totalPercent > 100 && <div style={{ fontSize: 12.5, color: C.brick, marginTop: 6 }}>지분율 합계가 100%를 넘었어요. 확인해주세요.</div>}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={ghostBtnStyle}>취소</button>
        <button onClick={handleSave} disabled={saving} style={primaryBtnStyle2}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

// 업체별데이터 목록에서 쓰는 칸 너비(판매현황은 칸 너비를 드래그로 조절할 수 있게 따로 관리한다).
const salesListGrid = "120px 130px 90px 60px 100px 70px 120px 100px 120px";

function SalesStatusTab({ rentals, onRefresh, isAdmin = true, managerName = "" }) {
  const [selectedVoucherKey, setSelectedVoucherKey] = useState(null);
  const todayStr = todayISO();
  const now0 = new Date();
  const monthStart = todayStr.slice(0, 7) + "-01";
  const monthEnd = (() => {
    const lastDay = new Date(now0.getFullYear(), now0.getMonth() + 1, 0).getDate();
    return `${todayStr.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  })();
  // 기본값은 이번달 1일~말일. 이 범위 안에서 직접 날짜를 넣고 검색하면 그 기준대로 다시 필터링된다.
  const defaultFilters = { manager: "", customer: "", dealType: "", fromDate: monthStart, toDate: monthEnd };

  // 입력창에 타이핑하는 값(초안)과 실제로 검색에 적용된 값을 분리해서, "검색" 버튼을 눌러야 목록에 반영되게 한다.
  const [managerInput, setManagerInput] = useState("");
  const [customerInput, setCustomerInput] = useState("");
  const [fromDateInput, setFromDateInput] = useState(monthStart);
  const [toDateInput, setToDateInput] = useState(monthEnd);
  const [dealType, setDealType] = useState(""); // "" | "rental" | "purchase" — 버튼이라 클릭 즉시 적용
  const [applied, setApplied] = useState(defaultFilters);
  const [hasSearched, setHasSearched] = useState(false); // 검색을 눌러야 결과가 나오게(false면 목록을 아예 안 보여줌)
  // 목록에서 체크박스로 골라 한번에 삭제하는 기능. 칸 너비도 렌탈내역 등 다른 표처럼 드래그로 조절할 수 있게 한다.
  const [checkedKeys, setCheckedKeys] = useState(() => new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [colWidths, startResize] = useResizableColumns([120, 130, 90, 60, 100, 100, 70, 120, 100, 120]);

  // 실제 등록된 전표들에 있는 업체명 전체 목록(중복 제거) — 이름 중간 글자만 쳐도 자동완성 후보로 바로 뜨게 한다.
  const customerOptions = useMemo(() => {
    const set = new Set();
    for (const r of rentals || []) {
      const c = (r.customer || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rentals]);

  function runSearch(overrides) {
    addRecentValue("remarket_recent_manager", managerInput);
    addRecentValue("remarket_recent_customer", customerInput);
    setApplied({
      manager: managerInput,
      customer: customerInput,
      dealType,
      fromDate: fromDateInput,
      toDate: toDateInput,
      ...overrides,
    });
    setHasSearched(true);
  }

  function resetFilters() {
    setManagerInput("");
    setCustomerInput("");
    setFromDateInput(monthStart);
    setToDateInput(monthEnd);
    setDealType("");
    setApplied(defaultFilters);
    setHasSearched(false);
    setCheckedKeys(new Set());
  }

  async function handleDeleteSelected() {
    const chosen = groups.filter((g) => checkedKeys.has(g.key));
    if (chosen.length === 0) return;
    const totalRows = chosen.reduce((s, g) => s + g.rows.length, 0);
    if (!confirm(`선택한 매출 데이터 ${chosen.length}건(품목 ${totalRows}개)을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setDeletingSelected(true);
    const allIds = chosen.flatMap((g) => g.rows.map((r) => r.id));
    const { error } = await supabase.from("rentals").delete().in("id", allIds);
    setDeletingSelected(false);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    setCheckedKeys(new Set());
    onRefresh && onRefresh();
  }

  function setQuickRange(kind) {
    const now = new Date();
    let nextFrom = fromDateInput;
    let nextTo = toDateInput;
    if (kind === "today") {
      nextFrom = todayStr;
      nextTo = todayStr;
    } else if (kind === "week") {
      const day = now.getDay();
      const diffToMon = day === 0 ? 6 : day - 1;
      nextFrom = addDays(todayStr, -diffToMon);
      nextTo = todayStr;
    } else if (kind === "month") {
      nextFrom = monthStart;
      nextTo = todayStr;
    } else if (kind === "lastMonth") {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
      nextFrom = `${y}-${m}-01`;
      nextTo = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
    } else if (kind === "year") {
      nextFrom = `${now.getFullYear()}-01-01`;
      nextTo = todayStr;
    } else if (kind === "all") {
      // 기본값(이번달)에 데이터가 없으면 "혹시 검색이 안 되나?" 헷갈리기 쉬워서, 날짜 제한 없이 전체 기간을
      // 한번에 볼 수 있는 버튼을 따로 둔다.
      nextFrom = "";
      nextTo = "";
    }
    setFromDateInput(nextFrom);
    setToDateInput(nextTo);
    runSearch({ fromDate: nextFrom, toDate: nextTo }); // 빠른선택 버튼은 클릭 즉시 검색까지 적용
  }

  function setDealTypeAndSearch(key) {
    setDealType(key);
    runSearch({ dealType: key }); // 구분 버튼도 클릭 즉시 검색까지 적용
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") runSearch();
  };

  const filteredRows = useMemo(() => {
    return (rentals || []).filter((r) => {
      // out_date가 시각까지 포함된 문자열로 와도 날짜(앞 10자리)만 비교하도록 안전장치를 둔다.
      const d = (r.out_date || "").slice(0, 10);
      if (applied.fromDate && (!d || d < applied.fromDate)) return false;
      if (applied.toDate && (!d || d > applied.toDate)) return false;
      if (applied.manager.trim() && !(r.manager || "").toLowerCase().includes(applied.manager.trim().toLowerCase())) return false;
      if (applied.customer.trim() && !(r.customer || "").toLowerCase().includes(applied.customer.trim().toLowerCase())) return false;
      if (applied.dealType && r.transaction_type !== applied.dealType) return false;
      return true;
    });
  }, [rentals, applied]);

  const groups = useMemo(() => {
    const g = groupRentalsByVoucher(filteredRows);
    g.sort((a, b) => (b.head.out_date || "").localeCompare(a.head.out_date || "") || (b.voucherNo || "").localeCompare(a.voucherNo || ""));
    return g;
  }, [filteredRows]);

  const totalSupply = filteredRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalVat = Math.round(totalSupply * 0.1);
  const totalWithVat = totalSupply + totalVat;

  const byManager = useMemo(() => {
    const map = new Map();
    for (const g of groups) {
      const key = g.head.manager || "(담당자 미지정)";
      if (!map.has(key)) map.set(key, { manager: key, count: 0, amount: 0 });
      const entry = map.get(key);
      entry.count += 1;
      entry.amount += g.amount;
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [groups]);

  const visibleKeys = groups.map((g) => g.key);
  const allChecked = visibleKeys.length > 0 && visibleKeys.every((k) => checkedKeys.has(k));
  const someChecked = visibleKeys.some((k) => checkedKeys.has(k));
  const selectAllRef = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);

  const toggleChecked = (key) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCheckedAll = () => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (allChecked) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  const listGridTemplate = "32px " + colWidths.map((w) => `${w}px`).join(" ");

  const selectedGroup = selectedVoucherKey ? groups.find((g) => g.key === selectedVoucherKey) : null;
  if (selectedGroup) {
    return (
      <RentalDetailPanel
        group={selectedGroup}
        onClose={() => setSelectedVoucherKey(null)}
        onSaved={() => {
          onRefresh && onRefresh();
          setSelectedVoucherKey(null);
        }}
        isAdmin={isAdmin}
        managerName={managerName}
      />
    );
  }

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>판매현황</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        담당자·거래처·기간으로 매출 데이터를 조회할 수 있어요. 배송일자(렌탈개시일) 기준이에요. 구분을 "전체"로 두면 렌탈·구매 모두 나와요.
        기간을 처음 열면 이번달 기준으로 잡혀 있으니, 데이터가 안 보이면 아래 "전체기간" 버튼으로 넓혀서 찾아보세요.
      </div>

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
          <Field label="담당자">
            <RecentValueInput
              storageKey="remarket_recent_manager"
              value={managerInput}
              onChange={setManagerInput}
              onKeyDown={handleSearchKeyDown}
            />
          </Field>
          <Field label="거래처">
            <RecentValueInput
              storageKey="remarket_recent_customer"
              value={customerInput}
              onChange={setCustomerInput}
              onKeyDown={handleSearchKeyDown}
              extraOptions={customerOptions}
            />
          </Field>
          <Field label="기준일자(시작)">
            <input type="date" style={inputStyle} value={fromDateInput} onChange={(e) => setFromDateInput(e.target.value)} />
          </Field>
          <Field label="기준일자(종료)">
            <input type="date" style={inputStyle} value={toDateInput} onChange={(e) => setToDateInput(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "", label: "전체" },
              { key: "rental", label: "렌탈" },
              { key: "purchase", label: "구매" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setDealTypeAndSearch(opt.key)}
                style={{
                  ...miniBtnStyle,
                  background: dealType === opt.key ? C.ink : "transparent",
                  color: dealType === opt.key ? "#fff" : C.inkSoft,
                  borderColor: dealType === opt.key ? C.ink : C.line,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: C.line }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setQuickRange("today")} style={miniBtnStyle}>금일</button>
            <button onClick={() => setQuickRange("week")} style={miniBtnStyle}>금주(~오늘)</button>
            <button onClick={() => setQuickRange("month")} style={miniBtnStyle}>금월(~오늘)</button>
            <button onClick={() => setQuickRange("lastMonth")} style={miniBtnStyle}>전월</button>
            <button onClick={() => setQuickRange("year")} style={miniBtnStyle}>금년(~오늘)</button>
            <button onClick={() => setQuickRange("all")} style={miniBtnStyle}>전체기간</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => runSearch()} style={primaryBtnStyle2}>검색</button>
          <button onClick={resetFilters} style={ghostBtnStyle}>초기화</button>
        </div>
      </div>

      {!hasSearched && (
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 40, textAlign: "center", color: C.muted, fontSize: 13.5 }}>
          "검색" 버튼을 누르면 결과가 나와요.
        </div>
      )}

      {hasSearched && (
        <>
          <div style={{ display: "flex", border: `1px solid ${C.line}`, background: C.panel, marginBottom: 16 }}>
            <StatCell label="건수" value={`${groups.length}건`} />
            <StatCell label="공급가액 합계" value={fmtWon(totalSupply)} />
            <StatCell label="부가세 합계" value={fmtWon(totalVat)} />
            <StatCell label="합계(VAT포함)" value={fmtWon(totalWithVat)} color={C.green} last />
          </div>

          {byManager.length > 0 && (
            <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>담당자별 집계 (공급가액 기준)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {byManager.map((m) => (
                  <div
                    key={m.manager}
                    style={{ border: `1px solid ${C.lineSoft}`, padding: "8px 14px", minWidth: 160 }}
                  >
                    <div style={{ fontSize: 12.5, color: C.inkSoft }}>{m.manager}</div>
                    <div style={{ fontSize: 15, fontFamily: serif }}>{fmtWon(m.amount)}</div>
                    <div style={{ fontSize: 11.5, color: C.muted }}>{m.count}건</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: C.muted }}>칸 경계를 드래그하면 너비를 늘이고 줄일 수 있어요.</span>
            {checkedKeys.size > 0 && (
              <>
                <span style={{ fontSize: 12.5, color: C.inkSoft }}>{checkedKeys.size}건 선택됨</span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={deletingSelected}
                  style={{ ...miniBtnStyle, borderColor: C.brick, color: C.brick }}
                >
                  {deletingSelected ? "삭제 중…" : "선택 삭제"}
                </button>
              </>
            )}
          </div>

          <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: listGridTemplate, gap: 8, padding: "10px 14px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.line}`, minWidth: "max-content" }}>
              <div>
                <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleCheckedAll} />
              </div>
              {[
                "전표번호", "거래처", "담당자", "구분", "배송일자", "렌탈종료일자", "품목수", "공급가액", "부가세", "합계(VAT포함)",
              ].map((label, i) => (
                <div key={label} style={{ position: "relative" }}>
                  {label}
                  <ColResizeHandle onMouseDown={startResize(i)} />
                </div>
              ))}
            </div>

            {groups.map((g) => {
              const vat = Math.round(g.amount * 0.1);
              return (
                <div
                  key={g.key}
                  style={{ display: "grid", gridTemplateColumns: listGridTemplate, gap: 8, padding: "12px 14px", fontSize: 13, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: "max-content" }}
                >
                  <div>
                    <input type="checkbox" checked={checkedKeys.has(g.key)} onChange={() => toggleChecked(g.key)} />
                  </div>
                  <button
                    onClick={() => setSelectedVoucherKey(g.key)}
                    style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
                  >
                    {g.voucherNo || "(번호없음)"}
                  </button>
                  <div>{g.head.customer || "-"}</div>
                  <div>{g.head.manager || "-"}</div>
                  <div style={{ fontSize: 12.5 }}>{g.head.transaction_type === "rental" ? "렌탈" : "구매"}</div>
                  <div style={{ fontSize: 12.5 }}>{g.head.out_date || "-"}</div>
                  <div style={{ fontSize: 12.5 }}>{g.head.due_date || "-"}</div>
                  <div style={{ fontSize: 12.5 }}>{g.rows.length}건</div>
                  <div style={{ fontSize: 12.5 }}>{fmtWon(g.amount)}</div>
                  <div style={{ fontSize: 12.5 }}>{fmtWon(vat)}</div>
                  <div style={{ fontSize: 12.5, fontFamily: serif }}>{fmtWon(g.amount + vat)}</div>
                </div>
              );
            })}

            {groups.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>조건에 맞는 매출 데이터가 없어요.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function CustomerDataTab({ rentals, onRefresh, customers, onCustomersRefresh }) {
  const todayStr = todayISO();
  const now0 = new Date();
  const monthStart = todayStr.slice(0, 7) + "-01";
  const monthEnd = (() => {
    const lastDay = new Date(now0.getFullYear(), now0.getMonth() + 1, 0).getDate();
    return `${todayStr.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  })();

  // 입력창에 타이핑하는 값(초안)과 실제로 검색에 적용된 값을 분리해서, "검색" 버튼을 눌러야 결과에 반영되게 한다.
  // 기본 조회 기간은 이번달 1일 ~ 말일(월 전체)로 잡는다.
  const [customerInput, setCustomerInput] = useState("");
  const [siteInput, setSiteInput] = useState(""); // 현장명(선택) — 같은 업체 안에서도 특정 현장만 좁혀 볼 때
  const [itemInput, setItemInput] = useState(""); // 품목명(선택) — 예: "냉난방기"만 몇 개 나갔는지
  const [fromDateInput, setFromDateInput] = useState(monthStart);
  const [toDateInput, setToDateInput] = useState(monthEnd);

  const [customerQuery, setCustomerQuery] = useState("");
  const [siteQuery, setSiteQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(monthEnd);
  const [hasSearched, setHasSearched] = useState(false); // 검색을 눌러야 결과가 나오게(false면 안내문구만 보여줌)

  function runSearch() {
    addRecentValue("remarket_recent_customer", customerInput);
    setCustomerQuery(customerInput);
    setSiteQuery(siteInput);
    setItemQuery(itemInput);
    setFromDate(fromDateInput);
    setToDate(toDateInput);
    setHasSearched(true);
  }

  function resetFilters() {
    setCustomerInput("");
    setSiteInput("");
    setItemInput("");
    setFromDateInput(monthStart);
    setToDateInput(monthEnd);
    setCustomerQuery("");
    setSiteQuery("");
    setItemQuery("");
    setFromDate(monthStart);
    setToDate(monthEnd);
    setHasSearched(false);
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") runSearch();
  };

  // 실제 등록된 전표들에 있는 업체명 전체 목록(중복 제거) — "산업"처럼 이름 중간 글자만 쳐도
  // 최근 검색 이력이 없는 업체(예: KR산업)까지 자동완성 후보로 바로 뜨게 한다.
  const customerOptions = useMemo(() => {
    const set = new Set();
    for (const r of rentals || []) {
      const c = (r.customer || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rentals]);

  // "무영씨엠"과 "(주)무영씨엠"처럼 표기만 다르고 실제로는 같은 회사인 거래처명을 찾아낸다.
  // customers 테이블(견적서 업로드 시 저장해둔 거래처별 사업자등록번호)에서 각 거래처명의 번호를 찾아,
  // 렌탈내역에 실제로 쓰이고 있는 거래처명들을 사업자등록번호 기준으로 묶어본다. 한 번호에 이름이 2개
  // 이상 걸리면 "같은 회사인데 표기가 갈린 것"으로 보고 화면에 보여준다.
  const bizRegDupGroups = useMemo(() => {
    const namesInUse = new Set();
    for (const r of rentals || []) {
      const c = (r.customer || "").trim();
      if (c) namesInUse.add(c);
    }
    const nameToReg = new Map();
    for (const c of customers || []) {
      const digits = (c.business_reg_no || "").replace(/\D/g, "");
      const name = (c.name || "").trim();
      if (name && digits) nameToReg.set(name, digits);
    }
    const regToNames = new Map();
    for (const name of namesInUse) {
      const reg = nameToReg.get(name);
      if (!reg) continue;
      if (!regToNames.has(reg)) regToNames.set(reg, new Set());
      regToNames.get(reg).add(name);
    }
    const groups = [];
    for (const [reg, namesSet] of regToNames.entries()) {
      if (namesSet.size >= 2) {
        groups.push({ reg, names: Array.from(namesSet).sort((a, b) => a.localeCompare(b, "ko")) });
      }
    }
    return groups.sort((a, b) => a.reg.localeCompare(b.reg));
  }, [rentals, customers]);

  const [mergingReg, setMergingReg] = useState(null);
  // 사업자등록번호가 같은 거래처명들을 하나(keepName)로 통일한다. 렌탈내역의 거래처 칼럼을 실제로 바꾸는
  // 것이라, 이후엔 렌탈내역·업체별데이터·자동등록 등 어느 화면에서 봐도 같은 이름 하나로 통일돼 보인다.
  async function handleMergeCustomerGroup(keepName, otherNames) {
    if (
      !confirm(
        `"${otherNames.join(", ")}"(을)를 전부 "${keepName}"(으)로 통합할까요?\n렌탈내역·구매내역 등 모든 화면의 거래처명이 "${keepName}"으로 바뀝니다.`
      )
    )
      return;
    setMergingReg(keepName + "|" + otherNames.join(","));
    const { error } = await supabase.from("rentals").update({ customer: keepName }).in("customer", otherNames);
    if (error) {
      alert("통합 중 오류가 발생했어요: " + error.message);
      setMergingReg(null);
      return;
    }
    // customers 테이블에 남아있는 예전 이름 등록도 정리해서, 다음에 같은 사업자등록번호를 입력했을 때
    // 다시 예전 이름으로 자동완성되지 않게 한다.
    await supabase.from("customers").delete().in("name", otherNames);
    setMergingReg(null);
    onRefresh && onRefresh();
    onCustomersRefresh && onCustomersRefresh();
  }

  // 현장명·품목명도 업체명처럼 실제 등록된 값 목록을 자동완성 후보로 보여준다.
  const siteOptions = useMemo(() => {
    const set = new Set();
    for (const r of rentals || []) {
      const v = (r.site_name || "").trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rentals]);
  const itemOptions = useMemo(() => {
    const set = new Set();
    for (const r of rentals || []) {
      const v = (r.item || "").trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rentals]);

  // 조회 기간(일 단위)이 걸쳐있는 월들의 "YYYY-MM" 목록 — 그래프 X축·월별 집계에만 쓰고, 실제 데이터 필터링은 일 단위(fromDate~toDate)로 한다.
  const monthKeys = useMemo(() => {
    const keys = [];
    if (!fromDate || !toDate) return keys;
    const [fy, fm] = fromDate.slice(0, 7).split("-").map(Number);
    const [ty, tm] = toDate.slice(0, 7).split("-").map(Number);
    if (!fy || !fm || !ty || !tm) return keys;
    if (fy > ty || (fy === ty && fm > tm)) return keys; // 시작이 종료보다 뒤면 빈 목록
    let y = fy;
    let m = fm;
    let guard = 0;
    while ((y < ty || (y === ty && m <= tm)) && guard < 120) {
      keys.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      guard++;
    }
    return keys;
  }, [fromDate, toDate]);

  const searched = hasSearched && customerQuery.trim().length > 0 && !!fromDate && !!toDate && fromDate <= toDate;

  const filteredRows = useMemo(() => {
    if (!searched) return [];
    const q = customerQuery.trim().toLowerCase();
    const siteQ = siteQuery.trim().toLowerCase();
    const itemQ = itemQuery.trim().toLowerCase();
    return (rentals || []).filter((r) => {
      if (!(r.customer || "").toLowerCase().includes(q)) return false;
      if (siteQ && !(r.site_name || "").toLowerCase().includes(siteQ)) return false;
      // "품목명" 검색창은 품목 이름뿐 아니라 규격 글자도 같이 뒤져서 찾는다. 규격에 적힌 문구(예: "접탁자,
      // W1200*D450, 연체리"의 "접탁")만 알고 정확한 품목명은 기억 안 나는 경우에도 찾을 수 있어야 하기 때문.
      if (itemQ && !(r.item || "").toLowerCase().includes(itemQ) && !(r.spec || "").toLowerCase().includes(itemQ)) return false;
      const d = (r.out_date || "").slice(0, 10);
      if (!d || d < fromDate || d > toDate) return false;
      return true;
    });
  }, [rentals, customerQuery, siteQuery, itemQuery, fromDate, toDate, searched]);

  const totalSupply = filteredRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalVat = Math.round(totalSupply * 0.1);
  const totalWithVat = totalSupply + totalVat;

  const chartData = useMemo(() => {
    const byMonth = Object.fromEntries(monthKeys.map((k) => [k, 0]));
    for (const r of filteredRows) {
      const key = (r.out_date || "").slice(0, 7);
      if (key in byMonth) byMonth[key] += Number(r.amount) || 0;
    }
    return monthKeys.map((k) => ({ month: k.slice(2).replace("-", "."), amount: byMonth[k] }));
  }, [monthKeys, filteredRows]);

  const groups = useMemo(() => {
    const g = groupRentalsByVoucher(filteredRows);
    g.sort((a, b) => (b.head.out_date || "").localeCompare(a.head.out_date || "") || (b.voucherNo || "").localeCompare(a.voucherNo || ""));
    return g;
  }, [filteredRows]);

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>업체별 데이터</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        업체명과 기간을 입력하면 그 기간 동안의 매출 합계와 월별 추이를 볼 수 있어요. 현장명·품목명을 같이 입력하면 "A현장에 냉난방기만 몇 개 나갔는지"처럼 더 좁혀서 볼 수 있어요.
      </div>

      {bizRegDupGroups.length > 0 && (
        <div style={{ border: `1px solid ${C.brick}`, background: "#fff7f5", padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: serif, fontSize: 14.5, marginBottom: 4, color: C.brick }}>
            사업자등록번호가 같은데 거래처명이 다르게 등록된 곳이 있어요
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
            사업자등록번호를 기준으로 자동으로 찾은 결과예요. 통일하고 싶은 이름을 눌러서 하나로 합치면, 렌탈내역·구매내역 등
            모든 화면에서 그 이름 하나로 통일돼요.
          </div>
          {bizRegDupGroups.map((g) => {
            return (
              <div
                key={g.reg}
                style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${C.lineSoft}` }}
              >
                <div style={{ fontSize: 12, color: C.muted, minWidth: 110 }}>{formatBizRegNo(g.reg)}</div>
                {g.names.map((name) => {
                  const otherNames = g.names.filter((n) => n !== name);
                  const thisKey = name + "|" + otherNames.join(",");
                  return (
                    <button
                      key={name}
                      onClick={() => handleMergeCustomerGroup(name, otherNames)}
                      disabled={!!mergingReg}
                      style={miniBtnStyle}
                      title={`"${name}"(으)로 통합`}
                    >
                      {mergingReg === thisKey ? "통합 중…" : `"${name}"(으)로 통합`}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 14 }}>
          <Field label="업체명">
            <RecentValueInput
              storageKey="remarket_recent_customer"
              value={customerInput}
              onChange={setCustomerInput}
              onKeyDown={handleSearchKeyDown}
              extraOptions={customerOptions}
            />
          </Field>
          <Field label="현장명 (선택)">
            <RecentValueInput
              storageKey="remarket_recent_site"
              value={siteInput}
              onChange={setSiteInput}
              onKeyDown={handleSearchKeyDown}
              extraOptions={siteOptions}
            />
          </Field>
          <Field label="품목명 (선택)">
            <RecentValueInput
              storageKey="remarket_recent_item"
              value={itemInput}
              onChange={setItemInput}
              onKeyDown={handleSearchKeyDown}
              extraOptions={itemOptions}
            />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <Field label="기간(시작일)">
            <input type="date" style={inputStyle} value={fromDateInput} onChange={(e) => setFromDateInput(e.target.value)} />
          </Field>
          <Field label="기간(종료일)">
            <input type="date" style={inputStyle} value={toDateInput} onChange={(e) => setToDateInput(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={runSearch} style={primaryBtnStyle2}>검색</button>
          <button onClick={resetFilters} style={ghostBtnStyle}>초기화</button>
        </div>
      </div>

      {!searched && (
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 40, textAlign: "center", color: C.muted, fontSize: 13.5 }}>
          업체명을 입력하고 "검색" 버튼을 누르면 결과가 나와요.
        </div>
      )}

      {searched && (
        <>
          <div style={{ display: "flex", border: `1px solid ${C.line}`, background: C.panel, marginBottom: 16 }}>
            <StatCell label="건수" value={`${groups.length}건`} />
            <StatCell label="공급가액 합계" value={fmtWon(totalSupply)} />
            <StatCell label="부가세 합계" value={fmtWon(totalVat)} />
            <StatCell label="합계(VAT포함)" value={fmtWon(totalWithVat)} color={C.green} last />
          </div>

          <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: "20px 18px 8px", marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>월별 매출 추이</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.lineSoft} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.inkSoft }} axisLine={{ stroke: C.line }} tickLine={false} />
                <YAxis tickFormatter={(v) => fmtWonShort(v)} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={54} />
                <Tooltip formatter={(v) => fmtWon(v)} labelStyle={{ color: C.ink }} contentStyle={{ fontSize: 12.5, border: `1px solid ${C.line}`, fontFamily: sans }} />
                <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={C.ink} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: salesListGrid, gap: 8, padding: "10px 14px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.line}`, minWidth: 900 }}>
              <div>전표번호</div>
              <div>거래처</div>
              <div>담당자</div>
              <div>구분</div>
              <div>배송일자</div>
              <div>품목수</div>
              <div>공급가액</div>
              <div>부가세</div>
              <div>합계(VAT포함)</div>
            </div>

            {groups.map((g) => {
              const vat = Math.round(g.amount * 0.1);
              return (
                <div
                  key={g.key}
                  style={{ display: "grid", gridTemplateColumns: salesListGrid, gap: 8, padding: "12px 14px", fontSize: 13, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 900 }}
                >
                  <div>{g.voucherNo || "(번호없음)"}</div>
                  <div>{g.head.customer || "-"}</div>
                  <div>{g.head.manager || "-"}</div>
                  <div style={{ fontSize: 12.5 }}>{g.head.transaction_type === "rental" ? "렌탈" : "구매"}</div>
                  <div style={{ fontSize: 12.5 }}>{g.head.out_date || "-"}</div>
                  <div style={{ fontSize: 12.5 }}>{g.rows.length}건</div>
                  <div style={{ fontSize: 12.5 }}>{fmtWon(g.amount)}</div>
                  <div style={{ fontSize: 12.5 }}>{fmtWon(vat)}</div>
                  <div style={{ fontSize: 12.5, fontFamily: serif }}>{fmtWon(g.amount + vat)}</div>
                </div>
              );
            })}

            {groups.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>해당 기간에 이 업체의 매출 데이터가 없어요.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- 출고/회수 내역서(대장) ----------
const LEDGER_COLORS = ["연체리", "화이트", "월넛", "망비"];

// "W1800*D900, 연체리" 처럼 규격 끝에 색상이 붙어있으면 규격/색상을 분리한다.
// 마지막 콤마 구간이 정해진 색상 목록에 정확히 일치할 때만 분리하고, 그 외(예: "홀다리", "선반형" 같은 구조 설명)는
// 색상으로 잘못 떼어내지 않고 그대로 규격에 그대로 남겨둔다.
function splitLedgerSpecColor(rawSpec) {
  const spec = (rawSpec || "").trim();
  if (!spec) return { spec: "", color: "" };
  const parts = spec.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 && LEDGER_COLORS.includes(parts[parts.length - 1])) {
    return { spec: parts.slice(0, -1).join(", "), color: parts[parts.length - 1] };
  }
  return { spec, color: "" };
}

// 품목명이 글자 하나만 더(빠지거나·바뀌거나) 다를 뿐인지 확인한다("사무용의자" vs "사무의자"처럼 "용" 한
// 글자가 끼어든 경우 등). 편집거리(Levenshtein distance)가 0 또는 1이면 true — 정확히 같거나, 한 글자
// 삽입·삭제·교체 한 번으로 서로 같아지는 경우만 잡아서, 실제로 전혀 다른 품목이 우연히 걸릴 위험을 낮춘다.
function isOneEditApart(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let diff = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) diff++;
      if (diff > 1) return false;
    }
    return diff === 1;
  }
  const shorter = la < lb ? a : b;
  const longer = la < lb ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else if (!skipped) {
      skipped = true;
      j++;
    } else {
      return false;
    }
  }
  return true;
}

function sortLedgerItems(items) {
  return [...items].sort(
    (a, b) =>
      (a.item || "").localeCompare(b.item || "", "ko") ||
      (a.spec || "").localeCompare(b.spec || "", "ko") ||
      (a.color || "").localeCompare(b.color || "", "ko")
  );
}

// 정렬된 배열에서 같은 품목명이 연속으로 나오는 구간을 찾아, 표에서 품목 칸을 세로로 합쳐(rowSpan) 보여줄 수 있게 표시해둔다.
function withLedgerRowSpans(sortedItems) {
  const result = [];
  let i = 0;
  while (i < sortedItems.length) {
    let j = i;
    while (j < sortedItems.length && sortedItems[j].item === sortedItems[i].item) j++;
    for (let k = i; k < j; k++) result.push({ ...sortedItems[k], _rowSpan: k === i ? j - i : 0 });
    i = j;
  }
  return result;
}

const ledgerTh = { border: `1px solid ${C.line}`, padding: "6px 8px", background: C.bg, fontSize: 11.5, whiteSpace: "nowrap" };
const ledgerTd = { border: `1px solid ${C.line}`, padding: "6px 8px", fontSize: 12.5 };

function LedgerTab({ rentals, customers, isAdmin, managerName }) {
  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [showNewBook, setShowNewBook] = useState(false);
  const [newBookCustomer, setNewBookCustomer] = useState("");
  const [newBookSite, setNewBookSite] = useState("");
  const [creatingBook, setCreatingBook] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState(() => new Set());
  const [deletingSelectedBooks, setDeletingSelectedBooks] = useState(false);
  // 대장을 만든 뒤에도 현장명·담당자(필요하면 업체명까지)를 채우거나 고칠 수 있게 하는 목록 내 수정 상태.
  const [editingBookId, setEditingBookId] = useState(null);
  const [editCustomer, setEditCustomer] = useState("");
  const [editSite, setEditSite] = useState("");
  const [editManager, setEditManager] = useState("");
  const [editNote, setEditNote] = useState("");
  const [savingEditBook, setSavingEditBook] = useState(false);
  // 업체명/현장명 자동완성용으로 A/S내역도 가볍게 한 번만 불러온다(렌탈내역은 이미 props로 받아온 걸 그대로 쓴다).
  const [asRecordsLite, setAsRecordsLite] = useState([]);
  // 렌탈종료일 임박 표시용으로, 전체 대장의 전표·수량을 가볍게 한 번 불러온다(대장별 미회수수량·연결된 렌탈전표 계산용).
  const [auxVouchers, setAuxVouchers] = useState([]);
  const [auxEntries, setAuxEntries] = useState([]);

  useEffect(() => {
    fetchBooks();
    fetchAsRecordsLite();
    fetchLedgerAux();
  }, []);

  async function fetchBooks() {
    setLoadingBooks(true);
    const { data, error } = await supabase.from("ledger_books").select("*").order("created_at", { ascending: false });
    if (!error) setBooks(data || []);
    setLoadingBooks(false);
  }

  async function fetchAsRecordsLite() {
    const { data, error } = await supabase.from("as_requests").select("customer_name, address");
    if (!error) setAsRecordsLite(data || []);
    // as_requests 테이블이 아직 없거나 조회 권한이 없어도(마이그레이션 전) 자동완성 후보가 조금 줄어들 뿐,
    // 조용히 무시하고 나머지 자동완성(거래처 목록, 렌탈내역)은 그대로 동작한다.
  }

  async function fetchLedgerAux() {
    const [{ data: vc }, { data: en }] = await Promise.all([
      supabase.from("ledger_vouchers").select("id, ledger_book_id, kind, source, rental_voucher_no"),
      supabase.from("ledger_entries").select("ledger_voucher_id, qty"),
    ]);
    setAuxVouchers(vc || []);
    setAuxEntries(en || []);
  }

  // 렌탈내역의 전표번호별 렌탈만료일(같은 전표번호 안에 여러 줄이 있으면 그중 가장 빠른 날짜) 맵.
  const rentalDueByVoucherNo = useMemo(() => {
    const m = new Map();
    for (const r of rentals || []) {
      if (!r.voucher_no || !r.due_date) continue;
      const cur = m.get(r.voucher_no);
      if (!cur || r.due_date < cur) m.set(r.voucher_no, r.due_date);
    }
    return m;
  }, [rentals]);

  // 대장별 미회수수량 합계(출고 수량 - 회수 수량). 0 이하면 다 회수된 거라 임박 표시가 필요 없다.
  const bookRemainMap = useMemo(() => {
    const voucherInfo = new Map(auxVouchers.map((v) => [v.id, v]));
    const m = new Map();
    for (const e of auxEntries) {
      const v = voucherInfo.get(e.ledger_voucher_id);
      if (!v) continue;
      const sign = v.kind === "out" ? 1 : -1;
      m.set(v.ledger_book_id, (m.get(v.ledger_book_id) || 0) + sign * (Number(e.qty) || 0));
    }
    return m;
  }, [auxVouchers, auxEntries]);

  // 대장별로, 렌탈전표로 추가된 출고전표들 중 가장 빠른(=가장 임박한) 렌탈만료일.
  const bookDueMap = useMemo(() => {
    const m = new Map();
    for (const v of auxVouchers) {
      if (v.kind !== "out" || v.source !== "rental_voucher" || !v.rental_voucher_no) continue;
      const due = rentalDueByVoucherNo.get(v.rental_voucher_no);
      if (!due) continue;
      const cur = m.get(v.ledger_book_id);
      if (!cur || due < cur) m.set(v.ledger_book_id, due);
    }
    return m;
  }, [auxVouchers, rentalDueByVoucherNo]);

  // 대장의 렌탈종료일 임박 배지: 아직 회수 안 된(미회수수량>0) 대장에, 연결된 렌탈전표의 만료일이
  // 30일 이내(연체 포함)일 때만 보여준다. diff는 정렬에도 쓴다(작을수록=더 급함, 위로).
  function ledgerDueBadge(bookId) {
    const remain = bookRemainMap.get(bookId) || 0;
    if (remain <= 0) return null;
    const due = bookDueMap.get(bookId);
    if (!due) return null;
    const diff = daysBetween(todayISO(), due);
    if (diff > 30) return null;
    if (diff < 0) return { label: `연체 ${Math.abs(diff)}일`, fg: C.brick, bg: C.brickBg, diff };
    return { label: diff === 0 ? "오늘 만료" : `D-${diff}`, fg: C.amber, bg: C.amberBg, diff };
  }

  // 업체명 자동완성 후보: 거래처 목록(customers) + 렌탈내역 + A/S내역에 이미 등장한 이름을 모두 모아 중복 없이 정렬.
  const customerSuggestions = useMemo(
    () =>
      dedupeSorted([
        ...(customers || []).map((c) => c.name),
        ...(rentals || []).map((r) => r.customer),
        ...asRecordsLite.map((a) => a.customer_name),
      ]),
    [customers, rentals, asRecordsLite]
  );

  // 현장명 자동완성 후보: 렌탈내역에만 있는 정보라 렌탈내역에서 뽑는다. 업체명을 먼저 입력해뒀으면 그 업체의
  // 현장명만 추려서 더 정확하게 보여주고, 업체명이 비어있으면 전체 현장명 중에서 고를 수 있게 한다.
  const siteSuggestions = useMemo(() => {
    const cust = normalizeMatchText(newBookCustomer);
    const pool = cust ? (rentals || []).filter((r) => normalizeMatchText(r.customer) === cust) : rentals || [];
    return dedupeSorted(pool.map((r) => r.site_name));
  }, [rentals, newBookCustomer]);

  // 위쪽 검색창은 업체명/현장명/담당자를 한 칸에서 같이 찾는 자유 검색이라, 업체명 후보와 현장명 후보를 합쳐서 보여준다.
  const searchSuggestions = useMemo(
    () => dedupeSorted([...customerSuggestions, ...(rentals || []).map((r) => r.site_name)]),
    [customerSuggestions, rentals]
  );

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? books.filter((b) => [b.customer, b.site_name, b.manager, b.note].filter(Boolean).join(" ").toLowerCase().includes(q))
      : books;
    // 렌탈종료일이 임박(연체 포함)한 대장을 위로, 그 중에서도 더 급한 순서로 정렬한다.
    // 배지가 없는 대장들끼리는 원래 순서(최근 만든 순)를 그대로 유지한다.
    return [...list].sort((a, b) => {
      const da = ledgerDueBadge(a.id);
      const db = ledgerDueBadge(b.id);
      if (da && db) return da.diff - db.diff;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
  }, [books, query, bookRemainMap, bookDueMap]);

  async function handleCreateBook() {
    if (!newBookCustomer.trim()) {
      alert("업체명을 입력해주세요.");
      return;
    }
    setCreatingBook(true);
    const { data, error } = await supabase
      .from("ledger_books")
      .insert({
        customer: newBookCustomer.trim(),
        site_name: newBookSite.trim() || null,
        manager: isAdmin ? null : managerName,
      })
      .select()
      .single();
    setCreatingBook(false);
    if (error) {
      alert("대장을 만드는 중 오류가 발생했어요: " + error.message);
      return;
    }
    addRecentValue("remarket_recent_customer", newBookCustomer);
    if (newBookSite.trim()) addRecentValue("remarket_recent_ledger_site", newBookSite);
    setNewBookCustomer("");
    setNewBookSite("");
    setShowNewBook(false);
    await fetchBooks();
    setSelectedBookId(data.id);
  }

  function toggleBookSelected(id) {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allBooksSelected = filteredBooks.length > 0 && filteredBooks.every((b) => selectedBookIds.has(b.id));
  function toggleSelectAllBooks() {
    setSelectedBookIds(allBooksSelected ? new Set() : new Set(filteredBooks.map((b) => b.id)));
  }

  async function handleDeleteSelectedBooks() {
    if (selectedBookIds.size === 0) return;
    if (!confirm(`선택한 대장 ${selectedBookIds.size}개를 삭제할까요? 안에 있는 출고·회수 내역이 모두 지워지고 되돌릴 수 없어요.`)) return;
    const ids = Array.from(selectedBookIds);
    setDeletingSelectedBooks(true);
    const { error } = await supabase.from("ledger_books").delete().in("id", ids);
    setDeletingSelectedBooks(false);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    setSelectedBookIds(new Set());
    fetchBooks();
  }

  function startEditBook(b) {
    setEditingBookId(b.id);
    setEditCustomer(b.customer || "");
    setEditSite(b.site_name || "");
    setEditManager(b.manager || "");
    setEditNote(b.note || "");
  }
  function cancelEditBook() {
    setEditingBookId(null);
  }
  async function handleSaveEditBook(bookId) {
    if (!editCustomer.trim()) {
      alert("업체명을 입력해주세요.");
      return;
    }
    setSavingEditBook(true);
    const { error } = await supabase
      .from("ledger_books")
      .update({
        customer: editCustomer.trim(),
        site_name: editSite.trim() || null,
        manager: editManager.trim() || null,
        note: editNote.trim() || null,
      })
      .eq("id", bookId);
    setSavingEditBook(false);
    if (error) {
      alert("저장하는 중 오류가 발생했어요: " + error.message);
      return;
    }
    addRecentValue("remarket_recent_customer", editCustomer);
    if (editSite.trim()) addRecentValue("remarket_recent_ledger_site", editSite);
    setEditingBookId(null);
    fetchBooks();
  }

  if (selectedBookId) {
    return (
      <LedgerBookDetail
        bookId={selectedBookId}
        rentals={rentals}
        isAdmin={isAdmin}
        managerName={managerName}
        onClose={() => setSelectedBookId(null)}
        onBookListChanged={fetchBooks}
      />
    );
  }

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>현장별 렌탈잔량(심화관리)</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        업체(현장)별로 대장을 만들어두면, 전표가 새로 생길 때마다 계속 추가해서 출고·회수·미회수 수량을 관리할 수 있어요.
        아직 회수 안 된 렌탈의 렌탈종료일이 30일 이내로 다가오면 업체명 옆에 배지로 표시되고, 그런 대장이 목록 위쪽으로 올라와요.
        업체에 보여줄 정식 출고·회수 내역서가 필요할 때 이 화면에서 대장을 만들어 관리해주세요. 그냥 전체 잔량만 훑어보고 싶으면
        옆 메뉴의 "현장별 렌탈잔량(자동등록)"을 이용하세요.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ width: 320 }}>
          <RecentValueInput
            storageKey="remarket_recent_ledger_search"
            value={query}
            onChange={setQuery}
            placeholder="업체명, 현장명, 담당자 검색"
            extraOptions={searchSuggestions}
          />
        </div>
        <button onClick={() => setShowNewBook((v) => !v)} style={primaryBtnStyle2}>+ 새 대장 만들기</button>
      </div>

      {showNewBook && (
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="업체명">
              <RecentValueInput
                storageKey="remarket_recent_customer"
                value={newBookCustomer}
                onChange={setNewBookCustomer}
                placeholder="입력하면 렌탈내역·A/S내역에서 이미 쓰인 이름을 제안해요"
                extraOptions={customerSuggestions}
              />
            </Field>
            <Field label="현장명 (선택)">
              <RecentValueInput
                storageKey="remarket_recent_ledger_site"
                value={newBookSite}
                onChange={setNewBookSite}
                placeholder={newBookCustomer.trim() ? "이 업체의 렌탈내역에 있는 현장명을 제안해요" : "업체명을 먼저 입력하면 더 정확하게 제안돼요"}
                extraOptions={siteSuggestions}
              />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCreateBook} disabled={creatingBook} style={primaryBtnStyle2}>
              {creatingBook ? "만드는 중…" : "만들기"}
            </button>
            <button onClick={() => setShowNewBook(false)} style={ghostBtnStyle}>취소</button>
          </div>
        </div>
      )}

      {selectedBookIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft }}>{selectedBookIds.size}개 선택됨</span>
          <button
            onClick={handleDeleteSelectedBooks}
            disabled={deletingSelectedBooks}
            style={{ ...ghostBtnStyle, borderColor: C.brick, color: C.brick, padding: "5px 10px", fontSize: 12.5 }}
          >
            {deletingSelectedBooks ? "삭제 중…" : "선택 삭제"}
          </button>
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ display: "grid", gridTemplateColumns: "24px 1.1fr 0.9fr 0.9fr 1.5fr 0.9fr 118px", gap: 8, padding: "10px 14px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.line}`, alignItems: "center" }}>
          <input type="checkbox" checked={allBooksSelected} onChange={toggleSelectAllBooks} />
          <div>업체명</div>
          <div>현장명</div>
          <div>담당자</div>
          <div>비고</div>
          <div>만든 날짜</div>
          <div></div>
        </div>
        {filteredBooks.map((b) => {
          const isEditing = editingBookId === b.id;
          return (
            <div
              key={b.id}
              style={{ display: "grid", gridTemplateColumns: "24px 1.1fr 0.9fr 0.9fr 1.5fr 0.9fr 118px", gap: 8, padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${C.lineSoft}`, alignItems: "center" }}
            >
              <input type="checkbox" checked={selectedBookIds.has(b.id)} onChange={() => toggleBookSelected(b.id)} />
              {isEditing ? (
                <input style={smallInputStyle} value={editCustomer} onChange={(e) => setEditCustomer(e.target.value)} placeholder="업체명" />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setSelectedBookId(b.id)}
                    style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
                  >
                    {b.customer}
                  </button>
                  {(() => {
                    const badge = ledgerDueBadge(b.id);
                    if (!badge) return null;
                    return (
                      <span style={{ fontSize: 11, fontWeight: 600, color: badge.fg, background: badge.bg, borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
              )}
              {isEditing ? (
                <input style={smallInputStyle} value={editSite} onChange={(e) => setEditSite(e.target.value)} placeholder="현장명" />
              ) : (
                <div>{b.site_name || "-"}</div>
              )}
              {isEditing ? (
                <input style={smallInputStyle} value={editManager} onChange={(e) => setEditManager(e.target.value)} placeholder="담당자" />
              ) : (
                <div>{b.manager || "-"}</div>
              )}
              {isEditing ? (
                <input style={smallInputStyle} value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="자유롭게 메모를 적어주세요" />
              ) : (
                <div style={{ color: b.note ? C.ink : C.muted, whiteSpace: "pre-wrap" }}>{b.note || "-"}</div>
              )}
              <div style={{ fontSize: 12.5 }}>{(b.created_at || "").slice(0, 10)}</div>
              {isEditing ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => handleSaveEditBook(b.id)} disabled={savingEditBook} style={{ ...miniBtnStylePrimary, padding: "5px 8px", fontSize: 12 }}>
                    {savingEditBook ? "저장 중…" : "저장"}
                  </button>
                  <button onClick={cancelEditBook} style={{ ...ghostBtnStyle, padding: "5px 8px", fontSize: 12 }}>취소</button>
                </div>
              ) : (
                <button onClick={() => startEditBook(b)} style={{ ...ghostBtnStyle, padding: "5px 8px", fontSize: 12 }}>수정</button>
              )}
            </div>
          );
        })}
        {!loadingBooks && filteredBooks.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>등록된 대장이 없어요. "+ 새 대장 만들기"로 시작해보세요.</div>
        )}
      </div>
    </div>
  );
}

// ---------- 현장별 렌탈잔량(자동등록) ----------
// 위 LedgerTab(심화관리)처럼 대장을 따로 만들 필요 없이, 등록된 렌탈전표(구매 제외)를 자동으로 전부 모아
// 품목 단위 한 표로 보여준다. 대장 안 만든 현장도 렌탈전표만 등록돼 있으면 빠짐없이 다 잡힌다. 화면에서
// 잔량까지 계산해주진 않고, 엑셀로 통째로 내려받아서 직접 걸러 쓰는 용도다.
function LedgerAutoSummaryTab({ rentals, onRefresh, isAdmin = true, managerName = "", tonOverrides, onTonOverrideSaved }) {
  // 입력창에 타이핑하는 값(초안)과 실제로 검색에 적용된 값을 분리해서, "검색" 버튼을 눌러야(또는 Enter)
  // 결과에 반영되게 한다(업체별데이터 화면과 같은 방식).
  const [customerInput, setCustomerInput] = useState("");
  const [voucherInput, setVoucherInput] = useState("");
  const [fromDateInput, setFromDateInput] = useState("");
  const [toDateInput, setToDateInput] = useState("");

  const [customerQuery, setCustomerQuery] = useState("");
  const [voucherQuery, setVoucherQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [colWidths, startResize] = useResizableColumns([110, 130, 130, 90, 100, 100, 220, 80, 110, 90]);
  // 렌탈내역/구매내역처럼, 전표 단위로 한 줄만 보여주고 전표번호를 누르면 세부내역(품목 전체)이 나오게 한다.
  // (예전엔 품목 하나하나가 다 따로 줄로 나와서 한 현장에 품목이 많으면 목록이 너무 길어졌음)
  const [selectedKey, setSelectedKey] = useState(null);
  // 열 제목을 눌러 정렬하는 기능(렌탈내역/구매내역과 동일한 방식). 안 누르면 예전처럼 현장명→거래처→배송일자 순.
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  // "선택 제외"는 렌탈내역 원본(rentals)을 지우지 않고, 이 화면에서만 안 보이게 숨기는 방식으로 동작한다
  // (렌탈내역은 원본이라 절대 손상되면 안 됨). 숨긴 목록은 ledger_auto_hidden_rentals 테이블에 따로 저장한다.
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  // 전표 상세화면(RentalDetailPanel)에서 품목을 지우거나 전표를 "제외"해도 실제로는 이 숨김 목록에
  // 새로 추가되는 것뿐이라, 상세화면을 닫을 때(onSaved) 이 목록도 다시 불러와야 방금 처리한 건이
  // 바로 화면에서 사라진다.
  const fetchHiddenIds = () =>
    supabase
      .from("ledger_auto_hidden_rentals")
      .select("rental_id")
      .then(({ data }) => setHiddenIds(new Set((data || []).map((r) => r.rental_id))));

  useEffect(() => {
    fetchHiddenIds();
  }, []);

  // "같은 현장은 잔량 병합할 수 있는 기능" 요청 — 여러 전표(voucher)를 한 줄로 합쳐서 보여주는 기능.
  // 렌탈내역 원본(rentals)은 전혀 건드리지 않고, "어떤 전표들을 하나로 묶어 보여줄지"만
  // ledger_auto_voucher_merges에 따로 기록한다(voucher_no → 대표로 삼을 전표의 key). 대표 전표 자신은
  // 이 표에 없어도(자기 자신을 가리키는 걸로 취급) 되므로, 대표가 아닌 멤버들만 기록해두면 된다.
  const [voucherMergeMap, setVoucherMergeMap] = useState(() => new Map());
  const fetchVoucherMerges = () =>
    supabase
      .from("ledger_auto_voucher_merges")
      .select("voucher_no, group_voucher_no")
      .then(({ data }) => setVoucherMergeMap(new Map((data || []).map((r) => [r.voucher_no, r.group_voucher_no]))));
  useEffect(() => {
    fetchVoucherMerges();
  }, []);
  const [checkedMergeError, setCheckedMergeError] = useState(null);
  const [mergingVouchers, setMergingVouchers] = useState(false);
  const [voucherMergeKeepKey, setVoucherMergeKeepKey] = useState(null);
  const [savingVoucherMerge, setSavingVoucherMerge] = useState(false);
  const [unmergingKey, setUnmergingKey] = useState(null);
  // 병합된 전표를 눌러 들어간 상세화면(아래 selectedKey와 별개 — 병합 안 된 전표는 그대로
  // RentalDetailPanel을 그대로 쓰고, 병합된 전표만 이 새 상세화면을 쓴다).
  const [selectedMergedKey, setSelectedMergedKey] = useState(null);

  // 렌탈전표만(구매 제외) 모으고, 이 화면에서 "제외" 처리된 건은 뺀다. transaction_type이 비어있는 옛 데이터는 렌탈로 취급한다(다른 화면들과 동일한 규칙).
  const rentalRows = useMemo(
    () => (rentals || []).filter((r) => (r.transaction_type || "rental") !== "purchase" && !hiddenIds.has(r.id)),
    [rentals, hiddenIds]
  );
  const hiddenRentalRows = useMemo(() => (rentals || []).filter((r) => hiddenIds.has(r.id)), [rentals, hiddenIds]);

  const customerSuggestions = useMemo(() => dedupeSorted(rentalRows.map((r) => r.customer)), [rentalRows]);

  // 화면에는 전표 단위로 묶어서 한 줄씩만 보여준다(렌탈내역/구매내역과 같은 방식).
  const allGroups = useMemo(() => groupRentalsByVoucher(rentalRows), [rentalRows]);

  // 상태(정상/반납임박/연체/회수완료)는 급한 순서대로 — 병합된 전표는 멤버 중 가장 급한 상태를 대표로
  // 보여준다(하나라도 연체면 "연체"로 보여야 놓치지 않는다).
  const STATUS_URGENCY = ["overdue", "soon", "normal", "collected", "purchase"];

  // 위 전표 단위 그룹(allGroups)을 voucherMergeMap에 따라 한 번 더 묶는다. 병합된 적 없는 전표는 그대로
  // 혼자(멤버 1개)인 자기 자신의 그룹이 된다 — 그래서 "병합"은 기존 화면 동작에 아무 영향을 주지 않고,
  // 병합을 실제로 걸어둔 전표들에만 적용된다. g.key(voucher_no가 없는 옛 데이터를 위한 합성 키도 포함)를
  // 기준으로 묶어서, voucher_no가 비어있는 행들이 서로 잘못 뭉치는 일이 없게 한다.
  const allMergedGroups = useMemo(() => {
    const byEffectiveKey = new Map();
    for (const g of allGroups) {
      const effectiveKey = voucherMergeMap.get(g.key) || g.key;
      if (!byEffectiveKey.has(effectiveKey)) byEffectiveKey.set(effectiveKey, []);
      byEffectiveKey.get(effectiveKey).push(g);
    }
    return Array.from(byEffectiveKey.entries()).map(([effectiveKey, members]) => {
      // 대표 전표 자신이 지금은 화면에서 필터링돼 안 보이는 드문 경우를 대비해, members 중 key가
      // effectiveKey와 같은 걸 대표로 우선 찾고 없으면 그냥 첫 멤버를 대표로 취급한다.
      const repMember = members.find((m) => m.key === effectiveKey) || members[0];
      const memberStatuses = members.map((m) =>
        getStatus({ transaction_type: m.head.transaction_type, collected: m.rows.every((r) => r.collected), due_date: m.head.due_date })
      );
      memberStatuses.sort((a, b) => STATUS_URGENCY.indexOf(a) - STATUS_URGENCY.indexOf(b));
      const isMerged = members.length > 1;
      return {
        key: effectiveKey,
        voucherNo: isMerged ? `${repMember.voucherNo || "(번호없음)"} 외 ${members.length - 1}건` : repMember.voucherNo,
        repVoucherNo: repMember.voucherNo,
        memberVoucherNos: members.map((m) => m.voucherNo),
        memberKeys: members.map((m) => m.key),
        members,
        head: repMember.head,
        rows: members.flatMap((m) => m.rows),
        amount: members.reduce((s, m) => s + m.amount, 0),
        isMerged,
        _status: memberStatuses[0],
      };
    });
  }, [allGroups, voucherMergeMap]);

  const filteredRows = useMemo(() => {
    const cq = customerQuery.trim().toLowerCase();
    const vq = voucherQuery.trim().toLowerCase();
    return rentalRows.filter((r) => {
      const d = (r.out_date || "").slice(0, 10);
      if (fromDate && (!d || d < fromDate)) return false;
      if (toDate && (!d || d > toDate)) return false;
      if (cq && !(r.customer || "").toLowerCase().includes(cq)) return false;
      if (vq && !(r.voucher_no || "").toLowerCase().includes(vq)) return false;
      return true;
    });
  }, [rentalRows, customerQuery, voucherQuery, fromDate, toDate]);

  // (2026-10-01 변경) 병합된 전표는 멤버 중 하나라도 검색 조건(거래처/전표번호/배송일자)에 걸리면 그
  // 병합 그룹 전체(모든 멤버 합산)를 보여준다 — 검색 때문에 병합된 전표가 반쪽만 보이면 합계가 틀려
  // 보이므로, "걸리면 통째로" 방식으로 통일했다.
  const RENTAL_LIST_STATUS_RANK = { overdue: 0, soon: 1, normal: 2, collected: 3, purchase: 4 };
  const filteredGroupsBase = useMemo(() => {
    const cq = customerQuery.trim().toLowerCase();
    const vq = voucherQuery.trim().toLowerCase();
    return allMergedGroups.filter((mg) =>
      mg.members.some((g) => {
        const d = (g.head.out_date || "").slice(0, 10);
        if (fromDate && (!d || d < fromDate)) return false;
        if (toDate && (!d || d > toDate)) return false;
        if (cq && !(g.head.customer || "").toLowerCase().includes(cq)) return false;
        if (vq && !(g.voucherNo || "").toLowerCase().includes(vq)) return false;
        return true;
      })
    );
  }, [allMergedGroups, customerQuery, voucherQuery, fromDate, toDate]);

  const sortAccessors = {
    전표번호: (g) => g.repVoucherNo || g.voucherNo || "",
    거래처: (g) => g.head.customer || "",
    현장명: (g) => g.head.site_name || "",
    담당자: (g) => g.head.manager || "",
    배송일자: (g) => g.head.out_date || "",
    렌탈종료일자: (g) => g.head.due_date || "",
    수량: (g) => g.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0),
    금액: (g) => g.amount,
    상태: (g) => RENTAL_LIST_STATUS_RANK[g._status] ?? 9,
  };
  const handleSortClick = (label) => {
    if (!sortAccessors[label]) return;
    if (sortKey === label) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(label);
      setSortDir("asc");
    }
  };

  const filteredGroups = useMemo(() => {
    const list = [...filteredGroupsBase];
    if (!sortKey || !sortAccessors[sortKey]) {
      list.sort(
        (a, b) =>
          (a.head.site_name || "").localeCompare(b.head.site_name || "", "ko") ||
          (a.head.customer || "").localeCompare(b.head.customer || "", "ko") ||
          (a.head.out_date || "").localeCompare(b.head.out_date || "")
      );
      return list;
    }
    const acc = sortAccessors[sortKey];
    list.sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      let cmp;
      if (typeof va === "number" || typeof vb === "number") cmp = (Number(va) || 0) - (Number(vb) || 0);
      else cmp = String(va).localeCompare(String(vb), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredGroupsBase, sortKey, sortDir]);

  const filtersActive = customerQuery.trim() || voucherQuery.trim() || fromDate || toDate;
  const runSearch = () => {
    setCustomerQuery(customerInput);
    setVoucherQuery(voucherInput);
    setFromDate(fromDateInput);
    setToDate(toDateInput);
  };
  const resetFilters = () => {
    setCustomerInput("");
    setVoucherInput("");
    setFromDateInput("");
    setToDateInput("");
    setCustomerQuery("");
    setVoucherQuery("");
    setFromDate("");
    setToDate("");
  };
  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") runSearch();
  };

  const totalQty = filteredRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const gridTemplate = "32px " + colWidths.map((w) => `${w}px`).join(" ");

  const visibleKeys = filteredGroups.map((g) => g.key);
  const allChecked = visibleKeys.length > 0 && visibleKeys.every((k) => checkedIds.has(k));
  const someChecked = visibleKeys.some((k) => checkedIds.has(k));
  const selectAllRef = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);

  // 이 위까지 모든 훅(useState/useMemo/useRef/useEffect)을 먼저 다 호출한 다음에만 조건부로 화면을 바꿔야
  // 한다(그렇지 않으면 "전표번호 클릭 시 오류" 같은 훅 순서 오류가 남 — 렌탈내역/판매현황과 동일한 패턴).
  const selectedGroup = allGroups.find((g) => g.key === selectedKey) || null;
  // "전표번호 누르고 들어가면 2개 전표의 품명/규격이 상이해도 같은 품목일 수 있으니 체크해서 병합" 요청
  // — 병합된 전표만 이 새 상세화면(MergedVoucherDetailPanel)을 쓰고, 병합 안 된 전표는 예전 그대로
  // RentalDetailPanel을 그대로 쓴다(기존 전표 수정·삭제 등 다른 기능은 전혀 안 건드림).
  const selectedMergedGroup = selectedMergedKey ? allMergedGroups.find((mg) => mg.key === selectedMergedKey) || null : null;
  if (selectedMergedGroup) {
    return (
      <MergedVoucherDetailPanel
        mergedGroup={selectedMergedGroup}
        onClose={() => setSelectedMergedKey(null)}
        onUnmerge={() => {
          handleUnmergeVoucherGroup(selectedMergedGroup.key);
          setSelectedMergedKey(null);
        }}
        onExcludeIds={handleExcludeRentalIds}
      />
    );
  }
  if (selectedGroup) {
    return (
      <RentalDetailPanel
        group={selectedGroup}
        onClose={() => setSelectedKey(null)}
        onSaved={() => {
          onRefresh && onRefresh();
          fetchHiddenIds();
          setSelectedKey(null);
        }}
        isAdmin={isAdmin}
        managerName={managerName}
        tonOverrides={tonOverrides}
        onTonOverrideSaved={onTonOverrideSaved}
        hideInsteadOfDelete
      />
    );
  }

  // "같은 현장은 잔량 병합" 요청 — 체크한 전표들이 전부 같은 현장인지 먼저 확인하고, 맞으면 대표로
  // 보여줄 전표를 고르는 패널을 연다. 하나라도 현장이 다르면 병합하지 않고 안내만 보여준다.
  function handleStartMergeVouchers() {
    const checked = filteredGroups.filter((g) => checkedIds.has(g.key));
    const siteNames = new Set(checked.map((g) => (g.head.site_name || "").trim()));
    if (siteNames.size !== 1 || [...siteNames][0] === "") {
      setCheckedMergeError("선택한 전표들의 현장명이 서로 달라요(또는 비어있어요). 같은 현장끼리만 병합할 수 있어요.");
      setVoucherMergeKeepKey(null);
    } else {
      setCheckedMergeError(null);
      setVoucherMergeKeepKey(checked[0]?.key || null);
    }
    setMergingVouchers(true);
  }

  // 대표로 고른 전표(voucherMergeKeepKey) 아래로, 선택한 전표들(이미 병합돼 있던 전표면 그 멤버 전부
  // 포함)의 나머지를 전부 새로 가리키게 한다 — 이미 병합된 그룹끼리 다시 병합해도(체인) 항상 한 단계로
  // 정리된다.
  async function handleConfirmMergeVouchers() {
    if (!voucherMergeKeepKey) return;
    const checked = filteredGroups.filter((g) => checkedIds.has(g.key));
    const repGroup = checked.find((g) => g.key === voucherMergeKeepKey);
    if (!repGroup) return;
    const representative = repGroup.key;
    const memberKeys = Array.from(new Set(checked.flatMap((g) => g.memberKeys)));
    const rowsToUpsert = memberKeys.filter((k) => k !== representative).map((k) => ({ voucher_no: k, group_voucher_no: representative }));
    if (rowsToUpsert.length === 0) {
      setMergingVouchers(false);
      setVoucherMergeKeepKey(null);
      return;
    }
    setSavingVoucherMerge(true);
    const { error } = await supabase.from("ledger_auto_voucher_merges").upsert(rowsToUpsert, { onConflict: "voucher_no" });
    setSavingVoucherMerge(false);
    if (error) {
      alert("병합 중 오류가 발생했어요: " + error.message);
      return;
    }
    setMergingVouchers(false);
    setVoucherMergeKeepKey(null);
    setCheckedIds(new Set());
    fetchVoucherMerges();
  }

  async function handleUnmergeVoucherGroup(groupKey) {
    if (!confirm("이 전표 병합을 풀까요? 다시 각각 따로 보여요(전표 원본에는 영향 없어요).")) return;
    setUnmergingKey(groupKey);
    const { error } = await supabase.from("ledger_auto_voucher_merges").delete().eq("group_voucher_no", groupKey);
    setUnmergingKey(null);
    if (error) {
      alert("병합 해제 중 오류가 발생했어요: " + error.message);
      return;
    }
    fetchVoucherMerges();
  }

  const toggleChecked = (key) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCheckedAll = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  async function handleDeleteSelected() {
    if (checkedIds.size === 0) return;
    if (
      !confirm(
        `선택한 전표 ${checkedIds.size}건을 이 목록에서 제외할까요?\n렌탈내역 원본 데이터는 지워지지 않고 그대로 남아있고, 이 화면에서만 안 보이게 됩니다.\n(나중에 "제외된 품목 보기"에서 다시 꺼내올 수 있어요)`
      )
    )
      return;
    setDeletingSelected(true);
    const idsToHide = filteredGroups.filter((g) => checkedIds.has(g.key)).flatMap((g) => g.rows.map((r) => r.id));
    const rows = idsToHide.map((id) => ({ rental_id: id }));
    const { error } = await supabase.from("ledger_auto_hidden_rentals").upsert(rows, { onConflict: "rental_id" });
    setDeletingSelected(false);
    if (error) {
      alert("처리 중 오류가 발생했어요: " + error.message);
      return;
    }
    setHiddenIds((prev) => {
      const next = new Set(prev);
      idsToHide.forEach((id) => next.add(id));
      return next;
    });
    setCheckedIds(new Set());
  }

  // 병합된 전표 상세화면(MergedVoucherDetailPanel) 안에서 "선택 삭제"를 눌렀을 때도 똑같이 숨김
  // 목록(ledger_auto_hidden_rentals)에 추가하는 방식 — rental_id를 직접 받아 처리한다는 점만 다르다.
  // true/false를 돌려줘서, 상세화면 쪽에서 성공했을 때만 체크박스 선택을 풀 수 있게 한다.
  async function handleExcludeRentalIds(ids) {
    if (!ids || ids.length === 0) return false;
    if (
      !confirm(
        `선택한 품목 ${ids.length}건을 이 목록에서 제외할까요?\n렌탈내역 원본 데이터는 지워지지 않고 그대로 남아있고, 이 화면에서만 안 보이게 됩니다.`
      )
    )
      return false;
    const rows = ids.map((id) => ({ rental_id: id }));
    const { error } = await supabase.from("ledger_auto_hidden_rentals").upsert(rows, { onConflict: "rental_id" });
    if (error) {
      alert("처리 중 오류가 발생했어요: " + error.message);
      return false;
    }
    setHiddenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    return true;
  }

  async function handleRestoreHidden(id) {
    setRestoringId(id);
    const { error } = await supabase.from("ledger_auto_hidden_rentals").delete().eq("rental_id", id);
    setRestoringId(null);
    if (error) {
      alert("복원 중 오류가 발생했어요: " + error.message);
      return;
    }
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleExportExcel() {
    const XLSX = await import("xlsx");
    const header = ["전표번호", "거래처", "현장명", "담당자", "배송일자", "렌탈종료일자", "품목", "규격", "수량", "금액"];
    const rows = filteredRows.map((r) => [
      r.voucher_no || "",
      r.customer || "",
      r.site_name || "",
      r.manager || "",
      (r.out_date || "").slice(0, 10),
      (r.due_date || "").slice(0, 10),
      r.item || "",
      r.spec || "",
      Number(r.qty) || 0,
      Number(r.amount) || 0,
    ]);
    const aoa = [["현장별 렌탈잔량(자동등록) — 전체 렌탈 통합"], [`추출일: ${todayISO()}`], [], header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 8 }, { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "렌탈 통합");
    XLSX.writeFile(wb, `렌탈잔량_전체통합_${todayISO()}.xlsx`);
  }

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>현장별 렌탈잔량(자동등록)</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        대장을 따로 만들지 않아도, 구매 건을 뺀 렌탈전표 전체를 자동으로 모아 전표 단위로 보여줘요(렌탈내역과 같은 방식). 현장명 →
        업체명 → 배송일자 순으로 정렬돼 있고, 전표번호를 누르면 품목 세부내역을 볼 수 있어요. 품목 단위로 통째로 받고 싶으면 "엑셀로
        다운로드"를 이용하세요.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
        <Field label="업체명">
          <div style={{ width: 220 }}>
            <RecentValueInput
              storageKey="remarket_recent_customer"
              value={customerInput}
              onChange={setCustomerInput}
              onKeyDown={handleSearchKeyDown}
              extraOptions={customerSuggestions}
            />
          </div>
        </Field>
        <Field label="전표번호">
          <input
            value={voucherInput}
            onChange={(e) => setVoucherInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={{ ...inputStyle, width: 150 }}
          />
        </Field>
        <Field label="배송일자(시작)">
          <input type="date" value={fromDateInput} onChange={(e) => setFromDateInput(e.target.value)} style={{ ...inputStyle, width: 150 }} />
        </Field>
        <Field label="배송일자(종료)">
          <input type="date" value={toDateInput} onChange={(e) => setToDateInput(e.target.value)} style={{ ...inputStyle, width: 150 }} />
        </Field>
        <button onClick={runSearch} style={{ ...primaryBtnStyle2, marginBottom: 1 }}>검색</button>
        {filtersActive && (
          <button onClick={resetFilters} style={{ ...ghostBtnStyle, marginBottom: 1 }}>초기화</button>
        )}
        <button onClick={handleExportExcel} style={{ ...ghostBtnStyle, marginBottom: 1 }}>엑셀로 다운로드</button>
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 9 }}>
          {filteredGroups.length}건 · 수량 합계 {totalQty.toLocaleString("ko-KR")}개
        </div>
      </div>

      {checkedIds.size > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: C.amberBg, fontSize: 12.5 }}>
            <div>{checkedIds.size}건 선택됨</div>
            {checkedIds.size >= 2 && (
              <button onClick={handleStartMergeVouchers} style={miniBtnStyle}>선택 병합</button>
            )}
            <button onClick={handleDeleteSelected} disabled={deletingSelected} style={{ ...miniBtnStyle, borderColor: C.brick, color: C.brick }}>
              {deletingSelected ? "제외 처리 중…" : "선택 제외"}
            </button>
            <button onClick={() => { setCheckedIds(new Set()); setMergingVouchers(false); }} style={miniBtnStyle}>선택 해제</button>
            <div style={{ fontSize: 11.5, color: C.muted }}>렌탈내역 원본은 지워지지 않아요 — 이 화면에서만 안 보이게 됩니다</div>
          </div>
          {/* "같은 현장은 잔량 병합할 수 있는 기능" 요청 — 체크한 전표들을 한 줄로 합쳐서 보여준다(전표
              번호는 대표전표번호 외 N건으로 표시됨). 같은 품목인데 등록할 때 이름이 서로 다르게 적힌
              경우를 합치는 LedgerBookDetail의 "선택한 품목 병합"(라디오로 남길 이름 고르기)과 같은
              방식을 그대로 따랐다. */}
          {mergingVouchers && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, background: C.mutedBg, display: "flex", flexDirection: "column", gap: 6, maxWidth: 560 }}>
              {checkedMergeError ? (
                <div style={{ fontSize: 12.5, color: C.brick }}>{checkedMergeError}</div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: C.inkSoft }}>
                    같은 현장의 전표 {checkedIds.size}건을 하나로 합쳐서 보여줘요(렌탈전표 원본은 그대로 남아있고, 이 화면에서만 한 줄로
                    묶여 보여요 — 전표번호는 "대표전표번호 외 N건"으로 표시돼요). 대표로 보여줄 전표를 골라주세요.
                  </div>
                  {filteredGroups
                    .filter((g) => checkedIds.has(g.key))
                    .map((g) => (
                      <label key={g.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                        <input type="radio" name="voucherMergeKeep" checked={voucherMergeKeepKey === g.key} onChange={() => setVoucherMergeKeepKey(g.key)} />
                        <span>
                          {g.voucherNo} · {g.head.customer || "-"} · 수량 {g.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0).toLocaleString("ko-KR")}개
                        </span>
                      </label>
                    ))}
                </>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {!checkedMergeError && (
                  <button
                    onClick={handleConfirmMergeVouchers}
                    disabled={savingVoucherMerge || !voucherMergeKeepKey}
                    style={{ ...primaryBtnStyle2, padding: "5px 10px", fontSize: 12.5 }}
                  >
                    {savingVoucherMerge ? "병합 중…" : "이 전표를 대표로 병합하기"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setMergingVouchers(false);
                    setVoucherMergeKeepKey(null);
                    setCheckedMergeError(null);
                  }}
                  style={{ ...ghostBtnStyle, padding: "5px 10px", fontSize: 12.5 }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {hiddenRentalRows.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={() => setShowHidden((v) => !v)} style={{ ...ghostBtnStyle, fontSize: 12 }}>
            {showHidden ? "제외된 품목 숨기기" : `제외된 품목 보기 (${hiddenRentalRows.length})`}
          </button>
          {showHidden && (
            <div style={{ marginTop: 8, border: `1px solid ${C.lineSoft}`, background: C.bg, padding: 10 }}>
              {hiddenRentalRows.map((r) => (
                <div
                  key={r.id}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px", fontSize: 12.5, borderBottom: `1px solid ${C.lineSoft}` }}
                >
                  <div style={{ flex: 1 }}>
                    {r.customer} · {r.site_name || "-"} · {r.item} {r.spec ? `(${r.spec})` : ""} · {r.qty}개
                  </div>
                  <button
                    onClick={() => handleRestoreHidden(r.id)}
                    disabled={restoringId === r.id}
                    style={{ ...miniBtnStyle, padding: "3px 8px", fontSize: 11.5 }}
                  >
                    {restoringId === r.id ? "복원 중…" : "복원"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            gap: 8,
            padding: "10px 14px",
            fontSize: 11.5,
            color: C.muted,
            borderBottom: `1px solid ${C.line}`,
            minWidth: 1130,
          }}
        >
          <div>
            <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleCheckedAll} />
          </div>
          {["전표번호", "거래처", "현장명", "담당자", "배송일자", "렌탈종료일자", "품목", "수량", "금액", "상태"].map((label, i) =>
            sortAccessors[label] ? (
              <div key={label} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => handleSortClick(label)}
                  title="눌러서 정렬"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    fontSize: 11.5,
                    color: sortKey === label ? C.ink : C.muted,
                    fontWeight: sortKey === label ? 700 : 400,
                  }}
                >
                  {label}
                  <span style={{ fontSize: 9, opacity: sortKey === label ? 1 : 0.35 }}>{sortKey === label ? (sortDir === "asc" ? "▲" : "▼") : "▲"}</span>
                </button>
                <ColResizeHandle onMouseDown={startResize(i)} />
              </div>
            ) : (
              <div key={label} style={{ position: "relative" }}>
                {label}
                <ColResizeHandle onMouseDown={startResize(i)} />
              </div>
            )
          )}
        </div>
        {filteredGroups.map((g) => {
          const meta = STATUS_META[g._status];
          const first = g.rows[0];
          const extra = g.rows.length - 1;
          const qtySum = g.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
          return (
            <div
              key={g.key}
              style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 8, padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${C.lineSoft}`, minWidth: 1130, alignItems: "center" }}
            >
              <div>
                <input type="checkbox" checked={checkedIds.has(g.key)} onChange={() => toggleChecked(g.key)} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <button
                  onClick={() => (g.isMerged ? setSelectedMergedKey(g.key) : setSelectedKey(g.key))}
                  style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
                >
                  {g.voucherNo || "(번호없음)"}
                </button>
                {g.isMerged && (
                  <button
                    onClick={() => handleUnmergeVoucherGroup(g.key)}
                    disabled={unmergingKey === g.key}
                    title="전표 병합 풀기(원본은 그대로예요)"
                    style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline" }}
                  >
                    {unmergingKey === g.key ? "해제 중…" : "병합 해제"}
                  </button>
                )}
              </div>
              <div>{g.head.customer || "-"}</div>
              <div style={{ color: C.inkSoft, fontSize: 12.5 }}>{g.head.site_name || "-"}</div>
              <div>{g.head.manager || "-"}</div>
              <div style={{ fontSize: 12.5 }}>{(g.head.out_date || "").slice(0, 10) || "-"}</div>
              <div style={{ fontSize: 12.5 }}>{(g.head.due_date || "").slice(0, 10) || "-"}</div>
              <div>
                {first?.item || "-"}
                {extra > 0 ? ` 외 ${extra}건` : ""}
              </div>
              <div>{qtySum.toLocaleString("ko-KR")}</div>
              <div>{fmtWon(g.amount)}</div>
              <div>
                <span style={{ fontSize: 11.5, padding: "3px 9px", background: meta.bg, color: meta.fg }}>{meta.label}</span>
              </div>
            </div>
          );
        })}
        {filteredGroups.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>조건에 맞는 렌탈전표가 없어요.</div>
        )}
      </div>
    </div>
  );
}

// ---------- 병합된 전표 상세보기 (현장별 렌탈잔량 자동등록) ----------
// "전표번호는 대표전표번호 외로 구현이 되겠지... 전표번호 누르고 들어가면 2개 전표의 품명/규격 등이
// 상이하더라도 같은 품목일 수 있잖아 그것도 체크해서 병합할 수 있게" 요청으로 만들었다. 기존
// RentalDetailPanel은 전표 "하나"를 전제로 직접 수정·삭제까지 하는 무거운 편집 화면이라, 여러 전표를
// 합쳐 보여주는 이 화면에 그대로 끼워 쓰지 않고 따로 만들었다 — 렌탈내역 원본은 전혀 건드리지 않고,
// 품목을 "어떤 이름으로 묶어 보여줄지"만 ledger_auto_item_merges에 따로 기록하는 보기 전용 화면이다.
function MergedVoucherDetailPanel({ mergedGroup, onClose, onUnmerge, onExcludeIds }) {
  const { key: groupKey, repVoucherNo, memberVoucherNos, head, rows } = mergedGroup;
  const [itemMergeMap, setItemMergeMap] = useState(() => new Map()); // rental_id -> {display_item, display_spec}

  const fetchItemMerges = () =>
    supabase
      .from("ledger_auto_item_merges")
      .select("rental_id, display_item, display_spec")
      .eq("group_voucher_no", groupKey)
      .then(({ data }) =>
        setItemMergeMap(new Map((data || []).map((r) => [r.rental_id, { display_item: r.display_item, display_spec: r.display_spec }])))
      );

  useEffect(() => {
    fetchItemMerges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  // 각 원본 행에 품목 병합 기록이 있으면 그 이름으로, 없으면 원래 이름 그대로 "화면에 보여줄 이름"을 정한다.
  const effectiveRows = useMemo(
    () =>
      rows.map((r) => {
        const ov = itemMergeMap.get(r.id);
        return {
          ...r,
          _dispItem: ov ? ov.display_item : r.item,
          _dispSpec: ov ? ov.display_spec || "" : r.spec || "",
          _merged: !!ov,
        };
      }),
    [rows, itemMergeMap]
  );

  // (2026-10-01) "마감바 H1200이 2개, 3개, 5개 나뉘어 있으면 이걸 하나로 기본 취급해서... 어지간하면
  // 처음부터 합산해서 보여줘, 너저분하잖냐" 요청 — 표시 이름(품목+규격)이 완전히 같은 행은 따로 체크해서
  // 병합할 필요 없이 처음부터 자동으로 한 줄에 수량·금액을 합쳐서 보여준다. "선택 항목 병합"은 품명·규격
  // 글자 자체가 다르게 적혀서 자동으로는 안 묶이는 경우(예: "사무용책상" vs "책상")에만 쓰면 된다 — 그렇게
  // 묶고 나면 표시 이름이 같아지므로 이후로는 이 자동 합산 로직에 의해 자연스럽게 한 줄로 계속 묶여 보인다.
  const displayRows = useMemo(() => {
    const map = new Map();
    for (const r of effectiveRows) {
      const k = `${r._dispItem}|${r._dispSpec}`;
      if (!map.has(k)) {
        map.set(k, { key: k, dispItem: r._dispItem, dispSpec: r._dispSpec, qty: 0, amount: 0, voucherNos: [], notes: [], members: [] });
      }
      const g = map.get(k);
      g.qty += Number(r.qty) || 0;
      g.amount += Number(r.amount) || 0;
      if (r.voucher_no && !g.voucherNos.includes(r.voucher_no)) g.voucherNos.push(r.voucher_no);
      if (r.note && !g.notes.includes(r.note)) g.notes.push(r.note);
      g.members.push(r);
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      ids: g.members.map((m) => m.id),
      // "병합 해제"는 실제로 ledger_auto_item_merges에 기록이 남은(이름을 수동으로 맞춘) 멤버만 대상으로
      // 한다 — 처음부터 글자가 같아서 자동으로 묶인 행은 되돌릴 "병합" 자체가 없다.
      overriddenIds: g.members.filter((m) => m._merged).map((m) => m.id),
      autoGrouped: g.members.length > 1,
    }));
  }, [effectiveRows]);

  const [checkedGroupKeys, setCheckedGroupKeys] = useState(() => new Set());
  const toggleGroup = (key) =>
    setCheckedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [mergingRaw, setMergingRaw] = useState(false);
  const [rawMergeKeepKey, setRawMergeKeepKey] = useState(null);
  const [savingRawMerge, setSavingRawMerge] = useState(false);
  const [unmergingGroupKey, setUnmergingGroupKey] = useState(null);
  const [excludingRaw, setExcludingRaw] = useState(false);

  // 다른 목록 화면들(렌탈내역/구매내역/자동등록 등)과 똑같이 열 너비는 드래그로, 정렬은 열 제목을
  // 눌러서 하는 방식을 그대로 가져왔다 — "간격조절·소팅은 기본중의 기본" 요청.
  const [colWidths, startResize] = useResizableColumns([130, 220, 160, 70, 110, 170]);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const sortAccessors = {
    전표번호: (g) => g.voucherNos[0] || "",
    품목: (g) => g.dispItem || "",
    규격: (g) => g.dispSpec || "",
    수량: (g) => g.qty,
    금액: (g) => g.amount,
    비고: (g) => g.notes.join(" "),
  };
  const handleSortClick = (label) => {
    if (!sortAccessors[label]) return;
    if (sortKey === label) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(label);
      setSortDir("asc");
    }
  };
  const sortedDisplayRows = useMemo(() => {
    if (!sortKey || !sortAccessors[sortKey]) return displayRows;
    const acc = sortAccessors[sortKey];
    const list = [...displayRows];
    list.sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      const cmp = typeof va === "number" || typeof vb === "number" ? (Number(va) || 0) - (Number(vb) || 0) : String(va).localeCompare(String(vb), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRows, sortKey, sortDir]);

  // 체크한 줄(이미 자동으로 합산된 그룹일 수도 있음) 중 "대표로 보여줄 이름"을 하나 골라, 나머지 체크한
  // 그룹에 속한 원본 행 전부를 그 이름으로 덮어쓴다 — 이후엔 표시 이름이 같아지므로 자동 합산 로직이
  // 알아서 한 줄로 묶어 보여준다. 원본 rentals.item/spec은 전혀 바뀌지 않는다.
  async function handleConfirmRawMerge() {
    if (!rawMergeKeepKey || checkedGroupKeys.size < 2) return;
    const keepGroup = displayRows.find((g) => g.key === rawMergeKeepKey);
    if (!keepGroup) return;
    const otherIds = displayRows
      .filter((g) => checkedGroupKeys.has(g.key) && g.key !== rawMergeKeepKey)
      .flatMap((g) => g.ids);
    if (otherIds.length === 0) return;
    setSavingRawMerge(true);
    const rowsToUpsert = otherIds.map((id) => ({
      rental_id: id,
      group_voucher_no: groupKey,
      display_item: keepGroup.dispItem,
      display_spec: keepGroup.dispSpec || null,
    }));
    const { error } = await supabase.from("ledger_auto_item_merges").upsert(rowsToUpsert, { onConflict: "rental_id" });
    setSavingRawMerge(false);
    if (error) {
      alert("품목 병합 중 오류가 발생했어요: " + error.message);
      return;
    }
    setMergingRaw(false);
    setRawMergeKeepKey(null);
    setCheckedGroupKeys(new Set());
    fetchItemMerges();
  }

  async function handleUnmergeGroup(group) {
    if (group.overriddenIds.length === 0) return;
    setUnmergingGroupKey(group.key);
    const { error } = await supabase.from("ledger_auto_item_merges").delete().in("rental_id", group.overriddenIds);
    setUnmergingGroupKey(null);
    if (error) {
      alert("병합 해제 중 오류가 발생했어요: " + error.message);
      return;
    }
    fetchItemMerges();
  }

  // "체크박스 선택삭제는 기본중의 기본" 요청 — 여기서도 렌탈내역 원본은 지우지 않고, 자동등록 목록의
  // "선택 제외"와 똑같이 숨김 목록(ledger_auto_hidden_rentals)에 추가하는 방식을 그대로 쓴다(부모의
  // onExcludeIds를 그대로 호출). 숨기고 나면 이 화면도 부모 목록에서 다시 계산돼 바로 반영된다.
  async function handleExcludeChecked() {
    const ids = displayRows.filter((g) => checkedGroupKeys.has(g.key)).flatMap((g) => g.ids);
    if (ids.length === 0 || !onExcludeIds) return;
    setExcludingRaw(true);
    const ok = await onExcludeIds(ids);
    setExcludingRaw(false);
    if (ok) setCheckedGroupKeys(new Set());
  }

  const visibleGroupKeys = sortedDisplayRows.map((g) => g.key);
  const allChecked = visibleGroupKeys.length > 0 && visibleGroupKeys.every((k) => checkedGroupKeys.has(k));
  const someChecked = visibleGroupKeys.some((k) => checkedGroupKeys.has(k));
  const selectAllRef = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);
  const toggleCheckedAll = () => {
    setCheckedGroupKeys((prev) => {
      const next = new Set(prev);
      if (allChecked) visibleGroupKeys.forEach((k) => next.delete(k));
      else visibleGroupKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  // "렌탈잔량(자동등록) 전체선택 후 엑셀출력 가능하게 버튼 생성해주고" 요청(2026-10-02) — 예전엔
  // 표 맨 위 왼쪽 헤더 체크박스로만 전체선택이 가능했고(toggleCheckedAll, 다시 누르면 꺼지는 토글
  // 방식이라 "전체선택"이라는 걸 바로 알아채기 어려웠다), 고른 줄을 엑셀로 내보내는 기능 자체가 이
  // "병합 보기" 화면엔 아예 없었다(엑셀 내보내기는 목록 화면 쪽에만 있었다 — handleExportExcel
  // 위쪽 참고). 늘 보이는 요약 줄에 눈에 띄는 버튼 두 개를 추가한다.
  // "전체선택"은 toggleCheckedAll과 달리 토글이 아니라 항상 전부 선택되게만 한다 — "선택 해제" 버튼이
  // 이미 따로 있으니 전체선택 버튼까지 토글일 필요는 없고, 그래야 몇 개만 체크된 상태에서 눌러도
  // 헷갈리지 않고 항상 "전부"가 선택된다.
  function handleSelectAll() {
    setCheckedGroupKeys(new Set(visibleGroupKeys));
  }

  // 엑셀출력은 체크한 줄이 있으면 그 줄만, 하나도 체크하지 않았으면(전체선택을 꼭 먼저 누르지 않아도
  // 바로 쓸 수 있게) 지금 화면에 보이는 전체 줄을 내보낸다 — 화면에 보이는 표(정렬 반영)와 똑같은
  // 순서·열(전표번호·품목·규격·수량·금액·비고)로 담는다.
  async function handleExportMergedExcel() {
    const XLSX = await import("xlsx");
    const targetRows = checkedGroupKeys.size > 0 ? sortedDisplayRows.filter((g) => checkedGroupKeys.has(g.key)) : sortedDisplayRows;
    const header = ["전표번호", "품목", "규격", "수량", "금액", "비고"];
    const rows = targetRows.map((g) => [g.voucherNos.join(", "), g.dispItem || "", g.dispSpec || "", g.qty, g.amount, g.notes.join(", ")]);
    const aoa = [
      [`대표전표 ${repVoucherNo || "(번호없음)"} 외 ${memberVoucherNos.length - 1}건 — 병합 보기`],
      [`추출일: ${todayISO()}`],
      [],
      header,
      ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 8 }, { wch: 13 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "병합 품목내역");
    XLSX.writeFile(wb, `${repVoucherNo || "병합전표"}_병합품목내역_${todayISO()}.xlsx`);
  }

  const totalQty = effectiveRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalAmount = effectiveRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const gridTemplate = "28px " + colWidths.map((w) => `${w}px`).join(" ") + " 90px";
  const sortableLabels = ["전표번호", "품목", "규격", "수량", "금액", "비고"];

  return (
    <div>
      <button onClick={onClose} style={{ ...ghostBtnStyle, marginBottom: 14 }}>← 목록으로</button>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>
        대표전표 {repVoucherNo || "(번호없음)"} 외 {memberVoucherNos.length - 1}건 — 병합 보기
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>
        {head.customer || "-"} · {head.site_name || "-"} · 묶인 전표: {memberVoucherNos.join(", ")}
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        렌탈전표 원본은 전혀 바뀌지 않아요 — 이 화면에서 "같은 품목으로 묶어 보여주기"만 기록돼요.
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: C.inkSoft }}>
          원본 품목 {effectiveRows.length}건을 {displayRows.length}줄로 자동 합산 · 수량 합계 {totalQty.toLocaleString("ko-KR")}개 · 금액 합계 {fmtWon(totalAmount)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={handleSelectAll} style={miniBtnStyle} title="아래 표의 모든 줄을 체크해요">
            전체선택
          </button>
          <button onClick={handleExportMergedExcel} style={miniBtnStyle} title="체크한 줄이 있으면 그 줄만, 없으면 지금 보이는 전체 줄을 엑셀로 내보내요">
            엑셀출력
          </button>
          <button onClick={onUnmerge} style={{ ...ghostBtnStyle, borderColor: C.brick, color: C.brick }}>전표 병합 풀기</button>
        </div>
      </div>

      {checkedGroupKeys.size > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: C.amberBg, fontSize: 12.5 }}>
            <div>{checkedGroupKeys.size}줄 선택됨</div>
            {checkedGroupKeys.size >= 2 && (
              <button
                onClick={() => {
                  setRawMergeKeepKey(Array.from(checkedGroupKeys)[0]);
                  setMergingRaw(true);
                }}
                style={miniBtnStyle}
              >
                선택 항목 병합
              </button>
            )}
            <button onClick={handleExcludeChecked} disabled={excludingRaw} style={{ ...miniBtnStyle, borderColor: C.brick, color: C.brick }}>
              {excludingRaw ? "제외 처리 중…" : "선택 삭제"}
            </button>
            <button onClick={() => { setCheckedGroupKeys(new Set()); setMergingRaw(false); }} style={miniBtnStyle}>선택 해제</button>
            <div style={{ fontSize: 11.5, color: C.muted }}>"선택 삭제"는 이 화면에서만 안 보이게 돼요 — 렌탈내역 원본은 지워지지 않아요</div>
          </div>
          {mergingRaw && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, background: C.mutedBg, display: "flex", flexDirection: "column", gap: 6, maxWidth: 480 }}>
              <div style={{ fontSize: 12, color: C.inkSoft }}>
                품명·규격이 서로 다르게 적혀있어서 자동으로는 안 묶인 줄들이에요. 같은 품목이면 어떤 이름으로 보여줄지 골라주세요 —
                원본 데이터는 바뀌지 않고, 고른 뒤엔 자동으로 한 줄로 계속 합쳐져 보여요.
              </div>
              {Array.from(checkedGroupKeys).map((key) => {
                const g = displayRows.find((x) => x.key === key);
                if (!g) return null;
                return (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                    <input type="radio" name="rawMergeKeep" checked={rawMergeKeepKey === key} onChange={() => setRawMergeKeepKey(key)} />
                    <span>
                      {g.dispItem} · {g.dispSpec || "-"} (전표 {g.voucherNos.join(", ")})
                    </span>
                  </label>
                );
              })}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={handleConfirmRawMerge} disabled={savingRawMerge} style={{ ...primaryBtnStyle2, padding: "5px 10px", fontSize: 12.5 }}>
                  {savingRawMerge ? "병합 중…" : "이 이름으로 병합하기"}
                </button>
                <button
                  onClick={() => {
                    setMergingRaw(false);
                    setRawMergeKeepKey(null);
                  }}
                  style={{ ...ghostBtnStyle, padding: "5px 10px", fontSize: 12.5 }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 10, padding: "10px 14px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.line}`, minWidth: 980, alignItems: "center" }}>
          <div>
            <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleCheckedAll} />
          </div>
          {sortableLabels.map((label, i) => (
            <div key={label} style={{ position: "relative" }}>
              <button
                onClick={() => handleSortClick(label)}
                title="눌러서 정렬"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  fontSize: 11.5,
                  color: sortKey === label ? C.ink : C.muted,
                  fontWeight: sortKey === label ? 700 : 400,
                }}
              >
                {label}
                <span style={{ fontSize: 9, opacity: sortKey === label ? 1 : 0.35 }}>{sortKey === label ? (sortDir === "asc" ? "▲" : "▼") : "▲"}</span>
              </button>
              <ColResizeHandle onMouseDown={startResize(i)} />
            </div>
          ))}
          <div>관리</div>
        </div>
        {sortedDisplayRows.map((g) => {
          const origComposition = g.members
            .filter((m) => m._merged)
            .map((m) => `${m.item}${m.spec ? " · " + m.spec : ""}`);
          const itemTitle = origComposition.length > 0 ? `${g.dispItem} (원래 이름: ${Array.from(new Set(origComposition)).join(", ")})` : g.dispItem;
          return (
            <div
              key={g.key}
              style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 10, padding: "10px 14px", fontSize: 12.5, borderBottom: `1px solid ${C.lineSoft}`, alignItems: "center", minWidth: 980 }}
            >
              <div>
                <input type="checkbox" checked={checkedGroupKeys.has(g.key)} onChange={() => toggleGroup(g.key)} />
              </div>
              <div style={{ color: C.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.voucherNos.join(", ")}>
                {g.voucherNos[0] || "-"}
                {g.voucherNos.length > 1 && <span style={{ fontSize: 11, color: C.muted }}> 외 {g.voucherNos.length - 1}건</span>}
              </div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={itemTitle}>
                {g.dispItem}
                {g.autoGrouped && <span style={{ fontSize: 10.5, color: C.muted }}> ({g.members.length}건 합산)</span>}
              </div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.dispSpec || ""}>{g.dispSpec || "-"}</div>
              <div>{g.qty.toLocaleString("ko-KR")}</div>
              <div>{fmtWon(g.amount)}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.inkSoft }} title={g.notes.join(", ")}>
                {g.notes.join(", ") || "-"}
              </div>
              <div>
                {g.overriddenIds.length > 0 && (
                  <button
                    onClick={() => handleUnmergeGroup(g)}
                    disabled={unmergingGroupKey === g.key}
                    style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
                  >
                    {unmergingGroupKey === g.key ? "해제 중…" : "병합 해제"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LedgerBookDetail({ bookId, rentals, isAdmin, managerName, onClose, onBookListChanged }) {
  const [book, setBook] = useState(null);
  const [items, setItems] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("out"); // "out" | "in"
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [addingVoucherKey, setAddingVoucherKey] = useState(null);
  const [deletingVoucherId, setDeletingVoucherId] = useState(null);
  const [deletingBook, setDeletingBook] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  // 같은 품목인데 등록할 때 이름(품목/규격/색상)이 서로 다르게 적혀서 표에 따로따로 나오는 경우, 체크박스로
  // 골라 하나로 합칠 수 있게 하는 기능. mergeKeepId는 합친 뒤 남길(이름을 그대로 쓸) 품목의 id.
  const [mergingItems, setMergingItems] = useState(false);
  const [mergeKeepId, setMergeKeepId] = useState(null);
  const [savingMerge, setSavingMerge] = useState(false);
  // 화면을 열 때 이름이 서로 다르게 적혔지만 사실상 같은 품목으로 보이는 것들을 자동으로 찾아서 제안해주는 기능.
  // 실제 수량 기록을 지우는 작업이라 완전히 조용히 자동 실행하지는 않고, 배너로 보여준 뒤 한 번 눌러서 확인하게 한다.
  // dismissedMergeSuggestions에 담긴 건 "아니에요"를 눌러서 이번 화면에서만 숨긴 것(다시 들어오면 또 보일 수 있음).
  const [dismissedMergeSuggestions, setDismissedMergeSuggestions] = useState(() => new Set());
  const [applyingSuggestion, setApplyingSuggestion] = useState(null);
  // "+ 전표 추가" 픽커에서 렌탈전표뿐 아니라 A/S장·회수장도 골라 넣을 수 있게 한 선택지.
  // 출고 탭은 렌탈전표/A·S장, 회수 탭은 회수장/A·S장 중에서 고른다.
  const [pickerSource, setPickerSource] = useState("rental"); // "rental" | "collection" | "as"
  const [asRecords, setAsRecords] = useState([]);
  const [collectionRecords, setCollectionRecords] = useState([]);
  const [addingCollectionKey, setAddingCollectionKey] = useState(null);
  // A/S장은 내용이 자유 텍스트라 수량을 완전히 자동으로 믿을 수 없어서, "선택" 누르면 자동으로 읽어본
  // 품목/수량을 바로 등록하지 않고 이 임시 상태(초안)에 담아 등록 전에 확인·수정할 수 있게 한다.
  const [asDraft, setAsDraft] = useState(null); // { record, voucherLabel, voucherDate, items: [{item,spec,qty}] }
  const [savingAsDraft, setSavingAsDraft] = useState(false);
  // A/S장 검색은 렌탈전표/회수장과 달리 입력하는 대로 바로 걸러지지 않고, "검색" 버튼을 눌러야(또는 Enter)
  // 실제로 걸러진다. asQueryInput은 입력창에 지금 타이핑 중인 값(자동완성용), asSearchTerm은 검색이 실행된 값.
  const [asQueryInput, setAsQueryInput] = useState("");
  const [asSearchTerm, setAsSearchTerm] = useState("");
  // 수량 칸을 표에서 직접 입력해 고칠 수 있게 하는 기능. editingQtyKind는 지금 출고/회수 중 어느 표가
  // 편집 중인지, qtyEdits는 칸별로 타이핑 중인 값, selectedQtyCells는 체크해서 한번에 비울 칸들을 담는다.
  const [editingQtyKind, setEditingQtyKind] = useState(null); // null | "out" | "in"
  const [qtyEdits, setQtyEdits] = useState({}); // `${voucherId}|${itemId}` -> 입력 중인 문자열
  const [selectedQtyCells, setSelectedQtyCells] = useState(() => new Set());
  const [savingQtyEdits, setSavingQtyEdits] = useState(false);
  // 품목·규격·색상 칸의 좌우 여백(px). 내용이 길 때 넓히거나, 표를 좁게 보고 싶을 때 줄일 수 있다.
  const [cellPadX, setCellPadX] = useState(8);
  // 전표 추가 픽커에서 전표번호를 누르면 그 전표에 어떤 품목이 들어있는지 펼쳐서 보여준다.
  const [expandedRentalKey, setExpandedRentalKey] = useState(null);
  // A/S장 픽커에서도 마찬가지로, 목록 글자를 누르면 그 A/S건의 세부내역(연락처·주소·전체 내용 등)을 펼쳐서 보여준다.
  const [expandedAsKey, setExpandedAsKey] = useState(null);

  useEffect(() => {
    fetchAll();
  }, [bookId]);

  useEffect(() => {
    fetchExternalSources();
  }, []);

  // 대장이 다른 탭으로 바뀌면(출고 ↔ 회수) 픽커도 그 탭에 맞는 기본 원본으로 되돌리고, 열려 있던 A/S 초안은 닫는다.
  useEffect(() => {
    setPickerSource(subTab === "out" ? "rental" : "collection");
    setShowPicker(false);
    setPickerQuery("");
    setAsQueryInput("");
    setAsSearchTerm("");
    setAsDraft(null);
    setEditingQtyKind(null);
    setQtyEdits({});
    setSelectedQtyCells(new Set());
    setExpandedRentalKey(null);
    setExpandedAsKey(null);
  }, [subTab]);

  async function fetchExternalSources() {
    const [{ data: as }, { data: cr }] = await Promise.all([
      supabase.from("as_requests").select("*"),
      supabase.from("collection_requests").select("*"),
    ]);
    setAsRecords(as || []);
    setCollectionRecords(cr || []);
  }

  async function fetchAll() {
    setLoading(true);
    const [{ data: b }, { data: it }, { data: vc }, { data: en }] = await Promise.all([
      supabase.from("ledger_books").select("*").eq("id", bookId).single(),
      supabase.from("ledger_items").select("*").eq("ledger_book_id", bookId),
      supabase.from("ledger_vouchers").select("*").eq("ledger_book_id", bookId),
      supabase.from("ledger_entries").select("*").eq("ledger_book_id", bookId),
    ]);
    setBook(b || null);
    setItems(it || []);
    setVouchers(vc || []);
    setEntries(en || []);
    setLoading(false);
  }

  const sortedItems = useMemo(() => withLedgerRowSpans(sortLedgerItems(items)), [items]);

  // 이름이 서로 다르게 적혀서 표에 따로 나오는 품목들을 자동으로 찾아낸다. 세 가지 규칙을 본다:
  // (1) 품목·규격·색상이 공백/대소문자 차이만 있고 사실상 완전히 같은 경우.
  // (2) 한 품목의 규격란 앞부분에 다른 품목의 "품목명"이 그대로 적혀 있고(예: "탑책상, W1600*D800"),
  //     그 나머지 부분이 그 다른 품목의 규격과 정확히 같고 색상도 같은 경우 — 등록할 때 품목명을 규격에
  //     같이 적어버린 전형적인 오기입 패턴.
  // (3) 규격·색상은 완전히 같은데(같은 제품이라는 강한 증거), 품목명만 글자 하나 차이(오타·"용" 같은 조사
  //     하나 삽입 등, isOneEditApart)인 경우 — 예: "사무용의자" vs "사무의자".
  // 셋 다 아주 구체적인 조건이라 서로 다른 품목이 우연히 걸릴 위험은 낮지만, 실제로 수량 기록을 옮기는
  // 작업이라 자동 실행은 하지 않고 화면에 제안만 띄워서 한 번 확인받는다.
  const mergeSuggestions = useMemo(() => {
    const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
    // (3)에서 어느 쪽 품목명을 남길지 고르는 기준 — 실제 전표에 더 많이 쓰인(수량 합이 더 큰) 이름을
    // 남기고, 사용량이 같으면 더 긴(자세한) 이름 쪽을 남긴다.
    const qtyById = new Map();
    for (const e of entries) qtyById.set(e.ledger_item_id, (qtyById.get(e.ledger_item_id) || 0) + (Number(e.qty) || 0));
    const list = [];
    const seenPairs = new Set();
    for (const a of items) {
      for (const b of items) {
        if (a.id === b.id) continue;
        const pairKey = [a.id, b.id].sort().join("|");
        if (seenPairs.has(pairKey)) continue;

        if (norm(a.item) === norm(b.item) && norm(a.spec) === norm(b.spec) && norm(a.color) === norm(b.color)) {
          seenPairs.add(pairKey);
          list.push({ keepId: a.id, otherId: b.id, reason: "품목·규격·색상이 완전히 같아요" });
          continue;
        }

        const aSpecNorm = norm(a.spec);
        const bItemNorm = norm(b.item);
        if (bItemNorm && aSpecNorm.startsWith(bItemNorm)) {
          const rest = aSpecNorm.slice(bItemNorm.length).replace(/^[,·/]\s*/, "").trim();
          if (rest && rest === norm(b.spec) && norm(a.color) === norm(b.color)) {
            seenPairs.add(pairKey);
            list.push({ keepId: b.id, otherId: a.id, reason: `"${a.item}"의 규격에 "${b.item}"이 그대로 적혀 있어요` });
            continue;
          }
        }

        if (
          norm(a.spec) === norm(b.spec) &&
          norm(a.color) === norm(b.color) &&
          norm(a.item) !== norm(b.item) &&
          isOneEditApart(norm(a.item), norm(b.item))
        ) {
          seenPairs.add(pairKey);
          const aQty = qtyById.get(a.id) || 0;
          const bQty = qtyById.get(b.id) || 0;
          const aWins = aQty !== bQty ? aQty > bQty : a.item.length >= b.item.length;
          const keepId = aWins ? a.id : b.id;
          const otherId = aWins ? b.id : a.id;
          list.push({ keepId, otherId, reason: `"${a.item}"과 "${b.item}"은 한 글자 차이(오타 등)이고 규격·색상은 완전히 같아요` });
        }
      }
    }
    return list;
  }, [items, entries]);
  const visibleMergeSuggestions = useMemo(
    () => mergeSuggestions.filter((s) => !dismissedMergeSuggestions.has(`${s.keepId}|${s.otherId}`)),
    [mergeSuggestions, dismissedMergeSuggestions]
  );

  const outVouchers = useMemo(() => vouchers.filter((v) => v.kind === "out").sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [vouchers]);
  const inVouchers = useMemo(() => vouchers.filter((v) => v.kind === "in").sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [vouchers]);

  const entryMap = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(`${e.ledger_voucher_id}|${e.ledger_item_id}`, Number(e.qty) || 0);
    return m;
  }, [entries]);

  const qtyFor = (voucherId, itemId) => entryMap.get(`${voucherId}|${itemId}`) || 0;

  // 수량 칸을 직접 고칠 때 어떤 ledger_entries 행을 update/delete할지 찾기 위한 id 조회용 맵.
  const entryRowMap = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(`${e.ledger_voucher_id}|${e.ledger_item_id}`, e);
    return m;
  }, [entries]);

  const outTotalByItem = useMemo(() => {
    const m = new Map();
    for (const it of items) m.set(it.id, outVouchers.reduce((s, v) => s + qtyFor(v.id, it.id), 0));
    return m;
  }, [items, outVouchers, entryMap]);

  const inTotalByItem = useMemo(() => {
    const m = new Map();
    for (const it of items) m.set(it.id, inVouchers.reduce((s, v) => s + qtyFor(v.id, it.id), 0));
    return m;
  }, [items, inVouchers, entryMap]);

  // 전표 검색 픽커: 이 대장의 업체명과 이름이 같은 렌탈 전표를 기본으로 보여주고, 검색어를 입력하면 전체에서 찾는다.
  const rentalGroups = useMemo(() => {
    const g = groupRentalsByVoucher(rentals);
    g.sort((a, b) => (b.head.out_date || "").localeCompare(a.head.out_date || ""));
    return g;
  }, [rentals]);

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) {
      const cust = (book?.customer || "").toLowerCase();
      return rentalGroups.filter((g) => (g.head.customer || "").toLowerCase().includes(cust)).slice(0, 50);
    }
    return rentalGroups
      .filter((g) => [g.voucherNo, g.head.customer, g.head.site_name].filter(Boolean).join(" ").toLowerCase().includes(q))
      .slice(0, 50);
  }, [rentalGroups, pickerQuery, book]);

  // "검색" 버튼(또는 Enter)을 눌러 확정된 asSearchTerm 기준으로만 걸러진다(입력 중인 asQueryInput은 자동완성에만 쓰임).
  const asPickerResults = useMemo(() => {
    const q = asSearchTerm.trim().toLowerCase();
    if (!q) {
      const cust = (book?.customer || "").toLowerCase();
      return asRecords.filter((r) => (r.customer_name || "").toLowerCase().includes(cust)).slice(0, 50);
    }
    return asRecords
      .filter((r) => [r.management_no, r.customer_name, r.address, r.content].filter(Boolean).join(" ").toLowerCase().includes(q))
      .slice(0, 50);
  }, [asRecords, asSearchTerm, book]);

  // A/S 검색창 자동완성 후보: 관리번호(우선)와 거래처명을 모아 중복 없이 정렬해서 보여준다.
  const asSearchSuggestions = useMemo(
    () => dedupeSorted([...asRecords.map((r) => r.management_no), ...asRecords.map((r) => r.customer_name)]),
    [asRecords]
  );

  function runAsSearch() {
    setAsSearchTerm(asQueryInput);
  }

  const collectionPickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) {
      const cust = (book?.customer || "").toLowerCase();
      return collectionRecords.filter((r) => (r.customer_name || "").toLowerCase().includes(cust)).slice(0, 50);
    }
    return collectionRecords
      .filter((r) => [r.management_no, r.voucher_no, r.customer_name, r.address].filter(Boolean).join(" ").toLowerCase().includes(q))
      .slice(0, 50);
  }, [collectionRecords, pickerQuery, book]);

  // 렌탈전표 추가(handleAddOutVoucher)와 같은 "품목 매칭→없으면 생성→전표·수량 등록" 로직을,
  // A/S장·회수장처럼 원본이 다른 경우에도 그대로 재사용할 수 있게 일반화한 버전.
  // rawItems: [{item, spec, qty}] — spec에 색상까지 같이 적혀 있어도(예: "닥스, 이중력킹, 메쉬블랙")
  // splitLedgerSpecColor로 기존 렌탈전표 추가와 동일하게 나눠서 같은 품목으로 매칭한다.
  async function addVoucherFromItems({ kind, source, sourceRef, voucherNo, voucherDate, rawItems }) {
    const grouped = new Map();
    for (const r of rawItems || []) {
      const { spec, color } = splitLedgerSpecColor(r.spec);
      const item = (r.item || "").trim();
      const qty = Number(r.qty) || 0;
      if (!item || qty <= 0) continue;
      const k = `${item}〓${spec}〓${color}`;
      if (!grouped.has(k)) grouped.set(k, { item, spec, color, qty: 0 });
      grouped.get(k).qty += qty;
    }
    const groupedList = Array.from(grouped.values());
    if (groupedList.length === 0) {
      alert("추가할 품목이 없어요. 품목명과 수량을 확인해주세요.");
      return false;
    }

    const existingByKey = new Map(items.map((it) => [`${it.item}〓${it.spec || ""}〓${it.color || ""}`, it]));
    const toCreate = groupedList.filter((g) => !existingByKey.has(`${g.item}〓${g.spec}〓${g.color}`));

    let createdItems = [];
    if (toCreate.length > 0) {
      const rows = toCreate.map((g) => ({ ledger_book_id: bookId, item: g.item, spec: g.spec || null, color: g.color || null }));
      const { data, error } = await supabase.from("ledger_items").insert(rows).select();
      if (error) {
        alert("품목을 추가하는 중 오류가 발생했어요: " + error.message);
        return false;
      }
      createdItems = data || [];
    }
    const allItemsNow = [...items, ...createdItems];
    const keyToItemId = new Map(allItemsNow.map((it) => [`${it.item}〓${it.spec || ""}〓${it.color || ""}`, it.id]));

    const kindVouchers = vouchers.filter((v) => v.kind === kind);
    const nextSort = kindVouchers.length > 0 ? Math.max(...kindVouchers.map((v) => v.sort_order || 0)) + 1 : 0;
    const { data: newVoucher, error: vErr } = await supabase
      .from("ledger_vouchers")
      .insert({
        ledger_book_id: bookId,
        kind,
        voucher_no: voucherNo || "(번호없음)",
        voucher_date: voucherDate || null,
        source,
        source_ref: sourceRef || null,
        sort_order: nextSort,
      })
      .select()
      .single();
    if (vErr) {
      alert("전표를 추가하는 중 오류가 발생했어요: " + vErr.message);
      return false;
    }

    const entryRows = groupedList.map((g) => ({
      ledger_book_id: bookId,
      ledger_voucher_id: newVoucher.id,
      ledger_item_id: keyToItemId.get(`${g.item}〓${g.spec}〓${g.color}`),
      qty: g.qty,
    }));
    const { error: eErr } = await supabase.from("ledger_entries").insert(entryRows);
    if (eErr) {
      alert("수량을 채우는 중 오류가 발생했어요: " + eErr.message);
      return false;
    }
    fetchAll();
    return true;
  }

  async function handleAddCollectionVoucher(record) {
    if (inVouchers.some((v) => v.source === "collection_request" && v.source_ref === record.id)) {
      alert("이미 이 대장에 추가된 회수장이에요.");
      return;
    }
    setAddingCollectionKey(record.id);
    const ok = await addVoucherFromItems({
      kind: "in",
      source: "collection_request",
      sourceRef: record.id,
      voucherNo: record.voucher_no || (record.management_no ? `NO.${record.management_no}` : "(번호없음)"),
      voucherDate: extractIsoDate(record.collection_date),
      rawItems: record.items || [],
    });
    setAddingCollectionKey(null);
    if (ok) {
      setShowPicker(false);
      setPickerQuery("");
    }
  }

  // A/S장은 자유 텍스트라 자동 인식이 정확하지 않을 수 있어, 바로 등록하지 않고 초안(asDraft)을
  // 먼저 만들어 등록 전에 품목/수량을 확인·수정할 기회를 준다.
  function startAsDraft(record) {
    const autoItems = parseAsContentItems(record.content);
    setAsDraft({
      record,
      // 출고/회수 탭이 하나로 합쳐지면서, 이 A/S건이 나간 물건인지 돌아온 물건인지를 탭 대신 이 값으로 고른다.
      // 기본은 "출고"(대부분의 A/S가 교체품 출고라서)이고, 아래 토글로 언제든 "회수"로 바꿀 수 있다.
      kind: "out", // "out" | "in"
      voucherLabel: record.management_no ? `A/S#${record.management_no}` : "A/S장",
      voucherDate: /^\d{4}-\d{2}-\d{2}/.test(record.visit_date || "") ? record.visit_date.slice(0, 10) : todayISO(),
      items: autoItems.length > 0 ? autoItems : [{ item: "", spec: "", qty: 1 }],
    });
  }
  function updateAsDraftItem(idx, patch) {
    setAsDraft((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addAsDraftItemRow() {
    setAsDraft((prev) => ({ ...prev, items: [...prev.items, { item: "", spec: "", qty: 1 }] }));
  }
  function removeAsDraftItemRow(idx) {
    setAsDraft((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }
  async function handleSaveAsDraft() {
    if (!asDraft) return;
    setSavingAsDraft(true);
    const ok = await addVoucherFromItems({
      kind: asDraft.kind, // 아래 토글로 고른 출고/회수 구분 그대로 전표를 만든다.
      source: "as_request",
      sourceRef: asDraft.record.id,
      voucherNo: asDraft.voucherLabel,
      voucherDate: asDraft.voucherDate,
      rawItems: asDraft.items,
    });
    setSavingAsDraft(false);
    if (ok) {
      setAsDraft(null);
      setShowPicker(false);
      setPickerQuery("");
    }
  }

  async function handleAddOutVoucher(group) {
    if (outVouchers.some((v) => v.rental_voucher_no === group.voucherNo)) {
      alert("이미 이 대장에 추가된 전표예요.");
      return;
    }
    setAddingVoucherKey(group.key);

    const grouped = new Map();
    for (const r of group.rows) {
      const { spec, color } = splitLedgerSpecColor(r.spec);
      const k = `${r.item || ""}〓${spec}〓${color}`;
      if (!grouped.has(k)) grouped.set(k, { item: r.item || "", spec, color, qty: 0 });
      grouped.get(k).qty += Number(r.qty) || 0;
    }
    const groupedList = Array.from(grouped.values());

    const existingByKey = new Map(items.map((it) => [`${it.item}〓${it.spec || ""}〓${it.color || ""}`, it]));
    const toCreate = groupedList.filter((g) => !existingByKey.has(`${g.item}〓${g.spec}〓${g.color}`));

    let createdItems = [];
    if (toCreate.length > 0) {
      const rows = toCreate.map((g) => ({ ledger_book_id: bookId, item: g.item, spec: g.spec || null, color: g.color || null }));
      const { data, error } = await supabase.from("ledger_items").insert(rows).select();
      if (error) {
        setAddingVoucherKey(null);
        alert("품목을 추가하는 중 오류가 발생했어요: " + error.message);
        return;
      }
      createdItems = data || [];
    }
    const allItemsNow = [...items, ...createdItems];
    const keyToItemId = new Map(allItemsNow.map((it) => [`${it.item}〓${it.spec || ""}〓${it.color || ""}`, it.id]));

    const nextSort = outVouchers.length > 0 ? Math.max(...outVouchers.map((v) => v.sort_order || 0)) + 1 : 0;
    const { data: newVoucher, error: vErr } = await supabase
      .from("ledger_vouchers")
      .insert({
        ledger_book_id: bookId,
        kind: "out",
        voucher_no: group.voucherNo || "(번호없음)",
        voucher_date: extractIsoDate(group.head.out_date),
        source: "rental_voucher",
        rental_voucher_no: group.voucherNo || null,
        sort_order: nextSort,
      })
      .select()
      .single();
    if (vErr) {
      setAddingVoucherKey(null);
      alert("전표를 추가하는 중 오류가 발생했어요: " + vErr.message);
      return;
    }

    const entryRows = groupedList.map((g) => ({
      ledger_book_id: bookId,
      ledger_voucher_id: newVoucher.id,
      ledger_item_id: keyToItemId.get(`${g.item}〓${g.spec}〓${g.color}`),
      qty: g.qty,
    }));
    const { error: eErr } = await supabase.from("ledger_entries").insert(entryRows);
    setAddingVoucherKey(null);
    if (eErr) alert("수량을 채우는 중 오류가 발생했어요: " + eErr.message);

    // 이 대장에 현장명·비고가 아직 비어있으면, 방금 전표번호로 추가한 렌탈전표의 현장명과 전표번호로
    // 자동으로 채워준다(렌탈내역에는 있지만 대장을 만들 때 직접 입력하지 않았을 수 있는 정보라서).
    const bookPatch = {};
    if (!book.site_name && group.head.site_name) bookPatch.site_name = group.head.site_name;
    if (!book.note && group.voucherNo) bookPatch.note = `대표 전표번호 ${group.voucherNo} 외`;
    if (Object.keys(bookPatch).length > 0) {
      await supabase.from("ledger_books").update(bookPatch).eq("id", bookId);
    }

    setShowPicker(false);
    setPickerQuery("");
    fetchAll();
  }

  async function handleDeleteVoucher(voucherId) {
    if (!confirm("이 전표를 대장에서 삭제할까요? (원본 렌탈 전표는 그대로 남아있어요)")) return;
    setDeletingVoucherId(voucherId);
    const { error } = await supabase.from("ledger_vouchers").delete().eq("id", voucherId);
    setDeletingVoucherId(null);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    fetchAll();
  }

  function toggleItemSelected(id) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allItemsSelected = sortedItems.length > 0 && sortedItems.every((it) => selectedItemIds.has(it.id));
  function toggleSelectAllItems() {
    setSelectedItemIds(allItemsSelected ? new Set() : new Set(sortedItems.map((it) => it.id)));
  }

  // 체크한 품목(행)을 대장에서 통째로 지운다 — 그 품목의 모든 출고/회수 수량 기록도 같이 지워짐(원본 렌탈 전표는 그대로 남음).
  async function handleDeleteSelectedItems() {
    if (selectedItemIds.size === 0) return;
    if (!confirm(`선택한 품목 ${selectedItemIds.size}개를 삭제할까요? 해당 품목의 모든 출고/회수 수량도 함께 삭제돼요. (원본 렌탈 전표는 그대로 남아있어요)`)) return;
    const ids = Array.from(selectedItemIds);
    setDeletingSelected(true);
    const { error: eErr } = await supabase.from("ledger_entries").delete().in("ledger_item_id", ids);
    if (eErr) {
      setDeletingSelected(false);
      alert("삭제 중 오류가 발생했어요: " + eErr.message);
      return;
    }
    const { error: iErr } = await supabase.from("ledger_items").delete().in("id", ids);
    setDeletingSelected(false);
    if (iErr) {
      alert("삭제 중 오류가 발생했어요: " + iErr.message);
      return;
    }
    setSelectedItemIds(new Set());
    fetchAll();
  }

  // 품목 병합의 실제 DB 작업만 떼어낸 함수. keepId(남길 품목)의 품목명·규격·색상은 그대로 남고, otherIds
  // 품목들의 출고/회수 수량은 전표별로 합산돼서 keepId 쪽으로 옮겨 붙는다(같은 전표에 둘 다 수량이 있으면
  // 더해짐). 합쳐서 사라지는 품목들의 비고도, 남기는 품목에 비고가 비어있으면 옮겨 붙여준다.
  // 수동 병합 패널과 자동 병합 제안 배너가 둘 다 이 함수를 그대로 쓴다.
  async function mergeItemsInto(keepId, otherIds) {
    const finalByVoucher = new Map(); // voucherId -> { id, qty }
    for (const e of entries) {
      if (e.ledger_item_id === keepId) finalByVoucher.set(e.ledger_voucher_id, { id: e.id, qty: Number(e.qty) || 0 });
    }
    const deleteIds = [];
    for (const e of entries) {
      if (!otherIds.includes(e.ledger_item_id)) continue;
      const addQty = Number(e.qty) || 0;
      const existing = finalByVoucher.get(e.ledger_voucher_id);
      if (existing) {
        existing.qty += addQty;
        deleteIds.push(e.id);
      } else {
        finalByVoucher.set(e.ledger_voucher_id, { id: e.id, qty: addQty });
      }
    }

    for (const v of finalByVoucher.values()) {
      const { error } = await supabase.from("ledger_entries").update({ qty: v.qty, ledger_item_id: keepId }).eq("id", v.id);
      if (error) return { error };
    }
    if (deleteIds.length > 0) {
      const { error } = await supabase.from("ledger_entries").delete().in("id", deleteIds);
      if (error) return { error };
    }

    const keepItem = items.find((it) => it.id === keepId);
    if (!keepItem?.note) {
      const otherNote = otherIds.map((id) => items.find((it) => it.id === id)?.note).find((n) => n && n.trim());
      if (otherNote) await supabase.from("ledger_items").update({ note: otherNote }).eq("id", keepId);
    }

    const { error: delItemsErr } = await supabase.from("ledger_items").delete().in("id", otherIds);
    if (delItemsErr) return { error: delItemsErr };
    return { error: null };
  }

  // 체크한 품목들을 하나로 합친다(수동 병합 패널에서 "이 이름으로 병합하기"를 눌렀을 때).
  async function handleMergeItems() {
    if (!mergeKeepId || selectedItemIds.size < 2) return;
    const keepId = mergeKeepId;
    const otherIds = Array.from(selectedItemIds).filter((id) => id !== keepId);
    if (otherIds.length === 0) return;
    if (!confirm(`선택한 품목 ${selectedItemIds.size}개를 하나로 합칠까요?\n수량은 전표별로 자동 합산되고, 나머지 품목명은 사라져요. (전표 원본은 그대로 남아있어요)`)) return;
    setSavingMerge(true);
    const { error } = await mergeItemsInto(keepId, otherIds);
    setSavingMerge(false);
    if (error) {
      alert("병합 중 오류가 발생했어요: " + error.message);
      return;
    }
    setMergingItems(false);
    setMergeKeepId(null);
    setSelectedItemIds(new Set());
    fetchAll();
  }

  // 자동으로 찾아낸 병합 제안을 한 번 클릭으로 적용한다(체크박스 없이 바로).
  async function handleApplyMergeSuggestion(s) {
    const pairKey = `${s.keepId}|${s.otherId}`;
    setApplyingSuggestion(pairKey);
    const { error } = await mergeItemsInto(s.keepId, [s.otherId]);
    setApplyingSuggestion(null);
    if (error) {
      alert("자동 병합 중 오류가 발생했어요: " + error.message);
      return;
    }
    fetchAll();
  }

  // 자동 제안이 맞지 않을 때 이번 화면에서만 숨긴다(실제로 데이터를 지우지는 않음).
  function handleDismissMergeSuggestion(s) {
    setDismissedMergeSuggestions((prev) => new Set(prev).add(`${s.keepId}|${s.otherId}`));
  }

  async function handleSaveNote(itemId, text) {
    const { error } = await supabase.from("ledger_items").update({ note: text }).eq("id", itemId);
    if (!error) setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, note: text } : it)));
  }

  function toggleQtyCellSelected(key) {
    setSelectedQtyCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 체크한 칸들을 한번에 빈 칸으로 만든다. 실제로 기존 기록이 지워지는 건 "저장"을 눌렀을 때다.
  function handleDeleteSelectedQtyCells() {
    if (selectedQtyCells.size === 0) return;
    setQtyEdits((prev) => {
      const next = { ...prev };
      for (const key of selectedQtyCells) next[key] = "";
      return next;
    });
    setSelectedQtyCells(new Set());
  }

  function startEditingQty(kind) {
    setEditingQtyKind(kind);
    setQtyEdits({});
    setSelectedQtyCells(new Set());
  }

  function cancelEditingQty() {
    setEditingQtyKind(null);
    setQtyEdits({});
    setSelectedQtyCells(new Set());
  }

  // 칸에 직접 입력한 수량을 한번에 저장한다. 빈 칸/0으로 바꾼 칸은 기존 기록을 지우고, 값을 바꾼 칸은
  // update, 원래 "-"였던 칸에 새로 적은 값은 insert한다.
  async function handleSaveQtyEdits() {
    const changed = Object.entries(qtyEdits);
    if (changed.length === 0) {
      setEditingQtyKind(null);
      return;
    }
    setSavingQtyEdits(true);
    const updates = [];
    const inserts = [];
    const deleteIds = [];
    for (const [key, rawVal] of changed) {
      const [voucherId, itemId] = key.split("|");
      const existing = entryRowMap.get(key);
      const trimmed = String(rawVal ?? "").trim();
      const newQty = trimmed === "" ? 0 : Number(trimmed);
      if (trimmed === "" || isNaN(newQty) || newQty <= 0) {
        if (existing) deleteIds.push(existing.id);
        continue;
      }
      if (existing) {
        if (Number(existing.qty) !== newQty) updates.push({ id: existing.id, qty: newQty });
      } else {
        inserts.push({ ledger_book_id: bookId, ledger_voucher_id: voucherId, ledger_item_id: itemId, qty: newQty });
      }
    }

    if (deleteIds.length > 0) {
      const { error } = await supabase.from("ledger_entries").delete().in("id", deleteIds);
      if (error) {
        setSavingQtyEdits(false);
        alert("수량을 저장하는 중 오류가 발생했어요: " + error.message);
        return;
      }
    }
    for (const u of updates) {
      const { error } = await supabase.from("ledger_entries").update({ qty: u.qty }).eq("id", u.id);
      if (error) {
        setSavingQtyEdits(false);
        alert("수량을 저장하는 중 오류가 발생했어요: " + error.message);
        return;
      }
    }
    if (inserts.length > 0) {
      const { error } = await supabase.from("ledger_entries").insert(inserts);
      if (error) {
        setSavingQtyEdits(false);
        alert("수량을 저장하는 중 오류가 발생했어요: " + error.message);
        return;
      }
    }

    setSavingQtyEdits(false);
    setQtyEdits({});
    setSelectedQtyCells(new Set());
    setEditingQtyKind(null);
    fetchAll();
  }

  // 수량 칸 하나를 그린다. 편집 모드가 아니면 읽기전용 숫자, 편집 모드면 체크박스(선택삭제용)+입력박스로 보여준다.
  function renderQtyCell(voucherId, itemId) {
    const key = `${voucherId}|${itemId}`;
    const q = qtyFor(voucherId, itemId);
    if (editingQtyKind === subTab) {
      const val = qtyEdits[key] !== undefined ? qtyEdits[key] : q > 0 ? String(q) : "";
      return (
        <td key={voucherId} className="ledger-no-print" style={{ ...ledgerTd, padding: "3px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
            <input
              type="checkbox"
              checked={selectedQtyCells.has(key)}
              onChange={() => toggleQtyCellSelected(key)}
              title="체크 후 '선택한 칸 비우기'로 한번에 지울 수 있어요"
            />
            <input
              type="number"
              min={0}
              value={val}
              onChange={(e) => setQtyEdits((prev) => ({ ...prev, [key]: e.target.value }))}
              style={{ ...smallInputStyle, width: 56, textAlign: "right", padding: "3px 4px" }}
            />
          </div>
        </td>
      );
    }
    return (
      <td key={voucherId} style={{ ...ledgerTd, textAlign: "right" }}>{q > 0 ? q.toLocaleString("ko-KR") : "-"}</td>
    );
  }

  async function handleDeleteBook() {
    if (!confirm(`"${book?.customer}" 대장을 통째로 삭제할까요? 안에 있는 출고·회수 내역이 모두 지워지고 되돌릴 수 없어요.`)) return;
    setDeletingBook(true);
    const { error } = await supabase.from("ledger_books").delete().eq("id", bookId);
    setDeletingBook(false);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    onBookListChanged && onBookListChanged();
    onClose();
  }

  // 인쇄/PDF 저장 시 브라우저 상단 문서 제목을 잠깐 바꿔서 인쇄 머리글·PDF 기본 파일명에 반영되게 한다.
  function handlePrint() {
    const prevTitle = document.title;
    document.title = `${book?.customer || ""} 출고 및 회수 리스트`;
    const restore = () => {
      document.title = prevTitle;
    };
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
    setTimeout(restore, 2000);
  }

  // 지금 화면에 보이는 표(출고 탭이면 출고내역, 회수 탭이면 출고합계·회수내역·미회수수량·비고까지)를 그대로 엑셀 파일로 내려받는다.
  async function handleExportExcel() {
    const XLSX = await import("xlsx");
    // 전표번호 칸에 번호와 날짜를 같이 적어준다. A/S에서 들어온 전표번호는 이미 "A/S#21048"처럼 #이
    // 붙어 있으니 그대로 쓰고, 일반 전표번호(예: 2609231)에는 앞에 #을 붙여준다.
    // (칸 안에 줄바꿈을 넣어 두 줄로 만들어봤는데, 프로그램에 따라 줄바꿈이 무시되고 좁은 칸 너비에 그대로
    // 잘려서 보이는 경우가 있어서, 어떤 프로그램에서 열어도 안 잘리게 한 줄 + 넉넉한 칸 너비로 바꿨다.)
    const voucherHeaderLabel = (v) => {
      const no = v.voucher_no || "-";
      const withHash = no === "-" || no.includes("#") ? no : `#${no}`;
      return `${withHash} (${v.voucher_date || "-"})`;
    };
    let header, rows, extraColWidths;
    if (subTab === "out") {
      header = ["품목", "규격", "색상", ...outVouchers.map(voucherHeaderLabel), "출고합계"];
      rows = sortedItems.map((it) => [
        it.item,
        it.spec || "",
        it.color || "",
        ...outVouchers.map((v) => qtyFor(v.id, it.id) || ""),
        outTotalByItem.get(it.id) || 0,
      ]);
      // 전표번호+날짜를 한 줄로 적으니 칸이 좁으면 잘려 보여서, 전표 칸은 넉넉하게 잡는다.
      extraColWidths = [...outVouchers.map(() => ({ wch: 22 })), { wch: 13 }];
    } else {
      // 화면(출고 탭)에 보이는 출고전표별 칸(A/S로 들어온 전표 포함)을 그대로, 회수전표별 칸 앞에도 같이 넣어서
      // 최종 엑셀 한 장에서 출고일/전표번호·회수일/전표번호가 각 전표 칸으로 그대로 다 보이게 한다.
      header = [
        "품목", "규격", "색상",
        ...outVouchers.map(voucherHeaderLabel),
        "출고합계",
        ...inVouchers.map(voucherHeaderLabel),
        "회수합계", "미회수수량", "비고",
      ];
      rows = sortedItems.map((it) => {
        const outTotal = outTotalByItem.get(it.id) || 0;
        const inTotal = inTotalByItem.get(it.id) || 0;
        return [
          it.item,
          it.spec || "",
          it.color || "",
          ...outVouchers.map((v) => qtyFor(v.id, it.id) || ""),
          outTotal,
          ...inVouchers.map((v) => qtyFor(v.id, it.id) || ""),
          inTotal,
          outTotal - inTotal,
          it.note || "",
        ];
      });
      // 전표번호+날짜가 한 줄인 칸(출고·회수 전표)은 넉넉하게, 합계/미회수수량/비고는 기존 너비로.
      extraColWidths = [
        ...outVouchers.map(() => ({ wch: 22 })),
        { wch: 13 },
        ...inVouchers.map(() => ({ wch: 22 })),
        { wch: 13 }, { wch: 13 }, { wch: 18 },
      ];
    }
    const aoa = [
      ["렌탈품목 출고 및 회수 리스트"],
      [`거래처: ${book.customer}${book.site_name ? " · 현장명: " + book.site_name : ""}`],
      [],
      header,
      ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 12 }, ...extraColWidths];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, subTab === "out" ? "출고" : "회수 미회수");
    const safeName = (s) => (s || "").replace(/[\\/:*?"<>|]/g, "");
    const fname = `${safeName(book.customer)}${book.site_name ? "_" + safeName(book.site_name) : ""}_렌탈잔량_${subTab === "out" ? "출고" : "회수"}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  if (loading || !book) {
    return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>불러오는 중…</div>;
  }

  const itemColThStyle = { ...ledgerTh, paddingLeft: cellPadX, paddingRight: cellPadX };
  const itemColTdStyle = { ...ledgerTd, paddingLeft: cellPadX, paddingRight: cellPadX };

  return (
    <div>
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body * { visibility: hidden; }
          #ledger-print-area, #ledger-print-area * { visibility: visible; }
          #ledger-print-area {
            position: absolute; top: 0; left: 0; width: 100%; padding: 12px;
            overflow: visible !important;
          }
          .ledger-no-print { display: none !important; }
          /* 전표 칸이 많아져서 표가 넓어져도, 화면처럼 가로 스크롤로 잘려 보이지 않고
             한 페이지 너비에 맞춰 줄어들도록(칸이 좁으면 글자가 줄바꿈되게) 강제한다. */
          .ledger-print-table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed;
            font-size: 8.5px !important;
          }
          .ledger-print-table th, .ledger-print-table td {
            padding: 3px 4px !important;
            white-space: normal !important;
            word-break: break-word;
          }
        }
      `}</style>

      <div className="ledger-no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontFamily: serif, fontSize: 16 }}>
          {book.customer}
          {book.site_name ? ` · ${book.site_name}` : ""}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleDeleteBook} disabled={deletingBook} style={{ ...ghostBtnStyle, borderColor: C.brick, color: C.brick }}>
            {deletingBook ? "삭제 중…" : "대장 삭제"}
          </button>
          <button onClick={onClose} style={ghostBtnStyle}>← 목록으로</button>
        </div>
      </div>

      <div className="ledger-no-print" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setSubTab("out")}
          style={{ ...miniBtnStyle, background: subTab === "out" ? C.ink : "transparent", color: subTab === "out" ? "#fff" : C.inkSoft, borderColor: subTab === "out" ? C.ink : C.line }}
        >
          출고/회수
        </button>
        <button
          onClick={() => setSubTab("in")}
          style={{ ...miniBtnStyle, background: subTab === "in" ? C.ink : "transparent", color: subTab === "in" ? "#fff" : C.inkSoft, borderColor: subTab === "in" ? C.ink : C.line }}
        >
          렌탈잔량 최종
        </button>
      </div>

      <div className="ledger-no-print" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {/* 전표 추가·직접 입력은 출고/회수 탭에서만: 렌탈잔량 최종은 등록된 걸 확인·출력하는 결과 화면이라 여기서 더는 새로 추가하지 않는다. */}
        {subTab === "out" && <button onClick={() => setShowPicker((v) => !v)} style={primaryBtnStyle2}>+ 전표 추가</button>}
        {subTab === "in" && <button onClick={handlePrint} style={ghostBtnStyle}>인쇄 / PDF로 저장</button>}
        {subTab === "in" && <button onClick={handleExportExcel} style={ghostBtnStyle}>엑셀로 출력</button>}
      </div>

      {showPicker && (
        <div className="ledger-no-print" style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[["rental", "렌탈전표"], ["collection", "회수장"], ["as", "A/S장"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setPickerSource(key);
                  setAsDraft(null);
                  setAsQueryInput("");
                  setAsSearchTerm("");
                  setExpandedRentalKey(null);
                  setExpandedAsKey(null);
                }}
                style={{
                  ...miniBtnStyle,
                  background: pickerSource === key ? C.ink : "transparent",
                  color: pickerSource === key ? "#fff" : C.inkSoft,
                  borderColor: pickerSource === key ? C.ink : C.line,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {pickerSource === "as" ? (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <RecentValueInput
                  storageKey="remarket_recent_as_picker_search"
                  value={asQueryInput}
                  onChange={setAsQueryInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runAsSearch();
                    }
                  }}
                  placeholder="A/S 관리번호로 검색 (거래처·A/S내용도 찾아요, 비워두면 이 업체 A/S만 보여요)"
                  extraOptions={asSearchSuggestions}
                />
              </div>
              <button type="button" onClick={runAsSearch} style={miniBtnStylePrimary}>검색</button>
            </div>
          ) : (
            <input
              placeholder={
                pickerSource === "rental"
                  ? "전표번호, 거래처, 현장명 검색 (비워두면 이 업체 전표만 보여요)"
                  : "관리번호, 전표번호, 거래처 검색 (비워두면 이 업체 회수장만 보여요)"
              }
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              style={{ ...inputStyle, marginBottom: 10 }}
            />
          )}
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${C.lineSoft}` }}>
            {pickerSource === "rental" &&
              pickerResults.map((g) => {
                const already = outVouchers.some((v) => v.rental_voucher_no === g.voucherNo);
                const expanded = expandedRentalKey === g.key;
                return (
                  <div key={g.key} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", fontSize: 13 }}>
                      <div>
                        <div
                          onClick={() => setExpandedRentalKey(expanded ? null : g.key)}
                          title="눌러서 이 전표에 들어있는 품목을 확인해보세요"
                          style={{ cursor: "pointer", color: C.ink, textDecoration: "underline", textDecorationColor: C.lineSoft, textUnderlineOffset: 2, display: "inline-block" }}
                        >
                          {g.voucherNo || "(번호없음)"} · {g.head.customer || "-"} {g.head.site_name ? `· ${g.head.site_name}` : ""}
                        </div>
                        <div style={{ fontSize: 11.5, color: C.muted }}>{g.head.out_date || "-"} · 품목 {g.rows.length}건</div>
                      </div>
                      <button
                        onClick={() => handleAddOutVoucher(g)}
                        disabled={already || addingVoucherKey === g.key}
                        style={already ? { ...miniBtnStyle, opacity: 0.5 } : miniBtnStylePrimary}
                      >
                        {already ? "추가됨" : addingVoucherKey === g.key ? "추가 중…" : "이 전표 추가"}
                      </button>
                    </div>
                    {expanded && (
                      <div style={{ padding: "0 12px 10px 12px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: C.bg }}>
                          <thead>
                            <tr>
                              <th style={{ ...ledgerTh, padding: "5px 8px" }}>품목</th>
                              <th style={{ ...ledgerTh, padding: "5px 8px" }}>규격</th>
                              <th style={{ ...ledgerTh, padding: "5px 8px", textAlign: "right" }}>수량</th>
                              <th style={{ ...ledgerTh, padding: "5px 8px", textAlign: "right" }}>금액</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.rows.map((r) => (
                              <tr key={r.id}>
                                <td style={{ ...ledgerTd, padding: "5px 8px" }}>{r.item || "-"}</td>
                                <td style={{ ...ledgerTd, padding: "5px 8px" }}>{r.spec || "-"}</td>
                                <td style={{ ...ledgerTd, padding: "5px 8px", textAlign: "right" }}>{Number(r.qty || 0).toLocaleString("ko-KR")}</td>
                                <td style={{ ...ledgerTd, padding: "5px 8px", textAlign: "right" }}>{fmtWon(r.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            {pickerSource === "rental" && pickerResults.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>검색 결과가 없어요.</div>
            )}

            {pickerSource === "collection" &&
              collectionPickerResults.map((r) => {
                const already = inVouchers.some((v) => v.source === "collection_request" && v.source_ref === r.id);
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                    <div>
                      <div>
                        {r.voucher_no ? `#${r.voucher_no}` : r.management_no ? `NO.${r.management_no}` : "(번호없음)"} · {r.customer_name || "-"}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.muted }}>{r.collection_date || "-"} · 품목 {(r.items || []).length}건</div>
                    </div>
                    <button
                      onClick={() => handleAddCollectionVoucher(r)}
                      disabled={already || addingCollectionKey === r.id}
                      style={already ? { ...miniBtnStyle, opacity: 0.5 } : miniBtnStylePrimary}
                    >
                      {already ? "추가됨" : addingCollectionKey === r.id ? "추가 중…" : "이 전표 추가"}
                    </button>
                  </div>
                );
              })}
            {pickerSource === "collection" && collectionPickerResults.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>검색 결과가 없어요.</div>
            )}

            {pickerSource === "as" &&
              asPickerResults.map((r) => {
                // 출고/회수 탭이 하나로 합쳐지면서 "지금 보고 있는 탭 기준"이라는 개념이 없어졌으니, 출고·회수
                // 어느 쪽으로 이미 추가됐든(등록할 때 토글로 고른 쪽) 그냥 "이미 추가됨"으로 본다.
                const already = vouchers.some((v) => v.source === "as_request" && v.source_ref === r.id);
                const expanded = expandedAsKey === r.id;
                const statusStyle = AS_STATUS_STYLE[r.status] || AS_STATUS_STYLE["접수"];
                return (
                  <div key={r.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", fontSize: 13 }}>
                      <div>
                        <div
                          onClick={() => setExpandedAsKey(expanded ? null : r.id)}
                          title="눌러서 이 A/S건의 세부내역을 확인해보세요"
                          style={{ cursor: "pointer", color: C.ink, textDecoration: "underline", textDecorationColor: C.lineSoft, textUnderlineOffset: 2, display: "inline-block" }}
                        >
                          {r.management_no ? `NO.${r.management_no}` : "(번호없음)"} · {r.customer_name || "-"}
                        </div>
                        <div style={{ fontSize: 11.5, color: C.muted }}>{r.visit_date || "-"} · {r.content ? r.content.slice(0, 40) : "-"}</div>
                      </div>
                      <button
                        onClick={() => startAsDraft(r)}
                        disabled={already}
                        style={already ? { ...miniBtnStyle, opacity: 0.5 } : miniBtnStylePrimary}
                      >
                        {already ? "추가됨" : "선택"}
                      </button>
                    </div>
                    {expanded && (
                      <div style={{ padding: "0 12px 12px 12px" }}>
                        <div style={{ border: `1px solid ${C.lineSoft}`, background: C.bg, padding: 12, fontSize: 12.5 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                            <div><span style={{ color: C.muted }}>연락처 </span>{r.contact || "-"}</div>
                            <div><span style={{ color: C.muted }}>방문예정일 </span>{r.visit_date || "-"}</div>
                            <div><span style={{ color: C.muted }}>주소 </span>{r.address || "-"}</div>
                            <div><span style={{ color: C.muted }}>작성자 </span>{r.author || "-"} · {fmtAsDate(r.created_at)}</div>
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 4, color: statusStyle.color, background: statusStyle.bg }}>
                              {r.status || "접수"}
                            </span>
                          </div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{r.content || "-"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            {pickerSource === "as" && asPickerResults.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>검색 결과가 없어요.</div>
            )}
          </div>

          {asDraft && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
                A/S 내용에서 품목·수량을 자동으로 읽어봤어요. {asDraft.kind === "out" ? "출고" : "회수"} 전표로 추가하기 전에 확인·수정해주세요.
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[["out", "출고로 등록"], ["in", "회수로 등록"]].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAsDraft((p) => ({ ...p, kind: key }))}
                    style={{
                      ...miniBtnStyle,
                      background: asDraft.kind === key ? C.ink : "transparent",
                      color: asDraft.kind === key ? "#fff" : C.inkSoft,
                      borderColor: asDraft.kind === key ? C.ink : C.line,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <Field label="전표번호/메모">
                  <input style={inputStyle} value={asDraft.voucherLabel} onChange={(e) => setAsDraft((p) => ({ ...p, voucherLabel: e.target.value }))} />
                </Field>
                <Field label="날짜">
                  <input type="date" style={inputStyle} value={asDraft.voucherDate} onChange={(e) => setAsDraft((p) => ({ ...p, voucherDate: e.target.value }))} />
                </Field>
              </div>
              <div style={{ border: `1px solid ${C.lineSoft}`, marginBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 32px", gap: 8, padding: "6px 10px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.lineSoft}` }}>
                  <div>품목</div>
                  <div>규격</div>
                  <div>수량</div>
                  <div></div>
                </div>
                {asDraft.items.map((it, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 32px", gap: 8, padding: "6px 10px", alignItems: "center", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <input style={smallInputStyle} value={it.item} onChange={(e) => updateAsDraftItem(idx, { item: e.target.value })} placeholder="품목명" />
                    <input style={smallInputStyle} value={it.spec} onChange={(e) => updateAsDraftItem(idx, { spec: e.target.value })} placeholder="규격" />
                    <input type="number" min={0} style={smallInputStyle} value={it.qty} onChange={(e) => updateAsDraftItem(idx, { qty: e.target.value })} />
                    <button
                      type="button"
                      onClick={() => removeAsDraftItemRow(idx)}
                      title="이 품목 삭제"
                      aria-label="이 품목 삭제"
                      style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 10 }}>
                <button type="button" onClick={addAsDraftItemRow} style={ghostBtnStyle}>+ 품목 추가</button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleSaveAsDraft} disabled={savingAsDraft} style={primaryBtnStyle2}>
                  {savingAsDraft ? "추가 중…" : `${asDraft.kind === "out" ? "출고" : "회수"} 전표로 추가`}
                </button>
                <button onClick={() => setAsDraft(null)} style={ghostBtnStyle}>취소</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div id="ledger-print-area" style={{ border: `1px solid ${C.line}`, background: "#fff", padding: 24, overflowX: "auto" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: serif, fontSize: 18 }}>렌탈품목 출고 및 회수 리스트</div>
          <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 4 }}>
            거래처: {book.customer}
            {book.site_name ? ` · 현장명: ${book.site_name}` : ""}
          </div>
        </div>

        <div className="ledger-no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {editingQtyKind === subTab ? (
              <>
                <span style={{ fontSize: 12.5, color: C.inkSoft }}>칸을 눌러 수량을 직접 고친 뒤 저장하세요.</span>
                {selectedQtyCells.size > 0 && (
                  <button
                    onClick={handleDeleteSelectedQtyCells}
                    style={{ ...ghostBtnStyle, borderColor: C.brick, color: C.brick, padding: "5px 10px", fontSize: 12.5 }}
                  >
                    선택한 칸 비우기 ({selectedQtyCells.size})
                  </button>
                )}
                <button onClick={handleSaveQtyEdits} disabled={savingQtyEdits} style={{ ...primaryBtnStyle2, padding: "5px 10px", fontSize: 12.5 }}>
                  {savingQtyEdits ? "저장 중…" : "저장"}
                </button>
                <button onClick={cancelEditingQty} style={{ ...ghostBtnStyle, padding: "5px 10px", fontSize: 12.5 }}>취소</button>
              </>
            ) : (
              <button onClick={() => startEditingQty(subTab)} style={{ ...ghostBtnStyle, padding: "5px 10px", fontSize: 12.5 }}>
                수량 칸 직접 수정
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11.5, color: C.muted }}>품목·규격 칸 여백</span>
            <button onClick={() => setCellPadX((p) => Math.max(2, p - 2))} style={{ ...ghostBtnStyle, padding: "2px 9px", fontSize: 13 }}>−</button>
            <span style={{ fontSize: 11.5, color: C.inkSoft, minWidth: 18, textAlign: "center" }}>{cellPadX}</span>
            <button onClick={() => setCellPadX((p) => Math.min(30, p + 2))} style={{ ...ghostBtnStyle, padding: "2px 9px", fontSize: 13 }}>+</button>
          </div>
        </div>

        {visibleMergeSuggestions.length > 0 && (
          <div className="ledger-no-print" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {visibleMergeSuggestions.map((s) => {
              const a = items.find((it) => it.id === s.otherId);
              const b = items.find((it) => it.id === s.keepId);
              if (!a || !b) return null;
              const pairKey = `${s.keepId}|${s.otherId}`;
              return (
                <div
                  key={pairKey}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    border: `1px solid ${C.amber}`,
                    background: C.amberBg,
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12.5,
                  }}
                >
                  <span>
                    <b>{a.item} · {a.spec || "-"} · {a.color || "-"}</b>와 <b>{b.item} · {b.spec || "-"} · {b.color || "-"}</b>는 같은 품목 같아요. ({s.reason})
                  </span>
                  <button
                    onClick={() => handleApplyMergeSuggestion(s)}
                    disabled={applyingSuggestion === pairKey}
                    style={{ ...primaryBtnStyle2, padding: "4px 10px", fontSize: 12 }}
                  >
                    {applyingSuggestion === pairKey ? "병합 중…" : "병합하기"}
                  </button>
                  <button onClick={() => handleDismissMergeSuggestion(s)} style={{ ...ghostBtnStyle, padding: "4px 10px", fontSize: 12 }}>
                    아니에요
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {selectedItemIds.size > 0 && (
          <div className="ledger-no-print" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: C.inkSoft }}>{selectedItemIds.size}개 선택됨</span>
              {selectedItemIds.size >= 2 && (
                <button
                  onClick={() => {
                    setMergeKeepId(Array.from(selectedItemIds)[0]);
                    setMergingItems(true);
                  }}
                  style={{ ...ghostBtnStyle, padding: "5px 10px", fontSize: 12.5 }}
                >
                  선택한 품목 병합
                </button>
              )}
              <button
                onClick={handleDeleteSelectedItems}
                disabled={deletingSelected}
                style={{ ...ghostBtnStyle, borderColor: C.brick, color: C.brick, padding: "5px 10px", fontSize: 12.5 }}
              >
                {deletingSelected ? "삭제 중…" : "선택 삭제"}
              </button>
            </div>
            {mergingItems && (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, background: C.mutedBg, display: "flex", flexDirection: "column", gap: 6, maxWidth: 480 }}>
                <div style={{ fontSize: 12, color: C.inkSoft }}>
                  같은 품목인데 이름이 서로 다르게 등록돼서 표에 따로 나오는 경우, 하나로 합칠 수 있어요. 남길 품목명·규격·색상을 골라주세요 — 수량은 전표별로 자동 합산돼요.
                </div>
                {Array.from(selectedItemIds).map((id) => {
                  const it = items.find((x) => x.id === id);
                  if (!it) return null;
                  return (
                    <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                      <input type="radio" name="mergeKeep" checked={mergeKeepId === id} onChange={() => setMergeKeepId(id)} />
                      <span>{it.item} · {it.spec || "-"} · {it.color || "-"}</span>
                    </label>
                  );
                })}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={handleMergeItems} disabled={savingMerge} style={{ ...primaryBtnStyle2, padding: "5px 10px", fontSize: 12.5 }}>
                    {savingMerge ? "병합 중…" : "이 이름으로 병합하기"}
                  </button>
                  <button
                    onClick={() => {
                      setMergingItems(false);
                      setMergeKeepId(null);
                    }}
                    style={{ ...ghostBtnStyle, padding: "5px 10px", fontSize: 12.5 }}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

          <table className="ledger-print-table" style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 600 }}>
            <thead>
              <tr>
                <th rowSpan={2} className="ledger-no-print" style={ledgerTh}>
                  <input type="checkbox" checked={allItemsSelected} onChange={toggleSelectAllItems} />
                </th>
                <th rowSpan={2} style={itemColThStyle}>품목</th>
                <th rowSpan={2} style={itemColThStyle}>규격</th>
                <th rowSpan={2} style={itemColThStyle}>색상</th>
                {outVouchers.length > 0 && (
                  <th colSpan={outVouchers.length} style={{ ...ledgerTh, background: C.amberBg }}>출고내역</th>
                )}
                <th rowSpan={2} style={{ ...ledgerTh, background: C.amberBg }}>출고합계</th>
                {inVouchers.length > 0 && (
                  <th colSpan={inVouchers.length} style={{ ...ledgerTh, background: C.greenBg }}>회수내역</th>
                )}
                <th rowSpan={2} style={{ ...ledgerTh, background: C.greenBg }}>회수합계</th>
                <th rowSpan={2} style={{ ...ledgerTh, background: C.brickBg }}>미회수수량</th>
                <th rowSpan={2} style={ledgerTh}>비고</th>
              </tr>
              <tr>
                {outVouchers.map((v) => (
                  <th key={v.id} style={{ ...ledgerTh, fontWeight: 400 }}>
                    <div>{v.voucher_no || "-"}</div>
                    <div style={{ fontSize: 10.5, color: C.muted }}>{v.voucher_date || "-"}</div>
                    <button
                      className="ledger-no-print"
                      onClick={() => handleDeleteVoucher(v.id)}
                      disabled={deletingVoucherId === v.id}
                      style={{ background: "none", border: "none", color: C.brick, cursor: "pointer", fontSize: 11 }}
                    >
                      삭제
                    </button>
                  </th>
                ))}
                {inVouchers.map((v) => (
                  <th key={v.id} style={{ ...ledgerTh, fontWeight: 400 }}>
                    <div>{v.voucher_no || "-"}</div>
                    <div style={{ fontSize: 10.5, color: C.muted }}>{v.voucher_date || "-"}</div>
                    <button
                      className="ledger-no-print"
                      onClick={() => handleDeleteVoucher(v.id)}
                      disabled={deletingVoucherId === v.id}
                      style={{ background: "none", border: "none", color: C.brick, cursor: "pointer", fontSize: 11 }}
                    >
                      삭제
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((it) => {
                const outTotal = outTotalByItem.get(it.id) || 0;
                const inTotal = inTotalByItem.get(it.id) || 0;
                const remain = outTotal - inTotal;
                return (
                  <tr key={it.id}>
                    <td className="ledger-no-print" style={ledgerTd}>
                      <input type="checkbox" checked={selectedItemIds.has(it.id)} onChange={() => toggleItemSelected(it.id)} />
                    </td>
                    {it._rowSpan > 0 && (
                      <td rowSpan={it._rowSpan} style={itemColTdStyle}>{it.item}</td>
                    )}
                    <td style={itemColTdStyle}>{it.spec || "-"}</td>
                    <td style={itemColTdStyle}>{it.color || "-"}</td>
                    {outVouchers.map((v) => renderQtyCell(v.id, it.id))}
                    <td style={{ ...ledgerTd, textAlign: "right", fontWeight: 600 }}>{outTotal.toLocaleString("ko-KR")}</td>
                    {inVouchers.map((v) => renderQtyCell(v.id, it.id))}
                    <td style={{ ...ledgerTd, textAlign: "right", fontWeight: 600 }}>{inTotal.toLocaleString("ko-KR")}</td>
                    <td style={{ ...ledgerTd, textAlign: "right", fontWeight: 700, color: remain > 0 ? C.brick : C.inkSoft }}>{remain.toLocaleString("ko-KR")}</td>
                    <td style={{ ...ledgerTd, padding: 0 }}>
                      <input
                        defaultValue={it.note || ""}
                        onBlur={(e) => handleSaveNote(it.id, e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", border: "none", padding: "6px 8px", fontSize: 12.5, fontFamily: sans, background: "transparent" }}
                      />
                    </td>
                  </tr>
                );
              })}
              {sortedItems.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...ledgerTd, textAlign: "center", color: C.muted }}>+ 전표 추가로 출고·회수 전표를 등록해주세요.</td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
    </div>
  );
}

// ---------- A/S 관리대장 ----------
const AS_STATUSES = ["접수", "재방문", "조치완료", "보류", "취소"];
const AS_STATUS_STYLE = {
  접수: { bg: C.amberBg, color: C.amber },
  재방문: { bg: C.purpleBg, color: C.purple },
  조치완료: { bg: C.greenBg, color: C.green },
  보류: { bg: C.mutedBg, color: C.muted },
  취소: { bg: C.brickBg, color: C.brick },
};
const AS_PAGE_SIZE = 15;
const asTh = { padding: "9px 10px", textAlign: "left", fontSize: 11.5, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" };
const asTd = { padding: "9px 10px", verticalAlign: "top" };

function fmtAsDate(v) {
  return (v || "").slice(0, 10);
}

// A/S관리대장·렌탈회수관리에서 쓰는 상태별 필터 버튼줄("전체/접수/재방문/…" 조절바).
// (2026-09-30) "오른쪽(최근에 추가된) 조절바가 구리고 통일성 없다"는 피드백으로, 버튼 하나하나가
// 따로 테두리를 가진 모양 대신 연한 회색 트랙 하나 안에 선택된 항목만 흰 배경+그림자로 떠 보이게
// 바꿨다(세그먼트 컨트롤 느낌). 두 화면(A/S관리대장·렌탈회수관리)이 똑같은 컴포넌트를 같이 쓰도록
// 해서 앞으로도 두 화면이 서로 어긋나지 않고 계속 통일되게 했다.
// (2026-09-30 재수정) "회색 구분선이 너무 구림" 피드백으로, 트랙 전체를 감싸던 옅은 회색 배경(mutedBg)을
// 완전히 없앴다. 이제 회색 배경·테두리 없이, 선택된 항목만 보라색으로 꽉 채워서 보여주는 단순한 형태다.
function StatusFilterTabs({ tabs, activeKey, counts, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {tabs.map((t) => {
        const isActive = activeKey === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              padding: "7px 14px",
              background: isActive ? C.purple : "transparent",
              color: isActive ? "#fff" : C.inkSoft,
              border: "none",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 500,
              fontFamily: sans,
              cursor: "pointer",
              boxShadow: isActive ? "0 3px 8px rgba(91, 79, 229,0.3)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {t.label} <span style={{ opacity: isActive ? 0.85 : 0.6 }}>({counts[t.key] ?? 0})</span>
          </button>
        );
      })}
    </div>
  );
}

function AsBoardTab({ isAdmin, managerName }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState(null);
  // 엑셀 업로드(A/S 접수 및 처리보고서) 관련 상태. uploadState가 채워지면 확인 화면(AsRequestForm의 prefill 모드)을 보여준다.
  const [showUpload, setShowUpload] = useState(false);
  const [uploadState, setUploadState] = useState(null);
  const [uploadKey, setUploadKey] = useState(0); // 새 파일/붙여넣기로 다시 채울 때마다 확인 폼을 강제로 새로 마운트시키는 키

  // "A/S관리대장 번호 고객명 등 간격조절기능, 소팅기능 넣어줘" 요청 — 다른 표들과 마찬가지로 헤더 칸
  // 오른쪽 끝을 드래그해서 너비를 조절하고, 칸 제목을 눌러서 정렬할 수 있게 한다.
  const [colWidths, startResize] = useResizableColumns([70, 100, 120, 100, 170, 200, 80, 90, 100]);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"
  const AS_COLUMNS = ["번호", "고객명", "연락처", "방문예정일", "주소", "A/S 내용", "작성자", "작성일", "진행상태"];
  const sortAccessors = {
    번호: (r) => Number(r.management_no) || 0,
    고객명: (r) => r.customer_name || "",
    연락처: (r) => r.contact || "",
    방문예정일: (r) => r.visit_date || "",
    주소: (r) => r.address || "",
    "A/S 내용": (r) => r.content || "",
    작성자: (r) => r.author || "",
    작성일: (r) => r.created_at || "",
    진행상태: (r) => r.status || "",
  };
  const handleSortClick = (label) => {
    if (!sortAccessors[label]) return;
    if (sortKey === label) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(label);
      setSortDir("asc");
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  async function fetchRecords() {
    setLoading(true);
    const { data, error } = await supabase.from("as_requests").select("*").order("created_at", { ascending: false });
    if (!error) setRecords(data || []);
    setLoading(false);
  }

  const counts = useMemo(() => {
    const m = { all: records.length };
    for (const s of AS_STATUSES) m[s] = records.filter((r) => r.status === s).length;
    return m;
  }, [records]);

  const filtered = useMemo(() => {
    let list = records;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.customer_name, r.contact, r.address, r.content, r.author, r.management_no].filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }
    return list;
  }, [records, statusFilter, query]);

  // 열 제목을 눌러 정렬을 지정했으면 그 기준으로, 아니면 원래 순서(작성일 최신순)를 그대로 유지한다.
  const sortedFiltered = useMemo(() => {
    if (!sortKey || !sortAccessors[sortKey]) return filtered;
    const acc = sortAccessors[sortKey];
    const list = [...filtered];
    list.sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      let cmp;
      if (typeof va === "number" || typeof vb === "number") cmp = (Number(va) || 0) - (Number(vb) || 0);
      else cmp = String(va).localeCompare(String(vb), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1); // 상태 탭/검색어가 바뀌면 항상 1페이지로 되돌린다.
  }, [statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / AS_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = sortedFiltered.slice((pageSafe - 1) * AS_PAGE_SIZE, pageSafe * AS_PAGE_SIZE);

  function openNew() {
    setEditingRecord(null);
    setShowForm(true);
  }
  function openEdit(record) {
    setEditingRecord(record);
    setShowForm(true);
  }

  async function handleSave(fields) {
    if (editingRecord) {
      const { error } = await supabase.from("as_requests").update(fields).eq("id", editingRecord.id);
      if (error) {
        alert("저장 중 오류가 발생했어요: " + error.message);
        return false;
      }
    } else {
      const { error } = await supabase.from("as_requests").insert(fields);
      if (error) {
        alert("등록 중 오류가 발생했어요: " + error.message);
        return false;
      }
    }
    setShowForm(false);
    setEditingRecord(null);
    await fetchRecords();
    return true;
  }

  // A/S 접수 및 처리보고서 엑셀/붙여넣기를 읽어서 확인 화면(prefill 모드의 AsRequestForm)에 채운다.
  // 실제 등록은 그 화면에서 "등록"을 눌러야 이뤄진다(바로 저장하지 않고, 내용을 확인·수정할 기회를 준다).
  async function processAsFile(file) {
    if (!file) return;
    try {
      const parsed = await parseAsRequestExcel(file);
      setUploadState(asParsedToDbFields(parsed));
      setUploadKey((k) => k + 1);
    } catch (err) {
      alert("엑셀 파일을 읽는 중 문제가 발생했어요. 형식을 확인해주세요.");
      console.error(err);
    }
  }

  function processAsPastedText(text) {
    if (!text || !text.trim()) return;
    try {
      const parsed = parseAsRequestPastedText(text);
      setUploadState(asParsedToDbFields(parsed));
      setUploadKey((k) => k + 1);
    } catch (err) {
      alert("붙여넣은 내용을 읽는 중 문제가 발생했어요.");
      console.error(err);
    }
  }

  async function handleUploadSave(fields) {
    const ok = await handleSave(fields);
    if (ok) {
      setUploadState(null);
      setShowUpload(false);
    }
    return ok;
  }

  // 진행상태는 목록 화면에서 바로 바꿀 수 있게 한다(수정 화면을 매번 열지 않아도 되도록).
  // "접수" 상태가 아닌 다른 상태로 처음 바뀌는 순간, 새로 들어온 건이라는 "N" 표시도 함께 지운다.
  async function handleStatusChange(record, status) {
    setSavingStatusId(record.id);
    const patch = { status };
    if (record.is_new && status !== "접수") patch.is_new = false;
    const { error } = await supabase.from("as_requests").update(patch).eq("id", record.id);
    setSavingStatusId(null);
    if (error) {
      alert("상태 변경 중 오류가 발생했어요: " + error.message);
      return;
    }
    setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, ...patch } : r)));
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allPageSelected = pageItems.length > 0 && pageItems.every((r) => selectedIds.has(r.id));
  function toggleSelectAllPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageItems.forEach((r) => next.delete(r.id));
      else pageItems.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제할까요? 되돌릴 수 없어요.`)) return;
    const ids = Array.from(selectedIds);
    setDeletingSelected(true);
    const { error } = await supabase.from("as_requests").delete().in("id", ids);
    setDeletingSelected(false);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    setSelectedIds(new Set());
    fetchRecords();
  }

  const tabs = [{ key: "all", label: "전체" }, ...AS_STATUSES.map((s) => ({ key: s, label: s }))];

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>A/S관리대장</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        고객 A/S 접수부터 방문·조치까지 한 곳에서 관리해요. 진행상태는 목록에서 바로 바꿀 수 있어요.
      </div>

      {showForm && (
        <AsRequestForm
          initial={editingRecord}
          isAdmin={isAdmin}
          managerName={managerName}
          onCancel={() => {
            setShowForm(false);
            setEditingRecord(null);
          }}
          onSave={handleSave}
        />
      )}

      {showUpload && (
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>A/S 엑셀로 등록</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
            A/S 접수 및 처리보고서 엑셀을 올리거나, 내용을 그대로 복사해서 붙여넣으면 아래 내용이 자동으로 채워져요. 등록 전에 꼭 확인·수정해주세요.
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
            <AsUploadPasteBox onPasteText={processAsPastedText} hasData={!!uploadState} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", fontSize: 11.5, fontWeight: 700, color: C.muted, padding: "0 2px" }}>
              또는
            </div>
            <AsUploadDropZone onFile={processAsFile} hasData={!!uploadState} />
          </div>

          {uploadState && (
            <AsRequestForm
              key={uploadKey}
              initial={null}
              prefill={uploadState}
              isAdmin={isAdmin}
              managerName={managerName}
              onCancel={() => setUploadState(null)}
              onSave={handleUploadSave}
            />
          )}

          {!uploadState && (
            <button onClick={() => setShowUpload(false)} style={ghostBtnStyle}>
              닫기
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <StatusFilterTabs tabs={tabs} activeKey={statusFilter} counts={counts} onChange={setStatusFilter} />
        <div style={{ flex: 1 }} />
        <input
          placeholder="관리번호, 고객명, 주소, A/S내용, 작성자 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
        <button
          onClick={() => {
            setShowUpload((v) => !v);
            setUploadState(null);
          }}
          style={ghostBtnStyle}
        >
          + 엑셀로 등록
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft }}>{selectedIds.size}건 선택됨</span>
          <button
            onClick={handleDeleteSelected}
            disabled={deletingSelected}
            style={{ ...ghostBtnStyle, borderColor: C.brick, color: C.brick, padding: "5px 10px", fontSize: 12.5 }}
          >
            {deletingSelected ? "삭제 중…" : "선택 삭제"}
          </button>
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 1064, width: "100%", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
              <th style={{ ...asTh, width: 34 }}>
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllPage} />
              </th>
              {AS_COLUMNS.map((label, i) => (
                <th key={label} style={{ ...asTh, width: colWidths[i] }}>
                  {/* (2026-09-30) 칸 너비조절 바(ColResizeHandle)가 th 자체(패딩 포함, 세로로 김)를 기준으로
                      늘어나면 렌탈내역 화면(div 기반, 패딩 없이 글자 높이만큼만)보다 훨씬 굵고 크게 보였다.
                      이제 글자 높이만큼만 차지하는 별도의 안쪽 래퍼에 position:relative를 주고, 조절바가
                      그 래퍼 기준으로만 늘어나게 해서 렌탈내역과 같은 얇고 세련된 모양으로 맞췄다. */}
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    {sortAccessors[label] ? (
                      <button
                        type="button"
                        onClick={() => handleSortClick(label)}
                        title="눌러서 정렬"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          fontSize: 11.5,
                          color: sortKey === label ? C.ink : C.muted,
                          fontWeight: sortKey === label ? 700 : 600,
                        }}
                      >
                        {label}
                        <span style={{ fontSize: 9, opacity: sortKey === label ? 1 : 0.35 }}>{sortKey === label ? (sortDir === "asc" ? "▲" : "▼") : "▲"}</span>
                      </button>
                    ) : (
                      label
                    )}
                    <ColResizeHandle onMouseDown={startResize(i)} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} style={{ ...asTd, textAlign: "center", color: C.muted, padding: 30 }}>불러오는 중…</td>
              </tr>
            )}
            {!loading && pageItems.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...asTd, textAlign: "center", color: C.muted, padding: 30 }}>
                  등록된 A/S 내역이 없어요. "+ 엑셀로 등록"으로 시작해보세요.
                </td>
              </tr>
            )}
            {!loading &&
              pageItems.map((r, idx) => {
                const st = AS_STATUS_STYLE[r.status] || AS_STATUS_STYLE["접수"];
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                    <td style={asTd}>
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelected(r.id)} />
                    </td>
                    <td style={asTd} title={r.management_no ? "A/S 관리번호" : ""}>
                      {r.management_no || filtered.length - ((pageSafe - 1) * AS_PAGE_SIZE + idx)}
                    </td>
                    <td style={asTd}>{r.customer_name || "-"}</td>
                    <td style={asTd}>{r.contact || "-"}</td>
                    <td style={asTd}>{r.visit_date || "-"}</td>
                    <td style={asTd}>{r.address || "-"}</td>
                    <td style={asTd}>
                      <button
                        onClick={() => openEdit(r)}
                        style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 12.5, textAlign: "left" }}
                      >
                        {r.content || "-"}
                      </button>
                      {r.is_new && (
                        <span
                          title="새로 등록된 건이에요"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            background: C.brick,
                            color: "#fff",
                            fontSize: 9.5,
                            fontWeight: 700,
                            marginLeft: 5,
                          }}
                        >
                          N
                        </span>
                      )}
                    </td>
                    <td style={asTd}>{r.author || "-"}</td>
                    <td style={asTd}>{fmtAsDate(r.created_at)}</td>
                    <td style={asTd}>
                      <select
                        value={r.status}
                        onChange={(e) => handleStatusChange(r, e.target.value)}
                        disabled={savingStatusId === r.id}
                        style={{ border: `1px solid ${st.color}`, background: st.bg, color: st.color, fontSize: 12, padding: "4px 6px", fontFamily: sans, fontWeight: 600 }}
                      >
                        {AS_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe === 1} style={miniBtnStyle}>
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                ...miniBtnStyle,
                background: p === pageSafe ? C.ink : "transparent",
                color: p === pageSafe ? "#fff" : C.inkSoft,
                borderColor: p === pageSafe ? C.ink : C.line,
              }}
            >
              {p}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages} style={miniBtnStyle}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}

// prefill: 엑셀/붙여넣기로 읽어들인 값을 새 등록 폼에 미리 채워 넣을 때만 쓴다(수정 화면에서는 initial을 그대로 씀).
function AsRequestForm({ initial, prefill, isAdmin, managerName, onCancel, onSave }) {
  const [f, setF] = useState(
    initial || {
      customer_name: "",
      contact: "",
      visit_date: "",
      address: "",
      content: "",
      author: getMyName() || (isAdmin ? "" : managerName), // 이 컴퓨터·브라우저에 저장해둔 "내 이름"이 있으면 그걸 우선 채움
      status: "접수",
      management_no: "",
      fault_dept: "",
      product_name: "",
      purchase_date: "",
      product_type: "",
      seller: "",
      courier: "",
      receiver: "",
      issue_type: "",
      fault_point: "",
      ...(prefill || {}),
    }
  );
  const [saving, setSaving] = useState(false);
  const update = (patch) => setF({ ...f, ...patch });

  async function handleSubmit() {
    if (!(f.customer_name || "").trim()) {
      alert("고객명을 입력해주세요.");
      return;
    }
    if (!(f.content || "").trim()) {
      alert("A/S 내용을 입력해주세요.");
      return;
    }
    setSaving(true);
    await onSave({
      customer_name: f.customer_name.trim(),
      contact: (f.contact || "").trim() || null,
      visit_date: (f.visit_date || "").trim() || null,
      address: (f.address || "").trim() || null,
      content: f.content.trim(),
      author: (f.author || "").trim() || null,
      status: f.status || "접수",
      management_no: (f.management_no || "").trim() || null,
      fault_dept: (f.fault_dept || "").trim() || null,
      product_name: (f.product_name || "").trim() || null,
      purchase_date: (f.purchase_date || "").trim() || null,
      product_type: (f.product_type || "").trim() || null,
      seller: (f.seller || "").trim() || null,
      courier: (f.courier || "").trim() || null,
      receiver: (f.receiver || "").trim() || null,
      issue_type: (f.issue_type || "").trim() || null,
      fault_point: (f.fault_point || "").trim() || null,
    });
    setSaving(false);
  }

  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 16 }}>
        {initial ? "A/S 내역 수정" : prefill ? "A/S 접수 및 처리보고서 확인" : "A/S 신규 등록"}
      </div>
      {prefill && (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
          엑셀에서 읽은 내용이에요. 등록 전에 내용을 확인·수정해주세요.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Field label="관리번호">
          <input style={inputStyle} value={f.management_no || ""} onChange={(e) => update({ management_no: e.target.value })} placeholder="예: 21048" />
        </Field>
        <Field label="고객명">
          <input style={inputStyle} value={f.customer_name || ""} onChange={(e) => update({ customer_name: e.target.value })} placeholder="예: 한우리건설" />
        </Field>
        <Field label="연락처">
          <input style={inputStyle} value={f.contact || ""} onChange={(e) => update({ contact: e.target.value })} placeholder="예: 박제현 사원님 010-8020-3363" />
        </Field>
        <Field label="방문예정일">
          <input style={inputStyle} value={f.visit_date || ""} onChange={(e) => update({ visit_date: e.target.value })} placeholder="예: 2026-09-22 또는 택배발송" />
        </Field>
        <Field label="작성자">
          <input style={inputStyle} value={f.author || ""} onChange={(e) => update({ author: e.target.value })} placeholder="예: 김영업" />
        </Field>
        <Field label="진행상태">
          <select style={inputStyle} value={f.status || "접수"} onChange={(e) => update({ status: e.target.value })}>
            {AS_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="주소">
        <input style={inputStyle} value={f.address || ""} onChange={(e) => update({ address: e.target.value })} placeholder="예: 전남 여수시 국동남6길 25-1" />
      </Field>
      <Field label="A/S 내용">
        <textarea
          value={f.content || ""}
          onChange={(e) => update({ content: e.target.value })}
          placeholder="예: 책장 회수 및 테이블, 사무집기 배송"
          style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
        />
      </Field>

      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, margin: "6px 0 10px" }}>접수 및 처리보고서 상세 (선택 입력)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Field label="제품명">
          <input style={inputStyle} value={f.product_name || ""} onChange={(e) => update({ product_name: e.target.value })} placeholder="예: 접의자(밤색) 3ea" />
        </Field>
        <Field label="구입일">
          <input type="date" style={inputStyle} value={f.purchase_date || ""} onChange={(e) => update({ purchase_date: e.target.value })} />
        </Field>
        <Field label="상품유형">
          <input style={inputStyle} value={f.product_type || ""} onChange={(e) => update({ product_type: e.target.value })} placeholder="예: 렌탈 또는 구매" />
        </Field>
        <Field label="판매자">
          <input style={inputStyle} value={f.seller || ""} onChange={(e) => update({ seller: e.target.value })} placeholder="예: 신상헌" />
        </Field>
        <Field label="배송자">
          <input style={inputStyle} value={f.courier || ""} onChange={(e) => update({ courier: e.target.value })} />
        </Field>
        <Field label="접수자">
          <input style={inputStyle} value={f.receiver || ""} onChange={(e) => update({ receiver: e.target.value })} placeholder="예: 신상헌" />
        </Field>
        <Field label="유형">
          <input style={inputStyle} value={f.issue_type || ""} onChange={(e) => update({ issue_type: e.target.value })} placeholder="예: 접의자(밤색) 3ea 외" />
        </Field>
        <Field label="귀책사유부서">
          <input style={inputStyle} value={f.fault_dept || ""} onChange={(e) => update({ fault_dept: e.target.value })} />
        </Field>
        <Field label="귀책사유 발생시점">
          <input style={inputStyle} value={f.fault_point || ""} onChange={(e) => update({ fault_point: e.target.value })} />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSubmit} disabled={saving} style={primaryBtnStyle2}>
          {saving ? "저장 중…" : initial ? "저장" : "등록"}
        </button>
        <button onClick={onCancel} style={ghostBtnStyle}>
          취소
        </button>
      </div>
    </div>
  );
}

// ---------- 렌탈회수관리 ----------
const COLLECTION_STATUSES = ["접수", "보류", "회수완료", "취소"];
const COLLECTION_STATUS_STYLE = {
  접수: { bg: C.amberBg, color: C.amber },
  보류: { bg: C.mutedBg, color: C.muted },
  회수완료: { bg: C.greenBg, color: C.green },
  취소: { bg: C.brickBg, color: C.brick },
};
const COLLECTION_PAGE_SIZE = 15;

function fmtCollectionDate(v) {
  return (v || "").slice(0, 10);
}

// 회수 품목(items: [{item, spec, qty}])을 목록/전표 추가 화면에서 한 줄로 훑어볼 수 있게 요약한다.
function summarizeCollectionItems(items) {
  if (!items || items.length === 0) return "-";
  return items.map((it) => `${it.item}${it.spec ? ` ${it.spec}` : ""} ${it.qty}`).join(", ");
}

function CollectionBoardTab({ isAdmin, managerName }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState(null);
  // 엑셀 업로드(회수 지시서) 관련 상태. uploadState가 채워지면 확인 화면(CollectionRequestForm의 prefill 모드)을 보여준다.
  const [showUpload, setShowUpload] = useState(false);
  const [uploadState, setUploadState] = useState(null);
  const [uploadKey, setUploadKey] = useState(0);

  // "렌탈회수관리 번호 고객명 등 간격조절기능, 소팅기능 넣어줘" 요청 — A/S관리대장과 동일한 방식으로
  // 헤더 칸을 드래그해서 너비를 조절하고, 칸 제목을 눌러서 정렬할 수 있게 한다.
  const [colWidths, startResize] = useResizableColumns([70, 100, 100, 100, 170, 200, 80, 90, 100]);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"
  const COLLECTION_COLUMNS = ["번호", "고객명", "담당자", "회수일", "주소", "회수품목", "작성자", "작성일", "진행상태"];
  const sortAccessors = {
    번호: (r) => Number(r.management_no) || 0,
    고객명: (r) => r.customer_name || "",
    담당자: (r) => r.contact || "",
    회수일: (r) => r.collection_date || "",
    주소: (r) => r.address || "",
    회수품목: (r) => summarizeCollectionItems(r.items),
    작성자: (r) => r.author || "",
    작성일: (r) => r.created_at || "",
    진행상태: (r) => r.status || "",
  };
  const handleSortClick = (label) => {
    if (!sortAccessors[label]) return;
    if (sortKey === label) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(label);
      setSortDir("asc");
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  async function fetchRecords() {
    setLoading(true);
    const { data, error } = await supabase.from("collection_requests").select("*").order("created_at", { ascending: false });
    if (!error) setRecords(data || []);
    setLoading(false);
  }

  const counts = useMemo(() => {
    const m = { all: records.length };
    for (const s of COLLECTION_STATUSES) m[s] = records.filter((r) => r.status === s).length;
    return m;
  }, [records]);

  const filtered = useMemo(() => {
    let list = records;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.customer_name, r.contact, r.address, r.management_no, r.voucher_no, summarizeCollectionItems(r.items)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [records, statusFilter, query]);

  // 열 제목을 눌러 정렬을 지정했으면 그 기준으로, 아니면 원래 순서(작성일 최신순)를 그대로 유지한다.
  const sortedFiltered = useMemo(() => {
    if (!sortKey || !sortAccessors[sortKey]) return filtered;
    const acc = sortAccessors[sortKey];
    const list = [...filtered];
    list.sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      let cmp;
      if (typeof va === "number" || typeof vb === "number") cmp = (Number(va) || 0) - (Number(vb) || 0);
      else cmp = String(va).localeCompare(String(vb), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / COLLECTION_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = sortedFiltered.slice((pageSafe - 1) * COLLECTION_PAGE_SIZE, pageSafe * COLLECTION_PAGE_SIZE);

  function openEdit(record) {
    setEditingRecord(record);
    setShowForm(true);
  }

  async function handleSave(fields) {
    if (editingRecord) {
      const { error } = await supabase.from("collection_requests").update(fields).eq("id", editingRecord.id);
      if (error) {
        alert("저장 중 오류가 발생했어요: " + error.message);
        return false;
      }
    } else {
      const { error } = await supabase.from("collection_requests").insert(fields);
      if (error) {
        alert("등록 중 오류가 발생했어요: " + error.message);
        return false;
      }
    }
    setShowForm(false);
    setEditingRecord(null);
    await fetchRecords();
    return true;
  }

  // 회수 지시서 엑셀/붙여넣기를 읽어서 확인 화면(prefill 모드의 CollectionRequestForm)에 채운다.
  // A/S 업로드와 마찬가지로, 실제 등록은 그 화면에서 "등록"을 눌러야 이뤄진다.
  async function processCollectionFile(file) {
    if (!file) return;
    try {
      const parsed = await parseCollectionRequestExcel(file);
      setUploadState(collectionParsedToDbFields(parsed));
      setUploadKey((k) => k + 1);
    } catch (err) {
      alert("엑셀 파일을 읽는 중 문제가 발생했어요. 형식을 확인해주세요.");
      console.error(err);
    }
  }

  function processCollectionPastedText(text) {
    if (!text || !text.trim()) return;
    try {
      const parsed = parseCollectionRequestPastedText(text);
      setUploadState(collectionParsedToDbFields(parsed));
      setUploadKey((k) => k + 1);
    } catch (err) {
      alert("붙여넣은 내용을 읽는 중 문제가 발생했어요.");
      console.error(err);
    }
  }

  async function handleUploadSave(fields) {
    const ok = await handleSave(fields);
    if (ok) {
      setUploadState(null);
      setShowUpload(false);
    }
    return ok;
  }

  async function handleStatusChange(record, status) {
    setSavingStatusId(record.id);
    const patch = { status };
    if (record.is_new && status !== "접수") patch.is_new = false;
    const { error } = await supabase.from("collection_requests").update(patch).eq("id", record.id);
    setSavingStatusId(null);
    if (error) {
      alert("상태 변경 중 오류가 발생했어요: " + error.message);
      return;
    }
    setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, ...patch } : r)));
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allPageSelected = pageItems.length > 0 && pageItems.every((r) => selectedIds.has(r.id));
  function toggleSelectAllPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageItems.forEach((r) => next.delete(r.id));
      else pageItems.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제할까요? 되돌릴 수 없어요.`)) return;
    const ids = Array.from(selectedIds);
    setDeletingSelected(true);
    const { error } = await supabase.from("collection_requests").delete().in("id", ids);
    setDeletingSelected(false);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    setSelectedIds(new Set());
    fetchRecords();
  }

  const tabs = [{ key: "all", label: "전체" }, ...COLLECTION_STATUSES.map((s) => ({ key: s, label: s }))];

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>렌탈회수관리</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        렌탈품목 회수 요청부터 회수완료까지 한 곳에서 관리해요. 진행상태는 목록에서 바로 바꿀 수 있어요.
      </div>

      {showForm && (
        <CollectionRequestForm
          initial={editingRecord}
          isAdmin={isAdmin}
          managerName={managerName}
          onCancel={() => {
            setShowForm(false);
            setEditingRecord(null);
          }}
          onSave={handleSave}
        />
      )}

      {showUpload && (
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>회수 지시서 엑셀로 등록</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
            회수 지시서(렌탈제품) 엑셀을 올리거나, 내용을 그대로 복사해서 붙여넣으면 아래 내용이 자동으로 채워져요. 등록 전에 꼭 확인·수정해주세요.
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
            <CollectionUploadPasteBox onPasteText={processCollectionPastedText} hasData={!!uploadState} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", fontSize: 11.5, fontWeight: 700, color: C.muted, padding: "0 2px" }}>
              또는
            </div>
            <CollectionUploadDropZone onFile={processCollectionFile} hasData={!!uploadState} />
          </div>

          {uploadState && (
            <CollectionRequestForm
              key={uploadKey}
              initial={null}
              prefill={uploadState}
              isAdmin={isAdmin}
              managerName={managerName}
              onCancel={() => setUploadState(null)}
              onSave={handleUploadSave}
            />
          )}

          {!uploadState && (
            <button onClick={() => setShowUpload(false)} style={ghostBtnStyle}>
              닫기
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <StatusFilterTabs tabs={tabs} activeKey={statusFilter} counts={counts} onChange={setStatusFilter} />
        <div style={{ flex: 1 }} />
        <input
          placeholder="관리번호, 전표번호, 고객명, 주소, 회수품목 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
        <button
          onClick={() => {
            setShowUpload((v) => !v);
            setUploadState(null);
          }}
          style={ghostBtnStyle}
        >
          + 엑셀로 등록
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft }}>{selectedIds.size}건 선택됨</span>
          <button
            onClick={handleDeleteSelected}
            disabled={deletingSelected}
            style={{ ...ghostBtnStyle, borderColor: C.brick, color: C.brick, padding: "5px 10px", fontSize: 12.5 }}
          >
            {deletingSelected ? "삭제 중…" : "선택 삭제"}
          </button>
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 1064, width: "100%", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
              <th style={{ ...asTh, width: 34 }}>
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllPage} />
              </th>
              {COLLECTION_COLUMNS.map((label, i) => (
                <th key={label} style={{ ...asTh, width: colWidths[i] }}>
                  {/* (2026-09-30) A/S관리대장과 같은 이유로, 조절바가 th 전체 높이가 아니라 글자 높이만큼만
                      차지하는 안쪽 래퍼 기준으로 늘어나게 해서 렌탈내역과 같은 얇은 모양으로 맞췄다. */}
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    {sortAccessors[label] ? (
                      <button
                        type="button"
                        onClick={() => handleSortClick(label)}
                        title="눌러서 정렬"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          fontSize: 11.5,
                          color: sortKey === label ? C.ink : C.muted,
                          fontWeight: sortKey === label ? 700 : 600,
                        }}
                      >
                        {label}
                        <span style={{ fontSize: 9, opacity: sortKey === label ? 1 : 0.35 }}>{sortKey === label ? (sortDir === "asc" ? "▲" : "▼") : "▲"}</span>
                      </button>
                    ) : (
                      label
                    )}
                    <ColResizeHandle onMouseDown={startResize(i)} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} style={{ ...asTd, textAlign: "center", color: C.muted, padding: 30 }}>불러오는 중…</td>
              </tr>
            )}
            {!loading && pageItems.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...asTd, textAlign: "center", color: C.muted, padding: 30 }}>
                  등록된 회수 내역이 없어요. "+ 엑셀로 등록"으로 시작해보세요.
                </td>
              </tr>
            )}
            {!loading &&
              pageItems.map((r, idx) => {
                const st = COLLECTION_STATUS_STYLE[r.status] || COLLECTION_STATUS_STYLE["접수"];
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                    <td style={asTd}>
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelected(r.id)} />
                    </td>
                    <td style={asTd} title={r.management_no ? "회수 관리번호" : ""}>
                      {r.management_no || filtered.length - ((pageSafe - 1) * COLLECTION_PAGE_SIZE + idx)}
                    </td>
                    <td style={asTd}>{r.customer_name || "-"}</td>
                    <td style={asTd}>{r.contact || "-"}</td>
                    <td style={asTd}>{r.collection_date || "-"}</td>
                    <td style={asTd}>{r.address || "-"}</td>
                    <td style={asTd}>
                      <button
                        onClick={() => openEdit(r)}
                        style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 12.5, textAlign: "left" }}
                      >
                        {summarizeCollectionItems(r.items)}
                      </button>
                      {r.is_new && (
                        <span
                          title="새로 등록된 건이에요"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            background: C.brick,
                            color: "#fff",
                            fontSize: 9.5,
                            fontWeight: 700,
                            marginLeft: 5,
                          }}
                        >
                          N
                        </span>
                      )}
                    </td>
                    <td style={asTd}>{r.author || "-"}</td>
                    <td style={asTd}>{fmtCollectionDate(r.created_at)}</td>
                    <td style={asTd}>
                      <select
                        value={r.status}
                        onChange={(e) => handleStatusChange(r, e.target.value)}
                        disabled={savingStatusId === r.id}
                        style={{ border: `1px solid ${st.color}`, background: st.bg, color: st.color, fontSize: 12, padding: "4px 6px", fontFamily: sans, fontWeight: 600 }}
                      >
                        {COLLECTION_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe === 1} style={miniBtnStyle}>
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                ...miniBtnStyle,
                background: p === pageSafe ? C.ink : "transparent",
                color: p === pageSafe ? "#fff" : C.inkSoft,
                borderColor: p === pageSafe ? C.ink : C.line,
              }}
            >
              {p}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages} style={miniBtnStyle}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}

function CollectionRequestForm({ initial, prefill, isAdmin, managerName, onCancel, onSave }) {
  const [f, setF] = useState(
    initial || {
      management_no: "",
      voucher_no: "",
      request_type: "",
      customer_name: "",
      contact: "",
      collection_date: "",
      address: "",
      phone: "",
      original_courier: "",
      author: getMyName() || (isAdmin ? "" : managerName), // 이 컴퓨터·브라우저에 저장해둔 "내 이름"이 있으면 그걸 우선 채움
      status: "접수",
      items: [],
      ...(prefill || {}),
    }
  );
  const [saving, setSaving] = useState(false);
  const update = (patch) => setF({ ...f, ...patch });

  function updateItem(idx, patch) {
    setF((prev) => ({ ...prev, items: (prev.items || []).map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addItemRow() {
    setF((prev) => ({ ...prev, items: [...(prev.items || []), { item: "", spec: "", qty: 1 }] }));
  }
  function removeItemRow(idx) {
    setF((prev) => ({ ...prev, items: (prev.items || []).filter((_, i) => i !== idx) }));
  }

  async function handleSubmit() {
    if (!(f.customer_name || "").trim()) {
      alert("상호(고객명)를 입력해주세요.");
      return;
    }
    const cleanItems = (f.items || [])
      .map((it) => ({ item: (it.item || "").trim(), spec: (it.spec || "").trim(), qty: Number(it.qty) || 0 }))
      .filter((it) => it.item && it.qty > 0);
    if (cleanItems.length === 0) {
      alert("회수 품목을 하나 이상 입력해주세요.");
      return;
    }
    setSaving(true);
    await onSave({
      management_no: (f.management_no || "").trim() || null,
      voucher_no: (f.voucher_no || "").trim() || null,
      request_type: (f.request_type || "").trim() || null,
      customer_name: f.customer_name.trim(),
      contact: (f.contact || "").trim() || null,
      collection_date: (f.collection_date || "").trim() || null,
      address: (f.address || "").trim() || null,
      phone: (f.phone || "").trim() || null,
      original_courier: (f.original_courier || "").trim() || null,
      author: (f.author || "").trim() || null,
      status: f.status || "접수",
      items: cleanItems,
    });
    setSaving(false);
  }

  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 16 }}>
        {initial ? "회수 내역 수정" : prefill ? "회수 지시서 확인" : "회수 신규 등록"}
      </div>
      {prefill && (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
          엑셀에서 읽은 내용이에요. 등록 전에 내용을 확인·수정해주세요.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Field label="관리번호(NO.)">
          <input style={inputStyle} value={f.management_no || ""} onChange={(e) => update({ management_no: e.target.value })} placeholder="예: 15159" />
        </Field>
        <Field label="전표번호">
          <input style={inputStyle} value={f.voucher_no || ""} onChange={(e) => update({ voucher_no: e.target.value })} placeholder="예: 2609231" />
        </Field>
        <Field label="구분">
          <input style={inputStyle} value={f.request_type || ""} onChange={(e) => update({ request_type: e.target.value })} placeholder="예: 전체회수 또는 일부회수" />
        </Field>
        <Field label="상호(고객명)">
          <input style={inputStyle} value={f.customer_name || ""} onChange={(e) => update({ customer_name: e.target.value })} placeholder="예: 리마켓엔지니어링" />
        </Field>
        <Field label="담당자">
          <input style={inputStyle} value={f.contact || ""} onChange={(e) => update({ contact: e.target.value })} placeholder="예: 박춘하 부장" />
        </Field>
        <Field label="TEL">
          <input style={inputStyle} value={f.phone || ""} onChange={(e) => update({ phone: e.target.value })} placeholder="예: 010-1111-2222" />
        </Field>
        <Field label="회수일">
          <input style={inputStyle} value={f.collection_date || ""} onChange={(e) => update({ collection_date: e.target.value })} placeholder="예: 2026-09-30(수)" />
        </Field>
        <Field label="최초배송자">
          <input style={inputStyle} value={f.original_courier || ""} onChange={(e) => update({ original_courier: e.target.value })} />
        </Field>
        <Field label="작성자">
          <input style={inputStyle} value={f.author || ""} onChange={(e) => update({ author: e.target.value })} placeholder="예: 신상헌" />
        </Field>
        <Field label="진행상태">
          <select style={inputStyle} value={f.status || "접수"} onChange={(e) => update({ status: e.target.value })}>
            {COLLECTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="주소">
        <input style={inputStyle} value={f.address || ""} onChange={(e) => update({ address: e.target.value })} placeholder="예: 서울시 강남구 테헤란로 410, 19~21층" />
      </Field>

      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, margin: "10px 0 8px" }}>회수 품목</div>
      <div style={{ border: `1px solid ${C.lineSoft}`, marginBottom: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 32px", gap: 8, padding: "6px 10px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.lineSoft}` }}>
          <div>품목</div>
          <div>규격</div>
          <div>수량</div>
          <div></div>
        </div>
        {(f.items || []).map((it, idx) => (
          <div
            key={idx}
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 32px", gap: 8, padding: "6px 10px", alignItems: "center", borderBottom: `1px solid ${C.lineSoft}` }}
          >
            <input style={smallInputStyle} value={it.item || ""} onChange={(e) => updateItem(idx, { item: e.target.value })} placeholder="품목명" />
            <input style={smallInputStyle} value={it.spec || ""} onChange={(e) => updateItem(idx, { spec: e.target.value })} placeholder="규격" />
            <input type="number" min={0} style={smallInputStyle} value={it.qty ?? ""} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
            <button
              type="button"
              onClick={() => removeItemRow(idx)}
              title="이 품목 삭제"
              aria-label="이 품목 삭제"
              style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
            >
              ×
            </button>
          </div>
        ))}
        {(f.items || []).length === 0 && (
          <div style={{ padding: 14, textAlign: "center", color: C.muted, fontSize: 12.5 }}>회수 품목이 없어요. 아래에서 추가해주세요.</div>
        )}
      </div>
      <div style={{ marginBottom: 16 }}>
        <button type="button" onClick={addItemRow} style={ghostBtnStyle}>+ 품목 추가</button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSubmit} disabled={saving} style={primaryBtnStyle2}>
          {saving ? "저장 중…" : initial ? "저장" : "등록"}
        </button>
        <button onClick={onCancel} style={ghostBtnStyle}>
          취소
        </button>
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

// "파티션 넣기 기능을 하나 만들어줘... 파티션 실제 두께는 4.5cm야" 요청(2026-10-01) — 상판 좌/우
// 옆에 자동으로 붙는 파티션(칸막이)의 실제 두께(cm). 어떤 모형에 붙이든 항상 이 값 하나로 고정된다
// (실제 "45T" 파티션 제품의 두께 4.5cm를 그대로 반영).
const PARTITION_THICKNESS_CM = 4.5;

// "퍼즐 왼쪽은 120이 아니잖아 책상크기 만큼만 파티션을 쳐야지" 신고(2026-10-01) — ㄱ자(퍼즐)책상처럼
// 한쪽 모서리가 파인(notch) 모형은, 왼쪽·오른쪽·앞쪽 변이 전부 widthCm/depthCm 그대로의 길이를 갖지
// 않는다(파인 모서리 쪽은 그만큼 짧다). shapePolygonPoints가 ㄱ자의 윤곽선을 그릴 때 쓰는 것과 똑같은
// cutLeft/cutBottom/nw/nd 규칙으로, 이 모형의 왼쪽(left)·오른쪽(right)·앞쪽(front) 변이 실제로 책상
// 몸체와 맞닿아 있는 길이(cm)를 계산한다 — 파티션을 처음 붙일 때의 기본 길이로도 쓰고, 직접 입력한
// 길이가 이 값을 넘지 못하게(= "책상크기 만큼만") 막는 상한으로도 쓴다. 사각형·원형·의자류 등
// 파인 모서리가 없는 모양은 그대로 widthCm/depthCm(앞쪽은 widthCm, 좌/우는 depthCm)를 쓴다 — 기존과
// 100% 동일(회귀 없음).
function partitionMaxLengthCm(it, side) {
  const W = Number(it.widthCm) || 0;
  const D = Number(it.depthCm) || 0;
  if (it.shapeType === "l" || it.shapeType === "curvedl") {
    const rawNw = Number(it.notchWidthCm) || 0;
    const rawNd = Number(it.notchDepthCm) || 0;
    const cutLeft = rawNw < 0;
    const cutBottom = rawNd < 0;
    const nw = Math.min(Math.max(Math.abs(rawNw), 0), Math.max(W - 1, 0));
    const nd = Math.min(Math.max(Math.abs(rawNd), 0), Math.max(D - 1, 0));
    if (side === "left") return cutLeft ? D - nd : D;
    if (side === "right") return cutLeft ? D : D - nd;
    if (side === "front") return cutBottom ? W : W - nw;
  }
  // U자(테이블류 쪽에 주로 있어 "책상류"에는 보통 없지만, 혹시 몰라 안전하게)·그 외 파인 모서리 없는
  // 모양은 그대로 widthCm/depthCm을 쓴다.
  return side === "front" ? W : D;
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

// "좌표에서 소수점 단위를 너무 많이 보여주지마, 소수점 두자리까지만" 요청(2026-10-01) — 회전·스냅·충돌
// 계산을 거치고 나면 xCm/yCm가 124.20000000000001cm처럼 길게 떨어지는 경우가 있어서, 좌표 입력칸에
// 보여줄 때만 소수점 둘째 자리까지로 반올림한다(실제 좌표값 자체·계산 정밀도는 그대로 두고, 화면에
// 보이는 글자만 깔끔하게 다듬는 용도).
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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

// "코너용 90도 상판" 요청(2026-10-06, 참고 이미지: 일자형 회의테이블 사이에 끼워 방향을 꺾는 1/4원
// 모양 상판 — W800×D600 책상 사이에 W600×D600짜리가 들어감) 외곽선을 SVG path로 그린다. 왼쪽
// 위(0,0) 모서리는 직각 그대로 두고(위쪽 변은 오른쪽으로 W만큼, 왼쪽 변은 아래로 D만큼 직선으로
// 뻗어나감), 그 두 변의 끝점(W,0)과 (0,D)만 1/4 타원 호 하나로 매끄럽게 이어서 반대쪽 모서리를
// 둥글게 깎아낸다 — 참고 이미지의 "두 직선 변 + 1/4원 호" 모양 그대로다. 가로·세로가 같으면
// (보통의 경우, 예: 600×600) 완전한 1/4 원이 되고, 다르면 1/4 타원이 된다. 충돌(겹침) 판정은
// 다른 둥근 모양(원형·한쪽둥근)과 마찬가지로 shapePolygonPoints/shapeSubRects를 따로 손대지 않고
// 그냥 전체 네모 박스 기준으로 계산한다(모형이 책상류라 어차피 넉넉히 떨어뜨려 배치하는 용도라
// 실용상 문제없음).
function quarterCirclePathD(widthCm, depthCm) {
  const W = Number(widthCm) || 0;
  const D = Number(depthCm) || 0;
  return `M 0,0 L ${W},0 A ${W},${D} 0 0 1 0,${D} Z`;
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
  const [newShapeType, setNewShapeType] = useState("rect"); // "rect" | "l"(ㄱ자) | "curvedl"(곡선ㄱ자책상) | "u"(U자) | "circle"(원형) | "roundend"(한쪽둥근) | "quartercircle"(코너용 1/4원 상판) | "chair"(사무의자) | "meetingchair"(회의의자) | "sofa"(쇼파)
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

  // "공간 사이즈 기본값을 가로6 세로3으로" 요청으로 처음 들어왔을 때(또는 새로고침 때) 보이는 기본
  // 공간 크기를 5m×4m에서 6m×3m로 바꿨다. 이미 만들어둔 배치판을 불러오거나(handleLoadBoard) 직접
  // 입력해서 "배치판 만들기"를 누르면 그 값으로 그대로 바뀌니, 이 기본값은 정말 "처음 화면"에만 쓰인다.
  const [widthInput, setWidthInput] = useState("6");
  const [depthInput, setDepthInput] = useState("3");
  const [spaceWidthM, setSpaceWidthM] = useState(6);
  const [spaceDepthM, setSpaceDepthM] = useState(3);

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

  // "바로전으로 돌아가는 기능(컨트롤+Z)" 요청 — 배치판에 놓인 모형을 바꾸는 동작(옮기기·크기조절·
  // 회전·삭제·붙여넣기·그룹화·정렬 등) 직전의 placedItems를 여기에 쌓아두고, Ctrl+Z(맥은 Cmd+Z)를
  // 누르면 가장 최근 것부터 하나씩 꺼내 되돌린다. 최대 50단계까지만 쌓아서(그 전 건 자동으로 버림)
  // 메모리가 끝없이 늘어나지 않게 한다. 연속으로 끌거나(드래그) 손잡이로 계속 움직이는 동작은 "시작하기
  // 직전" 상태 한 번만 쌓도록, 각 동작의 "시작하는 지점"에서만 pushHistory를 부른다(끄는 도중 매
  // 프레임마다 쌓으면 Ctrl+Z 한 번에 거의 안 움직인 것처럼 느껴지므로).
  const historyRef = useRef([]);
  function pushHistory() {
    historyRef.current = [...historyRef.current.slice(-49), placedItems];
  }
  function handleUndo() {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setPlacedItems(prev);
    setSelectedPlacedIds(new Set());
  }

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
    const isQuarterCircle = shapeType === "quartercircle";
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
        ) : isQuarterCircle ? (
          <svg width={22} height={22} viewBox={`0 0 ${s.width_cm} ${s.depth_cm}`} style={{ flexShrink: 0 }}>
            <path d={quarterCirclePathD(s.width_cm, s.depth_cm)} fill={C.furnitureBg} stroke={C.brownAccent} strokeWidth={Math.max(s.width_cm, s.depth_cm) / 12} />
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

  // (2026-10-01) "가구가 좌표로 정확히 넣을 수 있으니까 조금만 더 지금보다 부드럽게 움직이면
  // 좋겠다" 요청으로, 배치판 위에 이미 놓인 모형을 옮기는 방식이 브라우저 기본 드래그(HTML5
  // draggable/onDragStart, 끄는 동안 미리보기가 없어 뚝뚝 끊겨 보이던 방식)에서 mousedown 기반
  // 방식(startMovePlaced, 아래쪽 손잡이들 바로 다음에 정의됨)으로 바뀌면서, 이 자리에 있던
  // handleDragStartPlaced(드래그 고스트 이미지를 투명하게 비우던 함수)는 더 이상 쓰이지 않아
  // 지웠다 — mousedown 기반 방식은애초에 브라우저 기본 드래그 고스트 자체가 뜨지 않으므로
  // 마우스가 그 모형의 왼쪽 위 모서리에서 얼마나 떨어진 지점을 잡았는지(offset)는 이제
  // startMovePlaced 안에서 계산한다 — "이상한 글씨가 따라다니는" 문제도 mousedown 기반 방식에서는
  // 브라우저 기본 드래그 고스트 자체가 뜨지 않으므로 원천적으로 다시 생기지 않는다.

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

  // 자석 스냅 → 그래도 겹치면 밀어내기, 순서로 적용한다. 마지막엔 배치판(공간) 밖으로 절대 넘어가지
  // 않도록 가로·세로 범위를 벽 안쪽으로 딱 고정한다(모형이 방보다 큰 극단적인 경우만 왼쪽·위쪽 벽에
  // 맞춰둔다).
  // (버그 수정) "밑에 의자가 있으니까 책상이 한번 움직이면 원래 자리에 넣으려고 해도 정신을 못차리네"
  // 신고 — resolveOverlap은 placedItems를 순서대로 훑으면서 겹치는 상대를 "하나씩" 밀어내는데, 뒤쪽
  // 상대를 밀어내다가 앞서 이미 처리했던 상대와 다시 겹치게 되는 경우가 있다(스크린샷처럼 의자 하나에
  // 책상이 양옆·위아래로 셋 이상 빽빽하게 붙어있는 자리가 전형적인 예 — 의자를 피해 밀려나면 바로
  // 옆 책상과 겹치고, 그걸 피해 밀려나면 다시 의자와 겹치는 식). 바깥 반복(아래 for문)이 이런 경우를
  // 다시 처리해주긴 하지만, 예전엔 "최대 4번"까지만 반복하고 그 안에 완전히 안 겹치는 자리로 수렴하지
  // 못하면(빽빽한 자리일수록 여러 번 왔다갔다해야 함) 중간의 애매한 자리에서 그냥 멈춰버렸다 — 그래서
  // 같은 자리에 다시 놓으려 해도 매번 살짝 다른, 예측 못 할 자리에 떨어지는 것처럼 보였다. 겹침이 이미
  // 다 풀렸으면(resolved 좌표가 그대로면) 아래 break로 어차피 더 돌지 않고 바로 멈추니, 반복 횟수를
  // 넉넉히 24번으로 늘려도 원래 4번 안에 풀리던 경우의 동작·속도는 전혀 달라지지 않고, 이렇게 여러
  // 상대에 둘러싸여 더 많이 왔다갔다해야 풀리는 빽빽한 자리만 끝까지 수렴할 기회를 더 준다.
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
    for (let i = 0; i < 24; i++) {
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
      pushHistory();
      setPlacedItems((prev) => [
        ...prev,
        {
          id: nextPlacedId(),
          shapeId: shape.id,
          name: shape.name,
          shapeType: shape.shape_type || "rect",
          // "파티션은 책상에만 국한시켜줘" 요청(2026-10-01) — "파티션 추가" 버튼을 "책상류"를
          // 선택했을 때만 보여주려면, 이 모형이 어느 카테고리(책상류/의자류/테이블류/…)에서 왔는지
          // 놓을 때 같이 저장해둬야 한다(모형 목록 쪽 shape.category를 그대로 가져옴).
          category: shape.category || "기타",
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
    }
    // (2026-10-01) 예전엔 여기에 payload.type === "placed" 분기가 더 있어서, 이미 놓인 모형을 다시
    // 끌어다 "놓는" 순간에 한 번에 자리를 옮겼다. "조금만 더 부드럽게 움직이면 좋겠다" 요청으로 그
    // 방식(브라우저 기본 드래그)을 mousedown 기반(startMovePlaced, onMoveMove)으로 바꾸면서, 이제
    // 이미 놓인 모형을 옮기는 계산은 이 함수가 아니라 onMoveMove 쪽에서 매 프레임 이뤄진다 — 똑같은
    // 계산(자석 스냅 placeWithSnap, 묶어서 옮기기 clampGroupDelta)을 그대로 재사용하되, "드롭할 때
    // 한 번"이 아니라 "끄는 동안 계속" 실행된다는 점만 다르다. 이 함수(handleCanvasDrop)는 이제
    // 카탈로그에서 새 모형을 끌어다 놓는 경우(payload.type === "catalog")에만 쓰인다.
  }

  function handleRemovePlaced(id) {
    pushHistory();
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
    pushHistory();
    setPlacedItems((prev) => prev.filter((it) => !selectedPlacedIds.has(it.id)));
    setSelectedPlacedIds(new Set());
  }

  // 두 개 이상 선택한 상태에서 "그룹화"를 누르면 같은 groupId를 부여해서, 이후로는 그 중 하나만 눌러도
  // 전체가 같이 선택되고, 하나를 끌면 전체가 같이 움직인다.
  function handleGroupSelected() {
    if (selectedPlacedIds.size < 2) return;
    pushHistory();
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
    pushHistory();
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
    pushHistory();
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
    pushHistory();
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
    pushHistory();
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
      // (Ctrl+Z 되돌리기) 손잡이를 끄는 동안(onResizeMove) 매 프레임 쌓지 않고, 끌기 시작하는 이
      // 시점에 "끌기 전" 상태 한 번만 쌓는다 — 그래야 Ctrl+Z 한 번으로 이번 크기조절 전체가 통째로 되돌아간다.
      pushHistory();
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
      // (Ctrl+Z 되돌리기) 손잡이를 끄는 동안(onRotateMove) 매 프레임 쌓지 않고, 끌기 시작하는 이
      // 시점에 "끌기 전" 상태 한 번만 쌓는다 — 그래야 Ctrl+Z 한 번으로 이번 회전 전체가 통째로 되돌아간다.
      pushHistory();
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

  // "가구가 좌표로 정확히 넣을 수 있으니까 조금만 더 지금보다 부드럽게 움직이면 좋겠다" 요청(2026-10-01)
  // — 예전엔 모형을 끌어서 옮길 때 브라우저 기본 드래그(HTML5 draggable/onDragStart/onDrop)를 썼는데,
  // 이 방식은 끄는 동안 실시간으로 따라 움직이는 미리보기가 전혀 없고(마우스를 "놓는" 순간에만 한
  // 번에 자리가 정해짐 — 바로 위 handleDragStartPlaced였던 자리에 달려있던 옛 주석에도 "끄는 중에
  // 실시간으로 따라 움직이는 미리보기는 없었다"고 적혀 있었다), 거기다 브라우저가 dragover 이벤트
  // 자체를 듬성듬성 쏴줘서 전체적으로 뚝뚝 끊기는 느낌이었다. 크기조절·자유회전 손잡이(바로 위
  // startResizePlaced/startRotatePlaced)가 이미 쓰고 있는 "mousedown으로 시작 → mousemove마다 좌표를
  // 다시 계산해 state를 갱신(= 매 프레임 다시 그려짐) → mouseup에서 끝" 방식으로 통일해서, 끄는 내내
  // 모형이 커서를 매끄럽게 따라오도록 바꿨다. 자석처럼 붙는 기능(snapPlacement/placeWithSnap)이나
  // 여러 개를 묶어서 옮기는 기능(getMoveGroupIds/clampGroupDelta)은 이름까지 그대로 재사용한다 —
  // 바뀐 건 "언제 좌표가 갱신되는지"(마우스를 놓는 순간 한 번 → 끄는 동안 매 프레임)뿐이고, 실제
  // 자리를 정하는 계산 자체는 예전 handleCanvasDrop의 "placed" 분기와 똑같다.
  const moveDragRef = useRef(null);
  useEffect(() => {
    function onMoveMove(e) {
      const drag = moveDragRef.current;
      if (!drag) return;
      // 마퀴 선택(handleCanvasMouseDown)과 똑같이, 아주 작은 손떨림(3px 이내)은 "끈 것"으로 치지
      // 않는다 — 그래야 제자리에서 누르기만 하고 뗀 "그냥 클릭"이 Ctrl+Z 기록에 쌓이거나 선택을
      // 흐트러뜨리지 않는다(moved가 true가 된 뒤에야 비로소 실행취소 기록 한 번(pushHistory)을 남긴다 —
      // 손잡이들과 똑같이 "끌기 전" 상태를 한 번만 쌓아서 Ctrl+Z 한 번으로 이번 이동 전체가 통째로
      // 되돌아가게 한다).
      if (!drag.moved) {
        const distPx = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
        if (distPx <= 3) return;
        drag.moved = true;
        pushHistory();
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const cmX = (e.clientX - rect.left) / renderScale;
      const cmY = (e.clientY - rect.top) / renderScale;
      const moving = placedItems.find((it) => it.id === drag.id);
      if (!moving) return;
      const rotation = moving.rotation != null ? moving.rotation : moving.rotated ? 90 : 0;
      const rawX = Math.max(0, cmX - drag.offsetXCm);
      const rawY = Math.max(0, cmY - drag.offsetYCm);
      const moveGroupIds = drag.moveGroupIds;
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
        setPlacedItems((prev) => prev.map((it) => (it.id === moving.id ? { ...it, xCm: placed.xCm, yCm: placed.yCm } : it)));
      }
    }
    function onMoveUp() {
      const drag = moveDragRef.current;
      // 실제로 끌어서 움직인 뒤라면, 뒤이어 자동으로 따라오는 click 이벤트(끌고 나서 손을 뗀 바로 그
      // 자리에서 mousedown·mouseup이 같은 요소에서 일어나면 브라우저가 click도 한 번 더 쏴준다)가
      // 모형 선택 로직(아래 onClick)까지 건드리지 않도록 "방금 끌었다"는 표시만 남겨둔다 — 예전
      // 브라우저 기본 드래그(HTML5 DnD)는 실제로 끌렸으면 click 자체가 안 일어났는데, mousedown 기반
      // 방식으로 바꾸면서 생긴 차이를 메워주는 부분이다(안 그러면 여러 개를 선택해 같이 끌어 옮긴
      // 직후 선택이 끌던 모형 하나로 줄어들어 버린다).
      if (drag && drag.moved) suppressNextClickRef.current = true;
      moveDragRef.current = null;
    }
    window.addEventListener("mousemove", onMoveMove);
    window.addEventListener("mouseup", onMoveUp);
    return () => {
      window.removeEventListener("mousemove", onMoveMove);
      window.removeEventListener("mouseup", onMoveUp);
    };
  }, [renderScale, spaceWidthM, spaceDepthM, placedItems]);

  // 끌고 나서 손을 뗀 직후에 하나 더 쏘아지는 click 이벤트를 걸러내기 위한 표시(바로 위 onMoveUp
  // 주석 참고). 렌더와 무관한 순간적인 신호라 useRef로 들고 있는다(끌 때마다 다시 그려질 필요 없음).
  const suppressNextClickRef = useRef(null);
  if (suppressNextClickRef.current === null) suppressNextClickRef.current = false;

  function startMovePlaced(it) {
    return (e) => {
      // 줄자 모드에서는 끌기를 아예 하지 않는다 — 브라우저 기본 드래그가 살짝이라도 시작되면 그 순간
      // 클릭(onClick)이 아예 안 먹히는 경우가 있어서, 정확히 점을 찍으려는 클릭이 모형을 옮기는
      // 동작으로 오인되지 않게 막던 예전 draggable={!rulerMode}와 같은 이유로 그대로 둔다.
      if (rulerMode) return;
      if (e.button !== 0) return; // 왼쪽 버튼으로 끌 때만(오른쪽 클릭 등은 무시)
      e.stopPropagation();
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const cmX = (e.clientX - rect.left) / renderScale;
      const cmY = (e.clientY - rect.top) / renderScale;
      moveDragRef.current = {
        id: it.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        offsetXCm: cmX - it.xCm,
        offsetYCm: cmY - it.yCm,
        moveGroupIds: getMoveGroupIds(it),
        moved: false,
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
  // "제품 클릭해서 좌표값 넣어주는 기능 — 제일 정확하지" 요청으로 추가. 가로·세로 숫자 입력과 똑같은
  // 자리·방식으로, 모형의 왼쪽위 모서리 좌표(xCm, yCm)를 숫자로 직접 입력해서 끌지 않고도 정확한 자리에
  // 둘 수 있게 한다. 위 가로·세로 입력과 마찬가지로 하나만 선택했을 때만 의미가 있다.
  const [manualXInput, setManualXInput] = useState("");
  const [manualYInput, setManualYInput] = useState("");
  // "제품 선택하면 각도 넣어줘 — 회전기능은 그대로 두고 각도 넣으면 조정되게" 요청. 90도 버튼(⟳)과
  // 선택했을 때 나오는 동그라미 손잡이(자유 회전)는 그대로 두고, 숫자로 각도를 직접 입력하는 방법을
  // 하나 더 추가한다.
  const [manualAngleInput, setManualAngleInput] = useState("");
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
      setManualXInput(String(round2(selectedSingleItem.xCm)));
      setManualYInput(String(round2(selectedSingleItem.yCm)));
      const curRotation = selectedSingleItem.rotation != null ? selectedSingleItem.rotation : selectedSingleItem.rotated ? 90 : 0;
      setManualAngleInput(String(Math.round(curRotation)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSingleItemId]);

  // "파티션 생기니까 도형이 여기 붙었다 저기 붙었다 정신을 못차린다"(책상에 파티션이 붙어있으니 책상
  // 자체를 자유롭게 끌어 옮기기 힘들어짐) + "파티션 길이조절이 안된다"(아래 가로·세로 입력칸에
  // 묻어가지 못하고 따로 만든 길이 입력칸이 제대로 안 먹음) + "파티션 자유이동 기능도 넣어줘"(변에서
  // 완전히 떼어내 배치판 아무 곳에나 독립적으로 놓을 수 있게) — 이 세 가지 신고(2026-10-01 3차)를
  // 한 번에 해결하기 위해, 파티션을 "책상 모형 데이터(it.partitions)에 딸려있는 한 세트"가 아니라
  // 책상·의자처럼 배치판 위의 독립된 모형(shapeType: "partition") 하나로 바꿨다. 이러면:
  //  ① 책상에는 더 이상 아무것도 "붙어" 있지 않으므로 책상을 끌 때 파티션이 간섭하지 않고(자유이동
  //     문제 해결), ② 파티션도 다른 모형과 똑같이 끌기·회전·삭제·Ctrl+Z가 되고(자유이동 기능 자체),
  //     ③ 길이를 바꾸는 것도 이미 잘 작동하는 공용 "가로·세로 직접 입력(Enter 또는 적용 버튼)" 칸을
  //     그대로 쓰게 되어(아래 가로=widthCm을 "길이"로 쓴다) 따로 만들었던(그리고 말썽이었던) 전용
  //     길이 입력칸이 더 이상 필요 없다. "책상류를 선택했을 때만 뜨는 버튼"은 그대로 남겨뒀지만,
  //     이제 그 버튼은 파티션을 "토글(붙이기/떼기)"하는 게 아니라, 그 책상 옆에 알맞은 길이로
  //     새 파티션 모형 하나를 "만들어 놓아주는" 역할만 한다 — 그 다음부터는 책상과 완전히 별개로
  //     자유롭게 움직일 수 있다.
  // "북쪽 파티션은 항상 좌우 파티션까지 고려해서 크기를 설정해줘" 요청(2026-10-01 4차) — 파티션이
  // 독립된 모형이 된 뒤에도, 앞쪽(북쪽) 파티션을 새로 "만들 때"만큼은 그 책상의 왼쪽·오른쪽 자리에
  // 이미(기본 위치 그대로) 놓여있는 파티션이 있는지 찾아보고, 있으면 그 두께(4.5cm)만큼 북쪽 파티션의
  // 시작점·길이를 늘려서 처음부터 구석(모서리)까지 맞물리게 만들어준다 — 예전(책상에 "붙어있던" 시절)
  // 구현했던 "퍼즐처럼 딱 맞는 모서리"와 같은 결과를, 이제는 만드는 "그 순간"에 한 번 계산해서 적용한다
  // (파티션끼리 서로 독립이라 그 이후엔 각자 자유롭게 움직여도 된다 — "자유이동" 설계와 그대로 호환).
  // 왼쪽/오른쪽 파티션이 책상의 기본 자리에서 이미 다른 곳으로 옮겨졌다면 못 찾을 수 있는데, 그건
  // "독립된 모형이라 자유롭게 움직일 수 있다"는 설계상 자연스러운 한계로 받아들인다.
  function findAdjacentPartition(desk, side, aabb) {
    const expectedXCm = side === "left" ? desk.xCm - PARTITION_THICKNESS_CM : desk.xCm + aabb.w;
    const expectedYCm = desk.yCm;
    return (
      placedItems.find(
        (p) =>
          p.shapeType === "partition" &&
          Math.abs(p.xCm - expectedXCm) < 0.5 &&
          Math.abs(p.yCm - expectedYCm) < 0.5
      ) || null
    );
  }

  // "도형 누르고 파티션 좌측 우측 누르면 생기잖아 다시 누르면 없어지게 해줭" 요청(2026-10-01 5차) —
  // 앞쪽(북쪽) 파티션을 토글할 때도 "이 책상 북쪽에 이미 파티션이 있는지"를 찾아야 한다. 다만 북쪽
  // 파티션은 findAdjacentPartition(왼쪽·오른쪽용, 정확한 한 점만 보는 방식)과 달리 왼쪽·오른쪽
  // 파티션 유무에 따라 처음 만들어질 때부터 시작점(xCm)·길이가 달라질 수 있어서(바로 아래
  // handleAddPartitionItem의 left/right 늘림 로직 참고), 정확히 한 점이 아니라 "책상 바로 위쪽
  // (두께만큼)에 놓여 있고, 가로 범위가 책상과 겹치는 가로막대 파티션인지"로 넉넉하게 찾는다.
  function findFrontPartitionForDesk(desk, aabb) {
    const expectedYCm = desk.yCm - PARTITION_THICKNESS_CM;
    return (
      placedItems.find(
        (p) =>
          p.shapeType === "partition" &&
          p.depthCm === PARTITION_THICKNESS_CM && // 가로막대(앞쪽용)만 — 세로막대(좌/우용)는 제외
          Math.abs(p.yCm - expectedYCm) < 0.5 &&
          p.xCm < desk.xCm + aabb.w &&
          p.xCm + p.widthCm > desk.xCm
      ) || null
    );
  }

  function handleAddPartitionItem(side) {
    if (!selectedSingleItem) return;
    if (selectedSingleItem.category !== "책상류") return;
    const desk = selectedSingleItem;
    const deskRotation = desk.rotation != null ? desk.rotation : desk.rotated ? 90 : 0;
    const aabb = rotatedAabbSize(desk.widthCm, desk.depthCm, deskRotation);
    // "도형 누르고 파티션 좌측 우측 누르면 생기잖아 다시 누르면 없어지게 해줭" 요청(2026-10-01 5차) —
    // 이 버튼은 이제 단순히 "추가"만 하는 게 아니라 토글이다. 그 변에 이 책상의 파티션이 이미 있으면
    // (책상 옆 기본 자리에 그대로 있을 때만 찾아짐 — 파티션은 독립 모형이라 자유롭게 옮겨질 수
    // 있으므로, 다른 데로 옮겨진 파티션은 "이 책상의 파티션"으로 못 찾는 게 자연스러운 한계다) 새로
    // 만들지 않고 그 파티션을 지운다(다시 누르면 없어짐). 좌/우 파티션을 지워도 이미 만들어져 있는
    // 앞쪽(북쪽) 파티션의 길이를 되돌리지는 않는다 — 파티션들은 만들어진 뒤로는 서로 완전히
    // 독립적이라는 기존 설계("자유이동") 그대로다.
    const existing = side === "front" ? findFrontPartitionForDesk(desk, aabb) : findAdjacentPartition(desk, side, aabb);
    if (existing) {
      pushHistory();
      setPlacedItems((prev) => prev.filter((it) => it.id !== existing.id));
      setSelectedPlacedIds((prev) => {
        if (!prev.has(existing.id)) return prev;
        const next = new Set(prev);
        next.delete(existing.id);
        return next;
      });
      return;
    }
    // partitionMaxLengthCm은 ㄱ자 책상의 파인 모서리까지 고려해서 "그 변에 실제로 책상이 맞닿아 있는
    // 길이"를 계산하는데, 이 계산은 돌리기 전(로컬) 좌표계를 기준으로 한다. 책상이 0도/180도로 놓여
    // 있을 때만 이 로컬 좌/우/앞 방향이 화면에서도 그대로 좌/우/앞이므로 그 값을 쓰고, 90도 등으로
    // 돌아간 책상은 방향이 뒤섞이므로 더 간단하게 바깥 네모(aabb) 치수로 대신한다 — 어차피 이제
    // 파티션은 독립된 모형이라 자리·길이를 자유롭게 다시 맞출 수 있으니, 처음 놓이는 자리는 "대략
    // 책상 옆"이면 충분하다.
    const axisAligned = deskRotation % 180 === 0;
    const lengthCm = round2(axisAligned ? partitionMaxLengthCm(desk, side) : side === "front" ? aabb.w : aabb.h);
    let widthCm, depthCm, xCm, yCm;
    if (side === "left") {
      widthCm = PARTITION_THICKNESS_CM;
      depthCm = lengthCm;
      xCm = desk.xCm - PARTITION_THICKNESS_CM;
      yCm = desk.yCm;
    } else if (side === "right") {
      widthCm = PARTITION_THICKNESS_CM;
      depthCm = lengthCm;
      xCm = desk.xCm + aabb.w;
      yCm = desk.yCm;
    } else {
      widthCm = lengthCm;
      depthCm = PARTITION_THICKNESS_CM;
      xCm = desk.xCm;
      yCm = desk.yCm - PARTITION_THICKNESS_CM;
      // 왼쪽·오른쪽 파티션이 이미 책상 기본 자리에 있으면, 그 두께만큼 북쪽 파티션의 시작점을
      // 왼쪽으로 밀고 길이를 늘려서 구석까지 맞물리게 한다(둘 다 있으면 양쪽 다 늘어남).
      if (findAdjacentPartition(desk, "left", aabb)) {
        widthCm += PARTITION_THICKNESS_CM;
        xCm -= PARTITION_THICKNESS_CM;
      }
      if (findAdjacentPartition(desk, "right", aabb)) {
        widthCm += PARTITION_THICKNESS_CM;
      }
    }
    xCm = Math.max(0, xCm);
    yCm = Math.max(0, yCm);
    pushHistory();
    setPlacedItems((prev) => [
      ...prev,
      {
        id: nextPlacedId(),
        shapeId: null,
        name: "파티션",
        shapeType: "partition",
        category: "소파·파티션·기타",
        widthCm,
        depthCm,
        notchWidthCm: null,
        notchDepthCm: null,
        xCm,
        yCm,
        rotation: 0,
        flipped: false,
        groupId: null,
      },
    ]);
  }

  // 선택한 모형 하나의 이름만 바꾼다(가로·세로 크기는 그대로 둠). 빈 칸으로 지우고 적용하면 원래
  // 이름으로 되돌린다(이름이 아예 없어지면 나중에 혼란스러우므로).
  function handleApplyManualName() {
    if (!selectedSingleItem) return;
    const it = selectedSingleItem;
    const trimmed = manualNameInput.trim();
    const newName = trimmed || it.name;
    pushHistory();
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
    pushHistory();
    setPlacedItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, widthCm: newWidthCm, depthCm: newDepthCm } : p)));
    setManualWidthInput(String(newWidthCm));
    setManualDepthInput(String(newDepthCm));
  }

  // "제품 클릭해서 좌표값 넣어주는 기능 — 제일 정확하지" 요청. 끌어서 옮기는 대신 왼쪽위 모서리
  // 좌표(xCm, yCm)를 숫자로 직접 입력해서 정확히 맞춘다. 0도 엄연히 유효한 좌표(벽에 딱 붙임)라서,
  // 위 가로·세로 입력처럼 "입력값이 없으면(falsy) 원래 값으로" 방식을 쓰지 않고, 숫자로 읽히면(0
  // 포함) 그 값을, 못 읽으면만 원래 좌표를 쓴다. 화면에 보이는(회전 반영) 크기 기준으로 배치판 밖을
  // 벗어나지 않게 제한하는 것은 마우스로 끌 때·가로세로 직접입력 때와 같은 규칙이다.
  function handleApplyManualPosition() {
    if (!selectedSingleItem) return;
    const it = selectedSingleItem;
    const rotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
    const aabb = rotatedAabbSize(it.widthCm, it.depthCm, rotation);
    const maxX = Math.max(0, spaceWidthM * 100 - aabb.w);
    const maxY = Math.max(0, spaceDepthM * 100 - aabb.h);
    const parsedX = Number(manualXInput);
    const parsedY = Number(manualYInput);
    const rawX = Number.isFinite(parsedX) ? parsedX : it.xCm;
    const rawY = Number.isFinite(parsedY) ? parsedY : it.yCm;
    const newXCm = Math.min(Math.max(0, rawX), maxX);
    const newYCm = Math.min(Math.max(0, rawY), maxY);
    pushHistory();
    setPlacedItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, xCm: newXCm, yCm: newYCm } : p)));
    setManualXInput(String(round2(newXCm)));
    setManualYInput(String(round2(newYCm)));
  }

  // "제품 선택하면 각도 넣어줘 — 지금 회전기능은 그대로 두고 각도 넣으면 조정되게" 요청. 90도 버튼이나
  // 동그라미 손잡이(자유 회전, startRotatePlaced/onRotateMove)는 손대지 않고 그대로 두고, 숫자로 각도를
  // 직접 입력해서 맞추는 방법만 하나 더 추가한다. 손잡이로 돌릴 때와 똑같이 "중심을 축으로" 돈다 —
  // 그래야 돌리는 동안 모서리가 방 밖으로 튀지 않고 자연스럽다(onRotateMove와 같은 계산 방식).
  function handleApplyManualAngle() {
    if (!selectedSingleItem) return;
    const it = selectedSingleItem;
    const currentRotation = it.rotation != null ? it.rotation : it.rotated ? 90 : 0;
    const currentAabb = rotatedAabbSize(it.widthCm, it.depthCm, currentRotation);
    const centerXCm = it.xCm + currentAabb.w / 2;
    const centerYCm = it.yCm + currentAabb.h / 2;
    const parsedDeg = Number(manualAngleInput);
    let deg = Number.isFinite(parsedDeg) ? parsedDeg : currentRotation;
    deg = ((deg % 360) + 360) % 360;
    const aabb = rotatedAabbSize(it.widthCm, it.depthCm, deg);
    const maxX = Math.max(0, spaceWidthM * 100 - aabb.w);
    const maxY = Math.max(0, spaceDepthM * 100 - aabb.h);
    const newXCm = Math.min(Math.max(0, centerXCm - aabb.w / 2), maxX);
    const newYCm = Math.min(Math.max(0, centerYCm - aabb.h / 2), maxY);
    pushHistory();
    setPlacedItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, rotation: deg, xCm: newXCm, yCm: newYCm } : p)));
    setManualAngleInput(String(deg));
  }

  // "의자만 세개 클릭하고 상단맞추기" 요청 — 피그마·파워포인트의 "위쪽 맞춤"과 같은 기능. 2개 이상
  // 선택한 상태에서 누르면, 선택한 모형들 중 가장 위(yCm이 가장 작은 값)에 맞춰 나머지 모형들의 세로
  // 위치만 그 자리로 옮긴다(가로 위치·크기·회전은 그대로 둔다). yCm은 회전 여부와 상관없이 항상 화면에
  // 보이는 바운딩박스의 맨 위 좌표라서(드래그·회전 때와 같은 규칙), 그대로 최솟값을 쓰면 된다.
  function handleAlignTopSelected() {
    if (selectedPlacedIds.size < 2) return;
    pushHistory();
    const selected = placedItems.filter((it) => selectedPlacedIds.has(it.id));
    const minY = Math.min(...selected.map((it) => it.yCm));
    setPlacedItems((prev) => prev.map((it) => (selectedPlacedIds.has(it.id) ? { ...it, yCm: minY } : it)));
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

      // "바로전으로 돌아가는 기능도 지금도 먹히나 컨트롤 제트하면?" 질문으로 새로 추가. 이름 입력칸 등에
      // 포커스가 가 있을 때는(맨 위 tag 검사로 이미 걸러짐) 그 칸 자체의 되돌리기(텍스트 입력 취소)를
      // 건드리지 않도록 여기까지 오지 않는다.
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        handleUndo();
        return;
      }
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
        pushHistory();
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
          pushHistory();
          setPlacedItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, xCm: round1(placed.xCm), yCm: round1(placed.yCm) } : p)));
          return;
        }
      }
      const anyItem = placedItems.find((p) => selectedPlacedIds.has(p.id));
      if (!anyItem) return;
      const memberIds = getMoveGroupIds(anyItem);
      const { dx: cdx, dy: cdy } = clampGroupDelta(memberIds, dx, dy);
      pushHistory();
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
      {/* "시뮬레이션 할때 오른쪽 스크롤 안생기게 한 화면에 들어가게... 상단 메뉴를 좀 축소화 하더라도
          같이 위로 좀 올리고 싶은데" 요청(2026-10-01) — 제목·안내문구·아래 입력 줄·선택 도구모음
          자리처럼 "모형 목록"·"대지" 위에 쌓여 있던 여백들을 하나하나 줄여서, 기능은 그대로 둔 채
          전체 높이만 줄였다(이 아래 여러 군데에 나눠 적용, 각 지점 주석 참고). 이 제목은 글자 크기는
          그대로 두되(너무 작아지면 안 보이므로) 아래 여백만 4px→2px로 줄였다. */}
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 2 }}>가구배치(시뮬레이션)</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
        <span>공간 크기를 입력하고 왼쪽 모형 목록에서 끌어다 놓아보세요.</span>
        <span
          title="처음 쓰는 모형은 가로·세로 크기(cm)를 한 번 등록해두면 다음부터 목록에 계속 남아있어요. 배치가 마음에 들면 이름을 붙여 저장해두고 나중에 다시 불러올 수 있어요."
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, borderRadius: "50%", border: `1px solid ${C.line}`, color: C.muted, fontSize: 10, cursor: "help", flexShrink: 0 }}
        >
          ⓘ
        </span>
      </div>

      {/* (위 요청 계속, 2026-10-01) 이 줄 아래 여백도 14px→8px로 줄였다 — Field(공용 컴포넌트, 라벨+
          입력창)가 자체적으로 16px 아래 여백을 이미 갖고 있어서 그건 건드리지 않았다(다른 화면들도
          같이 쓰는 공용 부품이라, 거길 줄이면 이 페이지 말고 다른 화면들까지 전부 영향을 받는다 —
          "기능상 지금까지 셋팅된거 건들지 말고" 요청과 어긋나므로 그대로 뒀다). */}
      <div className="layoutsim-no-print" style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8, flexWrap: "wrap" }}>
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
        {/* (2026-10-01) "공간 6m x 3m 와 파일 저장하면 보이는 기능을 배치판 만들기 버튼 오른쪽으로
            옮겨줘, 도형 선택창과 같은 공간 사용하지 말고" 요청 — "공간 WxH ⓘ" 정보와 "저장된 배치안"
            칩을, 아래쪽 선택 도구모음이 뜨는 줄에서 완전히 빼서 여기(배치판 만들기 바로 옆)로 옮겼다.
            이제 그 아래 줄은 오직 선택 도구모음(또는 줄자 등 고정 버튼들)만 쓰고, 공간정보·저장된
            배치안과는 더 이상 자리를 다투지 않는다. */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.muted }}>
            <span>공간 {spaceWidthM}m × {spaceDepthM}m</span>
            <span
              title="모형을 끌어다 놓거나, 이미 놓은 모형을 끌어서 옮겨보세요. 모형을 클릭하면 선택되고(테두리 강조), 빈 곳을 끌면 여러 개를 한꺼번에 선택할 수 있어요(Ctrl+끌면 기존 선택에 더하기). 방향키로 세밀하게 옮기고(Shift+방향키는 더 크게, Ctrl+방향키는 0.1cm 단위로 아주 정밀하게), Ctrl+C/Ctrl+V로 복사·붙여넣기도 할 수 있어요. 마우스 휠로 확대·축소할 수 있고, Shift를 누른 채 끌면 화면을 자유롭게 이동할 수 있어요."
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, borderRadius: "50%", border: `1px solid ${C.lineSoft}`, color: C.muted, fontSize: 10, cursor: "help", flexShrink: 0 }}
            >
              ⓘ
            </span>
          </span>
          {boards.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: C.muted }}>
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

      {/* "수정창은 아예 도형수정하는 곳 위에 별도로 빼자(책상을 누르면 거기에 별도로 뜨는게 맞을듯)"
          요청(2026-10-01) — 파티션 만들기 버튼을, 아래 "도형수정"(선택 도구모음: 이름·가로세로·좌표·
          각도 등) 줄 안에 같이 끼워 넣던 것을, 그 줄 바로 위에 전용 줄로 따로 뺐다. "책상류"를
          선택했을 때만 내용이 나타나지만, 이 줄 자체는(아래 도형수정 줄과 똑같은 이유로) minHeight를
          고정해서 책상을 선택하거나 해제해도, 또는 책상이 아닌 다른 가구를 선택해도 줄 높이가 전혀
          안 바뀐다 — "모형 목록"·"대지"가 흔들리던 예전 문제가 이 줄 때문에 재현되지 않는다.
          (2026-10-01 3차 변경) "파티션 생기니까 도형이 여기 붙었다 저기 붙었다 정신을 못차린다" +
          "파티션 길이조절이 안된다" + "파티션 자유이동 기능도 넣어줘" 신고로, 이 버튼들은 더 이상
          책상에 파티션을 "붙이는"(토글) 버튼이 아니라, 그 책상 옆에 알맞은 길이의 독립된 파티션
          모형을 "새로 만들어 놓아주는" 버튼이다(자세한 설계 이유는 handleAddPartitionItem 선언부
          주석 참고). 만들어진 뒤에는 책상과 완전히 별개로 자유롭게 끌어서 옮기거나 회전·삭제할 수
          있고, 길이는 선택했을 때 아래 "도형수정" 줄의 공용 가로 입력칸(Enter 또는 적용 버튼)으로
          조절한다 — 전용 길이 입력칸은 더 이상 없다.
          (2026-10-01 4차) "오른쪽 스크롤 안생기게 한 화면에 들어가게... 상단 메뉴를 좀 축소화 하더라도"
          요청으로, 높이가 고정된 이 줄의 minHeight를 40px→32px로 줄였다 — 안의 버튼(miniBtnStyle)
          높이는 26px 안팎이라 32px로도 여전히 여유 있게 들어간다. 줄 높이를 고정해서 "모형 목록"·
          "대지"가 흔들리지 않는다는 원래 목적은 그대로 유지된다(숫자만 더 작게 고정될 뿐). */}
      <div className="layoutsim-no-print" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, minHeight: 32, flexWrap: "nowrap", overflowX: "auto" }}>
        {selectedSingleItem && selectedSingleItem.category === "책상류" && (
          <>
            <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>🚧 파티션 추가(다시 누르면 없어짐):</span>
            <button onClick={() => handleAddPartitionItem("left")} title="선택한 책상 왼쪽에 파티션(두께 4.5cm) 모형을 새로 만들어요 — 만든 뒤엔 책상과 별개로 자유롭게 옮길 수 있고, 책상 옆 자리에 그대로 있다면 다시 눌러서 없앨 수 있어요" style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>
              🚧 좌측
            </button>
            <button onClick={() => handleAddPartitionItem("right")} title="선택한 책상 오른쪽에 파티션(두께 4.5cm) 모형을 새로 만들어요 — 만든 뒤엔 책상과 별개로 자유롭게 옮길 수 있고, 책상 옆 자리에 그대로 있다면 다시 눌러서 없앨 수 있어요" style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>
              🚧 우측
            </button>
            <button onClick={() => handleAddPartitionItem("front")} title="선택한 책상 앞쪽(북쪽)에 파티션(두께 4.5cm) 모형을 새로 만들어요 — 만든 뒤엔 책상과 별개로 자유롭게 옮길 수 있고, 책상 옆 자리에 그대로 있다면 다시 눌러서 없앨 수 있어요" style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>
              🚧 앞쪽
            </button>
          </>
        )}
      </div>

      {/* (2026-10-01 변경) "공간활용이 아쉽다 — 대지(검은 테두리 배치판 포함) 부분이 전체적으로 더 위로
          올라왔으면" 요청으로, 이 줄(선택 도구모음·줄자 등 버튼)이 "오른쪽 칸" 맨 위에서 곧장 시작해
          왼쪽 "모형 목록" 패널 맨 위와 거의 같은 높이에서 시작하게 했다.
          (2026-10-01 추가 수정) "도형을 누르면 뿅하고 생겼다가 없어지는데 왼쪽 메뉴판과 대지가 거기에
          따라 움직인다 — 고정해줘" 신고 + "공간 WxH와 저장된 배치안은 배치판 만들기 버튼 오른쪽으로,
          도형 선택창과 같은 공간을 쓰지 말고" 요청 — "저장된 배치안"·"공간 WxH" 정보는 위쪽 "배치판
          만들기" 버튼 옆으로 옮겨서 이 줄과 더 이상 자리를 다투지 않게 했고, 이 줄 자체는 minHeight를
          고정하고(선택 도구모음이 뜨고 사라져도 줄 높이가 늘었다 줄었다 하지 않도록) 안쪽 내용이
          옆으로 늘어나도 줄바꿈 대신 가로 스크롤만 생기게 해서(flexWrap: "nowrap" + overflowX: "auto")
          도형을 선택하거나 해제해도 이 줄의 높이 자체가 전혀 안 바뀐다 — 그 결과 바로 아래 "모형 목록"
          패널과 "대지"는 선택 여부와 무관하게 항상 같은 자리에 고정된다.
          (2026-10-01 4차) "오른쪽 스크롤 안생기게 한 화면에 들어가게... 상단 메뉴를 좀 축소화
          하더라도" 요청으로, minHeight를 44px→32px로 줄였다(바로 위 파티션 줄과 같은 높이로 통일) —
          안의 줄자·도면업로드·격자·확대축소·전체보기 버튼(miniBtnStyle)도 높이 26px 안팎이라 32px로
          충분히 들어간다. "줄 높이가 고정돼 모형 목록·대지가 안 흔들린다"는 원래 목적은 그대로다. */}
      <div className="layoutsim-no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "nowrap", gap: 8, marginBottom: 4, minHeight: 32 }}>
        <div style={{ fontSize: 12, color: C.muted, flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", overflowX: "auto" }}>
          {selectedPlacedIds.size > 0 && (
            <div
              className="layoutsim-no-print"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                background: C.purpleBg,
                border: `1px solid ${C.purple}`,
                borderRadius: 8,
                flexWrap: "nowrap",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 12, color: C.purple, fontWeight: 600, whiteSpace: "nowrap" }}>
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
                  <span style={{ fontSize: 12, color: C.lineSoft }}>|</span>
                  {/* "제품 클릭해서 좌표값 넣어주는 기능 — 제일 정확하지" 요청 — 끌지 않고도 왼쪽위
                      모서리 좌표(x, y, cm)를 숫자로 직접 입력해서 정확한 자리에 둘 수 있다. */}
                  <input
                    type="number"
                    step="0.1"
                    value={manualXInput}
                    onChange={(e) => setManualXInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyManualPosition();
                    }}
                    placeholder="X(cm)"
                    title="왼쪽위 모서리 X좌표(cm)"
                    style={{ ...smallInputStyle, width: 68, boxSizing: "border-box" }}
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={manualYInput}
                    onChange={(e) => setManualYInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyManualPosition();
                    }}
                    placeholder="Y(cm)"
                    title="왼쪽위 모서리 Y좌표(cm)"
                    style={{ ...smallInputStyle, width: 68, boxSizing: "border-box" }}
                  />
                  <button onClick={handleApplyManualPosition} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>이동</button>
                  <span style={{ fontSize: 12, color: C.lineSoft }}>|</span>
                  {/* "제품 선택하면 각도 넣어줘 — 회전기능은 그대로 두고 각도 넣으면 조정되게" 요청 —
                      90도 버튼(⟳)·동그라미 자유회전 손잡이는 그대로 둔 채, 숫자로 각도를 직접 입력하는
                      방법만 하나 더 추가. */}
                  <input
                    type="number"
                    step="1"
                    value={manualAngleInput}
                    onChange={(e) => setManualAngleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyManualAngle();
                    }}
                    placeholder="각도"
                    title="회전 각도(도, 0~359)"
                    style={{ ...smallInputStyle, width: 60, boxSizing: "border-box" }}
                  />
                  <button onClick={handleApplyManualAngle} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>각도 적용</button>
                </>
              )}
              {selectedPlacedIds.size >= 2 && (
                <button onClick={handleGroupSelected} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>🔗 그룹화</button>
              )}
              {placedItems.some((it) => selectedPlacedIds.has(it.id) && it.groupId) && (
                <button onClick={handleUngroupSelected} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>⛓️‍💥 그룹 해제</button>
              )}
              {selectedPlacedIds.size >= 2 && (
                <button onClick={handleAlignTopSelected} title="선택한 모형들을 가장 위에 있는 모형에 맞춰 위쪽 끝을 나란히 맞춰요" style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>⬆ 상단맞추기</button>
              )}
              {selectedPlacedIds.size >= 3 && (
                <button onClick={handleDistributeSelected} title="양 끝 모형은 그대로 두고, 그 사이 모형들의 간격을 똑같이 맞춰요(가로로 나란하면 가로로, 세로로 나란하면 세로로 자동 판단)" style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>↔ 간격 동일하게</button>
              )}
              <button onClick={handleRemoveSelected} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>🗑 삭제</button>
              <button onClick={() => setSelectedPlacedIds(new Set())} style={{ ...miniBtnStyle, whiteSpace: "nowrap" }}>선택 해제</button>
            </div>
          )}
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
                { key: "quartercircle", label: "코너(1/4원)" },
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
            {/* (2026-10-01) 선택 도구모음은 "대지 안에 있으니 불편하다"는 요청으로 배치판 밖, 줄자
                버튼 줄 왼쪽으로 옮겼다(위 도구모음 줄 참고). 예전엔 여기 배치판(canvasRef) 안쪽에
                position:absolute 오버레이로 떠서 모형을 가리고 있었다. */}
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
              const isQuarterCircle = it.shapeType === "quartercircle";
              const isChair = it.shapeType === "chair";
              const isMeetingChair = it.shapeType === "meetingchair";
              const isSofa = it.shapeType === "sofa";
              // "파티션 생기니까 도형이 여기 붙었다 저기 붙었다 정신을 못차린다" + "파티션 자유이동
              // 기능도 넣어줘" 신고(2026-10-01 3차)로, 파티션은 더 이상 책상에 "붙어서" 책상 바깥으로
              // 삐져나오게 그리는 장식이 아니라, 책상·의자와 똑같은 독립된 모형(shapeType:
              // "partition")이 됐다 — 그래서 더 이상 여기서 it.partitions 같은 별도 좌표 계산이
              // 필요 없고, 다른 사각형 모형처럼 바로 아래 isPartition 분기 하나로 끝난다(렌더 쪽은
              // 더 아래 색칠하는 부분 참고).
              const isPartition = it.shapeType === "partition";
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
              const isNonRectShape = isPoly || isCircle || isRoundEnd || isCurvedL || isQuarterCircle || isChair || isMeetingChair || isSofa;
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
                  // "조금만 더 지금보다 부드럽게 움직이면 좋겠다" 요청(2026-10-01)으로 브라우저 기본
                  // 드래그(HTML5 draggable/onDragStart) 대신, 손잡이들과 같은 mousedown 기반 방식
                  // (startMovePlaced)으로 바꿨다 — 자세한 경위는 바로 위 startMovePlaced 정의부 주석
                  // 참고. 줄자 모드에서는 startMovePlaced 안에서 바로 return해서 끌기 자체가 시작되지
                  // 않는다(예전 draggable={!rulerMode}와 같은 이유 — 정확히 점을 찍으려는 클릭이 모형을
                  // 옮기는 동작으로 오인되지 않게 막는다).
                  onMouseDown={startMovePlaced(it)}
                  onClick={(e) => {
                    e.stopPropagation();
                    // 방금 끌어서(mousedown → mousemove → mouseup) 모형을 옮긴 직후라면, 뒤이어 자동으로
                    // 쏘아지는 이 click 이벤트는 선택 상태를 건드리지 않고 그냥 지나간다(바로 위
                    // onMoveUp 주석 참고 — 안 그러면 여러 개를 같이 끌어 옮긴 직후 선택이 하나로 줄어든다).
                    if (suppressNextClickRef.current) {
                      suppressNextClickRef.current = false;
                      return;
                    }
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
                    ) : isQuarterCircle ? (
                      <svg width={baseWPx} height={baseHPx} viewBox={`0 0 ${it.widthCm} ${it.depthCm}`} style={shapeSvgStyle}>
                        <path
                          d={quarterCirclePathD(it.widthCm, it.depthCm)}
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
                    ) : isPartition ? (
                      // "파티션 넣기 기능... 파티션 실제 두께는 4.5cm야" 요청으로 시작했다가, (2026-10-01
                      // 3차) "파티션 생기니까 도형이 여기 붙었다 저기 붙었다 정신을 못차린다" + "파티션
                      // 자유이동 기능도 넣어줘" 신고로 책상에 붙는 장식이 아니라 다른 모형과 똑같이
                      // 독립적으로 끌고 다닐 수 있는 모형이 됐다. 생김새는 사각형과 같되, 색만 PW505
                      // 패브릭 사진에서 뽑은 C.partitionColor로 칠해서 "파티션"임을 한눈에 알아볼 수
                      // 있게 한다.
                      <div style={{ width: "100%", height: "100%", background: C.partitionColor, border: `1.4px solid ${C.partitionColor}`, borderRadius: 3, boxSizing: "border-box" }} />
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
                      볼 수 있다.
                      (2026-10-01 4차) "이상한 좌표번호 안생기게 글씨같은거 파티션 안에 없애줘" 신고 —
                      파티션은 두께 4.5cm짜리 아주 얇은 막대라 이 규격 글자가 들어갈 자리가 없고,
                      손잡이로 모서리를 끌어 크기를 바꾸면(가로·세로 모두 자유롭게 늘어나는 공용
                      기능이라 파티션의 "두께"까지 함께 바뀔 수 있음) 149.46778774067565×4.069646011787471
                      처럼 소수점이 긴 숫자가 나와, 얇은 막대 바깥으로 글자가 삐져나와 마치 알 수 없는
                      좌표가 떠 있는 것처럼 보였다. 파티션(isPartition)은 이 규격 글자 자체를 아예
                      보여주지 않도록 했다 — 다른 모형(책상·의자 등)은 기존 그대로 보인다(회귀 없음). */}
                  {!isPartition && (
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
                  )}
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
                      그 상태에서 크기를 바꾸려면 위 가로·세로 직접 입력칸을 쓰면 된다.
                      "도형 우측 하단에 까만점 없애줘" 신고(2026-10-01) — 이 손잡이가 선택 여부와
                      상관없이 모든 모형에 항상 떠 있어서 배치판이 지저분해 보였다. 자유 회전 손잡이
                      (동그라미, 바로 위 블록)와 똑같이 isSelected일 때만(선택했을 때만) 나타나도록
                      바꿨다 — 끌어서 크기 조절하는 기능 자체는 그대로, 보이는 시점만 바뀐다.) */}
                  {isSelected && rotation % 90 === 0 && (
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
