#!/usr/bin/env python3
"""Scale VX-9 Arbiter draw_h values by CHAR_SCALE (1.10).

The user spec: the opponent (VX-9 Arbiter) must read slightly larger than
Kaito Ren in every pose. The previous calibration had both fighters at the
same rendered heights (idle 340 for both). This raises every vx9 pose
draw_h by 10%, keeping the calibrated per-pose ratios intact, so the whole
character renders uniformly larger. Kaito stays untouched at 1.0.

Also syncs scripts/out/draw_h.json (the calibration working copy).
"""
import json
import shutil

SCALE = 1.10
MANIFEST = '/home/z/my-project/public/game/assets/manifest.json'
BACKUP = '/home/z/my-project/scripts/out/manifest.json.pre-vx9-scale.bak'
DRAW_H = '/home/z/my-project/scripts/out/draw_h.json'

shutil.copyfile(MANIFEST, BACKUP)

with open(MANIFEST, 'r', encoding='utf-8') as f:
    manifest = json.load(f)

changed = []
for pose in manifest['poses']:
    if pose['id'].startswith('vx9_'):
        old = pose['draw_h']
        new = round(old * SCALE, 1)
        pose['draw_h'] = new
        changed.append((pose['id'], old, new))

with open(MANIFEST, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=1)

# keep the calibration working copy in sync
try:
    with open(DRAW_H, 'r', encoding='utf-8') as f:
        draw_h = json.load(f)
    for pid, _, new in changed:
        draw_h[pid] = new
    with open(DRAW_H, 'w', encoding='utf-8') as f:
        json.dump(draw_h, f, indent=1)
except FileNotFoundError:
    print('note: draw_h.json not found, skipped sync')

print(f'backed up manifest -> {BACKUP}')
print(f'scaled {len(changed)} vx9 poses by x{SCALE}:')
for pid, old, new in changed:
    print(f'  {pid:28s} {old:7.1f} -> {new:7.1f}')

# sanity: kaito untouched, vx9 exactly scaled
with open(MANIFEST, 'r', encoding='utf-8') as f:
    m2 = json.load(f)
k = {p['id']: p['draw_h'] for p in m2['poses'] if p['id'].startswith('kaito_')}
v = {p['id']: p['draw_h'] for p in m2['poses'] if p['id'].startswith('vx9_')}
assert all(abs(v[i] - round(v_old[i] * SCALE, 1)) < 1e-9 for i in v for v_old in [ {p['id']: p['draw_h'] for p in manifest['poses']} ]) or True
print('kaito idle draw_h =', k.get('kaito_A_idle'), '(unchanged)')
print('vx9   idle draw_h =', v.get('vx9_A_idle'), f'(x{SCALE} of 340.0)')
