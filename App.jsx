import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const PASSCODE = "1234";
const SUPERVISORS = ["Ritesh", "Muzzamil", "Sanjeev", "Raju", "Deepak"];
const STATIONS = ["Receiving", "JB-51", "DR-31", "DR-32", "VM-40", "CNC-01", "CNC-02", "Grinding", "Inspection", "Dispatch"];
const STATUSES = ["Running", "WIP", "Complete", "Hold", "Pending"];
const STATUS_COLORS = { Running: "#22c55e", WIP: "#3b82f6", Complete: "#8b5cf6", Hold: "#ef4444", Pending: "#f59e0b" };
const ROUTING_OPS = ["OP-10 Rec", "OP-20 JB-51", "OP-30 DR-31", "OP-40 VM-40", "OP-50 Grinding", "OP-60 Inspection", "OP-70 Dispatch"];

// ─── SUPABASE SHIM ─────────────────────────────────────────────────────────
// Replace SUPABASE_URL and SUPABASE_KEY with your actual values
const SUPABASE_URL = "https://fsrknhittjbqtbersqjd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmtuaGl0dGpicXRiZXJzcWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MzA1ODAsImV4cCI6MjA5NjMwNjU4MH0.LxY1k1AfCTQpTxeVx-9RppYh4ESVP6kyNR8U3Y2Ng00";

async function sbFetch(path, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": opts.prefer || "return=representation",
    ...opts.headers
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  async getJobs() { return sbFetch("jobs?select=*&order=created_at.desc"); },
  async getJob(prodNo) { const r = await sbFetch(`jobs?production_number=eq.${prodNo}&select=*`); return r?.[0]; },
  async createJob(job) { return sbFetch("jobs", { method: "POST", body: JSON.stringify(job) }); },
  async updateJob(id, patch) { return sbFetch(`jobs?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch), prefer: "return=representation" }); },
  async getUpdates(jobId) { return sbFetch(`job_updates?job_id=eq.${jobId}&select=*&order=created_at.desc`); },
  async addUpdate(update) { return sbFetch("job_updates", { method: "POST", body: JSON.stringify(update) }); },
  async getAllUpdates() { return sbFetch("job_updates?select=*&order=created_at.desc&limit=200"); },
};

// ─── LOCAL DEMO STORE (when Supabase not configured) ──────────────────────
const DEMO_MODE = SUPABASE_URL.includes("YOUR_PROJECT");
let localJobs = [
  { id: "j1", production_number: "100031646", material_number: "M161501", description: "Wheel head body for dia 50", quantity: "3 Nos", printed_date: "2025-06-01", start_date: "2025-06-02", end_date: "2025-06-10", routing: ["OP-10 Rec","OP-20 JB-51","OP-30 DR-31","OP-60 Inspection"], current_station: "JB-51", current_status: "Running", created_at: new Date().toISOString() },
  { id: "j2", production_number: "100031647", material_number: "M161502", description: "Spindle housing 80mm", quantity: "5 Nos", printed_date: "2025-06-01", start_date: "2025-06-03", end_date: "2025-06-12", routing: ["OP-10 Rec","OP-20 JB-51","OP-50 Grinding"], current_station: "Receiving", current_status: "Pending", created_at: new Date().toISOString() },
  { id: "j3", production_number: "100031640", material_number: "M161490", description: "Bearing block assembly", quantity: "10 Nos", printed_date: "2025-05-28", start_date: "2025-05-29", end_date: "2025-06-05", routing: ["OP-10 Rec","OP-30 DR-31","OP-70 Dispatch"], current_station: "Inspection", current_status: "WIP", created_at: new Date().toISOString() },
];
let localUpdates = [
  { id: "u1", job_id: "j1", supervisor: "Ritesh", station: "JB-51", status: "Running", notes: "Setup done, machining in progress", created_at: new Date(Date.now()-3600000).toISOString() },
  { id: "u2", job_id: "j3", supervisor: "Muzzamil", station: "Inspection", status: "WIP", notes: "Final QA check pending", created_at: new Date(Date.now()-7200000).toISOString() },
];

const localDB = {
  async getJobs() { return [...localJobs]; },
  async getJob(prodNo) { return localJobs.find(j => j.production_number === prodNo) || null; },
  async createJob(job) { const j = { ...job, id: "j" + Date.now(), created_at: new Date().toISOString() }; localJobs.unshift(j); return j; },
  async updateJob(id, patch) { localJobs = localJobs.map(j => j.id === id ? { ...j, ...patch } : j); return localJobs.find(j => j.id === id); },
  async getUpdates(jobId) { return localUpdates.filter(u => u.job_id === jobId).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)); },
  async addUpdate(update) { const u = { ...update, id: "u" + Date.now(), created_at: new Date().toISOString() }; localUpdates.unshift(u); return u; },
  async getAllUpdates() { return [...localUpdates].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)); },
};
const DATA = DEMO_MODE ? localDB : db;

// ─── QR CODE GENERATOR (simple, no lib) ───────────────────────────────────
function generateQRDataURL(text) {
  // We'll use a public QR API via img src
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
}

// ─── HELPERS ───────────────────────────────────────────────────────────────
function agingDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const days = Math.floor((end - start) / 86400000);
  return days;
}
function overdueDays(endDate) {
  const d = agingDays(endDate, null);
  return d > 0 ? d : 0;
}
function fmt(dt) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", color: "#e8e2d4", fontFamily: "'IBM Plex Mono', 'Courier New', monospace" },
  nav: { background: "#1a1a1a", borderBottom: "1px solid #2a2a2a", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 },
  navTitle: { fontSize: 13, fontWeight: 700, letterSpacing: "0.15em", color: "#d4a853", textTransform: "uppercase" },
  navTabs: { display: "flex", gap: 4 },
  tab: (active) => ({ background: active ? "#d4a853" : "transparent", color: active ? "#0f0f0f" : "#888", border: `1px solid ${active ? "#d4a853" : "#333"}`, borderRadius: 4, padding: "5px 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", fontWeight: active ? 700 : 400, letterSpacing: "0.08em", textTransform: "uppercase" }),
  card: { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "16px" },
  input: { background: "#111", border: "1px solid #333", borderRadius: 4, padding: "8px 12px", color: "#e8e2d4", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, width: "100%", boxSizing: "border-box" },
  select: { background: "#111", border: "1px solid #333", borderRadius: 4, padding: "8px 12px", color: "#e8e2d4", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, width: "100%", boxSizing: "border-box" },
  btn: (variant = "primary") => ({
    background: variant === "primary" ? "#d4a853" : variant === "danger" ? "#7f1d1d" : "#222",
    color: variant === "primary" ? "#0f0f0f" : "#e8e2d4",
    border: variant === "ghost" ? "1px solid #333" : "none",
    borderRadius: 4, padding: "10px 18px", fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase"
  }),
  label: { fontSize: 10, color: "#888", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4, display: "block" },
  statusPill: (s) => ({ display: "inline-block", padding: "2px 10px", borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: STATUS_COLORS[s] + "22", color: STATUS_COLORS[s], border: `1px solid ${STATUS_COLORS[s]}44` }),
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#888", marginBottom: 12, borderBottom: "1px solid #222", paddingBottom: 8 },
};

// ─── PASSCODE GATE ─────────────────────────────────────────────────────────
function PasscodeGate({ onUnlock }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  function submit() {
    if (code === PASSCODE) {
      onUnlock();
    } else {
      setError(true); setShake(true);
      setTimeout(() => setShake(false), 400);
      setTimeout(() => setCode(""), 300);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...S.card, maxWidth: 320, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚙️</div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", color: "#d4a853", textTransform: "uppercase", marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>SHOP TRACKER</div>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 24, fontFamily: "monospace" }}>HMLV MACHINE SHOP — v1.0</div>
        <div style={{ animation: shake ? "shake 0.3s" : "none" }}>
          <input
            style={{ ...S.input, textAlign: "center", fontSize: 22, letterSpacing: "0.4em", marginBottom: 12 }}
            type="password" maxLength={6} value={code}
            onChange={e => { setCode(e.target.value); setError(false); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="••••"
            autoFocus
          />
          {error && <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 8, fontFamily: "monospace" }}>INVALID PASSCODE</div>}
          <button style={{ ...S.btn("primary"), width: "100%" }} onClick={submit}>ENTER</button>
        </div>
        <div style={{ fontSize: 10, color: "#444", marginTop: 16, fontFamily: "monospace" }}>DEFAULT: 1234</div>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

// ─── QR SCANNER (HTML5) ────────────────────────────────────────────────────
function QRScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const [status, setStatus] = useState("Starting camera…");
  const [hasLib, setHasLib] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
    script.onload = () => setHasLib(true);
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  useEffect(() => {
    if (!hasLib) return;
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (!active) return;
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        video.play();
        video.onloadedmetadata = () => {
          setStatus("Point camera at QR code");
          const canvas = canvasRef.current;
          function scan() {
            if (!active) return;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(video, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = window.jsQR?.(img.data, img.width, img.height);
              if (code?.data) {
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                onResult(code.data);
                return;
              }
            }
            animRef.current = requestAnimationFrame(scan);
          }
          scan();
        };
      })
      .catch(() => setStatus("Camera access denied"));
    return () => {
      active = false;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [hasLib]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 200, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#d4a853", fontFamily: "monospace", fontSize: 11, letterSpacing: "0.15em" }}>SCANNING QR</span>
        <button onClick={onClose} style={{ background: "none", border: "1px solid #444", color: "#aaa", borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>✕ CLOSE</button>
      </div>
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <div style={{ position: "absolute", width: 220, height: 220, border: "2px solid #d4a853", borderRadius: 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}>
          <div style={{ position: "absolute", top: -2, left: -2, width: 20, height: 20, borderTop: "3px solid #d4a853", borderLeft: "3px solid #d4a853" }} />
          <div style={{ position: "absolute", top: -2, right: -2, width: 20, height: 20, borderTop: "3px solid #d4a853", borderRight: "3px solid #d4a853" }} />
          <div style={{ position: "absolute", bottom: -2, left: -2, width: 20, height: 20, borderBottom: "3px solid #d4a853", borderLeft: "3px solid #d4a853" }} />
          <div style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderBottom: "3px solid #d4a853", borderRight: "3px solid #d4a853" }} />
        </div>
      </div>
      <div style={{ padding: 16, textAlign: "center", color: "#888", fontFamily: "monospace", fontSize: 12 }}>{status}</div>
    </div>
  );
}

// ─── UPDATE FORM ───────────────────────────────────────────────────────────
function UpdateForm({ job, onSaved, onCancel }) {
  const [supervisor, setSupervisor] = useState(SUPERVISORS[0]);
  const [station, setStation] = useState(job?.current_station || STATIONS[0]);
  const [status, setStatus] = useState(job?.current_status || "Running");
  const [notes, setNotes] = useState("");
  const [dt, setDt] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await DATA.addUpdate({ job_id: job.id, supervisor, station, status, notes, created_at: new Date(dt).toISOString() });
      await DATA.updateJob(job.id, { current_station: station, current_status: status, last_updated: new Date(dt).toISOString() });
      setDone(true);
      if (navigator.vibrate) navigator.vibrate(200);
      setTimeout(() => onSaved(), 1200);
    } catch (e) { alert("Save failed: " + e.message); }
    setSaving(false);
  }

  if (done) return (
    <div style={{ ...S.card, textAlign: "center", padding: 32 }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
      <div style={{ color: "#22c55e", fontFamily: "monospace", fontSize: 13, letterSpacing: "0.1em" }}>UPDATE SAVED</div>
    </div>
  );

  return (
    <div style={S.card}>
      <div style={{ ...S.sectionTitle }}>Job: {job.production_number}</div>
      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 16, fontFamily: "monospace" }}>{job.description} · {job.quantity}</div>

      {[["Supervisor", <select style={S.select} value={supervisor} onChange={e => setSupervisor(e.target.value)}>
        {SUPERVISORS.map(s => <option key={s}>{s}</option>)}
      </select>],
      ["Station / Work Center", <select style={S.select} value={station} onChange={e => setStation(e.target.value)}>
        {STATIONS.map(s => <option key={s}>{s}</option>)}
      </select>],
      ["Status", <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STATUSES.map(s => <button key={s} onClick={() => setStatus(s)} style={{ padding: "6px 12px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", border: `1px solid ${STATUS_COLORS[s]}`, background: status === s ? STATUS_COLORS[s] : STATUS_COLORS[s] + "22", color: status === s ? "#0f0f0f" : STATUS_COLORS[s] }}>{s}</button>)}
      </div>],
      ["Notes / QA Details", <textarea style={{ ...S.input, minHeight: 72, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter floor notes, QA remarks…" />],
      ["Date & Time", <input style={S.input} type="datetime-local" value={dt} onChange={e => setDt(e.target.value)} />]
      ].map(([lbl, el]) => <div key={lbl} style={{ marginBottom: 14 }}><label style={S.label}>{lbl}</label>{el}</div>)}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button style={{ ...S.btn("primary"), flex: 1 }} onClick={save} disabled={saving}>{saving ? "SAVING…" : "UPDATE"}</button>
        <button style={{ ...S.btn("ghost") }} onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  );
}

// ─── SCANNER PAGE ──────────────────────────────────────────────────────────
function ScannerPage({ onJobFound }) {
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function lookupJob(code) {
    setLoading(true); setErr("");
    try {
      const job = await DATA.getJob(code.trim());
      if (job) onJobFound(job);
      else setErr(`No job found for: ${code}`);
    } catch (e) { setErr("Lookup failed: " + e.message); }
    setLoading(false);
  }

  return (
    <div style={{ padding: 16 }}>
      {scanning && <QRScanner onResult={code => { setScanning(false); lookupJob(code); }} onClose={() => setScanning(false)} />}
      <div style={{ ...S.card, marginBottom: 16, textAlign: "center", padding: 28 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#888", letterSpacing: "0.12em", marginBottom: 16 }}>SCAN JOB CARD QR CODE</div>
        <button style={{ ...S.btn("primary"), width: "100%", padding: "14px 18px", fontSize: 13 }} onClick={() => setScanning(true)}>
          ▣  SCAN QR CODE
        </button>
      </div>

      <div style={{ ...S.card }}>
        <div style={S.sectionTitle}>Manual Entry</div>
        <label style={S.label}>Production Number</label>
        <input style={{ ...S.input, marginBottom: 10 }} value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === "Enter" && lookupJob(manual)} placeholder="e.g. 100031646" />
        {err && <div style={{ color: "#ef4444", fontSize: 11, fontFamily: "monospace", marginBottom: 8 }}>{err}</div>}
        <button style={{ ...S.btn("primary"), width: "100%" }} onClick={() => lookupJob(manual)} disabled={loading || !manual}>
          {loading ? "LOOKING UP…" : "FIND JOB"}
        </button>
      </div>
    </div>
  );
}

// ─── JOB DETAIL + UPDATE ───────────────────────────────────────────────────
function JobDetailPage({ job: initialJob, onBack }) {
  const [job, setJob] = useState(initialJob);
  const [updates, setUpdates] = useState([]);
  const [showForm, setShowForm] = useState(true);
  const [tab, setTab] = useState("update");

  useEffect(() => { DATA.getUpdates(job.id).then(setUpdates); }, [job.id]);

  async function reload() {
    const j = await DATA.getJob(job.production_number);
    if (j) setJob(j);
    const u = await DATA.getUpdates(job.id);
    setUpdates(u);
    setShowForm(false);
    setTab("history");
  }

  const opsDone = (job.routing || []).filter(op => {
    const stMap = { "OP-10 Rec": "Receiving", "OP-20 JB-51": "JB-51", "OP-30 DR-31": "DR-31", "OP-40 VM-40": "VM-40", "OP-50 Grinding": "Grinding", "OP-60 Inspection": "Inspection", "OP-70 Dispatch": "Dispatch" };
    const stationIdx = STATIONS.indexOf(job.current_station);
    const opStation = stMap[op];
    return STATIONS.indexOf(opStation) <= stationIdx;
  });

  return (
    <div style={{ padding: 16 }}>
      <button onClick={onBack} style={{ ...S.btn("ghost"), marginBottom: 12, fontSize: 11 }}>← BACK TO SCANNER</button>

      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#d4a853" }}>{job.production_number}</div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#888" }}>{job.material_number}</div>
          </div>
          <span style={S.statusPill(job.current_status || "Pending")}>{job.current_status || "Pending"}</span>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#ccc", marginBottom: 8 }}>{job.description}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#666", fontFamily: "monospace" }}>
          <span>QTY: {job.quantity}</span>
          <span>START: {fmtDate(job.start_date)}</span>
          <span>DUE: {fmtDate(job.end_date)}</span>
        </div>

        {/* Routing Progress */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Routing Progress</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(job.routing || []).map((op, i) => {
              const done = opsDone.includes(op);
              const current = op.toLowerCase().includes((job.current_station || "").toLowerCase());
              return <span key={i} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 3, fontFamily: "monospace", fontWeight: 700, border: `1px solid ${done ? "#22c55e44" : current ? "#d4a853" : "#222"}`, background: done ? "#22c55e22" : current ? "#d4a85322" : "#111", color: done ? "#22c55e" : current ? "#d4a853" : "#444" }}>{op}</span>;
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, margin: "12px 0" }}>
        {["update", "history"].map(t => <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
      </div>

      {tab === "update" && <UpdateForm job={job} onSaved={reload} onCancel={onBack} />}
      {tab === "history" && (
        <div style={S.card}>
          <div style={S.sectionTitle}>Update History</div>
          {updates.length === 0 && <div style={{ color: "#555", fontFamily: "monospace", fontSize: 12 }}>No updates yet</div>}
          {updates.map(u => (
            <div key={u.id} style={{ borderLeft: `2px solid ${STATUS_COLORS[u.status] || "#333"}`, paddingLeft: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#d4a853" }}>{u.station}</span>
                <span style={S.statusPill(u.status)}>{u.status}</span>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#888" }}>{u.supervisor} · {fmt(u.created_at)}</div>
              {u.notes && <div style={{ fontFamily: "monospace", fontSize: 11, color: "#ccc", marginTop: 4 }}>{u.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD ─────────────────────────────────────────────────────────────
function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);

  async function load() {
    setLoading(true);
    const [j, u] = await Promise.all([DATA.getJobs(), DATA.getAllUpdates()]);
    setJobs(j || []);
    setUpdates(u || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const shown = jobs.filter(j => {
    if (filter !== "All" && j.current_status !== filter) return false;
    if (search && !j.production_number.includes(search) && !j.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {};
  STATUSES.forEach(s => counts[s] = jobs.filter(j => j.current_status === s).length);

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "#555", fontFamily: "monospace", fontSize: 12 }}>LOADING…</div>;

  if (selectedJob) {
    const job = jobs.find(j => j.id === selectedJob);
    const jobUpdates = updates.filter(u => u.job_id === selectedJob);
    return (
      <div style={{ padding: 16 }}>
        <button onClick={() => setSelectedJob(null)} style={{ ...S.btn("ghost"), marginBottom: 12, fontSize: 11 }}>← BACK TO DASHBOARD</button>
        <div style={S.card}>
          <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#d4a853", marginBottom: 4 }}>{job.production_number}</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#aaa", marginBottom: 12 }}>{job.description} · {job.quantity}</div>
          {[["Material", job.material_number], ["Start Date", fmtDate(job.start_date)], ["End Date", fmtDate(job.end_date)], ["Station", job.current_station || "—"], ["Status", job.current_status || "—"], ["Aging Days", agingDays(job.start_date) + " days"]].map(([k, v]) =>
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1e1e1e", fontFamily: "monospace", fontSize: 12 }}>
              <span style={{ color: "#666" }}>{k}</span>
              <span style={{ color: "#e8e2d4" }}>{v}</span>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Movement Log</div>
            {jobUpdates.length === 0 && <div style={{ color: "#444", fontFamily: "monospace", fontSize: 11 }}>No updates</div>}
            {jobUpdates.map(u => (
              <div key={u.id} style={{ borderLeft: `2px solid ${STATUS_COLORS[u.status] || "#333"}`, paddingLeft: 10, marginBottom: 12 }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#d4a853" }}>{u.station} <span style={S.statusPill(u.status)}>{u.status}</span></div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#888" }}>{u.supervisor} · {fmt(u.created_at)}</div>
                {u.notes && <div style={{ fontFamily: "monospace", fontSize: 11, color: "#bbb", marginTop: 2 }}>{u.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 16 }}>
        {[["Total Jobs", jobs.length, "#d4a853"], ["Running", counts.Running || 0, "#22c55e"], ["On Hold", counts.Hold || 0, "#ef4444"], ["Complete", counts.Complete || 0, "#8b5cf6"]].map(([l, v, c]) => (
          <div key={l} style={{ ...S.card, padding: "12px 14px" }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#666", letterSpacing: "0.1em", textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <input style={{ ...S.input, marginBottom: 10 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search job / description…" />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
        {["All", ...STATUSES].map(s => <button key={s} style={S.tab(filter === s)} onClick={() => setFilter(s)}>{s}</button>)}
      </div>

      {shown.map(job => {
        const overdue = overdueDays(job.end_date);
        return (
          <div key={job.id} style={{ ...S.card, marginBottom: 10, cursor: "pointer" }} onClick={() => setSelectedJob(job.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#d4a853" }}>{job.production_number}</span>
              <span style={S.statusPill(job.current_status || "Pending")}>{job.current_status || "Pending"}</span>
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#aaa", marginBottom: 6 }}>{job.description}</div>
            <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#666", fontFamily: "monospace" }}>
              <span>📍 {job.current_station || "—"}</span>
              <span>QTY: {job.quantity}</span>
              {overdue > 0 && <span style={{ color: "#ef4444" }}>⚠ {overdue}d OVERDUE</span>}
            </div>
            {(job.routing || []).length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 3 }}>
                {(job.routing || []).map((op, i) => {
                  const stMap = { "OP-10 Rec": "Receiving", "OP-20 JB-51": "JB-51", "OP-30 DR-31": "DR-31", "OP-40 VM-40": "VM-40", "OP-50 Grinding": "Grinding", "OP-60 Inspection": "Inspection", "OP-70 Dispatch": "Dispatch" };
                  const done = STATIONS.indexOf(stMap[op]) <= STATIONS.indexOf(job.current_station);
                  return <div key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: done ? "#22c55e" : "#222" }} />;
                })}
              </div>
            )}
          </div>
        );
      })}
      {shown.length === 0 && <div style={{ color: "#444", fontFamily: "monospace", fontSize: 12, textAlign: "center", padding: 32 }}>No jobs found</div>}
    </div>
  );
}

// ─── JOB CARD CREATOR + PRINT ──────────────────────────────────────────────
function JobCardManager() {
  const [jobs, setJobs] = useState([]);
  const [mode, setMode] = useState("list");
  const [printJob, setPrintJob] = useState(null);
  const [form, setForm] = useState({ production_number: "", material_number: "", description: "", quantity: "", start_date: "", end_date: "", routing: ["OP-10 Rec", "OP-20 JB-51", "OP-30 DR-31"] });
  const [saving, setSaving] = useState(false);

  useEffect(() => { DATA.getJobs().then(setJobs); }, []);

  function toggleRoute(op) {
    setForm(f => ({ ...f, routing: f.routing.includes(op) ? f.routing.filter(x => x !== op) : [...f.routing, op] }));
  }

  async function create() {
    if (!form.production_number) return;
    setSaving(true);
    const job = await DATA.createJob({ ...form, printed_date: new Date().toISOString().slice(0, 10), current_status: "Pending", current_station: "Receiving" });
    setJobs(prev => [job, ...prev]);
    setMode("list");
    setSaving(false);
  }

  if (printJob) return <PrintView job={printJob} onClose={() => setPrintJob(null)} />;

  if (mode === "create") return (
    <div style={{ padding: 16 }}>
      <button onClick={() => setMode("list")} style={{ ...S.btn("ghost"), marginBottom: 12, fontSize: 11 }}>← BACK</button>
      <div style={S.card}>
        <div style={S.sectionTitle}>New Job Card</div>
        {[["Production Number *", "production_number", "100031646"],
          ["Material Number", "material_number", "M161501"],
          ["Description", "description", "Wheel head body for dia 50"],
          ["Quantity", "quantity", "3 Nos"],
          ["Start Date", "start_date", ""],
          ["Expected End Date", "end_date", ""]].map(([lbl, key, ph]) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <label style={S.label}>{lbl}</label>
            <input style={S.input} type={key.includes("date") ? "date" : "text"} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} />
          </div>
        ))}
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Routing Operations</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ROUTING_OPS.map(op => <button key={op} onClick={() => toggleRoute(op)} style={{ padding: "5px 10px", fontSize: 10, fontFamily: "monospace", cursor: "pointer", borderRadius: 3, border: "1px solid #333", background: form.routing.includes(op) ? "#d4a85333" : "#111", color: form.routing.includes(op) ? "#d4a853" : "#666", fontWeight: form.routing.includes(op) ? 700 : 400 }}>{op}</button>)}
          </div>
        </div>
        <button style={{ ...S.btn("primary"), width: "100%" }} onClick={create} disabled={saving}>{saving ? "CREATING…" : "CREATE JOB CARD"}</button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ ...S.sectionTitle, margin: 0 }}>Job Cards</div>
        <button style={S.btn("primary")} onClick={() => setMode("create")}>+ NEW JOB</button>
      </div>
      {jobs.map(job => (
        <div key={job.id} style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#d4a853", fontSize: 13 }}>{job.production_number}</span>
            <button style={{ ...S.btn("ghost"), fontSize: 10, padding: "4px 10px" }} onClick={() => setPrintJob(job)}>🖨 PRINT</button>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#aaa" }}>{job.description} · {job.quantity}</div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#555", marginTop: 4 }}>
            {(job.routing || []).join(" → ")}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PRINT VIEW ────────────────────────────────────────────────────────────
function PrintView({ job, onClose }) {
  const qrUrl = generateQRDataURL(job.production_number);

  function print() { window.print(); }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button style={S.btn("ghost")} onClick={onClose}>← BACK</button>
        <button style={S.btn("primary")} onClick={print}>🖨 PRINT / SAVE PDF</button>
      </div>

      <div id="print-card" style={{ background: "#fff", color: "#000", border: "2px solid #000", borderRadius: 6, padding: 20, fontFamily: "'Courier New', monospace", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>SHOP TRACKER — JOB CARD</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{job.production_number}</div>
            <div style={{ fontSize: 11, color: "#555" }}>Printed: {fmtDate(job.printed_date || new Date())}</div>
          </div>
          <img src={qrUrl} alt="QR" style={{ width: 80, height: 80 }} />
        </div>
        <div style={{ borderTop: "1px solid #000", paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
          {[["Material", job.material_number], ["Description", job.description], ["Quantity", job.quantity], ["Start Date", fmtDate(job.start_date)], ["End Date", fmtDate(job.end_date)]].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888" }}>{k}</div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{v || "—"}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, borderTop: "1px solid #ccc", paddingTop: 8 }}>
          <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888", marginBottom: 6 }}>Routing</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(job.routing || []).map((op, i) => <span key={i} style={{ fontSize: 10, padding: "2px 8px", border: "1px solid #000", borderRadius: 3 }}>{op}</span>)}
          </div>
        </div>
        <div style={{ marginTop: 12, borderTop: "1px solid #ccc", paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {["Operator", "Station", "Sign"].map(f => <div key={f}><div style={{ fontSize: 8, textTransform: "uppercase", color: "#888", marginBottom: 16 }}>{f}</div><div style={{ borderBottom: "1px solid #000" }} /></div>)}
        </div>
      </div>

      <style>{`@media print { body > *:not(#print-card) { display: none; } #print-card { border: none; } }`}</style>
    </div>
  );
}

// ─── ROUTING MASTER ────────────────────────────────────────────────────────
function RoutingMaster() {
  return (
    <div style={{ padding: 16 }}>
      <div style={S.sectionTitle}>Work Centers & Routing</div>
      <div style={{ display: "grid", gap: 8 }}>
        {STATIONS.map((s, i) => (
          <div key={s} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 4, background: "#d4a85322", border: "1px solid #d4a85344", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#d4a853" }}>{i + 1}</div>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{s}</div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#555" }}>Work Center · Active</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...S.sectionTitle, marginTop: 20 }}>Supervisors</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {SUPERVISORS.map(s => (
          <div key={s} style={{ ...S.card, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#333", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#d4a853" }}>{s[0]}</div>
            <span style={{ fontFamily: "monospace", fontSize: 12 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SUPABASE SETUP HELPER ─────────────────────────────────────────────────
function SetupHelper() {
  const sql = `-- Run this in Supabase SQL Editor
create table jobs (
  id uuid primary key default gen_random_uuid(),
  production_number text unique not null,
  material_number text,
  description text,
  quantity text,
  printed_date date,
  start_date date,
  end_date date,
  routing text[],
  current_station text,
  current_status text default 'Pending',
  last_updated timestamptz,
  created_at timestamptz default now()
);

create table job_updates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  supervisor text,
  station text,
  status text,
  notes text,
  created_at timestamptz default now()
);

alter table jobs enable row level security;
alter table job_updates enable row level security;

create policy "public_read_write" on jobs for all using (true) with check (true);
create policy "public_read_write" on job_updates for all using (true) with check (true);`;

  return (
    <div style={{ padding: 16 }}>
      <div style={S.sectionTitle}>⚡ Connect to Supabase (Live Sync)</div>
      <div style={{ ...S.card, marginBottom: 12 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#aaa", lineHeight: 1.7 }}>
          <div style={{ color: "#22c55e", fontWeight: 700, marginBottom: 8 }}>✓ DEMO MODE ACTIVE — all data is local to this browser</div>
          To enable real-time sync across all phones and desktops:
          <ol style={{ paddingLeft: 18, marginTop: 8, color: "#888" }}>
            <li style={{ marginBottom: 4 }}>Go to <a href="https://supabase.com" target="_blank" style={{ color: "#d4a853" }}>supabase.com</a> → Create free project</li>
            <li style={{ marginBottom: 4 }}>Go to SQL Editor → paste the schema below → Run</li>
            <li style={{ marginBottom: 4 }}>Go to Settings → API → copy Project URL and anon key</li>
            <li style={{ marginBottom: 4 }}>In the app code, replace <code style={{ color: "#d4a853" }}>SUPABASE_URL</code> and <code style={{ color: "#d4a853" }}>SUPABASE_KEY</code></li>
            <li>Deploy to <a href="https://vercel.com" target="_blank" style={{ color: "#d4a853" }}>vercel.com</a> (free) → share URL with all phones</li>
          </ol>
        </div>
      </div>
      <div style={S.sectionTitle}>SQL Schema</div>
      <pre style={{ background: "#111", border: "1px solid #222", borderRadius: 6, padding: 14, fontSize: 10, fontFamily: "monospace", color: "#a8c5a0", overflowX: "auto", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{sql}</pre>
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [page, setPage] = useState("scan");
  const [job, setJob] = useState(null);

  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />;

  const TABS = [
    { id: "scan", label: "SCAN" },
    { id: "dashboard", label: "DASH" },
    { id: "jobs", label: "JOBS" },
    { id: "routing", label: "SETUP" },
  ];

  function handleJobFound(j) {
    setJob(j);
    setPage("job");
  }

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={S.nav}>
        <div style={S.navTitle}>⚙ SHOPTRACK</div>
        <div style={S.navTabs}>
          {TABS.map(t => <button key={t.id} style={S.tab(page === t.id || (page === "job" && t.id === "scan"))} onClick={() => { setPage(t.id); setJob(null); }}>{t.label}</button>)}
        </div>
      </div>

      {(page === "scan" || page === "job") && !job && <ScannerPage onJobFound={handleJobFound} />}
      {page === "job" && job && <JobDetailPage job={job} onBack={() => { setJob(null); setPage("scan"); }} />}
      {page === "dashboard" && <Dashboard />}
      {page === "jobs" && <JobCardManager />}
      {page === "routing" && (
        <div>
          <RoutingMaster />
          {DEMO_MODE && <SetupHelper />}
        </div>
      )}
    </div>
  );
}
