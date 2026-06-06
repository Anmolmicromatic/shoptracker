import { useState, useEffect, useRef } from "react";

// ─── HARDCODED FALLBACKS ───────────────────────────────────────────────────
const DEFAULT_STATIONS = ["Receiving","JB-51","DR-31","DR-32","VM-40","CNC-01","CNC-02","Grinding","Inspection","Dispatch"];
const DEFAULT_SUPERVISORS = ["Ritesh","Muzzamil","Sanjeev","Raju","Deepak"];
const PASSCODE = "1234";
const STATUSES = ["Running","WIP","Complete","Hold","Pending"];
const STATUS_COLORS = { Running:"#22c55e", WIP:"#3b82f6", Complete:"#8b5cf6", Hold:"#ef4444", Pending:"#f59e0b" };
const ROUTING_OPS = ["OP-10 Rec","OP-20 JB-51","OP-30 DR-31","OP-40 VM-40","OP-50 Grinding","OP-60 Inspection","OP-70 Dispatch"];

// ─── SUPABASE ──────────────────────────────────────────────────────────────
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
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  async getJobs() { return sbFetch("jobs?select=*&order=created_at.desc"); },
  async getJob(prodNo) { const r = await sbFetch(`jobs?production_number=eq.${encodeURIComponent(prodNo)}&select=*`); return r?.[0]; },
  async createJob(job) { return sbFetch("jobs", { method:"POST", body:JSON.stringify(job) }); },
  async updateJob(id, patch) { return sbFetch(`jobs?id=eq.${id}`, { method:"PATCH", body:JSON.stringify(patch), prefer:"return=representation" }); },
  async getUpdates(jobId) { return sbFetch(`job_updates?job_id=eq.${jobId}&select=*&order=created_at.desc`); },
  async addUpdate(u) { return sbFetch("job_updates", { method:"POST", body:JSON.stringify(u) }); },
  async getAllUpdates() { return sbFetch("job_updates?select=*&order=created_at.desc&limit=200"); },
  async bulkInsertPO(rows) { return sbFetch("production_orders", { method:"POST", body:JSON.stringify(rows), prefer:"return=minimal" }); },
  async bulkInsertRouting(rows) { return sbFetch("routing_master", { method:"POST", body:JSON.stringify(rows), prefer:"return=minimal" }); },
  async getSettings() { return sbFetch("app_settings?select=*"); },
  async saveSetting(key, value) {
    await sbFetch(`app_settings?key=eq.${key}`, { method:"DELETE", prefer:"return=minimal" });
    return sbFetch("app_settings", { method:"POST", body:JSON.stringify({ key, value:JSON.stringify(value) }) });
  },
};

const DEMO_MODE = SUPABASE_URL.includes("YOUR_PROJECT");
let localJobs = [
  { id:"j1", production_number:"100031646", material_number:"M161501", description:"Wheel head body for dia 50", quantity:"3 Nos", printed_date:"2025-06-01", start_date:"2025-06-02", end_date:"2025-06-10", routing:["OP-10 Rec","OP-20 JB-51","OP-30 DR-31","OP-60 Inspection"], current_station:"JB-51", current_status:"Running", created_at:new Date().toISOString() },
  { id:"j2", production_number:"100031647", material_number:"M161502", description:"Spindle housing 80mm", quantity:"5 Nos", printed_date:"2025-06-01", start_date:"2025-06-03", end_date:"2025-06-12", routing:["OP-10 Rec","OP-20 JB-51","OP-50 Grinding"], current_station:"Receiving", current_status:"Pending", created_at:new Date().toISOString() },
  { id:"j3", production_number:"100031640", material_number:"M161490", description:"Bearing block assembly", quantity:"10 Nos", printed_date:"2025-05-28", start_date:"2025-05-29", end_date:"2025-06-05", routing:["OP-10 Rec","OP-30 DR-31","OP-70 Dispatch"], current_station:"Inspection", current_status:"WIP", created_at:new Date().toISOString() },
];
let localUpdates = [
  { id:"u1", job_id:"j1", supervisor:"Ritesh", station:"JB-51", status:"Running", notes:"Setup done", is_deviation:false, created_at:new Date(Date.now()-3600000).toISOString() },
  { id:"u2", job_id:"j3", supervisor:"Muzzamil", station:"Inspection", status:"WIP", notes:"QA check pending", is_deviation:false, created_at:new Date(Date.now()-7200000).toISOString() },
];
const localDB = {
  async getJobs() { return [...localJobs]; },
  async getJob(prodNo) { return localJobs.find(j => j.production_number === prodNo) || null; },
  async createJob(job) { const j = { ...job, id:"j"+Date.now(), created_at:new Date().toISOString() }; localJobs.unshift(j); return j; },
  async updateJob(id, patch) { localJobs = localJobs.map(j => j.id===id ? {...j,...patch} : j); return localJobs.find(j => j.id===id); },
  async getUpdates(jobId) { return localUpdates.filter(u => u.job_id===jobId).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)); },
  async addUpdate(u) { const r = {...u, id:"u"+Date.now(), created_at:new Date().toISOString()}; localUpdates.unshift(r); return r; },
  async getAllUpdates() { return [...localUpdates].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)); },
  async bulkInsertPO(rows) { return rows; },
  async bulkInsertRouting(rows) { return rows; },
  async getSettings() { return []; },
  async saveSetting(key, value) { return null; },
};
const DATA = DEMO_MODE ? localDB : db;

// ─── HELPERS ───────────────────────────────────────────────────────────────
function generateQRDataURL(text) { return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`; }
function agingDays(startDate, endDate) { return Math.floor((new Date(endDate||Date.now()) - new Date(startDate)) / 86400000); }
function overdueDays(endDate) { const d = agingDays(endDate, null); return d > 0 ? d : 0; }
function fmt(dt) { if (!dt) return "-"; return new Date(dt).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}); }
function fmtDate(d) { if (!d) return "-"; return new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); }

// Station name from routing op string e.g. "OP-20 JB-51" → "JB-51"
function stationFromOp(op) {
  const map = {"OP-10 Rec":"Receiving","OP-20 JB-51":"JB-51","OP-30 DR-31":"DR-31","OP-40 VM-40":"VM-40","OP-50 Grinding":"Grinding","OP-60 Inspection":"Inspection","OP-70 Dispatch":"Dispatch"};
  return map[op] || op;
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight:"100vh", background:"#0f0f0f", color:"#e8e2d4", fontFamily:"'IBM Plex Mono','Courier New',monospace" },
  nav: { background:"#1a1a1a", borderBottom:"1px solid #2a2a2a", padding:"10px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 },
  navTitle: { fontSize:12, fontWeight:700, letterSpacing:"0.15em", color:"#d4a853", textTransform:"uppercase" },
  navTabs: { display:"flex", gap:3, flexWrap:"wrap" },
  tab: (a) => ({ background:a?"#d4a853":"transparent", color:a?"#0f0f0f":"#888", border:`1px solid ${a?"#d4a853":"#333"}`, borderRadius:4, padding:"5px 8px", fontSize:10, fontFamily:"inherit", cursor:"pointer", fontWeight:a?700:400, letterSpacing:"0.08em", textTransform:"uppercase" }),
  card: { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:6, padding:"16px" },
  input: { background:"#111", border:"1px solid #333", borderRadius:4, padding:"8px 12px", color:"#e8e2d4", fontFamily:"'IBM Plex Mono',monospace", fontSize:13, width:"100%", boxSizing:"border-box" },
  select: { background:"#111", border:"1px solid #333", borderRadius:4, padding:"8px 12px", color:"#e8e2d4", fontFamily:"'IBM Plex Mono',monospace", fontSize:13, width:"100%", boxSizing:"border-box" },
  btn: (v="primary") => ({ background:v==="primary"?"#d4a853":v==="danger"?"#7f1d1d":v==="success"?"#14532d":"#222", color:v==="primary"?"#0f0f0f":"#e8e2d4", border:v==="ghost"?"1px solid #333":"none", borderRadius:4, padding:"10px 18px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:700, cursor:"pointer", letterSpacing:"0.1em", textTransform:"uppercase" }),
  label: { fontSize:10, color:"#888", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:4, display:"block" },
  statusPill: (s) => ({ display:"inline-block", padding:"2px 10px", borderRadius:3, fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", background:STATUS_COLORS[s]+"22", color:STATUS_COLORS[s], border:`1px solid ${STATUS_COLORS[s]}44` }),
  sectionTitle: { fontSize:11, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:"#888", marginBottom:12, borderBottom:"1px solid #222", paddingBottom:8 },
  warn: { background:"#78350f33", border:"1px solid #d97706", borderRadius:6, padding:"10px 14px", color:"#fbbf24", fontFamily:"monospace", fontSize:11, marginBottom:12 },
};

// ─── PASSCODE GATE ─────────────────────────────────────────────────────────
function PasscodeGate({ onUnlock }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  function submit() {
    if (code === PASSCODE) { onUnlock(); }
    else { setError(true); setShake(true); setTimeout(()=>setShake(false),400); setTimeout(()=>setCode(""),300); }
  }
  return (
    <div style={{ minHeight:"100vh", background:"#0f0f0f", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ ...S.card, maxWidth:320, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:28, marginBottom:8 }}>⚙️</div>
        <div style={{ fontSize:13, fontWeight:700, letterSpacing:"0.18em", color:"#d4a853", textTransform:"uppercase", marginBottom:4, fontFamily:"'IBM Plex Mono',monospace" }}>SHOP TRACKER</div>
        <div style={{ fontSize:10, color:"#555", letterSpacing:"0.1em", marginBottom:24, fontFamily:"monospace" }}>HMLV MACHINE SHOP — v2.0</div>
        <div style={{ animation:shake?"shake 0.3s":"none" }}>
          <input style={{ ...S.input, textAlign:"center", fontSize:22, letterSpacing:"0.4em", marginBottom:12 }} type="password" maxLength={6} value={code} onChange={e=>{ setCode(e.target.value); setError(false); }} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••" autoFocus />
          {error && <div style={{ color:"#ef4444", fontSize:11, marginBottom:8, fontFamily:"monospace" }}>INVALID PASSCODE</div>}
          <button style={{ ...S.btn("primary"), width:"100%" }} onClick={submit}>ENTER</button>
        </div>
        <div style={{ fontSize:10, color:"#444", marginTop:16, fontFamily:"monospace" }}>DEFAULT: 1234</div>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

// ─── QR SCANNER ────────────────────────────────────────────────────────────
function QRScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const [status, setStatus] = useState("Starting camera…");
  const [hasLib, setHasLib] = useState(false);
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
    s.onload = () => setHasLib(true);
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);
  useEffect(() => {
    if (!hasLib) return;
    let active = true;
    navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } })
      .then(stream => {
        if (!active) return;
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream; video.play();
        video.onloadedmetadata = () => {
          setStatus("Point camera at QR code");
          const canvas = canvasRef.current;
          function scan() {
            if (!active) return;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              canvas.width = video.videoWidth; canvas.height = video.videoHeight;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(video, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = window.jsQR?.(img.data, img.width, img.height);
              if (code?.data) { if (navigator.vibrate) navigator.vibrate([100,50,100]); onResult(code.data); return; }
            }
            animRef.current = requestAnimationFrame(scan);
          }
          scan();
        };
      }).catch(() => setStatus("Camera access denied"));
    return () => { active=false; cancelAnimationFrame(animRef.current); streamRef.current?.getTracks().forEach(t=>t.stop()); };
  }, [hasLib]);
  return (
    <div style={{ position:"fixed", inset:0, background:"#000", zIndex:200, display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ color:"#d4a853", fontFamily:"monospace", fontSize:11, letterSpacing:"0.15em" }}>SCANNING QR</span>
        <button onClick={onClose} style={{ background:"none", border:"1px solid #444", color:"#aaa", borderRadius:4, padding:"4px 12px", cursor:"pointer", fontFamily:"monospace", fontSize:11 }}>✕ CLOSE</button>
      </div>
      <div style={{ flex:1, position:"relative", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <video ref={videoRef} style={{ width:"100%", height:"100%", objectFit:"cover" }} playsInline muted />
        <canvas ref={canvasRef} style={{ display:"none" }} />
        <div style={{ position:"absolute", width:220, height:220, border:"2px solid #d4a853", borderRadius:8, boxShadow:"0 0 0 9999px rgba(0,0,0,0.5)" }}>
          <div style={{ position:"absolute", top:-2, left:-2, width:20, height:20, borderTop:"3px solid #d4a853", borderLeft:"3px solid #d4a853" }} />
          <div style={{ position:"absolute", top:-2, right:-2, width:20, height:20, borderTop:"3px solid #d4a853", borderRight:"3px solid #d4a853" }} />
          <div style={{ position:"absolute", bottom:-2, left:-2, width:20, height:20, borderBottom:"3px solid #d4a853", borderLeft:"3px solid #d4a853" }} />
          <div style={{ position:"absolute", bottom:-2, right:-2, width:20, height:20, borderBottom:"3px solid #d4a853", borderRight:"3px solid #d4a853" }} />
        </div>
      </div>
      <div style={{ padding:16, textAlign:"center", color:"#888", fontFamily:"monospace", fontSize:12 }}>{status}</div>
    </div>
  );
}

// ─── MAIN SCAN + UPDATE PAGE (new front page) ──────────────────────────────
function ScanPage({ stations, supervisors }) {
  const [step, setStep] = useState("job");       // job → machine → form → done
  const [scanMode, setScanMode] = useState(null); // "job" | "machine"
  const [jobInput, setJobInput] = useState("");
  const [job, setJob] = useState(null);
  const [jobErr, setJobErr] = useState("");
  const [jobLoading, setJobLoading] = useState(false);
  const [station, setStation] = useState("");
  const [supervisor, setSupervisor] = useState(supervisors[0] || "");
  const [status, setStatus] = useState("Running");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Check if selected machine matches routing
  const routingStations = (job?.routing || []).map(stationFromOp);
  const isDeviation = station && !routingStations.includes(station);
  const expectedNext = routingStations.find(s => s !== job?.current_station) || routingStations[0];

  async function lookupJob(code) {
    setJobLoading(true); setJobErr("");
    try {
      const j = await DATA.getJob(code.trim());
      if (j) { setJob(j); setStation(j.current_station || stations[0] || ""); setStep("machine"); }
      else setJobErr(`No job found: ${code}`);
    } catch(e) { setJobErr("Lookup failed: " + e.message); }
    setJobLoading(false);
  }

  async function save() {
    setSaving(true);
    try {
      await DATA.addUpdate({ job_id:job.id, supervisor, station, status, notes, is_deviation:isDeviation, deviation_reason:isDeviation?`Expected: ${expectedNext}, Used: ${station}`:"", created_at:new Date().toISOString() });
      await DATA.updateJob(job.id, { current_station:station, current_status:status, last_updated:new Date().toISOString() });
      if (navigator.vibrate) navigator.vibrate(200);
      setDone(true);
    } catch(e) { alert("Save failed: " + e.message); }
    setSaving(false);
  }

  function reset() { setStep("job"); setJob(null); setJobInput(""); setStation(""); setNotes(""); setDone(false); setSaving(false); }

  if (done) return (
    <div style={{ padding:24, textAlign:"center" }}>
      <div style={{ ...S.card, padding:40 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>✓</div>
        <div style={{ color:"#22c55e", fontFamily:"monospace", fontSize:14, fontWeight:700, letterSpacing:"0.1em", marginBottom:8 }}>UPDATE SAVED</div>
        <div style={{ color:"#888", fontFamily:"monospace", fontSize:11, marginBottom:4 }}>{job.production_number}</div>
        <div style={{ color:"#888", fontFamily:"monospace", fontSize:11, marginBottom:4 }}>{station} · {status}</div>
        {isDeviation && <div style={{ color:"#fbbf24", fontFamily:"monospace", fontSize:10, marginTop:8 }}>⚠ Deviation logged</div>}
        <button style={{ ...S.btn("primary"), marginTop:20, width:"100%" }} onClick={reset}>UPDATE ANOTHER JOB</button>
      </div>
    </div>
  );

  return (
    <div style={{ padding:16 }}>
      {scanMode && (
        <QRScanner
          onResult={code => {
            setScanMode(null);
            if (scanMode === "job") { setJobInput(code); lookupJob(code); }
            if (scanMode === "machine") { const found = stations.find(s => s.toUpperCase() === code.trim().toUpperCase()); setStation(found || code.trim()); setStep("form"); }
          }}
          onClose={() => setScanMode(null)}
        />
      )}

      {/* ── STEP 1: JOB CARD ── */}
      <div style={{ ...S.card, marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <div style={{ width:22, height:22, borderRadius:"50%", background:step==="job"?"#d4a853":"#22c55e", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#0f0f0f", flexShrink:0 }}>{step==="job"?"1":"✓"}</div>
          <div style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:step==="job"?"#e8e2d4":"#555" }}>JOB CARD</div>
          {job && <span style={{ fontFamily:"monospace", fontSize:11, color:"#d4a853", marginLeft:"auto" }}>{job.production_number}</span>}
        </div>
        {step === "job" && (
          <>
            <button style={{ ...S.btn("primary"), width:"100%", padding:"14px 18px", fontSize:13, marginBottom:10 }} onClick={() => setScanMode("job")}>
              ▣  SCAN JOB CARD QR
            </button>
            <div style={{ textAlign:"center", color:"#444", fontFamily:"monospace", fontSize:10, marginBottom:10 }}>— or type manually —</div>
            <input style={{ ...S.input, marginBottom:8 }} value={jobInput} onChange={e=>setJobInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&lookupJob(jobInput)} placeholder="Enter job card number…" />
            {jobErr && <div style={{ color:"#ef4444", fontSize:11, fontFamily:"monospace", marginBottom:8 }}>{jobErr}</div>}
            <button style={{ ...S.btn("ghost"), width:"100%" }} onClick={()=>lookupJob(jobInput)} disabled={jobLoading||!jobInput}>{jobLoading?"SEARCHING…":"FIND JOB"}</button>
          </>
        )}
        {job && step !== "job" && (
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#aaa" }}>{job.description} · {job.quantity} · <span style={S.statusPill(job.current_status||"Pending")}>{job.current_status}</span></div>
        )}
      </div>

      {/* ── STEP 2: MACHINE ── */}
      {(step === "machine" || step === "form") && (
        <div style={{ ...S.card, marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <div style={{ width:22, height:22, borderRadius:"50%", background:step==="machine"?"#d4a853":step==="form"?"#22c55e":"#333", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#0f0f0f", flexShrink:0 }}>{step==="machine"?"2":"✓"}</div>
            <div style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:step==="machine"?"#e8e2d4":"#555" }}>SELECT MACHINE</div>
            {step==="form" && <span style={{ fontFamily:"monospace", fontSize:11, color:"#d4a853", marginLeft:"auto" }}>{station}</span>}
          </div>
          {step === "machine" && (
            <>
              <button style={{ ...S.btn("primary"), width:"100%", padding:"12px 18px", fontSize:12, marginBottom:10 }} onClick={()=>setScanMode("machine")}>
                ▣  SCAN MACHINE QR
              </button>
              <div style={{ textAlign:"center", color:"#444", fontFamily:"monospace", fontSize:10, marginBottom:10 }}>— or select from list —</div>
              <select style={{ ...S.select, marginBottom:10 }} value={station} onChange={e=>setStation(e.target.value)}>
                <option value="">-- Select Machine --</option>
                {stations.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {station && routingStations.length > 0 && (
                <div style={{ fontFamily:"monospace", fontSize:10, color:"#555", marginBottom:8 }}>
                  Routing: {routingStations.join(" → ")}
                </div>
              )}
              <button style={{ ...S.btn("primary"), width:"100%" }} onClick={()=>{ if(station) setStep("form"); }} disabled={!station}>CONFIRM MACHINE →</button>
            </>
          )}
        </div>
      )}

      {/* ── STEP 3: UPDATE FORM ── */}
      {step === "form" && (
        <div style={S.card}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <div style={{ width:22, height:22, borderRadius:"50%", background:"#d4a853", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#0f0f0f", flexShrink:0 }}>3</div>
            <div style={{ fontFamily:"monospace", fontSize:12, fontWeight:700 }}>LOG UPDATE</div>
          </div>

          {isDeviation && (
            <div style={S.warn}>
              ⚠ DEVIATION — Routing expects <b>{expectedNext}</b> but you selected <b>{station}</b>. Update will be flagged. You can still save.
            </div>
          )}

          <div style={{ marginBottom:12 }}>
            <label style={S.label}>Supervisor</label>
            <select style={S.select} value={supervisor} onChange={e=>setSupervisor(e.target.value)}>
              {supervisors.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={S.label}>Status</label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {STATUSES.map(s => (
                <button key={s} onClick={()=>setStatus(s)} style={{ padding:"6px 12px", borderRadius:4, fontSize:11, fontFamily:"monospace", fontWeight:700, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em", border:`1px solid ${STATUS_COLORS[s]}`, background:status===s?STATUS_COLORS[s]:STATUS_COLORS[s]+"22", color:status===s?"#0f0f0f":STATUS_COLORS[s] }}>{s}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={S.label}>Notes / Remarks (optional)</label>
            <textarea style={{ ...S.input, minHeight:64, resize:"vertical" }} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Enter notes, QA remarks, delay reason…" />
          </div>

          <div style={{ display:"flex", gap:8 }}>
            <button style={{ ...S.btn("primary"), flex:1 }} onClick={save} disabled={saving}>{saving?"SAVING…":"SAVE UPDATE"}</button>
            <button style={S.btn("ghost")} onClick={()=>setStep("machine")}>← BACK</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── JOB DETAIL PAGE ───────────────────────────────────────────────────────
function JobDetailPage({ job:initialJob, onBack }) {
  const [job, setJob] = useState(initialJob);
  const [updates, setUpdates] = useState([]);
  const [tab, setTab] = useState("history");
  useEffect(() => { DATA.getUpdates(job.id).then(setUpdates); }, [job.id]);
  async function reload() {
    const j = await DATA.getJob(job.production_number); if (j) setJob(j);
    const u = await DATA.getUpdates(job.id); setUpdates(u);
  }
  const opsDone = (job.routing||[]).filter(op => {
    const s = stationFromOp(op);
    return DEFAULT_STATIONS.indexOf(s) <= DEFAULT_STATIONS.indexOf(job.current_station);
  });
  return (
    <div style={{ padding:16 }}>
      <button onClick={onBack} style={{ ...S.btn("ghost"), marginBottom:12, fontSize:11 }}>← BACK</button>
      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
          <div>
            <div style={{ fontFamily:"monospace", fontSize:16, fontWeight:700, color:"#d4a853" }}>{job.production_number}</div>
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#888" }}>{job.material_number}</div>
          </div>
          <span style={S.statusPill(job.current_status||"Pending")}>{job.current_status||"Pending"}</span>
        </div>
        <div style={{ fontFamily:"monospace", fontSize:12, color:"#ccc", marginBottom:8 }}>{job.description}</div>
        <div style={{ display:"flex", gap:16, fontSize:11, color:"#666", fontFamily:"monospace", flexWrap:"wrap" }}>
          <span>QTY: {job.quantity}</span><span>START: {fmtDate(job.start_date)}</span><span>DUE: {fmtDate(job.end_date)}</span>
        </div>
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Routing Progress</div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {(job.routing||[]).map((op,i) => {
              const done = opsDone.includes(op);
              const cur = stationFromOp(op) === job.current_station;
              return <span key={i} style={{ fontSize:10, padding:"3px 8px", borderRadius:3, fontFamily:"monospace", fontWeight:700, border:`1px solid ${done?"#22c55e44":cur?"#d4a853":"#222"}`, background:done?"#22c55e22":cur?"#d4a85322":"#111", color:done?"#22c55e":cur?"#d4a853":"#444" }}>{op}</span>;
            })}
          </div>
        </div>
      </div>
      <div style={{ display:"flex", gap:6, margin:"12px 0" }}>
        {["history"].map(t => <button key={t} style={S.tab(tab===t)} onClick={()=>setTab(t)}>{t.toUpperCase()}</button>)}
      </div>
      <div style={S.card}>
        <div style={S.sectionTitle}>Update History</div>
        {updates.length===0 && <div style={{ color:"#555", fontFamily:"monospace", fontSize:12 }}>No updates yet</div>}
        {updates.map(u => (
          <div key={u.id} style={{ borderLeft:`2px solid ${STATUS_COLORS[u.status]||"#333"}`, paddingLeft:12, marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2, flexWrap:"wrap", gap:4 }}>
              <span style={{ fontFamily:"monospace", fontSize:11, color:"#d4a853" }}>{u.station}</span>
              <div style={{ display:"flex", gap:6 }}>
                {u.is_deviation && <span style={{ fontSize:9, padding:"2px 6px", background:"#78350f44", color:"#fbbf24", border:"1px solid #d97706", borderRadius:3, fontFamily:"monospace" }}>⚠ DEVIATION</span>}
                <span style={S.statusPill(u.status)}>{u.status}</span>
              </div>
            </div>
            <div style={{ fontFamily:"monospace", fontSize:10, color:"#888" }}>{u.supervisor} · {fmt(u.created_at)}</div>
            {u.deviation_reason && <div style={{ fontFamily:"monospace", fontSize:10, color:"#fbbf24", marginTop:2 }}>{u.deviation_reason}</div>}
            {u.notes && <div style={{ fontFamily:"monospace", fontSize:11, color:"#ccc", marginTop:4 }}>{u.notes}</div>}
          </div>
        ))}
      </div>
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
    const [j,u] = await Promise.all([DATA.getJobs(), DATA.getAllUpdates()]);
    setJobs(j||[]); setUpdates(u||[]); setLoading(false);
  }
  useEffect(()=>{ load(); },[]);
  const shown = jobs.filter(j => {
    if (filter!=="All" && j.current_status!==filter) return false;
    if (search && !j.production_number.includes(search) && !j.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const counts = {};
  STATUSES.forEach(s => counts[s] = jobs.filter(j=>j.current_status===s).length);
  if (loading) return <div style={{ padding:32, textAlign:"center", color:"#555", fontFamily:"monospace", fontSize:12 }}>LOADING…</div>;
  if (selectedJob) {
    const job = jobs.find(j=>j.id===selectedJob);
    const jobUpdates = updates.filter(u=>u.job_id===selectedJob);
    const deviations = jobUpdates.filter(u=>u.is_deviation);
    return (
      <div style={{ padding:16 }}>
        <button onClick={()=>setSelectedJob(null)} style={{ ...S.btn("ghost"), marginBottom:12, fontSize:11 }}>← BACK</button>
        <div style={S.card}>
          <div style={{ fontFamily:"monospace", fontSize:16, fontWeight:700, color:"#d4a853", marginBottom:4 }}>{job.production_number}</div>
          <div style={{ fontFamily:"monospace", fontSize:12, color:"#aaa", marginBottom:12 }}>{job.description} · {job.quantity}</div>
          {[["Material",job.material_number],["Start Date",fmtDate(job.start_date)],["End Date",fmtDate(job.end_date)],["Station",job.current_station||"—"],["Status",job.current_status||"—"],["Aging",agingDays(job.start_date)+" days"],["Deviations",deviations.length]].map(([k,v])=>
            <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #1e1e1e", fontFamily:"monospace", fontSize:12 }}>
              <span style={{ color:"#666" }}>{k}</span>
              <span style={{ color: k==="Deviations"&&v>0?"#fbbf24":"#e8e2d4" }}>{v}</span>
            </div>
          )}
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:10, color:"#555", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>Movement Log</div>
            {jobUpdates.length===0 && <div style={{ color:"#444", fontFamily:"monospace", fontSize:11 }}>No updates</div>}
            {jobUpdates.map(u=>(
              <div key={u.id} style={{ borderLeft:`2px solid ${STATUS_COLORS[u.status]||"#333"}`, paddingLeft:10, marginBottom:12 }}>
                <div style={{ fontFamily:"monospace", fontSize:11, color:"#d4a853", display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                  {u.station}
                  {u.is_deviation && <span style={{ fontSize:9, padding:"1px 5px", background:"#78350f44", color:"#fbbf24", border:"1px solid #d97706", borderRadius:3 }}>⚠ DEVIATION</span>}
                  <span style={S.statusPill(u.status)}>{u.status}</span>
                </div>
                <div style={{ fontFamily:"monospace", fontSize:10, color:"#888" }}>{u.supervisor} · {fmt(u.created_at)}</div>
                {u.notes && <div style={{ fontFamily:"monospace", fontSize:11, color:"#bbb", marginTop:2 }}>{u.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:16 }}>
        {[["Total",jobs.length,"#d4a853"],["Running",counts.Running||0,"#22c55e"],["On Hold",counts.Hold||0,"#ef4444"],["Complete",counts.Complete||0,"#8b5cf6"]].map(([l,v,c])=>(
          <div key={l} style={{ ...S.card, padding:"12px 14px" }}>
            <div style={{ fontFamily:"monospace", fontSize:10, color:"#666", letterSpacing:"0.1em", textTransform:"uppercase" }}>{l}</div>
            <div style={{ fontFamily:"monospace", fontSize:26, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>
      <input style={{ ...S.input, marginBottom:10 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job / description…" />
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:14 }}>
        {["All",...STATUSES].map(s=><button key={s} style={S.tab(filter===s)} onClick={()=>setFilter(s)}>{s}</button>)}
      </div>
      {shown.map(job => {
        const overdue = overdueDays(job.end_date);
        return (
          <div key={job.id} style={{ ...S.card, marginBottom:10, cursor:"pointer" }} onClick={()=>setSelectedJob(job.id)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ fontFamily:"monospace", fontSize:13, fontWeight:700, color:"#d4a853" }}>{job.production_number}</span>
              <span style={S.statusPill(job.current_status||"Pending")}>{job.current_status||"Pending"}</span>
            </div>
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#aaa", marginBottom:6 }}>{job.description}</div>
            <div style={{ display:"flex", gap:12, fontSize:10, color:"#666", fontFamily:"monospace", flexWrap:"wrap" }}>
              <span>📍 {job.current_station||"—"}</span>
              <span>QTY: {job.quantity}</span>
              {overdue>0 && <span style={{ color:"#ef4444" }}>⚠ {overdue}d OVERDUE</span>}
            </div>
            {(job.routing||[]).length>0 && (
              <div style={{ marginTop:8, display:"flex", gap:3 }}>
                {(job.routing||[]).map((op,i) => {
                  const done = DEFAULT_STATIONS.indexOf(stationFromOp(op)) <= DEFAULT_STATIONS.indexOf(job.current_station);
                  return <div key={i} style={{ height:4, flex:1, borderRadius:2, background:done?"#22c55e":"#222" }} />;
                })}
              </div>
            )}
          </div>
        );
      })}
      {shown.length===0 && <div style={{ color:"#444", fontFamily:"monospace", fontSize:12, textAlign:"center", padding:32 }}>No jobs found</div>}
    </div>
  );
}

// ─── JOB CARD MANAGER ──────────────────────────────────────────────────────
function JobCardManager() {
  const [jobs, setJobs] = useState([]);
  const [mode, setMode] = useState("list");
  const [printJob, setPrintJob] = useState(null);
  const [form, setForm] = useState({ production_number:"", material_number:"", description:"", quantity:"", start_date:"", end_date:"", routing:["OP-10 Rec","OP-20 JB-51","OP-30 DR-31"] });
  const [saving, setSaving] = useState(false);
  useEffect(()=>{ DATA.getJobs().then(setJobs); },[]);
  function toggleRoute(op) { setForm(f=>({ ...f, routing:f.routing.includes(op)?f.routing.filter(x=>x!==op):[...f.routing,op] })); }
  async function create() {
    if (!form.production_number) return;
    setSaving(true);
    const job = await DATA.createJob({ ...form, printed_date:new Date().toISOString().slice(0,10), current_status:"Pending", current_station:"Receiving" });
    setJobs(prev=>[job,...prev]); setMode("list"); setSaving(false);
  }
  if (printJob) return <PrintView job={printJob} onClose={()=>setPrintJob(null)} />;
  if (mode==="create") return (
    <div style={{ padding:16 }}>
      <button onClick={()=>setMode("list")} style={{ ...S.btn("ghost"), marginBottom:12, fontSize:11 }}>← BACK</button>
      <div style={S.card}>
        <div style={S.sectionTitle}>New Job Card</div>
        {[["Production Number *","production_number","100031646"],["Material Number","material_number","M161501"],["Description","description","Wheel head body"],["Quantity","quantity","3 Nos"],["Start Date","start_date",""],["Expected End Date","end_date",""]].map(([lbl,key,ph])=>(
          <div key={key} style={{ marginBottom:12 }}>
            <label style={S.label}>{lbl}</label>
            <input style={S.input} type={key.includes("date")?"date":"text"} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph} />
          </div>
        ))}
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Routing Operations</label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {ROUTING_OPS.map(op=><button key={op} onClick={()=>toggleRoute(op)} style={{ padding:"5px 10px", fontSize:10, fontFamily:"monospace", cursor:"pointer", borderRadius:3, border:"1px solid #333", background:form.routing.includes(op)?"#d4a85333":"#111", color:form.routing.includes(op)?"#d4a853":"#666", fontWeight:form.routing.includes(op)?700:400 }}>{op}</button>)}
          </div>
        </div>
        <button style={{ ...S.btn("primary"), width:"100%" }} onClick={create} disabled={saving}>{saving?"CREATING…":"CREATE JOB CARD"}</button>
      </div>
    </div>
  );
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ ...S.sectionTitle, margin:0 }}>Job Cards</div>
        <button style={S.btn("primary")} onClick={()=>setMode("create")}>+ NEW JOB</button>
      </div>
      {jobs.map(job=>(
        <div key={job.id} style={{ ...S.card, marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontFamily:"monospace", fontWeight:700, color:"#d4a853", fontSize:13 }}>{job.production_number}</span>
            <button style={{ ...S.btn("ghost"), fontSize:10, padding:"4px 10px" }} onClick={()=>setPrintJob(job)}>🖨 PRINT</button>
          </div>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#aaa" }}>{job.description} · {job.quantity}</div>
          <div style={{ fontFamily:"monospace", fontSize:10, color:"#555", marginTop:4 }}>{(job.routing||[]).join(" → ")}</div>
        </div>
      ))}
    </div>
  );
}

// ─── PRINT VIEW ────────────────────────────────────────────────────────────
function PrintView({ job, onClose }) {
  const qrUrl = generateQRDataURL(job.production_number);
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        <button style={S.btn("ghost")} onClick={onClose}>← BACK</button>
        <button style={S.btn("primary")} onClick={()=>window.print()}>🖨 PRINT / SAVE PDF</button>
      </div>
      <div id="print-card" style={{ background:"#fff", color:"#000", border:"2px solid #000", borderRadius:6, padding:20, fontFamily:"'Courier New',monospace", maxWidth:480 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:2 }}>SHOP TRACKER — JOB CARD</div>
            <div style={{ fontSize:20, fontWeight:900 }}>{job.production_number}</div>
            <div style={{ fontSize:11, color:"#555" }}>Printed: {fmtDate(job.printed_date||new Date())}</div>
          </div>
          <img src={qrUrl} alt="QR" style={{ width:80, height:80 }} />
        </div>
        <div style={{ borderTop:"1px solid #000", paddingTop:10, display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 16px" }}>
          {[["Material",job.material_number],["Description",job.description],["Quantity",job.quantity],["Start Date",fmtDate(job.start_date)],["End Date",fmtDate(job.end_date)]].map(([k,v])=>(
            <div key={k}><div style={{ fontSize:8, textTransform:"uppercase", letterSpacing:"0.1em", color:"#888" }}>{k}</div><div style={{ fontSize:11, fontWeight:700 }}>{v||"—"}</div></div>
          ))}
        </div>
        <div style={{ marginTop:12, borderTop:"1px solid #ccc", paddingTop:8 }}>
          <div style={{ fontSize:8, textTransform:"uppercase", letterSpacing:"0.1em", color:"#888", marginBottom:6 }}>Routing</div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {(job.routing||[]).map((op,i)=><span key={i} style={{ fontSize:10, padding:"2px 8px", border:"1px solid #000", borderRadius:3 }}>{op}</span>)}
          </div>
        </div>
        <div style={{ marginTop:12, borderTop:"1px solid #ccc", paddingTop:8, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
          {["Operator","Station","Sign"].map(f=><div key={f}><div style={{ fontSize:8, textTransform:"uppercase", color:"#888", marginBottom:16 }}>{f}</div><div style={{ borderBottom:"1px solid #000" }} /></div>)}
        </div>
      </div>
      <style>{`@media print { body > *:not(#print-card) { display: none; } #print-card { border: none; } }`}</style>
    </div>
  );
}

// ─── SETUP PAGE (editable Work Centers + Supervisors) ──────────────────────
function SetupPage({ stations, supervisors, onUpdate }) {
  const [tab, setTab] = useState("wc");
  const [wcList, setWcList] = useState([...stations]);
  const [supList, setSupList] = useState([...supervisors]);
  const [newWC, setNewWC] = useState("");
  const [newSup, setNewSup] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveAll() {
    setSaving(true);
    try {
      await DATA.saveSetting("stations", wcList);
      await DATA.saveSetting("supervisors", supList);
      onUpdate(wcList, supList);
      setSaved(true); setTimeout(()=>setSaved(false), 2000);
    } catch(e) { alert("Save failed: " + e.message); }
    setSaving(false);
  }

  function addWC() { if (newWC.trim() && !wcList.includes(newWC.trim())) { setWcList([...wcList, newWC.trim()]); setNewWC(""); } }
  function removeWC(s) { setWcList(wcList.filter(x=>x!==s)); }
  function addSup() { if (newSup.trim() && !supList.includes(newSup.trim())) { setSupList([...supList, newSup.trim()]); setNewSup(""); } }
  function removeSup(s) { setSupList(supList.filter(x=>x!==s)); }

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[["wc","Work Centers"],["sup","Supervisors"]].map(([id,label])=>(
          <button key={id} style={S.tab(tab===id)} onClick={()=>setTab(id)}>{label}</button>
        ))}
      </div>

      {tab==="wc" && (
        <div>
          <div style={S.sectionTitle}>Work Centers / Machines</div>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <input style={{ ...S.input }} value={newWC} onChange={e=>setNewWC(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addWC()} placeholder="Add new machine e.g. VM-35" />
            <button style={{ ...S.btn("primary"), whiteSpace:"nowrap" }} onClick={addWC}>+ ADD</button>
          </div>
          <div style={{ display:"grid", gap:6 }}>
            {wcList.map((s,i)=>(
              <div key={s} style={{ ...S.card, padding:"10px 14px", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:26, height:26, borderRadius:4, background:"#d4a85322", border:"1px solid #d4a85344", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#d4a853" }}>{i+1}</div>
                <span style={{ fontFamily:"monospace", fontSize:12, flex:1 }}>{s}</span>
                <button onClick={()=>removeWC(s)} style={{ background:"none", border:"1px solid #333", color:"#ef4444", borderRadius:3, padding:"2px 8px", cursor:"pointer", fontFamily:"monospace", fontSize:10 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop:8, fontFamily:"monospace", fontSize:10, color:"#444" }}>
            Hardcoded fallback: {DEFAULT_STATIONS.join(", ")}
          </div>
        </div>
      )}

      {tab==="sup" && (
        <div>
          <div style={S.sectionTitle}>Supervisors</div>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <input style={{ ...S.input }} value={newSup} onChange={e=>setNewSup(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSup()} placeholder="Add supervisor name" />
            <button style={{ ...S.btn("primary"), whiteSpace:"nowrap" }} onClick={addSup}>+ ADD</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {supList.map(s=>(
              <div key={s} style={{ ...S.card, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:"#333", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#d4a853" }}>{s[0]}</div>
                <span style={{ fontFamily:"monospace", fontSize:12, flex:1 }}>{s}</span>
                <button onClick={()=>removeSup(s)} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:14 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop:8, fontFamily:"monospace", fontSize:10, color:"#444" }}>
            Hardcoded fallback: {DEFAULT_SUPERVISORS.join(", ")}
          </div>
        </div>
      )}

      <div style={{ marginTop:20 }}>
        <button style={{ ...S.btn(saved?"success":"primary"), width:"100%" }} onClick={saveAll} disabled={saving}>
          {saving?"SAVING…":saved?"✓ SAVED!":"SAVE CHANGES"}
        </button>
        <div style={{ fontFamily:"monospace", fontSize:10, color:"#444", textAlign:"center", marginTop:8 }}>Changes apply to all users immediately</div>
      </div>
    </div>
  );
}

// ─── BULK IMPORT ───────────────────────────────────────────────────────────
function BulkImport() {
  const [activeTab, setActiveTab] = useState("po");
  const [poRows, setPoRows] = useState(null);
  const [rmRows, setRmRows] = useState(null);
  const [poStatus, setPoStatus] = useState(null);
  const [rmStatus, setRmStatus] = useState(null);
  const [xlsxReady, setXlsxReady] = useState(false);
  useEffect(()=>{ if(window.XLSX){setXlsxReady(true);return;} const s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload=()=>setXlsxReady(true); document.head.appendChild(s); },[]);
  const PO_COLS=[{key:"order_no",label:"Order No",req:true,aliases:["order no","orderno","po no","pono","production order"]},{key:"material_no",label:"Material No",req:true,aliases:["material no","materialno","material no.","mat no","matno","material"]},{key:"description",label:"Description",aliases:["description","material description","desc"]},{key:"qty",label:"Qty",req:true,num:true,aliases:["qty","quantity","order qty"]},{key:"uom",label:"UoM",aliases:["uom","unit","unit of measure"]},{key:"start_date",label:"Start Date",aliases:["start date","startdate","planned start"]},{key:"end_date",label:"End Date",aliases:["end date","enddate","finish date","planned end"]},{key:"status",label:"Status",aliases:["status"]}];
  // RM_COLS: aliases cover SAP export headers AND template headers
  const RM_COLS=[
    {key:"material_no",label:"Material No",req:true,aliases:["material no","material no.","materialno","mat no","matno","material"]},
    {key:"op_no",label:"Op No",req:true,num:true,aliases:["op no","op no.","opno","operation","operation no","operationno","oper","op"]},
    {key:"control_key",label:"Control Key",aliases:["control key","controlkey"]},
    {key:"work_center",label:"Work Center",req:true,aliases:["work center","workcenter","work centre","workcentre","wc","machine","machine center"]},
    {key:"op_description",label:"Op Description",aliases:["op description","opdescription","operation description","operationdescription","description","op desc"]},
    {key:"setup_time",label:"Setup Time (min)",num:true,aliases:["setup time (min)","setup time","setuptime","standard value1","standardvalue1","std value1","setup"]},
    {key:"machine_time",label:"Machine Time (min)",req:true,num:true,aliases:["machine time (min)","machine time","machinetime","standard value2","standardvalue2","standardvalue 2","std value2","machine"]},
    {key:"labor_time",label:"Labor Time (min)",num:true,aliases:["labor time (min)","labor time","labortime","labour time","labourtime","standard value3","standardvalue3","std value3","labor","labour"]},
  ];
  const PO_TPL=[["Order No","Material No","Description","Qty","UoM","Start Date","End Date","Status"],["PO-1001","MAT-001","Wheel Head Body",10,"EA","2026-06-10","2026-06-20","Created"],["PO-1002","MAT-002","Spindle Housing",5,"EA","2026-06-12","2026-06-25","Created"]];
  const RM_TPL=[["Material No","Op No","Work Center","Op Description","Setup Time (min)","Machine Time (min)","Labor Time (min)"],["MAT-001",10,"JB-51","Turn outer diameter",30,45,10],["MAT-001",20,"Grinding","Grind to finish",15,30,5]];
  function dl(type){ const d=type==="po"?PO_TPL:RM_TPL; const ws=window.XLSX.utils.aoa_to_sheet(d); ws["!cols"]=d[0].map(()=>({wch:20})); const wb=window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb,ws,type==="po"?"Production Orders":"Routing Master"); window.XLSX.writeFile(wb,`template_${type}.xlsx`); }
  function parseFile(file,cols,setter){ const r=new FileReader(); r.onload=e=>{ try{ const wb=window.XLSX.read(e.target.result,{type:"binary",cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; const raw=window.XLSX.utils.sheet_to_json(ws,{defval:"",raw:false,dateNF:"YYYY-MM-DD"}); const norm=s=>s.toString().toLowerCase().replace(/[^a-z0-9]/g,""); const rows=raw.map((row,i)=>{ const nr={}; Object.keys(row).forEach(k=>{nr[norm(k)]=row[k];}); const data={}; const errors=[]; cols.forEach(col=>{ // try label, key, then all aliases in order const allNames=[col.label,col.key,...(col.aliases||[])]; let v=""; for(const name of allNames){ const found=nr[norm(name)]; if(found!==undefined&&found!==""){v=found;break;} } data[col.key]=v; if(col.req&&(v===""||v===null||v===undefined))errors.push(col.label+" missing"); if(col.num&&v!==""&&v!==null&&v!==undefined&&isNaN(Number(v)))errors.push(col.label+" must be a number"); }); return{rowNum:i+2,data,errors,valid:errors.length===0}; }); setter(rows); }catch(err){alert("Cannot read file: "+err.message);} }; r.readAsBinaryString(file); }
  async function doImport(type){ const rows=(type==="po"?poRows:rmRows).filter(r=>r.valid).map(r=>r.data); const setter=type==="po"?setPoStatus:setRmStatus; setter({loading:true}); try{ if(type==="po")await DATA.bulkInsertPO(rows); else await DATA.bulkInsertRouting(rows); setter({loading:false,msg:`✓ ${rows.length} records imported!`,ok:true}); }catch(e){setter({loading:false,msg:"Failed: "+e.message,ok:false});} }
  function dlErrors(rows,type){ const cols=type==="po"?PO_COLS:RM_COLS; const errRows=rows.filter(r=>!r.valid); const h=["Row",...cols.map(c=>c.label),"Errors"]; const d=[h,...errRows.map(r=>[r.rowNum,...cols.map(c=>r.data[c.key]??""),r.errors.join("; ")])]; const ws=window.XLSX.utils.aoa_to_sheet(d); const wb=window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb,ws,"Errors"); window.XLSX.writeFile(wb,`errors_${type}.xlsx`); }

  function Preview({rows,cols,type,status,onImport}){
    if(!rows)return null;
    const valid=rows.filter(r=>r.valid).length; const errs=rows.length-valid;
    return(<div style={{marginTop:16}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[["Total",rows.length,"#d4a853"],["Valid",valid,"#22c55e"],["Errors",errs,errs>0?"#ef4444":"#555"]].map(([l,v,c])=>(
          <div key={l} style={{...S.card,padding:"10px 12px"}}><div style={{fontFamily:"monospace",fontSize:9,color:"#555",textTransform:"uppercase"}}>{l}</div><div style={{fontFamily:"monospace",fontSize:22,fontWeight:700,color:c}}>{v}</div></div>
        ))}
      </div>
      <div style={{overflowX:"auto",border:"1px solid #2a2a2a",borderRadius:6}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11,minWidth:500}}>
          <thead><tr style={{background:"#111"}}><th style={{padding:"8px 10px",textAlign:"left",color:"#555",fontWeight:700,borderBottom:"1px solid #2a2a2a",fontSize:10}}>#</th>{cols.map(c=><th key={c.key} style={{padding:"8px 10px",textAlign:"left",color:"#555",fontWeight:700,borderBottom:"1px solid #2a2a2a",fontSize:10,whiteSpace:"nowrap"}}>{c.label}{c.req?" *":""}</th>)}<th style={{padding:"8px 10px",textAlign:"left",color:"#555",fontWeight:700,borderBottom:"1px solid #2a2a2a",fontSize:10}}>Status</th></tr></thead>
          <tbody>{rows.slice(0,50).map(row=>(
            <tr key={row.rowNum} style={{background:row.valid?"transparent":"#7f1d1d22",borderBottom:"1px solid #1e1e1e"}}>
              <td style={{padding:"6px 10px",color:"#444"}}>{row.rowNum}</td>
              {cols.map(c=><td key={c.key} style={{padding:"6px 10px",color:row.data[c.key]?"#e8e2d4":"#444"}}>{row.data[c.key]||"—"}</td>)}
              <td style={{padding:"6px 10px"}}>{row.valid?<span style={{color:"#22c55e",fontSize:10}}>✓ OK</span>:<span style={{color:"#ef4444",fontSize:10}}>{row.errors.join(", ")}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {rows.length>50&&<div style={{fontFamily:"monospace",fontSize:10,color:"#555",marginTop:6,textAlign:"center"}}>Showing first 50 of {rows.length} rows</div>}
      {status&&<div style={{...S.card,marginTop:12,color:status.ok?"#22c55e":"#ef4444",fontFamily:"monospace",fontSize:12,textAlign:"center"}}>{status.loading?"⏳ IMPORTING…":status.msg}</div>}
      <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
        {valid>0&&<button style={{...S.btn("success"),flex:1}} onClick={onImport} disabled={status?.loading}>{status?.loading?"IMPORTING…":`⬆ IMPORT ${valid} ROWS`}</button>}
        {errs>0&&<button style={S.btn("ghost")} onClick={()=>dlErrors(rows,type)}>⬇ ERRORS</button>}
      </div>
    </div>);
  }

  function DropZone({type,cols,setter}){
    const [drag,setDrag]=useState(false);
    return(<div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)parseFile(f,cols,setter);}} style={{border:`1.5px dashed ${drag?"#d4a853":"#333"}`,borderRadius:6,padding:"28px 16px",textAlign:"center",background:drag?"#d4a85311":"#111",position:"relative",cursor:"pointer"}}>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const f=e.target.files[0];if(f)parseFile(f,cols,setter);}} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}} />
      <div style={{fontSize:28,marginBottom:8}}>📂</div>
      <div style={{fontFamily:"monospace",fontSize:12,color:"#888"}}><span style={{color:"#d4a853",fontWeight:700}}>Click to browse</span> or drag & drop</div>
      <div style={{fontFamily:"monospace",fontSize:10,color:"#555",marginTop:4}}>Supports .xlsx · .xls · .csv</div>
    </div>);
  }

  if (!xlsxReady) return <div style={{padding:32,textAlign:"center",color:"#555",fontFamily:"monospace",fontSize:12}}>LOADING EXCEL ENGINE…</div>;
  return (
    <div style={{padding:16}}>
      <div style={S.sectionTitle}>Bulk Data Import</div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["po","Production Orders"],["rm","Routing Master"]].map(([id,label])=>(
          <button key={id} style={S.tab(activeTab===id)} onClick={()=>setActiveTab(id)}>{label}</button>
        ))}
      </div>
      {activeTab==="po"&&(<div><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><button style={S.btn("ghost")} onClick={()=>dl("po")}>⬇ TEMPLATE</button><span style={{fontFamily:"monospace",fontSize:10,color:"#555"}}>Fill and upload below</span></div><DropZone type="po" cols={PO_COLS} setter={setPoRows}/><Preview rows={poRows} cols={PO_COLS} type="po" status={poStatus} onImport={()=>doImport("po")}/></div>)}
      {activeTab==="rm"&&(<div><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><button style={S.btn("ghost")} onClick={()=>dl("rm")}>⬇ TEMPLATE</button><span style={{fontFamily:"monospace",fontSize:10,color:"#555"}}>Fill and upload below</span></div><DropZone type="rm" cols={RM_COLS} setter={setRmRows}/><Preview rows={rmRows} cols={RM_COLS} type="rm" status={rmStatus} onImport={()=>doImport("rm")}/></div>)}
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [page, setPage] = useState("scan");
  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [supervisors, setSupervisors] = useState(DEFAULT_SUPERVISORS);

  // Load saved settings from Supabase on mount
  useEffect(()=>{
    if (!unlocked) return;
    DATA.getSettings().then(rows=>{
      if (!rows || rows.length===0) return;
      rows.forEach(r=>{
        try {
          const val = JSON.parse(r.value);
          if (r.key==="stations" && Array.isArray(val) && val.length>0) setStations(val);
          if (r.key==="supervisors" && Array.isArray(val) && val.length>0) setSupervisors(val);
        } catch(e) {}
      });
    }).catch(()=>{});
  },[unlocked]);

  if (!unlocked) return <PasscodeGate onUnlock={()=>setUnlocked(true)} />;

  const TABS = [
    { id:"scan", label:"UPDATE" },
    { id:"dashboard", label:"DASH" },
    { id:"jobs", label:"JOBS" },
    { id:"import", label:"IMPORT" },
    { id:"setup", label:"SETUP" },
  ];

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={S.nav}>
        <div style={S.navTitle}>⚙ SHOPTRACK</div>
        <div style={S.navTabs}>
          {TABS.map(t=><button key={t.id} style={S.tab(page===t.id)} onClick={()=>setPage(t.id)}>{t.label}</button>)}
        </div>
      </div>
      {page==="scan" && <ScanPage stations={stations} supervisors={supervisors} />}
      {page==="dashboard" && <Dashboard />}
      {page==="jobs" && <JobCardManager />}
      {page==="import" && <BulkImport />}
      {page==="setup" && <SetupPage stations={stations} supervisors={supervisors} onUpdate={(wc,sup)=>{ setStations(wc); setSupervisors(sup); }} />}
    </div>
  );
}
