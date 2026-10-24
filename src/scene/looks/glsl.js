/** Small GLSL helpers shared by the look shaders (hash + value noise, no textures). */
export const NOISE_GLSL = /* glsl */ `
float jo_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 jo_hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float jo_hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float jo_noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(jo_hash13(i), jo_hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(jo_hash13(i + vec3(0.0, 1.0, 0.0)), jo_hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(jo_hash13(i + vec3(0.0, 0.0, 1.0)), jo_hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(jo_hash13(i + vec3(0.0, 1.0, 1.0)), jo_hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float jo_fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * jo_noise3(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s / 0.9375;
}
`

/** Fragment code for the stacked-shell looks (grass, fur, cloud). Inserted after <color_fragment>. */
export const SHELL_FRAGMENT = /* glsl */ `
  float jo_t = vShellT;
  vec3 jo_an = abs(vBaseN);
  vec2 jo_uv = (jo_an.z >= jo_an.x && jo_an.z >= jo_an.y) ? vBasePos.xy
             : (jo_an.x >= jo_an.y ? vBasePos.yz : vBasePos.xz);
  vec3 jo_col = uRoot;
  float jo_keep = 1.0;

#if JO_KIND == 2
  // cloud: billowing height field from 3D noise, ragged at the top
  float jo_puff = jo_fbm3(vBasePos * uDensity);
  float jo_h = smoothstep(0.2, 0.62, jo_puff);
  float jo_fine = jo_noise3(vBasePos * uDensity * 7.0);
  float jo_top = jo_h * (0.7 + 0.45 * jo_fine);
  if (jo_t > 0.0) jo_keep = 1.0 - smoothstep(jo_top - 0.06, jo_top, jo_t); // soft puff tops
  float jo_tn = clamp(jo_t / max(jo_top, 0.05), 0.0, 1.0);
  // sky-blue between the puffs, white puffs with cool grey-blue undersides
  vec3 jo_puffCol = mix(uTip2 * vec3(0.72, 0.78, 0.9), uTip, smoothstep(0.15, 1.0, jo_tn));
  jo_col = mix(uRoot, jo_puffCol, smoothstep(0.02, 0.12, jo_h));
  jo_col *= mix(uAO, 1.0, smoothstep(0.0, 0.7, jo_t + 0.35 * jo_h));
#else
  // strands (grass blades / fur): one jittered strand per cell, tapering to its own height
  vec2 jo_g = jo_uv * uDensity;
  vec2 jo_cell = floor(jo_g);
  float jo_hr = jo_hash12(jo_cell + 7.31);
  float jo_h = mix(uMinHeight, 1.0, jo_hr);
#if JO_KIND == 0
  // tufts: low-frequency clumps of taller grass with lower patches between
  float jo_clump = jo_noise3(vBasePos * 5.5 + 11.0) * 0.65 + jo_noise3(vBasePos * 12.0 + 3.0) * 0.35;
  jo_h *= 0.45 + 0.85 * smoothstep(0.25, 0.75, jo_clump);
#endif
  float jo_tn = jo_t / jo_h;
  vec2 jo_center = 0.3 + 0.4 * jo_hash22(jo_cell) + (jo_hash22(jo_cell + 5.17) - 0.5) * uLean * jo_tn;
#if JO_KIND == 1
  jo_center += vec2(0.45, -0.35) * jo_tn * jo_tn; // fur combed in one direction
#endif
  float jo_d = length(fract(jo_g) - jo_center);
  float jo_radius = uThickness * (1.0 - pow(clamp(jo_tn, 0.0, 1.0), uTaper));
  // SOFT strand edges (anti-aliased coverage) instead of hard cut-outs: this is
  // what keeps fine grass / fur from sparkling like static
  float jo_aa = fwidth(jo_d) * 0.9 + 1e-4;
  float jo_cov = 1.0 - smoothstep(jo_radius - jo_aa, jo_radius + jo_aa, jo_d);
  jo_cov *= 1.0 - smoothstep(0.75, 1.0, jo_tn); // tips fade out
  if (jo_t > 0.0) jo_keep = jo_cov;
  float jo_tone = jo_hash12(jo_cell + 2.17);
  jo_col = mix(uRoot, mix(uTip, uTip2, jo_tone), smoothstep(0.0, 1.0, jo_tn));
  jo_col *= mix(uAO, 1.0, smoothstep(0.0, 0.85, jo_t));
#if JO_KIND == 0
  jo_col *= 0.9 + 0.2 * jo_clump; // soft sunlit / shaded patches across the turf
#endif
#endif

#if JO_FLOWERS == 1
  if (jo_t > 0.0) {
    vec2 jo_fg = jo_uv * uFlowerDensity;
    vec2 jo_fc = floor(jo_fg);
    float jo_pick = jo_hash12(jo_fc + 19.7);
    float jo_cluster = smoothstep(0.3, 0.7, jo_fbm3(vec3(jo_fc * 0.23, 3.7)));
    if (jo_pick < uFlowerAmount * jo_cluster) {
      vec2 jo_fp = fract(jo_fg) - 0.5 - (jo_hash22(jo_fc + 4.1) - 0.5) * 0.3;
      float jo_ang = atan(jo_fp.y, jo_fp.x) + jo_hash12(jo_fc) * 6.2831;
      float jo_r = length(jo_fp);
      float jo_petal = 0.2 + 0.09 * cos(5.0 * jo_ang);
      float jo_layer = 0.7 + 0.22 * jo_hash12(jo_fc + 1.3);
      if (abs(jo_t - jo_layer) < uFlowerSlice && jo_r < jo_petal) {
        jo_keep = 1.0;
        vec3 jo_pc = jo_hash12(jo_fc + 8.8) < 0.62 ? uFlowerA : uFlowerB;
        jo_col = jo_r < 0.055 ? vec3(0.98, 0.8, 0.22) : jo_pc * (0.82 + 0.18 * (1.0 - jo_r / jo_petal));
      }
    }
  }
#endif

  if (jo_keep < 0.02) discard;
  diffuseColor.rgb = jo_col;
  diffuseColor.a = jo_keep;
`

export const SHELL_VERTEX_DECL = /* glsl */ `
uniform float uShells;
uniform float uLength;
uniform float uTime;
uniform float uSway;
uniform vec3 uWindObj;
varying vec3 vBasePos;
varying vec3 vBaseN;
varying float vShellT;
`

/** Inserted after <begin_vertex>: push each shell out along the surface normal. */
export const SHELL_VERTEX = /* glsl */ `
#ifdef USE_INSTANCING
  vShellT = (float(gl_InstanceID) + 1.0) / uShells;
#else
  vShellT = 0.0;
#endif
  vBasePos = position;
  vBaseN = normalize(objectNormal);
  transformed += vBaseN * (vShellT * uLength);
  // wind: outer layers sway more (blades bend from the root); a travelling gust
  float jo_gust = 0.55 + 0.45 * sin(uTime * 1.3 + dot(position, uWindObj) * 2.5)
                + 0.18 * sin(uTime * 3.1 + position.y * 7.0 + position.x * 5.0);
  transformed += uWindObj * (vShellT * vShellT * uLength * uSway * jo_gust);
`

/**
 * Wind for instanced flowers (vertex). Stems stretch to iStem, heads ride on
 * top; everything bends along the wind with a travelling, per-flower phase.
 * Inserted after <begin_vertex>; needs USE_INSTANCING.
 */
export const FLOWER_VERTEX_DECL = /* glsl */ `
attribute float aStem;
attribute float aTint;
attribute float iStem;
attribute float iPhase;
attribute vec3 iTint;
uniform float uTime;
uniform float uFlowerSway;
uniform vec3 uWindObj;
`
export const FLOWER_VERTEX = /* glsl */ `
  float jo_hgt;
  if (aStem > 0.5) { transformed.y *= iStem; jo_hgt = transformed.y; }
  else { transformed.y += iStem; jo_hgt = iStem; }
  float jo_k = jo_hgt / max(iStem, 1e-3);
  // wind direction in this flower's local frame (instance matrix is rotation * uniform scale)
  vec3 jo_wl = normalize(transpose(mat3(instanceMatrix)) * uWindObj);
  jo_wl.y = 0.0; // only the sideways part bends the stem
  float jo_ph = iPhase + dot(instanceMatrix[3].xyz, uWindObj) * 2.5;
  float jo_sw = 0.5 + 0.5 * sin(uTime * 1.3 + jo_ph * 0.3)       // slow gust (in phase across the badge)
              + 0.35 * sin(uTime * 2.6 + jo_ph)                    // per-flower flutter
              + 0.15 * sin(uTime * 5.3 + jo_ph * 2.1);
  float jo_bend = uFlowerSway * jo_sw * jo_k * jo_k * iStem;
  transformed += jo_wl * jo_bend;
  transformed.y -= 0.5 * jo_bend * jo_bend / max(iStem, 1e-3) * jo_k;  // keep stem length roughly constant
`
/** Inserted after <color_vertex>: per-instance petal colour. */
export const FLOWER_COLOR = /* glsl */ `
  vColor.rgb = mix(vColor.rgb, vColor.rgb * iTint, aTint);
`

export const SHELL_FRAGMENT_DECL = /* glsl */ `
uniform vec3 uRoot;
uniform vec3 uTip;
uniform vec3 uTip2;
uniform float uAO;
uniform float uDensity;
uniform float uMinHeight;
uniform float uThickness;
uniform float uTaper;
uniform float uLean;
uniform float uFlowerDensity;
uniform float uFlowerAmount;
uniform float uFlowerSlice;
uniform vec3 uFlowerA;
uniform vec3 uFlowerB;
varying vec3 vBasePos;
varying vec3 vBaseN;
varying float vShellT;
`

/** Bronze: worn, brighter metal on rounded edges + mottling. Inserted after <color_fragment>. */
export const BRONZE_FRAGMENT = /* glsl */ `
  float jo_edge = 2.0 * abs(vObjN.z) * length(vObjN.xy);
  float jo_speck = jo_noise3(vObjP * 42.0);
  float jo_mottle = jo_fbm3(vObjP * 5.0);
  float jo_patch = smoothstep(0.35, 0.7, jo_fbm3(vObjP * 11.0));
  float jo_wear = smoothstep(0.35, 0.98, jo_edge) * jo_patch * (0.35 + 0.8 * jo_speck);
  jo_wear += smoothstep(0.7, 0.96, jo_speck) * 0.6 * smoothstep(0.3, 0.7, jo_mottle);
  jo_wear = clamp(jo_wear * uWearAmount, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb * (0.75 + 0.5 * jo_mottle), uWear, jo_wear);
`
/**
 * Procedural micro-grain bump (sand-blasted metal), computed in object space so
 * it never shows UV seams. Inserted after <normal_fragment_maps>; uses Three's
 * view-space \`normal\` and \`vViewPosition\`.
 */
export const GRAIN_NORMAL = /* glsl */ `
  {
    float jo_h = jo_noise3(vObjP * uGrainScale) * 0.65 + jo_noise3(vObjP * uGrainScale * 2.7) * 0.35;
    // fade the grain at grazing angles (where it would alias into sparkle/noise)
    float jo_facing = smoothstep(0.15, 0.55, abs(dot(normal, normalize(vViewPosition))));
    vec2 jo_dH = vec2(dFdx(jo_h), dFdy(jo_h)) * uGrainBump * jo_facing;
    vec3 jo_sp = -vViewPosition;
    vec3 jo_sx = dFdx(jo_sp);
    vec3 jo_sy = dFdy(jo_sp);
    vec3 jo_r1 = cross(jo_sy, normal);
    vec3 jo_r2 = cross(normal, jo_sx);
    float jo_det = dot(jo_sx, jo_r1);
    vec3 jo_grad = sign(jo_det) * (jo_dH.x * jo_r1 + jo_dH.y * jo_r2);
    normal = normalize(abs(jo_det) * normal - jo_grad);
  }
`

export const BRONZE_ROUGHNESS = /* glsl */ `
  roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.55, jo_wear) * (0.85 + 0.3 * jo_speck), 0.05, 1.0);
`

/**
 * Crystal-glass extras, added on top of Three's physical transmission.
 * Inserted before <opaque_fragment> (adds to outgoingLight). Needs view-space
 * `normal`, `vViewPosition`, and varyings vObjN / vObjP (object space).
 *   - prismatic rainbow fringe on edges and bevels (dispersion feel)
 *   - bright internal-reflection rim where the glass turns away from the viewer
 *   - a soft light glint that sweeps across the badge every few seconds
 *   - faint micro-scratches and tiny bubbles
 */
export const GLASS_DECL = /* glsl */ `
uniform float uTime;
uniform float uRim;
uniform float uPrism;
uniform float uGlint;
uniform float uScratch;
varying vec3 vObjN;
varying vec3 vObjP;
`
export const GLASS_EXTRA = /* glsl */ `
  {
    vec3 jo_v = normalize(vViewPosition);
    float jo_ndv = clamp(abs(dot(normal, jo_v)), 0.0, 1.0);
    float jo_f = pow(1.0 - jo_ndv, 3.0);
    float jo_edge = 1.0 - abs(vObjN.z); // sides + rounded bevels, not the flat faces

    // prismatic fringe: hue shifts with angle and position, strongest on the edges
    float jo_k = jo_f * 2.4 + dot(vObjP, vec3(0.8, 0.45, 0.25)) * 1.4 + uTime * 0.04;
    vec3 jo_rainbow = 0.5 + 0.5 * cos(6.2831 * (jo_k + vec3(0.0, 0.33, 0.67)));
    outgoingLight += (jo_rainbow - 0.35) * uPrism * pow(jo_f, 0.7) * (0.2 + 0.8 * jo_edge); // hue-only fringe (doesn't grey the glass)

    // internal reflections: the refracted ray bounces off the (estimated) back
    // surface and picks up sky, sun and bright strips — strongest through the
    // sides and rounded bevels, light on the flat faces (they stay clear)
    {
      vec3 jo_in = refract(-jo_v, normal, 1.0 / 1.52);
      vec3 jo_nb = normalize(-normal * vec3(0.55, 0.55, 1.0) + vec3(0.0, 0.0, 0.0));
      vec3 jo_r2 = reflect(jo_in, jo_nb);
      float jo_tir = smoothstep(0.15, 0.75, 1.0 - abs(dot(jo_in, jo_nb)));
      vec3 jo_inner = JO_ENV(normalize(jo_r2));
      // second, shifted bounce = the doubled streaks seen in thick crystal
      vec3 jo_inner2 = JO_ENV(normalize(reflect(jo_in, normalize(jo_nb + vec3(0.25, -0.2, 0.0)))));
      float jo_w = uRim * (0.22 + 0.78 * jo_edge) * (0.35 + 0.65 * jo_tir);
      outgoingLight = mix(outgoingLight, outgoingLight * 0.85 + (jo_inner * 0.75 + jo_inner2 * 0.45) * 0.9, clamp(jo_w, 0.0, 0.8));
    }
    // crystal edge contrast: a darker band just inside the silhouette (total internal
    // reflection) with a bright line on the very edge — what makes thick glass read as solid
    float jo_dark = smoothstep(0.25, 0.6, 1.0 - jo_ndv) * (1.0 - smoothstep(0.75, 0.95, 1.0 - jo_ndv));
    outgoingLight *= 1.0 - 0.38 * jo_dark * (0.4 + 0.6 * jo_edge);
    // bright rim (light bouncing inside the glass)
    outgoingLight += vec3(0.95, 0.97, 1.0) * uRim * pow(jo_f, 1.2) * (0.35 + 0.65 * jo_edge);
    outgoingLight += vec3(1.0) * uRim * 1.6 * smoothstep(0.86, 0.97, 1.0 - jo_ndv);

    // travelling glint: a soft diagonal band of light every ~8 s
    float jo_band = dot(vObjP, normalize(vec3(1.0, 0.65, 0.0))) * 0.42 - (fract(uTime * 0.125) * 3.2 - 1.6);
    outgoingLight += vec3(1.0, 0.98, 0.95) * uGlint * exp(-jo_band * jo_band * 30.0) * (0.25 + 0.75 * max(jo_edge, jo_f));

    // micro-scratches (short thin lines, random directions) and tiny bubbles
    vec3 jo_an = abs(vObjN);
    vec2 jo_suv = (jo_an.z >= jo_an.x && jo_an.z >= jo_an.y) ? vObjP.xy : (jo_an.x >= jo_an.y ? vObjP.yz : vObjP.xz);
    vec2 jo_sc = floor(jo_suv * 5.0);
    vec2 jo_sf = fract(jo_suv * 5.0) - 0.5;
    float jo_sa = jo_hash12(jo_sc) * 6.2831;
    vec2 jo_sd = vec2(cos(jo_sa), sin(jo_sa));
    float jo_line = abs(dot(jo_sf, vec2(-jo_sd.y, jo_sd.x)));
    float jo_len = abs(dot(jo_sf, jo_sd));
    float jo_lw = fwidth(jo_line) * 1.2 + 0.002;
    float jo_scr = (1.0 - smoothstep(0.0, jo_lw, jo_line)) * (1.0 - smoothstep(0.08, 0.32, jo_len / (0.4 + jo_hash12(jo_sc + 3.1))));
    jo_scr *= step(0.45, jo_hash12(jo_sc + 7.7));
    vec2 jo_bc = floor(jo_suv * 26.0);
    float jo_bd = length(fract(jo_suv * 26.0) - 0.5 - (jo_hash22(jo_bc) - 0.5) * 0.5);
    float jo_bub = (1.0 - smoothstep(0.02, 0.06, jo_bd)) * step(0.94, jo_hash12(jo_bc + 1.7));
    outgoingLight += vec3(1.0) * uScratch * (jo_scr * 0.5 + jo_bub * 0.7) * (0.3 + jo_f) * (1.0 - smoothstep(0.3, 0.7, jo_edge)); // faces only
  }
`

/**
 * Coins "in the grass": fragments below a jagged, blade-like line above the
 * ground are discarded, so the real grass of the background video shows in
 * front of the coin's lower edge; just above the cut the metal is darkened
 * (grass shadow / occlusion). The line is fixed to the ground (world x/z),
 * so a rolling coin moves THROUGH the grass rather than carrying it along.
 * Needs varying vJoWorld (world position). Inserted after <color_fragment>.
 */
export const COIN_GRASS_DECL = /* glsl */ `
uniform float uGroundY;
uniform float uGrassH;
uniform float uGrassFreq;
varying vec3 vJoWorld;
`
export const COIN_GRASS = /* glsl */ `
  {
    float jo_above = vJoWorld.y - uGroundY;
    float jo_x = vJoWorld.x * uGrassFreq + vJoWorld.z * uGrassFreq * 0.37;
    // thin pointed blades (two layers) over low clumps
    float jo_b1 = pow(jo_noise3(vec3(jo_x * 22.0, 0.5, 3.1)), 4.0);
    float jo_b2 = pow(jo_noise3(vec3(jo_x * 41.0, 2.5, 9.7)), 6.0);
    float jo_clumps = jo_noise3(vec3(jo_x * 2.1, 7.7, 0.4));
    float jo_cut = uGrassH * (0.3 + 0.45 * jo_clumps + 1.6 * jo_b1 + 1.1 * jo_b2);
    if (jo_above < jo_cut) discard;
    // soft grass shade just above the blades (follows the clumps, not each blade → no streaks)
    float jo_shadeTop = uGrassH * (0.9 + 0.6 * jo_clumps);
    diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, jo_shadeTop, jo_above - jo_cut * 0.6));
  }
`
