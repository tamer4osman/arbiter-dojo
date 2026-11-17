#!/usr/bin/env python3
"""Build draw_h.json from R estimates, patch manifest.json, and render a
verification sheet: each pose drawn as the game will draw it, with the idle
pose overlaid as a faint reference silhouette (340 world px, same anchor)."""
import json
import os
import shutil
from PIL import Image, ImageDraw

ROOT = '/home/z/my-project'
ASSETS = os.path.join(ROOT, 'public/game/assets')
OUT = os.path.join(ROOT, 'scripts/out')

STAND = {'kaito': 340.0, 'vx9': 340.0}
IDLE_H = {'kaito': 763, 'vx9': 506}

# R = art-scale ratio vs the character's idle sheet. Determined from ruler
# measurements + visual comparison; refined iteratively via sheet check.
R = {
    # kaito: A sheet is reference (R=1)
    'kaito_A_idle': 1.0, 'kaito_A_walk_f': 1.0, 'kaito_A_walk_b': 1.0,
    'kaito_A_crouch': 1.0, 'kaito_A_crouch_guard': 1.0, 'kaito_A_guard_high': 1.0,
    'kaito_A_hit_light': 1.0, 'kaito_A_blockstun': 1.0, 'kaito_A_jump_f': 1.0,
    'kaito_A_jump_up': 1.0, 'kaito_A_jump_down': 1.0, 'kaito_A_dash': 1.0,
    'kaito_B_jab': 1.10, 'kaito_B_cross': 1.12, 'kaito_B_launcher': 1.0,
    'kaito_B_high_kick': 1.0, 'kaito_B_heavy_kick': 1.0, 'kaito_B_sweep': 1.0,
    'kaito_C_hit_high': 1.0, 'kaito_C_hit_body': 1.0, 'kaito_C_knockdown': 1.0,
    'kaito_C_sig_charge': 1.0, 'kaito_C_sig_fire': 1.0, 'kaito_C_dizzy': 1.0,
    # vx9: A sheet is reference (R=1); B/C art drawn larger
    'vx9_A_idle': 1.0, 'vx9_A_walk_f': 1.0, 'vx9_A_walk_b': 1.0,
    'vx9_A_crouch': 1.0, 'vx9_A_blockstun': 1.0, 'vx9_A_guard_high': 1.0,
    'vx9_A_jump_up': 1.0, 'vx9_A_jump_down': 1.0, 'vx9_A_dash': 1.0,
    'vx9_B_jab': 1.45, 'vx9_B_cross': 1.50, 'vx9_B_launcher': 1.28,
    'vx9_B_high_kick': 1.36, 'vx9_B_heavy_kick': 1.30, 'vx9_B_sweep': 1.35,
    'vx9_C_hit_high': 1.45, 'vx9_C_hit_body': 1.40, 'vx9_C_knockdown': 1.40,
    'vx9_C_sig_charge': 1.32, 'vx9_C_sig_fire': 1.37, 'vx9_C_dizzy': 1.17,
}

CAL_PATH = os.path.join(OUT, 'draw_h.json')
if os.path.exists(CAL_PATH) and '--keep' in __import__('sys').argv:
    with open(CAL_PATH) as f:
        cal = json.load(f)          # {id: draw_h}
else:
    with open(os.path.join(ASSETS, 'manifest.json')) as f:
        manifest = json.load(f)
    cal = {}
    for p in manifest['poses']:
        char = p['id'].split('_')[0]
        s0 = STAND[char] / IDLE_H[char]
        cal[p['id']] = round(p['h'] * s0 / R[p['id']], 1)

with open(CAL_PATH, 'w') as f:
    json.dump(cal, f, indent=1)

# ---- patch manifest ----
with open(os.path.join(ASSETS, 'manifest.json')) as f:
    manifest = json.load(f)
bak = os.path.join(ASSETS, 'manifest.json.bak')
if not os.path.exists(bak):
    shutil.copy(os.path.join(ASSETS, 'manifest.json'), bak)
for p in manifest['poses']:
    p['draw_h'] = cal[p['id']]
with open(os.path.join(ASSETS, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
print('manifest draw_h updated from', CAL_PATH)

# ---- verification sheet ----
with open(os.path.join(ASSETS, 'manifest.json')) as f:
    manifest = json.load(f)
poses = {p['id']: p for p in manifest['poses']}

imgs = {}
for pid in poses:
    imgs[pid] = Image.open(os.path.join(ASSETS, poses[pid]['file'])).convert('RGBA')

for char in ('kaito', 'vx9'):
    ids = [i for i in poses if i.startswith(char + '_')]
    cols = 5
    cw, chh = 420, 560
    sheet = Image.new('RGB', (cols * cw, ((len(ids) + cols - 1) // cols) * chh), (30, 34, 46))
    d = ImageDraw.Draw(sheet)
    idle_img = imgs[char + '_A_idle']
    idle_h = cal[char + '_A_idle']
    for i, pid in enumerate(sorted(ids)):
        p = poses[pid]
        img = imgs[pid]
        dh = cal[pid]
        s = dh / p['h']
        w2, h2 = max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s))
        if w2 > cw - 16:
            kk = (cw - 16) / w2
            w2, h2 = int(w2 * kk), max(1, int(h2 * kk))
        cx = (i % cols) * cw + cw // 2
        gy = chh - 50 + (i // cols) * chh
        # ground + standing-height ref line (340)
        d.line([(cx - 200, gy), (cx + 200, gy)], fill=(90, 200, 120), width=2)
        d.line([(cx - 200, gy - 340), (cx + 200, gy - 340)], fill=(255, 110, 110), width=1)
        # idle reference silhouette behind
        sref = 340 / idle_img.size[1]
        rw = int(idle_img.size[0] * sref)
        ref = Image.new('RGBA', idle_img.size, (0, 0, 0, 0))
        ref.paste(idle_img, (0, 0), idle_img)
        tint = Image.new('RGBA', idle_img.size, (140, 170, 255, 255))
        sil = Image.new('RGBA', idle_img.size, (0, 0, 0, 0))
        sil.paste(tint, (0, 0), idle_img)
        sil.putalpha(70)
        sil = sil.resize((rw, 340), Image.LANCZOS)
        sheet.paste(sil, (cx - rw // 2, gy - 340), sil)
        # pose thumb on top
        th = img.resize((w2, h2), Image.LANCZOS)
        sheet.paste(th, (cx - w2 // 2, gy - h2), th)
        d.text((cx - 195, gy + 6), f"{pid.split('_', 1)[1]}  draw_h={dh:.0f}", fill=(235, 235, 235))
    path = os.path.join(OUT, f'sheet_check_{char}.png')
    sheet.save(path)
    print('wrote', path, sheet.size)
