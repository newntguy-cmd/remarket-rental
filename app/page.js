"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

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
      ? "110px 140px 1fr 55px 100px 110px 150px"
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
  const [typeFilter, setTypeFilter] = useState("all"); // all | rental | purchase
  const [tab, setTab] = useState("all"); // all | normal | soon | overdue | collected
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [importState, setImportState] = useState(null); // parsed preview
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchRentals();
  }, []);

  async function fetchRentals() {
    setLoadingData(true);
    const { data, error } = await supabase.from("rentals").select("*").order("due_date", { ascending: true, nullsFirst: false });
    if (!error) setRentals(data || []);
    setLoadingData(false);
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
          (r.manager || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rentals, typeFilter, tab, query]);

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

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 60px" }}>
        <div style={{ display: "flex", border: `1px solid ${C.line}`, background: C.panel, marginBottom: 16 }}>
          <StatCell label="전체" value={counts.all} active={tab === "all" && typeFilter === "all"} onClick={() => { setTab("all"); setTypeFilter("all"); }} />
          <StatCell label="정상" value={counts.normal} color={C.green} active={tab === "normal"} onClick={() => { setTab("normal"); setTypeFilter("rental"); }} />
          <StatCell label="반납임박" value={counts.soon} color={C.amber} active={tab === "soon"} onClick={() => { setTab("soon"); setTypeFilter("rental"); }} />
          <StatCell label="연체" value={counts.overdue} color={C.brick} active={tab === "overdue"} onClick={() => { setTab("overdue"); setTypeFilter("rental"); }} />
          <StatCell label="회수완료" value={counts.collected} color={C.muted} active={tab === "collected"} onClick={() => { setTab("collected"); setTypeFilter("rental"); }} />
          <StatCell label="구매" value={counts.purchase} color={C.purple} active={typeFilter === "purchase"} onClick={() => { setTab("all"); setTypeFilter("purchase"); }} last />
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <input placeholder="품목, 고객사, 현장, 담당자 검색" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, maxWidth: 300 }} />
          <button onClick={() => setShowSummary((s) => !s)} style={ghostBtnStyle}>
            {showSummary ? "고객사 요약 닫기" : "고객사별 요약 보기"}
          </button>
          <div style={{ flex: 1 }} />
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

        {showSummary && (
          <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
            <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 14 }}>고객사별 요약</div>
            {summary.length === 0 && <div style={{ color: C.muted, fontSize: 13.5 }}>데이터가 없습니다.</div>}
            {summary.map((s) => (
              <div key={s.customer} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <div style={{ width: 160, fontSize: 14 }}>{s.customer}</div>
                <div style={{ width: 140, fontSize: 13, color: C.inkSoft }}>총 금액 {fmtWon(s.totalAmount)}</div>
                <div style={{ width: 100, fontSize: 13, color: C.inkSoft }}>품목 {s.itemCount}개</div>
                <div style={{ flex: 1, fontSize: 12.5, color: s.upcoming.length ? C.amber : C.muted }}>
                  {s.upcoming.length ? `반납임박/연체 ${s.upcoming.length}건: ${s.upcoming.map((u) => u.site || u.item).slice(0, 3).join(", ")}` : "반납임박 없음"}
                </div>
              </div>
            ))}
          </div>
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
                {isAdmin && <div style={{ color: C.inkSoft }}>{r.customer}</div>}
                <div style={{ color: C.inkSoft, fontSize: 12.5 }}>{r.site || "-"}</div>
                <div>
                  <div>{r.item}</div>
                  {r.spec && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{r.spec}</div>}
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 12 }}>
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
