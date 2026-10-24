#!/usr/bin/env python3
"""
Removes the studio background from the JO Capital logo video and writes a
web-ready "packed alpha" MP4 (colour on top, matte below) + a poster frame.

Why packed alpha: transparent video formats aren't universal (VP9-alpha
doesn't play on iPhone/Safari; HEVC-alpha can't be produced outside Apple
tools). A plain H.264 MP4 with the matte stacked under the colour plays
everywhere; the site's WebGL layer recombines them.

Method (no ML needed — the background is a clean neutral studio sweep):
  1. model the background per frame as a smooth 2-D polynomial fitted to
     pixels the logo never covers
  2. alpha from colour/brightness difference to that background + saturation
     (the backdrop is grey, every material has some colour or texture)
  3. bridge small gaps, fill pinholes, but keep the logo's real cut-outs
     (J and circle) transparent: enclosed regions that look exactly like the
     background (low difference, low texture) and are large stay holes
  4. the floor shadow becomes a soft black matte (darkens the grass on the site)
  5. edge colours are un-mixed from the white background (no white halos)
  6. the clip is made loopable with a short cross-fade (end → start)

    python3 scripts/key_logo_video.py INPUT.mp4
Outputs public/video/jo-logo-packed.mp4 and public/video/jo-logo-poster.png.
Needs: ffmpeg, numpy, scipy, opencv-python, Pillow.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "video"

CFG = {
    "work_w": 960,           # processing / output width (logo crop is taken from this)
    "diff_lo": 6.0,          # difference (0-255) where alpha starts
    "diff_hi": 22.0,         # difference where alpha is full
    "sat_lo": 5.0,           # chroma where alpha starts
    "sat_hi": 16.0,
    "texture_lo": 1.2,       # local texture (std of difference) where alpha starts
    "texture_hi": 4.0,
    "close_px": 5,           # gap bridging radius
    "hole_keep_frac": 0.012, # enclosed bg-like regions larger than this × object area stay transparent
    "shadow_strength": 1.0,  # 0 = drop the floor shadow
    "loop_xfade_s": 0.6,     # loop cross-fade length
    "pad": 44,               # px of padding around the union bounding box
}


def run(cmd):
    subprocess.run(cmd, check=True)


def read_frames(src, tmp, w):
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-an", "-vf", f"scale={w}:-2:flags=lanczos", str(tmp / "%04d.png")])
    files = sorted(tmp.glob("*.png"))
    return [cv2.cvtColor(cv2.imread(str(f)), cv2.COLOR_BGR2RGB).astype(np.float32) for f in files]


def poly_design(xs, ys, deg=4):
    cols = []
    for i in range(deg + 1):
        for j in range(deg + 1 - i):
            cols.append((xs ** i) * (ys ** j))
    return np.stack(cols, axis=-1)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1])
    fps = float(eval(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(src)]).decode().strip()))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        frames = read_frames(src, tmp, CFG["work_w"])
    H, W, _ = frames[0].shape
    n = len(frames)
    print(f"{n} frames {W}x{H} @ {fps}fps")

    # --- where the logo/shadow ever is (to fit the background elsewhere)
    stack = np.stack(frames[:: max(1, n // 60)])
    mx = stack.max(0)
    covered = (np.abs(stack - mx).max(-1) > 18).mean(0) > 0.01
    covered = ndimage.binary_dilation(covered, iterations=int(0.04 * W))
    ys, xs = np.mgrid[0:H, 0:W]
    xn = xs / W - 0.5
    yn = ys / H - 0.5
    free = ~covered
    sub = np.zeros_like(free)
    sub[::4, ::4] = True
    pick = free & sub
    A = poly_design(xn[pick], yn[pick])
    Afull = poly_design(xn.ravel(), yn.ravel())

    alphas, colors, shadows = [], [], []
    for k, f in enumerate(frames):
        lum = f.mean(-1)
        coef, *_ = np.linalg.lstsq(A, lum[pick], rcond=None)
        plate = (Afull @ coef).reshape(H, W)

        d = f - plate[..., None]
        diff = np.abs(d).max(-1)
        sat = f.max(-1) - f.min(-1)
        tex = ndimage.uniform_filter(diff ** 2, 5) - ndimage.uniform_filter(diff, 5) ** 2
        tex = np.sqrt(np.maximum(tex, 0))

        def ramp(x, lo, hi):
            return np.clip((x - lo) / (hi - lo), 0, 1)

        a = np.maximum.reduce([ramp(diff, CFG["diff_lo"], CFG["diff_hi"]), ramp(sat, CFG["sat_lo"], CFG["sat_hi"]), ramp(tex, CFG["texture_lo"], CFG["texture_hi"]) * 0.85])

        # --- floor shadow: neutral darkening below the object, separate from it
        dark = np.clip((plate - lum) / np.maximum(plate, 1), 0, 1)
        neutral = sat < 6

        # --- solid object mask (bridge gaps, fill pinholes, keep real cut-outs)
        hard = a > 0.5
        hard = cv2.morphologyEx(hard.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * CFG["close_px"] + 1,) * 2)).astype(bool)
        lab, nl = ndimage.label(hard)
        if nl:
            sizes = ndimage.sum(hard, lab, range(1, nl + 1))
            main_lbl = 1 + int(np.argmax(sizes))
            obj = lab == main_lbl
        else:
            obj = hard
        filled = ndimage.binary_fill_holes(obj)
        holes = filled & ~obj
        hl, nh = ndimage.label(holes)
        area = obj.sum()
        keep_holes = np.zeros_like(holes)
        for i in range(1, nh + 1):
            region = hl == i
            if region.sum() > CFG["hole_keep_frac"] * area and np.median(diff[region]) < CFG["diff_lo"] + 2 and np.median(tex[region]) < CFG["texture_hi"]:
                keep_holes |= region
        solid = filled & ~keep_holes

        # soft alpha: inside the solid shape take max(soft, eroded solid); outside keep soft edge only near the object
        # core shrunk by a few px: the outermost ring of pixels is part studio-white, so it
        # gets its alpha from the soft key (not forced opaque) → no white outline
        core = cv2.erode(solid.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))).astype(np.float32)
        near = cv2.dilate(solid.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(bool)
        alpha = np.where(near, np.maximum(a, core), 0.0)
        alpha[keep_holes] = np.minimum(alpha[keep_holes], a[keep_holes] * 0.6)
        # Edge band: proper matting estimate. For each edge pixel take the object colour F
        # from the nearest solid-core pixel (blurred) and the backdrop B; coverage is how
        # far the observed colour C sits from B toward F:  alpha = (C-B)·(F-B) / |F-B|²
        band = near & (core < 0.5)
        if band.any() and core.any():
            _, (iy, ix) = ndimage.distance_transform_edt(core < 0.5, return_indices=True)
            Fc = cv2.GaussianBlur(f, (0, 0), 2.0)[iy, ix]
            B = plate[..., None]
            num = ((f - B) * (Fc - B)).sum(-1)
            den = ((Fc - B) ** 2).sum(-1)
            est = np.clip(num / np.maximum(den, 1.0), 0, 1)
            ok = den > 400  # only where object and backdrop differ enough for the estimate to hold
            alpha = np.where(band & ok, np.minimum(alpha, est * 1.08), alpha)
        # edge pixels still nearly as bright as the backdrop and colourless = background spill
        spill = (lum > plate - 10) & (sat < 8) & (core < 0.5)
        alpha = np.where(spill, alpha * 0.25, alpha)
        alpha = cv2.GaussianBlur(alpha, (0, 0), 0.6)

        # shadow only outside the object and below its centre
        oy = np.nonzero(solid)[0]
        below = ys > (oy.mean() if len(oy) else H / 2)
        sh = np.where(~near & neutral & below, dark, 0.0)
        # keep only a soft pool under the logo (the studio floor shadow streaks across the frame)
        ox = np.nonzero(solid)[1]
        if len(ox):
            cxo, half = (ox.min() + ox.max()) / 2, (ox.max() - ox.min()) / 2
            fall = np.clip(1 - np.abs(xs - cxo) / (half * 1.05), 0, 1) ** 1.5
            sh = sh * fall
        sh = cv2.GaussianBlur(sh, (0, 0), 2.0) * 2.2 * CFG["shadow_strength"]
        sh = np.clip(sh, 0, 0.6)

        # un-mix edge colours from the background
        aa = np.clip(alpha, 1e-3, 1)[..., None]
        col = np.clip((f - (1 - aa) * plate[..., None]) / aa, 0, 255)
        col = np.where(alpha[..., None] > 0.02, col, 0)
        # combined matte: object over shadow (shadow colour = black)
        total = alpha + sh * (1 - alpha)
        col = col * (alpha / np.maximum(total, 1e-3))[..., None]

        alphas.append(total.astype(np.float32))
        colors.append(col.astype(np.float32))
        if k % 40 == 0:
            print(f"  frame {k}: object px {int(solid.sum())}, kept holes {int(keep_holes.sum())}")

    # --- crop to the union bounding box
    union = np.max(np.stack(alphas), 0) > 0.08
    # ignore specks: keep only the big connected region(s)
    lab, nl = ndimage.label(ndimage.binary_opening(union, iterations=2))
    if nl:
        sizes = ndimage.sum(union, lab, range(1, nl + 1))
        union = np.isin(lab, 1 + np.nonzero(sizes > 0.02 * sizes.max())[0])
    yy, xx = np.nonzero(union)
    p = CFG["pad"]
    y0, y1 = max(0, yy.min() - p), min(H, yy.max() + p)
    x0, x1 = max(0, xx.min() - p), min(W, xx.max() + p)
    # even dimensions for H.264
    if (y1 - y0) % 2:
        y1 -= 1
    if (x1 - x0) % 2:
        x1 -= 1
    print("crop", x0, y0, x1 - x0, y1 - y0)

    # --- loop cross-fade: last N frames blend into the first N
    N = int(round(CFG["loop_xfade_s"] * fps))
    out_c, out_a = [], []
    total_frames = n - N
    for i in range(total_frames):
        c, a = colors[i], alphas[i]
        if i < N:
            t = (i + 1) / (N + 1)  # 0 → 1 over the fade: frame i blends with tail frame
            j = n - N + i
            c2, a2 = colors[j], alphas[j]
            # dissolve that stays solid where both frames are solid (no see-through moment)
            wa = a * t
            wb = a2 * (1 - t)
            atot = np.clip(wa + wb, 0, 1)
            c = (c * wa[..., None] + c2 * wb[..., None]) / np.maximum(wa + wb, 1e-3)[..., None]
            a = atot
        out_c.append(c[y0:y1, x0:x1])
        out_a.append(a[y0:y1, x0:x1])

    h, w = out_c[0].shape[:2]
    # write packed frames: colour premultiplied? No — straight colour on top, matte below
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for i, (c, a) in enumerate(zip(out_c, out_a)):
            packed = np.zeros((h * 2, w, 3), np.uint8)
            # bleed edge colour outward so compression doesn't pull in black at soft edges
            cc = c.copy()
            m = a > 0.02
            if (~m).any():
                idx = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
                cc = cc[idx[0], idx[1]]
                cc = np.where(m[..., None], c, cc)
                cc[(a < 0.02) & (ndimage.distance_transform_edt(~m) > 12)] = 0
            packed[:h] = np.clip(cc, 0, 255).astype(np.uint8)
            packed[h:] = np.clip(a * 255, 0, 255).astype(np.uint8)[..., None]
            cv2.imwrite(str(tmp / f"{i:04d}.png"), cv2.cvtColor(packed, cv2.COLOR_RGB2BGR))
            if i == N + 6:  # poster: a clean stone frame just after the loop dissolve
                rgba = np.dstack([np.clip(c, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)
                cv2.imwrite(str(OUT_DIR / "jo-logo-poster.png"), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
        out = OUT_DIR / "jo-logo-packed.mp4"
        run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", str(tmp / "%04d.png"), "-an",
             "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)])
    print(f"wrote {out.relative_to(ROOT)} ({w}x{h} colour + matte, {len(out_c)} frames, no audio)")
    # final pass: remove any leftover white studio fringe on soft edges (fur, grass)
    run([sys.executable, str(Path(__file__).with_name("clean_logo_edges.py")), str(out)])


if __name__ == "__main__":
    main()
