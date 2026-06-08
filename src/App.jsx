import { useState, useEffect, useRef } from "react";

// ─── HARDCODED FALLBACKS ───────────────────────────────────────────────────
const DEFAULT_STATIONS = ["Receiving","HM-51","HM-52","VM-35","JB-51","DR-31","DR-32","VM-40","CNC-01","CNC-02","Grinding","Inspection","Dispatch"];
const DEFAULT_SUPERVISORS = ["Ritesh","Muzzamil","Sanjeev","Raju","Deepak"];
const PASSCODE = "1234";
const STATUSES = ["Running","WIP","Complete","Hold","Pending"];
const STATUS_COLORS = { Running:"#22c55e", WIP:"#3b82f6", Complete:"#8b5cf6", Hold:"#ef4444", Pending:"#f59e0b" };

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
  async getJob(prodNo) { const r = await sbFetch(`jobs?production_number=eq.${encodeURIComponent(prodNo.trim())}&select=*`); return r?.[0]; },
  async createJob(job) { return sbFetch("jobs", { method:"POST", body:JSON.stringify(job) }); },
  async updateJob(id, patch) { return sbFetch(`jobs?id=eq.${id}`, { method:"PATCH", body:JSON.stringify(patch), prefer:"return=representation" }); },
  async getUpdates(jobId) { return sbFetch(`job_updates?job_id=eq.${jobId}&select=*&order=created_at.desc`); },
  async addUpdate(u) { return sbFetch("job_updates", { method:"POST", body:JSON.stringify(u) }); },
  async getAllUpdates() { return sbFetch("job_updates?select=*&order=created_at.desc&limit=500"); },
  async bulkInsertPO(rows) { return sbFetch("production_orders", { method:"POST", body:JSON.stringify(rows), prefer:"return=minimal" }); },
  async bulkInsertRouting(rows) { return sbFetch("routing_master", { method:"POST", body:JSON.stringify(rows), prefer:"return=minimal" }); },
  async getSettings() { return sbFetch("app_settings?select=*"); },
  async saveSetting(key, value) {
    await sbFetch(`app_settings?key=eq.${key}`, { method:"DELETE", prefer:"return=minimal" });
    return sbFetch("app_settings", { method:"POST", body:JSON.stringify({ key, value:JSON.stringify(value) }) });
  },
};

// ─── HELPERS ───────────────────────────────────────────────────────────────
// QR encodes full job details: PO|MaterialNo|Quantity|Description
function encodeQR(job) {
  return [job.production_number, job.material_number, job.quantity, job.description].join("|");
}
function decodeQR(str) {
  // If contains | it's full details, otherwise it's just a PO number
  if (str.includes("|")) {
    const [production_number, material_number, quantity, description] = str.split("|");
    return { production_number, material_number, quantity, description, fromQR: true };
  }
  return { production_number: str.trim(), fromQR: false };
}
function generateQRDataURL(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
}
function fmt(dt) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
}
function fmtDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}
function toCSV(rows, cols) {
  const header = cols.map(c => `"${c.label}"`).join(",");
  const lines = rows.map(r => cols.map(c => `"${(r[c.key]||"").toString().replace(/"/g,'""')}"`).join(","));
  return [header, ...lines].join("\n");
}
function downloadCSV(content, filename) {
  const blob = new Blob([content], { type:"text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
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
  btn: (v="primary") => ({ background:v==="primary"?"#d4a853":v==="danger"?"#7f1d1d":v==="success"?"#14532d":v==="blue"?"#1d4ed8":"#222", color:v==="primary"?"#0f0f0f":"#e8e2d4", border:v==="ghost"?"1px solid #333":"none", borderRadius:4, padding:"10px 18px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:700, cursor:"pointer", letterSpacing:"0.1em", textTransform:"uppercase" }),
  label: { fontSize:10, color:"#888", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:4, display:"block" },
  statusPill: (s) => ({ display:"inline-block", padding:"2px 10px", borderRadius:3, fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", background:(STATUS_COLORS[s]||"#888")+"22", color:STATUS_COLORS[s]||"#888", border:`1px solid ${(STATUS_COLORS[s]||"#888")}44` }),
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
        <div style={{ fontSize:10, color:"#555", letterSpacing:"0.1em", marginBottom:24, fontFamily:"monospace" }}>HMLV MACHINE SHOP — v2.1</div>
        <div style={{ animation:shake?"shake 0.3s":"none" }}>
          <input style={{ ...S.input, textAlign:"center", fontSize:22, letterSpacing:"0.4em", marginBottom:12 }} type="password" maxLength={6} value={code} onChange={e=>{ setCode(e.target.value); setError(false); }} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••" autoFocus />
          {error && <div style={{ color:"#ef4444", fontSize:11, marginBottom:8 }}>INVALID PASSCODE</div>}
          <button style={{ ...S.btn("primary"), width:"100%" }} onClick={submit}>ENTER</button>
        </div>
        <div style={{ fontSize:10, color:"#444", marginTop:16 }}>DEFAULT: 1234</div>
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
  const [hasLib, setHasLib] = useState(!!window.jsQR);
  useEffect(() => {
    if (window.jsQR) { setHasLib(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
    s.onload = () => setHasLib(true);
    document.head.appendChild(s);
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
          setStatus("Point at QR code");
          const canvas = canvasRef.current;
          function scan() {
            if (!active) return;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              canvas.width = video.videoWidth; canvas.height = video.videoHeight;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(video, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = window.jsQR?.(img.data, img.width, img.height);
              if (code?.data) {
                if (navigator.vibrate) navigator.vibrate([100,50,100]);
                onResult(code.data); return;
              }
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
        <div style={{ position:"absolute", width:220, height:220, border:"2px solid #d4a853", borderRadius:8, boxShadow:"0 0 0 9999px rgba(0,0,0,0.6)" }}>
          {["tl","tr","bl","br"].map(c=><div key={c} style={{ position:"absolute", width:20, height:20, ...(c.includes("t")?{top:-2}:{bottom:-2}), ...(c.includes("l")?{left:-2}:{right:-2}), borderTop:c.includes("t")?"3px solid #d4a853":"none", borderBottom:c.includes("b")?"3px solid #d4a853":"none", borderLeft:c.includes("l")?"3px solid #d4a853":"none", borderRight:c.includes("r")?"3px solid #d4a853":"none" }} />)}
        </div>
      </div>
      <div style={{ padding:16, textAlign:"center", color:"#888", fontFamily:"monospace", fontSize:12 }}>{status}</div>
    </div>
  );
}

// ─── SCREEN 1: LOG UPDATE ──────────────────────────────────────────────────
function LogUpdate({ stations, supervisors, onSaved }) {
  const [scanMode, setScanMode] = useState(null);
  // Step 1 - Job
  const [poInput, setPoInput] = useState("");
  const [job, setJob] = useState(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobErr, setJobErr] = useState("");
  // Step 2 - Machine
  const [station, setStation] = useState("");
  const [stationInput, setStationInput] = useState("");
  const [stationMode, setStationMode] = useState("dropdown"); // dropdown | manual
  // Step 3 - Status & Supervisor
  const [status, setStatus] = useState("WIP");
  const [supervisor, setSupervisor] = useState(supervisors[0]||"");
  // Save
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(1);

  const effectiveStation = stationMode==="manual" ? stationInput.trim() : station;

  // Check deviation
  const routingStations = (job?.routing||[]).map(op=>{
    const map={"OP-10 Rec":"Receiving","OP-20 JB-51":"JB-51","OP-30 DR-31":"DR-31","OP-40 VM-40":"VM-40","OP-50 Grinding":"Grinding","OP-60 Inspection":"Inspection","OP-70 Dispatch":"Dispatch"};
    return map[op]||op;
  });
  const isDeviation = effectiveStation && routingStations.length>0 && !routingStations.includes(effectiveStation);
  const unknownMachine = effectiveStation && !stations.includes(effectiveStation) && stationMode!=="manual";

  async function lookupJob(code) {
    setJobLoading(true); setJobErr("");
    const decoded = decodeQR(code);
    // If QR has full data, use it directly
    if (decoded.fromQR) {
      setJob({ ...decoded, id: null, current_status:"Pending", routing:[] });
      // Also try DB to get routing/id in background
      try {
        const dbJob = await db.getJob(decoded.production_number);
        if (dbJob) setJob(dbJob);
      } catch(e) {}
      setStep(2);
      setJobLoading(false);
      return;
    }
    // Otherwise look up in DB
    try {
      const j = await db.getJob(decoded.production_number);
      if (j) { setJob(j); setStep(2); }
      else setJobErr(`PO "${decoded.production_number}" not found. Check the number or import POs first.`);
    } catch(e) { setJobErr("Lookup failed: " + e.message); }
    setJobLoading(false);
  }

  async function save() {
    if (!job || !effectiveStation || !supervisor) return;
    setSaving(true);
    try {
      const updatePayload = {
        job_id: job.id || null,
        production_number: job.production_number,
        material_number: job.material_number,
        description: job.description,
        quantity: job.quantity,
        supervisor,
        station: effectiveStation,
        status,
        is_deviation: isDeviation,
        deviation_reason: isDeviation ? `Expected routing station, used: ${effectiveStation}` : "",
        unknown_machine: !stations.includes(effectiveStation),
        created_at: new Date().toISOString()
      };
      await db.addUpdate(updatePayload);
      if (job.id) {
        await db.updateJob(job.id, { current_station:effectiveStation, current_status:status, last_updated:new Date().toISOString() });
      }
      if (navigator.vibrate) navigator.vibrate(200);
      setDone(true);
      setTimeout(()=>{ onSaved(); reset(); }, 1500);
    } catch(e) { alert("Save failed: " + e.message); }
    setSaving(false);
  }

  function reset() {
    setJob(null); setPoInput(""); setStation(""); setStationInput("");
    setStatus("WIP"); setStep(1); setDone(false); setSaving(false); setJobErr("");
    setStationMode("dropdown");
  }

  if (done) return (
    <div style={{ padding:24, textAlign:"center" }}>
      <div style={{ ...S.card, padding:40 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>✓</div>
        <div style={{ color:"#22c55e", fontFamily:"monospace", fontSize:14, fontWeight:700, letterSpacing:"0.1em" }}>SAVED — REDIRECTING…</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding:16, maxWidth:520, margin:"0 auto" }}>
      {scanMode && (
        <QRScanner
          onResult={code => {
            setScanMode(null);
            if (scanMode==="job") lookupJob(code);
            if (scanMode==="machine") {
              const found = stations.find(s=>s.toUpperCase()===code.trim().toUpperCase());
              setStation(found||code.trim());
              if (!found) { setStationMode("manual"); setStationInput(code.trim()); }
              setStep(3);
            }
          }}
          onClose={()=>setScanMode(null)}
        />
      )}

      {/* Back button */}
      {step>1 && !done && (
        <button style={{ ...S.btn("ghost"), fontSize:11, marginBottom:12 }} onClick={()=>setStep(step-1)}>← BACK</button>
      )}

      {/* ── STEP 1: SCAN PO ── */}
      {step===1 && (
        <div style={S.card}>
          <div style={{ ...S.sectionTitle }}>STEP 1 — JOB CARD</div>
          <button style={{ ...S.btn("primary"), width:"100%", padding:"16px", fontSize:14, marginBottom:12 }} onClick={()=>setScanMode("job")}>
            ▣ &nbsp; SCAN JOB CARD QR
          </button>
          <div style={{ textAlign:"center", color:"#444", fontSize:10, marginBottom:12 }}>— or enter manually —</div>
          <label style={S.label}>Production Order No.</label>
          <input
            style={{ ...S.input, marginBottom:8 }}
            value={poInput}
            onChange={e=>{ setPoInput(e.target.value); setJobErr(""); }}
            onKeyDown={e=>e.key==="Enter"&&poInput&&lookupJob(poInput)}
            placeholder="e.g. 100031646"
          />
          {jobErr && <div style={{ color:"#ef4444", fontSize:11, marginBottom:8 }}>{jobErr}</div>}
          <button style={{ ...S.btn("primary"), width:"100%" }} onClick={()=>lookupJob(poInput)} disabled={jobLoading||!poInput}>
            {jobLoading ? "SEARCHING…" : "FIND JOB →"}
          </button>
        </div>
      )}

      {/* ── STEP 2: MACHINE ── */}
      {step===2 && job && (
        <div>
          {/* Job summary card */}
          <div style={{ ...S.card, marginBottom:12, borderColor:"#d4a85344" }}>
            <div style={{ fontFamily:"monospace", fontSize:13, fontWeight:700, color:"#d4a853", marginBottom:4 }}>{job.production_number}</div>
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#aaa" }}>{job.material_number} &nbsp;·&nbsp; {job.description}</div>
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#888", marginTop:4 }}>QTY: {job.quantity}</div>
          </div>

          <div style={S.card}>
            <div style={{ ...S.sectionTitle }}>STEP 2 — SELECT MACHINE</div>
            <button style={{ ...S.btn("primary"), width:"100%", padding:"14px", fontSize:13, marginBottom:12 }} onClick={()=>setScanMode("machine")}>
              ▣ &nbsp; SCAN MACHINE QR
            </button>
            <div style={{ textAlign:"center", color:"#444", fontSize:10, marginBottom:12 }}>— or select / type manually —</div>

            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              <button style={{ ...S.tab(stationMode==="dropdown"), flex:1, padding:"7px" }} onClick={()=>setStationMode("dropdown")}>FROM LIST</button>
              <button style={{ ...S.tab(stationMode==="manual"), flex:1, padding:"7px" }} onClick={()=>setStationMode("manual")}>TYPE MANUALLY</button>
            </div>

            {stationMode==="dropdown" ? (
              <select style={{ ...S.select, marginBottom:10 }} value={station} onChange={e=>setStation(e.target.value)}>
                <option value="">-- Select Machine --</option>
                {stations.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input
                style={{ ...S.input, marginBottom:10 }}
                value={stationInput}
                onChange={e=>setStationInput(e.target.value)}
                placeholder="Type machine name e.g. VM-35"
              />
            )}

            {isDeviation && (
              <div style={S.warn}>⚠ DEVIATION — This machine is not in the routing for this job. Update will be flagged but saved.</div>
            )}
            {unknownMachine && effectiveStation && (
              <div style={{ ...S.warn, borderColor:"#6366f1", color:"#a5b4fc", background:"#1e1b4b44" }}>ℹ Unknown machine — not in master list. Will be saved as-is.</div>
            )}

            <button
              style={{ ...S.btn("primary"), width:"100%" }}
              onClick={()=>{ if(effectiveStation) setStep(3); }}
              disabled={!effectiveStation}
            >
              CONFIRM MACHINE →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: STATUS + SUPERVISOR + OK ── */}
      {step===3 && job && (
        <div>
          {/* Summary */}
          <div style={{ ...S.card, marginBottom:12, borderColor:"#d4a85344" }}>
            <div style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#d4a853" }}>{job.production_number} &nbsp;·&nbsp; {effectiveStation}</div>
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#aaa", marginTop:2 }}>{job.material_number} — {job.description}</div>
          </div>

          <div style={S.card}>
            <div style={{ ...S.sectionTitle }}>STEP 3 — LOG STATUS</div>

            {isDeviation && <div style={S.warn}>⚠ DEVIATION — Machine does not match routing. Flagged.</div>}

            {/* Status buttons */}
            <label style={S.label}>Status</label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
              {STATUSES.map(s=>(
                <button key={s} onClick={()=>setStatus(s)} style={{ flex:1, minWidth:80, padding:"10px 8px", borderRadius:4, fontSize:11, fontFamily:"monospace", fontWeight:700, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.06em", border:`1px solid ${STATUS_COLORS[s]}`, background:status===s?STATUS_COLORS[s]:STATUS_COLORS[s]+"22", color:status===s?"#0f0f0f":STATUS_COLORS[s], transition:"all .15s" }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Supervisor */}
            <label style={S.label}>Supervisor</label>
            <select style={{ ...S.select, marginBottom:20 }} value={supervisor} onChange={e=>setSupervisor(e.target.value)}>
              {supervisors.map(s=><option key={s}>{s}</option>)}
            </select>

            {/* OK button */}
            <button
              style={{ ...S.btn("primary"), width:"100%", padding:"16px", fontSize:15, letterSpacing:"0.2em" }}
              onClick={save}
              disabled={saving}
            >
              {saving ? "SAVING…" : "✓  OK — SAVE UPDATE"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SCREEN 2: JOB STATUS TABLE ────────────────────────────────────────────
function JobStatus() {
  const [updates, setUpdates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchPO, setSearchPO] = useState("");
  const [searchMat, setSearchMat] = useState("");
  const [searchMachine, setSearchMachine] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  async function load() {
    setLoading(true);
    try {
      const [j, u] = await Promise.all([db.getJobs(), db.getAllUpdates()]);
      setJobs(j||[]);
      setUpdates(u||[]);
    } catch(e) { console.error(e); }
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  // Build latest-status table: one row per job/PO
  // Merge job info with latest update
  const latestByPO = {};
  // First seed from jobs table
  (jobs||[]).forEach(j=>{
    latestByPO[j.production_number] = {
      po: j.production_number,
      material_no: j.material_number||"",
      description: j.description||"",
      quantity: j.quantity||"",
      machine: j.current_station||"—",
      status: j.current_status||"Pending",
      supervisor: "—",
      last_updated: j.last_updated||j.created_at||"",
    };
  });
  // Overlay with latest update record
  // Sort updates oldest first so latest wins
  const sorted = [...(updates||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  sorted.forEach(u=>{
    const po = u.production_number||u.job_id;
    if (!po) return;
    latestByPO[po] = {
      po: u.production_number||latestByPO[po]?.po||u.job_id,
      material_no: u.material_number||latestByPO[po]?.material_no||"",
      description: u.description||latestByPO[po]?.description||"",
      quantity: u.quantity||latestByPO[po]?.quantity||"",
      machine: u.station||"—",
      status: u.status||"—",
      supervisor: u.supervisor||"—",
      last_updated: u.created_at||"",
      is_deviation: u.is_deviation||false,
      unknown_machine: u.unknown_machine||false,
    };
  });

  let rows = Object.values(latestByPO);

  // Filters
  if (searchPO) rows = rows.filter(r=>r.po?.toLowerCase().includes(searchPO.toLowerCase()));
  if (searchMat) rows = rows.filter(r=>r.material_no?.toLowerCase().includes(searchMat.toLowerCase())||r.description?.toLowerCase().includes(searchMat.toLowerCase()));
  if (searchMachine) rows = rows.filter(r=>r.machine?.toLowerCase().includes(searchMachine.toLowerCase()));
  if (filterStatus!=="All") rows = rows.filter(r=>r.status===filterStatus);

  // Sort newest first
  rows.sort((a,b)=>new Date(b.last_updated)-new Date(a.last_updated));

  function exportExcel() {
    if (!window.XLSX) { alert("Excel engine loading, try again in a second."); return; }
    const data = [
      ["PO No","Material No","Description","Quantity","Machine","Status","Supervisor","Last Updated","Deviation"],
      ...rows.map(r=>[r.po,r.material_no,r.description,r.quantity,r.machine,r.status,r.supervisor,fmt(r.last_updated),r.is_deviation?"YES":""])
    ];
    const ws = window.XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [18,14,28,10,12,10,12,18,10].map(w=>({wch:w}));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Job Status");
    window.XLSX.writeFile(wb, `job_status_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  // Load XLSX for export
  useEffect(()=>{
    if (!window.XLSX) {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      document.head.appendChild(s);
    }
  },[]);

  const STATUS_COUNTS = {};
  STATUSES.forEach(s=>STATUS_COUNTS[s]=Object.values(latestByPO).filter(r=>r.status===s).length);

  return (
    <div style={{ padding:16 }}>
      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
        {[["TOTAL",Object.keys(latestByPO).length,"#d4a853"],["RUNNING",STATUS_COUNTS.Running||0,"#22c55e"],["ON HOLD",STATUS_COUNTS.Hold||0,"#ef4444"]].map(([l,v,c])=>(
          <div key={l} style={{ ...S.card, padding:"10px 12px" }}>
            <div style={{ fontFamily:"monospace", fontSize:9, color:"#555", textTransform:"uppercase" }}>{l}</div>
            <div style={{ fontFamily:"monospace", fontSize:24, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Search & filter bar */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
        <input style={S.input} value={searchPO} onChange={e=>setSearchPO(e.target.value)} placeholder="Search PO…" />
        <input style={S.input} value={searchMat} onChange={e=>setSearchMat(e.target.value)} placeholder="Search Material…" />
        <input style={S.input} value={searchMachine} onChange={e=>setSearchMachine(e.target.value)} placeholder="Search Machine…" />
      </div>

      {/* Status filter pills */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:12 }}>
        {["All",...STATUSES].map(s=>(
          <button key={s} style={S.tab(filterStatus===s)} onClick={()=>setFilterStatus(s)}>{s}</button>
        ))}
      </div>

      {/* Export button */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontFamily:"monospace", fontSize:11, color:"#555" }}>{rows.length} jobs shown</div>
        <button style={{ ...S.btn("success"), padding:"7px 14px", fontSize:11 }} onClick={exportExcel}>
          ⬇ EXPORT EXCEL
        </button>
      </div>

      {loading && <div style={{ textAlign:"center", color:"#555", fontFamily:"monospace", fontSize:12, padding:32 }}>LOADING…</div>}

      {/* Table */}
      {!loading && (
        <div style={{ overflowX:"auto", border:"1px solid #2a2a2a", borderRadius:6 }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"monospace", fontSize:11, minWidth:700 }}>
            <thead>
              <tr style={{ background:"#111" }}>
                {["PO No","Material No","Description","Qty","Machine","Status","Supervisor","Last Updated"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", color:"#555", fontWeight:700, borderBottom:"1px solid #2a2a2a", fontSize:10, whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length===0 && (
                <tr><td colSpan={8} style={{ padding:32, textAlign:"center", color:"#444" }}>No records found</td></tr>
              )}
              {rows.map((r,i)=>(
                <tr key={i} style={{ borderBottom:"1px solid #1a1a1a", background:i%2===0?"transparent":"#111" }}>
                  <td style={{ padding:"8px 12px", color:"#d4a853", fontWeight:700 }}>
                    {r.po}
                    {r.is_deviation && <span style={{ marginLeft:6, fontSize:9, padding:"1px 4px", background:"#78350f44", color:"#fbbf24", border:"1px solid #d97706", borderRadius:3 }}>⚠DEV</span>}
                  </td>
                  <td style={{ padding:"8px 12px", color:"#e8e2d4" }}>{r.material_no}</td>
                  <td style={{ padding:"8px 12px", color:"#aaa", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.description}</td>
                  <td style={{ padding:"8px 12px", color:"#888" }}>{r.quantity}</td>
                  <td style={{ padding:"8px 12px", color:"#e8e2d4" }}>
                    {r.machine}
                    {r.unknown_machine && <span style={{ marginLeft:4, fontSize:9, color:"#6366f1" }}>*</span>}
                  </td>
                  <td style={{ padding:"8px 12px" }}><span style={S.statusPill(r.status)}>{r.status}</span></td>
                  <td style={{ padding:"8px 12px", color:"#888" }}>{r.supervisor}</td>
                  <td style={{ padding:"8px 12px", color:"#555", whiteSpace:"nowrap" }}>{fmt(r.last_updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontFamily:"monospace", fontSize:10, color:"#333", marginTop:8 }}>
        ⚠DEV = routing deviation &nbsp;·&nbsp; * = machine not in master list
      </div>
    </div>
  );
}

// ─── JOB CARD MANAGER ──────────────────────────────────────────────────────
function JobCardManager() {
  const [jobs, setJobs] = useState([]);
  const [mode, setMode] = useState("list");
  const [printJob, setPrintJob] = useState(null);
  const ROUTING_OPS = ["OP-10 Rec","OP-20 JB-51","OP-30 DR-31","OP-40 VM-40","OP-50 Grinding","OP-60 Inspection","OP-70 Dispatch"];
  const [form, setForm] = useState({ production_number:"", material_number:"", description:"", quantity:"", start_date:"", end_date:"", routing:["OP-10 Rec"] });
  const [saving, setSaving] = useState(false);
  useEffect(()=>{ db.getJobs().then(setJobs).catch(()=>{}); },[]);
  function toggleRoute(op) { setForm(f=>({ ...f, routing:f.routing.includes(op)?f.routing.filter(x=>x!==op):[...f.routing,op] })); }
  async function create() {
    if (!form.production_number) return;
    setSaving(true);
    try {
      const job = await db.createJob({ ...form, printed_date:new Date().toISOString().slice(0,10), current_status:"Pending", current_station:"Receiving" });
      setJobs(prev=>[job,...prev]); setMode("list");
    } catch(e) { alert("Error: "+e.message); }
    setSaving(false);
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
        <div style={{ ...S.sectionTitle, margin:0 }}>Production Orders</div>
        <button style={S.btn("primary")} onClick={()=>setMode("create")}>+ NEW</button>
      </div>
      {jobs.length===0 && <div style={{ color:"#444", fontFamily:"monospace", fontSize:12, padding:24, textAlign:"center" }}>No jobs yet. Create one or import via Import tab.</div>}
      {jobs.map(job=>(
        <div key={job.id} style={{ ...S.card, marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontFamily:"monospace", fontWeight:700, color:"#d4a853", fontSize:13 }}>{job.production_number}</span>
            <button style={{ ...S.btn("ghost"), fontSize:10, padding:"4px 10px" }} onClick={()=>setPrintJob(job)}>🖨 PRINT</button>
          </div>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#aaa" }}>{job.material_number} · {job.description} · {job.quantity}</div>
          <div style={{ fontFamily:"monospace", fontSize:10, color:"#555", marginTop:4 }}>{(job.routing||[]).join(" → ")}</div>
        </div>
      ))}
    </div>
  );
}

// ─── PRINT VIEW ────────────────────────────────────────────────────────────
function PrintView({ job, onClose }) {
  // Encode full details in QR: PO|MatNo|Qty|Description
  const qrData = encodeQR(job);
  const qrUrl = generateQRDataURL(qrData);
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
            <div style={{ fontSize:11, color:"#555" }}>Printed: {fmtDate(new Date())}</div>
          </div>
          <img src={qrUrl} alt="QR" style={{ width:90, height:90 }} />
        </div>
        <div style={{ borderTop:"1px solid #000", paddingTop:10, display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 16px" }}>
          {[["Material No",job.material_number],["Description",job.description],["Quantity",job.quantity],["Start Date",fmtDate(job.start_date)],["End Date",fmtDate(job.end_date)]].map(([k,v])=>(
            <div key={k}><div style={{ fontSize:8, textTransform:"uppercase", letterSpacing:"0.1em", color:"#888" }}>{k}</div><div style={{ fontSize:11, fontWeight:700 }}>{v||"—"}</div></div>
          ))}
        </div>
        <div style={{ marginTop:10, borderTop:"1px solid #ccc", paddingTop:8 }}>
          <div style={{ fontSize:8, textTransform:"uppercase", letterSpacing:"0.1em", color:"#888", marginBottom:4 }}>Routing</div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {(job.routing||[]).map((op,i)=><span key={i} style={{ fontSize:10, padding:"2px 8px", border:"1px solid #000", borderRadius:3 }}>{op}</span>)}
          </div>
        </div>
        <div style={{ marginTop:10, borderTop:"1px solid #ccc", paddingTop:8, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
          {["Operator","Station","Sign"].map(f=><div key={f}><div style={{ fontSize:8, textTransform:"uppercase", color:"#888", marginBottom:14 }}>{f}</div><div style={{ borderBottom:"1px solid #000" }} /></div>)}
        </div>
        <div style={{ marginTop:8, fontSize:8, color:"#aaa" }}>QR encodes: PO · Material · Qty · Description</div>
      </div>
      <style>{`@media print { body > *:not(#print-card) { display: none; } }`}</style>
    </div>
  );
}

// ─── SETUP PAGE ────────────────────────────────────────────────────────────
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
      await db.saveSetting("stations", wcList);
      await db.saveSetting("supervisors", supList);
      onUpdate(wcList, supList);
      setSaved(true); setTimeout(()=>setSaved(false),2000);
    } catch(e) { alert("Save failed: "+e.message); }
    setSaving(false);
  }
  function addWC() { if (newWC.trim()&&!wcList.includes(newWC.trim())) { setWcList([...wcList,newWC.trim()]); setNewWC(""); } }
  function removeWC(s) { setWcList(wcList.filter(x=>x!==s)); }
  function addSup() { if (newSup.trim()&&!supList.includes(newSup.trim())) { setSupList([...supList,newSup.trim()]); setNewSup(""); } }
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
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <input style={S.input} value={newWC} onChange={e=>setNewWC(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addWC()} placeholder="Add machine e.g. HM-53" />
            <button style={{ ...S.btn("primary"), whiteSpace:"nowrap" }} onClick={addWC}>+ ADD</button>
          </div>
          <div style={{ display:"grid", gap:6 }}>
            {wcList.map((s,i)=>(
              <div key={s} style={{ ...S.card, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:24, height:24, borderRadius:4, background:"#d4a85322", border:"1px solid #d4a85344", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#d4a853" }}>{i+1}</div>
                <span style={{ fontFamily:"monospace", fontSize:12, flex:1 }}>{s}</span>
                <button onClick={()=>removeWC(s)} style={{ background:"none", border:"1px solid #333", color:"#ef4444", borderRadius:3, padding:"2px 8px", cursor:"pointer", fontFamily:"monospace", fontSize:10 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop:8, fontFamily:"monospace", fontSize:10, color:"#333" }}>Fallback: {DEFAULT_STATIONS.join(", ")}</div>
        </div>
      )}
      {tab==="sup" && (
        <div>
          <div style={S.sectionTitle}>Supervisors</div>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <input style={S.input} value={newSup} onChange={e=>setNewSup(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSup()} placeholder="Add supervisor name" />
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
        </div>
      )}
      <div style={{ marginTop:20 }}>
        <button style={{ ...S.btn(saved?"success":"primary"), width:"100%" }} onClick={saveAll} disabled={saving}>
          {saving?"SAVING…":saved?"✓ SAVED!":"SAVE CHANGES"}
        </button>
        <div style={{ fontFamily:"monospace", fontSize:10, color:"#444", textAlign:"center", marginTop:6 }}>Changes apply to all users immediately</div>
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
  useEffect(()=>{
    if (window.XLSX) { setXlsxReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = ()=>setXlsxReady(true);
    document.head.appendChild(s);
  },[]);

  const PO_COLS = [
    {key:"order_no",label:"Order No",req:true,aliases:["order no","orderno","po no","pono","production order","po number"]},
    {key:"material_no",label:"Material No",req:true,aliases:["material no","material no.","materialno","mat no","matno","material"]},
    {key:"description",label:"Description",aliases:["description","material description","desc"]},
    {key:"qty",label:"Qty",req:true,num:true,aliases:["qty","quantity","order qty"]},
    {key:"uom",label:"UoM",aliases:["uom","unit","unit of measure"]},
    {key:"start_date",label:"Start Date",aliases:["start date","startdate","planned start"]},
    {key:"end_date",label:"End Date",aliases:["end date","enddate","finish date","planned end"]},
    {key:"status",label:"Status",aliases:["status"]},
  ];
  const RM_COLS = [
    {key:"material_no",label:"Material No",req:true,aliases:["material no","material no.","materialno","mat no","matno","material"]},
    {key:"op_no",label:"Op No",req:true,num:true,aliases:["op no","op no.","opno","operation","operation no","operationno","oper","op"]},
    {key:"control_key",label:"Control Key",aliases:["control key","controlkey"]},
    {key:"work_center",label:"Work Center",req:true,aliases:["work center","workcenter","work centre","workcentre","wc","machine","machine center"]},
    {key:"op_description",label:"Op Description",aliases:["op description","opdescription","operation description","operationdescription","description","op desc"]},
    {key:"setup_time",label:"Setup Time (min)",num:true,aliases:["setup time (min)","setup time","setuptime","standard value1","standardvalue1","std value1","setup"]},
    {key:"machine_time",label:"Machine Time (min)",req:true,num:true,aliases:["machine time (min)","machine time","machinetime","standard value2","standardvalue2","standardvalue 2","std value2","machine"]},
    {key:"labor_time",label:"Labor Time (min)",num:true,aliases:["labor time (min)","labor time","labortime","labour time","labourtime","standard value3","standardvalue3","std value3","labor","labour"]},
  ];

  const PO_TPL = [["Order No","Material No","Description","Qty","UoM","Start Date","End Date","Status"],["PO-1001","MAT-001","Wheel Head Body",10,"EA","2026-06-10","2026-06-20","Created"]];
  const RM_TPL = [["Material No","Op No","Work Center","Op Description","Setup Time (min)","Machine Time (min)","Labor Time (min)"],["M00050010",30,"HM-51","MILLING & BORING",60,240,240]];

  function dl(type) {
    const d = type==="po"?PO_TPL:RM_TPL;
    const ws = window.XLSX.utils.aoa_to_sheet(d);
    ws["!cols"] = d[0].map(()=>({wch:22}));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, type==="po"?"Production Orders":"Routing Master");
    window.XLSX.writeFile(wb, `template_${type}.xlsx`);
  }

  function parseFile(file, cols, setter) {
    const r = new FileReader();
    r.onload = e => {
      try {
        const wb = window.XLSX.read(e.target.result, {type:"binary", cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = window.XLSX.utils.sheet_to_json(ws, {defval:"", raw:false, dateNF:"YYYY-MM-DD"});
        const norm = s => s.toString().toLowerCase().replace(/[^a-z0-9]/g,"");
        const rows = raw.map((row, i) => {
          const nr = {};
          Object.keys(row).forEach(k => { nr[norm(k)] = row[k]; });
          const data = {};
          const errors = [];
          cols.forEach(col => {
            const allNames = [col.label, col.key, ...(col.aliases||[])];
            let v = "";
            for (const name of allNames) {
              const found = nr[norm(name)];
              if (found !== undefined && found !== "") { v = found; break; }
            }
            data[col.key] = v;
            if (col.req && (v===""||v===null||v===undefined)) errors.push(col.label+" missing");
            if (col.num && v!==""&&v!==null&&v!==undefined&&isNaN(Number(v))) errors.push(col.label+" must be number");
          });
          return { rowNum:i+2, data, errors, valid:errors.length===0 };
        });
        setter(rows);
      } catch(err) { alert("Cannot read file: "+err.message); }
    };
    r.readAsBinaryString(file);
  }

  async function doImport(type) {
    const rows = (type==="po"?poRows:rmRows).filter(r=>r.valid).map(r=>r.data);
    const setter = type==="po"?setPoStatus:setRmStatus;
    setter({loading:true});
    try {
      if (type==="po") await db.bulkInsertPO(rows);
      else await db.bulkInsertRouting(rows);
      setter({loading:false, msg:`✓ ${rows.length} records imported!`, ok:true});
    } catch(e) { setter({loading:false, msg:"Failed: "+e.message, ok:false}); }
  }

  function dlErrors(rows, type) {
    const cols = type==="po"?PO_COLS:RM_COLS;
    const errRows = rows.filter(r=>!r.valid);
    const h = ["Row",...cols.map(c=>c.label),"Errors"];
    const d = [h,...errRows.map(r=>[r.rowNum,...cols.map(c=>r.data[c.key]??""),r.errors.join("; ")])];
    const ws = window.XLSX.utils.aoa_to_sheet(d);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Errors");
    window.XLSX.writeFile(wb, `errors_${type}.xlsx`);
  }

  function Preview({rows, cols, type, status, onImport}) {
    if (!rows) return null;
    const valid = rows.filter(r=>r.valid).length;
    const errs = rows.length - valid;
    return (
      <div style={{marginTop:16}}>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14}}>
          {[["Total",rows.length,"#d4a853"],["Valid",valid,"#22c55e"],["Errors",errs,errs>0?"#ef4444":"#555"]].map(([l,v,c])=>(
            <div key={l} style={{...S.card,padding:"10px 12px"}}>
              <div style={{fontFamily:"monospace",fontSize:9,color:"#555",textTransform:"uppercase"}}>{l}</div>
              <div style={{fontFamily:"monospace",fontSize:22,fontWeight:700,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{overflowX:"auto",border:"1px solid #2a2a2a",borderRadius:6}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11,minWidth:500}}>
            <thead>
              <tr style={{background:"#111"}}>
                <th style={{padding:"8px 10px",textAlign:"left",color:"#555",fontWeight:700,borderBottom:"1px solid #2a2a2a",fontSize:10}}>#</th>
                {cols.map(c=><th key={c.key} style={{padding:"8px 10px",textAlign:"left",color:"#555",fontWeight:700,borderBottom:"1px solid #2a2a2a",fontSize:10,whiteSpace:"nowrap"}}>{c.label}{c.req?" *":""}</th>)}
                <th style={{padding:"8px 10px",textAlign:"left",color:"#555",fontWeight:700,borderBottom:"1px solid #2a2a2a",fontSize:10}}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0,50).map(row=>(
                <tr key={row.rowNum} style={{background:row.valid?"transparent":"#7f1d1d22",borderBottom:"1px solid #1e1e1e"}}>
                  <td style={{padding:"6px 10px",color:"#444"}}>{row.rowNum}</td>
                  {cols.map(c=><td key={c.key} style={{padding:"6px 10px",color:row.data[c.key]?"#e8e2d4":"#444"}}>{row.data[c.key]||"—"}</td>)}
                  <td style={{padding:"6px 10px"}}>
                    {row.valid
                      ? <span style={{color:"#22c55e",fontSize:10}}>✓ OK</span>
                      : <span style={{color:"#ef4444",fontSize:10}}>{row.errors.join(", ")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length>50 && <div style={{fontFamily:"monospace",fontSize:10,color:"#555",marginTop:6,textAlign:"center"}}>Showing first 50 of {rows.length} rows</div>}
        {status && <div style={{...S.card,marginTop:12,color:status.ok?"#22c55e":"#ef4444",fontFamily:"monospace",fontSize:12,textAlign:"center"}}>{status.loading?"⏳ IMPORTING…":status.msg}</div>}
        <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
          {valid>0 && <button style={{...S.btn("success"),flex:1}} onClick={onImport} disabled={status?.loading}>{status?.loading?"IMPORTING…":`⬆ IMPORT ${valid} ROWS`}</button>}
          {errs>0 && <button style={S.btn("ghost")} onClick={()=>dlErrors(rows,type)}>⬇ ERRORS</button>}
        </div>
      </div>
    );
  }

  function DropZone({type, cols, setter}) {
    const [drag, setDrag] = useState(false);
    return (
      <div
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)parseFile(f,cols,setter);}}
        style={{border:`1.5px dashed ${drag?"#d4a853":"#333"}`,borderRadius:6,padding:"28px 16px",textAlign:"center",background:drag?"#d4a85311":"#111",position:"relative",cursor:"pointer"}}
      >
        <input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const f=e.target.files[0];if(f)parseFile(f,cols,setter);}} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}} />
        <div style={{fontSize:28,marginBottom:8}}>📂</div>
        <div style={{fontFamily:"monospace",fontSize:12,color:"#888"}}><span style={{color:"#d4a853",fontWeight:700}}>Click to browse</span> or drag & drop</div>
        <div style={{fontFamily:"monospace",fontSize:10,color:"#555",marginTop:4}}>Supports .xlsx · .xls · .csv — SAP export works directly</div>
      </div>
    );
  }

  if (!xlsxReady) return <div style={{padding:32,textAlign:"center",color:"#555",fontFamily:"monospace",fontSize:12}}>LOADING…</div>;
  return (
    <div style={{padding:16}}>
      <div style={S.sectionTitle}>Bulk Data Import</div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["po","Production Orders"],["rm","Routing Master"]].map(([id,label])=>(
          <button key={id} style={S.tab(activeTab===id)} onClick={()=>setActiveTab(id)}>{label}</button>
        ))}
      </div>
      {activeTab==="po" && (
        <div>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
            <button style={S.btn("ghost")} onClick={()=>dl("po")}>⬇ TEMPLATE</button>
            <span style={{fontFamily:"monospace",fontSize:10,color:"#555"}}>Or upload SAP export directly</span>
          </div>
          <DropZone type="po" cols={PO_COLS} setter={setPoRows} />
          <Preview rows={poRows} cols={PO_COLS} type="po" status={poStatus} onImport={()=>doImport("po")} />
        </div>
      )}
      {activeTab==="rm" && (
        <div>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
            <button style={S.btn("ghost")} onClick={()=>dl("rm")}>⬇ TEMPLATE</button>
            <span style={{fontFamily:"monospace",fontSize:10,color:"#555"}}>Or upload SAP export directly</span>
          </div>
          <DropZone type="rm" cols={RM_COLS} setter={setRmRows} />
          <Preview rows={rmRows} cols={RM_COLS} type="rm" status={rmStatus} onImport={()=>doImport("rm")} />
        </div>
      )}
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [page, setPage] = useState("log");
  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [supervisors, setSupervisors] = useState(DEFAULT_SUPERVISORS);

  useEffect(()=>{
    if (!unlocked) return;
    db.getSettings().then(rows=>{
      if (!rows||rows.length===0) return;
      rows.forEach(r=>{
        try {
          const val = JSON.parse(r.value);
          if (r.key==="stations"&&Array.isArray(val)&&val.length>0) setStations(val);
          if (r.key==="supervisors"&&Array.isArray(val)&&val.length>0) setSupervisors(val);
        } catch(e) {}
      });
    }).catch(()=>{});
  },[unlocked]);

  if (!unlocked) return <PasscodeGate onUnlock={()=>setUnlocked(true)} />;

  const TABS = [
    { id:"log",    label:"LOG UPDATE" },
    { id:"status", label:"JOB STATUS" },
    { id:"jobs",   label:"PO MASTER" },
    { id:"import", label:"IMPORT" },
    { id:"setup",  label:"SETUP" },
  ];

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={S.nav}>
        <div style={S.navTitle}>⚙ SHOPTRACK</div>
        <div style={S.navTabs}>
          {TABS.map(t=>(
            <button key={t.id} style={S.tab(page===t.id)} onClick={()=>setPage(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      {page==="log"    && <LogUpdate stations={stations} supervisors={supervisors} onSaved={()=>setPage("status")} />}
      {page==="status" && <JobStatus />}
      {page==="jobs"   && <JobCardManager />}
      {page==="import" && <BulkImport />}
      {page==="setup"  && <SetupPage stations={stations} supervisors={supervisors} onUpdate={(wc,sup)=>{ setStations(wc); setSupervisors(sup); }} />}
    </div>
  );
}
