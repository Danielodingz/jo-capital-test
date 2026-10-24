/**
 * JO Capital hero scene — every tunable value lives here.
 *
 * COORDINATE CONVENTIONS
 * - "Image" coordinates are normalised to the source landscape PNG
 *   (u = 0 left edge → 1 right edge, v = 0 top edge → 1 bottom edge).
 *   They are converted to screen pixels by src/scene/layout.js using the SAME
 *   cover-crop maths the CSS background uses, so the logo stays glued to the
 *   same spot of the photo at every viewport size.
 * - Sizes given as "fraction of displayed image height" scale with the photo,
 *   so the logo keeps the same physical size relative to the hill.
 */

export const LANDSCAPE = {
  /**
   * Background = calm looping video of the hills, pond and rock (no audio):
   * camera locked, brightness pops evened out, water shimmer smoothed, slowed
   * 1.5× and cross-faded into a seamless ~14 s loop. `src` is a still frame of
   * the same video: shown while it loads, for reduced motion, and used for the
   * glass/coin reflections. Set `video: null` to use a still image only.
   */
  video: 'video/jo-landscape-loop.mp4',
  src: 'images/jo-capital-landscape.jpg',
  width: 1920, // source pixel size — keep in sync if the footage is replaced
  height: 1080,
}

/**
 * Background crop. Equivalent to CSS `background-size: cover` +
 * `background-position: <x*100>% <y*100>%`. Both the CSS layer and the 3D
 * anchor maths read these numbers (see layout.js) — never set the CSS
 * background-position anywhere else.
 */
export const BACKGROUND_POSITION = {
  // The small hill is centred in the photo, so the crop stays centred
  // horizontally on every screen; vertically a little more sky than ground.
  desktop: { x: 0.5, y: 0.5 },
  mobile: { x: 0.525, y: 0.5 }, // phones: keep the rock centred
}

/** Width (CSS px) below which the "mobile" values are used. */
export const MOBILE_BREAKPOINT = 720

/**
 * Which logo the hero shows:
 *   'video' — the supplied logo animation (stone → chrome → grass → fur), background
 *             removed, see VIDEO_LOGO. The 3D badge is loaded only as a fallback.
 *   '3d'    — the real-time 3D badge with the selectable looks (LOOK / LOOKS).
 * `?logo=3d` / `?logo=video` in the URL overrides it.
 */
export const LOGO_MODE = 'video'

export const VIDEO_LOGO = {
  src: 'video/jo-logo-packed.mp4', // colour on top, matte below (scripts/key_logo_video.py)
  poster: 'video/jo-logo-poster.png', // first frame with transparency
  aspect: 512 / 516, // width / height of ONE half of the packed video
  logoFrac: 0.72, // the logo itself fills ~72% of the video height
  scale: 0.86, // size relative to the 3D badge's configured height (the fur version is fluffier)
  groundRow: 0.897, // row (0 top → 1 bottom) of the video's floor shadow — placed on the hill anchor
  offsetX: 0, // horizontal nudge, × video height
  shadowOpacity: 0.85, // the video's own soft floor shadow on the grass (0 = hide)
  /** colour grade so the studio-lit footage sits in the sunlit landscape */
  grade: {
    exposure: 1.0,
    contrast: 1.04,
    saturation: 1.05,
    warmth: 0.035, // + = warmer (sunlight), − = cooler
    haze: 0.04, // tiny blend toward the sky colour (aerial perspective)
    hazeColor: '#cfe3f5',
  },
}

export const LOGO = {
  /**
   * The thick, rounded, stepped badge (built from the logo outline by
   * scripts/build_badge.py to match the reference renders). The originally
   * supplied flat GLB is still in public/models/jo-capital-graphite.glb.
   */
  modelUrl: 'models/jo-capital-badge.glb',
  fallbackImage: 'images/jo-capital-logo-fallback.png',

  /**
   * Ground-contact anchor, in normalised IMAGE coordinates: the point where the
   * bottom-centre of the logo (or the video's floor shadow) meets the grass.
   * Measured from the background video: the flat grey rock spans x≈705–1310 px,
   * its flat top at y≈655–670 px (of 1920×1080), centred at u≈0.525.
   * v = 0.616 (≈665 px) is on the rock's top, so the logo stands on it.
   */
  anchor: {
    desktop: { u: 0.525, v: 0.616 },
    mobile: { u: 0.525, v: 0.616 },
  },

  /** Logo height as a fraction of the DISPLAYED image height. */
  heightOfImage: { desktop: 0.25, mobile: 0.23 },
  /** Hard cap as a fraction of the viewport height / width (very wide or very narrow crops). */
  maxHeightOfViewport: 0.3,
  maxWidthOfViewport: 0.62,

  /**
   * Starting three-quarter pose (radians). x = lean back, z = slight roll,
   * yStart = phase of the continuous spin. Kept small so the badge stays
   * upright and planted rather than tumbling.
   */
  tilt: { x: -0.06, z: -0.035 },
  yStart: -0.38,

  /** Continuous spin around the world vertical axis, radians / second. */
  spinSpeed: 0.3,

  /**
   * Extra depth for the LEGACY flat GLB only (front half pushed forward).
   * The badge GLB already has its final thickness — change it in
   * scripts/build_badge.py (PROFILE.thickness) and re-run the script.
   */
  thicknessExtra: 0,

  /** Fine vertical nudge of the base, as a fraction of logo height (+ = up / float, − = sink into grass). */
  baseOffset: -0.015,

  /** Crease angle (degrees) for rebuilt normals: rounded corners smooth, sharp corners stay crisp. */
  creaseAngle: 32,

}

/**
 * Off-axis camera. The camera never moves and never rotates; its optical
 * centre (eye level) is placed at this image row. Just above the crest
 * (anchor v = 0.63) → an almost level, low view of the badge on the hilltop,
 * like the placement reference. Lower eyeLevelV to look down on it more.
 */
export const CAMERA = {
  fov: 26, // vertical, degrees — low FOV = gentle perspective like a long lens
  eyeLevelV: 0.58,
}

/**
 * Surface looks, one per reference render (reference-images/styles/).
 * Pick the live one with LOOK.default. Each look is built in
 * src/scene/looks/index.js; values here are its tuning knobs.
 */
export const LOOK = {
  default: 'bronze', // 'bronze' | 'chrome' | 'glass' | 'grass' | 'fuzzy' | 'cloud'
  /** `?look=glass` in the URL overrides the default (handy for review links). */
  allowUrlParam: true,
  /** Small on-page switcher to compare looks. Keep false for launch; `?looks` in the URL also shows it. */
  showSwitcher: false,
}

export const LOOKS = {
  /** Dark granular graphite-bronze, worn brighter on the rounded edges. */
  bronze: {
    label: 'Bronze graphite',
    color: '#34302c',
    wearColor: '#9c7a4f',
    wear: 0.35,
    metalness: 0.8,
    roughness: 0.44,
    grainBump: 0.0012, // procedural micro-grain strength
    grainScale: 75, // grain frequency (per model unit)
    envIntensity: 1.2,
  },
  /** Polished gunmetal chrome. */
  chrome: {
    label: 'Chrome',
    color: '#454448',
    metalness: 1,
    roughness: 0.06,
    clearcoat: 0.6,
    envIntensity: 1.6,
  },
  /**
   * Crystal glass (reference-images/styles/glass-material-reference.png):
   * thick, perfectly clear, refracting the real sky, hills AND the drifting
   * clouds behind it, with bright internal-reflection edges, prismatic
   * rainbow fringes, a slow travelling glint and faint scratches/bubbles.
   */
  glass: {
    label: 'Glass',
    ior: 1.52,
    thickness: 7, // refraction depth (model units) — bigger = stronger bending
    roughness: 0.015,
    dispersion: 1.2, // rainbow split in the refraction
    attenuationColor: '#dbe9fb', // light crystal-blue body tint
    attenuationDistance: 3,
    envIntensity: 1.25,
    rim: 0.8, // bright edges
    prism: 0.9, // rainbow fringe on edges/bevels
    glint: 0.55, // travelling light sweep
    scratch: 0.14, // micro-scratches + bubbles
  },
  /**
   * Living turf: long wispy blades (stacked "shell" layers) + real 3D flowers
   * (poppies and baby's-breath, instanced on the surface) that bend in the
   * wind, and a few loose petals drifting off. Modelled on
   * reference-images/styles/grass-material-reference.png.
   */
  grass: {
    label: 'Grass',
    kind: 0,
    shells: 32,
    length: 0.155, // model units (badge is 2.4 wide)
    density: 120, // strands per model unit — fine, so the surface reads as soft turf
    thickness: 0.44,
    minHeight: 0.45,
    taper: 0.7,
    lean: 0.55,
    root: '#1d3d10',
    tip: '#4a8632',
    tip2: '#6a9f44',
    ao: 0.62,
    roughness: 0.85,
    sway: 0.1, // blade sway in the wind (fraction of blade length)
    flowers: {
      poppies: { count: 270, size: 0.088, colors: ['#e0305f', '#ea4775', '#f46a90', '#d3285a'] },
      babysBreath: { count: 150, size: 0.07, colors: ['#f4c9d7', '#f8dbe5', '#f1b7cb'] },
      clusterScale: 2.0, // patchiness: higher = smaller patches
      clusterBias: 0.45, // 0 = everywhere, closer to 1 = only dense patches
      tallChance: 0.12, // share of flowers on long stems poking out of the grass
      lean: 0.5,
      sway: 0.35, // stem bend in the wind
      drifting: 12, // loose petals floating away in the breeze (0 = off)
    },
  },
  /** Soft pink fur. */
  fuzzy: {
    label: 'Fuzzy',
    kind: 1,
    shells: 32,
    length: 0.16,
    density: 95,
    thickness: 0.5,
    minHeight: 0.55,
    taper: 1.8,
    lean: 1.4,
    root: '#d4506e',
    tip: '#ffa9bc',
    tip2: '#f78aa3',
    ao: 0.5,
    roughness: 0.95,
  },
  /** Puffy cloud surface. */
  cloud: {
    label: 'Cloud',
    kind: 2,
    shells: 24,
    length: 0.11,
    density: 4.6, // noise frequency
    root: '#a9c6ea',
    tip: '#f6f9ff',
    tip2: '#e8eef8',
    ao: 0.55,
    roughness: 1,
  },
}

/** Wind for the grass look (world-space direction; the scene converts it per frame). */
export const WIND = { direction: [1, 0.08, 0.35], speed: 1 }

/**
 * Two satin-silver $ coins in the grass (src/scene/coins). Positions are in
 * normalised IMAGE coordinates of the background (u across, v down), like the
 * logo anchor, so they stay on the same patch of grass at every screen size.
 * Sizes are fractions of the displayed image height.
 */
export const COINS = {
  enabled: true,
  tint: '#f1ebe0', // warm champagne tint (keeps coins from reading blue when they reflect the sky)
  reliefStrength: 2.2, // depth of the embossed $
  envIntensity: 1.0, // strength of the warm studio reflections
  lying: {
    u: 0.7,
    v: 0.835, // on the grass island, right of the rock
    diameter: 0.12,
    depth: 0.08, // toward the camera (fraction of image height) — in front of the rolling coin
    tilt: 0.3, // propped up toward the viewer (radians from flat) so the $ shows
    spin: 0.25, // turn of the $ on the face
    yaw: -0.3,
    grassDepth: 0.16, // how far the grass covers its lower edge (× radius)
    shadowSize: [2.5, 1.3],
    shadowOffset: [0.15, 0.25],
    shadowOpacity: 0.5,
  },
  /** Coins lying on the far grass, behind the rock, each at its own angle. */
  back: [
    {
      u: 0.27, // back-left grass bank
      v: 0.585,
      diameter: 0.075,
      depth: -0.18, // further from the camera than the rock → smaller by perspective
      // We see the grass from almost ground level, so a coin lying flat reads as a thin
      // sliver. Leaning well back (~45°) and turned to the viewer, its $ face shows.
      tilt: 0.8,
      spin: -0.28, // $ slightly turned, like it landed casually
      yaw: 0.18, // face turned toward the viewer
      grassDepth: 0.3, // base settled into the grass (no floating)
      shadowSize: [2.4, 1.2],
      shadowOffset: [0.1, 0.15],
      shadowOpacity: 0.4,
    },
    {
      u: 0.775, // back-right grass bank
      v: 0.6,
      diameter: 0.08,
      depth: -0.14,
      tilt: 0.95, // leaning up on the grass, $ facing the viewer
      spin: 0.22,
      yaw: -0.22,
      grassDepth: 0.3,
      shadowSize: [2.2, 1.0],
      shadowOffset: [0.2, 0.2],
      shadowOpacity: 0.38,
    },
    {
      // lying sideways in the grass at the left base of the rock, half-tucked in
      // (pose checked against the real background with the site camera)
      u: 0.395,
      v: 0.752,
      diameter: 0.1,
      depth: 0.03, // just in front of the rock
      tilt: 0.6, // tipped up on one side so the $ shows
      spin: 0.25,
      yaw: 0.95, // turned sideways, along the rock
      grassDepth: 0.75, // lower half sits in the grass (no floating)
      shadowSize: [2.6, 1.3],
      shadowOffset: [0.25, 0.1],
      shadowOpacity: 0.7,
    },
  ],
  rolling: {
    rolling: true,
    v: 0.955, // the grassy front bank (stays out of the water)
    uFrom: -0.08, // starts just off the left of the picture…
    uTo: 1.08, // …and rolls out on the right
    duration: 26, // seconds for one crossing (calm)
    pause: 4, // seconds off-screen before it comes round again
    restAt: 0.33, // where it stands still for reduced-motion visitors (0 = start, 1 = end)
    diameter: 0.095,
    depth: 0.04,
    lean: 0.05,
    wobble: 0.025,
    yaw: 0.28, // slight three-quarter view so the ridged edge shows
    grassDepth: 0.32,
    shadowSize: [1.9, 0.6],
    shadowOffset: [0.1, 0.05],
    shadowOpacity: 0.45,
  },
}

/** Shell looks use fewer layers on small screens (performance). */
export const SHELL_MOBILE_FACTOR = 0.6

export const LIGHTS = {
  exposure: 1.05,
  // Warm low sun from the upper-left and slightly BEHIND (z < 0), as in the
  // photo's back-lit haze: rims the left edges, and its shadow falls forward
  // onto the visible grass, never back into the sky.
  key: { color: '#ffe9cf', intensity: 2.8, position: [-5, 5, -2.2] },
  // Soft cool front fill keeps the face texture and cut-outs readable.
  fill: { color: '#dbe9ff', intensity: 1.1, position: [1.5, 2, 6] },
  // Sky above / grass bounce below.
  hemi: { sky: '#d8ecff', ground: '#6d8a3b', intensity: 1.1 },
}

export const SHADOW = {
  /** Real cast shadow from the key light onto an invisible ground plane (orientation-aware). */
  castOpacity: 0.32,
  castSoftness: 6, // PCF radius
  mapSize: 512,
  /** Soft ambient-occlusion blob directly under the base. */
  contactOpacity: 0.55,
  contactWidth: 1.25, // × logo width
  contactDepth: 0.6, // × logo width (ground is seen at a grazing angle, so this reads as a thin ellipse)
  contactOffsetZ: 0.12, // × logo width; kept slightly IN FRONT — behind the crest is sky
}

/**
 * Foreground grass. A thin strip of the photo's own crest grass is cut out
 * (by colour: grass is green, the sky behind it is blue) and layered IN FRONT
 * of the logo, so real blades overlap its base. Built at runtime from the
 * configured anchor, so it follows any anchor change automatically.
 */
export const GRASS = {
  enabled: false, // off: above the rock is distant hillside, which must stay BEHIND the logo
  /** Strip height above / below the anchor, in source-image px. */
  above: 40,
  below: 16,
  /** Strip width as a multiple of the logo width. */
  widthFactor: 1.7,
  /** Green-minus-blue thresholds for the cut-out (sky ≈ 3, grass ≥ 20). */
  greenMin: 10,
  greenFull: 30,
  /** Contact darkening baked into the grass right at the base (0 = none). */
  contactShade: 0.38,
}

export const CLOUDS = {
  enabled: true,
  /** Vertical band (image v) clouds live in — stays above the mountain tops (v≈0.51). */
  bandTop: 0.04,
  bandBottom: 0.4,
  /** Base drift speed in source-image pixels per second (scaled with the crop). */
  speed: 7,
  opacity: 0.92,
  /**
   * Each cloud: variant (texture seed), v = vertical centre (image v),
   * x = starting horizontal position (0–1 of the viewport), width in source
   * image px, speed multiplier (further clouds are smaller + slower).
   */
  items: [
    { seed: 11, v: 0.12, x: 0.1, width: 540, speed: 1.0, kind: 'cumulus' },
    { seed: 23, v: 0.29, x: 0.66, width: 400, speed: 0.75, kind: 'cumulus' },
    { seed: 37, v: 0.07, x: 0.86, width: 600, speed: 1.15, kind: 'stratus' },
    { seed: 41, v: 0.37, x: 0.28, width: 260, speed: 0.55, kind: 'cumulus' },
    { seed: 53, v: 0.21, x: 1.2, width: 360, speed: 0.65, kind: 'stratus' },
  ],
}

/** Read the per-breakpoint value for the current viewport width. */
export function pick(value, viewportWidth) {
  if (value && typeof value === 'object' && 'desktop' in value) {
    return viewportWidth < MOBILE_BREAKPOINT ? value.mobile : value.desktop
  }
  return value
}
