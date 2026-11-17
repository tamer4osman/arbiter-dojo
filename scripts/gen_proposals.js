// Generator: OmniDecide Game Proposals dossier (.docx)
// Follows docx skill: R1 cover recipe (long-title fallback from R4/GO-1), 3-section page numbering, TOC, horizontal tables.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, TableLayoutType, SectionType,
  TableOfContents, LevelFormat,
} = require("docx");
const fs = require("fs");
const path = require("path");

const { execSummary, part1, part2Intro, clusterB } = require("./proposal_content_part1.js");
const { clusterC, clusterD, clusterE } = require("./proposal_content_part2.js");
const { part3, appendix } = require("./proposal_content_part3.js");

// ---------- Palette: GO-1 Graphite Orange (proposals / PRD) ----------
const P = {
  bg: "1A2330", accent: "D4875A",
  titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078",
  headings: "1A2330", body: "000000", caption: "606060",
  table: { headerBg: "D4875A", headerText: "FFFFFF", innerLine: "DDD0C8", surface: "F8F0EB" },
};

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

const EN_FONT = { ascii: "Times New Roman", eastAsia: "SimSun" };
const HEAD_FONT = { ascii: "Times New Roman", eastAsia: "SimHei" };
const CODE_FONT = { ascii: "Courier New", eastAsia: "SimSun" };

// ---------- Inline **bold** parser ----------
function runsFrom(text, base) {
  const runs = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    runs.push(new TextRun({ ...base, text: m[1], bold: true }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun({ ...base, text: text.slice(last) }));
  if (runs.length === 0) runs.push(new TextRun({ ...base, text: "" }));
  return runs;
}

// ---------- Block builders ----------
function heading(text, level) {
  return new Paragraph({
    heading: level,
    spacing: {
      before: level === HeadingLevel.HEADING_1 ? 400 : level === HeadingLevel.HEADING_2 ? 300 : 240,
      after: level === HeadingLevel.HEADING_1 ? 180 : 120,
      line: 312,
    },
    children: [new TextRun({
      text,
      bold: true,
      color: P.headings,
      font: HEAD_FONT,
      size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_2 ? 28 : 24,
    })],
  });
}

function bodyPara(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: runsFrom(text, { size: 24, color: P.body, font: EN_FONT }),
  });
}

function bulletPara(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    bullet: { level: 0 },
    spacing: { line: 312, after: 80 },
    children: runsFrom(text, { size: 24, color: P.body, font: EN_FONT }),
  });
}

function numPara(text, ref) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    numbering: { reference: ref, level: 0 },
    spacing: { line: 312, after: 80 },
    children: runsFrom(text, { size: 24, color: P.body, font: EN_FONT }),
  });
}

function equationPara(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 160, line: 312 },
    children: runsFrom(text, { size: 24, color: P.headings, font: EN_FONT, bold: true }),
  });
}

function captionPara(text) {
  return new Paragraph({
    keepNext: true,
    alignment: AlignmentType.LEFT,
    spacing: { before: 160, after: 80, line: 312 },
    children: runsFrom(text, { size: 21, color: P.caption, font: EN_FONT, bold: true }),
  });
}

function dataTable(spec) {
  const widths = spec.widths;
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: spec.header.map((text, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        spacing: { line: 276 },
        children: runsFrom(text, { size: 21, color: P.table.headerText, font: EN_FONT, bold: true }),
      })],
    })),
  });
  const dataRows = spec.rows.map((row) => new TableRow({
    cantSplit: true,
    children: row.map((text, i) => new TableCell({
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        spacing: { line: 276 },
        children: runsFrom(text, { size: 21, color: P.body, font: EN_FONT }),
      })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.accent },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.accent },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [headerRow, ...dataRows],
  });
}

function codeBlock(spec) {
  const paras = spec.lines.map((line) => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 240, lineRule: "atLeast" },
    children: [new TextRun({ text: line.length ? line : " ", size: 18, color: "333333", font: CODE_FONT })],
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NB, bottom: NB, right: NB,
      left: { style: BorderStyle.SINGLE, size: 12, color: P.accent },
      insideHorizontal: NB, insideVertical: NB,
    },
    rows: [new TableRow({
      cantSplit: false,
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.table.surface },
        margins: { top: 120, bottom: 120, left: 200, right: 160 },
        children: paras,
      })],
    })],
  });
}

function renderBlocks(blocks, numRefs) {
  const out = [];
  for (const b of blocks) {
    if (b.h1) out.push(heading(b.h1, HeadingLevel.HEADING_1));
    else if (b.h2) out.push(heading(b.h2, HeadingLevel.HEADING_2));
    else if (b.h3) out.push(heading(b.h3, HeadingLevel.HEADING_3));
    else if (b.p) out.push(bodyPara(b.p));
    else if (b.eq) out.push(equationPara(b.eq));
    else if (b.bullets) for (const it of b.bullets) out.push(bulletPara(it));
    else if (b.nums) {
      if (!numRefs.has(b.ref)) numRefs.add(b.ref);
      for (const it of b.nums) out.push(numPara(it, b.ref));
    }
    else if (b.table) { out.push(captionPara(b.table.caption)); out.push(dataTable(b.table)); out.push(new Paragraph({ spacing: { after: 80, line: 312 }, children: [] })); }
    else if (b.code) { out.push(codeBlock(b.code)); out.push(new Paragraph({ spacing: { after: 80, line: 312 }, children: [] })); }
  }
  return out;
}

// ---------- Cover: Recipe R1 (Pure Paragraph Left), Latin-adapted calcTitleLayout ----------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([...",.;:!?", ..."-_\u2014\u2013\u00b7/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 12; // Latin bold glyphs ~0.6 em
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0,
    fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

function buildCoverR1(config) {
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];

  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({
        text: config.englishLabel.split("").join("  "),
        size: 18, color: P.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40,
      })],
    }));
  }

  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({
        text: titleLines[i], size: titleSize, bold: true,
        color: P.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" },
      })],
    }));
  }

  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800, line: 312 },
      children: [new TextRun({
        text: config.subtitle, size: 24, color: P.subtitleColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" },
      })],
    }));
  }

  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({
        text: line, size: 24, color: P.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" },
      })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        ", size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        verticalAlign: "top",
        children,
      })],
    })],
  })];
}

// ---------- Headers / footers ----------
function pageHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0, line: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine, space: 4 } },
      children: [new TextRun({ text: "OmniDecide at the Limit — Twenty Web Game Proposals", size: 18, color: "808080", font: EN_FONT })],
    })],
  });
}
function pageNumFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240 },
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: EN_FONT })],
    })],
  });
}

// ---------- Assemble ----------
const numRefs = new Set();
const bodyChildren = [
  ...renderBlocks(execSummary, numRefs),
  ...renderBlocks(part1, numRefs),
  ...renderBlocks(part2Intro, numRefs),
  ...renderBlocks(clusterB, numRefs),
  ...renderBlocks(clusterC, numRefs),
  ...renderBlocks(clusterD, numRefs),
  ...renderBlocks(clusterE, numRefs),
  ...renderBlocks(part3, numRefs),
  ...renderBlocks(appendix, numRefs),
];

const coverConfig = {
  title: "Pushing OmniDecide to Its Limits",
  subtitle: "Twenty detailed web-game proposals built on the deterministic decision kernel",
  englishLabel: "OMNIDECIDE KERNEL 2.0.0",
  metaLines: [
    "Kernel: OmniDecide 2.0.0 — WASM integration 1.0.0 (vendored C)",
    "Runtime: browser WASM + zero-dependency UMD JavaScript API",
    "Basis: sandbox-verified API, parity corpus and quickstart envelopes",
    "Date: 15 November 2026",
  ],
  footerLeft: "Deterministic Decision Engine — Game Design Dossier",
  footerRight: "November 2026",
};

const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: EN_FONT, size: 24, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: HEAD_FONT, size: 32, bold: true, color: P.headings },
        paragraph: { spacing: { before: 400, after: 180, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: HEAD_FONT, size: 28, bold: true, color: P.headings },
        paragraph: { spacing: { before: 300, after: 120, line: 312 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: HEAD_FONT, size: 24, bold: true, color: P.headings },
        paragraph: { spacing: { before: 240, after: 100, line: 312 }, outlineLevel: 2 },
      },
    },
  },
  numbering: {
    config: [...numRefs].map((ref) => ({
      reference: ref,
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    })),
  },
  sections: [
    { // Section 1: Cover — margin 0, no footer, no page numbers
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1(coverConfig),
    },
    { // Section 2: Front matter (TOC) — Roman numerals
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: pageHeader() },
      footers: { default: pageNumFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360, line: 312 },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: HEAD_FONT, color: P.headings })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({
          spacing: { before: 200, line: 312 },
          children: [new TextRun({
            text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
            italics: true, size: 18, color: "888888", font: EN_FONT,
          })],
        }),
      ],
    },
    { // Section 3: Body — Arabic numerals from 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: pageHeader() },
      footers: { default: pageNumFooter() },
      children: bodyChildren,
    },
  ],
});

const outPath = process.argv[2] || path.join("/home/z/my-project/download", "OmniDecide_Game_Proposals.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log("WROTE", outPath, buf.length, "bytes");
});
