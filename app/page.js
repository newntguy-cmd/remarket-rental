"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
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
  purple: "#6B5CA5",
  purpleBg: "#EFEBFA",
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
  borderRadius: 4,
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

// ---------- "품목별 수량 데이터" 화면에서 숨긴 품목(이 화면에서만 안 보이게, 원본 렌탈 데이터는 그대로 둔다) ----------
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
    if (itemCell && !hasData && !specCell) {
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

function pdfMergeWords(rowItems, gapThreshold) {
  const words = [];
  let lastX = null;
  for (const it of rowItems) {
    const last = words[words.length - 1];
    if (last && lastX !== null && it.x - lastX < gapThreshold) {
      last.str += it.str;
      last.endX = it.x + (it.w || 0);
    } else {
      words.push({ str: it.str, x: it.x, endX: it.x + (it.w || 0) });
    }
    lastX = it.x;
  }
  return words.map((w) => ({ ...w, centerX: (w.x + w.endX) / 2 }));
}

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
      const words = pdfMergeWords(row.items, 45);
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

    const dataRows = headerRow ? rows.filter((r) => r.y < headerRow.y - 3) : rows;

    for (const row of dataRows) {
      const bucket = { item: [], spec: [], qty: [], price: [], amount: [], note: [] };
      for (const it of row.items) bucket[classify(it.x)].push(it.str);
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
      // "ㅡ 사무집기 ㅡ" 같은 구획 제목: 이 양식 특유의 필러 문자(ㅡ) 포함 여부로 판단
      const isDivider = itemStr.includes("ㅡ") || /^[-–—=_]{2,}.*[-–—=_]{2,}$/.test(itemStr.replace(/\s/g, ""));

      if (itemStr && !hasData && !specStr) {
        if (isDivider) {
          // 품목별 "현장/구역"은 배송지 주소와 별개라, 배송지 주소를 섞지 않고 구획 제목 텍스트만 그대로 쓴다.
          currentSite = itemStr;
          continue;
        }
        // 병합된 셀 라벨(예: "사무책상")은 세로로 두 데이터 행 사이 중앙에 찍혀 나오는 경우가 있어,
        // 그 라벨이 실제로는 "바로 위 데이터 행"의 품목명인데 그 행에는 직접 붙어있지 않고 지금 이 줄로 따로 찍힌 것이다.
        // 바로 위 행이 자기 줄에 직접 품목명을 갖고 있지 않았다면(=이전 품목명을 그냥 이어받은 것뿐이라면) 지금 읽은 진짜 이름으로 소급 정정한다.
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
  return <Dashboard profile={profile} onLogout={() => supabase.auth.signOut()} />;
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
        </form>
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

function Dashboard({ profile, onLogout }) {
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
      parsed.items = withComputedTons(parsed.items, tonOverrides);
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
      parsed.items = withComputedTons(parsed.items, tonOverrides);
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

  const menuItems = [
    ...(isStaff ? [{ key: "quickcalc", label: "품목별데이터/톤수/배송비" }] : []),
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
        }}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "13px 12px",
          marginBottom: 2,
          borderRadius: 5,
          background: active ? C.ink : "transparent",
          border: "none",
          color: active ? "#fff" : C.inkSoft,
          fontSize: 14,
          fontWeight: active ? 600 : 500,
          cursor: "pointer",
          fontFamily: sans,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "inline-block", width: 15, color: m.starColor || (active ? "#fff" : "#000") }}>
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
        .rm-menu-btn { transition: background 0.14s ease, color 0.14s ease; }
        .rm-menu-btn.is-inactive:hover { background: ${C.bg} !important; color: ${C.ink} !important; }
        .rm-logout-btn:hover { background: ${C.bg}; border-color: ${C.ink}; color: ${C.ink}; }
        .col-resize-bar { background: #C7CDD6; transition: background 0.12s ease, width 0.12s ease; }
        .col-resize-handle:hover .col-resize-bar { background: ${C.ink}; width: 4px; }
        /* 핸드폰(768px 이하)에서 입력칸 글씨가 16px보다 작으면 아이폰 사파리가 탭할 때마다 화면을
           자동으로 확대해버려서 계속 다시 축소해야 하는 게 제일 불편했던 부분이라, 여기서만 강제로 16px로 키운다.
           나머지 화면은 원래 디자인 그대로 유지된다. */
        @media (max-width: 768px) {
          input, select, textarea { font-size: 16px !important; }
        }
      `}</style>
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: isMobile ? "12px 14px" : "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
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
            <div style={{ fontFamily: serif, fontSize: isMobile ? 17.5 : 21.5, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
            <button className="rm-logout-btn" onClick={onLogout} style={ghostBtnStyle}>로그아웃</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1600, margin: "0 auto", padding: isMobile ? "14px 12px 50px" : "28px 24px 60px", display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 24, alignItems: "flex-start" }}>
        {!isMobile && (
          <aside
            style={{
              width: 232,
              flexShrink: 0,
              border: `1px solid ${C.line}`,
              borderRadius: 6,
              background: C.panel,
              padding: 6,
              position: "sticky",
              top: 20,
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
              style={{ width: "80vw", maxWidth: 300, height: "100%", background: C.panel, padding: 6, overflowY: "auto", boxShadow: "2px 0 14px rgba(0,0,0,0.18)" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 8px 8px 12px" }}>
                <div style={{ fontSize: 10.5, color: C.muted, letterSpacing: 1.2, fontWeight: 600 }}>MENU</div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="메뉴 닫기"
                  style={{ border: "none", background: "transparent", fontSize: 22, lineHeight: 1, color: C.muted, cursor: "pointer", padding: 4 }}
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
          <EquityTab key={sharesResetKey} rentals={rentals} shares={shares} onRefresh={fetchShares} />
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
        borderTop: `3px solid ${C.purple}`,
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
        borderTop: `3px solid ${C.purple}`,
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
        borderTop: `3px solid ${C.purple}`,
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
function withComputedTons(items, customOverrides) {
  return (items || []).map((it) => {
    if (isTonExcludedItem(it.item, it.spec)) return { ...it, ton: null, tonExcluded: true };
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
function removeTruckDetailFromResult(result, key) {
  if (!result) return result;
  const remaining = result.truckDetails.filter((d) => d.key !== key);
  const truckTotal = remaining.reduce((sum, d) => sum + d.cost, 0);
  return { ...result, truckDetails: remaining, truckTotal, total: result.base + truckTotal };
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

// 총 톤수 옆에 다는 "배송비" 버튼. 기본배송비(거래유형+배송지+톤수 기준 자동 계산)에
// 용차(추가 트럭)를 체크해서 더할 수 있는 계산기를 펼쳐서 보여준다.
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
    setResult({ base: base.amount, truckTotal, truckDetails, total: base.amount + truckTotal });
  }

  // 결과에 이미 추가된 용차 한 줄을 "x"로 바로 삭제한다. 체크박스도 같이 해제해서, 팝업을 다시 열었을 때도
  // 지워진 상태 그대로 유지되게 한다(다시 "계산하기"를 누를 필요 없이 합계가 바로 갱신됨).
  function removeTruckDetail(key) {
    setChecked((p) => ({ ...p, [key]: false }));
    setResult((prev) => removeTruckDetailFromResult(prev, key));
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

          <button type="button" onClick={calculate} style={{ ...miniBtnStylePrimary, width: "100%", marginBottom: result ? 10 : 0 }}>
            계산하기
          </button>

          {result && (
            <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 10, fontSize: 12.5 }}>
              <div>기본배송비: {fmtWon(result.base)}</div>
              {result.truckDetails.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span>용차 · {d.label}: {fmtWon(d.cost)}</span>
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
            참고용 계산이에요(VAT 별도). 사다리차·기사작업비 등 현장 조건에 따른 추가비용은 별도로 확인해주세요.
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
  const [address, setAddress] = useState("");
  const [tonEdits, setTonEdits] = useState({});
  const [savingIdx, setSavingIdx] = useState(null);

  // 견적서를 통째로 붙여넣으면 그 안의 "배송지: ..." 값을 자동으로 배송지 주소 칸에 채워준다(직접 입력한 값도
  // 그대로 수정 가능 — 이후 붙여넣는 텍스트가 바뀌면 새로 찾은 주소로 다시 갱신된다).
  const extractedAddress = useMemo(() => extractPastedSiteAddress(text), [text]);
  useEffect(() => {
    if (extractedAddress) setAddress(extractedAddress);
  }, [extractedAddress]);

  // 붙여넣은 텍스트에 거래처/담당자 정보가 있으면 품목별 데이터 출력물 상단에 그대로 보여준다
  // (업체별데이터의 "품목별 수량 통계" 출력물과 같은 형식).
  const customerInfo = useMemo(() => extractPastedCustomerInfo(text), [text]);

  const rawItems = useMemo(() => parsePastedItems(text), [text]);
  const items = useMemo(
    () => withComputedTons(rawItems, tonOverrides).map((it, idx) => (tonEdits[idx] !== undefined ? { ...it, ton: tonEdits[idx] === "" ? null : Number(tonEdits[idx]) } : it)),
    [rawItems, tonOverrides, tonEdits]
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
    const arr = [...rawGroupedStats];
    const dir = groupSortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (groupSortKey === "qty") return (a.qty - b.qty) * dir;
      const av = groupSortKey === "item" ? a.item : a.spec;
      const bv = groupSortKey === "item" ? b.item : b.spec;
      return (av || "").localeCompare(bv || "", "ko") * dir;
    });
    return arr;
  }, [rawGroupedStats, groupSortKey, groupSortDir]);
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
          <div style={{ border: `1px solid ${C.line}`, borderTop: `3px solid ${C.purple}`, background: C.panel, padding: 18, marginBottom: 14 }}>
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
                onClick={handleDeleteSelectedGroups}
                disabled={checkedGroupKeys.size === 0}
                style={{ ...ghostBtnStyle, opacity: checkedGroupKeys.size === 0 ? 0.5 : 1 }}
              >
                {`선택삭제${checkedGroupKeys.size > 0 ? ` (${checkedGroupKeys.size})` : ""}`}
              </button>
            </div>
            <div className="qtc-no-print" style={{ fontSize: 11.5, color: C.muted, marginTop: -6, marginBottom: 10 }}>
              * 여기서 "선택삭제"는 이 계산(품목별 데이터·톤수·배송비)에서만 제외하는 거예요. 붙여넣은 원본 텍스트는 그대로 있고, 다시 붙여넣으면 복원돼요.
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
                    <div>{r.item}</div>
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
                      <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.item}</td>
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
              <select style={{ ...inputStyle, fontSize: 12.5, padding: "5px 8px", width: "auto" }} value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
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

  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>품목 내역</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>
        총 {state.items.length}개 품목이 인식됐어요. 등록 전에 내용을 확인·수정해주세요. (칸 경계를 드래그하면 너비를 늘이고 줄일 수 있어요)
        톤수는 기준표에서 자동으로 채워져요. 노란 칸은 비슷한 품목조차 없어 직접 입력이 필요한 경우인데, 입력 후 "저장"을 누르면 다음부터는 이 품목도 자동으로 채워져요.
        DC·설치비·배송비 등 요금성 품목은 톤수 계산에서 자동으로 제외돼요. 소계·안내문구처럼 품목이 아닌 줄이 잘못 섞여 들어왔으면
        왼쪽 체크박스로 골라서 지워주세요.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={selected.size === 0}
          style={{ ...ghostBtnStyle, opacity: selected.size === 0 ? 0.4 : 1, cursor: selected.size === 0 ? "not-allowed" : "pointer" }}
        >
          선택 삭제{selected.size > 0 ? ` (${selected.size}건)` : ""}
        </button>
      </div>

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
          <button onClick={handleDeleteSelected} disabled={deletingSelected} style={{ ...miniBtnStyle, borderColor: C.brick, color: C.brick }}>
            {deletingSelected ? "삭제 중…" : "선택 삭제"}
          </button>
          <button onClick={() => setCheckedKeys(new Set())} style={miniBtnStyle}>선택 해제</button>
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: rentalListGrid,
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
          {["전표번호", "거래처", "현장명", "담당자", "배송일자", "품목", "렌탈기간", "렌탈개시일", "렌탈만료일", "금액", "상태"].map((label) =>
            sortAccessors[label] ? (
              <button
                key={label}
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
              <div key={label}>{label}</div>
            )
          )}
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
                gridTemplateColumns: rentalListGrid,
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
  const itemsWithTon = useMemo(() => withComputedTons(items, effectiveTonOverrides), [items, effectiveTonOverrides]);
  const tonApplicableItems = itemsWithTon.filter((it) => !it.tonExcluded);
  const tonKnownItems = tonApplicableItems.filter((it) => it.ton != null);
  const totalTon = tonKnownItems.reduce((s, it) => s + Number(it.ton), 0);
  const missingTonCount = tonApplicableItems.length - tonKnownItems.length;
  const [tonDetailOpen, setTonDetailOpen] = useState(false);
  const [tonEdits, setTonEdits] = useState({}); // idx -> 사용자가 직접 고친 톤수(저장 전 임시 편집값)
  const [savingTonIdx, setSavingTonIdx] = useState(null);

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
        </div>

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

function EquityTab({ rentals, shares, onRefresh }) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);

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
        <div style={{ display: "grid", gridTemplateColumns: equityListGrid, gap: 8, padding: "10px 14px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.line}`, minWidth: 850 }}>
          <div>
            <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleSelectAll} />
          </div>
          <div>전표번호</div>
          <div>거래처</div>
          <div>총금액(VAT포함)</div>
          <div>지분사</div>
          <div>지분사 몫</div>
          <div>세금계산서 · 입금</div>
        </div>

        {filtered.map((g) => {
          const rows = sharesByVoucher.get(g.voucherNo) || [];
          const totalPercent = rows.reduce((s, r) => s + (Number(r.share_percent) || 0), 0);
          const amountVat = Math.round(g.amount * 1.1);
          const partnerAmount = Math.round(amountVat * (totalPercent / 100));
          const issuedCount = rows.filter((r) => r.tax_invoice_issued).length;
          const paidCount = rows.filter((r) => r.paid).length;
          return (
            <div
              key={g.key}
              style={{ display: "grid", gridTemplateColumns: equityListGrid, gap: 8, padding: "12px 14px", fontSize: 13, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 850 }}
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
              <div style={{ fontSize: 12.5 }}>{fmtWon(amountVat)}</div>
              <div style={{ fontSize: 12.5 }}>
                {rows.length === 0 ? <span style={{ color: C.muted }}>{g.head.customer || "거래처"} 100%</span> : rows.map((r) => `${r.partner_name} ${r.share_percent}%`).join(", ")}
              </div>
              <div style={{ fontSize: 12.5 }}>{rows.length === 0 ? "-" : fmtWon(partnerAmount)}</div>
              <div style={{ fontSize: 12.5 }}>
                {rows.length === 0 ? (
                  <span style={{ color: C.muted }}>-</span>
                ) : (
                  <>
                    <span style={{ color: issuedCount === rows.length ? C.green : C.brick }}>{issuedCount}/{rows.length}</span>
                    {" · "}
                    <span style={{ color: paidCount === rows.length ? C.green : C.brick }}>{paidCount}/{rows.length}</span>
                  </>
                )}
              </div>
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
  const addRow = () =>
    setRows([...rows, { id: null, partnerName: rows.length === 0 ? "주관사" : "", sharePercent: "", note: "", taxInvoiceIssued: false, paid: false }]);
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
  const [viewTab, setViewTab] = useState("sales"); // "sales" | "items" — 매출 데이터 / 품목별 수량 데이터 탭 전환
  const [selectedItemVoucherKey, setSelectedItemVoucherKey] = useState(null); // 품목별 수량 데이터에서 선택한 전표(선택 전엔 전표 목록만 보여줌)

  function runSearch() {
    addRecentValue("remarket_recent_customer", customerInput);
    setCustomerQuery(customerInput);
    setSiteQuery(siteInput);
    setItemQuery(itemInput);
    setFromDate(fromDateInput);
    setToDate(toDateInput);
    setHasSearched(true);
    setSelectedItemVoucherKey(null);
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
    setSelectedItemVoucherKey(null);
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

  // 품목명으로 좁혀 찾을 때("A현장에 냉난방기 몇 개 나갔는지" 같은 질문)를 위해, 검색된 결과 전체(전표 여러 장에
  // 걸쳐 있어도 상관없이)를 품목+규격별로 합산한 수량 표. 업체별데이터 화면 전체 기준이라 "품목별 수량 데이터"
  // 탭(전표 한 장만 보는 화면)과는 별개다.
  const itemTotals = useMemo(() => {
    const map = new Map();
    for (const r of filteredRows) {
      const itemName = (r.item || "").trim() || "(품목명 없음)";
      const specName = (r.spec || "").trim();
      const key = `${itemName}〓${specName}`;
      if (!map.has(key)) map.set(key, { key, item: itemName, spec: specName, qty: 0, count: 0 });
      const e = map.get(key);
      e.qty += Number(r.qty) || 0;
      e.count += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [filteredRows]);
  const itemTotalsGrandQty = itemTotals.reduce((s, r) => s + r.qty, 0);
  const [itemTotalsColWidths, startItemTotalsResize] = useResizableColumns([260, 260, 100, 90]);
  const itemTotalsGridTemplate = itemTotalsColWidths.map((w) => `${w}px`).join(" ");

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

  // 품목별 수량 데이터는 전표 하나를 선택해야 나온다(여러 전표를 합치지 않음).
  const selectedItemGroup = selectedItemVoucherKey ? groups.find((g) => g.key === selectedItemVoucherKey) : null;

  // 품목/규격/총수량 머리글을 눌러 정렬 기준·방향을 바꿀 수 있게 한다(기본은 총수량 많은순).
  const [itemSortKey, setItemSortKey] = useState("qty"); // "item" | "spec" | "qty"
  const [itemSortDir, setItemSortDir] = useState("desc"); // "asc" | "desc"
  function toggleItemSort(key) {
    if (itemSortKey === key) {
      setItemSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setItemSortKey(key);
      setItemSortDir("asc");
    }
  }

  // 선택한 전표 "안에서" 같은 품목명+규격끼리 수량/건수/금액을 합산한다(전표 하나 기준 집계).
  // ids는 원본 렌탈 행들의 id(참고용으로만 모아둠 — 이 화면의 선택삭제는 더 이상 이 id로 원본 데이터를 지우지 않는다).
  const rawItemStats = useMemo(() => {
    const rows = selectedItemGroup ? selectedItemGroup.rows : [];
    const map = new Map();
    for (const r of rows) {
      const itemName = (r.item || "").trim() || "(품목명 없음)";
      const specName = (r.spec || "").trim();
      const key = `${itemName}〓${specName}`;
      if (!map.has(key)) map.set(key, { key, item: itemName, spec: specName, qty: 0, count: 0, amount: 0, ids: [] });
      const e = map.get(key);
      e.qty += Number(r.qty) || 0;
      e.count += 1;
      e.amount += Number(r.amount) || 0;
      e.ids.push(r.id);
    }
    return Array.from(map.values());
  }, [selectedItemGroup]);

  // 이 화면(품목별 수량 데이터)에서만 숨긴 품목 — 전표를 바꾸면 그 전표에 저장된 숨김 목록을 새로 불러온다.
  // 여기서 숨기는 건 화면 표시만 걸러내는 것이고, rentals 원본 데이터·렌탈내역의 총 렌탈금액은 절대 건드리지 않는다.
  const [hiddenStatKeys, setHiddenStatKeysState] = useState(() => new Set());
  useEffect(() => {
    setHiddenStatKeysState(new Set(getHiddenItemStatKeys(selectedItemVoucherKey)));
  }, [selectedItemVoucherKey]);

  const itemStats = useMemo(() => {
    const arr = rawItemStats.filter((r) => !hiddenStatKeys.has(r.key));
    const dir = itemSortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (itemSortKey === "qty") return (a.qty - b.qty) * dir;
      const av = itemSortKey === "item" ? a.item : a.spec;
      const bv = itemSortKey === "item" ? b.item : b.spec;
      return (av || "").localeCompare(bv || "", "ko") * dir;
    });
    return arr;
  }, [rawItemStats, hiddenStatKeys, itemSortKey, itemSortDir]);
  const itemStatsTotalQty = itemStats.reduce((s, r) => s + r.qty, 0);
  const itemStatsTotalAmount = itemStats.reduce((s, r) => s + r.amount, 0);
  const hiddenStatCount = rawItemStats.filter((r) => hiddenStatKeys.has(r.key)).length;

  // 품목별 수량 통계 표의 체크박스 선택삭제 상태(전표를 바꾸면 초기화)
  const [checkedStatKeys, setCheckedStatKeys] = useState(new Set());
  useEffect(() => {
    setCheckedStatKeys(new Set());
  }, [selectedItemVoucherKey]);

  function toggleStatChecked(key) {
    setCheckedStatKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleStatCheckedAll() {
    setCheckedStatKeys((prev) => (prev.size === itemStats.length ? new Set() : new Set(itemStats.map((r) => r.key))));
  }

  // 선택한 품목을 "이 화면에서만" 숨긴다. rentals 테이블은 전혀 건드리지 않으므로 렌탈내역·총 렌탈금액에는 영향이 없다.
  function handleDeleteSelectedStats() {
    const chosen = itemStats.filter((r) => checkedStatKeys.has(r.key));
    if (chosen.length === 0) return;
    if (!confirm(`선택한 품목 ${chosen.length}종을 이 "품목별 수량 데이터" 화면에서만 숨길까요?\n(렌탈내역의 원본 데이터와 총 렌탈금액에는 전혀 영향을 주지 않아요)`)) return;
    const next = new Set(hiddenStatKeys);
    for (const r of chosen) next.add(r.key);
    setHiddenStatKeysState(next);
    setHiddenItemStatKeys(selectedItemVoucherKey, Array.from(next));
    setCheckedStatKeys(new Set());
  }

  // 이 전표에서 숨긴 품목을 전부 다시 보이게 한다.
  function handleRestoreHiddenStats() {
    setHiddenStatKeysState(new Set());
    setHiddenItemStatKeys(selectedItemVoucherKey, []);
  }

  // 인쇄/PDF 저장 시 브라우저 상단에 뜨는 문서 제목("리마켓 영업관리 시스템")을 잠깐 "품목별 수량통계"로 바꿔서,
  // 인쇄 머리글과 "PDF로 저장" 시 기본 파일명이 모두 "품목별 수량통계"가 되게 한다. 인쇄가 끝나면 원래 제목으로 되돌린다.
  function handlePrintItemStats() {
    const prevTitle = document.title;
    document.title = "품목별 수량통계";
    const restoreTitle = () => {
      document.title = prevTitle;
    };
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.print();
    setTimeout(restoreTitle, 2000); // afterprint가 못 붙는 브라우저를 위한 안전장치
  }

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #itemstats-print-area, #itemstats-print-area * { visibility: visible; }
          #itemstats-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 24px; }
          .itemstats-no-print { display: none !important; }
        }
      `}</style>
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
          <div className="itemstats-no-print" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => setViewTab("sales")}
              style={{
                ...miniBtnStyle,
                background: viewTab === "sales" ? C.ink : "transparent",
                color: viewTab === "sales" ? "#fff" : C.inkSoft,
                borderColor: viewTab === "sales" ? C.ink : C.line,
              }}
            >
              매출 데이터
            </button>
            <button
              onClick={() => setViewTab("items")}
              style={{
                ...miniBtnStyle,
                background: viewTab === "items" ? C.ink : "transparent",
                color: viewTab === "items" ? "#fff" : C.inkSoft,
                borderColor: viewTab === "items" ? C.ink : C.line,
              }}
            >
              품목별 수량 데이터
            </button>
          </div>

          {viewTab === "sales" && (
            <>
              <div style={{ display: "flex", border: `1px solid ${C.line}`, background: C.panel, marginBottom: 16 }}>
                <StatCell label="건수" value={`${groups.length}건`} />
                <StatCell label="공급가액 합계" value={fmtWon(totalSupply)} />
                <StatCell label="부가세 합계" value={fmtWon(totalVat)} />
                <StatCell label="합계(VAT포함)" value={fmtWon(totalWithVat)} color={C.green} last={!itemQuery.trim()} />
                {itemQuery.trim() && (
                  <StatCell label={`"${itemQuery.trim()}" 총 수량`} value={`${itemTotalsGrandQty.toLocaleString("ko-KR")}개`} color={C.amber} last />
                )}
              </div>

              {itemTotals.length > 0 && (
                <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 16, marginBottom: 16, overflowX: "auto" }}>
                  <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
                    품목별 합계{itemQuery.trim() ? ` ("${itemQuery.trim()}" 검색 결과)` : ""} — 칸 경계를 드래그하면 너비를 조절할 수 있어요.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: itemTotalsGridTemplate, gap: 8, padding: "6px 4px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.line}`, minWidth: "max-content" }}>
                    {["품목", "규격", "수량", "건수"].map((label, i) => (
                      <div key={label} style={{ position: "relative", textAlign: i >= 2 ? "right" : "left" }}>
                        {label}
                        <ColResizeHandle onMouseDown={startItemTotalsResize(i)} />
                      </div>
                    ))}
                  </div>
                  {itemTotals.map((r) => (
                    <div
                      key={r.key}
                      style={{ display: "grid", gridTemplateColumns: itemTotalsGridTemplate, gap: 8, padding: "6px 4px", fontSize: 13, borderBottom: `1px solid ${C.lineSoft}`, minWidth: "max-content" }}
                    >
                      <div>{r.item}</div>
                      <div>{r.spec || "-"}</div>
                      <div style={{ textAlign: "right", fontWeight: 600 }}>{r.qty.toLocaleString("ko-KR")}</div>
                      <div style={{ textAlign: "right", color: C.muted }}>{r.count}건</div>
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: itemTotalsGridTemplate, gap: 8, padding: "8px 4px", fontSize: 13, fontWeight: 700, background: C.bg, minWidth: "max-content" }}>
                    <div style={{ gridColumn: "span 2", textAlign: "right" }}>합계</div>
                    <div style={{ textAlign: "right" }}>{itemTotalsGrandQty.toLocaleString("ko-KR")}</div>
                    <div />
                  </div>
                </div>
              )}

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

          {viewTab === "items" && !selectedItemGroup && (
            <>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
                전표를 선택하면 그 전표의 품목별 수량 출력물을 볼 수 있어요.
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
                      <div>
                        <button
                          onClick={() => setSelectedItemVoucherKey(g.key)}
                          style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
                        >
                          {g.voucherNo || "(번호없음)"}
                        </button>
                      </div>
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

                {groups.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>해당 기간에 이 업체의 전표가 없어요.</div>}
              </div>
            </>
          )}

          {viewTab === "items" && selectedItemGroup && (
            <>
              <div className="itemstats-no-print" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button onClick={() => setSelectedItemVoucherKey(null)} style={ghostBtnStyle}>← 전표 목록으로</button>
                <button onClick={handlePrintItemStats} style={primaryBtnStyle2}>인쇄 / PDF로 저장</button>
                <button
                  onClick={handleDeleteSelectedStats}
                  disabled={checkedStatKeys.size === 0}
                  style={{ ...ghostBtnStyle, opacity: checkedStatKeys.size === 0 ? 0.5 : 1 }}
                >
                  {`선택삭제${checkedStatKeys.size > 0 ? ` (${checkedStatKeys.size})` : ""}`}
                </button>
                {hiddenStatCount > 0 && (
                  <button onClick={handleRestoreHiddenStats} style={ghostBtnStyle}>
                    숨긴 품목 복원 ({hiddenStatCount})
                  </button>
                )}
              </div>
              <div className="itemstats-no-print" style={{ fontSize: 11.5, color: C.muted, marginTop: -6, marginBottom: 12 }}>
                * 여기서 "선택삭제"는 이 화면에서만 안 보이게 숨기는 거예요. 렌탈내역의 원본 데이터와 총 렌탈금액에는 영향이 없어요.
              </div>

              <div className="itemstats-no-print" style={{ display: "flex", border: `1px solid ${C.line}`, background: C.panel, marginBottom: 16 }}>
                <StatCell label="품목 종류" value={`${itemStats.length}종`} />
                <StatCell label="총 수량" value={`${itemStatsTotalQty.toLocaleString("ko-KR")}개`} last />
              </div>

              <div id="itemstats-print-area" style={{ border: `1px solid ${C.line}`, background: "#fff", padding: 24 }}>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontFamily: serif, fontSize: 20 }}>품목별 수량 통계</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 16 }}>
                  <div>
                    <div>
                      거래처: {selectedItemGroup.head.customer || "-"}
                      {selectedItemGroup.head.site_name ? ` · 현장명: ${selectedItemGroup.head.site_name}` : ""}
                    </div>
                    <div>담당자: {selectedItemGroup.head.manager || "-"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>전표번호: {selectedItemGroup.voucherNo || "(번호없음)"}</div>
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th className="itemstats-no-print" style={{ border: `1px solid ${C.line}`, padding: "8px 10px", background: C.bg, width: 32 }}>
                        <input
                          type="checkbox"
                          checked={itemStats.length > 0 && checkedStatKeys.size === itemStats.length}
                          onChange={toggleStatCheckedAll}
                        />
                      </th>
                      {[
                        { label: "품목", key: "item" },
                        { label: "규격", key: "spec" },
                        { label: "총수량", key: "qty" },
                      ].map((h) => (
                        <th
                          key={h.key}
                          onClick={() => toggleItemSort(h.key)}
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
                          {itemSortKey === h.key ? (itemSortDir === "asc" ? " ▲" : " ▼") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemStats.map((r) => (
                      <tr key={r.key}>
                        <td className="itemstats-no-print" style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>
                          <input type="checkbox" checked={checkedStatKeys.has(r.key)} onChange={() => toggleStatChecked(r.key)} />
                        </td>
                        <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.item}</td>
                        <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.spec || "-"}</td>
                        <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right" }}>{r.qty.toLocaleString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="itemstats-no-print" style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}></td>
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
                  <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>이 전표에는 품목 데이터가 없어요.</div>
                )}
              </div>
            </>
          )}
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

  // 렌탈전표만(구매 제외) 모으고, 이 화면에서 "제외" 처리된 건은 뺀다. transaction_type이 비어있는 옛 데이터는 렌탈로 취급한다(다른 화면들과 동일한 규칙).
  const rentalRows = useMemo(
    () => (rentals || []).filter((r) => (r.transaction_type || "rental") !== "purchase" && !hiddenIds.has(r.id)),
    [rentals, hiddenIds]
  );
  const hiddenRentalRows = useMemo(() => (rentals || []).filter((r) => hiddenIds.has(r.id)), [rentals, hiddenIds]);

  const customerSuggestions = useMemo(() => dedupeSorted(rentalRows.map((r) => r.customer)), [rentalRows]);

  // 화면에는 전표 단위로 묶어서 한 줄씩만 보여준다(렌탈내역/구매내역과 같은 방식).
  const allGroups = useMemo(() => groupRentalsByVoucher(rentalRows), [rentalRows]);

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

  const filteredGroupsBase = useMemo(() => {
    const cq = customerQuery.trim().toLowerCase();
    const vq = voucherQuery.trim().toLowerCase();
    return allGroups.filter((g) => {
      const d = (g.head.out_date || "").slice(0, 10);
      if (fromDate && (!d || d < fromDate)) return false;
      if (toDate && (!d || d > toDate)) return false;
      if (cq && !(g.head.customer || "").toLowerCase().includes(cq)) return false;
      if (vq && !(g.voucherNo || "").toLowerCase().includes(vq)) return false;
      return true;
    });
  }, [allGroups, customerQuery, voucherQuery, fromDate, toDate]);

  const RENTAL_LIST_STATUS_RANK = { overdue: 0, soon: 1, normal: 2, collected: 3, purchase: 4 };
  const sortAccessors = {
    전표번호: (g) => g.voucherNo || "",
    거래처: (g) => g.head.customer || "",
    현장명: (g) => g.head.site_name || "",
    담당자: (g) => g.head.manager || "",
    배송일자: (g) => g.head.out_date || "",
    렌탈종료일자: (g) => g.head.due_date || "",
    수량: (g) => g.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0),
    금액: (g) => g.amount,
    상태: (g) => {
      const s = getStatus({ transaction_type: g.head.transaction_type, collected: g.rows.every((r) => r.collected), due_date: g.head.due_date });
      return RENTAL_LIST_STATUS_RANK[s] ?? 9;
    },
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "8px 12px", background: C.amberBg, fontSize: 12.5 }}>
          <div>{checkedIds.size}건 선택됨</div>
          <button onClick={handleDeleteSelected} disabled={deletingSelected} style={{ ...miniBtnStyle, borderColor: C.brick, color: C.brick }}>
            {deletingSelected ? "제외 처리 중…" : "선택 제외"}
          </button>
          <button onClick={() => setCheckedIds(new Set())} style={miniBtnStyle}>선택 해제</button>
          <div style={{ fontSize: 11.5, color: C.muted }}>렌탈내역 원본은 지워지지 않아요 — 이 화면에서만 안 보이게 됩니다</div>
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
          const status = getStatus({ transaction_type: g.head.transaction_type, collected: g.rows.every((r) => r.collected), due_date: g.head.due_date });
          const meta = STATUS_META[status];
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
              <button
                onClick={() => setSelectedKey(g.key)}
                style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
              >
                {g.voucherNo || "(번호없음)"}
              </button>
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

  // 이름이 서로 다르게 적혀서 표에 따로 나오는 품목들을 자동으로 찾아낸다. 두 가지 규칙만 본다:
  // (1) 품목·규격·색상이 공백/대소문자 차이만 있고 사실상 완전히 같은 경우.
  // (2) 한 품목의 규격란 앞부분에 다른 품목의 "품목명"이 그대로 적혀 있고(예: "탑책상, W1600*D800"),
  //     그 나머지 부분이 그 다른 품목의 규격과 정확히 같고 색상도 같은 경우 — 등록할 때 품목명을 규격에
  //     같이 적어버린 전형적인 오기입 패턴. 둘 다 아주 구체적인 조건이라 서로 다른 품목이 우연히 걸릴 위험은
  //     낮지만, 실제로 수량 기록을 지우는 작업이라 자동 실행은 하지 않고 화면에 제안만 띄워서 한 번 확인받는다.
  const mergeSuggestions = useMemo(() => {
    const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
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
        if (!bItemNorm || !aSpecNorm.startsWith(bItemNorm)) continue;
        const rest = aSpecNorm.slice(bItemNorm.length).replace(/^[,·/]\s*/, "").trim();
        if (rest && rest === norm(b.spec) && norm(a.color) === norm(b.color)) {
          seenPairs.add(pairKey);
          list.push({ keepId: b.id, otherId: a.id, reason: `"${a.item}"의 규격에 "${b.item}"이 그대로 적혀 있어요` });
        }
      }
    }
    return list;
  }, [items]);
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

  useEffect(() => {
    setPage(1); // 상태 탭/검색어가 바뀌면 항상 1페이지로 되돌린다.
  }, [statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / AS_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * AS_PAGE_SIZE, pageSafe * AS_PAGE_SIZE);

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
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            style={{
              ...miniBtnStyle,
              background: statusFilter === t.key ? C.ink : "transparent",
              color: statusFilter === t.key ? "#fff" : C.inkSoft,
              borderColor: statusFilter === t.key ? C.ink : C.line,
            }}
          >
            {t.label} ({counts[t.key] ?? 0})
          </button>
        ))}
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
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 980, width: "100%" }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
              <th style={asTh}>
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllPage} />
              </th>
              <th style={asTh}>번호</th>
              <th style={asTh}>고객명</th>
              <th style={asTh}>연락처</th>
              <th style={asTh}>방문예정일</th>
              <th style={asTh}>주소</th>
              <th style={{ ...asTh, minWidth: 220 }}>A/S 내용</th>
              <th style={asTh}>작성자</th>
              <th style={asTh}>작성일</th>
              <th style={asTh}>진행상태</th>
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

  useEffect(() => {
    setPage(1);
  }, [statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / COLLECTION_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * COLLECTION_PAGE_SIZE, pageSafe * COLLECTION_PAGE_SIZE);

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
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            style={{
              ...miniBtnStyle,
              background: statusFilter === t.key ? C.ink : "transparent",
              color: statusFilter === t.key ? "#fff" : C.inkSoft,
              borderColor: statusFilter === t.key ? C.ink : C.line,
            }}
          >
            {t.label} ({counts[t.key] ?? 0})
          </button>
        ))}
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
        <button onClick={openNew} style={primaryBtnStyle2}>+ 신규 등록</button>
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
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 980, width: "100%" }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
              <th style={asTh}>
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllPage} />
              </th>
              <th style={asTh}>번호</th>
              <th style={asTh}>고객명</th>
              <th style={asTh}>담당자</th>
              <th style={asTh}>회수일</th>
              <th style={asTh}>주소</th>
              <th style={{ ...asTh, minWidth: 220 }}>회수품목</th>
              <th style={asTh}>작성자</th>
              <th style={asTh}>작성일</th>
              <th style={asTh}>진행상태</th>
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
                  등록된 회수 내역이 없어요. "+ 신규 등록"으로 시작해보세요.
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
