#!/usr/bin/env python3
"""Measure vx9 chest-core disc diameter per pose (view-invariant scale anchor)."""
import json
import os
import cv2
import numpy as np

ROOT = '/home/z/my-project'
ASSETS = os.path.join(ROOT, 'public/game/assets')

with open(os.path.join(ASSETS, 'manifest.json')) as f:
    manifest = json.load(f)

def core_diameter(path):
    img = Image.open(path).convert('RGBA')
    bg = Image.new('RGBA', img.size, (128, 128, 128, 255))
    comp = Image.alpha_composite(bg, img)
    bgr = cv2.cvtColor(np.array(comp)[:, :, :3], cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    # bright cyan glow: high B, high G, lower R
    b, g, r = bgr[:, :, 0].astype(int), bgr[:, :, 1].astype(int), bgr[:, :, 2].astype(int)
    mask = ((b > 170) & (g > 170) & (r < 140) & (b + g - 2 * r > 120)).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    best = None
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area < 120:
            continue
        cy = y + bh / 2
        # core sits in the vertical middle band of the body; visor is high, shards small
        if not (h * 0.25 < cy < h * 0.75):
            continue
        fill = area / (bw * bh)
        if fill < 0.45:   # shards are elongated/sparse
            continue
        if best is None or area > best[0]:
            best = (area, bw, bh, fill, x, y)
    if best is None:
        return None
    area, bw, bh, fill, x, y = best
    return {'d_eq': 2 * np.sqrt(area / np.pi), 'bw': bw, 'bh': bh, 'fill': fill, 'x': x, 'y': y}

from PIL import Image
print(f"{'id':22s} {'w':>4s} {'h':>4s} {'d_eq':>6s} {'bw':>4s} {'bh':>4s} {'fill':>5s}")
diam = {}
for p in manifest['poses']:
    if not p['id'].startswith('vx9_'):
        continue
    r = core_diameter(os.path.join(ASSETS, p['file']))
    d = f"{r['d_eq']:.0f}" if r else '-'
    bw = r['bw'] if r else '-'
    bh = r['bh'] if r else '-'
    fill = f"{r['fill']:.2f}" if r else '-'
    print(f"{p['id']:22s} {p['w']:4d} {p['h']:4d} {d:>6s} {bw:>4} {bh:>4} {fill:>5s}")
    diam[p['id']] = r['d_eq'] if r else None

idle_d = diam['vx9_A_idle']
print('\n-- implied R vs idle (d_eq ratio) --')
for k, v in diam.items():
    if v:
        print(f"{k:22s} R={v / idle_d:.3f}")
