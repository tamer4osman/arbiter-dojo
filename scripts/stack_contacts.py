#!/usr/bin/env python3
"""Stack the per-sheet contact JPGs into two combined verification images."""
from PIL import Image

DL = '/home/z/my-project/download'


def stack(paths, out):
    ims = [Image.open(p) for p in paths]
    w = max(i.width for i in ims)
    h = sum(i.height for i in ims) + 10 * (len(ims) - 1)
    canvas = Image.new('RGB', (w, h), (10, 10, 16))
    y = 0
    for im in ims:
        canvas.paste(im, (0, y))
        y += im.height + 10
    canvas.save(out, quality=85)
    print(out, canvas.size)


stack([f'{DL}/contact_kaito_A.jpg', f'{DL}/contact_kaito_B.jpg', f'{DL}/contact_kaito_C.jpg'],
      f'{DL}/contact_kaito_all.jpg')
stack([f'{DL}/contact_vx9_A.jpg', f'{DL}/contact_vx9_B.jpg', f'{DL}/contact_vx9_C.jpg'],
      f'{DL}/contact_vx9_all.jpg')
