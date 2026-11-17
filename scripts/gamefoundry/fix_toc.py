"""Remove the stray docx-js placeholder hyperlink inside the TOC field's first
paragraph. The add_toc_placeholders.py script already injects 43 plain entries
with cached page numbers; the leftover hyperlink (anchor _Toc1, dirty PAGEREF
with no cached result) renders as a duplicate, page-number-less first line in
LibreOffice. Removing it leaves the field structure intact for Word's
Update Field regeneration."""
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

pattern = re.compile(r'<w:hyperlink[^>]*w:anchor="_Toc1"[^>]*>.*?</w:hyperlink>', re.S)
matches = pattern.findall(doc)
print(f"stray hyperlink entries found: {len(matches)}")
doc = pattern.sub("", doc, count=1)

data["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(tmp, path)
print("toc fix complete")
