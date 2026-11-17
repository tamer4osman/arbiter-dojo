"""Post-process footers for WPS/Word compatibility (per docx skill toc.md):
- strip empty <w:pgNumType/> from document.xml
- patch footer PAGE fields with explicit format switches:
  section 2 (front matter) -> PAGE \\* ROMAN, section 3 (body) -> PAGE \\* arabic
Footer-to-section mapping resolved through sectPr footerReference order."""
import re
import shutil
import sys
import zipfile

path = sys.argv[1]
tmp = path + ".tmp"

with zipfile.ZipFile(path, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

doc = data["word/document.xml"].decode("utf-8")

# 1. remove empty pgNumType elements (confuse WPS on the cover section)
doc = doc.replace("<w:pgNumType/>", "")

# 2. resolve footer rels per section, in order of sectPr appearance
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rel_map = dict(re.findall(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
sect_footers = []  # list of footer file names per sectPr, in order
for sect in re.findall(r"<w:sectPr[ >].*?</w:sectPr>", doc, flags=re.S):
    m = re.search(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"', sect)
    if not m:
        m = re.search(r'<w:footerReference[^>]*r:id="([^"]+)"', sect)
    sect_footers.append(rel_map.get(m.group(1)).lstrip("/") if m else None)
print("sections and their footers:", sect_footers)

def patch_footer(fname, fmt):
    key = "word/" + fname if not fname.startswith("word/") else fname
    xml = data[key].decode("utf-8")
    xml = re.sub(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        r"\g<1> PAGE \\* " + fmt + r" \\* MERGEFORMAT \g<2>",
        xml,
    )
    data[key] = xml.encode("utf-8")

# section order: 1 = cover (no footer), 2 = front matter (ROMAN), 3 = body (arabic)
fmts = {1: "ROMAN", 2: "arabic"}
for idx, fname in enumerate(sect_footers):
    if fname and idx in fmts:
        patch_footer(fname, fmts[idx])
        print(f"patched {fname} -> {fmts[idx]}")

data["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(tmp, path)
print("footer patch complete")
