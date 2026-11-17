#!/usr/bin/env python3
"""Ruler-strip composite for VX-9: idle + B/C poses, top 45% of each sprite
with a pixel ruler so head widths can be measured visually."""
import json
import os
from PIL import Image, ImageDraw

ROOT = '/home/z/my-project'
ASSETS = os.path.join(ROOT, 'public/game/assets')
OUT = os.path.join(ROOT, 'scripts/out')

with open(os.path.join(ASSETS, 'manifest.json')) as f:
    manifest = json.load(f)

ids = ['vx9_A_idle'] + [p['id'] for p in manifest['poses']
                        if p['id'].startswith('vx9_') and (p['id'].split('_')[1] in ('B', 'C'))]

strips = []
for pid in ids:
    p = next(x for x in manifest['poses'] if x['id'] == pid)
    img = Image.open(os.path.join(ASSETS, p['file'])).convert('RGBA')
    w, h = img.size
    crop_h = int(h * 0.5)
    crop = img.crop((0, 0, w, crop_h))
    # scale so width <= 620 for display
    disp_w = min(620, w)
    disp_h = int(crop_h * disp_w / w)
    crop = crop.resize((disp_w, disp_h), Image.LANCZOS)
    # ruler drawn at NATIVE pixel scale: k = disp_w / w
    k = disp_w / w
    strip = Image.new('RGB', (disp_w + 90, disp_h + 30), (30, 32, 42))
    strip.paste(crop, (80, 22), crop)
    d = ImageDraw.Draw(strip)
    for x in range(0, w, 20):
        xd = 80 + int(x * k)
        major = x % 100 == 0
        d.line([(xd, disp_h + 22 - (10 if major else 5)), (xd, disp_h + 22)], fill=(120, 200, 255), width=1)
        if major:
            d.text((xd - 8, disp_h + 24), str(x), fill=(150, 200, 230))
    d.text((2, 2), f"{pid} w={w}", fill=(255, 220, 120))
    strips.append(strip)

W = max(s.size[0] for s in strips) + 10
H = sum(s.size[1] + 8 for s in strips)
comp = Image.new('RGB', (W, H), (18, 20, 26))
y = 0
for s in strips:
    comp.paste(s, (0, y))
    y += s.size[1] + 8
comp.save(os.path.join(OUT, 'vx9_rulers.png'))
print('wrote', os.path.join(OUT, 'vx9_rulers.png'), comp.size)
