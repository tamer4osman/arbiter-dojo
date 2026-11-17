/* Main assembly: cover (R1, GO-1) + TOC (Roman) + body (Arabic) for the dossier. */
const H = require("./helpers");
const docx = H.docx;
const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    Header, Footer, PageNumber, NumberFormat, SectionType, TableOfContents,
    AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
    TableLayoutType, LevelFormat,
} = docx;
const fs = require("fs");

const proto = require("./proto").build();
const proposals = require("./proposals").build();
const tail = require("./tail").build();

/* ---------- palette (GO-1 Graphite Orange) ---------- */
const COVER = {
    bg: "1A2330", titleColor: "FFFFFF", subtitleColor: "B0B8C0",
    metaColor: "90989F", footerColor: "687078", accent: "D4875A",
};
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };
const FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "SimSun" };

/* ---------- cover layout helpers (design-system.md, verbatim logic) ---------- */
function splitTitleLines(title, charsPerLine) {
    if (title.length <= charsPerLine) return [title];
    const breakAfter = new Set([..."，。、；：！？", ..."的与和及之在于为", ..."-_—–·/", ..." \t"]);
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
        lines[lines.length - 1] += last;
    }
    return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
    const charWidth = (pt) => pt * 20;
    const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
    let titlePt = preferredPt, lines;
    while (titlePt >= minPt) {
        const cpl = charsPerLine(titlePt);
        if (cpl < 2) { titlePt -= 2; continue; }
        lines = splitTitleLines(title, cpl);
        if (lines.length <= 3) break;
        titlePt -= 2;
    }
    if (!lines || lines.length > 3) {
        lines = splitTitleLines(title, charsPerLine(minPt));
        titlePt = minPt;
    }
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
    const contentHeight = titleHeight + subtitleHeight + englishLabelHeight +
        metaHeight + fixedHeight + implicitParaHeight;
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

/* ---------- Recipe R1: Pure Paragraph Cover (left-aligned, dark bg) ---------- */
function buildCoverR1(config) {
    const P = config.palette;
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
            indent: { left: padL, right: padR }, spacing: { after: 800 },
            children: [new TextRun({
                text: config.subtitle, size: 24, color: P.subtitleColor,
                font: { eastAsia: "Microsoft YaHei", ascii: "Arial" },
            })],
        }));
    }

    for (const line of (config.metaLines || [])) {
        children.push(new Paragraph({
            indent: { left: padL + 200, right: padR }, spacing: { after: 80 },
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
            new TextRun({ text: "                                        " }),
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
                children,
            })],
        })],
    })];
}

/* ---------- footers / header ---------- */
function pageNumFooter() {
    return new Footer({
        children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: FONT })],
        })],
    });
}
function docHeader() {
    return new Header({
        children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
                text: "OmniDecide Game Foundry - Proposal Dossier", size: 18, color: "808080", font: FONT,
            })],
        })],
    });
}

/* ---------- TOC section children ---------- */
const tocChildren = [
    new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, after: 360 },
        children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: FONT })],
    }),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    new Paragraph({
        spacing: { before: 200 },
        children: [new TextRun({
            text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
            italics: true, size: 18, color: "888888", font: FONT,
        })],
    }),
];

/* ---------- document ---------- */
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const doc = new Document({
    creator: "OmniDecide Game Foundry",
    title: "OmniDecide Game Foundry - Twenty Web-Game Proposals",
    styles: {
        default: {
            document: {
                run: { font: FONT, size: 24, color: "000000" },
                paragraph: { spacing: { line: 312 } },
            },
            heading1: {
                run: { font: FONT, size: 32, bold: true, color: "1A2330" },
                paragraph: { spacing: { before: 360, after: 180, line: 312 }, outlineLevel: 0 },
            },
            heading2: {
                run: { font: FONT, size: 30, bold: true, color: "1A2330" },
                paragraph: { spacing: { before: 280, after: 130, line: 312 }, outlineLevel: 1 },
            },
            heading3: {
                run: { font: FONT, size: 28, bold: true, color: "1A2330" },
                paragraph: { spacing: { before: 220, after: 110, line: 312 }, outlineLevel: 2 },
            },
        },
    },
    numbering: {
        config: [{
            reference: "impl-steps",
            levels: [{
                level: 0,
                format: LevelFormat.DECIMAL,
                text: "%1.",
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            }],
        }],
    },
    sections: [
        { /* Section 1: cover - margin 0, no footer */
            properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
            children: buildCoverR1({
                title: "OmniDecide Game Foundry",
                subtitle: "Twenty web games that push a deterministic decision kernel to its limits",
                englishLabel: "PROPOSAL DOSSIER",
                metaLines: [
                    "Basis: omnidecide-wasm 1.0.0 - kernel 2.0.0, parity verified 40/40",
                    "Scope: Cognitive decomposition, architecture and twenty proposals",
                    "Date: November 2026",
                ],
                footerLeft: "OmniDecide Game Foundry",
                footerRight: "November 2026",
                palette: COVER,
            }),
        },
        { /* Section 2: TOC - Roman numerals */
            properties: {
                type: SectionType.NEXT_PAGE,
                page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
            },
            footers: { default: pageNumFooter() },
            children: tocChildren,
        },
        { /* Section 3: body - Arabic from 1 */
            properties: {
                type: SectionType.NEXT_PAGE,
                page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
            },
            headers: { default: docHeader() },
            footers: { default: pageNumFooter() },
            children: [...proto, ...proposals, ...tail],
        },
    ],
});

Packer.toBuffer(doc).then(buf => {
    const out = "/home/z/my-project/download/OmniDecide_Game_Foundry_20_Proposals.docx";
    fs.writeFileSync(out, buf);
    console.log("written:", out, buf.length, "bytes");
});
