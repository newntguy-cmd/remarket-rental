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
function RecentValueInput({ storageKey, value, onChange, onKeyDown, onBlur, placeholder, style }) {
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

  const filtered = recent.filter((v) => !value.trim() || v.toLowerCase().includes(value.trim().toLowerCase()));

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

async function parseQuoteExcel(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
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

      m = cell.match(/렌탈\s*(\d+)\s*개월/);
      if (m) {
        transactionType = "rental";
        periodMonths = Number(m[1]);
        periodDays = Number(m[1]) * 30;
      }
      // "(YYYY-MM~YYYY-MM)" 요약 표기는 월 단위라 정확도가 떨어지므로,
      // "렌탈 N개월" 값을 못 찾았을 때만 보조적으로 사용한다.
      m = cell.match(/\((\d{4})-(\d{2})~(\d{4})-(\d{2})\)/);
      if (m && !periodMonths) {
        transactionType = "rental";
        outDate = `${m[1]}-${m[2]}-01`;
        const endYear = Number(m[3]);
        const endMonth = Number(m[4]);
        const lastDay = new Date(endYear, endMonth, 0).getDate();
        dueDate = `${m[3]}-${m[4]}-${String(lastDay).padStart(2, "0")}`;
      }
    }
  }

  // 배송일자가 별도로 명시돼 있으면 그 값을 출고일(=렌탈개시일)로 사용, 없으면 발행일을 그대로 씀
  if (deliveryDate) outDate = deliveryDate;
  else deliveryDate = outDate;
  if (periodMonths) dueDate = addMonthsMinusDay(outDate, periodMonths);

  // 품목 표 시작 행 + 실제 열 위치 찾기 (양식마다 B열부터 시작하거나 C열부터 시작할 수 있음)
  const detected = detectColumns(rows);
  const headerRowIdx = detected ? detected.headerRowIdx : 13;
  const cols = detected ? detected.cols : { item: 2, spec: 3, qty: 4, price: 5, amount: 6, note: 7 };
  const specCol = cols.spec ?? cols.item + 1;
  const noteCol = cols.note ?? cols.amount + 1;

  const items = [];
  let currentItem = "";
  let currentSite = site;

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
      currentSite = site ? `${site} · ${itemCell}` : itemCell;
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

      m = cell.match(/렌탈\s*(\d+)\s*개월/);
      if (m) {
        transactionType = "rental";
        periodMonths = Number(m[1]);
        periodDays = Number(m[1]) * 30;
      }
      m = cell.match(/\((\d{4})-(\d{2})~(\d{4})-(\d{2})\)/);
      if (m && !periodMonths) {
        transactionType = "rental";
        outDate = `${m[1]}-${m[2]}-01`;
        const endYear = Number(m[3]);
        const endMonth = Number(m[4]);
        const lastDay = new Date(endYear, endMonth, 0).getDate();
        dueDate = `${m[3]}-${m[4]}-${String(lastDay).padStart(2, "0")}`;
      }
    }
  }
  if (deliveryDate) outDate = deliveryDate;
  else deliveryDate = outDate;
  if (periodMonths) dueDate = addMonthsMinusDay(outDate, periodMonths);

  // 2) 품목 표 파싱 (여러 페이지에 걸쳐 있을 수 있음)
  let colCenters = null;
  const items = [];
  let currentItem = "";
  let currentSite = site;
  let stopped = false;

  for (const pageItems of allPagesItems) {
    if (stopped) break;
    const rows = pdfGroupRows(pageItems);

    let headerRow = null;
    let headerCols = null;
    for (const row of rows) {
      const words = pdfMergeWords(row.items, 30);
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
          currentSite = site ? `${site} · ${itemStr}` : itemStr;
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
  const [activeTab, setActiveTab] = useState("quote"); // 지금은 "quote" 하나뿐. 메뉴는 하나씩 다시 추가할 예정
  // 지분관리 화면은 목록/상세 중 어디에 있었는지를 자체적으로 기억하고 있어서, 메뉴의 "지분관리"를
  // 다시 눌러도(이미 그 탭이어도) 항상 목록 화면으로 되돌아가도록 이 값을 바꿔서 강제로 새로 마운트시킨다.
  const [sharesResetKey, setSharesResetKey] = useState(0);
  // 렌탈내역도 마찬가지로, 메뉴의 "렌탈내역"을 다시 눌렀을 때(이미 그 탭이어도) 상세화면이 아니라
  // 항상 목록 화면으로 되돌아가도록 이 값을 바꿔서 강제로 새로 마운트시킨다.
  const [rentalsResetKey, setRentalsResetKey] = useState(0);
  // 판매현황도 전표번호를 눌러 상세화면으로 들어갈 수 있게 됐으니, 메뉴를 다시 눌렀을 때 항상 검색화면으로 되돌아가게 한다.
  const [salesResetKey, setSalesResetKey] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [importState, setImportState] = useState(null); // parsed preview
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchRentals();
    fetchCustomers();
    fetchShares();
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

  async function processQuoteFile(file) {
    if (!file) return;
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    try {
      const parsed = isPdf ? await parseQuotePdf(file) : await parseQuoteExcel(file);
      parsed.voucherNo = nextVoucherNo(rentals); // 전표번호는 오늘 날짜 기준 자동 일련번호로 강제 부여
      // 영업담당자 계정은 견적서에 어떤 이름이 적혀 있든 항상 본인 이름으로 담당자를 고정한다(다른 사람 이름으로 잘못 등록되는 것을 방지).
      if (!isAdmin) parsed.manager = managerName;
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
    setImporting(false);
    if (error) {
      alert("등록 중 오류가 발생했어요: " + error.message);
      return;
    }
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
          />
        )}

        {activeTab === "rentals" && isStaff && (
          <RentalListTab key={rentalsResetKey} rentals={rentals} onRefresh={fetchRentals} isAdmin={isAdmin} managerName={managerName} />
        )}

        {activeTab === "shares" && isStaff && (
          <EquityTab key={sharesResetKey} rentals={rentals} shares={shares} onRefresh={fetchShares} />
        )}

        {activeTab === "sales" && isStaff && (
          <SalesStatusTab key={salesResetKey} rentals={rentals} onRefresh={fetchRentals} isAdmin={isAdmin} managerName={managerName} />
        )}

        {activeTab === "customerData" && isStaff && (
          <CustomerDataTab rentals={rentals} />
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
        <Field label="전표번호 (오늘 날짜 기준 자동 부여, 일련번호라 수정 불필요)">
          <input style={{ ...inputStyle, background: C.mutedBg, color: C.inkSoft }} value={state.voucherNo || ""} readOnly />
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

function QuoteUploadPanel({ importState, setImportState, onFile, onCancel, onConfirm, importing, isAdmin = true }) {
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
          <ImportPreview state={importState} setState={setImportState} onCancel={onCancel} onConfirm={onConfirm} importing={importing} />
        </>
      )}
    </div>
  );
}

const importPreviewCols = ["현장/구역", "품목", "규격", "수량", "단가", "금액", "비고"];
const importPreviewInitialWidths = [110, 170, 190, 55, 100, 100, 180];

function ImportPreview({ state, setState, onCancel, onConfirm, importing }) {
  const updateItem = (idx, patch) => {
    const items = [...state.items];
    items[idx] = { ...items[idx], ...patch };
    setState({ ...state, items });
  };
  const totalAmount = state.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const [colWidths, startResize] = useResizableColumns(importPreviewInitialWidths);
  const gridTemplate = colWidths.map((w) => `${w}px`).join(" ");

  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>품목 내역</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        총 {state.items.length}개 품목이 인식됐어요. 등록 전에 내용을 확인·수정해주세요. (칸 경계를 드래그하면 너비를 늘이고 줄일 수 있어요)
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
            <input style={smallInputStyle} value={it.site || ""} onChange={(e) => updateItem(idx, { site: e.target.value })} />
            <input style={smallInputStyle} value={it.item || ""} onChange={(e) => updateItem(idx, { item: e.target.value })} />
            <input style={smallInputStyle} value={it.spec || ""} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
            <input type="number" style={smallInputStyle} value={it.qty ?? ""} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} />
            <NumberInput style={smallInputStyle} value={it.unit_price} onChange={(v) => updateItem(idx, { unit_price: v })} />
            <NumberInput style={smallInputStyle} value={it.amount} onChange={(v) => updateItem(idx, { amount: v })} />
            <input style={smallInputStyle} value={it.note || ""} onChange={(e) => updateItem(idx, { note: e.target.value })} />
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 14 }}>합계 {fmtWon(totalAmount)}</div>

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

function RentalListTab({ rentals, onRefresh, isAdmin = true, managerName = "" }) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [merging, setMerging] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
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

function RentalDetailPanel({ group, onClose, onSaved, isAdmin = true, managerName = "" }) {
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
    site: group.head.site || "",
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
  const itemsGridTemplate = colWidths.map((w) => `${w}px`).join(" ") + " 32px";

  const update = (patch) => setHeader((h) => ({ ...h, ...patch }));
  const updateItem = (idx, patch) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    setItems(next);
  };
  const addItem = () => setItems([...items, { id: null, item: "", spec: "", qty: 1, unit_price: null, amount: null, note: "" }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const totalAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const isRental = header.transactionType === "rental";

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
      site: header.site,
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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontFamily: serif, fontSize: 16 }}>전표 상세 — {header.voucherNo || "(번호없음)"}</div>
        <button onClick={onClose} style={ghostBtnStyle}>← 목록으로</button>
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
            <input style={inputStyle} value={header.site} onChange={(e) => update({ site: e.target.value })} />
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
          <button onClick={addItem} style={miniBtnStyle}>+ 품목 추가</button>
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
            {["품목명", "규격", "수량", "단가", "공급가액", "부가세", "적요", "합계"].map((label, i) => (
              <div key={label} style={{ position: "relative" }}>
                {label}
                <ColResizeHandle onMouseDown={startResize(i)} />
              </div>
            ))}
            <div></div>
          </div>
          {items.map((it, idx) => {
            const vat = Math.round((Number(it.amount) || 0) * 0.1);
            const lineTotal = (Number(it.amount) || 0) + vat;
            return (
              <div
                key={it.id ?? `new-${idx}`}
                style={{ display: "grid", gridTemplateColumns: itemsGridTemplate, gap: 8, padding: "6px 10px", fontSize: 12.5, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}`, minWidth: "max-content" }}
              >
                <input style={smallInputStyle} value={it.item || ""} onChange={(e) => updateItem(idx, { item: e.target.value })} />
                <input style={smallInputStyle} value={it.spec || ""} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                <input type="number" style={smallInputStyle} value={it.qty ?? ""} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} />
                <NumberInput style={smallInputStyle} value={it.unit_price} onChange={(v) => updateItem(idx, { unit_price: v })} />
                <NumberInput style={smallInputStyle} value={it.amount} onChange={(v) => updateItem(idx, { amount: v })} />
                <div style={{ fontSize: 12.5, textAlign: "right", color: C.inkSoft }}>{fmtWon(vat)}</div>
                <input style={smallInputStyle} value={it.note || ""} onChange={(e) => updateItem(idx, { note: e.target.value })} />
                <div style={{ fontSize: 12.5, textAlign: "right" }}>{fmtWon(lineTotal)}</div>
                <button onClick={() => removeItem(idx)} style={{ background: "none", border: "none", color: C.brick, cursor: "pointer", fontSize: 13 }}>✕</button>
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

function CustomerDataTab({ rentals }) {
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

  // 선택한 전표 "안에서" 같은 품목명+규격끼리 수량/건수/금액을 합산한다(전표 하나 기준 집계).
  const itemStats = useMemo(() => {
    const rows = selectedItemGroup ? selectedItemGroup.rows : [];
    const map = new Map();
    for (const r of rows) {
      const itemName = (r.item || "").trim() || "(품목명 없음)";
      const specName = (r.spec || "").trim();
      const key = `${itemName}〓${specName}`;
      if (!map.has(key)) map.set(key, { item: itemName, spec: specName, qty: 0, count: 0, amount: 0 });
      const e = map.get(key);
      e.qty += Number(r.qty) || 0;
      e.count += 1;
      e.amount += Number(r.amount) || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [selectedItemGroup]);
  const itemStatsTotalQty = itemStats.reduce((s, r) => s + r.qty, 0);
  const itemStatsTotalAmount = itemStats.reduce((s, r) => s + r.amount, 0);

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
                      {["품목", "규격", "총수량"].map((h) => (
                        <th
                          key={h}
                          style={{
                            border: `1px solid ${C.line}`,
                            padding: "8px 10px",
                            background: C.bg,
                            textAlign: h === "품목" || h === "규격" ? "left" : "right",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemStats.map((r) => (
                      <tr key={`${r.item}〓${r.spec}`}>
                        <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.item}</td>
                        <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px" }}>{r.spec || "-"}</td>
                        <td style={{ border: `1px solid ${C.line}`, padding: "8px 10px", textAlign: "right" }}>{r.qty.toLocaleString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
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
