#!/usr/bin/env python3
"""Per-pose sprite calibration via multi-scale head template matching.

For each pose, find the scale at which the character's HEAD (template from
the idle sprite) best matches -> art-scale ratio vs idle -> corrected draw_h
so the character body renders at a constant size in every situation.

Outputs:
  scripts/out/calibration.csv      per-pose ratios + old/new draw_h
  scripts/out/sheet_fixed_<c>.png  verification sheet (new draw_h, bottom anchor)
"""
import csv
import json
import os
import statistics
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = '/home/z/my-project'
ASSETS = os.path.join(ROOT, 'public/game/assets')
OUT = os.path.join(ROOT, 'scripts/out')
os.makedirs(OUT, exist_ok=True)

with open(os.path.join(ASSETS, 'manifest.json')) as f:
    manifest = json.load(f)

TARGET_STAND_H = 340.0  # world px standing height (unchanged design constant)


def load_bgr(path):
    img = Image.open(path).convert('RGBA')
    # composite over mid-gray so semi-transparent edges survive matching
    bg = Image.new('RGBA', img.size, (128, 128, 128, 255))
    comp = Image.alpha_composite(bg, img).convert('RGB')
    return cv2.cvtColor(np.array(comp), cv2.COLOR_RGB2BGR), img.size


def head_template(bgr):
    """Crop head region: from top until width jump (shoulders)."""
    h, w = bgr.shape[:2]
    a = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    mask = a > 40
    widths = mask.sum(axis=1)
    nz = np.nonzero(widths > 0)[0]
    top = nz[0]
    band = widths[top:top + 50]
    med = np.median(band[band > 0]) if (band > 0).any() else w * 0.2
    shoulder = top + 50
    for y in range(top + 40, int(h * 0.5)):
        if widths[y] > 1.6 * med:
            shoulder = y
            break
    t = bgr[max(0, top - 4):shoulder + 2, :]
    return t if t.size else bgr[0:max(4, h // 5), :]


def match_ratio(pose_bgr, tmpl):
    """Best matching scale of tmpl inside pose (flip-aware)."""
    th, tw = tmpl.shape[:2]
    ph, pw = pose_bgr.shape[:2]
    best = (-1.0, 1.0)
    flipped = cv2.flip(tmpl, 1)
    for s in np.arange(0.45, 1.95, 0.025):
        nw, nh = int(tw * s), int(th * s)
        if nh < 12 or nw < 12 or nh > ph or nw > pw:
            continue
        t1 = cv2.resize(tmpl, (nw, nh), interpolation=cv2.INTER_AREA)
        t2 = cv2.resize(flipped, (nw, nh), interpolation=cv2.INTER_AREA)
        for t in (t1, t2):
            res = cv2.matchTemplate(pose_bgr, t, cv2.TM_CCOEFF_NORMED)
            mn, mx, _, _ = cv2.minMaxLoc(res)
            if mx > best[0]:
                best = (mx, s)
    return best  # (score, scale_ratio)


groups = {'kaito': [], 'vx9': []}
data = {}
for p in manifest['poses']:
    char = p['id'].split('_')[0]
    bgr, size = load_bgr(os.path.join(ASSETS, p['file']))
    data[p['id']] = {
        'char': char, 'sheet': p['id'].split('_')[1], 'label': p['label'],
        'w': p['w'], 'h': p['h'], 'bgr': bgr, 'draw_h': p['draw_h'],
    }
    groups[char].append(p['id'])

results = {}
for char, ids in groups.items():
    idle_id = next(i for i in ids if i.endswith('_A_idle'))
    idle = data[idle_id]
    tmpl = head_template(idle['bgr'])
    s0 = TARGET_STAND_H / idle['h']   # world scale for idle art scale
    ratios = {}
    for pid in ids:
        if pid == idle_id:
            results[pid] = {'ratio': 1.0, 'score': 1.0, 'reliable': True}
            ratios[pid] = 1.0
            continue
        score, ratio = match_ratio(data[pid]['bgr'], tmpl)
        reliable = score >= 0.55
        results[pid] = {'ratio': ratio, 'score': score, 'reliable': reliable}
        if reliable:
            ratios[pid] = ratio
    # fallback: per-sheet median of reliable ratios
    for sheet in ('A', 'B', 'C'):
        in_sheet = [i for i in ids if data[i]['sheet'] == sheet]
        good = [ratios[i] for i in in_sheet if i in ratios]
        med = statistics.median(good) if good else 1.0
        for i in in_sheet:
            if i not in ratios:
                results[i]['ratio'] = med
                results[i]['score'] = results[i]['score']
                results[i]['reliable'] = False

rows = []
for p in manifest['poses']:
    pid = p['id']
    d = data[pid]
    r = results[pid]
    new_draw = d['h'] * (TARGET_STAND_H / data[d['char'] + '_A_idle']['h']) * r['ratio']
    rows.append({
        'id': pid, 'sheet': d['sheet'], 'label': d['label'],
        'img_h': d['h'], 'old_draw_h': d['draw_h'], 'ratio': r['ratio'],
        'score': r['score'], 'reliable': r['reliable'], 'new_draw_h': round(new_draw, 1),
    })

with open(os.path.join(OUT, 'calibration.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

print(f"{'id':30s} {'sheet':5s} {'img_h':>5s} {'old':>6s} {'ratio':>6s} {'score':>6s} {'new':>6s}")
for r in rows:
    flag = '' if r['reliable'] else '  FALLBACK'
    print(f"{r['id']:30s} {r['sheet']:5s} {r['img_h']:5d} {r['old_draw_h']:6.0f} "
          f"{r['ratio']:6.3f} {r['score']:6.3f} {r['new_draw_h']:6.1f}{flag}")

# verification sheets: poses drawn exactly as game will (new draw_h, bottom-center anchor)
def sheet_fixed(char, cols=5):
    ids = [r['id'] for r in rows if r['id'].startswith(char + '_')]
    cw, chh = 400, 470
    sh = Image.new('RGB', (cols * cw, ((len(ids) + cols - 1) // cols) * chh), (24, 26, 34))
    dr = ImageDraw.Draw(sh)
    for i, pid in enumerate(ids):
        r = next(x for x in rows if x['id'] == pid)
        img = Image.open(os.path.join(ASSETS, data[pid]['file'])).convert('RGBA')
        s = r['new_draw_h'] / r['img_h']
        w2, h2 = max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s))
        if w2 > cw - 20:
            k = (cw - 20) / w2
            w2, h2 = int(w2 * k), max(1, int(h2 * k))
        th = img.resize((w2, h2), Image.LANCZOS)
        cx = (i % cols) * cw + cw // 2
        gy = chh - 46 + (i // cols) * chh
        dr.line([(cx - 185, gy), (cx + 185, gy)], fill=(90, 200, 120), width=2)
        # standing-height reference: idle head top line (340 world at final scale)
        dr.line([(cx - 185, gy - 340), (cx + 185, gy - 340)], fill=(255, 120, 120), width=1)
        sh.paste(th, (cx - w2 // 2, gy - h2), th)
        dr.text((cx - 180, gy + 4), f"{pid.split('_', 1)[1]} new={r['new_draw_h']:.0f} r={r['ratio']:.2f}",
                fill=(230, 230, 230))
    path = os.path.join(OUT, f'sheet_fixed_{char}.png')
    sh.save(path)
    print('wrote', path, sh.size)

sheet_fixed('kaito')
sheet_fixed('vx9')
