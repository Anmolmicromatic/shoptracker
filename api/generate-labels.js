const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        BorderStyle, WidthType, VerticalAlign, ImageRun } = require('docx');
const https = require('https');
 
const MM    = 56.6929;
const TOP   = Math.round(12.979 * MM);  // 736 DXA
const SIDE  = Math.round(4.597  * MM);  // 261 DXA
const LW    = Math.round(64     * MM);  // 3628 DXA — label width
const LH    = Math.round(34     * MM);  // 1928 DXA — label height
const HPITCH= Math.round(66.472 * MM);  // 3767 DXA
const GAP   = HPITCH - LW;             // 139 DXA — col gap (~2.5mm)
const COLS  = 3, ROWS = 8;
const PW    = Math.round(210 * MM);
const PH    = Math.round(297 * MM);
 
// Inside each label: QR=28mm, padding=1mm, text=rest
const QR_DXA  = Math.round(28 * MM);   // 1587
const PAD_DXA = Math.round(1  * MM);   //   57
const TX_DXA  = LW - QR_DXA - PAD_DXA; // 1984
 
// QR image dimensions in EMU (914400 EMU = 1 inch = 25.4mm)
const QR_EMU  = Math.round(28 / 25.4 * 914400); // 1008000
 
function nb() {
  const z = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top:z, bottom:z, left:z, right:z, insideH:z, insideV:z };
}
function lb() {
  const b = { style: BorderStyle.SINGLE, size: 6, color: "888888" };
  return { top:b, bottom:b, left:b, right:b };
}
 
function fetchQR(data) {
  return new Promise(resolve => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}
 
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { labels, startPos = 1 } = req.body;
  if (!labels?.length) return res.status(400).json({ error: 'No labels' });
 
  // Build slot array
  const slots = [];
  for (let i = 0; i < startPos - 1; i++) slots.push(null);
  labels.forEach(l => slots.push(l));
  while (slots.length < ROWS * COLS) slots.push(null);
 
  // Fetch QR images
  const qrs = {};
  await Promise.all(slots.map(async (lbl, i) => {
    if (!lbl) return;
    qrs[i] = await fetchQR([lbl.po, lbl.material, lbl.qty, lbl.description].join('|'));
  }));
 
  // Build table rows
  const TABLE_W = LW * COLS + GAP * (COLS - 1);
  const tRows = [];
 
  for (let r = 0; r < ROWS; r++) {
    const cells = [];
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const lbl = slots[i];
      const qrBuf = qrs[i];
 
      if (!lbl) {
        cells.push(new TableCell({
          width: { size: LW, type: WidthType.DXA },
          borders: nb(),
          margins: { top:0, bottom:0, left:0, right:0 },
          children: [new Paragraph({ spacing:{before:0,after:0}, children:[new TextRun("")] })]
        }));
        continue;
      }
 
      // QR image or fallback text
      const qrChildren = qrBuf
        ? [new ImageRun({ data: qrBuf, type: "png", transformation: { width: QR_EMU / 9144, height: QR_EMU / 9144 } })]
        : [new TextRun({ text: "QR", size: 20, bold: true })];
 
      // Inner layout: one row, two cells [QR | text]
      const inner = new Table({
        width: { size: LW, type: WidthType.DXA },
        columnWidths: [QR_DXA, TX_DXA],
        borders: nb(),
        rows: [
          new TableRow({
            height: { value: LH - Math.round(1*MM), rule: "exact" },
            children: [
              // QR cell
              new TableCell({
                width: { size: QR_DXA, type: WidthType.DXA },
                borders: nb(),
                margins: { top: Math.round(1.5*MM), bottom:0, left: Math.round(1.5*MM), right:0 },
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ spacing:{before:0,after:0}, children: qrChildren })]
              }),
              // Text cell
              new TableCell({
                width: { size: TX_DXA, type: WidthType.DXA },
                borders: nb(),
                margins: { top: Math.round(2*MM), bottom:0, left: Math.round(1.5*MM), right: Math.round(1*MM) },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ spacing:{before:0,after:50}, children:[new TextRun({ text: lbl.po, bold:true, size:15, font:"Courier New" })] }),
                  new Paragraph({ spacing:{before:0,after:35}, children:[new TextRun({ text: `MAT: ${lbl.material}`, size:12, font:"Courier New" })] }),
                  new Paragraph({ spacing:{before:0,after:35}, children:[new TextRun({ text: `QTY: ${lbl.qty}`, size:12, font:"Courier New" })] }),
                  new Paragraph({ spacing:{before:0,after:0},  children:[new TextRun({ text: (lbl.description||"").slice(0,30), size:10, font:"Courier New", color:"555555" })] }),
                ]
              }),
            ]
          })
        ]
      });
 
      cells.push(new TableCell({
        width: { size: LW, type: WidthType.DXA },
        borders: lb(),
        margins: { top:0, bottom:0, left:0, right:0 },
        verticalAlign: VerticalAlign.CENTER,
        children: [inner]
      }));
    }
 
    tRows.push(new TableRow({
      height: { value: LH, rule: "exact" },
      children: cells,
    }));
  }
 
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PW, height: PH },
          margin: { top: TOP, bottom: TOP, left: SIDE, right: SIDE }
        }
      },
      children: [
        new Table({
          width: { size: TABLE_W, type: WidthType.DXA },
          columnWidths: Array(COLS).fill(LW),
          rows: tRows,
        })
      ]
    }]
  });
 
  const buf = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="labels_${Date.now()}.docx"`);
  res.send(buf);
};
 
