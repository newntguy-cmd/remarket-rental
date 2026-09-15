"use client";

import { useEffect, useMemo, useState } from "react";
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
function getStatus(item) {
  if (item.collected) return "collected";
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

  if (!session || !profile) {
    return <LoginScreen />;
  }

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
            출고부터 회수까지, 렌탈 현황을 한 곳에서 확인합니다.
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
    gridTemplateColumns: isAdmin ? "120px 1fr 60px 100px 100px 90px 150px" : "1fr 60px 100px 100px 90px",
    gap: 12,
  };
}

function StatCell({ label, value, color, active, onClick, last }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: "left",
        padding: "14px 18px",
        background: active ? C.bg : "transparent",
        border: "none",
        borderRight: last ? "none" : `1px solid ${C.line}`,
        cursor: "pointer",
        fontFamily: sans,
      }}
    >
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: serif, color: color || C.ink }}>{value}</div>
    </button>
  );
}

function Dashboard({ profile, onLogout }) {
  const isAdmin = profile.role === "admin";
  const [rentals, setRentals] = useState([]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    fetchRentals();
  }, []);

  async function fetchRentals() {
    setLoadingData(true);
    const { data, error } = await supabase.from("rentals").select("*").order("due_date", { ascending: true });
    if (!error) setRentals(data || []);
    setLoadingData(false);
  }

  const visible = useMemo(() => {
    let list = rentals;
    if (tab !== "all") list = list.filter((r) => getStatus(r) === tab);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.item.toLowerCase().includes(q) ||
          r.customer.toLowerCase().includes(q) ||
          (r.manager || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rentals, tab, query]);

  const counts = {
    all: rentals.length,
    normal: rentals.filter((r) => getStatus(r) === "normal").length,
    soon: rentals.filter((r) => getStatus(r) === "soon").length,
    overdue: rentals.filter((r) => getStatus(r) === "overdue").length,
    collected: rentals.filter((r) => getStatus(r) === "collected").length,
  };

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

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans, color: C.ink }}>
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 24px 60px" }}>
        <div style={{ display: "flex", border: `1px solid ${C.line}`, background: C.panel, marginBottom: 24 }}>
          <StatCell label="전체" value={counts.all} active={tab === "all"} onClick={() => setTab("all")} />
          <StatCell label="정상" value={counts.normal} color={C.green} active={tab === "normal"} onClick={() => setTab("normal")} />
          <StatCell label="반납임박" value={counts.soon} color={C.amber} active={tab === "soon"} onClick={() => setTab("soon")} />
          <StatCell label="연체" value={counts.overdue} color={C.brick} active={tab === "overdue"} onClick={() => setTab("overdue")} />
          <StatCell label="회수완료" value={counts.collected} color={C.muted} active={tab === "collected"} onClick={() => setTab("collected")} last />
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <input placeholder="품목, 고객사, 담당자 검색" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, maxWidth: 320 }} />
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              style={primaryBtnStyle2}
            >
              + 신규 렌탈 등록
            </button>
          )}
        </div>

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

        <div style={{ border: `1px solid ${C.line}`, background: C.panel }}>
          <div style={{ ...rowGrid(isAdmin), padding: "10px 16px", fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.line}` }}>
            {isAdmin && <div>고객사</div>}
            <div>품목</div>
            <div>수량</div>
            <div>출고일</div>
            <div>반납예정일</div>
            <div>상태</div>
            {isAdmin && <div></div>}
          </div>
          {loadingData && <div style={{ padding: "32px 16px", color: C.muted, fontSize: 13.5, textAlign: "center" }}>불러오는 중…</div>}
          {!loadingData && visible.length === 0 && (
            <div style={{ padding: "32px 16px", color: C.muted, fontSize: 13.5, textAlign: "center" }}>해당 조건의 렌탈 항목이 없습니다.</div>
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
                }}
              >
                {isAdmin && <div style={{ color: C.inkSoft }}>{r.customer}</div>}
                <div>
                  <div>{r.item}</div>
                  {r.note && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{r.note}</div>}
                </div>
                <div>{r.qty}</div>
                <div style={{ color: C.inkSoft }}>{r.out_date}</div>
                <div style={{ color: C.inkSoft }}>{r.due_date}</div>
                <div>
                  <span style={{ fontSize: 11.5, padding: "3px 9px", background: st.bg, color: st.fg }}>{st.label}</span>
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
                    {r.collected ? (
                      <button onClick={() => unmarkCollected(r.id)} style={miniBtnStyle}>회수취소</button>
                    ) : (
                      <button onClick={() => markCollected(r.id)} style={miniBtnStylePrimary}>회수처리</button>
                    )}
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

function RentalForm({ initial, onCancel, onSubmit }) {
  const [f, setF] = useState(
    initial || {
      id: null,
      customer: "",
      item: "",
      qty: 1,
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
    if (patch.out_date || patch.period_days) {
      next.due_date = addDays(next.out_date, next.period_days);
    }
    setF(next);
  };

  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 16 }}>{initial ? "렌탈 정보 수정" : "신규 렌탈 등록"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Field label="고객사">
          <input style={inputStyle} value={f.customer} onChange={(e) => update({ customer: e.target.value })} placeholder="예: 한우리건설" />
        </Field>
        <Field label="담당자">
          <input style={inputStyle} value={f.manager} onChange={(e) => update({ manager: e.target.value })} placeholder="예: 김영업" />
        </Field>
        <Field label="수량">
          <input type="number" min={1} style={inputStyle} value={f.qty} onChange={(e) => update({ qty: Number(e.target.value) })} />
        </Field>
        <Field label="품목명">
          <input style={inputStyle} value={f.item} onChange={(e) => update({ item: e.target.value })} placeholder="예: 노트북 (LG 그램)" />
        </Field>
        <Field label="출고일">
          <input type="date" style={inputStyle} value={f.out_date} onChange={(e) => update({ out_date: e.target.value })} />
        </Field>
        <Field label="렌탈기간(일)">
          <input type="number" min={1} style={inputStyle} value={f.period_days} onChange={(e) => update({ period_days: Number(e.target.value) })} />
        </Field>
        <Field label="반납예정일 (자동계산, 직접 수정 가능)">
          <input type="date" style={inputStyle} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
        </Field>
        <div style={{ gridColumn: "span 2" }}>
          <Field label="비고">
            <input style={inputStyle} value={f.note} onChange={(e) => update({ note: e.target.value })} placeholder="선택 입력" />
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
