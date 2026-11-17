/* Shared builders for the OmniDecide Game Foundry dossier (English, Profile A formal). */
const docx = require("docx");
const fs = require("fs");
const {
    Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel,
    AlignmentType, WidthType, BorderStyle, ShadingType, ImageRun,
} = docx;

/* GO-1 Graphite Orange (proposal palette, dark-cover variant; body tables use its table.* fields) */
const P = {
    coverBg: "1A2330",
    head: "1A2330",          /* body headings: graphite */
    body: "000000",          /* Profile A: pure black body text */
    accent: "D4875A",        /* table header bg / accent lines */
    innerLine: "DDD0C8",
    surface: "F8F0EB",
    secondary: "5A6472",
    gray: "888888",
    headerGray: "808080",
};

const FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "SimSun" };

/* ---------- headings ---------- */
function h1(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 180, line: 312 },
        children: [new TextRun({ text, bold: true, size: 32, color: P.head, font: FONT })],
    });
}
function h2(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 130, line: 312 },
        children: [new TextRun({ text, bold: true, size: 30, color: P.head, font: FONT })],
    });
}
function h3(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 220, after: 110, line: 312 },
        children: [new TextRun({ text, bold: true, size: 28, color: P.head, font: FONT })],
    });
}

/* ---------- body paragraphs ----------
 * body("plain text") or body([{ t: "text" }, { t: "bold text", b: true }, { t: "ital", i: true }])
 */
function runsOf(content, size) {
    const arr = typeof content === "string" ? [{ t: content }] : content;
    return arr.map(seg => new TextRun({
        text: seg.t, bold: !!seg.b, italics: !!seg.i,
        size: size || 24, color: P.body, font: FONT,
    }));
}
function body(content) {
    return new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 312, after: 120 },
        children: runsOf(content, 24),
    });
}
/* numbered list item (left-aligned per house rules) */
function numItem(reference, content) {
    return new Paragraph({
        numbering: { reference, level: 0 },
        alignment: AlignmentType.LEFT,
        spacing: { line: 312, after: 80 },
        children: runsOf(content, 24),
    });
}

/* ---------- tables ---------- */
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const cellMargins = { top: 60, bottom: 60, left: 120, right: 120 };

function tableCaption(text) {
    return new Paragraph({
        keepNext: true,
        spacing: { before: 160, after: 80, line: 312 },
        children: [new TextRun({ text, bold: true, size: 21, color: P.head, font: FONT })],
    });
}
function cellPara(content, opts) {
    const o = opts || {};
    return new Paragraph({
        alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { line: 276 },
        children: runsOf(content, o.size || 21).map(r => r),
    });
}
/* Generic data table: headers[], widths[] (percent), rows[][], centerCols (index set) */
function dataTable(headers, widths, rows, opts) {
    const o = opts || {};
    const centerCols = o.centerCols || new Set();
    const headerRow = new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((t, i) => new TableCell({
            shading: { type: ShadingType.CLEAR, fill: P.accent },
            margins: cellMargins,
            width: { size: widths[i], type: WidthType.PERCENTAGE },
            children: [new Paragraph({
                alignment: centerCols.has(i) ? AlignmentType.CENTER : AlignmentType.LEFT,
                spacing: { line: 276 },
                children: [new TextRun({ text: t, bold: true, size: 21, color: "FFFFFF", font: FONT })],
            })],
        })),
    });
    const dataRows = rows.map((r, ri) => new TableRow({
        cantSplit: true,
        children: r.map((t, i) => new TableCell({
            shading: { type: ShadingType.CLEAR, fill: ri % 2 === 1 ? P.surface : "FFFFFF" },
            margins: cellMargins,
            width: { size: widths[i], type: WidthType.PERCENTAGE },
            children: [cellPara(t, { center: centerCols.has(i) })],
        })),
    }));
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 6, color: P.accent },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent },
            left: NB, right: NB,
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.innerLine },
            insideVertical: NB,
        },
        rows: [headerRow, ...dataRows],
    });
}
/* Proposal spec card: two columns (Aspect | Specification), 4 data rows */
function specTable(rows) {
    return dataTable(["Aspect", "Specification"], [24, 76], rows);
}
/* figure: centered PNG + caption */
function pngSize(buf) {
    /* PNG IHDR: width at bytes 16-19, height at 20-23 (big-endian) */
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function figure(pngPath, caption, displayWidth) {
    const buf = fs.readFileSync(pngPath);
    const dim = pngSize(buf);
    const w = displayWidth || 560;
    const h = Math.round(w * (dim.height || 1100) / (dim.width || 2000));
    return [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 60 },
            children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: "png" })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160, line: 276 },
            children: [new TextRun({ text: caption, size: 21, color: P.secondary, italics: true, font: FONT })],
        }),
    ];
}

module.exports = { docx, P, FONT, h1, h2, h3, body, numItem, dataTable, specTable, tableCaption, figure, NB };
