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

  const headerScanRows = rows.slice(0, 15);
  for (const row of headerScanRows) {
    const line = (row || []).map(cellText).join(" ");
    if (!line.trim()) continue;

    let m = line.match(/수\s*신\s*[:：]\s*([^\n]+)/);
    if (m) {
      const raw = m[1].trim();
      if (raw.includes(" - ")) {
        const [c, s] = raw.split(" - ");
        customer = c.trim();
        site = s.trim();
      } else {
        customer = raw;
      }
    }
    m = line.match(/배송지\s*[:：]\s*([^\n]+)/);
    if (m && !site) site = m[1].trim();

    m = line.match(/발행일\s*[:：]\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (m) {
      issueDate = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
      outDate = issueDate;
    }

    m = line.match(/담당자\s*[:：]\s*([^\/\n]+)/);
    if (m) manager = m[1].trim();

    m = line.match(/렌탈\s*(\d+)\s*개월/);
    if (m) {
      transactionType = "rental";
      periodDays = Number(m[1]) * 30;
    }
    m = line.match(/\((\d{4})-(\d{2})~(\d{4})-(\d{2})\)/);
    if (m) {
      transactionType = "rental";
      outDate = `${m[1]}-${m[2]}-01`;
      const endYear = Number(m[3]);
      const endMonth = Number(m[4]);
      const lastDay = new Date(endYear, endMonth, 0).getDate();
      dueDate = `${m[3]}-${m[4]}-${String(lastDay).padStart(2, "0")}`;
    }
  }

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
      ? "24px 110px 140px 1fr 55px 100px 110px 210px"
      : "140px 1fr 55px 100px 110px",
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
  const [customerDetailName, setCustomerDetailName] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all"); // all | rental | purchase
  const [tab, setTab] = useState("all"); // all | normal | soon | overdue | collected
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [importState, setImportState] = useState(null); // parsed preview
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // 상세검색(Search) 패널 + 선택삭제
  const [showAdvSearch, setShowAdvSearch] = useState(false);
  const [advCustomer, setAdvCustomer] = useState("");
  const [advSite, setAdvSite] = useState("");
  const [advManager, setAdvManager] = useState("");
  const [advVoucher, setAdvVoucher] = useState("");
  const [advStart, setAdvStart] = useState("");
  const [advEnd, setAdvEnd] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

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

  const visible = useMemo(() => {
    let list = rentals;
    if (typeFilter !== "all") list = list.filter((r) => r.transaction_type === typeFilter);
    if (tab !== "all") list = list.filter((r) => getStatus(r) === tab);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.item || "").toLowerCase().includes(q) ||
          (r.customer || "").toLowerCase().includes(q) ||
          (r.site || "").toLowerCase().includes(q) ||
          (r.manager || "").toLowerCase().includes(q) ||
          (r.voucher_no || "").toLowerCase().includes(q)
      );
    }
    if (advCustomer.trim()) {
      const q = advCustomer.trim().toLowerCase();
      list = list.filter((r) => (r.customer || "").toLowerCase().includes(q));
    }
    if (advSite.trim()) {
      const q = advSite.trim().toLowerCase();
      list = list.filter((r) => (r.site || "").toLowerCase().includes(q));
    }
    if (advManager.trim()) {
      const q = advManager.trim().toLowerCase();
      list = list.filter((r) => (r.manager || "").toLowerCase().includes(q));
    }
    if (advVoucher.trim()) {
      const q = advVoucher.trim().toLowerCase();
      list = list.filter((r) => (r.voucher_no || "").toLowerCase().includes(q));
    }
    if (advStart) list = list.filter((r) => r.out_date && r.out_date >= advStart);
    if (advEnd) list = list.filter((r) => r.out_date && r.out_date <= advEnd);
    return list;
  }, [rentals, typeFilter, tab, query, advCustomer, advSite, advManager, advVoucher, advStart, advEnd]);

  const visibleTotal = useMemo(() => visible.reduce((s, r) => s + (Number(r.amount) || 0), 0), [visible]);
  const advCount = [advCustomer, advSite, advManager, advVoucher].filter((v) => v.trim()).length + [advStart, advEnd].filter(Boolean).length;

  function resetAdvSearch() {
    setAdvCustomer("");
    setAdvSite("");
    setAdvManager("");
    setAdvVoucher("");
    setAdvStart("");
    setAdvEnd("");
  }

  const counts = {
    all: rentals.length,
    normal: rentals.filter((r) => getStatus(r) === "normal").length,
    soon: rentals.filter((r) => getStatus(r) === "soon").length,
    overdue: rentals.filter((r) => getStatus(r) === "overdue").length,
    collected: rentals.filter((r) => getStatus(r) === "collected").length,
    purchase: rentals.filter((r) => r.transaction_type === "purchase").length,
  };

  // 고객사별 요약
  const summary = useMemo(() => {
    const byCustomer = {};
    for (const r of rentals) {
      const key = r.customer || "(미지정)";
      if (!byCustomer[key]) byCustomer[key] = { customer: key, totalAmount: 0, itemCount: 0, upcoming: [] };
      byCustomer[key].totalAmount += Number(r.amount) || 0;
      byCustomer[key].itemCount += Number(r.qty) || 0;
      const st = getStatus(r);
      if (st === "soon" || st === "overdue") byCustomer[key].upcoming.push(r);
    }
    return Object.values(byCustomer).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [rentals]);

  const monthlyRevenue = useMemo(() => computeMonthlyRevenue(rentals), [rentals]);
  const returnBuckets = useMemo(() => computeReturnBuckets(rentals), [rentals]);

  const matchingCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return summary.filter((s) => s.customer.toLowerCase().includes(q)).slice(0, 5);
  }, [summary, query]);

  async function upsertItem(item) {
    if (item.id) {
      const { id, ...rest } = item;
      await supabase.from("rentals").update(rest).eq("id", id);
    } else {
      await supabase.from("rentals").insert(item);
    }
    setShowForm(false);
    setEditing(null);
    fetchRentals();
  }

  async function markCollected(id) {
    await supabase.from("rentals").update({ collected: true, collect_date: todayISO() }).eq("id", id);
    fetchRentals();
  }
  async function unmarkCollected(id) {
    await supabase.from("rentals").update({ collected: false, collect_date: null }).eq("id", id);
    fetchRentals();
  }

  async function handleDeleteOne(row) {
    const ok = window.confirm(`${row.customer} / ${row.item} 건을 삭제할까요? 삭제하면 되돌릴 수 없습니다.`);
    if (!ok) return;
    setDeleting(true);
    const { error } = await supabase.from("rentals").delete().eq("id", row.id);
    setDeleting(false);
    if (!error) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      fetchRentals();
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const ok = window.confirm(`선택한 ${selectedIds.size}건을 삭제할까요? 삭제하면 되돌릴 수 없습니다.`);
    if (!ok) return;
    setDeleting(true);
    const { error } = await supabase.from("rentals").delete().in("id", Array.from(selectedIds));
    setDeleting(false);
    if (!error) {
      setSelectedIds(new Set());
      fetchRentals();
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const ids = visible.map((r) => r.id);
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
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
    fetchRentals();
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans, color: C.ink }}>
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 60px", display: "flex", gap: 24, alignItems: "flex-start" }}>
        <aside style={{ width: 160, flexShrink: 0, border: `1px solid ${C.line}`, background: C.panel }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 11.5, color: C.muted, letterSpacing: 0.3 }}>메뉴</div>
          <div
            style={{
              padding: "12px 16px",
              background: C.bg,
              borderLeft: `3px solid ${C.ink}`,
              color: C.ink,
              fontSize: 13.5,
              fontFamily: sans,
            }}
          >
            납품내역
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", border: `1px solid ${C.line}`, background: C.panel, marginBottom: 16 }}>
          <StatCell label="전체" value={counts.all} active={tab === "all" && typeFilter === "all"} onClick={() => { setTab("all"); setTypeFilter("all"); }} />
          <StatCell label="정상" value={counts.normal} color={C.green} active={tab === "normal"} onClick={() => { setTab("normal"); setTypeFilter("rental"); }} />
          <StatCell label="반납임박" value={counts.soon} color={C.amber} active={tab === "soon"} onClick={() => { setTab("soon"); setTypeFilter("rental"); }} />
          <StatCell label="연체" value={counts.overdue} color={C.brick} active={tab === "overdue"} onClick={() => { setTab("overdue"); setTypeFilter("rental"); }} />
          <StatCell label="회수완료" value={counts.collected} color={C.muted} active={tab === "collected"} onClick={() => { setTab("collected"); setTypeFilter("rental"); }} />
          <StatCell label="구매" value={counts.purchase} color={C.purple} active={typeFilter === "purchase"} onClick={() => { setTab("all"); setTypeFilter("purchase"); }} last />
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input placeholder="품목, 고객사, 현장, 담당자, 전표번호 검색" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, maxWidth: 300 }} />
          <button
            onClick={() => setShowAdvSearch((s) => !s)}
            style={{ ...ghostBtnStyle, background: showAdvSearch ? C.bg : "transparent", borderColor: showAdvSearch ? C.ink : C.line }}
          >
            Search{advCount > 0 ? ` (${advCount})` : ""}
          </button>
          <button onClick={() => setShowSummary((s) => !s)} style={ghostBtnStyle}>
            {showSummary ? "고객사 요약 닫기" : "고객사별 요약 보기"}
          </button>
          <button onClick={() => setShowStats((s) => !s)} style={ghostBtnStyle}>
            {showStats ? "통계 닫기" : "통계 보기"}
          </button>
          <div style={{ flex: 1 }} />
          {isAdmin && selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              style={{ ...ghostBtnStyle, color: "#fff", background: C.brick, borderColor: C.brick }}
            >
              {deleting ? "삭제 중…" : `선택삭제 (${selectedIds.size})`}
            </button>
          )}
          {isAdmin && (
            <>
              <input type="file" accept=".xlsx,.xls" ref={fileInputRef} onChange={handleFileSelect} style={{ display: "none" }} />
              <button onClick={() => fileInputRef.current?.click()} style={ghostBtnStyle}>엑셀 견적서 업로드</button>
              <button
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
                style={primaryBtnStyle2}
              >
                + 신규 등록
              </button>
            </>
          )}
        </div>

        {showAdvSearch && (
          <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 18, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <Field label="출고일(시작)">
                <input type="date" style={inputStyle} value={advStart} onChange={(e) => setAdvStart(e.target.value)} />
              </Field>
              <Field label="출고일(종료)">
                <input type="date" style={inputStyle} value={advEnd} onChange={(e) => setAdvEnd(e.target.value)} />
              </Field>
              <Field label="전표번호">
                <input style={inputStyle} value={advVoucher} onChange={(e) => setAdvVoucher(e.target.value)} />
              </Field>
              <Field label="거래처">
                <input style={inputStyle} value={advCustomer} onChange={(e) => setAdvCustomer(e.target.value)} />
              </Field>
              <Field label="현장/구역">
                <input style={inputStyle} value={advSite} onChange={(e) => setAdvSite(e.target.value)} />
              </Field>
              <Field label="담당자">
                <input style={inputStyle} value={advManager} onChange={(e) => setAdvManager(e.target.value)} />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAdvSearch(false)} style={primaryBtnStyle2}>검색 적용</button>
              <button onClick={resetAdvSearch} style={ghostBtnStyle}>초기화</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 16 }}>
          검색결과 {visible.length}건 · 합계 {fmtWon(visibleTotal)}
        </div>

        {matchingCustomers.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.muted }}>고객사 상세 바로가기:</span>
            {matchingCustomers.map((s) => (
              <button
                key={s.customer}
                onClick={() => setCustomerDetailName(s.customer)}
                style={{
                  padding: "5px 12px",
                  background: C.purpleBg,
                  color: "#3A3066",
                  border: "none",
                  fontSize: 12.5,
                  cursor: "pointer",
                  fontFamily: sans,
                }}
              >
                {s.customer} 상세보기
              </button>
            ))}
          </div>
        )}

        {showSummary && (
          <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
            <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 14 }}>고객사별 요약</div>
            {summary.length === 0 && <div style={{ color: C.muted, fontSize: 13.5 }}>데이터가 없습니다.</div>}
            {summary.map((s) => (
              <div key={s.customer} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <button
                  onClick={() => setCustomerDetailName(s.customer)}
                  style={{ width: 160, fontSize: 14, textAlign: "left", background: "none", border: "none", padding: 0, color: C.ink, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: sans }}
                >
                  {s.customer}
                </button>
                <div style={{ width: 140, fontSize: 13, color: C.inkSoft }}>총 금액 {fmtWon(s.totalAmount)}</div>
                <div style={{ width: 100, fontSize: 13, color: C.inkSoft }}>품목 {s.itemCount}개</div>
                <div style={{ flex: 1, fontSize: 12.5, color: s.upcoming.length ? C.amber : C.muted }}>
                  {s.upcoming.length ? `반납임박/연체 ${s.upcoming.length}건: ${s.upcoming.map((u) => u.site || u.item).slice(0, 3).join(", ")}` : "반납임박 없음"}
                </div>
              </div>
            ))}
          </div>
        )}

        {showStats && (
          <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 15, marginBottom: 4 }}>월별 매출 추이</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>최근 6개월, 렌탈+구매 합산 (출고일/발행일 기준)</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyRevenue} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={C.lineSoft} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11.5, fill: C.inkSoft, fontFamily: sans }} axisLine={{ stroke: C.line }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.muted, fontFamily: sans }} tickFormatter={fmtWonShort} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v) => fmtWon(v)} contentStyle={{ fontFamily: sans, fontSize: 12.5, border: `1px solid ${C.line}` }} cursor={{ fill: C.bg }} />
                  <Bar dataKey="amount" fill={C.ink} radius={[3, 3, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div style={{ fontFamily: serif, fontSize: 15, marginBottom: 4 }}>반납예정 타임라인</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>회수 안 된 렌탈 건, 임박도 구간별 건수</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={returnBuckets} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={C.lineSoft} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: C.inkSoft, fontFamily: sans }} axisLine={{ stroke: C.line }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted, fontFamily: sans }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip formatter={(v) => `${v}건`} contentStyle={{ fontFamily: sans, fontSize: 12.5, border: `1px solid ${C.line}` }} cursor={{ fill: C.bg }} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {returnBuckets.map((b, i) => (
                      <Cell key={i} fill={b.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {customerDetailName && (
          <CustomerDetailPanel
            customerName={customerDetailName}
            rentals={rentals}
            customers={customers}
            isAdmin={isAdmin}
            onClose={() => setCustomerDetailName(null)}
            onSaved={fetchCustomers}
          />
        )}

        {importState && (
          <ImportPreview
            state={importState}
            setState={setImportState}
            onCancel={() => setImportState(null)}
            onConfirm={confirmImport}
            importing={importing}
          />
        )}

        {showForm && (
          <RentalForm
            initial={editing}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
            onSubmit={upsertItem}
          />
        )}

        <div style={{ border: `1px solid ${C.line}`, background: C.panel, overflowX: "auto" }}>
          <div style={{ ...rowGrid(isAdmin), padding: "10px 16px", fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.line}`, minWidth: 700 }}>
            {isAdmin && (
              <div>
                <input
                  type="checkbox"
                  checked={visible.length > 0 && visible.every((r) => selectedIds.has(r.id))}
                  onChange={toggleSelectAllVisible}
                />
              </div>
            )}
            {isAdmin && <div>고객사</div>}
            <div>현장/구역</div>
            <div>품목</div>
            <div>수량</div>
            <div>금액</div>
            <div>상태</div>
            {isAdmin && <div></div>}
          </div>
          {loadingData && <div style={{ padding: "32px 16px", color: C.muted, fontSize: 13.5, textAlign: "center" }}>불러오는 중…</div>}
          {!loadingData && visible.length === 0 && (
            <div style={{ padding: "32px 16px", color: C.muted, fontSize: 13.5, textAlign: "center" }}>해당 조건의 항목이 없습니다.</div>
          )}
          {visible.map((r, idx) => {
            const st = STATUS_META[getStatus(r)];
            return (
              <div
                key={r.id}
                style={{
                  ...rowGrid(isAdmin),
                  padding: "13px 16px",
                  fontSize: 13.5,
                  alignItems: "center",
                  borderBottom: idx === visible.length - 1 ? "none" : `1px solid ${C.lineSoft}`,
                  minWidth: 700,
                }}
              >
                {isAdmin && (
                  <div>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </div>
                )}
                {isAdmin && <div style={{ color: C.inkSoft }}>{r.customer}</div>}
                <div style={{ color: C.inkSoft, fontSize: 12.5 }}>{r.site || "-"}</div>
                <div>
                  <div>{r.item}</div>
                  {r.spec && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{r.spec}</div>}
                  {r.voucher_no && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>전표 {r.voucher_no}</div>}
                </div>
                <div>{r.qty}</div>
                <div style={{ fontSize: 12.5 }}>{fmtWon(r.amount)}</div>
                <div>
                  <span style={{ fontSize: 11.5, padding: "3px 9px", background: st.bg, color: st.fg }}>{st.label}</span>
                  {r.due_date && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>~{r.due_date}</div>}
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => {
                        setEditing(r);
                        setShowForm(true);
                      }}
                      style={miniBtnStyle}
                    >
                      수정
                    </button>
                    {r.transaction_type === "rental" &&
                      (r.collected ? (
                        <button onClick={() => unmarkCollected(r.id)} style={miniBtnStyle}>회수취소</button>
                      ) : (
                        <button onClick={() => markCollected(r.id)} style={miniBtnStylePrimary}>회수처리</button>
                      ))}
                    <button onClick={() => handleDeleteOne(r)} style={{ ...miniBtnStyle, color: C.brick, borderColor: C.brick }}>
                      삭제
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>
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

function ImportPreview({ state, setState, onCancel, onConfirm, importing }) {
  const update = (patch) => setState({ ...state, ...patch });
  const updateItem = (idx, patch) => {
    const items = [...state.items];
    items[idx] = { ...items[idx], ...patch };
    setState({ ...state, items });
  };
  const totalAmount = state.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  return (
    <div style={{ border: `1px solid ${C.purple}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>엑셀 업로드 미리보기</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
        총 {state.items.length}개 품목이 인식됐어요. 등록 전에 내용을 확인·수정해주세요.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 14, marginBottom: 12 }}>
        <Field label="고객사">
          <input style={smallInputStyle} value={state.customer} onChange={(e) => update({ customer: e.target.value })} />
        </Field>
        <Field label="현장">
          <input style={smallInputStyle} value={state.site} onChange={(e) => update({ site: e.target.value })} />
        </Field>
        <Field label="거래유형">
          <select style={smallInputStyle} value={state.transactionType} onChange={(e) => update({ transactionType: e.target.value })}>
            <option value="rental">렌탈</option>
            <option value="purchase">구매</option>
          </select>
        </Field>
        <Field label="담당자">
          <input style={smallInputStyle} value={state.manager || ""} onChange={(e) => update({ manager: e.target.value })} />
        </Field>
        <Field label="전표번호">
          <input style={smallInputStyle} value={state.voucherNo || ""} onChange={(e) => update({ voucherNo: e.target.value })} />
        </Field>
      </div>

      {state.transactionType === "rental" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
          <Field label="출고일">
            <input type="date" style={smallInputStyle} value={state.outDate} onChange={(e) => update({ outDate: e.target.value })} />
          </Field>
          <Field label="반납예정일">
            <input type="date" style={smallInputStyle} value={state.dueDate || ""} onChange={(e) => update({ dueDate: e.target.value })} />
          </Field>
        </div>
      )}

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
