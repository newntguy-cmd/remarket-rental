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

// ---------- 엑셀 견적서 파싱 ----------
const SKIP_NAMES = ["배송비", "dc", "d.c"];
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

    const qty = qtyRaw != null ? Number(qtyRaw) : 1;
    const unitPrice = priceRaw != null ? Number(priceRaw) : null;
    const amount = amountRaw != null ? Number(amountRaw) : unitPrice != null ? unitPrice * qty : null;

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

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr("이메일 또는 비밀번호가 올바르지 않습니다.");
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
          <Field label="이메일">
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="admin@remarket.co.kr" autoFocus />
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
  const [rentals, setRentals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [activeTab, setActiveTab] = useState("quote"); // 지금은 "quote" 하나뿐. 메뉴는 하나씩 다시 추가할 예정
  const [loadingData, setLoadingData] = useState(true);
  const [importState, setImportState] = useState(null); // parsed preview
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchRentals();
    fetchCustomers();
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

  async function processQuoteFile(file) {
    if (!file) return;
    try {
      const parsed = await parseQuoteExcel(file);
      setImportState(parsed);
    } catch (err) {
      alert("엑셀 파일을 읽는 중 문제가 발생했어요. 형식을 확인해주세요.");
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
      due_date: importState.dueDate,
      collected: false,
      collect_date: null,
      manager: importState.manager,
      voucher_no: importState.voucherNo || null,
      note: it.note,
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
    ...(isAdmin ? [{ key: "quote", label: "견적서 업로드" }] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans, color: C.ink }}>
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: serif, fontSize: 20 }}>리마켓 렌탈장부</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 13, color: C.inkSoft, textAlign: "right" }}>
              <div style={{ color: C.ink }}>{profile.name}</div>
              <div style={{ fontSize: 11.5 }}>{isAdmin ? "관리자" : `${profile.company} 담당자`}</div>
            </div>
            <button onClick={onLogout} style={ghostBtnStyle}>로그아웃</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px 60px", display: "flex", gap: 24, alignItems: "flex-start" }}>
        <aside style={{ width: 160, flexShrink: 0, border: `1px solid ${C.line}`, background: C.panel }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 11.5, color: C.muted, letterSpacing: 0.3 }}>메뉴</div>
          {menuItems.map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveTab(m.key)}
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
        {activeTab === "quote" && isAdmin && (
          <QuoteUploadPanel
            importState={importState}
            onFile={processQuoteFile}
            onCancel={() => setImportState(null)}
            onConfirm={confirmImport}
            importing={importing}
            setImportState={setImportState}
          />
        )}

        {!isAdmin && (
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
        <div style={{ fontSize: 12.5, color: C.inkSoft }}>다른 견적서로 다시 채우려면 여기로 새 파일을 드래그하거나 클릭하세요</div>
      ) : (
        <>
          <div style={{ fontSize: 15, color: C.ink, marginBottom: 6 }}>여기로 렌탈·구매 견적서 엑셀 파일을 끌어다 놓으세요</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>또는 클릭해서 파일 선택 (.xlsx, .xls)</div>
        </>
      )}
    </div>
  );
}

function QuoteHeaderForm({ state, update }) {
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
        <Field label="전표번호">
          <input style={inputStyle} value={state.voucherNo || ""} onChange={(e) => update({ voucherNo: e.target.value })} placeholder="예: RT-2026-0001" />
        </Field>
        <Field label="담당자">
          <input style={inputStyle} value={state.manager || ""} onChange={(e) => update({ manager: e.target.value })} placeholder="예: 김영업" />
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

function QuoteUploadPanel({ importState, setImportState, onFile, onCancel, onConfirm, importing }) {
  const update = (patch) => setImportState({ ...importState, ...patch });

  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>견적서 업로드</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        엑셀 견적서를 올리면 아래 전표 정보와 품목이 자동으로 채워져요. 내용을 확인·수정한 뒤 등록해주세요.
      </div>

      <QuoteDropZone onFile={onFile} hasData={!!importState} />

      {importState && (
        <>
          <QuoteHeaderForm state={importState} update={update} />
          <ImportPreview state={importState} setState={setImportState} onCancel={onCancel} onConfirm={onConfirm} importing={importing} />
        </>
      )}
    </div>
  );
}

function ImportPreview({ state, setState, onCancel, onConfirm, importing }) {
  const updateItem = (idx, patch) => {
    const items = [...state.items];
    items[idx] = { ...items[idx], ...patch };
    setState({ ...state, items });
  };
  const totalAmount = state.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>품목 내역</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        총 {state.items.length}개 품목이 인식됐어요. 등록 전에 내용을 확인·수정해주세요.
      </div>

      <div style={{ maxHeight: 360, overflowY: "auto", border: `1px solid ${C.lineSoft}`, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 100px 55px 100px 100px", gap: 8, padding: "8px 10px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.lineSoft}`, position: "sticky", top: 0, background: C.panel }}>
          <div>현장/구역</div>
          <div>품목</div>
          <div>규격</div>
          <div>수량</div>
          <div>단가</div>
          <div>금액</div>
        </div>
        {state.items.map((it, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "120px 1fr 100px 55px 100px 100px", gap: 8, padding: "6px 10px", fontSize: 12.5, alignItems: "center", borderBottom: `1px solid ${C.lineSoft}` }}>
            <input style={smallInputStyle} value={it.site || ""} onChange={(e) => updateItem(idx, { site: e.target.value })} />
            <input style={smallInputStyle} value={it.item || ""} onChange={(e) => updateItem(idx, { item: e.target.value })} />
            <input style={smallInputStyle} value={it.spec || ""} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
            <input type="number" style={smallInputStyle} value={it.qty ?? ""} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} />
            <input type="number" style={smallInputStyle} value={it.unit_price ?? ""} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
            <input type="number" style={smallInputStyle} value={it.amount ?? ""} onChange={(e) => updateItem(idx, { amount: Number(e.target.value) })} />
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
          <input type="number" style={inputStyle} value={f.unit_price ?? ""} onChange={(e) => update({ unit_price: Number(e.target.value) })} />
        </Field>
        <Field label="금액">
          <input type="number" style={inputStyle} value={f.amount ?? ""} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} />
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
