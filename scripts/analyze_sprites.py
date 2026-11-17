#!/usr/bin/env python3
"""Analyze fighter pose sprites: content bboxes, row-density profiles,
and build contact sheets to verify art-scale consistency across poses.

Outputs:
  scripts/out/sprite_report.csv   per-pose measurements
  scripts/out/sheet_kaito.png     contact sheet (uniform scale, ground line)
  scripts/out/sheet_vx9.png
  scripts/out/sheet_current.png   poses rendered EXACTLY as game does now (draw_h)
"""
import json
import os
from PIL import Image

ROOT = '/home/z/my-project'
ASSETS = os.path.join(ROOT, 'public/game/assets')
OUT = os.path.join(ROOT, 'scripts/out')
os.makedirs(OUT, exist_ok=True)

with open(os.path.join(ASSETS, 'manifest.json')) as f:
    manifest = json.load(f)

rows = []
imgs = {}
for p in manifest['poses']:
    img = Image.open(os.path.join(ASSETS, p['file'])).convert('RGBA')
    imgs[p['id']] = img
    w, h = img.size
    alpha = img.getchannel('A')
    bbox = alpha.getbbox()  # (l,t,r,b) of non-zero alpha
    # row density (pixels with alpha > 32)
    a = img.getchannel('A').point(lambda v: 255 if v > 32 else 0)
    hist_per_row = []
    px = a.load()
    for y in range(h):
        c = 0
        for x in range(w):
            if px[x, y]:
                c += 1
        hist_per_row.append(c)
    maxd = max(hist_per_row)
    top_th6 = next((y for y, d in enumerate(hist_per_row) if d >= 0.06 * maxd), 0)
    top_th15 = next((y for y, d in enumerate(hist_per_row) if d >= 0.15 * maxd), 0)
    bottom_margin = (h - 1) - (h - 1 - next((i for i, d in enumerate(reversed(hist_per_row)) if d >= 0.06 * maxd), 0))
    rows.append({
        'id': p['id'], 'file': p['file'], 'w': w, 'h': h,
        'manifest_w': p['w'], 'manifest_h': p['h'],
        'bbox': bbox, 'bbox_h': bbox[3] - bbox[1], 'bbox_w': bbox[2] - bbox[0],
        'draw_h': p['draw_h'],
        'scale_now': p['draw_h'] / h,
        'top6': top_th6, 'top15': top_th15,
        'core_h_6': h - top_th6,
        'bottom_margin': bottom_margin,
        'max_row_density': maxd,
    })

# ---- CSV report ----
with open(os.path.join(OUT, 'sprite_report.csv'), 'w') as f:
    f.write('id,w,h,bbox_h,draw_h,scale_now,scale_vs_idle,bottom_margin,max_density,top_th6\n')
    idle_scale = {c: 0.0 for c in ('kaito', 'vx9')}
    for r in rows:
        if r['id'].endswith('_A_idle'):
            c = r['id'].split('_')[0]
            idle_scale[c] = r['scale_now']
    for r in rows:
        c = r['id'].split('_')[0]
        f.write(f"{r['id']},{r['w']},{r['h']},{r['bbox_h']},{r['draw_h']},"
                f"{r['scale_now']:.4f},{r['scale_now'] / idle_scale[c]:.3f},"
                f"{r['bottom_margin']},{r['max_row_density']},{r['top6']}\n")

print('== scale_now vs idle scale (ratio) ==')
for r in rows:
    c = r['id'].split('_')[0]
    ratio = r['scale_now'] / idle_scale[c]
    flag = '  <-- VARIES' if abs(ratio - 1) > 0.06 else ''
    print(f"{r['id']:30s} img_h={r['h']:4d} draw_h={r['draw_h']:6.1f} "
          f"scale={r['scale_now']:.4f} vs_idle={ratio:.3f}{flag}")

# ---- contact sheet: uniform scale per character ----
def sheet(char, cols=5):
    ids = [r['id'] for r in rows if r['id'].startswith(char + '_')]
    cell_w, cell_h = 380, 420
    sheet_img = Image.new('RGB', (cols * cell_w, ((len(ids) + cols - 1) // cols) * cell_h), (24, 26, 34))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet_img)
    idle_row = next(r for r in rows if r['id'] == char + '_A_idle')
    s0 = 300.0 / idle_row['h']  # uniform: idle drawn 300px tall
    ground = cell_h - 40
    for i, pid in enumerate(ids):
        r = next(x for x in rows if x['id'] == pid)
        img = imgs[pid]
        w2 = max(1, int(img.size[0] * s0))
        h2 = max(1, int(img.size[1] * s0))
        thumb = img.resize((w2, h2), Image.LANCZOS)
        cx = (i % cols) * cell_w + cell_w // 2
        gy = ground + (i // cols) * cell_h
        # ground line
        d.line([(cx - 170, gy), (cx + 170, gy)], fill=(90, 200, 120), width=2)
        # idle head-height reference line
        hy = gy - int(300 * (0.0))
        sheet_img.paste(thumb, (cx - w2 // 2, gy - h2), thumb)
        label = pid.replace(char + '_', '')
        d.text((cx - 150, gy + 4), f"{label} h={r['h']} draw_h={r['draw_h']:.0f}", fill=(230, 230, 230))
        d.text((cx - 150, gy + 18), f"uniform_h={r['h'] * s0:.0f}", fill=(120, 220, 255))
    path = os.path.join(OUT, f'sheet_{char}.png')
    sheet_img.save(path)
    print('wrote', path, sheet_img.size)

sheet('kaito')
sheet('vx9')

# ---- sheet as currently rendered (draw_h, bottom-center anchor) ----
def sheet_current(char, cols=5):
    ids = [r['id'] for r in rows if r['id'].startswith(char + '_')]
    cell_w, cell_h = 380, 420
    sheet_img = Image.new('RGB', (cols * cell_w, ((len(ids) + cols - 1) // cols) * cell_h), (24, 26, 34))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet_img)
    for i, pid in enumerate(ids):
        r = next(x for x in rows if x['id'] == pid)
        img = imgs[pid]
        s = r['draw_h'] / r['h']
        w2 = max(1, int(img.size[0] * s))
        h2 = max(1, int(img.size[1] * s))
        thumb = img.resize((w2, h2), Image.LANCZOS)
        cx = (i % cols) * cell_w + cell_w // 2
        gy = cell_h - 40 + (i // cols) * cell_h
        d.line([(cx - 170, gy), (cx + 170, gy)], fill=(90, 200, 120), width=2)
        sheet_img.paste(thumb, (cx - w2 // 2, gy - h2), thumb)
        label = pid.replace(char + '_', '')
        d.text((cx - 150, gy + 4), f"{label} drawn_h={r['draw_h']:.0f}", fill=(230, 230, 230))
        d.text((cx - 150, gy + 18), f"scale={s:.3f}", fill=(255, 160, 120))
    path = os.path.join(OUT, f'sheet_current_{char}.png')
    sheet_img.save(path)
    print('wrote', path, sheet_img.size)

sheet_current('kaito')
sheet_current('vx9')
print('done')
