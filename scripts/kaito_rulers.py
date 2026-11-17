#!/usr/bin/env python3
"""Ruler strips for kaito poses (top 50% of each sprite) to measure head/body."""
import json
import os
from PIL import Image, ImageDraw

ROOT = '/home/z/my-project'
ASSETS = os.path.join(ROOT, 'public/game/assets')
OUT = os.path.join(ROOT, 'scripts/out')

with open(os.path.join(ASSETS, 'manifest.json')) as f:
    manifest = json.load(f)

# poses needing inspection: all B sheet + selected A/C with height anomalies
targets = ['kaito_A_idle', 'kaito_A_jump_f', 'kaito_A_jump_up', 'kaito_A_jump_down',
           'kaito_A_dash', 'kaito_B_jab', 'kaito_B_cross', 'kaito_B_launcher',
           'kaito_B_high_kick', 'kaito_B_heavy_kick', 'kaito_B_sweep',
           'kaito_C_hit_high', 'kaito_C_hit_body', 'kaito_C_sig_fire', 'kaito_C_dizzy']

strips = []
for pid in targets:
    p = next(x for x in manifest['poses'] if x['id'] == pid)
    img = Image.open(os.path.join(ASSETS, p['file'])).convert('RGBA')
    w, h = img.size
    crop_h = int(h * 0.5)
    crop = img.crop((0, 0, w, crop_h))
    disp_w = min(600, w)
    k = disp_w / w
    disp_h = int(crop_h * k)
    crop = crop.resize((disp_w, disp_h), Image.LANCZOS)
    strip = Image.new('RGB', (disp_w + 80, disp_h + 26), (30, 32, 42))
    strip.paste(crop, (75, 20), crop)
    d = ImageDraw.Draw(strip)
    for x in range(0, w, 20):
        xd = 75 + int(x * k)
        major = x % 100 == 0
        d.line([(xd, disp_h + 18 - (8 if major else 4)), (xd, disp_h + 18)],
               fill=(120, 200, 255), width=1)
        if major:
            d.text((xd - 7, disp_h + 19), str(x), fill=(150, 200, 230))
    d.text((2, 2), f"{pid} {w}x{h}", fill=(255, 220, 120))
    strips.append(strip)

# stack into 3 columns side by side to control height
per_col = 5
col_w = max(s.size[0] for s in strips) + 12
col_h = max(s.size[1] for s in strips) + 8
comp = Image.new('RGB', (3 * col_w, ((len(strips) + per_col - 1) // per_col) * col_h),
                 (18, 20, 26))
for i, s in enumerate(strips):
    cx = (i // per_col) * col_w
    cy = (i % per_col) * col_h
    comp.paste(s, (cx, cy))
comp.save(os.path.join(OUT, 'kaito_rulers.png'))
print('wrote', comp.size)
