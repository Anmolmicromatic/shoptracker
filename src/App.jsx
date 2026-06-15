import { useState, useEffect, useRef } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const DEFAULT_STATIONS = ["BL-01","BM-01","BM-03","CG-21","Contractor","Other","DR-31","DR-33","DR-34","FT_T","GC-21","GC-23","GC-31","GC-32","GC-33","GC-34","GC-51","HM-51","HM-52","JB-51","Leak test","LT-34","LT-35","MR-22","MR-23","MV-34","MV-36","Paint/Primer","QA_MFG","REC","SG-21","SG-31","SG-32","SG-33","SG-52","SH-21","TL-32","TL-33","TL-34","VNDR","VM-31","VM-32","VM-33","VM-34","VM-35"];
const DEFAULT_SUPERVISORS = ["Ritesh","Muzzamil","Sanjeev","Raju","Deepak"];
const STATUSES = ["Running","WIP","Completed","Hold"];
const STATUS_COLORS = { Running:"#22c55e", WIP:"#3b82f6", Completed:"#8b5cf6", Hold:"#ef4444", Pending:"#f59e0b" };

// ─── SUPABASE ──────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://fsrknhittjbqtbersqjd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmtuaGl0dGpicXRiZXJzcWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MzA1ODAsImV4cCI6MjA5NjMwNjU4MH0.LxY1k1AfCTQpTxeVx-9RppYh4ESVP6kyNR8U3Y2Ng00";

async function sbFetch(path, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": opts.prefer || "return=representation",
      ...opts.headers
    }
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  getJobs: () => sbFetch("jobs?select=*&order=created_at.desc"),
  getJob: async (prodNo) => { const r = await sbFetch(`jobs?production_number=eq.${encodeURIComponent(prodNo.trim())}&select=*`); return r?.[0]; },
  createJob: (job) => sbFetch("jobs", { method:"POST", body:JSON.stringify(job) }),
  updateJob: (id, patch) => sbFetch(`jobs?id=eq.${id}`, { method:"PATCH", body:JSON.stringify(patch), prefer:"return=representation" }),
  addUpdate: (u) => sbFetch("job_updates", { method:"POST", body:JSON.stringify(u) }),
  getAllUpdates: () => sbFetch("job_updates?select=*&order=created_at.desc&limit=500"),
  bulkInsertPO: (rows) => sbFetch("production_orders", { method:"POST", body:JSON.stringify(rows), prefer:"return=minimal" }),
  bulkInsertRouting: (rows) => sbFetch("routing_master", { method:"POST", body:JSON.stringify(rows), prefer:"return=minimal" }),
  getSettings: () => sbFetch("app_settings?select=*"),
  saveSetting: async (key, value) => {
    await sbFetch(`app_settings?key=eq.${key}`, { method:"DELETE", prefer:"return=minimal" });
    return sbFetch("app_settings", { method:"POST", body:JSON.stringify({ key, value:JSON.stringify(value) }) });
  },
  deleteUpdate: (id) => sbFetch(`job_updates?id=eq.${id}`, { method:"DELETE", prefer:"return=minimal" }),
  getLibrary: () => sbFetch("jobs?select=production_number,material_number,quantity,description&order=created_at.desc&limit=1000"),
  deleteJob: (id) => sbFetch(`jobs?id=eq.${id}`, { method:"DELETE", prefer:"return=minimal" }),
  deleteUpdatesByPO: async (po) => {
    await sbFetch(`job_updates?production_number=eq.${encodeURIComponent(po)}`, { method:"DELETE", prefer:"return=minimal" });
    const jobs = await sbFetch(`jobs?production_number=eq.${encodeURIComponent(po)}&select=id`);
    if (jobs?.length) await sbFetch(`job_updates?job_id=eq.${jobs[0].id}`, { method:"DELETE", prefer:"return=minimal" });
  },
};

// ─── HELPERS ───────────────────────────────────────────────────────────────
function sanitize(s) { return String(s||"").replace(/[|<>&"']/g, " ").trim().slice(0,50); }
function makeQRData(po, material, qty) {
  // Compact JSON — no description in QR (fixes issue #4)
  return JSON.stringify({ p: sanitize(po), m: sanitize(material), q: sanitize(qty) });
}
function decodeQR(str) {
  str = (str||"").trim();
  // Handle new compact JSON: {"p":"...","m":"...","q":"..."}
  if (str.startsWith("{")) {
    try {
      const obj = JSON.parse(str);
      return {
        production_number: obj.p || obj.po || obj.productionOrder || obj.production_number || "",
        material_number:   obj.m || obj.material || obj.material_no || "",
        quantity:          obj.q || obj.qty || obj.quantity || "",
        fromQR: true
      };
    } catch(e) {}
  }
  // Handle legacy pipe format
  if (str.includes("|")) {
    const parts = str.split("|");
    return { production_number:parts[0]||"", material_number:parts[1]||"", quantity:parts[2]||"", fromQR:true };
  }
  return { production_number: str, fromQR: false };
}
function qrImageUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(data)}`;
}
function fmt(dt) { if (!dt) return "-"; return new Date(dt).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}); }

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
  btn: (v="primary") => ({ background:v==="primary"?"#d4a853":v==="success"?"#14532d":"#222", color:v==="primary"?"#0f0f0f":"#e8e2d4", border:v==="ghost"?"1px solid #333":"none", borderRadius:4, padding:"10px 18px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:700, cursor:"pointer", letterSpacing:"0.1em", textTransform:"uppercase" }),
  label: { fontSize:10, color:"#888", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:4, display:"block" },
  statusPill: (s) => ({ display:"inline-block", padding:"2px 10px", borderRadius:3, fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", background:(STATUS_COLORS[s]||"#888")+"22", color:STATUS_COLORS[s]||"#888", border:`1px solid ${(STATUS_COLORS[s]||"#888")}44` }),
  sectionTitle: { fontSize:11, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:"#888", marginBottom:12, borderBottom:"1px solid #222", paddingBottom:8 },
  warn: { background:"#78350f33", border:"1px solid #d97706", borderRadius:6, padding:"10px 14px", color:"#fbbf24", fontSize:11, marginBottom:12 },
};

// ─── QR SCANNER ────────────────────────────────────────────────────────────
function QRScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const [status, setStatus] = useState("Starting camera...");
  const [hasLib, setHasLib] = useState(!!window.jsQR);
  useEffect(() => {
    if (window.jsQR) { setHasLib(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
    s.onload = () => setHasLib(true);
    s.onerror = () => setStatus("Failed to load QR scanner");
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
        <span style={{ color:"#d4a853", fontFamily:"monospace", fontSize:11 }}>SCANNING QR</span>
        <button onClick={onClose} style={{ background:"none", border:"1px solid #444", color:"#aaa", borderRadius:4, padding:"4px 12px", cursor:"pointer", fontFamily:"monospace", fontSize:11 }}>CLOSE</button>
      </div>
      <div style={{ flex:1, position:"relative", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <video ref={videoRef} style={{ width:"100%", height:"100%", objectFit:"cover" }} playsInline muted />
        <canvas ref={canvasRef} style={{ display:"none" }} />
        <div style={{ position:"absolute", width:220, height:220, border:"2px solid #d4a853", borderRadius:8, boxShadow:"0 0 0 9999px rgba(0,0,0,0.6)" }} />
      </div>
      <div style={{ padding:16, textAlign:"center", color:"#888", fontFamily:"monospace", fontSize:12 }}>{status}</div>
    </div>
  );
}

// ─── PRINT LABELS ──────────────────────────────────────────────────────────
function PrintLabels() {
  const emptyRow = () => ({ id: Date.now() + Math.random(), po:"", material:"", description:"", qty:"", labels:1 });
  const [rows, setRows] = useState([emptyRow()]);
  const [startPos, setStartPos] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [printProfile, setPrintProfile] = useState("method");
  const [pasteMode, setPasteMode] = useState(false);
  const [error, setError] = useState("");

  function updateRow(id, field, val) { setRows(prev => prev.map(r => r.id===id ? {...r,[field]:val} : r)); }
  function addRow() { setRows(prev => [...prev, emptyRow()]); }
  function removeRow(id) { setRows(prev => prev.filter(r => r.id!==id)); }

  function parsePaste(text) {
    try {
      const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) return;
      const norm = s => s.toString().toLowerCase().replace(/[^a-z0-9]/g,"");
      const firstCells = lines[0].split("\t").map(c => norm(c.trim()));
      const isHeader = firstCells.some(c => ["po","material","description","qty","ponumber","pono","ponum"].includes(c));
      const dataLines = isHeader ? lines.slice(1) : lines;
      if (!dataLines.length) return;
      let poIdx=0, matIdx=1, descIdx=2, qtyIdx=3;
      if (isHeader) {
        firstCells.forEach((c,i) => {
          if (["po","ponumber","pono","ponum","productionorder"].includes(c)) poIdx=i;
          else if (["material","materialno","matno","materialnumber"].includes(c)) matIdx=i;
          else if (["description","desc","materialdescription"].includes(c)) descIdx=i;
          else if (["qty","quantity","orderqty"].includes(c)) qtyIdx=i;
        });
      }
      const imported = dataLines.map(line => {
        const cells = line.split("\t");
        return { id:Date.now()+Math.random(), po:(cells[poIdx]||"").trim(), material:(cells[matIdx]||"").trim(), description:(cells[descIdx]||"").trim(), qty:(cells[qtyIdx]||"").trim(), labels:1 };
      }).filter(r => r.po || r.material);
      if (imported.length) { setRows(imported); setError(""); }
      else setError("No valid rows found. Check column order.");
    } catch(e) { setError("Parse error: " + e.message); }
  }

  function importExcel(file) {
    if (!window.XLSX) { setError("Excel engine not ready, try again"); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = window.XLSX.read(e.target.result, { type:"binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = window.XLSX.utils.sheet_to_json(ws, { defval:"" });
        const norm = s => s.toString().toLowerCase().replace(/[^a-z0-9]/g,"");
        const get = (nr, ...keys) => { for(const k of keys){ const v=nr[norm(k)]; if(v!==undefined&&v!=="") return String(v); } return ""; };
        const imported = raw.map(row => {
          const nr = {};
          Object.keys(row).forEach(k => { nr[norm(k)] = row[k]; });
          return { id:Date.now()+Math.random(), po:get(nr,"po","ponumber","pono","productionorder","orderno"), material:get(nr,"material","materialno","matno"), description:get(nr,"description","desc","materialdescription"), qty:get(nr,"qty","quantity","orderqty"), labels:1 };
        }).filter(r => r.po || r.material);
        if (imported.length) { setRows(imported); setError(""); }
        else setError("No rows found. Check column names.");
      } catch(e) { setError("Cannot read file: " + e.message); }
    };
    reader.readAsBinaryString(file);
  }

  // Load XLSX
  useEffect(() => {
    if (window.XLSX) return;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    document.head.appendChild(s);
  }, []);

  const validRows = rows.filter(r => r.po.trim() && r.material.trim() && r.qty.trim());
  const expandedLabels = validRows.flatMap(r => Array.from({ length: Math.max(1, parseInt(r.labels)||1) }, () => r));
  const totalLabels = expandedLabels.length;
  const availableSlots = 24 - (startPos - 1);

  async function handlePrint(profile="method") {
    if (!validRows.length) { setError("No valid rows to print"); return; }
    setPrintProfile(profile);
    setError("");
    setSaving(true);
    try {
      for (const r of validRows) {
        try {
          await db.createJob({ production_number:r.po.trim(), material_number:r.material.trim(), description:r.description.trim(), quantity:r.qty.trim(), printed_date:new Date().toISOString().slice(0,10), current_status:"Pending", current_station:"Receiving", routing:[] });
        } catch(e) { /* duplicate ok */ }
      }
      setSaved(true);
    } catch(e) { console.warn("DB:", e.message); }
    setSaving(false);
    setShowPrint(true);
  }

  if (showPrint) return <LabelPrintPage rows={expandedLabels} startPos={startPos} onBack={()=>setShowPrint(false)} profile={printProfile} />;

  return (
    <div style={{ padding:16 }}>
      <div style={S.sectionTitle}>PRINT JOB LABELS — 24 per A4 (64x34mm)</div>

      <div style={{ ...S.card, marginBottom:14, padding:"12px 16px" }}>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:pasteMode?10:0 }}>
          <label style={{ ...S.btn("ghost"), cursor:"pointer", position:"relative" }}>
            IMPORT EXCEL
            <input type="file" accept=".xlsx,.xls,.csv" style={{ position:"absolute", inset:0, opacity:0, cursor:"pointer" }} onChange={e=>{ const f=e.target.files[0]; if(f) importExcel(f); e.target.value=""; }} />
          </label>
          <button style={S.btn("ghost")} onClick={()=>setPasteMode(p=>!p)}>
            {pasteMode ? "CANCEL PASTE" : "PASTE FROM EXCEL"}
          </button>
          <button style={S.btn("ghost")} onClick={addRow}>+ ADD ROW</button>
          <span style={{ fontFamily:"monospace", fontSize:10, color:"#555", marginLeft:"auto", alignSelf:"center" }}>{totalLabels} label{totalLabels!==1?"s":""}</span>
        </div>
        {pasteMode && (
          <div>
            <div style={{ fontFamily:"monospace", fontSize:10, color:"#f59e0b", marginBottom:6 }}>
              Select data in Excel including header → Ctrl+C → click below → Ctrl+V
            </div>
            <textarea
              style={{ ...S.input, minHeight:100, fontSize:11, resize:"vertical" }}
              placeholder="Paste Excel data here..."
              onPaste={e => { e.preventDefault(); parsePaste(e.clipboardData.getData("text")); setPasteMode(false); }}
              autoFocus
            />
          </div>
        )}
        {error && <div style={{ color:"#ef4444", fontFamily:"monospace", fontSize:11, marginTop:8 }}>{error}</div>}
      </div>

      {/* Table */}
      <div style={{ overflowX:"auto", border:"1px solid #2a2a2a", borderRadius:6, marginBottom:14 }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"monospace", fontSize:12 }}>
          <thead>
            <tr style={{ background:"#111" }}>
              {["PO No *","Material No *","Description","Qty *","Labels",""].map(h=>(
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:"#555", fontWeight:700, borderBottom:"1px solid #2a2a2a", fontSize:10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row,i) => (
              <tr key={row.id} style={{ borderBottom:"1px solid #1a1a1a", background:i%2===0?"transparent":"#0d0d0d" }}>
                <td style={{ padding:"4px 6px" }}><input value={row.po} onChange={e=>updateRow(row.id,"po",e.target.value)} style={{ ...S.input, padding:"6px 8px", fontSize:12 }} placeholder="100031646" /></td>
                <td style={{ padding:"4px 6px" }}><input value={row.material} onChange={e=>updateRow(row.id,"material",e.target.value)} style={{ ...S.input, padding:"6px 8px", fontSize:12 }} placeholder="M161501" /></td>
                <td style={{ padding:"4px 6px" }}><input value={row.description} onChange={e=>updateRow(row.id,"description",e.target.value)} style={{ ...S.input, padding:"6px 8px", fontSize:12 }} placeholder="Description" /></td>
                <td style={{ padding:"4px 6px", width:80 }}><input value={row.qty} onChange={e=>updateRow(row.id,"qty",e.target.value)} style={{ ...S.input, padding:"6px 8px", fontSize:12 }} placeholder="1" /></td>
                <td style={{ padding:"4px 6px", width:70 }}><input type="number" min="1" max="24" value={row.labels} onChange={e=>updateRow(row.id,"labels",e.target.value)} style={{ ...S.input, padding:"6px 8px", fontSize:12, textAlign:"center" }} /></td>
                <td style={{ padding:"4px 6px", width:30, textAlign:"center" }}><button onClick={()=>removeRow(row.id)} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:14 }}>x</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Start position picker */}
      <div style={{ ...S.card, marginBottom:14 }}>
        <div style={{ fontFamily:"monospace", fontSize:11, color:"#888", marginBottom:8, fontWeight:700 }}>START POSITION ON SHEET</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4, maxWidth:240 }}>
          {Array.from({length:24}).map((_,i) => {
            const pos = i+1;
            const isStart = pos===startPos;
            const isUsed = pos<startPos;
            const willPrint = pos>=startPos && pos<startPos+totalLabels;
            return (
              <button key={pos} onClick={()=>setStartPos(pos)} style={{ padding:"6px 4px", borderRadius:3, fontFamily:"monospace", fontSize:10, fontWeight:700, cursor:"pointer", textAlign:"center", border:isStart?"1px solid #d4a853":willPrint?"1px solid #d4a85366":isUsed?"1px solid #1a1a1a":"1px solid #222", background:isStart?"#d4a853":willPrint?"#d4a85322":isUsed?"#0a0a0a":"#111", color:isStart?"#0f0f0f":willPrint?"#d4a853":isUsed?"#222":"#444" }}>
                {isUsed ? "-" : pos}
              </button>
            );
          })}
        </div>
        {totalLabels > availableSlots && (
          <div style={{ ...S.warn, marginTop:10, marginBottom:0 }}>
            Labels overflow to next sheet automatically.
          </div>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        <button
          style={{ ...S.btn("primary"), padding:"14px", fontSize:12 }}
          onClick={()=>handlePrint("method")}
          disabled={!validRows.length||saving}
        >
          {saving ? "SAVING..." : `PRINT — METHOD
(${totalLabels} labels)`}
        </button>
        <button
          style={{ ...S.btn("ghost"), padding:"14px", fontSize:12, border:"1px solid #d4a853", color:"#d4a853" }}
          onClick={()=>handlePrint("mfg")}
          disabled={!validRows.length||saving}
        >
          {saving ? "SAVING..." : `PRINT — MFG.
(${totalLabels} labels)`}
        </button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:6 }}>
        <div style={{ fontFamily:"monospace", fontSize:9, color:"#555", textAlign:"center" }}>Your printer (Comet/Chrome)</div>
        <div style={{ fontFamily:"monospace", fontSize:9, color:"#555", textAlign:"center" }}>Other printer (Edge) — 10mm higher</div>
      </div>
      {saved && <div style={{ fontFamily:"monospace", fontSize:11, color:"#22c55e", marginTop:8, textAlign:"center" }}>Saved to database</div>}
    </div>
  );
}

// ─── LABEL PRINT PAGE ─────────────────────────────────────────────────────
function LabelPrintPage({ rows, startPos, onBack, profile="method" }) {
  // profile: "method" = 16.479mm top (current), "mfg" = 6.479mm top (10mm less)
  const topMargin = profile === "mfg" ? "6.479mm" : "16.479mm";
  const total = Math.ceil(Math.max(rows.length + startPos - 1, 24) / 24) * 24;
  const slots = [];
  for (let i = 0; i < startPos - 1; i++) slots.push(null);
  rows.forEach(r => slots.push(r));
  while (slots.length < total) slots.push(null);

  const sheets = [];
  for (let i = 0; i < slots.length; i += 24) {
    const s = slots.slice(i, i+24);
    while (s.length < 24) s.push(null);
    sheets.push(s);
  }

  return (
    <div>
      <div className="no-print" style={{ padding:"12px 16px", background:"#1a1a1a", borderBottom:"1px solid #2a2a2a" }}>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
          <button style={S.btn("ghost")} onClick={onBack}>BACK</button>
          <button style={{ ...S.btn("primary"), padding:"10px 24px" }} onClick={()=>window.print()}>PRINT</button>
          <span style={{ fontFamily:"monospace", fontSize:11, color:"#888" }}>
            {rows.length} labels · {sheets.length} sheet{sheets.length!==1?"s":""}
          </span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
          {[
            ["Paper","A4"],
            ["Margins","None"],
            ["Scale","100%"],
            ["Headers & Footers","OFF ← IMPORTANT"],
          ].map(([k,v]) => (
            <div key={k} style={{ background:"#111", border:"1px solid #2a2a2a", borderRadius:4, padding:"6px 10px" }}>
              <div style={{ fontFamily:"monospace", fontSize:9, color:"#555", textTransform:"uppercase" }}>{k}</div>
              <div style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, color: k==="Headers & Footers" ? "#f59e0b" : "#22c55e" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div id="print-area">
        {sheets.map((sheet, si) => (
          <div key={si} className="label-sheet" style={{ paddingTop: topMargin }}>
            <div className="label-grid">
              {sheet.map((slot, li) => {
                if (!slot) return <div key={li} className="label-empty" />;
                const qrData = makeQRData(slot.po, slot.material, slot.qty);
                return (
                  <div key={li} className="label-cell">
                    <img
                      className="l-qr"
                      src={qrImageUrl(qrData)}
                      alt="QR"
                      onError={e=>{ e.target.style.display="none"; }}
                    />
                    <div className="label-txt">
                      <div className="l-po">PO: {slot.po}</div>
                      <div className="l-line">MAT: {slot.material}</div>
                      <div className="l-line">QTY: {slot.qty}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0mm; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: fixed; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
          .label-sheet { page-break-after: always; }
        }
        .label-sheet {
          width: 210mm;
          background: white;
          margin: 16px auto;
          box-shadow: 0 2px 20px rgba(0,0,0,0.4);
          padding: 0 0 5mm 7.597mm;
          box-sizing: border-box;
        }
        .label-grid {
          display: grid;
          grid-template-columns: 64mm 64mm 64mm;
          grid-auto-rows: 34mm;
          column-gap: 2.472mm;
          row-gap: 0mm;
        }
        .label-cell {
          width: 64mm;
          height: 34mm;
          border: 0.3mm solid #aaa;
          display: flex;
          flex-direction: row;
          align-items: center;
          padding: 2mm;
          gap: 0;
          overflow: hidden;
          box-sizing: border-box;
        }
        .label-empty {
          width: 64mm;
          height: 34mm;
          border: 0.2mm dashed #ddd;
          box-sizing: border-box;
        }
        .l-qr {
          width: 28mm;
          height: 28mm;
          flex: 0 0 28mm;
          display: block;
        }
        .label-txt {
          flex: 0 0 30mm;
          width: 30mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2mm;
          padding-left: 2mm;
        }
        .l-po   { font-family: Courier New, monospace; font-size: 9pt; font-weight: 900; white-space: nowrap; color: #000; line-height: 1.2; }
        .l-line { font-family: Courier New, monospace; font-size: 7.5pt; font-weight: 700; white-space: nowrap; color: #000; line-height: 1.2; }
      `}</style>
    </div>
  );
}

// ─── LOG UPDATE ────────────────────────────────────────────────────────────
function LogUpdate({ stations, supervisors, onSaved }) {
  const [scanMode, setScanMode] = useState(null);

  // Job fields
  const [poInput, setPoInput] = useState("");
  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [poError, setPoError] = useState("");
  const [autoFilled, setAutoFilled] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // Machine
  const [station, setStation] = useState("");
  const [stationInput, setStationInput] = useState("");
  const [stationMode, setStationMode] = useState("dropdown");

  // Status & supervisor
  const [status, setStatus] = useState("");
  const [supervisor, setSupervisor] = useState("");

  // Save
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Library
  const [library, setLibrary] = useState([]);

  useEffect(() => {
    db.getLibrary().then(rows => {
      if (rows) setLibrary(rows);
    }).catch(()=>{});
  }, []);

  const effectiveStation = stationMode==="manual" ? stationInput.trim() : station;

  // Partial PO search — match last digits
  function searchLibrary(input) {
    const val = input.trim();
    if (!val) { setSuggestions([]); setPoError(""); setAutoFilled(false); setManualEntry(false); return; }
    const matches = library.filter(r =>
      r.production_number === val ||
      r.production_number?.endsWith(val) ||
      r.production_number?.includes(val)
    );
    if (matches.length === 1) {
      // Exact single match — auto fill
      fillFromLibrary(matches[0]);
      setSuggestions([]);
    } else if (matches.length > 1) {
      // Multiple matches — show dropdown
      setSuggestions(matches);
      setAutoFilled(false);
      setManualEntry(false);
      setPoError("");
    } else {
      // No match
      setSuggestions([]);
      setAutoFilled(false);
    }
  }

  function fillFromLibrary(row) {
    setPoInput(row.production_number);
    setMaterial(row.material_number || "");
    setQty(row.quantity || "");
    setAutoFilled(true);
    setManualEntry(false);
    setPoError("");
    setSuggestions([]);
  }

  function handlePoBlur() {
    if (suggestions.length === 0 && !autoFilled && poInput.trim()) {
      // Not found in library
      setPoError("PO not found in library — enter Material No. and Qty manually");
      setManualEntry(true);
    }
  }

  function handleQRScan(code) {
    setScanMode(null);
    if (scanMode === "job") {
      const d = decodeQR(code);
      const po = d.production_number || "";
      setPoInput(po);
      // Try library first
      const found = library.find(r => r.production_number === po);
      if (found) {
        fillFromLibrary(found);
      } else {
        setMaterial(d.material_number || "");
        setQty(d.quantity || "");
        if (d.material_number) { setAutoFilled(true); setManualEntry(false); }
        else { setManualEntry(true); setPoError("PO not in library — verify details below"); }
      }
    }
    if (scanMode === "machine") {
      const found = stations.find(s => s.toUpperCase() === code.trim().toUpperCase());
      if (found) { setStation(found); setStationMode("dropdown"); }
      else { setStationInput(code.trim()); setStationMode("manual"); }
    }
  }

  const canSave = poInput.trim() && material.trim() && qty.trim() && effectiveStation && status && supervisor;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await db.addUpdate({
        job_id: null,
        production_number: poInput.trim(),
        material_number: material.trim(),
        quantity: qty.trim(),
        supervisor, station: effectiveStation, status,
        is_deviation: false,
        unknown_machine: !stations.includes(effectiveStation),
        created_at: new Date().toISOString()
      });
      if (navigator.vibrate) navigator.vibrate(200);
      setDone(true);
      setTimeout(() => { onSaved(); reset(); }, 1500);
    } catch(e) { alert("Save failed: " + e.message); }
    setSaving(false);
  }

  function reset() {
    setPoInput(""); setMaterial(""); setQty("");
    setStation(""); setStationInput(""); setStationMode("dropdown");
    setStatus(""); setSupervisor("");
    setPoError(""); setAutoFilled(false); setManualEntry(false); setSuggestions([]);
    setDone(false); setSaving(false);
  }

  if (done) return (
    <div style={{ padding:24, textAlign:"center" }}>
      <div style={{ ...S.card, padding:40 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>✓</div>
        <div style={{ color:"#22c55e", fontFamily:"monospace", fontSize:14, fontWeight:700 }}>SAVED!</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding:16, maxWidth:520, margin:"0 auto" }}>
      {scanMode && <QRScanner onResult={handleQRScan} onClose={()=>setScanMode(null)} />}

      {/* ── SCAN BUTTON ── */}
      <button
        style={{ ...S.btn("primary"), width:"100%", padding:"16px", fontSize:14, marginBottom:16, letterSpacing:"0.1em" }}
        onClick={()=>setScanMode("job")}
      >
        ▣  SCAN JOB LABEL QR
      </button>

      <div style={{ textAlign:"center", color:"#444", fontSize:10, marginBottom:14, fontFamily:"monospace" }}>— or enter PO number (full or last 4 digits) —</div>

      {/* ── PO INPUT ── */}
      <div style={{ ...S.card, marginBottom:12 }}>

        {/* PO Number */}
        <div style={{ marginBottom:10, position:"relative" }}>
          <label style={S.label}>Production Order No.</label>
          <input
            style={{ ...S.input, borderColor: poError ? "#ef4444" : autoFilled ? "#22c55e44" : "#333" }}
            value={poInput}
            onChange={e => { setPoInput(e.target.value); searchLibrary(e.target.value); }}
            onBlur={handlePoBlur}
            placeholder="Full PO or last 4 digits e.g. 2338"
            autoComplete="off"
          />
          {/* Suggestions — shown as cards below input */}
          {suggestions.length > 0 && (
            <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ fontFamily:"monospace", fontSize:10, color:"#888" }}>
                {suggestions.length} match{suggestions.length!==1?"es":""} found — tap to select:
              </div>
              {suggestions.map(s => (
                <div
                  key={s.production_number}
                  onClick={() => fillFromLibrary(s)}
                  style={{ background:"#111", border:"1px solid #d4a85366", borderRadius:6, padding:"10px 14px", cursor:"pointer", transition:"border .15s" }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="#d4a853"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="#d4a85366"}
                >
                  <div style={{ fontFamily:"monospace", fontSize:13, fontWeight:700, color:"#d4a853", marginBottom:4 }}>
                    PO: {s.production_number}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
                    <div>
                      <div style={{ fontFamily:"monospace", fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:"0.1em" }}>Material No.</div>
                      <div style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#e8e2d4" }}>{s.material_number}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily:"monospace", fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:"0.1em" }}>Quantity</div>
                      <div style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#e8e2d4" }}>{s.quantity}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily:"monospace", fontSize:9, color:"#555", marginTop:4, textAlign:"right" }}>Tap to select →</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auto-filled indicator */}
        {autoFilled && (
          <div style={{ background:"#14532d33", border:"1px solid #22c55e44", borderRadius:4, padding:"5px 10px", marginBottom:10, fontFamily:"monospace", fontSize:10, color:"#22c55e" }}>
            ✓ Auto-filled from label library
          </div>
        )}

        {/* PO Error */}
        {poError && (
          <div style={{ background:"#7f1d1d33", border:"1px solid #ef444444", borderRadius:4, padding:"5px 10px", marginBottom:10, fontFamily:"monospace", fontSize:10, color:"#ef4444" }}>
            ⚠ {poError}
          </div>
        )}

        {/* Material & Qty — show always but editable */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <div>
            <label style={S.label}>Material No. *</label>
            <input
              style={{ ...S.input, borderColor: autoFilled ? "#22c55e44" : "#333" }}
              value={material}
              onChange={e=>setMaterial(e.target.value)}
              placeholder="M161501"
              readOnly={autoFilled && !manualEntry}
            />
          </div>
          <div>
            <label style={S.label}>Quantity *</label>
            <input
              style={{ ...S.input, borderColor: autoFilled ? "#22c55e44" : "#333" }}
              value={qty}
              onChange={e=>setQty(e.target.value)}
              placeholder="10 Nos"
              readOnly={autoFilled && !manualEntry}
            />
          </div>
        </div>
        {autoFilled && (
          <button
            style={{ ...S.btn("ghost"), fontSize:9, padding:"3px 8px", marginTop:6 }}
            onClick={()=>{ setManualEntry(true); setAutoFilled(false); }}
          >
            EDIT DETAILS
          </button>
        )}
      </div>

      {/* ── MACHINE ── */}
      <div style={{ ...S.card, marginBottom:12 }}>
        <label style={S.label}>Machine / Work Center *</label>
        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
          <button style={{ ...S.tab(stationMode==="dropdown"), flex:1, padding:"6px" }} onClick={()=>setStationMode("dropdown")}>LIST</button>
          <button style={{ ...S.tab(stationMode==="manual"), flex:1, padding:"6px" }} onClick={()=>setStationMode("manual")}>TYPE</button>
          <button style={{ ...S.btn("ghost"), fontSize:10, padding:"6px 10px" }} onClick={()=>setScanMode("machine")}>▣ SCAN</button>
        </div>
        {stationMode==="dropdown"
          ? <select style={S.select} value={station} onChange={e=>setStation(e.target.value)}>
              <option value="">-- Select Machine --</option>
              {stations.map(s=><option key={s}>{s}</option>)}
            </select>
          : <input style={S.input} value={stationInput} onChange={e=>setStationInput(e.target.value)} placeholder="Type machine name e.g. HM-51" />
        }
        {effectiveStation && !stations.includes(effectiveStation) && (
          <div style={{ fontFamily:"monospace", fontSize:10, color:"#6366f1", marginTop:6 }}>* Not in master list — saved as entered</div>
        )}
      </div>

      {/* ── STATUS ── */}
      <div style={{ ...S.card, marginBottom:12 }}>
        <label style={S.label}>Status *</label>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {STATUSES.map(s => (
            <button key={s} onClick={()=>setStatus(s)} style={{ flex:1, minWidth:70, padding:"10px 6px", borderRadius:4, fontSize:11, fontFamily:"monospace", fontWeight:700, cursor:"pointer", textTransform:"uppercase", border:`1px solid ${status===s?STATUS_COLORS[s]:"#333"}`, background:status===s?STATUS_COLORS[s]:"#111", color:status===s?"#0f0f0f":"#888" }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── SUPERVISOR ── */}
      <div style={{ ...S.card, marginBottom:16 }}>
        <label style={S.label}>Supervisor *</label>
        <select style={S.select} value={supervisor} onChange={e=>setSupervisor(e.target.value)}>
          <option value="">-- Select Supervisor --</option>
          {supervisors.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      {/* ── SAVE ── */}
      <button
        style={{ ...S.btn("primary"), width:"100%", padding:"16px", fontSize:14, letterSpacing:"0.15em", opacity: canSave ? 1 : 0.5 }}
        onClick={save}
        disabled={saving || !canSave}
      >
        {saving ? "SAVING..." :
         !poInput.trim() ? "SCAN OR ENTER PO FIRST" :
         !material.trim() ? "ENTER MATERIAL NO." :
         !qty.trim() ? "ENTER QUANTITY" :
         !effectiveStation ? "SELECT MACHINE" :
         !status ? "SELECT STATUS" :
         !supervisor ? "SELECT SUPERVISOR" :
         "✓  OK — SAVE UPDATE"}
      </button>
    </div>
  );
}

// ─── JOB STATUS ────────────────────────────────────────────────────────────// ─── JOB STATUS ────────────────────────────────────────────────────────────
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
    try { const [j,u] = await Promise.all([db.getJobs(), db.getAllUpdates()]); setJobs(j||[]); setUpdates(u||[]); }
    catch(e) { console.error(e); }
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);
  useEffect(()=>{ if(!window.XLSX){const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";document.head.appendChild(s);} },[]);

  const latestByPO = {};
  (jobs||[]).forEach(j => { latestByPO[j.production_number] = { po:j.production_number, material_no:j.material_number||"", description:j.description||"", quantity:j.quantity||"", machine:j.current_station||"—", status:j.current_status||"Pending", supervisor:"—", last_updated:j.last_updated||j.created_at||"" }; });
  [...(updates||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).forEach(u => {
    const po = u.production_number || latestByPO[u.job_id]?.po || u.job_id;
    if (!po) return;
    latestByPO[po] = { po, material_no:u.material_number||latestByPO[po]?.material_no||"", description:u.description||latestByPO[po]?.description||"", quantity:u.quantity||latestByPO[po]?.quantity||"", machine:u.station||"—", status:u.status||"—", supervisor:u.supervisor||"—", last_updated:u.created_at||"", is_deviation:u.is_deviation||false };
  });

  async function deleteRow(po) {
    if (!window.confirm(`Delete all records for PO: ${po}?`)) return;
    try {
      const ids = updates.filter(u=>u.production_number===po).map(u=>u.id);
      for (const id of ids) await db.deleteUpdate(id);
      if (!ids.length) await db.deleteUpdatesByPO(po);
      load();
    } catch(e) { alert("Delete failed: "+e.message); }
  }

  let rows = Object.values(latestByPO);
  if (searchPO) rows = rows.filter(r=>r.po?.toLowerCase().includes(searchPO.toLowerCase()));
  if (searchMat) rows = rows.filter(r=>r.material_no?.toLowerCase().includes(searchMat.toLowerCase())||r.description?.toLowerCase().includes(searchMat.toLowerCase()));
  if (searchMachine) rows = rows.filter(r=>r.machine?.toLowerCase().includes(searchMachine.toLowerCase()));
  if (filterStatus!=="All") rows = rows.filter(r=>r.status===filterStatus);
  rows.sort((a,b)=>new Date(b.last_updated)-new Date(a.last_updated));

  function exportExcel() {
    if (!window.XLSX) { alert("Try again"); return; }
    const ws = window.XLSX.utils.aoa_to_sheet([["PO No","Material No","Description","Quantity","Machine","Status","Supervisor","Last Updated"],...rows.map(r=>[r.po,r.material_no,r.description,r.quantity,r.machine,r.status,r.supervisor,fmt(r.last_updated)])]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Job Status");
    window.XLSX.writeFile(wb, `job_status_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const counts = {};
  STATUSES.forEach(s=>counts[s]=Object.values(latestByPO).filter(r=>r.status===s).length);

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
        {[["TOTAL",Object.keys(latestByPO).length,"#d4a853"],["RUNNING",counts.Running||0,"#22c55e"],["ON HOLD",counts.Hold||0,"#ef4444"]].map(([l,v,c])=>(
          <div key={l} style={{ ...S.card, padding:"10px 12px" }}>
            <div style={{ fontFamily:"monospace", fontSize:9, color:"#555", textTransform:"uppercase" }}>{l}</div>
            <div style={{ fontFamily:"monospace", fontSize:24, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
        <input style={S.input} value={searchPO} onChange={e=>setSearchPO(e.target.value)} placeholder="Search PO..." />
        <input style={S.input} value={searchMat} onChange={e=>setSearchMat(e.target.value)} placeholder="Search Material..." />
        <input style={S.input} value={searchMachine} onChange={e=>setSearchMachine(e.target.value)} placeholder="Search Machine..." />
      </div>
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:10 }}>
        {["All",...STATUSES].map(s=><button key={s} style={S.tab(filterStatus===s)} onClick={()=>setFilterStatus(s)}>{s}</button>)}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontFamily:"monospace", fontSize:11, color:"#555" }}>{rows.length} jobs · <span style={{ cursor:"pointer", color:"#d4a853" }} onClick={load}>refresh</span></span>
        <button style={{ ...S.btn("success"), padding:"7px 14px", fontSize:11 }} onClick={exportExcel}>EXPORT EXCEL</button>
      </div>
      {loading && <div style={{ textAlign:"center", color:"#555", fontFamily:"monospace", padding:32 }}>LOADING...</div>}
      {!loading && (
        <div style={{ overflowX:"auto", border:"1px solid #2a2a2a", borderRadius:6 }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"monospace", fontSize:11, minWidth:700 }}>
            <thead>
              <tr style={{ background:"#111" }}>
                {["PO No","Material No","Description","Qty","Machine","Status","Supervisor","Last Updated",""].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", color:"#555", fontWeight:700, borderBottom:"1px solid #2a2a2a", fontSize:10, whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length===0 && <tr><td colSpan={9} style={{ padding:32, textAlign:"center", color:"#444" }}>No records yet</td></tr>}
              {rows.map((r,i) => (
                <tr key={i} style={{ borderBottom:"1px solid #1a1a1a", background:i%2===0?"transparent":"#0d0d0d" }}>
                  <td style={{ padding:"8px 12px", color:"#d4a853", fontWeight:700 }}>{r.po}</td>
                  <td style={{ padding:"8px 12px" }}>{r.material_no}</td>
                  <td style={{ padding:"8px 12px", color:"#aaa", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.description}</td>
                  <td style={{ padding:"8px 12px", color:"#888" }}>{r.quantity}</td>
                  <td style={{ padding:"8px 12px" }}>{r.machine}</td>
                  <td style={{ padding:"8px 12px" }}><span style={S.statusPill(r.status)}>{r.status}</span></td>
                  <td style={{ padding:"8px 12px", color:"#888" }}>{r.supervisor}</td>
                  <td style={{ padding:"8px 12px", color:"#555", whiteSpace:"nowrap" }}>{fmt(r.last_updated)}</td>
                  <td style={{ padding:"4px 8px" }}><button onClick={()=>deleteRow(r.po)} style={{ background:"none", border:"1px solid #333", color:"#ef4444", borderRadius:3, padding:"2px 8px", cursor:"pointer", fontFamily:"monospace", fontSize:10 }}>DEL</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── SETUP ─────────────────────────────────────────────────────────────────
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
    try { await db.saveSetting("stations",wcList); await db.saveSetting("supervisors",supList); onUpdate(wcList,supList); setSaved(true); setTimeout(()=>setSaved(false),2000); }
    catch(e) { alert("Save failed: "+e.message); }
    setSaving(false);
  }
  function addWC() { if(newWC.trim()&&!wcList.includes(newWC.trim())){setWcList([...wcList,newWC.trim()]);setNewWC("");} }
  function removeWC(s) { setWcList(wcList.filter(x=>x!==s)); }
  function addSup() { if(newSup.trim()&&!supList.includes(newSup.trim())){setSupList([...supList,newSup.trim()]);setNewSup("");} }
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
            <input style={S.input} value={newWC} onChange={e=>setNewWC(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addWC()} placeholder="e.g. HM-53" />
            <button style={{ ...S.btn("primary"), whiteSpace:"nowrap" }} onClick={addWC}>+ ADD</button>
          </div>
          <div style={{ display:"grid", gap:6 }}>
            {wcList.map((s,i)=>(
              <div key={s} style={{ ...S.card, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:24, height:24, borderRadius:4, background:"#d4a85322", border:"1px solid #d4a85344", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#d4a853" }}>{i+1}</div>
                <span style={{ fontFamily:"monospace", fontSize:12, flex:1 }}>{s}</span>
                <button onClick={()=>removeWC(s)} style={{ background:"none", border:"1px solid #333", color:"#ef4444", borderRadius:3, padding:"2px 8px", cursor:"pointer", fontFamily:"monospace", fontSize:10 }}>X</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab==="sup" && (
        <div>
          <div style={S.sectionTitle}>Supervisors</div>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <input style={S.input} value={newSup} onChange={e=>setNewSup(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSup()} placeholder="Supervisor name" />
            <button style={{ ...S.btn("primary"), whiteSpace:"nowrap" }} onClick={addSup}>+ ADD</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {supList.map(s=>(
              <div key={s} style={{ ...S.card, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:"#333", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#d4a853" }}>{s[0]}</div>
                <span style={{ fontFamily:"monospace", fontSize:12, flex:1 }}>{s}</span>
                <button onClick={()=>removeSup(s)} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:14 }}>X</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop:20 }}>
        <button style={{ ...S.btn(saved?"success":"primary"), width:"100%" }} onClick={saveAll} disabled={saving}>
          {saving?"SAVING...":saved?"SAVED!":"SAVE CHANGES"}
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
  useEffect(()=>{ if(window.XLSX){setXlsxReady(true);return;} const s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload=()=>setXlsxReady(true); document.head.appendChild(s); },[]);

  const PO_COLS = [
    {key:"order_no",label:"Order No",req:true,aliases:["orderno","po no","pono","production order","po number","ponumber"]},
    {key:"material_no",label:"Material No",req:true,aliases:["material no","materialno","mat no","matno","material"]},
    {key:"description",label:"Description",aliases:["description","material description","desc"]},
    {key:"qty",label:"Qty",req:true,num:true,aliases:["qty","quantity","order qty"]},
    {key:"uom",label:"UoM",aliases:["uom","unit"]},
    {key:"start_date",label:"Start Date",aliases:["start date","startdate"]},
    {key:"end_date",label:"End Date",aliases:["end date","enddate"]},
    {key:"status",label:"Status",aliases:["status"]},
  ];
  const RM_COLS = [
    {key:"material_no",label:"Material No",req:true,aliases:["material no","material no.","materialno","mat no","matno","material"]},
    {key:"op_no",label:"Op No",req:true,num:true,aliases:["op no","operation","operationno","oper","op"]},
    {key:"work_center",label:"Work Center",req:true,aliases:["work center","workcenter","wc","machine"]},
    {key:"op_description",label:"Op Description",aliases:["op description","operation description","description"]},
    {key:"setup_time",label:"Setup Time (min)",num:true,aliases:["setup time","setuptime","standard value1","standardvalue1"]},
    {key:"machine_time",label:"Machine Time (min)",req:true,num:true,aliases:["machine time","machinetime","standard value2","standardvalue2"]},
    {key:"labor_time",label:"Labor Time (min)",num:true,aliases:["labor time","labortime","standard value3","standardvalue3"]},
  ];

  function parseFile(file, cols, setter) {
    const r = new FileReader();
    r.onload = e => {
      try {
        const wb = window.XLSX.read(e.target.result, {type:"binary",cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = window.XLSX.utils.sheet_to_json(ws, {defval:"",raw:false,dateNF:"YYYY-MM-DD"});
        const norm = s => s.toString().toLowerCase().replace(/[^a-z0-9]/g,"");
        const rows = raw.map((row,i) => {
          const nr = {};
          Object.keys(row).forEach(k => { nr[norm(k)]=row[k]; });
          const data = {};
          const errors = [];
          cols.forEach(col => {
            const allNames = [col.label, col.key, ...(col.aliases||[])];
            let v = "";
            for (const name of allNames) { const found = nr[norm(name)]; if(found!==undefined&&found!==""){v=found;break;} }
            data[col.key] = v;
            if (col.req&&(v===""||v===null||v===undefined)) errors.push(col.label+" missing");
            if (col.num&&v!==""&&isNaN(Number(v))) errors.push(col.label+" must be number");
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
      if(type==="po") await db.bulkInsertPO(rows); else await db.bulkInsertRouting(rows);
      setter({loading:false,msg:`${rows.length} records imported!`,ok:true});
    } catch(e) { setter({loading:false,msg:"Failed: "+e.message,ok:false}); }
  }

  function Preview({rows,cols,type,status,onImport}) {
    if(!rows) return null;
    const valid=rows.filter(r=>r.valid).length, errs=rows.length-valid;
    return (
      <div style={{marginTop:16}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          {[["Total",rows.length,"#d4a853"],["Valid",valid,"#22c55e"],["Errors",errs,errs>0?"#ef4444":"#555"]].map(([l,v,c])=>(
            <div key={l} style={{...S.card,padding:"10px 12px"}}>
              <div style={{fontFamily:"monospace",fontSize:9,color:"#555",textTransform:"uppercase"}}>{l}</div>
              <div style={{fontFamily:"monospace",fontSize:22,fontWeight:700,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{overflowX:"auto",border:"1px solid #2a2a2a",borderRadius:6}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11,minWidth:500}}>
            <thead><tr style={{background:"#111"}}>
              <th style={{padding:"8px 10px",textAlign:"left",color:"#555",fontSize:10,borderBottom:"1px solid #2a2a2a"}}>#</th>
              {cols.map(c=><th key={c.key} style={{padding:"8px 10px",textAlign:"left",color:"#555",fontWeight:700,borderBottom:"1px solid #2a2a2a",fontSize:10,whiteSpace:"nowrap"}}>{c.label}{c.req?" *":""}</th>)}
              <th style={{padding:"8px 10px",textAlign:"left",color:"#555",fontSize:10,borderBottom:"1px solid #2a2a2a"}}>OK?</th>
            </tr></thead>
            <tbody>
              {rows.slice(0,50).map(row=>(
                <tr key={row.rowNum} style={{background:row.valid?"transparent":"#7f1d1d22",borderBottom:"1px solid #1e1e1e"}}>
                  <td style={{padding:"6px 10px",color:"#444"}}>{row.rowNum}</td>
                  {cols.map(c=><td key={c.key} style={{padding:"6px 10px",color:row.data[c.key]?"#e8e2d4":"#444"}}>{row.data[c.key]||"—"}</td>)}
                  <td style={{padding:"6px 10px"}}>{row.valid?<span style={{color:"#22c55e"}}>OK</span>:<span style={{color:"#ef4444",fontSize:10}}>{row.errors.join(", ")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {status&&<div style={{...S.card,marginTop:12,color:status.ok?"#22c55e":"#ef4444",fontFamily:"monospace",fontSize:12,textAlign:"center"}}>{status.loading?"IMPORTING...":status.msg}</div>}
        {valid>0&&<button style={{...S.btn("success"),width:"100%",marginTop:12}} onClick={onImport} disabled={status?.loading}>{status?.loading?"IMPORTING...":"IMPORT "+valid+" ROWS"}</button>}
      </div>
    );
  }

  function DropZone({cols,setter}) {
    const [drag,setDrag]=useState(false);
    return (
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)parseFile(f,cols,setter);}} style={{border:`1.5px dashed ${drag?"#d4a853":"#333"}`,borderRadius:6,padding:"24px 16px",textAlign:"center",background:drag?"#d4a85311":"#111",position:"relative",cursor:"pointer"}}>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const f=e.target.files[0];if(f)parseFile(f,cols,setter);}} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}} />
        <div style={{fontFamily:"monospace",fontSize:12,color:"#888"}}>Click or drag & drop Excel file</div>
      </div>
    );
  }

  if(!xlsxReady) return <div style={{padding:32,textAlign:"center",color:"#555",fontFamily:"monospace"}}>LOADING...</div>;
  return (
    <div style={{padding:16}}>
      <div style={S.sectionTitle}>Bulk Data Import</div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["po","Production Orders"],["rm","Routing Master"]].map(([id,label])=>(
          <button key={id} style={S.tab(activeTab===id)} onClick={()=>setActiveTab(id)}>{label}</button>
        ))}
      </div>
      {activeTab==="po"&&(<div><DropZone cols={PO_COLS} setter={setPoRows}/><Preview rows={poRows} cols={PO_COLS} type="po" status={poStatus} onImport={()=>doImport("po")}/></div>)}
      {activeTab==="rm"&&(<div><DropZone cols={RM_COLS} setter={setRmRows}/><Preview rows={rmRows} cols={RM_COLS} type="rm" status={rmStatus} onImport={()=>doImport("rm")}/></div>)}
    </div>
  );
}

// ─── LABEL LIBRARY ────────────────────────────────────────────────────────
function LabelLibrary() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reprintJob, setReprintJob] = useState(null);

  async function load() {
    setLoading(true);
    try { const j = await db.getJobs(); setJobs(j||[]); }
    catch(e) { console.error(e); }
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  async function deleteJob(job) {
    if (!window.confirm(`Delete label for PO: ${job.production_number}?`)) return;
    try { await db.deleteJob(job.id); load(); }
    catch(e) { alert("Delete failed: "+e.message); }
  }

  function fmtDate(d) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
  }

  const filtered = jobs.filter(j => {
    if (!search) return true;
    const s = search.toLowerCase();
    return j.production_number?.toLowerCase().includes(s) ||
           j.material_number?.toLowerCase().includes(s) ||
           j.description?.toLowerCase().includes(s);
  });

  // Reprint single label
  if (reprintJob) {
    const qrData = makeQRData(reprintJob.production_number, reprintJob.material_number, reprintJob.quantity);
    return (
      <div style={{ padding:16 }}>
        <div style={{ ...S.card, marginBottom:14 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:14 }}>
            <button style={S.btn("ghost")} onClick={()=>setReprintJob(null)}>BACK</button>
            <button style={{ ...S.btn("primary"), padding:"10px 24px" }} onClick={()=>window.print()}>PRINT</button>
            <span style={{ fontFamily:"monospace", fontSize:11, color:"#888" }}>Margins=None · Scale=100% · Headers & Footers=OFF</span>
          </div>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#555" }}>
            Reprinting: {reprintJob.production_number} · {reprintJob.material_number} · {reprintJob.quantity}
          </div>
        </div>

        <div id="reprint-area">
          <div style={{ width:"64mm", border:"0.3mm solid #aaa", display:"flex", alignItems:"center", padding:"1.5mm 2mm 1.5mm 1.5mm", gap:"1.5mm", background:"white", boxSizing:"border-box", height:"34mm", overflow:"hidden" }}>
            <img src={qrImageUrl(qrData)} alt="QR" style={{ width:"24mm", height:"24mm", flexShrink:0, marginLeft:"1mm" }} />
            <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", justifyContent:"center", gap:"1.5mm" }}>
              <div style={{ fontFamily:"Courier New,monospace", fontSize:"10pt", fontWeight:900, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>PO: {reprintJob.production_number}</div>
              <div style={{ fontFamily:"Courier New,monospace", fontSize:"8pt", fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>MAT: {reprintJob.material_number}</div>
              <div style={{ fontFamily:"Courier New,monospace", fontSize:"8pt", fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>QTY: {reprintJob.quantity}</div>
            </div>
          </div>
        </div>

        <style>{`
          @media print {
            @page { size: 64mm 34mm; margin: 0; }
            body * { visibility: hidden; }
            #reprint-area, #reprint-area * { visibility: visible; }
            #reprint-area { position: fixed; top: 0; left: 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={S.sectionTitle}>LABEL LIBRARY — {jobs.length} labels printed</div>
        <button style={{ ...S.btn("ghost"), fontSize:10, padding:"6px 12px" }} onClick={load}>REFRESH</button>
      </div>

      <input
        style={{ ...S.input, marginBottom:14 }}
        value={search}
        onChange={e=>setSearch(e.target.value)}
        placeholder="Search by PO, Material No, Description..."
      />

      {loading && <div style={{ textAlign:"center", color:"#555", fontFamily:"monospace", padding:32 }}>LOADING...</div>}

      {!loading && (
        <div style={{ overflowX:"auto", border:"1px solid #2a2a2a", borderRadius:6 }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"monospace", fontSize:11, minWidth:600 }}>
            <thead>
              <tr style={{ background:"#111" }}>
                {["PO No","Material No","Description","Qty","Printed Date",""].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", color:"#555", fontWeight:700, borderBottom:"1px solid #2a2a2a", fontSize:10, whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && (
                <tr><td colSpan={6} style={{ padding:32, textAlign:"center", color:"#444" }}>
                  {search ? "No labels found for: " + search : "No labels printed yet"}
                </td></tr>
              )}
              {filtered.map((j,i)=>(
                <tr key={j.id} style={{ borderBottom:"1px solid #1a1a1a", background:i%2===0?"transparent":"#0d0d0d" }}>
                  <td style={{ padding:"8px 12px", color:"#d4a853", fontWeight:700 }}>{j.production_number}</td>
                  <td style={{ padding:"8px 12px", color:"#e8e2d4" }}>{j.material_number}</td>
                  <td style={{ padding:"8px 12px", color:"#aaa", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.description||"—"}</td>
                  <td style={{ padding:"8px 12px", color:"#888" }}>{j.quantity}</td>
                  <td style={{ padding:"8px 12px", color:"#555", whiteSpace:"nowrap" }}>{fmtDate(j.printed_date||j.created_at)}</td>
                  <td style={{ padding:"4px 8px" }}>
                    <div style={{ display:"flex", gap:6 }}>
                      <button
                        onClick={()=>setReprintJob(j)}
                        style={{ background:"none", border:"1px solid #d4a853", color:"#d4a853", borderRadius:3, padding:"2px 8px", cursor:"pointer", fontFamily:"monospace", fontSize:10 }}
                      >
                        REPRINT
                      </button>
                      <button
                        onClick={()=>deleteJob(j)}
                        style={{ background:"none", border:"1px solid #333", color:"#ef4444", borderRadius:3, padding:"2px 8px", cursor:"pointer", fontFamily:"monospace", fontSize:10 }}
                      >
                        DEL
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ fontFamily:"monospace", fontSize:10, color:"#333", marginTop:8 }}>
          Showing {filtered.length} of {jobs.length} labels · Click REPRINT to reprint a single label
        </div>
      )}
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("log");
  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [supervisors, setSupervisors] = useState(DEFAULT_SUPERVISORS);

  useEffect(() => {
    db.getSettings().then(rows => {
      if (!rows?.length) return;
      rows.forEach(r => {
        try {
          const val = JSON.parse(r.value);
          if (r.key==="stations"&&Array.isArray(val)&&val.length) setStations(val);
          if (r.key==="supervisors"&&Array.isArray(val)&&val.length) setSupervisors(val);
        } catch(e) {}
      });
    }).catch(()=>{});
  }, []);

  const TABS = [
    { id:"log",     label:"LOG UPDATE" },
    { id:"labels",  label:"PRINT LABELS" },
    { id:"library", label:"LABEL LIBRARY" },
    { id:"status",  label:"JOB STATUS" },
    { id:"import",  label:"IMPORT" },
    { id:"setup",   label:"SETUP" },
  ];

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={S.nav}>
        <div style={S.navTitle}>SHOPTRACK</div>
        <div style={S.navTabs}>
          {TABS.map(t => <button key={t.id} style={S.tab(page===t.id)} onClick={()=>setPage(t.id)}>{t.label}</button>)}
        </div>
      </div>
      {page==="log"    && <LogUpdate stations={stations} supervisors={supervisors} onSaved={()=>setPage("status")} />}
      {page==="labels" && <PrintLabels />}
      {page==="status" && <JobStatus />}
      {page==="library" && <LabelLibrary />}
      {page==="import" && <BulkImport />}
      {page==="setup"  && <SetupPage stations={stations} supervisors={supervisors} onUpdate={(wc,sup)=>{ setStations(wc); setSupervisors(sup); }} />}
    </div>
  );
}
