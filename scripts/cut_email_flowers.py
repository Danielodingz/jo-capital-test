#!/usr/bin/env python3
"""
Cuts the flower sprigs out of reference-images/styles/email-flowers-reference.png
(the approved look for the email field) so the site can grow them out of the
real email pill one sprig at a time.

  1. key out the blue background (flowers/stems are warm or neutral, sky is blue),
     un-mixing edge colours so thin stems and petal edges stay clean
  2. remove the reference's own glass pill (its interior and its thin bright rim)
  3. split into connected sprigs; for each, record its bounding box and the point
     where it touches the pill (the growth origin)
  4. write one WebP sprite + a JSON describing the sprigs relative to the pill

    python3 scripts/cut_email_flowers.py
Outputs public/images/email-flowers.webp and src/components/emailFlowers.json
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "reference-images" / "styles" / "email-flowers-reference.png"
OUT_IMG = ROOT / "public" / "images" / "email-flowers.webp"
OUT_JSON = ROOT / "src" / "components" / "emailFlowers.json"

PILL = dict(x0=252, y0=288, x1=1828, y1=487)  # the glass pill in the reference (px)
SPRITE_SCALE = 0.6


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def main():
    img = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
    H, W, _ = img.shape
    R, G, B = img[..., 0], img[..., 1], img[..., 2]

    # --- background model: heavy median of the image with flowers suppressed
    blueish = (B - R) > 90
    bg = img.copy()
    bg[~blueish] = np.nan
    small = cv2.resize(np.nan_to_num(bg, nan=0), (W // 16, H // 16), interpolation=cv2.INTER_AREA)
    cnt = cv2.resize(blueish.astype(np.float32), (W // 16, H // 16), interpolation=cv2.INTER_AREA)
    small = small / np.maximum(cnt[..., None], 1e-3)
    small = cv2.GaussianBlur(small, (0, 0), 3)
    bgfull = cv2.resize(small, (W, H), interpolation=cv2.INTER_CUBIC)

    # --- alpha: how far a pixel is from the local sky colour toward "not blue"
    blueness = B - R
    bg_blueness = bgfull[..., 2] - bgfull[..., 0]
    alpha = smooth(bg_blueness * 0.72, bg_blueness * 0.12, blueness)
    # brightness difference also counts (white petals on lighter sky)
    lum = img.mean(-1)
    alpha = np.maximum(alpha, smooth(25, 70, np.abs(lum - bgfull.mean(-1))) * smooth(bg_blueness * 0.85, bg_blueness * 0.35, blueness))

    # --- remove the reference pill: interior + its bright rim
    yy, xx = np.mgrid[0:H, 0:W]
    r = (PILL["y1"] - PILL["y0"]) / 2
    cy = (PILL["y0"] + PILL["y1"]) / 2
    cxl = PILL["x0"] + r
    cxr = PILL["x1"] - r
    cxc = np.clip(xx, cxl, cxr)
    d_out = np.hypot(xx - cxc, yy - cy) - r  # signed distance to the pill outline (<0 inside)
    alpha[d_out < -12] = 0
    band = np.abs(d_out) <= 12
    # in the rim band keep only coloured flower parts, or white areas wider than the rim line
    colored = ((R - B) > 6) | ((G - B) > 0)
    white = (lum > 215) & (blueness < 22)
    white_wide = cv2.morphologyEx(white.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)).astype(bool)
    keep = colored | white_wide
    keep = cv2.dilate(keep.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    alpha[band & ~keep] = 0
    # the button/text area is all inside the pill → already gone

    # --- un-mix colours from the sky
    a = np.clip(alpha, 1e-3, 1)[..., None]
    col = np.clip((img - (1 - a) * bgfull) / a, 0, 255)
    col = np.where(alpha[..., None] > 0.02, col, 0)

    # --- drop leftover bits of the reference's rim: blobs that never leave the rim band
    solid0 = alpha > 0.2
    lab0, n0 = ndimage.label(solid0, structure=np.ones((3, 3)))
    if n0:
        outside = ndimage.maximum((np.abs(d_out) > 12).astype(np.uint8), lab0, range(1, n0 + 1))
        inband_only = np.isin(lab0, 1 + np.nonzero(np.asarray(outside) == 0)[0]) & (lab0 > 0)
        alpha[inband_only] = 0
        # faint fringe pixels hugging the rim line inside the band
        alpha[band & (alpha < 0.35)] = 0

    # --- position of every pixel along the pill outline (perimeter coordinate, px)
    straight = cxr - cxl
    ang = np.arctan2(yy - cy, xx - cxc)
    # unified coordinate: start at the left cap's middle, go clockwise (up/over the top, round the right, back along the bottom)
    total = 2 * straight + 2 * np.pi * r
    p = np.zeros_like(xx, dtype=np.float32)
    lc = xx < cxl
    rc = xx > cxr
    mid = ~lc & ~rc
    # left cap: angle measured from pointing left (π); upward half is clockwise-positive
    th = np.arctan2(-(yy - cy), -(xx - cxl))  # 0 = pointing left, + = up
    p[lc] = np.where(th[lc] >= 0, th[lc] * r, total + th[lc] * r)
    top = mid & (yy < cy)
    bot = mid & (yy >= cy)
    p[top] = np.pi / 2 * r + (xx[top] - cxl)
    tr = np.arctan2(-(yy - cy), xx - cxr)  # 0 = pointing right, + = up
    p[rc] = np.pi / 2 * r + straight + (np.pi / 2 - tr[rc]) * r
    p[bot] = np.pi / 2 * r + straight + np.pi * r + (cxr - xx[bot])
    p = np.mod(p, total)
    SEG = 150  # px of outline per sprig section

    # --- sprigs = connected components (stems joined by a small dilation)
    solid = alpha > 0.25
    joined = cv2.dilate(solid.astype(np.uint8), np.ones((5, 5), np.uint8))
    lab, n = ndimage.label(joined)
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    pieces = []
    keep_mask = np.zeros_like(solid)
    seg = np.floor(p / SEG).astype(np.int32)
    parts = []
    for i, sz in enumerate(sizes, start=1):
        if sz < 60:
            continue
        mi = (lab == i) & (alpha > 0.02)
        for sg in np.unique(seg[mi]):
            m = mi & (seg == sg)
            if (m & solid).sum() < 40:
                # tiny leftovers stay with the component's biggest section
                continue
            parts.append(m)
        # pixels of tiny sections: attach to the nearest kept section of this component
    for m in parts:
        ys, xs = np.nonzero(m)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        # growth origin = the part of the sprig closest to the pill outline
        dd = np.abs(d_out[ys, xs])
        k = np.argmin(dd)
        ox, oy = int(xs[k]), int(ys[k])
        side = "left" if ox < (PILL["x0"] + PILL["x1"]) / 2 else "right"
        pieces.append(dict(x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0), ox=ox, oy=oy, side=side, area=int(m.sum()), touch=float(dd[k]), perim=float(p[oy, ox]), total=float(total)))
        keep_mask |= m
    # tiny sections dropped from `parts` must still be drawn: give them to the nearest piece
    rest = (lab > 0) & (alpha > 0.02) & ~keep_mask
    if rest.any() and pieces:
        ry, rx = np.nonzero(rest)
        for y, x in zip(ry, rx):
            best = min(pieces, key=lambda q: (max(q['x'] - x, 0, x - q['x'] - q['w'] + 1) ** 2 + max(q['y'] - y, 0, y - q['y'] - q['h'] + 1) ** 2))
            if best['x'] - 30 <= x < best['x'] + best['w'] + 30 and best['y'] - 30 <= y < best['y'] + best['h'] + 30:
                nx0, ny0 = min(best['x'], x), min(best['y'], y)
                best['w'] = max(best['x'] + best['w'], x + 1) - nx0
                best['h'] = max(best['y'] + best['h'], y + 1) - ny0
                best['x'], best['y'] = int(nx0), int(ny0)
                keep_mask[y, x] = True
    alpha = np.where(keep_mask, alpha, 0)

    rgba = np.dstack([col, alpha * 255]).astype(np.uint8)
    sw, sh = int(W * SPRITE_SCALE), int(H * SPRITE_SCALE)
    Image.fromarray(rgba, "RGBA").resize((sw, sh), Image.LANCZOS).save(OUT_IMG, "WEBP", quality=88, method=6)
    Image.fromarray(rgba, "RGBA").save(ROOT / ".scratch" / "email-flowers-full.png")

    data = dict(source=dict(w=W, h=H), sprite=dict(w=sw, h=sh, scale=SPRITE_SCALE), pill=PILL, pieces=pieces)
    OUT_JSON.write_text(json.dumps(data, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)))
    print(f"{len(pieces)} sprigs → {OUT_IMG.relative_to(ROOT)} ({OUT_IMG.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
