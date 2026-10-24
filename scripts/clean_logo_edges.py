#!/usr/bin/env python3
"""
Removes the leftover white studio fringe from the keyed logo video
(public/video/jo-logo-packed.mp4: colour on top, matte below) — in place.

For every frame:
  1. interior colour: average colour of nearby solid pixels (normalised blur
     of colour × solid mask), i.e. what the material looks like just inside
     the edge
  2. spill: edge pixels that are clearly brighter and less saturated than
     that interior colour (white studio backdrop mixed into fur tips, grass
     blades, inside the cut-outs). Bright materials (chrome) are left alone,
     because their interior is bright too.
  3. spill pixels lose alpha and take the interior colour
  4. a gentle 1 px choke of the matte + removal of tiny isolated specks

    python3 scripts/clean_logo_edges.py              # cleans public/video/jo-logo-packed.mp4
    python3 scripts/clean_logo_edges.py IN.mp4 OUT.mp4
"""
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DEFAULT = ROOT / "public" / "video" / "jo-logo-packed.mp4"

CFG = {
    "interior_alpha": 0.97,  # alpha above which a pixel counts as solid material
    "interior_radius": 9,  # px, neighbourhood for the interior colour
    "edge_band": 12,  # px from the transparent side that are examined
    "lum_lo": 0.04,  # brighter than the interior by this much → starts counting as spill
    "lum_hi": 0.22,  # … fully spill
    "sat_drop": 0.35,  # spill must also be at most this fraction as saturated as the interior
    "choke": 0.6,  # 0 = no matte choke, 1 = full 1 px erosion
    "speck_px": 24,  # isolated opaque blobs smaller than this (px) are removed
}


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def clean_frame(c, a):
    """c: HxWx3 float 0..1 (straight colour), a: HxW float 0..1 → (c, a)."""
    solid = (a >= CFG["interior_alpha"]).astype(np.float32)
    k = 2 * CFG["interior_radius"] + 1
    wsum = cv2.blur(solid, (k, k))
    interior = cv2.blur(c * solid[..., None], (k, k)) / np.maximum(wsum, 1e-4)[..., None]
    have = wsum > 0.02

    # distance (px) from fully transparent pixels → edge band
    dist = cv2.distanceTransform((a > 0.02).astype(np.uint8), cv2.DIST_L2, 3)
    band = (dist < CFG["edge_band"]) & (a > 0.0)

    lum = c @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    ilum = interior @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    sat = c.max(-1) - c.min(-1)
    isat = interior.max(-1) - interior.min(-1)

    brighter = smooth(CFG["lum_lo"], CFG["lum_hi"], lum - ilum)
    paler = smooth(isat * (1 - CFG["sat_drop"]) + 0.02, isat * CFG["sat_drop"], sat)  # 1 when much less saturated
    whiteish = smooth(0.55, 0.74, lum)  # only near-white pixels are studio spill
    spill = np.where(band & have, brighter * paler * whiteish, 0.0).astype(np.float32)

    a2 = a * (1 - spill)
    c2 = c * (1 - spill[..., None]) + interior * spill[..., None]

    # gentle choke: blend toward a 3×3 erosion (pulls in the outermost half-mixed ring)
    if CFG["choke"] > 0:
        er = cv2.erode(a2, np.ones((3, 3), np.uint8))
        a2 = a2 * (1 - CFG["choke"]) + np.minimum(a2, er) * CFG["choke"] + 0 * a2
        # keep solid interiors untouched
        a2 = np.where(a >= CFG["interior_alpha"], np.maximum(a2, er), a2)

    # remove tiny isolated specks (floating white wisps)
    n, lab, stats, _ = cv2.connectedComponentsWithStats((a2 > 0.25).astype(np.uint8), 8)
    if n > 2:
        small = np.isin(lab, np.nonzero(stats[:, cv2.CC_STAT_AREA] < CFG["speck_px"])[0])
        small &= lab > 0
        a2[small] *= 0.15

    return np.clip(c2, 0, 1), np.clip(a2, 0, 1)


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src
    fps = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(src)]).decode().strip()
    cap = cv2.VideoCapture(str(src))
    tmp = dst.with_suffix(".cleaning.mp4")
    proc = None
    n = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        f = cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
        h = f.shape[0] // 2
        c, a = clean_frame(f[:h], f[h:, :, 0])
        out = np.concatenate([c, np.repeat(a[..., None], 3, -1)], 0)
        out = (out * 255 + 0.5).astype(np.uint8)
        if proc is None:
            H, W = out.shape[:2]
            proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", fps, "-i", "-", "-an",
                                     "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(tmp)], stdin=subprocess.PIPE)
        proc.stdin.write(out.tobytes())
        n += 1
    proc.stdin.close()
    proc.wait()
    tmp.replace(dst)
    print(f"cleaned {n} frames → {dst.relative_to(ROOT) if dst.is_relative_to(ROOT) else dst}")


if __name__ == "__main__":
    main()
