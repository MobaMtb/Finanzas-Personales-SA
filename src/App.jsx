// =====================================================================
// FINANZAS PERSONALES — v2 (Supabase + perfil individual)
// Requiere:  npm i @supabase/supabase-js recharts lucide-react
// Variables en .env (raíz del proyecto Vite):
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...
// =====================================================================
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  LayoutDashboard, Receipt, TrendingUp, Target, Plus, Trash2, Pencil, Check, X,
  Sun, Moon, Circle, CheckCircle2, ArrowUpRight, ArrowDownLeft, ArrowLeftRight,
  Wallet, LogOut, Upload, ChevronLeft, ChevronRight, MoreVertical, Cloud, CloudOff,
  Loader2, Copy,
} from "lucide-react";

// ───────────────────────── Supabase ─────────────────────────
// La anon key es pública por diseño (los datos los protege el RLS de Supabase).
// Si Netlify tiene las variables VITE_*, se usan esas; si no, estas por defecto.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://rosyujphrgnqbtzezkct.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvc3l1anBocmducWJ0emV6a2N0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5MzMwNDEsImV4cCI6MjExMDUwOTA0MX0.-ZdnqQDN04I97cVLrKUtGyNM_ZhbQ7GL0G2XuJk-cAk";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ───────────────────────── Utilidades ─────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0);
const fmtShort = (n) => {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + n;
};
const MESES_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Fecha LOCAL (la versión anterior usaba UTC y después de las 21:00 en Chile marcaba el día siguiente)
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const mesKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const addMes = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  return mesKey(new Date(y, m - 1 + delta, 1));
};
const mesLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fechaCL = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "—");
const sum = (arr) => arr.reduce((s, n) => s + (Number(n) || 0), 0);

const FRECUENCIAS = ["Semanal", "Quincenal", "Mensual", "Bimestral", "Trimestral", "Semestral", "Anual", "Única vez"];
// Cuánto pesa cada frecuencia en un mes (Semanal = 52 semanas / 12 meses)
const FACTOR = { Semanal: 52 / 12, Quincenal: 2, Mensual: 1, Bimestral: 1 / 2, Trimestral: 1 / 3, Semestral: 1 / 6, Anual: 1 / 12, "Única vez": 1 };
const mensual = (g) => Math.round((Number(g.monto) || 0) * (FACTOR[g.frecuencia] ?? 1));

// ───────────────────────── Formularios (crear / editar) ─────────────────────────
const FORMS = {
  gasto: {
    tabla: "gastos_fijos",
    campos: [
      { k: "nombre", l: "Nombre", t: "text", req: true, ph: "Ej. Arriendo" },
      { k: "monto", l: "Monto por pago", t: "number", req: true },
      { k: "frecuencia", l: "Frecuencia", t: "select", op: FRECUENCIAS, def: "Mensual" },
    ],
  },
  ingreso: {
    tabla: "ingresos",
    campos: [
      { k: "monto", l: "Monto", t: "number", req: true },
      { k: "descripcion", l: "Origen", t: "text", ph: "Ej. pega, negocio, mesada" },
      { k: "fecha", l: "Fecha", t: "date", def: todayISO },
    ],
  },
  prestamo: {
    tabla: "prestamos",
    campos: [
      { k: "a_quien", l: "¿A quién?", t: "text", req: true, ph: "Ej. Benja" },
      { k: "monto", l: "Monto", t: "number", req: true },
      { k: "fecha", l: "Fecha", t: "date", def: todayISO },
    ],
  },
  meta: {
    tabla: "metas",
    campos: [
      { k: "nombre", l: "Nombre", t: "text", req: true, ph: "Ej. Vacaciones" },
      { k: "monto_objetivo", l: "Monto objetivo", t: "number", req: true },
      { k: "monto_actual", l: "Ahorrado", t: "number", soloEditar: true, def: 0 },
    ],
  },
};
const ETIQUETA = { gasto: "Gasto fijo", ingreso: "Ingreso", prestamo: "Préstamo", meta: "Meta de ahorro" };
const TITULO = {
  gasto: (x) => x.nombre,
  ingreso: (x) => x.descripcion || "Ingreso",
  prestamo: (x) => x.a_quien,
  meta: (x) => x.nombre,
};
const DETALLE = {
  gasto: (g, ctx) => [
    ["Monto por pago", fmt(g.monto)],
    ["Frecuencia", g.frecuencia],
    ["Equiv. mensual", fmt(mensual(g))],
    ["Estado " + ctx.mesCorto, ctx.pagosMes.has(g.id) ? "Pagado" : "Pendiente"],
    ["Creado", fechaCL(g.created_at)],
  ],
  ingreso: (i) => [
    ["Monto", "+" + fmt(i.monto)],
    ["Fecha", fechaCL(i.fecha)],
    ["Origen", i.descripcion || "—"],
    ["Registrado", fechaCL(i.created_at)],
  ],
  prestamo: (p) => [
    ["A quién", p.a_quien],
    ["Monto", fmt(p.monto)],
    ["Prestado el", fechaCL(p.fecha)],
    ["Estado", p.devuelto ? "Devuelto" : "Pendiente"],
    ["Devuelto el", p.fecha_devolucion ? fechaCL(p.fecha_devolucion) : "—"],
  ],
  meta: (m) => [
    ["Objetivo", fmt(m.monto_objetivo)],
    ["Ahorrado", fmt(m.monto_actual)],
    ["Falta", fmt(Math.max(0, m.monto_objetivo - m.monto_actual))],
    ["Avance", Math.min(100, Math.round((m.monto_actual / m.monto_objetivo) * 100)) + "%"],
  ],
};

// ───────────────────────── Tema ─────────────────────────
function tema(dark) {
  return dark
    ? {
        // Base: #11676A (relleno de botones, logo y selección). Texto de acento en un turquesa más claro para que se lea.
        bg: "#0B2123", side: "#0E2729", card: "#112E30", card2: "#173B3D", ink: "#E3EFEE", muted: "#8DAFAD",
        line: "#1E4547", input: "#0D2628", fill: "#11676A", accent: "#62BDB8", accent2: "#7CCAC5", onAccent: "#FFFFFF",
        accentSoft: "rgba(17,103,106,.38)",
        green: "#9ACD7E", greenSoft: "rgba(154,205,126,.13)", red: "#EE8A78", redSoft: "rgba(238,138,120,.14)",
        amber: "#E2B661", amberSoft: "rgba(226,182,97,.14)",
      }
    : {
        bg: "#F2F4F3", side: "#FBFCFB", card: "#FFFFFF", card2: "#EEF2F1", ink: "#1E2B2F", muted: "#66767A",
        line: "#DDE4E2", input: "#F8FAF9", fill: "#2E5E8C", accent: "#2E5E8C", accent2: "#3A6D9E", onAccent: "#FFFFFF",
        accentSoft: "#E5EDF5",
        green: "#2E8655", greenSoft: "#E3F1E8", red: "#BF4637", redSoft: "#F8E7E3",
        amber: "#A8731A", amberSoft: "#F6EDDA",
      };
}

const css = (c) => `
@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;color-scheme:${c.bg === "#F2F4F3" ? "light" : "dark"}}
body{margin:0;background:${c.bg};overscroll-behavior-y:none;font-variant-numeric:tabular-nums}
:focus-visible{outline:2px solid ${c.accent};outline-offset:2px}
button,a,input,select,textarea,label{touch-action:manipulation}
button{-webkit-tap-highlight-color:transparent}
input,select,textarea{font-family:inherit;border:1px solid ${c.line};background:${c.input};border-radius:10px;padding:10px 12px;font-size:16px;color:${c.ink};width:100%;min-width:0}
input:focus,select:focus,textarea:focus{outline:none;border-color:${c.accent};box-shadow:0 0 0 3px ${c.accentSoft}}
button{font-family:inherit}
.card{background:${c.card};border:1px solid ${c.line};border-radius:14px;padding:20px}
.lbl{display:flex;flex-direction:column;gap:6px;font-size:12px;color:${c.muted};font-weight:500}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:${c.fill};color:${c.onAccent};border:1px solid ${c.fill};padding:9px 15px;border-radius:10px;font-size:14px;cursor:pointer;font-weight:600;white-space:nowrap}
.btn:hover{filter:brightness(1.06)}
.btn:disabled{opacity:.6;cursor:default}
.btn.ghost{background:transparent;color:${c.ink};border:1px solid ${c.line}}
.btn.ghost:hover{background:${c.card2};filter:none}
.btn.danger{background:transparent;color:${c.red};border-color:${c.line}}
.icon-btn{background:none;border:none;cursor:pointer;color:${c.muted};padding:7px;border-radius:8px;display:inline-flex;align-items:center}
.icon-btn:hover{background:${c.card2};color:${c.ink}}
.titulo{font-size:15px;font-weight:600;color:${c.ink}}
.sub{font-size:13px;color:${c.muted}}
.nav{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:9px;cursor:pointer;font-size:14px;color:${c.muted};font-weight:500;border:none;background:none;width:100%;text-align:left}
.nav.on{color:${c.accent};background:${c.accentSoft};font-weight:600}
.nav:hover:not(.on){color:${c.ink}}
.badge{margin-left:auto;font-size:12px;font-weight:600;padding:0 7px;border-radius:6px;line-height:20px}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 20px;border-top:1px solid ${c.line};cursor:pointer;transition:background .15s}
.row:hover{background:${c.card2}}
.row.sel{background:${c.accentSoft}}
.stat{background:none;border:none;text-align:left;cursor:pointer;font-family:inherit;padding:0;color:inherit;display:flex;flex-direction:column;gap:4px;min-width:0}
.stat:hover .stat-v{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}
.stat-v{font-size:20px;font-weight:600;letter-spacing:-.01em}
.stat-l{font-size:13px;color:${c.muted}}
.pill{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.shell{display:grid;grid-template-columns:232px minmax(0,1fr) 340px;min-height:100vh}
.sidebar{display:flex}
.topbar{display:none}
.solo-angosto{display:none}
@media (max-width:1199px){.shell{grid-template-columns:232px minmax(0,1fr)}.rightpanel{display:none}.solo-angosto{display:inline-flex}}
@media (max-width:420px){.resumen-cifras .stat{padding:14px 12px !important}.stat-v{font-size:17px}}
@media (max-width:899px){.shell{grid-template-columns:minmax(0,1fr)}.sidebar{display:none}.topbar{display:flex}.main{padding:16px 16px calc(28px + env(safe-area-inset-bottom)) !important}.two-col{grid-template-columns:1fr !important}}
@media (min-width:1200px){.drawer{display:none !important}}
@media (prefers-reduced-motion:reduce){*{transition:none !important}}
::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:${c.line};border-radius:4px}
`;

// ───────────────────────── App raíz (sesión) ─────────────────────────
export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <PantallaCarga />;
  if (!session) return <Auth />;
  return <Finanzas key={session.user.id} user={session.user} />;
}

function PantallaCarga({ texto = "Cargando…" }) {
  const c = tema(true);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: c.bg, color: c.muted, fontFamily: "'Figtree', system-ui, sans-serif" }}>
      <style>{css(c)}</style>
      <Loader2 size={18} className="spin" /> {texto}
    </div>
  );
}

// ───────────────────────── Login / Registro ─────────────────────────
function Auth() {
  const c = tema(true);
  const [modo, setModo] = useState("entrar");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState(null);
  const [cargando, setCargando] = useState(false);

  const traducir = (m) =>
    m.includes("Invalid login credentials") ? "Correo o contraseña incorrectos."
    : m.includes("Email not confirmed") ? "Falta confirmar el correo. Revisa tu bandeja de entrada."
    : m.includes("already registered") ? "Ese correo ya tiene cuenta. Inicia sesión."
    : m.includes("at least 6") ? "La contraseña debe tener al menos 6 caracteres."
    : m;

  const enviar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setMsg(null);
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) setMsg({ err: true, t: traducir(error.message) });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { data: { nombre: nombre.trim() } } });
      if (error) setMsg({ err: true, t: traducir(error.message) });
      else if (!data.session) setMsg({ err: false, t: "Listo. Te llegó un correo para confirmar la cuenta; después inicia sesión." });
    }
    setCargando(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: c.bg, color: c.ink, fontFamily: "'Figtree', system-ui, sans-serif" }}>
      <style>{css(c)}</style>
      <form onSubmit={enviar} className="card" style={{ width: "100%", maxWidth: 380, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Logo c={c} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{modo === "entrar" ? "Inicia sesión" : "Crea tu cuenta"}</div>
        <div style={{ fontSize: 13, color: c.muted, marginTop: -8 }}>Cada cuenta tiene sus propias finanzas.</div>
        {modo === "registro" && (
          <label className="lbl">Nombre<input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cómo quieres que te salude" /></label>
        )}
        <label className="lbl">Correo<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="lbl">Contraseña<input type="password" required minLength={6} autoComplete={modo === "entrar" ? "current-password" : "new-password"} value={pass} onChange={(e) => setPass(e.target.value)} /></label>
        {msg && <div style={{ fontSize: 13, padding: "10px 12px", borderRadius: 10, background: msg.err ? c.redSoft : c.greenSoft, color: msg.err ? c.red : c.green }}>{msg.t}</div>}
        <button className="btn" disabled={cargando} style={{ padding: "12px 16px", marginTop: 4 }}>
          {cargando ? <Loader2 size={15} className="spin" /> : modo === "entrar" ? "Entrar" : "Registrarme"}
        </button>
        <button type="button" className="icon-btn" style={{ justifyContent: "center", fontSize: 13 }} onClick={() => { setModo(modo === "entrar" ? "registro" : "entrar"); setMsg(null); }}>
          {modo === "entrar" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </form>
    </div>
  );
}

function Logo({ c }) {
  return (
    <>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: c.fill, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Wallet size={17} color={c.onAccent} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 17, color: c.ink }}>Finanzas</div>
    </>
  );
}

// ───────────────────────── App principal ─────────────────────────
const NAV = [
  { key: "resumen", label: "Panel", icon: LayoutDashboard },
  { key: "fijos", label: "Gastos fijos", icon: Receipt },
  { key: "ingresos", label: "Ingresos", icon: TrendingUp },
  { key: "prestamos", label: "Préstamos", icon: ArrowLeftRight },
  { key: "metas", label: "Metas", icon: Target },
];
const TABLAS_RT = ["profiles", "gastos_fijos", "pagos", "ingresos", "prestamos", "metas"];

function Finanzas({ user }) {
  const [perfil, setPerfil] = useState(null);
  const [d, setD] = useState({ gastos: [], pagos: [], ingresos: [], prestamos: [], metas: [] });
  const [cargando, setCargando] = useState(true);
  const [sync, setSync] = useState("ok"); // ok | guardando | error
  const [errMsg, setErrMsg] = useState("");
  const [tab, setTab] = useState("resumen");
  const [mes, setMes] = useState(mesKey(new Date()));
  const [sel, setSel] = useState(null); // { tipo, id }
  const [modal, setModal] = useState(null); // "gasto" | "ingreso" | "prestamo" | "meta" | "importar"
  const [drawer, setDrawer] = useState(false);

  const dark = (perfil?.tema ?? "dark") === "dark";
  const c = tema(dark);

  // ---- Carga ----
  const fetchAll = useCallback(async () => {
    const q = (t, col, asc) => supabase.from(t).select("*").order(col, { ascending: asc });
    const res = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      q("gastos_fijos", "created_at", true),
      q("pagos", "mes", false),
      q("ingresos", "fecha", false),
      q("prestamos", "fecha", false),
      q("metas", "created_at", true),
    ]);
    const conError = res.find((r) => r.error);
    if (conError) { setSync("error"); setErrMsg(conError.error.message); return false; }
    const [p, g, pa, i, pr, m] = res.map((r) => r.data);
    setPerfil(p || { id: user.id, nombre: user.email.split("@")[0], tema: "dark" });
    setD({ gastos: g, pagos: pa, ingresos: i, prestamos: pr, metas: m });
    return true;
  }, [user.id, user.email]);

  useEffect(() => { fetchAll().finally(() => setCargando(false)); }, [fetchAll]);

  // ---- Sincronización en vivo (PC <-> celular) ----
  useEffect(() => {
    let t;
    const refetch = () => { clearTimeout(t); t = setTimeout(fetchAll, 400); };
    const ch = supabase.channel("finanzas-" + user.id);
    TABLAS_RT.forEach((tb) => ch.on("postgres_changes", { event: "*", schema: "public", table: tb }, refetch));
    ch.subscribe();
    const onVis = () => { if (document.visibilityState === "visible") refetch(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [fetchAll, user.id]);

  // ---- Escritura ----
  const run = async (op) => {
    setSync("guardando");
    const { error } = await op;
    if (error) { setSync("error"); setErrMsg(error.message); return false; }
    await fetchAll();
    setSync("ok");
    return true;
  };

  const pagosMes = useMemo(() => new Set(d.pagos.filter((p) => p.mes === mes).map((p) => p.gasto_id)), [d.pagos, mes]);

  const acciones = {
    crear: (tipo, payload) => run(supabase.from(FORMS[tipo].tabla).insert(payload)),
    editar: (tipo, id, payload) => run(supabase.from(FORMS[tipo].tabla).update(payload).eq("id", id)),
    borrar: (tipo, id) => run(supabase.from(FORMS[tipo].tabla).delete().eq("id", id)),
    togglePago: (g) =>
      pagosMes.has(g.id)
        ? run(supabase.from("pagos").delete().eq("gasto_id", g.id).eq("mes", mes))
        : run(supabase.from("pagos").upsert({ gasto_id: g.id, mes, monto: mensual(g) }, { onConflict: "gasto_id,mes" })),
    toggleDevuelto: (p) =>
      run(supabase.from("prestamos").update({ devuelto: !p.devuelto, fecha_devolucion: !p.devuelto ? todayISO() : null }).eq("id", p.id)),
    aportar: (m, v) => run(supabase.from("metas").update({ monto_actual: Math.max(0, m.monto_actual + v) }).eq("id", m.id)),
    editarNombre: (nombre) => {
      setPerfil((p) => ({ ...p, nombre }));
      return run(supabase.from("profiles").update({ nombre }).eq("id", user.id));
    },
    toggleTema: () => {
      const t = dark ? "light" : "dark";
      setPerfil((p) => ({ ...p, tema: t }));
      return run(supabase.from("profiles").update({ tema: t }).eq("id", user.id));
    },
    importar: () => setModal("importar"),
    salir: () => supabase.auth.signOut(),
  };

  // ---- Importar datos de la versión anterior (localStorage) ----
  const importarPersona = async (p) => {
    setSync("guardando");
    const cuenta = { gastos: 0, pagos: 0, ingresos: 0, prestamos: 0, metas: 0 };
    try {
      const mapa = {};
      for (const g of p.gastosFijos) {
        const fila = { nombre: String(g.nombre || "Gasto"), monto: Math.max(0, Math.round(Number(g.monto) || 0)), frecuencia: FRECUENCIAS.includes(g.frecuencia) ? g.frecuencia : "Mensual" };
        const { data, error } = await supabase.from("gastos_fijos").insert(fila).select("id").single();
        if (error) throw error;
        mapa[g.id] = { id: data.id, fila };
        cuenta.gastos++;
      }
      const pagos = [];
      Object.entries(p.estadoPagos || {}).forEach(([m, ids]) => {
        if (!/^\d{4}-\d{2}$/.test(m)) return;
        Object.entries(ids || {}).forEach(([oldId, ok]) => {
          if (ok && mapa[oldId]) pagos.push({ gasto_id: mapa[oldId].id, mes: m, monto: mensual(mapa[oldId].fila) });
        });
      });
      if (pagos.length) { const { error } = await supabase.from("pagos").insert(pagos); if (error) throw error; cuenta.pagos = pagos.length; }

      const ingresos = p.ingresos.filter((i) => Number(i.monto) > 0).map((i) => ({ monto: Math.round(Number(i.monto)), descripcion: i.descripcion || "", fecha: i.fecha || todayISO() }));
      if (ingresos.length) { const { error } = await supabase.from("ingresos").insert(ingresos); if (error) throw error; cuenta.ingresos = ingresos.length; }

      const prestamos = p.prestamos.filter((x) => Number(x.monto) > 0 && x.aQuien).map((x) => ({ a_quien: x.aQuien, monto: Math.round(Number(x.monto)), fecha: x.fecha || todayISO(), devuelto: !!x.devuelto, fecha_devolucion: x.fechaDevolucion || null }));
      if (prestamos.length) { const { error } = await supabase.from("prestamos").insert(prestamos); if (error) throw error; cuenta.prestamos = prestamos.length; }

      const metas = p.metas.filter((m) => Number(m.montoObjetivo) > 0).map((m) => ({ nombre: m.nombre || "Meta", monto_objetivo: Math.round(Number(m.montoObjetivo)), monto_actual: Math.max(0, Math.round(Number(m.montoActual) || 0)) }));
      if (metas.length) { const { error } = await supabase.from("metas").insert(metas); if (error) throw error; cuenta.metas = metas.length; }

      await fetchAll();
      setSync("ok");
      return cuenta;
    } catch (e) {
      await fetchAll();
      setSync("error");
      setErrMsg(e.message);
      throw e;
    }
  };

  // ---- Derivados ----
  const pagosDelMes = d.pagos.filter((p) => p.mes === mes);
  const pagado = sum(pagosDelMes.map((p) => p.monto));
  const pendientes = d.gastos.filter((g) => !pagosMes.has(g.id));
  const pendiente = sum(pendientes.map(mensual));
  const totalMes = pagado + pendiente;
  const ingresosMes = sum(d.ingresos.filter((i) => i.fecha.slice(0, 7) === mes).map((i) => i.monto));
  const porCobrar = sum(d.prestamos.filter((p) => !p.devuelto).map((p) => p.monto));
  const ahorro = sum(d.metas.map((m) => m.monto_actual));
  const disponible = ingresosMes - totalMes;
  const prestamosPend = d.prestamos.filter((p) => !p.devuelto).length;

  const serie = useMemo(() => {
    const out = [];
    for (let k = 5; k >= 0; k--) {
      const key = addMes(mes, -k);
      out.push({
        mes: MESES_ABBR[Number(key.slice(5)) - 1],
        ingresos: sum(d.ingresos.filter((i) => i.fecha.slice(0, 7) === key).map((i) => i.monto)),
        gastos: sum(d.pagos.filter((p) => p.mes === key).map((p) => p.monto)),
      });
    }
    return out;
  }, [d.ingresos, d.pagos, mes]);

  const coleccion = { gasto: d.gastos, ingreso: d.ingresos, prestamo: d.prestamos, meta: d.metas };
  const item = sel ? coleccion[sel.tipo]?.find((x) => x.id === sel.id) : null;
  const seleccionar = (tipo, id) => {
    if (!tipo) { setSel(null); return; }
    setSel({ tipo, id });
    setDrawer(true);
  };
  const ctx = { pagosMes, mesCorto: MESES_ABBR[Number(mes.slice(5)) - 1] };
  const recientes = useMemo(
    () => [
      ...d.ingresos.map((i) => ({ tipo: "ingreso", id: i.id, fecha: i.fecha, titulo: i.descripcion || "Ingreso", monto: i.monto, signo: "+" })),
      ...d.prestamos.map((p) => ({ tipo: "prestamo", id: p.id, fecha: p.fecha, titulo: "Préstamo a " + p.a_quien, monto: p.monto, signo: p.devuelto ? "✓" : "−" })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8),
    [d.ingresos, d.prestamos]
  );

  if (cargando) return <PantallaCarga texto="Cargando tus datos…" />;

  const panelProps = { c, perfil, user, sel, item, ctx, acciones, onSel: seleccionar, recientes };
  const tituloTab = NAV.find((n) => n.key === tab)?.label;
  const iniciales = iniDe(perfil?.nombre || user.email);

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.ink, fontFamily: "'Figtree', system-ui, sans-serif" }}>
      <style>{css(c)}</style>

      {/* ── Barra superior móvil (arriba para que nada flotante la tape) ── */}
      <nav className="topbar" style={{ position: "sticky", top: 0, zIndex: 30, background: c.side, borderBottom: `1px solid ${c.line}`, padding: "calc(6px + env(safe-area-inset-top)) 4px 6px", justifyContent: "space-around" }}>
        {NAV.map(({ key, label, icon: Icon }) => {
          const on = tab === key;
          return (
            <button key={key} onClick={() => { setTab(key); window.scrollTo({ top: 0 }); }} aria-current={on ? "page" : undefined}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: on ? c.accentSoft : "none", border: "none", borderRadius: 10, color: on ? c.accent : c.muted, fontSize: 11, cursor: "pointer", padding: "7px 2px", fontWeight: on ? 600 : 500, minWidth: 0 }}>
              <Icon size={19} />
              {label.split(" ")[0]}
            </button>
          );
        })}
      </nav>

      <div className="shell">
        {/* ── Sidebar ── */}
        <aside className="sidebar" style={{ flexDirection: "column", background: c.side, padding: "26px 16px", position: "sticky", top: 0, height: "100vh", borderRight: `1px solid ${c.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 30px" }}><Logo c={c} /></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {NAV.map(({ key, label, icon: Icon }) => (
              <button key={key} className={`nav ${tab === key ? "on" : ""}`} onClick={() => setTab(key)}>
                <Icon size={17} /> {label}
                {key === "fijos" && pendientes.length > 0 && <span className="badge" style={{ background: c.redSoft, color: c.red }}>{pendientes.length}</span>}
                {key === "prestamos" && prestamosPend > 0 && <span className="badge" style={{ background: c.amberSoft, color: c.amber }}>{prestamosPend}</span>}
                {key === "metas" && d.metas.length > 0 && <span className="badge" style={{ background: c.card2, color: c.muted }}>{d.metas.length}</span>}
              </button>
            ))}
          </div>
          <div style={{ marginTop: "auto", padding: "0 8px" }}>
            <EstadoSync c={c} sync={sync} errMsg={errMsg} />
          </div>
        </aside>

        {/* ── Contenido ── */}
        <main className="main" style={{ padding: "26px 30px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-.01em" }}>{tab === "resumen" ? "Hola, " + ((perfil?.nombre || "").split(" ")[0] || "tú") : tituloTab}</h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", background: c.card, border: `1px solid ${c.line}`, borderRadius: 10 }}>
                <button className="icon-btn" onClick={() => setMes(addMes(mes, -1))} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
                <span style={{ fontSize: 14, fontWeight: 600, minWidth: 132, textAlign: "center" }}>{mesLabel(mes)}</span>
                <button className="icon-btn" onClick={() => setMes(addMes(mes, 1))} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
              </div>
              <button className="solo-angosto" onClick={() => { setSel(null); setDrawer(true); }} style={{ width: 38, height: 38, borderRadius: "50%", border: "none", cursor: "pointer", background: c.accentSoft, color: c.accent, fontWeight: 700, fontSize: 13, alignItems: "center", justifyContent: "center" }}>
                {iniciales}
              </button>
            </div>
          </div>

          {tab === "resumen" && (
            <Resumen c={c} setModal={setModal} setTab={setTab} seleccionar={seleccionar}
              ingresosMes={ingresosMes} disponible={disponible} pendiente={pendiente} porCobrar={porCobrar}
              ahorro={ahorro} pagado={pagado} totalMes={totalMes} serie={serie} metas={d.metas}
              gastos={d.gastos} pagosMes={pagosMes} onToggle={acciones.togglePago} mesTxt={mesLabel(mes).split(" ")[0]} />
          )}
          {tab === "fijos" && (
            <GastosTab c={c} gastos={d.gastos} pagosMes={pagosMes} mesTxt={mesLabel(mes)} pagado={pagado} pendiente={pendiente} totalMes={totalMes}
              onToggle={acciones.togglePago} onSel={seleccionar} sel={sel} onAdd={() => setModal("gasto")} />
          )}
          {tab === "ingresos" && (
            <IngresosTab c={c} ingresos={d.ingresos} mes={mes} onSel={seleccionar} sel={sel} onAdd={() => setModal("ingreso")} />
          )}
          {tab === "prestamos" && (
            <PrestamosTab c={c} prestamos={d.prestamos} onToggle={acciones.toggleDevuelto} onSel={seleccionar} sel={sel} onAdd={() => setModal("prestamo")} />
          )}
          {tab === "metas" && (
            <MetasTab c={c} metas={d.metas} onAportar={acciones.aportar} onSel={seleccionar} sel={sel} onAdd={() => setModal("meta")} />
          )}
        </main>

        {/* ── Panel derecho (pantallas anchas) ── */}
        <aside className="rightpanel" style={{ background: c.side, padding: "22px 18px", position: "sticky", top: 0, height: "100vh", overflowY: "auto", borderLeft: `1px solid ${c.line}` }}>
          <Panel {...panelProps} />
        </aside>
      </div>

      {/* ── Panel como cajón (pantallas angostas) ── */}
      {drawer && (
        <div className="drawer" onClick={() => setDrawer(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,12,28,.55)", zIndex: 40 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(380px, 100%)", background: c.side, padding: "20px 16px", overflowY: "auto" }}>
            <Panel {...panelProps} onClose={() => setDrawer(false)} />
          </div>
        </div>
      )}

      {/* ── Modales ── */}
      {modal && modal !== "importar" && (
        <Modal c={c} titulo={{ gasto: "Nuevo gasto fijo", ingreso: "Nuevo ingreso", prestamo: "Nuevo préstamo", meta: "Nueva meta" }[modal]} onClose={() => setModal(null)}>
          <FormRegistro c={c} tipo={modal} onCancel={() => setModal(null)}
            onSubmit={async (payload) => { if (await acciones.crear(modal, payload)) setModal(null); }} />
        </Modal>
      )}
      {modal === "importar" && (
        <Modal c={c} titulo="Importar datos de la versión anterior" onClose={() => setModal(null)}>
          <ImportarModal c={c} tieneDatos={d.gastos.length + d.ingresos.length + d.prestamos.length + d.metas.length > 0}
            onImport={importarPersona} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}

const iniDe = (s) => (s || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

function EstadoSync({ c, sync, errMsg }) {
  if (sync === "guardando") return <div style={{ fontSize: 12, color: c.muted, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={13} className="spin" /> Guardando…</div>;
  if (sync === "error") return <div title={errMsg} style={{ fontSize: 12, color: c.red, display: "flex", alignItems: "center", gap: 6 }}><CloudOff size={13} /> Error al sincronizar</div>;
  return <div style={{ fontSize: 12, color: c.muted, display: "flex", alignItems: "center", gap: 6 }}><Cloud size={13} /> Sincronizado</div>;
}

// ───────────────────────── Componentes visuales ─────────────────────────
function Cifras({ c, items }) {
  return (
    <section className="card resumen-cifras" style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`, padding: 0 }}>
      {items.map((x, k) => (
        <div key={x.l} className="stat" style={{ padding: "16px 18px", borderLeft: k ? `1px solid ${c.line}` : "none", cursor: "default" }}>
          <span className="stat-l">{x.l}</span>
          <span className="stat-v" style={{ color: x.col || c.ink }}>{x.v}</span>
        </div>
      ))}
    </section>
  );
}

function Ring({ c, pct, size = 96, stroke = 7, color, children }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c.card2} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - p / 100)}
          style={{ transition: "stroke-dashoffset .6s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}

function Leyenda({ c, color, texto }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: c.muted }}><span style={{ width: 10, height: 3, borderRadius: 2, background: color }} />{texto}</span>;
}

function Vacio({ c, texto }) {
  return <div style={{ padding: "18px 20px 22px", color: c.muted, fontSize: 14, borderTop: `1px solid ${c.line}` }}>{texto}</div>;
}

function Modal({ c, titulo, onClose, children }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(8,12,28,.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{titulo}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormRegistro({ c, tipo, inicial, editar, onSubmit, onCancel }) {
  const campos = FORMS[tipo].campos.filter((f) => editar || !f.soloEditar);
  const [v, setV] = useState(() =>
    Object.fromEntries(campos.map((f) => [f.k, inicial?.[f.k] ?? (typeof f.def === "function" ? f.def() : f.def ?? "")]))
  );
  const [enviando, setEnviando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const payload = {};
    for (const f of campos) {
      if (f.t === "number") payload[f.k] = Math.max(0, Math.round(Number(v[f.k]) || 0));
      else if (f.t === "date") payload[f.k] = v[f.k] || todayISO();
      else payload[f.k] = typeof v[f.k] === "string" ? v[f.k].trim() : v[f.k];
      if (f.req && !payload[f.k]) return;
    }
    setEnviando(true);
    await onSubmit(payload);
    setEnviando(false);
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {campos.map((f) => (
        <label key={f.k} className="lbl">
          {f.l}
          {f.t === "select" ? (
            <select value={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.value })}>
              {f.op.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type={f.t} inputMode={f.t === "number" ? "numeric" : undefined} min={f.t === "number" ? (f.req ? 1 : 0) : undefined}
              required={f.req} placeholder={f.ph} value={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
          )}
        </label>
      ))}
      {tipo === "gasto" && v.frecuencia && v.monto !== "" && (
        <div style={{ fontSize: 12, color: c.muted }}>Equivale a {fmt(mensual({ monto: v.monto, frecuencia: v.frecuencia }))} al mes.</div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn" disabled={enviando}>{enviando ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Guardar</button>
      </div>
    </form>
  );
}

// ───────────────────────── Panel derecho (perfil + detalle) ─────────────────────────
function Panel({ c, perfil, user, sel, item, ctx, acciones, onSel, onClose, recientes }) {
  const [menu, setMenu] = useState(false);
  const [editNombre, setEditNombre] = useState(false);
  const [nombre, setNombre] = useState(perfil?.nombre || "");
  const [editando, setEditando] = useState(false);
  const [aporte, setAporte] = useState("");
  const dark = (perfil?.tema ?? "dark") === "dark";

  useEffect(() => { setEditando(false); setAporte(""); }, [sel?.tipo, sel?.id]);
  useEffect(() => { setNombre(perfil?.nombre || ""); }, [perfil?.nombre]);

  const borrar = async () => {
    if (!window.confirm(`¿Eliminar "${TITULO[sel.tipo](item)}"? No se puede deshacer.`)) return;
    if (await acciones.borrar(sel.tipo, item.id)) onSel(null);
  };

  const opciones = [
    { icon: Pencil, t: "Editar nombre", f: () => setEditNombre(true) },
    { icon: dark ? Sun : Moon, t: dark ? "Tema claro" : "Tema oscuro", f: acciones.toggleTema },
    { icon: Upload, t: "Importar datos anteriores", f: acciones.importar },
    { icon: LogOut, t: "Cerrar sesión", f: acciones.salir, rojo: true },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Perfil */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: c.accentSoft, color: c.accent, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {iniDe(perfil?.nombre || user.email)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{perfil?.nombre}</div>
          <div style={{ fontSize: 11, color: c.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
        </div>
        <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="Opciones"><MoreVertical size={17} /></button>
        {onClose && <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>}
      </div>

      {menu && (
        <div className="card" style={{ padding: 6 }}>
          {opciones.map(({ icon: Icon, t, f, rojo }) => (
            <button key={t} className="nav" style={{ color: rojo ? c.red : c.ink }} onClick={() => { setMenu(false); f(); }}>
              <Icon size={15} /> {t}
            </button>
          ))}
        </div>
      )}

      {editNombre && (
        <form className="card" style={{ padding: 14, display: "flex", gap: 8 }}
          onSubmit={async (e) => { e.preventDefault(); if (!nombre.trim()) return; await acciones.editarNombre(nombre.trim()); setEditNombre(false); }}>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          <button className="btn" style={{ padding: 10 }}><Check size={14} /></button>
          <button type="button" className="icon-btn" onClick={() => setEditNombre(false)}><X size={15} /></button>
        </form>
      )}

      {/* Detalle o actividad */}
      {item ? (
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div className="sub">{ETIQUETA[sel.tipo]}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, wordBreak: "break-word" }}>{TITULO[sel.tipo](item)}</div>
            </div>
            <div style={{ display: "flex" }}>
              <button className="icon-btn" onClick={() => setEditando(!editando)} aria-label="Editar"><Pencil size={15} /></button>
              <button className="icon-btn" onClick={() => onSel(null)} aria-label="Cerrar detalle"><X size={15} /></button>
            </div>
          </div>

          {editando ? (
            <div style={{ marginTop: 18 }}>
              <FormRegistro key={sel.tipo + sel.id} c={c} tipo={sel.tipo} inicial={item} editar onCancel={() => setEditando(false)}
                onSubmit={async (p) => { if (await acciones.editar(sel.tipo, item.id, p)) setEditando(false); }} />
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 12px", marginTop: 22 }}>
                {DETALLE[sel.tipo](item, ctx).map(([l, val]) => (
                  <div key={l}>
                    <div style={{ fontSize: 12, color: c.muted }}>{l}</div>
                    <div style={{ fontSize: 15, color: c.ink, marginTop: 4, fontWeight: 600 }}>{val}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
                {sel.tipo === "gasto" && (
                  <button className="btn" onClick={() => acciones.togglePago(item)}>
                    {ctx.pagosMes.has(item.id) ? <><Circle size={14} /> Marcar pendiente</> : <><CheckCircle2 size={14} /> Marcar pagado ({ctx.mesCorto})</>}
                  </button>
                )}
                {sel.tipo === "prestamo" && (
                  <button className="btn" onClick={() => acciones.toggleDevuelto(item)}>
                    {item.devuelto ? "Marcar como pendiente" : <><CheckCircle2 size={14} /> Marcar devuelto</>}
                  </button>
                )}
                {sel.tipo === "meta" && item.monto_actual < item.monto_objetivo && (
                  <form style={{ display: "flex", gap: 8 }} onSubmit={async (e) => {
                    e.preventDefault();
                    const n = Math.round(Number(aporte));
                    if (!n) return;
                    if (await acciones.aportar(item, n)) setAporte("");
                  }}>
                    <input type="number" inputMode="numeric" placeholder="Aportar monto" value={aporte} onChange={(e) => setAporte(e.target.value)} />
                    <button className="btn"><Plus size={14} /> Aportar</button>
                  </form>
                )}
                <button className="btn danger" onClick={borrar}><Trash2 size={14} /> Eliminar</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="titulo" style={{ padding: "18px 20px 12px" }}>Últimos movimientos</div>
          {recientes.length === 0 ? <Vacio c={c} texto="Todavía no hay movimientos." /> : recientes.map((r) => (
            <div key={r.tipo + r.id} className="row" style={{ padding: "12px 20px" }} onClick={() => onSel(r.tipo, r.id)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.titulo}</div>
                <div style={{ fontSize: 11, color: c.muted }}>{fechaCL(r.fecha)}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: r.signo === "+" ? c.green : r.signo === "✓" ? c.muted : c.amber, whiteSpace: "nowrap" }}>
                {r.signo === "✓" ? "" : r.signo}{fmt(r.monto)}
              </div>
            </div>
          ))}
          <div style={{ padding: "12px 20px 16px", fontSize: 11, color: c.muted, borderTop: `1px solid ${c.line}` }}>
            Toca un registro para ver el detalle, editarlo o borrarlo.
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Pestañas ─────────────────────────
function Resumen({ c, setModal, setTab, seleccionar, ingresosMes, disponible, pendiente, porCobrar, ahorro, pagado, totalMes, serie, metas, gastos, pagosMes, onToggle, mesTxt }) {
  const pctPagado = totalMes > 0 ? Math.round((pagado / totalMes) * 100) : 0;
  const porPagar = gastos.filter((g) => !pagosMes.has(g.id));
  const metasTop = metas.slice(0, 3);
  const negativo = disponible < 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Lo principal: cuánto queda */}
      <section className="card" style={{ padding: "22px 22px 20px" }}>
        <div style={{ fontSize: 15, color: c.muted }}>{negativo ? "Te faltan" : "Te quedan"} en {mesTxt.toLowerCase()}</div>
        <div style={{ fontSize: "clamp(38px, 9vw, 52px)", fontWeight: 700, letterSpacing: "-.025em", lineHeight: 1.05, margin: "6px 0 10px", color: negativo ? c.red : c.ink }}>
          {fmt(Math.abs(disponible))}
        </div>
        <div style={{ fontSize: 14, color: c.muted, lineHeight: 1.5 }}>
          Entraron <b style={{ color: c.green, fontWeight: 600 }}>{fmt(ingresosMes)}</b> y tus gastos fijos del mes suman <b style={{ color: c.ink, fontWeight: 600 }}>{fmt(totalMes)}</b>.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          <button className="btn" onClick={() => setModal("ingreso")}><Plus size={15} /> Ingreso</button>
          <button className="btn ghost" onClick={() => setModal("gasto")}><Plus size={15} /> Gasto fijo</button>
          <button className="btn ghost" onClick={() => setModal("prestamo")}><Plus size={15} /> Préstamo</button>
          <button className="btn ghost" onClick={() => setModal("meta")}><Plus size={15} /> Meta</button>
        </div>
      </section>

      {/* Tres cifras secundarias en una sola franja */}
      <section className="card resumen-cifras" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", padding: 0 }}>
        {[
          { v: pendiente, l: "Por pagar", col: pendiente > 0 ? c.red : c.ink, t: "fijos" },
          { v: porCobrar, l: "Te deben", col: c.amber, t: "prestamos" },
          { v: ahorro, l: "Ahorrado", col: c.ink, t: "metas" },
        ].map((x, k) => (
          <button key={x.l} className="stat" onClick={() => setTab(x.t)} style={{ padding: "16px 18px", borderLeft: k ? `1px solid ${c.line}` : "none" }}>
            <span className="stat-l">{x.l}</span>
            <span className="stat-v" style={{ color: x.col }}>{fmt(x.v)}</span>
          </button>
        ))}
      </section>

      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Por pagar este mes: accionable */}
        <section className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px 12px" }}>
            <div className="titulo">Por pagar este mes</div>
            <div style={{ height: 6, background: c.card2, borderRadius: 3, margin: "12px 0 6px", overflow: "hidden" }}>
              <div style={{ width: pctPagado + "%", height: "100%", background: c.green, borderRadius: 3, transition: "width .4s" }} />
            </div>
            <div className="sub">Llevas pagado {fmt(pagado)} de {fmt(totalMes)} ({pctPagado}%)</div>
          </div>
          {porPagar.length === 0 ? (
            <div style={{ padding: "14px 20px 20px", borderTop: `1px solid ${c.line}`, fontSize: 14, color: gastos.length ? c.green : c.muted }}>
              {gastos.length ? "Todo pagado este mes." : "Agrega tus gastos fijos para llevar la cuenta."}
            </div>
          ) : porPagar.slice(0, 5).map((g) => (
            <div key={g.id} className="row" onClick={() => seleccionar("gasto", g.id)} style={{ padding: "11px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <button className="icon-btn" style={{ padding: 2 }} onClick={(e) => { e.stopPropagation(); onToggle(g); }} aria-label={"Marcar " + g.nombre + " como pagado"}>
                  <Circle size={20} />
                </button>
                <span style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.nombre}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(mensual(g))}</span>
            </div>
          ))}
          {porPagar.length > 5 && (
            <button className="icon-btn" style={{ margin: "4px 12px 12px", fontSize: 13 }} onClick={() => setTab("fijos")}>Ver los {porPagar.length}</button>
          )}
        </section>

        {/* Metas */}
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="titulo">Metas de ahorro</div>
            <button className="icon-btn" style={{ fontSize: 13 }} onClick={() => setTab("metas")}>Ver todas</button>
          </div>
          {metasTop.length === 0 ? (
            <div style={{ color: c.muted, fontSize: 14 }}>Crea una meta para ver cuánto te falta.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {metasTop.map((m) => {
                const pct = Math.min(100, Math.round((m.monto_actual / m.monto_objetivo) * 100));
                const ok = pct >= 100;
                return (
                  <button key={m.id} onClick={() => seleccionar("meta", m.id)} className="stat" style={{ gap: 6 }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                      <span style={{ fontWeight: 600 }}>{m.nombre}</span>
                      <span style={{ color: ok ? c.green : c.muted }}>{ok ? "Cumplida" : pct + "%"}</span>
                    </span>
                    <span style={{ display: "block", height: 6, background: c.card2, borderRadius: 3, overflow: "hidden" }}>
                      <span style={{ display: "block", width: pct + "%", height: "100%", background: ok ? c.green : c.accent, borderRadius: 3 }} />
                    </span>
                    <span className="sub">{fmt(m.monto_actual)} de {fmt(m.monto_objetivo)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Historial */}
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <div className="titulo">Ingresos y gastos pagados</div>
            <div className="sub" style={{ marginTop: 2 }}>Últimos 6 meses</div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <Leyenda c={c} color={c.green} texto="Ingresos" />
            <Leyenda c={c} color={c.red} texto="Gastos" />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={serie} margin={{ left: -10, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke={c.line} />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: c.muted }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 12, fill: c.muted }} axisLine={false} tickLine={false} width={56} />
            <Tooltip formatter={(v, n) => [fmt(v), n === "ingresos" ? "Ingresos" : "Gastos pagados"]}
              contentStyle={{ fontFamily: "Figtree", fontSize: 13, borderRadius: 10, border: `1px solid ${c.line}`, background: c.card, color: c.ink }}
              labelStyle={{ color: c.muted }} cursor={{ stroke: c.line }} />
            <Area type="monotone" dataKey="ingresos" stroke={c.green} strokeWidth={2} fill={c.green} fillOpacity={0.08} dot={false} activeDot={{ r: 4, fill: c.card, stroke: c.green, strokeWidth: 2 }} />
            <Area type="monotone" dataKey="gastos" stroke={c.red} strokeWidth={2} fill={c.red} fillOpacity={0.06} dot={false} activeDot={{ r: 4, fill: c.card, stroke: c.red, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

function CabeceraLista({ c, titulo, onAdd, extra }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 14px", gap: 10, flexWrap: "wrap" }}>
      <div className="titulo">{titulo}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {extra}
        <button className="btn" onClick={onAdd} style={{ padding: "8px 14px" }}><Plus size={14} /> Agregar</button>
      </div>
    </div>
  );
}

function GastosTab({ c, gastos, pagosMes, mesTxt, pagado, pendiente, totalMes, onToggle, onSel, sel, onAdd }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Cifras c={c} items={[{ l: "Total del mes", v: fmt(totalMes) }, { l: "Pagado", v: fmt(pagado), col: c.green }, { l: "Por pagar", v: fmt(pendiente), col: pendiente > 0 ? c.red : c.ink }]} />
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <CabeceraLista c={c} titulo={"Gastos de " + mesTxt.toLowerCase()} onAdd={onAdd} />
        {gastos.length === 0 ? <Vacio c={c} texto="Sin gastos obligatorios todavía." /> : gastos.map((g) => {
          const ok = pagosMes.has(g.id);
          return (
            <div key={g.id} className={`row ${sel?.tipo === "gasto" && sel.id === g.id ? "sel" : ""}`} onClick={() => onSel("gasto", g.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <button className="icon-btn" style={{ padding: 2 }} onClick={(e) => { e.stopPropagation(); onToggle(g); }} aria-label={ok ? "Marcar pendiente" : "Marcar pagado"}>
                  {ok ? <CheckCircle2 size={22} color={c.green} /> : <Circle size={22} color={c.muted} />}
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, textDecoration: ok ? "line-through" : "none", color: ok ? c.muted : c.ink }}>{g.nombre}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <span className="pill" style={{ background: c.card2, color: c.muted }}>{g.frecuencia}</span>
                    {g.frecuencia !== "Mensual" && <span style={{ fontSize: 11, color: c.muted }}>{fmt(mensual(g))}/mes</span>}
                  </div>
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>{fmt(g.monto)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IngresosTab({ c, ingresos, mes, onSel, sel, onAdd }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? ingresos : ingresos.filter((i) => i.fecha.slice(0, 7) === mes);
  const total = sum(lista.map((i) => i.monto));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Cifras c={c} items={[{ l: todos ? "Total histórico" : "Total del mes", v: fmt(total), col: c.green }, { l: "Registros", v: String(lista.length) }]} />
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <CabeceraLista c={c} titulo="Ingresos" onAdd={onAdd} extra={
          <button className="btn ghost" style={{ padding: "8px 12px" }} onClick={() => setTodos(!todos)}>{todos ? "Solo este mes" : "Ver todos"}</button>
        } />
        {lista.length === 0 ? <Vacio c={c} texto={todos ? "Sin ingresos registrados." : "Sin ingresos este mes."} /> : lista.map((i) => (
          <div key={i.id} className={`row ${sel?.tipo === "ingreso" && sel.id === i.id ? "sel" : ""}`} onClick={() => onSel("ingreso", i.id)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: c.greenSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <ArrowUpRight size={17} color={c.green} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{i.descripcion || "Ingreso"}</div>
                <div style={{ fontSize: 12, color: c.muted }}>{fechaCL(i.fecha)}</div>
              </div>
            </div>
            <div style={{ fontWeight: 700, color: c.green, whiteSpace: "nowrap" }}>+{fmt(i.monto)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrestamosTab({ c, prestamos, onToggle, onSel, sel, onAdd }) {
  const porCobrar = sum(prestamos.filter((p) => !p.devuelto).map((p) => p.monto));
  const devuelto = sum(prestamos.filter((p) => p.devuelto).map((p) => p.monto));
  const ordenados = [...prestamos].sort((a, b) => (a.devuelto === b.devuelto ? b.fecha.localeCompare(a.fecha) : a.devuelto ? 1 : -1));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Cifras c={c} items={[{ l: "Te deben", v: fmt(porCobrar), col: c.amber }, { l: "Ya devuelto", v: fmt(devuelto), col: c.green }]} />
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <CabeceraLista c={c} titulo="Préstamos" onAdd={onAdd} />
        {ordenados.length === 0 ? <Vacio c={c} texto="Sin préstamos registrados." /> : ordenados.map((p) => (
          <div key={p.id} className={`row ${sel?.tipo === "prestamo" && sel.id === p.id ? "sel" : ""}`} onClick={() => onSel("prestamo", p.id)} style={{ flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: p.devuelto ? c.greenSoft : c.amberSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {p.devuelto ? <ArrowDownLeft size={17} color={c.green} /> : <ArrowUpRight size={17} color={c.amber} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.a_quien}</div>
                <div style={{ fontSize: 12, color: c.muted }}>
                  {fechaCL(p.fecha)}{p.devuelto && p.fecha_devolucion ? `, devuelto el ${fechaCL(p.fecha_devolucion)}` : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: p.devuelto ? c.muted : c.ink, textDecoration: p.devuelto ? "line-through" : "none" }}>{fmt(p.monto)}</span>
              <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 12, color: p.devuelto ? c.green : c.muted, borderColor: p.devuelto ? c.green : c.line }}
                onClick={(e) => { e.stopPropagation(); onToggle(p); }}>
                {p.devuelto ? <><CheckCircle2 size={13} /> Devuelto</> : "Marcar devuelto"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetasTab({ c, metas, onAportar, onSel, sel, onAdd }) {
  const [aporte, setAporte] = useState({});
  const aportar = async (m) => {
    const v = Math.round(Number(aporte[m.id]));
    if (!v) return;
    if (await onAportar(m, v)) setAporte((a) => ({ ...a, [m.id]: "" }));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn" onClick={onAdd}><Plus size={14} /> Nueva meta</button>
      </div>
      {metas.length === 0 ? (
        <div className="card" style={{ color: c.muted, fontSize: 14 }}>Sin metas todavía. Crea la primera.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
          {metas.map((m) => {
            const pct = (m.monto_actual / m.monto_objetivo) * 100;
            const ok = pct >= 100;
            const activa = sel?.tipo === "meta" && sel.id === m.id;
            return (
              <div key={m.id} className="card" onClick={() => onSel("meta", m.id)} style={{ cursor: "pointer", outline: activa ? `2px solid ${c.accent}` : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15, alignSelf: "flex-start" }}>{m.nombre}</div>
                <Ring c={c} pct={pct} size={108} stroke={8} color={ok ? c.green : c.accent2}>
                  <span style={{ fontSize: 22, fontWeight: 700 }}>{Math.min(100, Math.round(pct))}%</span>
                  <span style={{ fontSize: 10, color: c.muted }}>{ok ? "cumplida" : "avance"}</span>
                </Ring>
                <div style={{ fontSize: 13, color: c.muted }}>{fmt(m.monto_actual)} de {fmt(m.monto_objetivo)}</div>
                {!ok ? (
                  <form style={{ display: "flex", gap: 8, width: "100%" }} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); aportar(m); }}>
                    <input type="number" inputMode="numeric" placeholder="Aportar" value={aporte[m.id] || ""} onChange={(e) => setAporte({ ...aporte, [m.id]: e.target.value })} />
                    <button className="btn ghost">Aportar</button>
                  </form>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: c.green, fontSize: 13, fontWeight: 600 }}><CheckCircle2 size={16} /> Meta cumplida</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Importador (datos de la v1 en localStorage) ─────────────────────────
const LS_PREFIX = "finanzasU:";
const SNIPPET = `copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith("finanzasU:")).map(k=>[k,JSON.parse(localStorage.getItem(k))]))))`;

function leerLocal() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(LS_PREFIX));
    if (!keys.length) return null;
    const obj = {};
    keys.forEach((k) => { try { obj[k] = JSON.parse(localStorage.getItem(k)); } catch { /* ignorar */ } });
    return obj;
  } catch {
    return null;
  }
}

function leerPersona(obj, i) {
  const g = (k) => obj[LS_PREFIX + k] ?? null;
  let r = { gastosFijos: g(`gastosFijos:${i}`), estadoPagos: g(`estadoPagos:${i}`), ingresos: g(`ingresos:${i}`), metas: g(`metas:${i}`), prestamos: g(`prestamos:${i}`) };
  // Llaves antiguas sin índice (solo persona 0), igual que en la v1
  if (i === 0 && !r.gastosFijos && !r.estadoPagos && !r.ingresos && !r.metas) {
    r = { gastosFijos: g("gastosFijos"), estadoPagos: g("estadoPagos"), ingresos: g("ingresos"), metas: g("metas"), prestamos: null };
  }
  return {
    gastosFijos: Array.isArray(r.gastosFijos) ? r.gastosFijos : [],
    estadoPagos: r.estadoPagos && typeof r.estadoPagos === "object" ? r.estadoPagos : {},
    ingresos: Array.isArray(r.ingresos) ? r.ingresos : [],
    metas: Array.isArray(r.metas) ? r.metas : [],
    prestamos: Array.isArray(r.prestamos) ? r.prestamos : [],
  };
}

function ImportarModal({ c, tieneDatos, onImport, onClose }) {
  const local = useMemo(leerLocal, []);
  const [obj, setObj] = useState(local);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [estado, setEstado] = useState(null); // null | "importando" | {resultado}
  const [copiado, setCopiado] = useState(false);

  const cargarTexto = () => {
    try {
      const o = JSON.parse(texto.trim());
      if (!o || typeof o !== "object" || !Object.keys(o).some((k) => k.startsWith(LS_PREFIX))) throw new Error();
      setObj(o);
      setError("");
    } catch {
      setError("Eso no parece la exportación de la app anterior. Revisa que copiaste todo.");
    }
  };

  const importar = async (i) => {
    if (tieneDatos && !window.confirm("Tu cuenta ya tiene datos. Lo importado se SUMA a lo que hay (puede duplicar registros). ¿Seguir?")) return;
    setEstado("importando");
    setError("");
    try {
      const r = await onImport(leerPersona(obj, i));
      setEstado(r);
    } catch (e) {
      setEstado(null);
      setError("Falló la importación: " + e.message);
    }
  };

  if (estado && estado !== "importando") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: c.green, fontWeight: 600 }}><CheckCircle2 size={18} /> Importación lista</div>
        <div style={{ fontSize: 14, color: c.muted, lineHeight: 1.7 }}>
          {estado.gastos} gastos · {estado.pagos} pagos marcados · {estado.ingresos} ingresos · {estado.prestamos} préstamos · {estado.metas} metas
        </div>
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    );
  }

  const personas = obj?.[LS_PREFIX + "config"]?.personas || ["Persona 1", "Persona 2"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
      {obj ? (
        <>
          <div style={{ color: c.muted }}>{local === obj ? "Encontré datos de la versión anterior en este navegador." : "Datos cargados."} ¿Cuál perfil es el tuyo?</div>
          {personas.map((nombre, i) => {
            const p = leerPersona(obj, i);
            const n = p.gastosFijos.length + p.ingresos.length + p.prestamos.length + p.metas.length;
            return (
              <button key={i} className="btn ghost" disabled={estado === "importando" || n === 0} onClick={() => importar(i)}
                style={{ justifyContent: "space-between", borderRadius: 12, padding: "14px 16px", color: c.ink }}>
                <span style={{ fontWeight: 600 }}>{nombre}</span>
                <span style={{ fontSize: 12, color: c.muted }}>{n === 0 ? "sin datos" : `${p.gastosFijos.length} gastos · ${p.ingresos.length} ingresos · ${p.prestamos.length} préstamos · ${p.metas.length} metas`}</span>
              </button>
            );
          })}
          {estado === "importando" && <div style={{ display: "flex", alignItems: "center", gap: 8, color: c.muted }}><Loader2 size={15} className="spin" /> Subiendo a Supabase…</div>}
        </>
      ) : (
        <>
          <div style={{ color: c.muted, lineHeight: 1.6 }}>
            No encontré datos anteriores en este navegador. Abre la app vieja en el PC, presiona <b>F12 → Consola</b>, pega esta línea y presiona Enter (queda copiado):
          </div>
          <div style={{ position: "relative" }}>
            <code style={{ display: "block", fontSize: 11, background: c.input, border: `1px solid ${c.line}`, borderRadius: 10, padding: "12px 40px 12px 12px", wordBreak: "break-all", color: c.ink }}>{SNIPPET}</code>
            <button className="icon-btn" style={{ position: "absolute", top: 6, right: 6 }} onClick={() => { navigator.clipboard?.writeText(SNIPPET); setCopiado(true); }}>
              {copiado ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div style={{ color: c.muted }}>Después pega aquí el resultado:</div>
          <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder='{"finanzasU:config": …}' />
          <button className="btn" disabled={!texto.trim()} onClick={cargarTexto}>Cargar datos</button>
        </>
      )}
      {error && <div style={{ fontSize: 13, padding: "10px 12px", borderRadius: 10, background: c.redSoft, color: c.red }}>{error}</div>}
    </div>
  );
}
