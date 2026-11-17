#!/usr/bin/env python3
"""Post-process the proposals docx for WPS/Word page-number compatibility:
1. Remove empty <w:pgNumType/> elements (cover section artifact).
2. Patch footer PAGE fields: front-matter footer -> \\* ROMAN, body footer -> \\* arabic.
Mapping is derived from sectPr order in document.xml via footerReference r:ids.
"""
import re, shutil, sys, zipfile

DOCX = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/OmniDecide_Game_Proposals.docx"
TMP = DOCX + ".tmp"

with zipfile.ZipFile(DOCX, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

docxml = data["word/document.xml"].decode("utf-8")

# 1. Strip empty pgNumType artifacts
before = docxml.count("<w:pgNumType/>")
docxml = docxml.replace("<w:pgNumType/>", "")
print(f"pgNumType removed: {before}")

# 2.5 Remove the duplicate first TOC entry that lives inside the field paragraph
# (add_toc_placeholders.py injects a hyperlink entry right after the field's
#  separate fldChar AND a plain entry list; the hyperlink copy renders as a
#  page-number-less duplicate in LibreOffice. Word replaces all field content
#  on update, so removing the hyperlink block is safe.)
toc_pos = docxml.find('w:instrText xml:space="preserve">TOC')
if toc_pos != -1:
    hl_start = docxml.find("<w:hyperlink", toc_pos)
    if hl_start != -1:
        hl_end = docxml.find("</w:hyperlink>", hl_start) + len("</w:hyperlink>")
        removed = docxml[hl_start:hl_end]
        if "PAGEREF" in removed:
            docxml = docxml[:hl_start] + docxml[hl_end:]
            print("removed duplicate in-field TOC hyperlink entry")

# 2. Map sectPr order -> footer rIds -> footer files
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rel_map = dict(re.findall(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

sect_blocks = re.findall(r"<w:sectPr[^>]*>.*?</w:sectPr>", docxml, re.S)
print(f"sections found: {len(sect_blocks)}")

footer_fmt = {}  # footer filename -> fmt
for idx, block in enumerate(sect_blocks):
    m = re.search(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"', block)
    if not m:
        m = re.search(r'<w:footerReference[^>]*r:id="([^"]+)"[^>]*w:type="default"', block)
    if not m:
        continue
    target = rel_map.get(m.group(1), "")
    fname = "word/" + target.lstrip("/")
    # section 0 = cover (no footer), 1 = front matter (ROMAN), 2 = body (arabic)
    fmt = "ROMAN" if idx == 1 else "arabic"
    footer_fmt[fname] = fmt
    print(f"section {idx}: {fname} -> {fmt}")

for fname, fmt in footer_fmt.items():
    if fname not in data:
        print(f"WARN: {fname} not in archive"); continue
    xml = data[fname].decode("utf-8")
    patched = re.sub(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        rf"\1 PAGE \\* {fmt} \\* MERGEFORMAT \2",
        xml,
    )
    if patched != xml:
        data[fname] = patched.encode("utf-8")
        print(f"patched {fname} with \\* {fmt}")
    else:
        print(f"WARN: no bare PAGE field found in {fname}")

data["word/document.xml"] = docxml.encode("utf-8")

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(TMP, DOCX)
print("OK postprocessed", DOCX)
