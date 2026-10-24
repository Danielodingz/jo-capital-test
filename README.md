# JO Capital — coming-soon site

Next.js (App Router) + React + plain Three.js. A calm landscape video, a
transparent WebGL canvas with the JO Capital logo on the rock, 3D coins and
drifting clouds, and minimal accessible HTML on top. Desktop only for now:
screens narrower than 1024px see a "mobile view isn't available yet" notice.

Needs Node.js 20.9 or newer.

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build (.next/)
npm run start     # serve the production build
npm run lint

# regenerate the badge model after changing its shape (needs Python 3 with
# numpy, scipy, scikit-image, matplotlib, Pillow)
python3 scripts/build_badge.py
```

Deploys as-is to Vercel (or any host that runs `next start`).

## How the Next.js app is wired

- `src/app/layout.jsx`: the `<html>` shell, page title/description, theme
  colour, fonts (Inter Tight + Instrument Serif via `next/font`, self-hosted at
  build time) and the global stylesheet `src/styles.css`.
- `src/app/page.jsx` renders `src/components/ClientApp.jsx`, which loads
  `src/App.jsx` **in the browser only** (`next/dynamic` with `ssr: false`):
  the hero measures the window, reads media queries and draws WebGL, so there
  is nothing useful to render on the server.
- `src/App.jsx` decides desktop vs. the mobile notice, then renders the hero.
- Static files (videos, images, the 3D model) are in `public/` and are served
  from the site root.

## Layers (all fill the same `.hero` box)

1. `.hero__stage`: the landscape, a calm looping video of the hills, pond
   and flat rock (`LANDSCAPE.video`), with the logo standing centred on the
   rock. A still frame of the same footage (the CSS `cover` background) shows
   while it loads and for reduced motion. Both use the same crop.
   Its `background-position` comes from `computeLayout()`.
2. `canvas.hero__canvas`: a transparent (`alpha: true`) WebGL canvas with
   `pointer-events: none`. It draws two passes:
   - clouds, in a pixel-space orthographic pass, where only the x-position animates
   - the logo, ground shadow and lights, through a fixed off-axis perspective camera
3. HTML copy (`src/App.jsx`, text in `src/content.js`), including the navbar
   (`src/components/Navbar.jsx`): a floating frosted-glass bar with the logo,
   About · Contact (each opens a small glass panel) and a **Join the
   Waitlist** button that opens an email form. On phones, the links fold into
   a menu button.
   **Before launch:** set `CONTENT.waitlist.endpoint` (a URL that accepts a
   JSON POST of `{ email }`, e.g. Formspree, Mailchimp or your own API).
   Until then, sign-ups are not saved. Set `CONTENT.contactEmail` to show a
   contact address.

The CSS crop and the 3D anchor both use `src/scene/layout.js`, which runs the
same cover maths for both. That keeps the logo on the same spot of the photo
at every viewport size.

## Where to tune things: `src/config/scene.js`

| What | Key |
|---|---|
| Background crop per breakpoint | `BACKGROUND_POSITION.desktop / .mobile`, `MOBILE_BREAKPOINT` |
| Logo source: the video or the 3D badge | `LOGO_MODE` (`'video'` / `'3d'`), or `?logo=3d` in the URL |
| Video logo: size, ground line, shadow strength, colour grade | `VIDEO_LOGO.*` |
| Ground-contact anchor on the hill (normalised image u/v) | `LOGO.anchor.desktop / .mobile` |
| Logo size (fraction of displayed photo height) + caps | `LOGO.heightOfImage`, `maxHeightOfViewport`, `maxWidthOfViewport` |
| Base alignment (sink / lift) | `LOGO.baseOffset` |
| Starting pose / tilt | `LOGO.yStart`, `LOGO.tilt` |
| Spin speed (rad/s) | `LOGO.spinSpeed` |
| Badge shape & thickness | `PROFILE` in `scripts/build_badge.py` (then re-run it) |
| Logo look (default, URL param, switcher) | `LOOK.*` |
| Per-look tuning (colours, roughness, shell length/density, flowers…) | `LOOKS.bronze / chrome / glass / grass / fuzzy / cloud` |
| Camera eye level / lens | `CAMERA.eyeLevelV`, `CAMERA.fov` |
| Lights | `LIGHTS.*` |
| Contact + cast shadow | `SHADOW.*` |
| Foreground grass over the logo base + baked contact shade | `GRASS.*` |
| Clouds (band, speed, opacity, size, count) | `CLOUDS.*` |
| $ coins: position, size, tilt, rolling path/speed, grass depth, shadows | `COINS.*` |

## Notes on the implementation

- **Background video.** `public/video/jo-landscape-loop.mp4` (pond and rock
  scene, about 14 s) is made from the supplied clip. The water shimmer is
  calmed by about 70%, and it's slowed 1.5×. The audio is removed, brightness pops are evened out
  (deflicker), the slight camera wobble is locked (vidstab, tripod mode), and
  the shimmering grass is calmed (temporal denoise). The motion is slowed
  about 1.6× with motion-interpolated in-between frames, and the end is
  cross-faded into the start for a seamless 9-second loop. It's muted, plays
  inline, and pauses for reduced motion. The static grass overlay is turned
  off while the background is a video.
- **Video logo (default).** Your logo animation (stone → chrome → grass →
  fur) replaces the 3D badge. `scripts/key_logo_video.py` removes the studio
  background: it models the backdrop, keys the logo by colour and brightness
  difference, keeps the J and circle cut-outs see-through, removes the white
  edge spill, and turns the floor shadow into a soft shadow pool under the
  logo. It also strips the audio and adds a short dissolve so the clip loops
  smoothly. The output is `public/video/jo-logo-packed.mp4`: an ordinary
  H.264 file with the colour on top and the transparency matte underneath,
  so it plays in every browser including iPhone Safari. The page recombines
  the two halves on the GPU and applies a light colour grade so it sits in
  the sunlit scene. The video is always muted and loops. With reduced motion
  it holds a still stone frame. If the video can't play, the 3D badge loads
  instead; without WebGL, a transparent still frame is shown.
  A final pass (`scripts/clean_logo_edges.py`, run automatically) removes
  leftover white studio fringe from soft edges such as fur tips, grass blades
  and the insides of the cut-outs. It compares each edge pixel with the
  material just inside it, so bright materials like chrome are left alone.
  Re-run with: `python3 scripts/key_logo_video.py path/to/video.mp4`.
- **$ coins.** Four real-time 3D coins: one lying on the island, two lying further back on the far grass (`COINS.back`), and one rolling (`src/scene/coins/`). The geometry is
  built in code: a recessed field, raised rim, rounded corner and ridged
  edge. The embossed $, satin roughness and soft patina come from textures
  generated at start-up. They're lit by the scene's sun and reflect the
  landscape. One lies propped on the grass; the other rolls slowly across the
  hill (26 s per crossing, then a 4 s pause), turning the right amount for
  the distance it travels. A blade-shaped cut lets the background video's
  real grass show in front of each coin's lower edge, with a soft grass shade
  above it. Both are positioned in image coordinates, so they stay on the
  same patch of grass at every screen size. With reduced motion the rolling
  coin stands still in view.
- **Pivot.** The rig is `pivot` (spins on Y) → `tilt` (constant lean) → `model`
  (centred). The tilted badge's lowest point sits at the pivot's y = 0, so it
  turns in place on its base.
- **Badge model.** `public/models/jo-capital-badge.glb` is generated by
  `python3 scripts/build_badge.py` from the original logo artwork, to match
  the reference renders: one solid, thick block (no step or seam on the
  sides) with large rounded edges, rounded cut-out rims, and slightly
  smaller, softened cut-outs (so the frame is thicker).
  Scaling the supplied flat GLB couldn't give rounded edges or a lip. The
  original GLB is still in `public/models/` (set `LOGO.modelUrl` to use it).
- **Looks.** There are six, one per reference in `reference-images/styles/`:
  `bronze` (default), `chrome`, `glass`, `grass`, `fuzzy` and `cloud`.
  - Bronze, chrome and glass are physically based materials lit by a
    procedural studio HDRI (`src/scene/studioEnv.js`): soft boxes and rim
    strips in a ring around the badge, like a turntable product shot. Glass
    also refracts the real landscape behind it.
  - Grass, fuzzy and cloud are built from stacked "shells" of the surface, so
    they have real depth and a soft outline. Flowers are part of the grass
    shells. Phones get fewer layers.
  - `?look=glass` in the URL picks a look. `?looks` shows a small switcher
    for comparing them; it's off for launch.
- **Legacy GLB.** The originally supplied export has no normals, so they are rebuilt with a crease angle:
  rounded corners shade smoothly and sharp corners stay crisp. All faces are
  double-sided, which keeps the back and walls lit at every angle.
- **Thickness.** Only the front half of the mesh is pushed forward. Faces,
  bevels and cut-outs keep their exact shape; only the side walls get longer.
- **Shadow.** There are two parts: a soft radial contact blob, and a
  `ShadowMaterial` catcher that shows only the key light's soft shadow, so it
  follows the badge's silhouette as it turns. Both sit in a ground group that
  doesn't rotate.
- **Grass overlap.** `GrassOverlay.jsx` cuts a thin strip of the photo's own
  crest grass by colour: green stays, blue sky turns transparent. That strip
  is drawn exactly on top of the background, in front of the logo, so real
  blades cover its base. It's rebuilt from the anchor setting, so it follows
  any change you make there.
- **Clouds.** They are painted procedurally at start-up (`cloudTexture.js`)
  from layered noise and gaussian puffs, with self-shadowing. Their shape
  never changes; they only translate and wrap off-screen.
- **Reduced motion.** With `prefers-reduced-motion`, the logo holds its
  three-quarter pose, the clouds stop, and the scene only re-renders on
  resize.
- **Fallbacks.** The 3D code is lazy-loaded. If WebGL, the module or the GLB
  fails, a static logo shows on the same anchor instead.
- **Landscape file.** The page uses a q92 JPEG (about 400 KB) made from the
  supplied 2.3 MB PNG. Both are in `public/images/`.

## Assets

- `public/images/jo-capital-landscape.{png,jpg}`: background
- `public/video/jo-logo-packed.mp4`, `jo-logo-poster.png`: the logo video (background removed, no audio) and its still frame
- `public/models/jo-capital-badge.glb`: the badge used by the site (built by `scripts/build_badge.py`)
- `public/models/jo-capital-graphite.glb`: the originally supplied flat model
- `public/images/jo-capital-logo-fallback.png`: static fallback
- `reference-images/`: style references (not shipped). The six look references are in `styles/`.
