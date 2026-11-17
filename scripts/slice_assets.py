#!/usr/bin/env python3
"""
slice_assets.py - Slice the delivered Fight.zip art into game-ready sprites.

Character pose sheets: magenta-key -> alpha -> merged connected components
(drones / ribbons stay attached) -> transparent PNGs + manifest.
UI kit + VFX sheets: fixed crop boxes (labels excluded).
Stages: lanczos upscale to 1920x1080.
Outputs contact sheets into download/ for visual verification.
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter, ImageDraw

SRC = '/home/z/my-project/upload/Fight_extracted/Fight'
OUT = '/home/z/my-project/public/game/assets'
DL = '/home/z/my-project/download'

SHEETS = {
    'kaito_A': ('Kaito Ren_Movement_Defense.jpg', 'kaito'),
    'kaito_B': ('Kaito Ren_Attacks.jpg', 'kaito'),
    'kaito_C': ('Kaito Ren_Reactions_Signature.jpg', 'kaito'),
    'vx9_A': ('VX-9 ARBITER_Movement_Defense.jpg', 'vx9'),
    'vx9_B': ('VX-9 ARBITER_Attacks.jpg', 'vx9'),
    'vx9_C': ('VX-9 ARBITER_ Reactions_Signature.jpg', 'vx9'),
}

# Semantic pose labels, index order == component discovery order (row-major).
# Verified against contact sheets produced by this same script.
LABELS = {
    'kaito_A': ['idle', 'walk_f', 'walk_b', 'crouch', 'crouch_guard', 'guard_high',
                'hit_light', 'blockstun', 'jump_f', 'jump_up', 'jump_down', 'dash'],
    'kaito_B': ['jab', 'cross', 'launcher', 'high_kick', 'heavy_kick', 'sweep'],
    'kaito_C': ['hit_high', 'hit_body', 'knockdown', 'sig_charge', 'sig_fire', 'dizzy'],
    'vx9_A': ['idle', 'walk_f', 'walk_b', 'crouch', 'blockstun', 'guard_high',
              'jump_up', 'jump_down', 'dash'],
    'vx9_B': ['jab', 'cross', 'launcher', 'high_kick', 'heavy_kick', 'sweep'],
    'vx9_C': ['hit_high', 'hit_body', 'knockdown', 'sig_charge', 'sig_fire', 'dizzy'],
}

# Display height hints per semantic pose (canvas px)
DRAW_H = {
    'idle': 340, 'walk_f': 340, 'walk_b': 340, 'dash': 330,
    'crouch': 250, 'crouch_guard': 250, 'guard_high': 345, 'blockstun': 340,
    'hit_light': 335, 'jump_f': 330, 'jump_up': 330, 'jump_down': 320,
    'jab': 345, 'cross': 345, 'launcher': 360, 'high_kick': 350,
    'heavy_kick': 350, 'sweep': 240, 'hit_high': 335, 'hit_body': 330,
    'knockdown': 170, 'sig_charge': 345, 'sig_fire': 345, 'dizzy': 300,
}

# Fixed crops for UI kit sheet (2752x1536). (l, t, r, b) in source pixels.
UI_CROPS = {
    'health_frame': (60, 150, 1260, 390),
    'drive_gauge': (140, 575, 760, 750),
    'timer_disc': (1450, 150, 1840, 470),
    'portrait_kaito': (1070, 570, 1490, 970),
    'portrait_vx9': (1518, 570, 1920, 970),
    'vs_screen': (70, 1005, 1390, 1518),
    'title_emblem': (2060, 155, 2640, 795),
    'ko_banner': (1435, 1105, 2710, 1518),
}

# Fixed crops for VFX sheet (2752x1536).
VFX_CROPS = {
    'hitspark': (40, 100, 570, 580),
    'heavy_flash': (620, 90, 1320, 725),
    'proj_kaito': (1370, 165, 2035, 545),
    'proj_vx9': (2105, 155, 2730, 510),
    'parry_ring': (30, 790, 545, 1440),
    'dust': (585, 850, 1225, 1495),
    'aura_kaito': (1250, 835, 1530, 1536),
    'aura_vx9': (1532, 835, 1830, 1536),
    'ko_burst': (1855, 745, 2745, 1536),
}

STAGES = {
    'stage_umbra': 'Stage1.png',
    'stage_rooftop': 'Stage2.png',
    'stage_docks': 'Stage3.png',
    'stage_finale': 'Final Stage.png',
}


def magenta_mask(rgb: np.ndarray) -> np.ndarray:
    """True where pixel is magenta background."""
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    return (r > 140) & (b > 110) & (g < r - 55) & (g < b - 35)


def alpha_from_mask(rgb: np.ndarray) -> np.ndarray:
    mask = magenta_mask(rgb)
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    im = Image.fromarray(alpha, 'L')
    im = im.filter(ImageFilter.MedianFilter(5))
    im = im.filter(ImageFilter.MinFilter(3))       # erode 1px fringe
    im = im.filter(ImageFilter.GaussianBlur(0.8))  # feather
    return np.array(im)


def slice_sheet(path: str, out_dir: str, out_rel: str, prefix: str, labels: list[str]) -> list[dict]:
    img = Image.open(path).convert('RGB')
    rgb = np.array(img)
    alpha = alpha_from_mask(rgb)
    solid = alpha > 128

    # Label precisely; attach small parts (drones, ribbon tips) to the NEAREST
    # large pose core by center distance - selective, no chain merging.
    from scipy import ndimage
    lbl, n = ndimage.label(solid)
    comps = []
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        if xs.size < 800:  # jpeg specks
            continue
        comps.append({
            'id': i,
            'l': int(xs.min()), 't': int(ys.min()),
            'r': int(xs.max()), 'b': int(ys.max()),
            'cx': float(xs.mean()), 'cy': float(ys.mean()), 'area': int(xs.size),
        })

    big = [c for c in comps if c['area'] >= 9000]
    small = [c for c in comps if c['area'] < 9000]

    BIG_MERGE = 210

    def cdist(a, b):
        return ((a['cx'] - b['cx']) ** 2 + (a['cy'] - b['cy']) ** 2) ** 0.5

    changed = True
    while changed and len(big) > 1:
        changed = False
        for i in range(len(big)):
            for j in range(i + 1, len(big)):
                if cdist(big[i], big[j]) < BIG_MERGE:
                    big[i] = {
                        'l': min(big[i]['l'], big[j]['l']), 't': min(big[i]['t'], big[j]['t']),
                        'r': max(big[i]['r'], big[j]['r']), 'b': max(big[i]['b'], big[j]['b']),
                        'cx': (big[i]['cx'] + big[j]['cx']) / 2,
                        'cy': (big[i]['cy'] + big[j]['cy']) / 2,
                        'area': big[i]['area'] + big[j]['area'],
                    }
                    big.pop(j)
                    changed = True
                    break
            if changed:
                break

    groups = [[dict(b, ids=[b['id']])] for b in big]
    for s in small:
        if not big:
            break
        dists = [cdist(s, b) for b in big]
        j = int(np.argmin(dists))
        if dists[j] < 270:
            groups[j].append(s)
            groups[j][0]['ids'].append(s['id'])

    boxes = []
    for g in groups:
        l = min(c['l'] for c in g)
        t = min(c['t'] for c in g)
        r = max(c['r'] for c in g)
        b = max(c['b'] for c in g)
        if sum(c['area'] for c in g) >= 3000:
            boxes.append((t, l, b, r, set(g[0]['ids'])))
    boxes.sort(key=lambda bb: (bb[0] // 300, bb[1]))  # row-major

    entries = []
    os.makedirs(out_dir, exist_ok=True)
    for idx, (t, l, b, r, own_ids) in enumerate(boxes):
        pad = 10
        L, T = max(0, l - pad), max(0, t - pad)
        R, B = min(rgb.shape[1], r + pad), min(rgb.shape[0], b + pad)
        sub_rgb = rgb[T:B, L:R]
        # zero out pixels belonging to OTHER poses' components
        own = np.isin(lbl[T:B, L:R], list(own_ids))
        sub_a = np.where(own, alpha[T:B, L:R], 0)
        if idx >= len(labels):
            name = f'{prefix}_extra{idx:02d}'
        else:
            name = f'{prefix}_{labels[idx]}'
        rgba = np.dstack([sub_rgb, sub_a])
        Image.fromarray(rgba, 'RGBA').save(os.path.join(out_dir, f'{name}.png'))
        label = labels[idx] if idx < len(labels) else f'extra{idx}'
        entries.append({
            'id': name, 'file': f'{out_rel}/{name}.png',
            'sheet': os.path.basename(path), 'index': idx,
            'label': label,
            'w': R - L, 'h': B - T,
            'draw_h': DRAW_H.get(label, 340),
        })
    return entries


def crop_map(sheet_path: str, crops: dict, out_dir: str) -> dict:
    img = Image.open(sheet_path).convert('RGB')
    os.makedirs(out_dir, exist_ok=True)
    out = {}
    for name, (l, t, r, b) in crops.items():
        c = img.crop((l, t, r, b))
        c.save(os.path.join(out_dir, f'{name}.png'))
        out[name] = {'file': f'{os.path.basename(out_dir)}/{name}.png', 'w': c.width, 'h': c.height}
    return out


def contact_sheet(entries: list[dict], src_dir: str, out_path: str, cols: int = 6, cell=(300, 340)):
    rows = (len(entries) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell[0], rows * (cell[1] + 26)), (24, 24, 34))
    d = ImageDraw.Draw(sheet)
    for i, e in enumerate(entries):
        pose = Image.open(os.path.join(src_dir, e['file'])).convert('RGBA')
        scale = min((cell[0] - 16) / pose.width, (cell[1] - 16) / pose.height, 1.0)
        pose = pose.resize((max(1, int(pose.width * scale)), max(1, int(pose.height * scale))))
        cx = (i % cols) * cell[0]
        cy = (i // cols) * (cell[1] + 26)
        bgc = Image.new('RGBA', (cell[0], cell[1]), (40, 40, 56, 255))
        bgc.paste(pose, ((cell[0] - pose.width) // 2, (cell[1] - pose.height) // 2), pose)
        sheet.paste(bgc.convert('RGB'), (cx, cy))
        d.text((cx + 8, cy + cell[1] + 4), f"{e['index']}: {e['label']} ({e['w']}x{e['h']})",
               fill=(255, 220, 120))
    sheet.save(out_path, quality=88)
    print('contact sheet ->', out_path, f'({len(entries)} poses)')


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {'poses': [], 'ui': {}, 'vfx': {}, 'stages': {}}

    for key, (fname, char) in SHEETS.items():
        prefix = {'kaito_A': 'kaito_A', 'kaito_B': 'kaito_B', 'kaito_C': 'kaito_C',
                  'vx9_A': 'vx9_A', 'vx9_B': 'vx9_B', 'vx9_C': 'vx9_C'}[key]
        entries = slice_sheet(os.path.join(SRC, fname), os.path.join(OUT, 'poses', char),
                              f'poses/{char}', prefix, LABELS[key])
        manifest['poses'].extend(entries)
        cs_name = f'contact_{key}.jpg'
        contact_sheet(entries, OUT, os.path.join(DL, cs_name))
        print(f'{key}: {len(entries)} poses (expected {len(LABELS[key])})')

    manifest['ui'] = crop_map(os.path.join(SRC, 'UI_HUD_assets.jpg'), UI_CROPS,
                              os.path.join(OUT, 'ui'))
    manifest['vfx'] = crop_map(os.path.join(SRC, 'VFX sprites.jpg'), VFX_CROPS,
                               os.path.join(OUT, 'vfx'))

    for sid, fname in STAGES.items():
        os.makedirs(os.path.join(OUT, 'stages'), exist_ok=True)
        img = Image.open(os.path.join(SRC, fname)).convert('RGB')
        img = img.resize((1920, 1080), Image.LANCZOS)
        img.save(os.path.join(OUT, 'stages', f'{sid}.jpg'), quality=90)
        manifest['stages'][sid] = {'file': f'stages/{sid}.jpg', 'w': 1920, 'h': 1080}

    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)

    # One combined UI+VFX verification contact
    cell = (320, 260)
    items = [('ui', k) for k in manifest['ui']] + [('vfx', k) for k in manifest['vfx']]
    cols = 5
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell[0], rows * (cell[1] + 24)), (24, 24, 34))
    d = ImageDraw.Draw(sheet)
    for i, (kind, k) in enumerate(items):
        im = Image.open(os.path.join(OUT, kind, f'{k}.png'))
        scale = min((cell[0] - 12) / im.width, (cell[1] - 12) / im.height, 1.0)
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
        cx, cy = (i % cols) * cell[0], (i // cols) * (cell[1] + 24)
        sheet.paste(im, (cx + 6, cy + 6))
        d.text((cx + 8, cy + cell[1] + 2), f'{k}', fill=(160, 220, 255))
    sheet.save(os.path.join(DL, 'contact_ui_vfx.jpg'), quality=88)
    print('contact sheet -> download/contact_ui_vfx.jpg')
    print('DONE. poses:', len(manifest['poses']))


if __name__ == '__main__':
    main()
