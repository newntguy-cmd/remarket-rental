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
  return Array.from(map.entries()).map(([key, rows]) => {
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

// 최근 6개월 월별 매출 (렌탈+구매 합산, out_date 기준)
function computeMonthlyRevenue(rentals) {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const byMonth = Object.fromEntries(months.map((m) => [m, 0]));
  for (const r of rentals) {
    if (!r.out_date) continue;
    const key = r.out_date.slice(0, 7);
    if (key in byMonth) byMonth[key] += Number(r.amount) || 0;
  }
  return months.map((m) => ({ month: m.slice(5) + "월", amount: byMonth[m] }));
}

// 반납예정 타임라인: 회수 안 된 렌탈 건을 임박도 구간으로 분류
function computeReturnBuckets(rentals) {
  const buckets = [
    { key: "overdue", label: "연체", color: C.brick, count: 0 },
    { key: "d30", label: "~30일", color: C.amber, count: 0 },
    { key: "d60", label: "31~60일", color: "#6B8CAE", count: 0 },
    { key: "d90", label: "61~90일", color: "#8B93A6", count: 0 },
    { key: "later", label: "90일+", color: C.muted, count: 0 },
  ];
  const map = Object.fromEntries(buckets.map((b) => [b.key, b]));
  for (const r of rentals) {
    if (r.transaction_type !== "rental" || r.collected || !r.due_date) continue;
    const diff = daysBetween(todayISO(), r.due_date);
    if (diff < 0) map.overdue.count++;
    else if (diff <= 30) map.d30.count++;
    else if (diff <= 60) map.d60.count++;
    else if (diff <= 90) map.d90.count++;
    else map.later.count++;
  }
  return buckets;
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
  background: C.bg,
  color: C.ink,
  outline: "none",
  fontFamily: sans,
};
const smallInputStyle = { ...inputStyle, padding: "6px 8px", fontSize: 13 };
const primaryBtnStyle = {
  width: "100%",
  padding: "11px 0",
  background: C.ink,
  color: "#fff",
  border: "none",
  fontSize: 14.5,
  cursor: "pointer",
  fontFamily: sans,
};
const primaryBtnStyle2 = { ...primaryBtnStyle, width: "auto", padding: "9px 16px", fontSize: 13.5 };
const ghostBtnStyle = {
  padding: "8px 14px",
  background: "transparent",
  border: `1px solid ${C.line}`,
  color: C.inkSoft,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: sans,
};
const miniBtnStyle = { ...ghostBtnStyle, padding: "5px 10px", fontSize: 12 };
const miniBtnStylePrimary = { ...miniBtnStyle, background: C.green, border: `1px solid ${C.green}`, color: "#fff" };

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

function ColResizeHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ position: "absolute", top: 0, bottom: 0, right: -6, width: 10, cursor: "col-resize", zIndex: 2 }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ---------- 엑셀 견적서 파싱 ----------
// 배송비·DC(할인)는 품목이 아니라 별도 계산 항목처럼 보이지만, 실제 청구 금액(계/합계)에
// 포함되는 항목이라 건너뛰지 않고 그대로 품목 내역에 포함시킨다 (등록 전 미리보기에서 확인·수정 가능).
const SKIP_NAMES = [];
const STOP_NAMES = ["계", "합계(vat 포함)", "합계", "납품확인", "[조건 / condition]", "[조건/condition]"];

function cellText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
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

// "렌탈기간" 칸 텍스트에서 "YYYY.MM.DD~YYYY.MM.DD"처럼 일 단위까지 적힌 시작~종료 날짜 범위를 찾는다.
// (예: "렌탈기간 : 15개월(2026.09.20~2027.12.19)") 구분자는 "."/"-"/"/"/"년,월,일", 범위 기호는 "~"/"∼"/"-" 모두 허용.
function parseRentalPeriodDateRange(cell) {
  const DATE = "(\\d{4})[.\\-/년]\\s*(\\d{1,2})[.\\-/월]\\s*(\\d{1,2})\\s*일?";
  const re = new RegExp(DATE + "\\s*[~∼\\-]\\s*" + DATE);
  const m = cell.match(re);
  if (!m) return null;
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
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });

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

  let siteName = ""; // "수신" 칸의 "거래처 - 현장명" 표기에서 나오는 현장명(있을 때만)

  const headerScanRows = rows.slice(0, 15);
  for (const row of headerScanRows) {
    // 셀을 한 줄로 합치면 옆 칸(같은 행의 다른 라벨) 텍스트가 붙어버릴 수 있어
    // 라벨:값 형태의 정보는 셀 단위로 각각 따로 검사한다.
    const cells = (row || []).map(cellText).filter((t) => t.trim());
    for (const cell of cells) {
      let m = cell.match(/수\s*신\s*[:：]\s*([^\n]+)/);
      if (m) {
        const raw = m[1].trim();
        if (raw.includes(" - ")) {
          const [c, s] = raw.split(" - ");
          customer = c.trim();
          siteName = s.trim();
        } else {
          customer = raw;
        }
      }

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
      if (m && cell.includes("렌탈")) {
        transactionType = "rental";
        periodMonths = Number(m[1]);
        periodDays = Number(m[1]) * 30;
      }
      // "렌탈기간" 라벨과 실제 날짜가 같은 칸에 있든("렌탈기간: 2026.09.20~2027.12.19"),
      // 라벨은 옆 칸에 따로 있고 값 칸에 "렌탈 15개월 기준 (2026-09-15~2027-12-14)"처럼 적혀 있든,
      // "렌탈"이 들어간 칸에서 일 단위 시작~종료 날짜를 찾으면 그걸 렌탈개시일의 최우선 근거로 쓴다.
      if (!rentalPeriodRange && cell.includes("렌탈")) {
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
  const cols = detected ? detected.cols : { item: 2, spec: 3, qty: 4, price: 5, amount: 6, note: 7 };
  const specCol = cols.spec ?? cols.item + 1;
  const noteCol = cols.note ?? cols.amount + 1;

  const items = [];
  let currentItem = "";
  // 품목별 "현장/구역"은 배송지 주소와는 별개의 정보라, 엑셀 표 안의 소제목 줄(예: "— 사무집기 —")
  // 텍스트만 그대로 쓴다. 배송지 주소를 섞어 넣지 않는다(주소는 상단 "배송지 주소"에 별도로 있음).
  let currentSite = "";

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
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

    const hasData = qtyRaw != null || priceRaw != null || amountRaw != null;
    if (itemCell && !hasData && !specCell) {
      currentSite = itemCell;
      continue;
    }

    if (itemCell) currentItem = itemCell;
    if (!currentItem) continue;

    // 단가/금액 칸이 "-" 같은 텍스트(회계서식의 0원 표기 등)인 경우 Number()가 NaN이 되므로 그런 값은 무시한다.
    const toNum = (v) => {
      if (v == null) return null;
      const n = Number(v);
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
    voucherNo: "",
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
    warehouse: transactionType === "rental" ? "00008" : "",
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

  // 1) 첫 페이지 위쪽 정보 영역에서 라벨:값 스캔 (엑셀 버전과 동일한 정규식을 그대로 사용)
  const firstPageRows = pdfGroupRows(allPagesItems[0] || []);
  for (const row of firstPageRows) {
    const segs = pdfSplitRowSegments(row.items);
    for (const cell of segs) {
      let m = cell.match(/수\s*신\s*[:：]\s*([^\n]+)/);
      if (m) {
        const raw = m[1].trim();
        if (raw.includes(" - ")) {
          const [c, s] = raw.split(" - ");
          customer = c.trim();
          siteName = s.trim();
        } else {
          customer = raw;
        }
      }

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
      if (m && cell.includes("렌탈")) {
        transactionType = "rental";
        periodMonths = Number(m[1]);
        periodDays = Number(m[1]) * 30;
      }
      // "렌탈기간" 라벨과 실제 날짜가 같은 칸에 있든("렌탈기간: 2026.09.20~2027.12.19"),
      // 라벨은 옆 칸에 따로 있고 값 칸에 "렌탈 15개월 기준 (2026-09-15~2027-12-14)"처럼 적혀 있든,
      // "렌탈"이 들어간 칸에서 일 단위 시작~종료 날짜를 찾으면 그걸 렌탈개시일의 최우선 근거로 쓴다.
      if (!rentalPeriodRange && cell.includes("렌탈")) {
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
    voucherNo: "",
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
    warehouse: transactionType === "rental" ? "00008" : "",
    dealType: "소매매출",
    currency: "내자",
    project: "",
    headerNote: "",
    taxInvoice: "",
    items,
  };
}

// ---------- 메인 ----------
export default function Home() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

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
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(sess) {
    setSession(sess);
    const { data } = await supabase.from("profiles").select("*").eq("id", sess.user.id).single();
    setProfile(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, color: C.inkSoft }}>
        불러오는 중…
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
    const { error } = await supabase.auth.signInWithPassword({ email: resolveLoginEmail(idOrEmail), password: pw });
    setBusy(false);
    if (error) setErr("아이디 또는 비밀번호가 올바르지 않습니다.");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 380, maxWidth: "100%" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: serif, fontSize: 28, color: C.ink }}>리마켓 렌탈장부</div>
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

function rowGrid(isAdmin) {
  return {
    display: "grid",
    gridTemplateColumns: isAdmin
      ? "24px 100px 120px 1fr 55px 100px 110px 190px"
      : "120px 1fr 55px 100px 110px",
    gap: 10,
  };
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
  const [rentals, setRentals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [shares, setShares] = useState([]);
  const [tonOverrides, setTonOverrides] = useState([]); // 기준표에 없어 직원이 직접 입력해 저장해둔 톤수(품목/규격별), 다음 견적서부터 자동으로 채워짐
  const [activeTab, setActiveTab] = useState("quote"); // 지금은 "quote" 하나뿐. 메뉴는 하나씩 다시 추가할 예정
  // 지분관리 화면은 목록/상세 중 어디에 있었는지를 자체적으로 기억하고 있어서, 메뉴의 "지분관리"를
  // 다시 눌러도(이미 그 탭이어도) 항상 목록 화면으로 되돌아가도록 이 값을 바꿔서 강제로 새로 마운트시킨다.
  const [sharesResetKey, setSharesResetKey] = useState(0);
  // 렌탈내역도 마찬가지로, 메뉴의 "렌탈내역"을 다시 눌렀을 때(이미 그 탭이어도) 상세화면이 아니라
  // 항상 목록 화면으로 되돌아가도록 이 값을 바꿔서 강제로 새로 마운트시킨다.
  const [rentalsResetKey, setRentalsResetKey] = useState(0);
  // 판매현황도 전표번호를 눌러 상세화면으로 들어갈 수 있게 됐으니, 메뉴를 다시 눌렀을 때 항상 검색화면으로 되돌아가게 한다.
  const [salesResetKey, setSalesResetKey] = useState(0);
  // 출고/회수 내역서도 대장 상세화면에 들어갈 수 있으니, 메뉴를 다시 눌렀을 때 항상 대장 목록으로 되돌아가게 한다.
  const [ledgerResetKey, setLedgerResetKey] = useState(0);
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
      // PDF든 엑셀이든 전표번호는 자동으로 채우지 않고 항상 비워둬서 직접 입력하게 한다.
      parsed.voucherNo = "";
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

  async function confirmImport() {
    if (!importState) return;
    if (!(importState.voucherNo || "").trim()) {
      alert("전표번호를 입력해주세요.");
      return;
    }
    setImporting(true);

    // 거래처 담당자/연락처/메일이 파악됐으면 customers 테이블에도 반영 (기존 정보는 덮어쓰지 않고 채워진 값만 upsert)
    if (importState.customer && (importState.refContact || importState.phone || importState.email)) {
      const patch = { name: importState.customer };
      if (importState.refContact) patch.contact_name = importState.refContact;
      if (importState.phone) patch.phone = importState.phone;
      if (importState.email) patch.email = importState.email;
      await supabase.from("customers").upsert(patch, { onConflict: "name" });
    }

    const rows = importState.items.map((it) => ({
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

    setImporting(false);
    setImportState(null);
    fetchCustomers();
    fetchRentals();
  }

  const menuItems = [
    ...(isStaff ? [{ key: "quote", label: "견적서 업로드" }] : []),
    ...(isStaff ? [{ key: "rentals", label: "렌탈내역" }] : []),
    ...(isStaff ? [{ key: "shares", label: "지분관리" }] : []),
    ...(isStaff ? [{ key: "sales", label: "판매현황" }] : []),
    ...(isStaff ? [{ key: "customerData", label: "업체별데이터" }] : []),
    ...(isStaff ? [{ key: "ledger", label: "출고/회수 내역서" }] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans, color: C.ink }}>
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: serif, fontSize: 20 }}>리마켓 렌탈장부</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 13, color: C.inkSoft, textAlign: "right" }}>
              <div style={{ color: C.ink }}>{profile.name}</div>
              <div style={{ fontSize: 11.5 }}>{isAdmin ? "관리자" : isSales ? `${managerName} 담당자` : `${profile.company} 담당자`}</div>
            </div>
            <button onClick={onLogout} style={ghostBtnStyle}>로그아웃</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "28px 24px 60px", display: "flex", gap: 24, alignItems: "flex-start" }}>
        <aside style={{ width: 160, flexShrink: 0, border: `1px solid ${C.line}`, background: C.panel }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 11.5, color: C.muted, letterSpacing: 0.3 }}>메뉴</div>
          {menuItems.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setActiveTab(m.key);
                if (m.key === "shares") setSharesResetKey((k) => k + 1); // 지분관리는 눌릴 때마다 목록 화면으로 리셋
                if (m.key === "rentals") setRentalsResetKey((k) => k + 1); // 렌탈내역도 눌릴 때마다 목록 화면으로 리셋
                if (m.key === "sales") setSalesResetKey((k) => k + 1); // 판매현황도 눌릴 때마다 검색 화면으로 리셋
                if (m.key === "ledger") setLedgerResetKey((k) => k + 1); // 출고/회수 내역서도 눌릴 때마다 대장 목록으로 리셋
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "12px 16px",
                background: activeTab === m.key ? C.bg : "transparent",
                border: "none",
                borderLeft: activeTab === m.key ? `3px solid ${C.ink}` : "3px solid transparent",
                color: activeTab === m.key ? C.ink : C.inkSoft,
                fontSize: 13.5,
                cursor: "pointer",
                fontFamily: sans,
              }}
            >
              {m.label}
            </button>
          ))}
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
        {activeTab === "quote" && isStaff && (
          <QuoteUploadPanel
            importState={importState}
            onFile={processQuoteFile}
            onCancel={() => setImportState(null)}
            onConfirm={confirmImport}
            importing={importing}
            setImportState={setImportState}
            isAdmin={isAdmin}
            tonOverrides={tonOverrides}
            onTonOverrideSaved={fetchTonOverrides}
          />
        )}

        {activeTab === "rentals" && isStaff && (
          <RentalListTab key={rentalsResetKey} rentals={rentals} onRefresh={fetchRentals} isAdmin={isAdmin} managerName={managerName} tonOverrides={tonOverrides} />
        )}

        {activeTab === "shares" && isStaff && (
          <EquityTab key={sharesResetKey} rentals={rentals} shares={shares} onRefresh={fetchShares} />
        )}

        {activeTab === "sales" && isStaff && (
          <SalesStatusTab key={salesResetKey} rentals={rentals} onRefresh={fetchRentals} isAdmin={isAdmin} managerName={managerName} />
        )}

        {activeTab === "customerData" && isStaff && (
          <CustomerDataTab rentals={rentals} onRefresh={fetchRentals} />
        )}

        {activeTab === "ledger" && isStaff && (
          <LedgerTab key={ledgerResetKey} rentals={rentals} isAdmin={isAdmin} managerName={managerName} />
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

function StatementTab({ rentals }) {
  const [voucherQuery, setVoucherQuery] = useState("");
  const [selectedVoucher, setSelectedVoucher] = useState(null);

  const voucherList = useMemo(() => {
    const set = new Set();
    rentals.forEach((r) => {
      if (r.voucher_no) set.add(r.voucher_no);
    });
    return Array.from(set).sort().reverse();
  }, [rentals]);

  const filteredVouchers = useMemo(() => {
    const q = voucherQuery.trim().toLowerCase();
    if (!q) return voucherList;
    return voucherList.filter((v) => v.toLowerCase().includes(q));
  }, [voucherList, voucherQuery]);

  const items = useMemo(() => {
    if (!selectedVoucher) return [];
    return rentals.filter((r) => r.voucher_no === selectedVoucher);
  }, [rentals, selectedVoucher]);

  const totalAmount = items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const head = items[0];

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #statement-print-area, #statement-print-area * { visibility: visible; }
          #statement-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 24px; }
          .statement-no-print { display: none !important; }
        }
      `}</style>

      <div className="statement-no-print">
        <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>거래명세서</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
          전표번호를 선택하면 인쇄용 거래명세서를 미리보고 출력할 수 있어요. (신규 등록·엑셀 업로드 시 입력한 전표번호 기준)
        </div>
        <input
          placeholder="전표번호 검색"
          value={voucherQuery}
          onChange={(e) => setVoucherQuery(e.target.value)}
          style={{ ...inputStyle, maxWidth: 260, marginBottom: 14 }}
        />
        {voucherList.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
            아직 전표번호가 입력된 건이 없습니다. 납품내역의 신규 등록/엑셀 업로드에서 전표번호를 입력해주세요.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {filteredVouchers.map((v) => (
              <button
                key={v}
                onClick={() => setSelectedVoucher(v)}
                style={{
                  ...ghostBtnStyle,
                  background: selectedVoucher === v ? C.bg : "transparent",
                  borderColor: selectedVoucher === v ? C.ink : C.line,
                  color: selectedVoucher === v ? C.ink : C.inkSoft,
                }}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedVoucher && items.length > 0 && (
        <>
          <div className="statement-no-print" style={{ marginBottom: 16 }}>
            <button onClick={() => window.print()} style={primaryBtnStyle2}>인쇄 / PDF로 저장</button>
          </div>

          <div id="statement-print-area" style={{ border: `1px solid ${C.line}`, background: "#fff", padding: 32 }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontFamily: serif, fontSize: 22 }}>거 래 명 세 서</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 20 }}>
              <div>
                <div>거래처: {head.customer}</div>
                <div>현장/구역: {head.site || "-"}</div>
                <div>담당자: {head.manager || "-"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div>전표번호: {selectedVoucher}</div>
                <div>거래일자: {head.out_date}</div>
                <div>공급자: 리마켓</div>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["품목", "규격", "수량", "단가", "금액", "비고"].map((h) => (
                    <th
                      key={h}
                      style={{
                        border: `1px solid ${C.line}`,
                        padding: "8px 10px",
                        background: C.bg,
                        textAlign: h === "품목" || h === "규격" || h === "비고" ? "left" : "right",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.item}</td>
                    <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.spec || "-"}</td>
                    <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right" }}>{r.qty}</td>
                    <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right" }}>
                      {r.unit_price != null ? Number(r.unit_price).toLocaleString("ko-KR") : "-"}
                    </td>
                    <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right" }}>{fmtWon(r.amount)}</td>
                    <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>
                    합계
                  </td>
                  <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{fmtWon(totalAmount)}</td>
                  <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function CustomerDetailPanel({ customerName, rentals, customers, isAdmin, onClose, onSaved }) {
  const existing = customers.find((c) => c.name === customerName);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    contact_name: existing?.contact_name || "",
    phone: existing?.phone || "",
    email: existing?.email || "",
    note: existing?.note || "",
  });
  const [saving, setSaving] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  useEffect(() => {
    setForm({
      contact_name: existing?.contact_name || "",
      phone: existing?.phone || "",
      email: existing?.email || "",
      note: existing?.note || "",
    });
    setEditing(false);
  }, [customerName, existing?.contact_name, existing?.phone, existing?.email, existing?.note]);

  const items = useMemo(() => {
    let list = rentals.filter((r) => r.customer === customerName);
    if (periodStart) list = list.filter((r) => r.out_date && r.out_date >= periodStart);
    if (periodEnd) list = list.filter((r) => r.out_date && r.out_date <= periodEnd);
    return list;
  }, [rentals, customerName, periodStart, periodEnd]);

  const bySite = useMemo(() => {
    const map = {};
    for (const r of items) {
      const key = r.site || "(현장 미지정)";
      if (!map[key]) map[key] = { site: key, amount: 0, itemCount: 0, normal: 0, soon: 0, overdue: 0, collected: 0, purchase: 0 };
      map[key].amount += Number(r.amount) || 0;
      map[key].itemCount += Number(r.qty) || 0;
      map[key][getStatus(r)]++;
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [items]);

  const totalAmount = items.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("customers").upsert({ name: customerName, ...form }, { onConflict: "name" });
    setSaving(false);
    if (error) {
      alert("저장 중 오류가 발생했어요: " + error.message);
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <div style={{ border: `1px solid ${C.purple}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 18 }}>{customerName}</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>총 {fmtWon(totalAmount)} · 현장 {bySite.length}곳 · 품목 {items.reduce((s, r) => s + (Number(r.qty) || 0), 0)}개</div>
        </div>
        <button onClick={onClose} style={ghostBtnStyle}>닫기</button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 11.5, color: C.inkSoft, marginBottom: 6 }}>기간 시작 (출고일 기준)</label>
          <input type="date" style={smallInputStyle} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11.5, color: C.inkSoft, marginBottom: 6 }}>기간 종료</label>
          <input type="date" style={smallInputStyle} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        {(periodStart || periodEnd) && (
          <button onClick={() => { setPeriodStart(""); setPeriodEnd(""); }} style={miniBtnStyle}>전체 기간</button>
        )}
        <div style={{ fontSize: 12, color: C.muted }}>
          {periodStart || periodEnd ? "선택한 기간의 매출입니다." : "전체 기간 매출입니다."}
        </div>
      </div>

      <div style={{ border: `1px solid ${C.lineSoft}`, padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing ? 12 : 0 }}>
          <div style={{ fontSize: 13, color: C.inkSoft }}>담당자 정보</div>
          {isAdmin && !editing && (
            <button onClick={() => setEditing(true)} style={miniBtnStyle}>수정</button>
          )}
        </div>
        {!editing && (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13.5, marginTop: 8 }}>
            <div>담당자: {form.contact_name || "-"}</div>
            <div>연락처: {form.phone || "-"}</div>
            <div>이메일: {form.email || "-"}</div>
            {form.note && <div>비고: {form.note}</div>}
          </div>
        )}
        {editing && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Field label="담당자명">
                <input style={smallInputStyle} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </Field>
              <Field label="연락처">
                <input style={smallInputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="이메일">
                <input style={smallInputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
            </div>
            <Field label="비고">
              <input style={smallInputStyle} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={save} disabled={saving} style={primaryBtnStyle2}>{saving ? "저장 중…" : "저장"}</button>
              <button onClick={() => setEditing(false)} style={ghostBtnStyle}>취소</button>
            </div>
          </>
        )}
      </div>

      <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 8 }}>현장별 현황</div>
      <div style={{ border: `1px solid ${C.lineSoft}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 1fr", gap: 8, padding: "8px 12px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.lineSoft}` }}>
          <div>현장/구역</div>
          <div>금액</div>
          <div>품목수</div>
          <div>상태</div>
        </div>
        {bySite.map((s, idx) => (
          <div key={s.site} style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 1fr", gap: 8, padding: "8px 12px", fontSize: 13, alignItems: "center", borderBottom: idx === bySite.length - 1 ? "none" : `1px solid ${C.lineSoft}` }}>
            <div>{s.site}</div>
            <div>{fmtWon(s.amount)}</div>
            <div>{s.itemCount}개</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>
              {s.normal > 0 && `정상 ${s.normal} `}
              {s.soon > 0 && `임박 ${s.soon} `}
              {s.overdue > 0 && `연체 ${s.overdue} `}
              {s.collected > 0 && `회수완료 ${s.collected} `}
              {s.purchase > 0 && `구매 ${s.purchase}`}
            </div>
          </div>
        ))}
      </div>
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
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? C.ink : C.line}`,
        background: dragOver ? C.bg : C.panel,
        padding: hasData ? 16 : 40,
        textAlign: "center",
        cursor: "pointer",
        marginBottom: 16,
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
          <div style={{ fontSize: 15, color: C.ink, marginBottom: 6 }}>여기로 렌탈·구매 견적서 파일을 끌어다 놓으세요</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>또는 클릭해서 파일 선택 (.xlsx, .xls, .pdf)</div>
        </>
      )}
    </div>
  );
}

function QuoteHeaderForm({ state, update, isAdmin = true }) {
  const isRental = state.transactionType === "rental";
  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 16 }}>견적서입력(수정)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="구분">
          <select style={inputStyle} value={state.transactionType} onChange={(e) => update({ transactionType: e.target.value })}>
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
  { item: "파티션", spec: "2단, 연체리 / SV", per: 0.025 },
  { item: "파티션", spec: "스탠드 25평 (단상/인버터/YI-4500)", per: 0.2 },
  { item: "파티션", spec: "벽걸이 11평 (단상/인버터/YI-6445)", per: 0.05 },
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
  { item: "냉난방기", spec: "근무현황판, W900", per: 0.01 },
  { item: "냉난방기", spec: "스탠드 25평 (YI-3998)", per: 0.2 },
  { item: "냉장고", spec: "150리터", per: 0.1 },
  { item: "냉난방기", spec: "벽걸이 9평 (단상, 인버터)", per: 0.05 },
  { item: "냉난방기", spec: "4단올문장, 연체리", per: 0.1 },
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
function tonTokens(s) {
  return normalizeTonText(s)
    .split(/[,\*]/)
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

// 품목/규격으로 "개당 용적(톤)"을 찾는다.
// 0) 직원이 이전에 직접 입력해서 저장해둔 값(ton_overrides, DB) → 1) 기준표에서 품목+규격 정확히 일치
// → 2) 규격만 정확히 일치 → 3) 같은 품목 안에서 치수/구성이 가장 비슷한 규격
// → 4) 기준표 전체에서 가장 비슷한 규격(품목 자체가 기준표에 없는 경우). 그래도 하나도 안 겹치면 null(직접 입력 대상).
// customOverrides: [{item, spec, per}] — 직원이 한 번 채워넣으면 다음부터 자동으로 채워지는 학습된 값.
function lookupTonPerUnit(item, spec, customOverrides) {
  const ni = normalizeTonText(item);
  const ns = normalizeTonText(spec);
  if (!ns) return null;
  if (customOverrides && customOverrides.length) {
    const overrideHit = customOverrides.find((r) => normalizeTonText(r.item) === ni && normalizeTonText(r.spec) === ns);
    if (overrideHit) return overrideHit.per;
  }
  const pairHit = TON_REFERENCE_TABLE.find((r) => normalizeTonText(r.item) === ni && normalizeTonText(r.spec) === ns);
  if (pairHit) return pairHit.per;
  const specHit = TON_REFERENCE_TABLE.find((r) => normalizeTonText(r.spec) === ns);
  if (specHit) return specHit.per;
  const sameItemFuzzy = fuzzyTonMatch(item, spec, true);
  if (sameItemFuzzy != null) return sameItemFuzzy;
  return fuzzyTonMatch(item, spec, false);
}

// 품목 리스트(items)를 받아 각 행에 톤수(수량 × 개당용적)를 채워서 반환한다. 정말 비슷한 품목조차 없을 때만 톤수를 null로 둔다.
function withComputedTons(items, customOverrides) {
  return (items || []).map((it) => {
    const per = lookupTonPerUnit(it.item, it.spec, customOverrides);
    const ton = per != null && it.qty ? Math.round(Number(it.qty) * per * 1000) / 1000 : null;
    return { ...it, ton };
  });
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
        📍 배송지 정보{savedNote ? " (메모 있음)" : ""}
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

function QuoteUploadPanel({ importState, setImportState, onFile, onCancel, onConfirm, importing, isAdmin = true, tonOverrides, onTonOverrideSaved }) {
  const update = (patch) => setImportState({ ...importState, ...patch });

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>견적서 업로드</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        엑셀 또는 PDF 견적서를 올리면 아래 전표 정보와 품목이 자동으로 채워져요. (PDF는 표 형식에 따라 인식률이 다를 수 있으니) 등록 전에 내용을 꼭 확인·수정해주세요.
      </div>

      <QuoteDropZone onFile={onFile} hasData={!!importState} />

      {importState && (
        <>
          <QuoteHeaderForm state={importState} update={update} isAdmin={isAdmin} />
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
  const updateItem = (idx, patch) => {
    const items = [...state.items];
    items[idx] = { ...items[idx], ...patch };
    setState({ ...state, items });
  };
  const totalAmount = state.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  // 톤수를 못 찾아 비어있는(null) 품목이 있으면 "미확인 있음"으로 표시해서, 총 톤수만 보고 안심하지 않게 한다.
  const tonItems = state.items.filter((it) => it.ton != null);
  const totalTon = tonItems.reduce((sum, it) => sum + Number(it.ton), 0);
  const missingTonCount = state.items.length - tonItems.length;
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
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        총 {state.items.length}개 품목이 인식됐어요. 등록 전에 내용을 확인·수정해주세요. (칸 경계를 드래그하면 너비를 늘이고 줄일 수 있어요)
        톤수는 기준표에서 자동으로 채워져요. 노란 칸은 비슷한 품목조차 없어 직접 입력이 필요한 경우인데, 입력 후 "저장"을 누르면 다음부터는 이 품목도 자동으로 채워져요.
      </div>

      <div style={{ maxHeight: 360, overflow: "auto", border: `1px solid ${C.lineSoft}`, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 8, padding: "8px 10px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.lineSoft}`, position: "sticky", top: 0, background: C.panel, minWidth: "max-content" }}>
          {importPreviewCols.map((label, i) => (
            <div key={label} style={{ position: "relative" }}>
              {label}
              {i < importPreviewCols.length - 1 && <ColResizeHandle onMouseDown={startResize(i)} />}
            </div>
          ))}
        </div>
        {state.items.map((it, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 8, padding: "6px 10px", fontSize: 12.5, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: "max-content" }}>
            <input style={smallInputStyle} value={it.item || ""} onChange={(e) => updateItem(idx, { item: e.target.value })} />
            <input style={smallInputStyle} value={it.spec || ""} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
            <input type="number" style={smallInputStyle} value={it.qty ?? ""} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} />
            <NumberInput style={smallInputStyle} value={it.unit_price} onChange={(v) => updateItem(idx, { unit_price: v })} />
            <NumberInput style={smallInputStyle} value={it.amount} onChange={(v) => updateItem(idx, { amount: v })} />
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
            <input style={smallInputStyle} value={it.note || ""} onChange={(e) => updateItem(idx, { note: e.target.value })} />
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

function RentalForm({ initial, onCancel, onSubmit }) {
  const [f, setF] = useState(
    initial || {
      id: null,
      transaction_type: "rental",
      customer: "",
      site: "",
      item: "",
      spec: "",
      qty: 1,
      unit_price: null,
      amount: null,
      out_date: todayISO(),
      period_days: 30,
      due_date: addDays(todayISO(), 30),
      collected: false,
      collect_date: null,
      manager: "",
      voucher_no: "",
      note: "",
    }
  );

  const update = (patch) => {
    const next = { ...f, ...patch };
    if (next.transaction_type === "rental" && (patch.out_date || patch.period_days)) {
      next.due_date = addDays(next.out_date, next.period_days || 30);
    }
    if (patch.qty !== undefined || patch.unit_price !== undefined) {
      const qty = patch.qty !== undefined ? patch.qty : next.qty;
      const unitPrice = patch.unit_price !== undefined ? patch.unit_price : next.unit_price;
      if (unitPrice != null) next.amount = qty * unitPrice;
    }
    setF(next);
  };

  const isRental = f.transaction_type === "rental";

  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 16 }}>{initial ? "정보 수정" : "신규 등록"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Field label="거래유형">
          <select style={inputStyle} value={f.transaction_type} onChange={(e) => update({ transaction_type: e.target.value })}>
            <option value="rental">렌탈</option>
            <option value="purchase">구매</option>
          </select>
        </Field>
        <Field label="고객사">
          <input style={inputStyle} value={f.customer} onChange={(e) => update({ customer: e.target.value })} placeholder="예: 한우리건설" />
        </Field>
        <Field label="현장/구역">
          <input style={inputStyle} value={f.site || ""} onChange={(e) => update({ site: e.target.value })} placeholder="예: 청도현장" />
        </Field>
        <Field label="담당자">
          <input style={inputStyle} value={f.manager} onChange={(e) => update({ manager: e.target.value })} placeholder="예: 김영업" />
        </Field>
        <Field label="전표번호">
          <input style={inputStyle} value={f.voucher_no || ""} onChange={(e) => update({ voucher_no: e.target.value })} placeholder="예: RT-2026-0001" />
        </Field>
        <Field label="품목명">
          <input style={inputStyle} value={f.item} onChange={(e) => update({ item: e.target.value })} placeholder="예: 노트북 (LG 그램)" />
        </Field>
        <Field label="규격">
          <input style={inputStyle} value={f.spec || ""} onChange={(e) => update({ spec: e.target.value })} placeholder="예: W1800*D800, 월넛" />
        </Field>
        <Field label="수량">
          <input type="number" min={1} style={inputStyle} value={f.qty} onChange={(e) => update({ qty: Number(e.target.value) })} />
        </Field>
        <Field label="단가">
          <NumberInput style={inputStyle} value={f.unit_price} onChange={(v) => update({ unit_price: v })} />
        </Field>
        <Field label="금액">
          <NumberInput style={inputStyle} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        </Field>
        <Field label={isRental ? "출고일" : "발행일"}>
          <input type="date" style={inputStyle} value={f.out_date} onChange={(e) => update({ out_date: e.target.value })} />
        </Field>
        {isRental && (
          <>
            <Field label="렌탈기간(일)">
              <input type="number" min={1} style={inputStyle} value={f.period_days || ""} onChange={(e) => update({ period_days: Number(e.target.value) })} />
            </Field>
            <Field label="반납예정일 (자동계산, 직접 수정 가능)">
              <input type="date" style={inputStyle} value={f.due_date || ""} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
            </Field>
          </>
        )}
        <div style={{ gridColumn: "span 2" }}>
          <Field label="비고">
            <input style={inputStyle} value={f.note || ""} onChange={(e) => update({ note: e.target.value })} placeholder="선택 입력" />
          </Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => {
            if (!f.customer || !f.item) return;
            onSubmit(f);
          }}
          style={primaryBtnStyle2}
        >
          저장
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

function RentalListTab({ rentals, onRefresh, isAdmin = true, managerName = "", tonOverrides }) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [merging, setMerging] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [downloadingFiles, setDownloadingFiles] = useState(false);
  const [showAdvSearch, setShowAdvSearch] = useState(false);
  const [advSearch, setAdvSearch] = useState(emptyAdvSearch);
  const [appliedAdv, setAppliedAdv] = useState(emptyAdvSearch);

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

  const applyAdvSearch = () => setAppliedAdv(advSearch);
  const resetAdvSearch = () => {
    setAdvSearch(emptyAdvSearch);
    setAppliedAdv(emptyAdvSearch);
  };

  const selected = groups.find((g) => g.key === selectedKey) || null;

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
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>렌탈내역</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        전표번호를 클릭하면 세부 내역을 확인·수정할 수 있어요. (견적서 업로드로 등록된 전표 기준)
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
            <Field label="구분">
              <select style={inputStyle} value={advSearch.transactionType} onChange={(e) => setAdvSearch({ ...advSearch, transactionType: e.target.value })}>
                <option value="">전체</option>
                <option value="rental">렌탈</option>
                <option value="purchase">구매</option>
              </select>
            </Field>
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
          <div>전표번호</div>
          <div>거래처</div>
          <div>현장명</div>
          <div>담당자</div>
          <div>배송일자</div>
          <div>품목</div>
          <div>렌탈기간</div>
          <div>렌탈개시일</div>
          <div>렌탈만료일</div>
          <div>금액</div>
          <div>상태</div>
        </div>

        {filtered.map((g) => {
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

function RentalDetailPanel({ group, onClose, onSaved, isAdmin = true, managerName = "", tonOverrides }) {
  const [header, setHeader] = useState(() => ({
    voucherNo: group.head.voucher_no || "",
    transactionType: group.head.transaction_type || "rental",
    manager: group.head.manager || "",
    customer: group.head.customer || "",
    refContact: group.head.ref_contact || "",
    email: group.head.email || "",
    warehouse: group.head.warehouse || "",
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
  const addItem = () => setItems([...items, { id: null, item: "", spec: "", qty: 1, unit_price: null, amount: null, note: "" }]);
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
  const handleDeleteSelectedItems = () => {
    if (checkedItemIdxs.size === 0) return;
    if (!confirm(`선택한 ${checkedItemIdxs.size}개 품목을 삭제할까요?`)) return;
    setItems(items.filter((_, i) => !checkedItemIdxs.has(i)));
    setCheckedItemIdxs(new Set());
  };

  const totalAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const isRental = header.transactionType === "rental";

  // 화물차 적재 톤수(기준표 + 저장된 커스텀 값 기준)와 미확인 품목 수. 상단에 바로 보이게 계산해둔다.
  const itemsWithTon = useMemo(() => withComputedTons(items, tonOverrides), [items, tonOverrides]);
  const tonKnownItems = itemsWithTon.filter((it) => it.ton != null);
  const totalTon = tonKnownItems.reduce((s, it) => s + Number(it.ton), 0);
  const missingTonCount = itemsWithTon.length - tonKnownItems.length;

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
      const { error } = await supabase.from("rentals").delete().in("id", removedIds);
      if (error) {
        alert("삭제 중 오류가 발생했어요: " + error.message);
        setSaving(false);
        return;
      }
    }

    if (currentIds.length > 0) {
      const { error } = await supabase.from("rentals").update(headerPatch).in("id", currentIds);
      if (error) {
        alert("저장 중 오류가 발생했어요: " + error.message);
        setSaving(false);
        return;
      }
      for (const it of items.filter((x) => x.id)) {
        await supabase
          .from("rentals")
          .update({ item: it.item, spec: it.spec, qty: it.qty, unit_price: it.unit_price, amount: it.amount, note: it.note })
          .eq("id", it.id);
      }
    }

    const newItems = items.filter((it) => !it.id);
    if (newItems.length > 0) {
      const rows = newItems.map((it) => ({
        ...headerPatch,
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
    if (!confirm("이 전표를 삭제할까요? 되돌릴 수 없어요.")) return;
    setDeleting(true);
    const ids = group.rows.map((r) => r.id);
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
          border: `1px solid ${C.line}`,
          background: "#F7F4EC",
          padding: "14px 18px",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, color: C.ink }}>
          🚚 총 톤수 <strong>{totalTon.toFixed(3)}톤</strong>
          {missingTonCount > 0 && (
            <span style={{ color: "#B45309", fontSize: 12.5 }}> (톤수 미확인 {missingTonCount}건)</span>
          )}
        </div>
        {header.siteAddress && <div style={{ width: 1, alignSelf: "stretch", background: C.line }} />}
        <DeliverySiteInfoButton address={header.siteAddress} />
      </div>

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="구분">
            <select style={inputStyle} value={header.transactionType} onChange={(e) => update({ transactionType: e.target.value })}>
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
              <button onClick={handleDeleteSelectedItems} style={{ ...miniBtnStyle, borderColor: C.brick, color: C.brick }}>
                선택삭제 ({checkedItemIdxs.size})
              </button>
            )}
            <button onClick={addItem} style={miniBtnStyle}>+ 품목 추가</button>
          </div>
        </div>
        <div style={{ maxHeight: 360, overflow: "auto", border: `1px solid ${C.lineSoft}`, marginBottom: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: itemsGridTemplate,
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
                {label}
                <ColResizeHandle onMouseDown={startResize(i)} />
              </div>
            ))}
          </div>
          {items.map((it, idx) => {
            const vat = Math.round((Number(it.amount) || 0) * 0.1);
            const lineTotal = (Number(it.amount) || 0) + vat;
            return (
              <div
                key={it.id ?? `new-${idx}`}
                style={{ display: "grid", gridTemplateColumns: itemsGridTemplate, gap: 8, padding: "6px 10px", fontSize: 12.5, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: "max-content" }}
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
          {deleting ? "삭제 중…" : "전표 삭제"}
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

const salesListGrid = "120px 130px 90px 60px 100px 70px 120px 100px 120px";
// 판매현황 목록에만 렌탈종료일자 칸이 하나 더 있다(업체별데이터 목록은 salesListGrid를 그대로 씀).
const salesListGridWithDue = "120px 130px 90px 60px 100px 100px 70px 120px 100px 120px";

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
        담당자·거래처·기간으로 매출 데이터를 조회할 수 있어요. 배송일자(렌탈개시일) 기준이에요.
      </div>

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
          <Field label="담당자">
            <RecentValueInput
              storageKey="remarket_recent_manager"
              value={managerInput}
              onChange={setManagerInput}
              onKeyDown={handleSearchKeyDown}
              placeholder="예: 김영업"
            />
          </Field>
          <Field label="거래처">
            <RecentValueInput
              storageKey="remarket_recent_customer"
              value={customerInput}
              onChange={setCustomerInput}
              onKeyDown={handleSearchKeyDown}
              placeholder="예: 엔알비"
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

          <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: salesListGridWithDue, gap: 8, padding: "10px 14px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.line}`, minWidth: 980 }}>
              <div>전표번호</div>
              <div>거래처</div>
              <div>담당자</div>
              <div>구분</div>
              <div>배송일자</div>
              <div>렌탈종료일자</div>
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
                  style={{ display: "grid", gridTemplateColumns: salesListGridWithDue, gap: 8, padding: "12px 14px", fontSize: 13, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 980 }}
                >
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

function CustomerDataTab({ rentals, onRefresh }) {
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
  const [fromDateInput, setFromDateInput] = useState(monthStart);
  const [toDateInput, setToDateInput] = useState(monthEnd);

  const [customerQuery, setCustomerQuery] = useState("");
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(monthEnd);
  const [hasSearched, setHasSearched] = useState(false); // 검색을 눌러야 결과가 나오게(false면 안내문구만 보여줌)
  const [viewTab, setViewTab] = useState("sales"); // "sales" | "items" — 매출 데이터 / 품목별 수량 데이터 탭 전환
  const [selectedItemVoucherKey, setSelectedItemVoucherKey] = useState(null); // 품목별 수량 데이터에서 선택한 전표(선택 전엔 전표 목록만 보여줌)

  function runSearch() {
    addRecentValue("remarket_recent_customer", customerInput);
    setCustomerQuery(customerInput);
    setFromDate(fromDateInput);
    setToDate(toDateInput);
    setHasSearched(true);
    setSelectedItemVoucherKey(null);
  }

  function resetFilters() {
    setCustomerInput("");
    setFromDateInput(monthStart);
    setToDateInput(monthEnd);
    setCustomerQuery("");
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
    return (rentals || []).filter((r) => {
      if (!(r.customer || "").toLowerCase().includes(q)) return false;
      const d = (r.out_date || "").slice(0, 10);
      if (!d || d < fromDate || d > toDate) return false;
      return true;
    });
  }, [rentals, customerQuery, fromDate, toDate, searched]);

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
  // ids에는 이 그룹으로 합쳐진 원본 렌탈 행들의 id를 모아둬서, 선택삭제 시 실제로 지울 행을 알 수 있게 한다.
  const itemStats = useMemo(() => {
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
    const arr = Array.from(map.values());
    const dir = itemSortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (itemSortKey === "qty") return (a.qty - b.qty) * dir;
      const av = itemSortKey === "item" ? a.item : a.spec;
      const bv = itemSortKey === "item" ? b.item : b.spec;
      return (av || "").localeCompare(bv || "", "ko") * dir;
    });
    return arr;
  }, [selectedItemGroup, itemSortKey, itemSortDir]);
  const itemStatsTotalQty = itemStats.reduce((s, r) => s + r.qty, 0);
  const itemStatsTotalAmount = itemStats.reduce((s, r) => s + r.amount, 0);

  // 품목별 수량 통계 표의 체크박스 선택삭제 상태(전표를 바꾸면 초기화)
  const [checkedStatKeys, setCheckedStatKeys] = useState(new Set());
  const [deletingStats, setDeletingStats] = useState(false);
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

  async function handleDeleteSelectedStats() {
    const chosen = itemStats.filter((r) => checkedStatKeys.has(r.key));
    if (chosen.length === 0) return;
    const allIds = chosen.flatMap((r) => r.ids);
    if (!confirm(`선택한 품목 ${chosen.length}종(행 ${allIds.length}개)을 이 전표에서 삭제할까요? 되돌릴 수 없어요.`)) return;
    setDeletingStats(true);
    const { error } = await supabase.from("rentals").delete().in("id", allIds);
    setDeletingStats(false);
    if (error) {
      alert("삭제 중 오류가 발생했어요: " + error.message);
      return;
    }
    setCheckedStatKeys(new Set());
    onRefresh && onRefresh();
  }

  // 인쇄/PDF 저장 시 브라우저 상단에 뜨는 문서 제목("리마켓 렌탈장부")을 잠깐 "품목별 수량통계"로 바꿔서,
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
        업체명과 기간을 입력하면 그 기간 동안의 매출 합계와 월별 추이를 볼 수 있어요. (예: 무영씨엠 · 2026-08-01 ~ 2026-09-16)
      </div>

      <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 14 }}>
          <Field label="업체명">
            <RecentValueInput
              storageKey="remarket_recent_customer"
              value={customerInput}
              onChange={setCustomerInput}
              onKeyDown={handleSearchKeyDown}
              placeholder="예: 무영씨엠"
              extraOptions={customerOptions}
            />
          </Field>
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
                  disabled={checkedStatKeys.size === 0 || deletingStats}
                  style={{ ...ghostBtnStyle, opacity: checkedStatKeys.size === 0 || deletingStats ? 0.5 : 1 }}
                >
                  {deletingStats ? "삭제 중..." : `선택삭제${checkedStatKeys.size > 0 ? ` (${checkedStatKeys.size})` : ""}`}
                </button>
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

function LedgerTab({ rentals, isAdmin, managerName }) {
  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [showNewBook, setShowNewBook] = useState(false);
  const [newBookCustomer, setNewBookCustomer] = useState("");
  const [newBookSite, setNewBookSite] = useState("");
  const [creatingBook, setCreatingBook] = useState(false);

  useEffect(() => {
    fetchBooks();
  }, []);

  async function fetchBooks() {
    setLoadingBooks(true);
    const { data, error } = await supabase.from("ledger_books").select("*").order("created_at", { ascending: false });
    if (!error) setBooks(data || []);
    setLoadingBooks(false);
  }

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => [b.customer, b.site_name, b.manager].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [books, query]);

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
    setNewBookCustomer("");
    setNewBookSite("");
    setShowNewBook(false);
    await fetchBooks();
    setSelectedBookId(data.id);
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
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>출고/회수 내역서</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        업체(현장)별로 대장을 만들어두면, 전표가 새로 생길 때마다 계속 추가해서 출고·회수·미회수 수량을 관리할 수 있어요.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          placeholder="업체명, 현장명, 담당자 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, width: 320 }}
        />
        <button onClick={() => setShowNewBook((v) => !v)} style={primaryBtnStyle2}>+ 새 대장 만들기</button>
      </div>

      {showNewBook && (
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="업체명">
              <input style={inputStyle} value={newBookCustomer} onChange={(e) => setNewBookCustomer(e.target.value)} />
            </Field>
            <Field label="현장명 (선택)">
              <input style={inputStyle} value={newBookSite} onChange={(e) => setNewBookSite(e.target.value)} />
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

      <div style={{ border: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 8, padding: "10px 14px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.line}` }}>
          <div>업체명</div>
          <div>현장명</div>
          <div>담당자</div>
          <div>만든 날짜</div>
        </div>
        {filteredBooks.map((b) => (
          <div
            key={b.id}
            style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 8, padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${C.lineSoft}`, alignItems: "center" }}
          >
            <div>
              <button
                onClick={() => setSelectedBookId(b.id)}
                style={{ background: "none", border: "none", padding: 0, color: "#2563A8", textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
              >
                {b.customer}
              </button>
            </div>
            <div>{b.site_name || "-"}</div>
            <div>{b.manager || "-"}</div>
            <div style={{ fontSize: 12.5 }}>{(b.created_at || "").slice(0, 10)}</div>
          </div>
        ))}
        {!loadingBooks && filteredBooks.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>등록된 대장이 없어요. "+ 새 대장 만들기"로 시작해보세요.</div>
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
  const [showManualIn, setShowManualIn] = useState(false);
  const [manualInDate, setManualInDate] = useState(todayISO());
  const [manualInLabel, setManualInLabel] = useState("");
  const [manualInQtys, setManualInQtys] = useState({});
  const [savingManualIn, setSavingManualIn] = useState(false);
  const [deletingVoucherId, setDeletingVoucherId] = useState(null);
  const [deletingBook, setDeletingBook] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [bookId]);

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
  const outVouchers = useMemo(() => vouchers.filter((v) => v.kind === "out").sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [vouchers]);
  const inVouchers = useMemo(() => vouchers.filter((v) => v.kind === "in").sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [vouchers]);

  const entryMap = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(`${e.ledger_voucher_id}|${e.ledger_item_id}`, Number(e.qty) || 0);
    return m;
  }, [entries]);

  const qtyFor = (voucherId, itemId) => entryMap.get(`${voucherId}|${itemId}`) || 0;

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
        voucher_date: group.head.out_date || null,
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

  function openManualIn() {
    if (items.length === 0) {
      alert("먼저 출고 탭에서 전표를 추가해 품목을 등록해주세요.");
      return;
    }
    setManualInDate(todayISO());
    setManualInLabel("");
    setManualInQtys({});
    setShowManualIn(true);
  }

  async function handleSaveManualIn() {
    const qtyEntries = Object.entries(manualInQtys).filter(([, v]) => Number(v) > 0);
    if (qtyEntries.length === 0) {
      alert("회수 수량을 하나 이상 입력해주세요.");
      return;
    }
    setSavingManualIn(true);
    const nextSort = inVouchers.length > 0 ? Math.max(...inVouchers.map((v) => v.sort_order || 0)) + 1 : 0;
    const { data: newVoucher, error: vErr } = await supabase
      .from("ledger_vouchers")
      .insert({
        ledger_book_id: bookId,
        kind: "in",
        voucher_no: manualInLabel.trim() || null,
        voucher_date: manualInDate || null,
        source: "manual",
        sort_order: nextSort,
      })
      .select()
      .single();
    if (vErr) {
      setSavingManualIn(false);
      alert("회수 내역을 추가하는 중 오류가 발생했어요: " + vErr.message);
      return;
    }
    const entryRows = qtyEntries.map(([itemId, v]) => ({
      ledger_book_id: bookId,
      ledger_voucher_id: newVoucher.id,
      ledger_item_id: itemId,
      qty: Number(v),
    }));
    const { error: eErr } = await supabase.from("ledger_entries").insert(entryRows);
    setSavingManualIn(false);
    if (eErr) {
      alert("수량을 저장하는 중 오류가 발생했어요: " + eErr.message);
      return;
    }
    setShowManualIn(false);
    fetchAll();
  }

  async function handleSaveNote(itemId, text) {
    const { error } = await supabase.from("ledger_items").update({ note: text }).eq("id", itemId);
    if (!error) setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, note: text } : it)));
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

  if (loading || !book) {
    return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>불러오는 중…</div>;
  }

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #ledger-print-area, #ledger-print-area * { visibility: visible; }
          #ledger-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 24px; }
          .ledger-no-print { display: none !important; }
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
          출고
        </button>
        <button
          onClick={() => setSubTab("in")}
          style={{ ...miniBtnStyle, background: subTab === "in" ? C.ink : "transparent", color: subTab === "in" ? "#fff" : C.inkSoft, borderColor: subTab === "in" ? C.ink : C.line }}
        >
          회수 · 미회수
        </button>
      </div>

      {subTab === "out" && (
        <div className="ledger-no-print" style={{ marginBottom: 16 }}>
          <button onClick={() => setShowPicker((v) => !v)} style={primaryBtnStyle2}>+ 전표 추가</button>
          {showPicker && (
            <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 16, marginTop: 10 }}>
              <input
                placeholder="전표번호, 거래처, 현장명 검색 (비워두면 이 업체 전표만 보여요)"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${C.lineSoft}` }}>
                {pickerResults.map((g) => {
                  const already = outVouchers.some((v) => v.rental_voucher_no === g.voucherNo);
                  return (
                    <div key={g.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                      <div>
                        <div>
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
                  );
                })}
                {pickerResults.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>검색 결과가 없어요.</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === "in" && (
        <div className="ledger-no-print" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={openManualIn} style={primaryBtnStyle2}>+ 회수 추가</button>
          <button onClick={handlePrint} style={ghostBtnStyle}>인쇄 / PDF로 저장</button>
        </div>
      )}

      {subTab === "in" && showManualIn && (
        <div className="ledger-no-print" style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 10 }}>
            <Field label="회수일자">
              <input type="date" style={inputStyle} value={manualInDate} onChange={(e) => setManualInDate(e.target.value)} />
            </Field>
            <Field label="회수전표번호/메모 (선택, 예: A/S장 20682)">
              <input style={inputStyle} value={manualInLabel} onChange={(e) => setManualInLabel(e.target.value)} />
            </Field>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${C.lineSoft}`, marginBottom: 12 }}>
            {sortedItems.map((it) => (
              <div
                key={it.id}
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 100px", gap: 8, padding: "6px 10px", fontSize: 12.5, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}` }}
              >
                <div>{it.item}</div>
                <div>{it.spec || "-"}</div>
                <div>{it.color || "-"}</div>
                <input
                  type="number"
                  min={0}
                  style={smallInputStyle}
                  placeholder="0"
                  value={manualInQtys[it.id] ?? ""}
                  onChange={(e) => setManualInQtys((prev) => ({ ...prev, [it.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSaveManualIn} disabled={savingManualIn} style={primaryBtnStyle2}>
              {savingManualIn ? "저장 중…" : "저장"}
            </button>
            <button onClick={() => setShowManualIn(false)} style={ghostBtnStyle}>취소</button>
          </div>
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

        {subTab === "out" && (
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 600 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={ledgerTh}>품목</th>
                <th rowSpan={2} style={ledgerTh}>규격</th>
                <th rowSpan={2} style={ledgerTh}>색상</th>
                {outVouchers.length > 0 && (
                  <th colSpan={outVouchers.length} style={{ ...ledgerTh, background: C.amberBg }}>출고내역</th>
                )}
                <th rowSpan={2} style={{ ...ledgerTh, background: C.amberBg }}>출고합계</th>
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
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((it) => (
                <tr key={it.id}>
                  {it._rowSpan > 0 && (
                    <td rowSpan={it._rowSpan} style={ledgerTd}>{it.item}</td>
                  )}
                  <td style={ledgerTd}>{it.spec || "-"}</td>
                  <td style={ledgerTd}>{it.color || "-"}</td>
                  {outVouchers.map((v) => {
                    const q = qtyFor(v.id, it.id);
                    return (
                      <td key={v.id} style={{ ...ledgerTd, textAlign: "right" }}>{q > 0 ? q.toLocaleString("ko-KR") : "-"}</td>
                    );
                  })}
                  <td style={{ ...ledgerTd, textAlign: "right", fontWeight: 600 }}>{(outTotalByItem.get(it.id) || 0).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
              {sortedItems.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ ...ledgerTd, textAlign: "center", color: C.muted }}>+ 전표 추가로 출고 전표를 등록해주세요.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {subTab === "in" && (
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 600 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={ledgerTh}>품목</th>
                <th rowSpan={2} style={ledgerTh}>규격</th>
                <th rowSpan={2} style={ledgerTh}>색상</th>
                <th rowSpan={2} style={{ ...ledgerTh, background: C.amberBg }}>출고합계</th>
                {inVouchers.length > 0 && (
                  <th colSpan={inVouchers.length} style={{ ...ledgerTh, background: C.greenBg }}>회수내역</th>
                )}
                <th rowSpan={2} style={{ ...ledgerTh, background: C.greenBg }}>회수합계</th>
                <th rowSpan={2} style={{ ...ledgerTh, background: C.brickBg }}>미회수수량</th>
                <th rowSpan={2} style={ledgerTh}>비고</th>
              </tr>
              <tr>
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
                    {it._rowSpan > 0 && (
                      <td rowSpan={it._rowSpan} style={ledgerTd}>{it.item}</td>
                    )}
                    <td style={ledgerTd}>{it.spec || "-"}</td>
                    <td style={ledgerTd}>{it.color || "-"}</td>
                    <td style={{ ...ledgerTd, textAlign: "right" }}>{outTotal.toLocaleString("ko-KR")}</td>
                    {inVouchers.map((v) => {
                      const q = qtyFor(v.id, it.id);
                      return (
                        <td key={v.id} style={{ ...ledgerTd, textAlign: "right" }}>{q > 0 ? q.toLocaleString("ko-KR") : "-"}</td>
                      );
                    })}
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
                  <td colSpan={7} style={{ ...ledgerTd, textAlign: "center", color: C.muted }}>먼저 출고 탭에서 전표를 추가해주세요.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
