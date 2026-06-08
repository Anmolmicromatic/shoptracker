
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        BorderStyle, WidthType, VerticalAlign, ImageRun } = require('docx');
const https = require('https');
 
const MM = 56.6929;
const TOP_MARGIN  = Math.round(12.979 * MM);
const SIDE_MARGIN = Math.round(4.597  * MM);
const LABEL_W     = Math.round(64     * MM);
const LABEL_H     = Math.round(34     * MM);
const H_PITCH     = Math.round(66.472 * MM);
const COL_GAP     = H_PITCH - LABEL_W;
const COLS = 3, ROWS = 8;
const PAGE_W = Math.round(210 * MM);
const PAGE_H = Math.round(297 * MM);
const QR_W_DXA = Math.round(28 * MM);
 
function fetchQR(text) {
  return new Promise((resolve) => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(text)}`;
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}
 
function noBorder() {
  const b = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top:b, bottom:b, left:b, right:b, insideH:b, insideV:b };
}
function labelBorder() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
  return { top:b, bottom:b, left:b, right:b };
}
 
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
 
  const { labels, startPos = 1 } = req.body;
  if (!labels || !labels.length) return res.status(400).json({ error: 'No labels' });
 
  const offset = startPos - 1;
  const slots = [];
  for (let i = 0; i < offset; i++) slots.push(null);
  labels.forEach(l => slots.push(l));
  while (slots.length < ROWS * COLS) slots.push(null);
 
  // Fetch QR codes in parallel
  const qrBuffers = {};
  await Promise.all(labels.map(async (l, i) => {
    const qrData = [l.po, l.material, l.qty, l.description].join('|');
    qrBuffers[i + offset] = await fetchQR(qrData);
  }));
 
  const tableRows = [];
  for (let row = 0; row < ROWS; row++) {
    const cells = [];
    for (let col = 0; col < COLS; col++) {
      const slotIdx = row * COLS + col;
      const label = slots[slotIdx];
      const qrBuf = qrBuffers[slotIdx];
 
      if (!label) {
        cells.push(new TableCell({
          width: { size: LABEL_W, type: WidthType.DXA },
          borders: noBorder(),
          margins: { top:0, bottom:0, left:0, right:0 },
          children: [new Paragraph({ children: [new TextRun("")] })]
        }));
      } else {
        const TEXT_W = LABEL_W - QR_W_DXA - Math.round(2 * MM);
 
        const qrCell = new TableCell({
          width: { size: QR_W_DXA, type: WidthType.DXA },
          borders: noBorder(),
          margins: { top: Math.round(1*MM), bottom:0, left: Math.round(1*MM), right:0 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            spacing: { before:0, after:0 },
            children: qrBuf ? [new ImageRun({
              data: qrBuf,
              transformation: { width: 106, height: 106 },
              type: "png",
            })] : [new TextRun({ text:"[QR]", size:10 })]
          })]
        });
 
        const textCell = new TableCell({
          width: { size: TEXT_W, type: WidthType.DXA },
          borders: noBorder(),
          margins: { top: Math.round(1.5*MM), bottom:0, left: Math.round(1*MM), right: Math.round(1*MM) },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({ spacing:{before:0,after:60}, children:[new TextRun({ text:label.po, bold:true, size:14, font:"Courier New" })] }),
            new Paragraph({ spacing:{before:0,after:40}, children:[new TextRun({ text:`MAT: ${label.material}`, size:11, font:"Courier New" })] }),
            new Paragraph({ spacing:{before:0,after:40}, children:[new TextRun({ text:`QTY: ${label.qty}`, size:11, font:"Courier New" })] }),
            new Paragraph({ spacing:{before:0,after:0},  children:[new TextRun({ text:(label.description||"").slice(0,32), size:9, font:"Courier New", color:"555555" })] }),
          ]
        });
 
        const innerTable = new Table({
          width: { size: LABEL_W, type: WidthType.DXA },
          columnWidths: [QR_W_DXA, TEXT_W],
          borders: noBorder(),
          rows: [new TableRow({ children: [qrCell, textCell] })]
        });
 
        cells.push(new TableCell({
          width: { size: LABEL_W, type: WidthType.DXA },
          borders: labelBorder(),
          margins: { top:0, bottom:0, left:0, right:0 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ spacing:{before:0,after:0}, children:[new TextRun("")] }), innerTable]
        }));
      }
    }
    tableRows.push(new TableRow({
      height: { value: LABEL_H, rule: "exact" },
      children: cells,
    }));
  }
 
  const TABLE_W = LABEL_W * COLS + COL_GAP * (COLS - 1);
 
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: TOP_MARGIN, bottom: TOP_MARGIN, left: SIDE_MARGIN, right: SIDE_MARGIN }
        }
      },
      children: [
        new Table({
          width: { size: TABLE_W, type: WidthType.DXA },
          columnWidths: Array(COLS).fill(LABEL_W),
          rows: tableRows,
        })
      ]
    }]
  });
 
  const buffer = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="labels_${Date.now()}.docx"`);
  res.send(buffer);
};
