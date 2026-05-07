'use strict';

const PDFDocument = require('pdfkit');
const ExcelJS     = require('exceljs');
const path        = require('path');
const fs          = require('fs');

// ── Logo ──────────────────────────────────────────────────────────────────────
// Place the real ICCA logo at public/logo.png.
// When the file is absent a labelled placeholder box is drawn instead — no crash.
const LOGO_PATH = path.join(process.cwd(), 'public', 'logo.png');

function logoExists() {
  try { fs.accessSync(LOGO_PATH, fs.constants.R_OK); return true; }
  catch { return false; }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function fmtKey(k) {
  return String(k)
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

// ── PDF ───────────────────────────────────────────────────────────────────────

/**
 * Converts a structured data object into a PDF Buffer.
 *
 * data shape:
 *   - Top-level scalar fields are rendered as labelled key-value pairs.
 *   - Top-level array fields (elements must be flat objects) become titled tables.
 *   - Nested objects are silently skipped (too complex for a flat PDF layout).
 *
 * Logo: loaded from public/logo.png if present (absolute path — no rendering
 * issues regardless of cwd). A placeholder box is drawn when the file is absent.
 */
function exportToPdf(data, title) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M     = doc.page.margins.left;  // 50
    const pageW = doc.page.width - 2 * M; // usable width

    // ── Header ──────────────────────────────────────────────────────────────
    if (logoExists()) {
      // Embedded via absolute path — reliable in all server environments
      doc.image(LOGO_PATH, M, 38, { fit: [70, 42] });
    } else {
      // Placeholder: a simple box with the organisation abbreviation
      doc.rect(M, 38, 70, 42).stroke()
         .font('Helvetica-Bold').fontSize(9)
         .text('ICCA', M, 55, { width: 70, align: 'center' });
    }

    doc.font('Helvetica-Bold').fontSize(17)
       .text(title, M, 46, { align: 'center', width: pageW });

    doc.font('Helvetica').fontSize(8).fillColor('#777777')
       .text(`Generated: ${new Date().toLocaleString('en-GB')}`, M, 68,
             { align: 'right', width: pageW })
       .fillColor('#000000');

    doc.moveTo(M, 90).lineTo(M + pageW, 90).lineWidth(0.5).stroke();
    doc.y = 98;

    // ── Body ────────────────────────────────────────────────────────────────
    renderPdfSections(doc, data);

    doc.end();
  });
}

function renderPdfSections(doc, data) {
  const M     = doc.page.margins.left;
  const pageW = doc.page.width - 2 * M;

  const scalars = [];
  const arrays  = [];

  Object.entries(data).forEach(([k, v]) => {
    if (Array.isArray(v))                          arrays.push([k, v]);
    else if (v === null || typeof v !== 'object')  scalars.push([k, v]);
    // nested non-array objects are skipped
  });

  // Scalar summary block
  if (scalars.length > 0) {
    doc.moveDown(0.3);
    scalars.forEach(([k, v]) => {
      doc.font('Helvetica-Bold').fontSize(10)
         .text(`${fmtKey(k)}: `, { continued: true })
         .font('Helvetica').text(String(v ?? '—'));
    });
    doc.moveDown(0.9);
  }

  // Array sections
  arrays.forEach(([k, arr]) => {
    if (arr.length === 0) return;

    // Section heading + rule
    doc.font('Helvetica-Bold').fontSize(13).text(fmtKey(k));
    const lineY = doc.y;
    doc.moveTo(M, lineY).lineTo(M + pageW, lineY).lineWidth(0.5).stroke();
    doc.moveDown(0.3);

    // Only flat (scalar) keys from the first element become columns
    const headers = Object.keys(arr[0]).filter(h => {
      const v = arr[0][h];
      return !Array.isArray(v) && (v === null || typeof v !== 'object');
    });
    const rows = arr.map(obj => headers.map(h => String(obj[h] ?? '—')));

    renderTable(doc, headers, rows);
    doc.moveDown(0.6);
  });
}

function renderTable(doc, headers, rows) {
  const M     = doc.page.margins.left;
  const pageW = doc.page.width - 2 * M;
  const colW  = pageW / headers.length;
  const rowH  = 18;
  const pad   = 3;

  const drawRow = (cells, y, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    cells.forEach((cell, i) => {
      const x = M + i * colW;
      doc.rect(x, y, colW, rowH).strokeColor('#bbbbbb').lineWidth(0.4).stroke();
      doc.text(
        String(cell).slice(0, 58),
        x + pad,
        y + pad + 2,
        { width: colW - 2 * pad, lineBreak: false },
      );
    });
    // Manually advance cursor to the next row; explicit-coordinate text does not do this
    doc.y = y + rowH;
    doc.x = M;
  };

  let y = doc.y + 4;

  drawRow(headers.map(fmtKey), y, true);
  y += rowH;

  for (const row of rows) {
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawRow(headers.map(fmtKey), y, true); // repeat header on overflow page
      y += rowH;
    }
    drawRow(row, y, false);
    y += rowH;
  }

  doc.y = y + 4;
  doc.x = M;
}

// ── Excel ─────────────────────────────────────────────────────────────────────

/**
 * Converts structured data into an Excel Buffer.
 *
 * If data is an array → single sheet named "Data".
 * If data is an object:
 *   - Each array-valued key (with flat-object elements) becomes a sheet.
 *   - All scalar keys are collected onto a "Summary" sheet.
 */
async function exportToExcel(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ICCA Exam Platform';

  if (Array.isArray(data)) {
    addSheet(wb, 'Data', data);
  } else {
    const scalars = {};
    Object.entries(data).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        if (v.length > 0) addSheet(wb, fmtKey(k), v);
      } else if (v === null || typeof v !== 'object') {
        scalars[k] = v;
      }
    });
    if (Object.keys(scalars).length > 0) addSheet(wb, 'Summary', [scalars]);
  }

  if (wb.worksheets.length === 0) wb.addWorksheet('Empty').addRow(['No data']);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addSheet(wb, name, rows) {
  if (!rows || rows.length === 0) return;

  const ws = wb.addWorksheet(name.slice(0, 31));

  // Only flat (scalar) keys
  const keys = Object.keys(rows[0]).filter(k => {
    const v = rows[0][k];
    return !Array.isArray(v) && (v === null || typeof v !== 'object');
  });

  // Header row — dark navy background, white bold text
  const hRow = ws.addRow(keys.map(fmtKey));
  hRow.height = 20;
  hRow.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFAAAAAA' } } };
  });

  // Data rows — alternating light-grey shading on even rows
  rows.forEach((row, idx) => {
    const dRow = ws.addRow(keys.map(k => row[k] ?? ''));
    if (idx % 2 === 1) {
      dRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      });
    }
  });

  // Auto-fit column widths (capped at 50 chars)
  ws.columns.forEach((col, i) => {
    const maxLen = Math.max(
      keys[i]?.length ?? 10,
      ...rows.map(r => String(r[keys[i]] ?? '').length),
    );
    col.width = Math.min(Math.max(maxLen + 2, 12), 50);
  });
}

module.exports = { exportToPdf, exportToExcel };
