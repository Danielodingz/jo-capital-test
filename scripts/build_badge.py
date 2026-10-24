#!/usr/bin/env python3
"""
Builds public/models/jo-capital-badge.glb — the thick, rounded, stepped JO
Capital badge used by the site — from the original logo artwork.

Why rebuild instead of stretching the supplied GLB: the reference renders show
a much thicker slab with large rounded edges, a stepped top lip and softened
cut-outs. Scaling the old mesh in Z can't add rounded edges or a lip, so the
badge is regenerated from the logo outline itself (silhouette and cut-out
positions come straight from the artwork).

    python3 scripts/build_badge.py            # writes the GLB
    python3 scripts/build_badge.py --preview  # also writes a debug PNG of each ring level

Requires: numpy, scipy, scikit-image, matplotlib, Pillow.

All PROFILE values are fractions of the badge width W.
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
from matplotlib.path import Path as MplPath
from PIL import Image
from scipy import ndimage
from scipy.spatial import Delaunay
from skimage import measure

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "reference-images" / "jo-capital-original-transparent.png"
OUT = ROOT / "public" / "models" / "jo-capital-badge.glb"

MODEL_WIDTH = 2.4  # model units (matches the old GLB so scene config stays meaningful)

PROFILE = {
    # --- 2D shape --------------------------------------------------------
    # cut-outs shrink → thicker frame, like the references
    "hole_shrink_j": 0.02,
    "hole_shrink_circle": 0.03,
    "hole_round": 0.03,     # minimum radius on cut-out corners (rounds the J tip)
    # --- thickness: ONE solid block, no step / seam ------------------------
    "thickness": 0.28,      # total depth (fraction of width)
    # --- outer edge roundings (front = facing the viewer) -----------------
    "front_round": 0.054,
    "back_round": 0.048,
    # --- cut-out rim roundings ----------------------------------------------
    "hole_front_round": 0.012,
    "hole_back_round": 0.012,
}

SPACING = 0.0085  # target vertex spacing along rings (fraction of W)
ARC_STEPS = 9     # segments per rounded edge (smooth highlights)


def load_masks():
    a = np.asarray(Image.open(SRC).convert("RGBA"))[..., 3] > 127
    pad = 60
    a = np.pad(a, pad)
    outer = ndimage.binary_fill_holes(a)
    holes = outer & ~a
    ys, xs = np.nonzero(outer)
    w_px = xs.max() - xs.min() + 1
    cx = (xs.max() + xs.min()) / 2
    cy = (ys.max() + ys.min()) / 2

    P = PROFILE
    # shrink + round each cut-out (opening by a disk): erode by shrink+round, dilate by round
    labels, n = ndimage.label(holes)
    centroids = ndimage.center_of_mass(holes, labels, range(1, n + 1))
    holes2 = np.zeros_like(holes)
    for lab, (_, cxh) in zip(range(1, n + 1), centroids):
        shrink = P["hole_shrink_circle"] if cxh > cx else P["hole_shrink_j"]
        din = ndimage.distance_transform_edt(labels == lab)
        core = din > (shrink + P["hole_round"]) * w_px
        holes2 |= ndimage.distance_transform_edt(~core) <= P["hole_round"] * w_px
    holes2 &= outer

    # signed distance fields (px), positive on the material side
    sd_outer = ndimage.distance_transform_edt(outer) - ndimage.distance_transform_edt(~outer)
    sd_hole = ndimage.distance_transform_edt(~holes2) - ndimage.distance_transform_edt(holes2)
    sd_outer = ndimage.gaussian_filter(sd_outer, 1.2)
    sd_hole = ndimage.gaussian_filter(sd_hole, 1.2)
    return sd_outer, sd_hole, w_px, cx, cy


def arc(r, z0, rising, steps=ARC_STEPS):
    """Quarter-circle rounding. Returns list of (z, inset) with inset going r→0 (rising) or 0→r."""
    pts = []
    for i in range(steps + 1):
        t = i / steps * (np.pi / 2)
        z = z0 + r * (1 - np.cos(t)) if rising else z0 + r * np.sin(t)
        d = r * (1 - np.sin(t)) if rising else r * (1 - np.cos(t))
        pts.append((z, d))
    return pts


def piecewise(points):
    zs = np.array([p[0] for p in points])
    ds = np.array([p[1] for p in points])
    return lambda z: float(np.interp(z, zs, ds))


def build_profiles():
    """One continuous profile per loop: back rounding → straight wall → front rounding.
    No ledges or creases anywhere, so the sides read as a single solid block."""
    P = PROFILE
    T = P["thickness"]
    rb, rf = P["back_round"], P["front_round"]
    hb, hf = P["hole_back_round"], P["hole_front_round"]

    outer = arc(rb, 0.0, rising=True) + [(z, d) for z, d in arc(rf, T - rf, rising=False)]
    hole = arc(hb, 0.0, rising=True) + [(z, d) for z, d in arc(hf, T - hf, rising=False)]
    f_out, f_hole = piecewise(outer), piecewise(hole)

    zs = sorted({round(z, 6) for z, _ in outer} | {round(z, 6) for z, _ in hole})
    # merge levels that are almost identical (avoids sliver bands)
    merged = []
    for z in zs:
        if merged and z - merged[-1] < T * 0.004:
            continue
        merged.append(z)
    if merged[-1] != round(T, 6):
        merged[-1] = round(T, 6)
    return [dict(z=z, d_out=f_out(z), d_hole=f_hole(z), crease=False) for z in merged]


def resample(loop, n):
    seg = np.linalg.norm(np.diff(loop, axis=0, append=loop[:1]), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    total = s[-1]
    closed = np.vstack([loop, loop[:1]])
    t = np.linspace(0, total, n, endpoint=False)
    x = np.interp(t, s, closed[:, 0])
    y = np.interp(t, s, closed[:, 1])
    return np.stack([x, y], axis=1), total


def signed_area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def main():
    preview = "--preview" in sys.argv
    sd_outer, sd_hole, w_px, cx, cy = load_masks()
    scale = MODEL_WIDTH / w_px
    rings = build_profiles()

    # counts per loop, from the top-level perimeter
    counts = None
    names = ["outer", "j", "circle"]
    loops_per_ring = []
    for r in rings:
        F = np.minimum(sd_outer - r["d_out"] * w_px, sd_hole - r["d_hole"] * w_px)
        cs = measure.find_contours(F, 0.0)
        cs = [c for c in cs if len(c) > 20]
        if len(cs) != 3:
            raise SystemExit(f"topology changed at z={r['z']:.4f}: {len(cs)} loops (reduce roundings)")
        pts = []
        for c in cs:
            xy = np.stack([(c[:, 1] - cx) * scale, -(c[:, 0] - cy) * scale], axis=1)
            pts.append(xy)
        pts.sort(key=lambda p: -abs(signed_area(p)))
        outer = pts[0]
        holes = sorted(pts[1:], key=lambda p: p[:, 0].mean())  # J is left, circle right
        loops = [outer] + holes
        # orientation: outer CCW, holes CW (material on the left)
        loops = [l if (signed_area(l) > 0) == (i == 0) else l[::-1] for i, l in enumerate(loops)]
        loops_per_ring.append(loops)
        if counts is None:
            counts = [max(64, int(round(signed_perim(l) / (SPACING * MODEL_WIDTH) / 8)) * 8) for l in loops]

    # resample + align start points ring to ring
    vertices = []
    vert_index = []  # ring -> loop -> array of vertex ids
    prev_starts = [None, None, None]
    for ri, (r, loops) in enumerate(zip(rings, loops_per_ring)):
        ids_ring = []
        z = r["z"] * MODEL_WIDTH
        for li, l in enumerate(loops):
            rs_, _ = resample(l, counts[li])
            if prev_starts[li] is None:
                start = int(np.argmax(rs_[:, 1] - 0.001 * rs_[:, 0]))
            else:
                start = int(np.argmin(np.linalg.norm(rs_ - prev_starts[li], axis=1)))
            rs_ = np.roll(rs_, -start, axis=0)
            prev_starts[li] = rs_[0]
            base = len(vertices)
            for x, y in rs_:
                vertices.append((x, y, z))
            ids_ring.append(np.arange(base, base + len(rs_)))
        vert_index.append(ids_ring)

    V = np.array(vertices, dtype=np.float64)

    # crease at the ledge: duplicate the first ring of the upper slab so normals don't blend
    body_tris = []
    for ri in range(len(rings) - 1):
        lower = vert_index[ri]
        upper = vert_index[ri + 1]
        if rings[ri + 1]["crease"]:
            # the ledge band itself (flat) uses its own copies of the upper ring
            dup = []
            for ids in upper:
                base = len(V)
                V = np.vstack([V, V[ids]])
                dup.append(np.arange(base, base + len(ids)))
            for a, b in zip(lower, dup):
                body_tris += band(a, b)
            # and the lip wall starts from the original upper ring (separate normals)
            continue
        for a, b in zip(lower, upper):
            body_tris += band(a, b)

    # caps
    top_tris = cap(V, vert_index[-1], up=True)
    bottom_tris = cap(V, vert_index[0], up=False)
    V, top_tris = add_interior(V, top_tris)  # (no-op placeholder kept for clarity)

    body = np.array(body_tris + bottom_tris, dtype=np.uint32)
    top = np.array(top_tris, dtype=np.uint32)

    # drop degenerate triangles (the hole loops have zero-height ledge bands)
    def clean(t):
        a, b, c = V[t[:, 0]], V[t[:, 1]], V[t[:, 2]]
        area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
        return t[area > 1e-12]

    body, top = clean(body), clean(top)

    # The top cap and the body share the top ring vertices. Split them into two
    # primitives with their own vertex arrays (for separate materials), but compute
    # normals on the shared mesh first so the seam is smooth.
    N = vertex_normals(V, np.vstack([body, top]))
    UV = box_uv(V, N)

    # recentre: x/y on the bounding-box centre, z centred too (front faces +Z)
    zc = (V[:, 2].min() + V[:, 2].max()) / 2
    V[:, 2] -= zc

    prims = []
    for name, tris in (("Badge top face", top), ("Badge body", body)):
        used, inv = np.unique(tris.ravel(), return_inverse=True)
        prims.append(dict(name=name, pos=V[used], nrm=N[used], uv=UV[used], idx=inv.reshape(-1, 3)))

    write_glb(OUT, prims)
    tri_count = sum(len(p["idx"]) for p in prims)
    print(f"wrote {OUT.relative_to(ROOT)}  rings={len(rings)}  loops={counts}  triangles={tri_count}")
    bb = V.min(0), V.max(0)
    print("bounds", np.round(bb[0], 3), np.round(bb[1], 3))

    if preview:
        dump_preview(V, np.vstack([body, top]))


def signed_perim(l):
    return float(np.sum(np.linalg.norm(np.diff(l, axis=0, append=l[:1]), axis=1)))


def band(a, b):
    n = len(a)
    tris = []
    for k in range(n):
        k1 = (k + 1) % n
        tris.append((a[k], a[k1], b[k1]))
        tris.append((a[k], b[k1], b[k]))
    return tris


def cap(V, loops_ids, up):
    """Flat cap with holes: Delaunay of ring points + interior grid, kept if centroid inside."""
    pts2 = np.vstack([V[ids][:, :2] for ids in loops_ids])
    ids_all = np.concatenate(loops_ids)
    outer = MplPath(V[loops_ids[0]][:, :2])
    holes = [MplPath(V[ids][:, :2]) for ids in loops_ids[1:]]

    tri = Delaunay(pts2)
    simp = tri.simplices
    cen = pts2[simp].mean(axis=1)
    inside = outer.contains_points(cen)
    for h in holes:
        inside &= ~h.contains_points(cen)
    simp = simp[inside]
    out = []
    for t in simp:
        a, b, c = ids_all[t]
        pa, pb, pc = V[a, :2], V[b, :2], V[c, :2]
        cross = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])
        if (cross > 0) != up:
            b, c = c, b
        out.append((a, b, c))

    # verify every boundary edge was recovered (watertight cap)
    edges = set()
    for a, b, c in out:
        for e in ((a, b), (b, c), (c, a)):
            edges.add(frozenset(e))
    missing = 0
    for ids in loops_ids:
        for k in range(len(ids)):
            if frozenset((ids[k], ids[(k + 1) % len(ids)])) not in edges:
                missing += 1
    print(f"cap {'top' if up else 'bottom'}: {len(out)} tris, missing boundary edges: {missing}")
    return out


def add_interior(V, tris):
    return V, tris


def vertex_normals(V, T):
    N = np.zeros_like(V)
    a, b, c = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
    fn = np.cross(b - a, c - a)
    for i in range(3):
        np.add.at(N, T[:, i], fn)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    return N


def box_uv(V, N):
    """Box projection (dominant normal axis), in units of the badge width."""
    an = np.abs(N)
    uv = np.where(
        (an[:, 2] >= an[:, 0]) & (an[:, 2] >= an[:, 1]),
        np.stack([V[:, 0], V[:, 1]]),
        np.where(an[:, 0] >= an[:, 1], np.stack([V[:, 1], V[:, 2]]), np.stack([V[:, 0], V[:, 2]])),
    ).T
    return uv / MODEL_WIDTH + 0.5


def write_glb(path, prims):
    bin_parts = []
    views, accessors, meshes_prims, materials = [], [], [], []
    offset = 0

    def add(data, target, comp, count, typ, minmax=False):
        nonlocal offset
        raw = data.tobytes()
        pad = (-len(raw)) % 4
        bin_parts.append(raw + b"\0" * pad)
        views.append(dict(buffer=0, byteOffset=offset, byteLength=len(raw), target=target))
        acc = dict(bufferView=len(views) - 1, componentType=comp, count=count, type=typ)
        if minmax:
            acc["min"] = data.min(0).tolist()
            acc["max"] = data.max(0).tolist()
        accessors.append(acc)
        offset += len(raw) + pad
        return len(accessors) - 1

    for i, p in enumerate(prims):
        pos = p["pos"].astype(np.float32)
        nrm = p["nrm"].astype(np.float32)
        uv = p["uv"].astype(np.float32)
        idx = p["idx"].astype(np.uint32).ravel()
        a_pos = add(pos, 34962, 5126, len(pos), "VEC3", True)
        a_nrm = add(nrm, 34962, 5126, len(nrm), "VEC3")
        a_uv = add(uv, 34962, 5126, len(uv), "VEC2")
        a_idx = add(idx, 34963, 5125, len(idx), "SCALAR")
        materials.append(dict(name=p["name"], pbrMetallicRoughness=dict(baseColorFactor=[0.18, 0.16, 0.15, 1], metallicFactor=0.3, roughnessFactor=0.6)))
        meshes_prims.append(dict(attributes=dict(POSITION=a_pos, NORMAL=a_nrm, TEXCOORD_0=a_uv), indices=a_idx, material=i, mode=4))

    gltf = dict(
        asset=dict(version="2.0", generator="jo-capital scripts/build_badge.py"),
        scene=0,
        scenes=[dict(nodes=[0], extras=dict(description="JO Capital badge: thick rounded slab with stepped lip. Front +Z, up +Y.", profile=PROFILE))],
        nodes=[dict(name="JO Capital badge", mesh=0)],
        meshes=[dict(name="JO Capital badge", primitives=meshes_prims)],
        materials=materials,
        accessors=accessors,
        bufferViews=views,
        buffers=[dict(byteLength=offset)],
    )
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    binary = b"".join(bin_parts)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + binary)


def dump_preview(V, T):
    out = ROOT / ".scratch" / "badge-mesh.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(dict(v=np.round(V, 5).ravel().tolist(), t=T.ravel().tolist())))
    print("preview mesh →", out)


if __name__ == "__main__":
    main()
