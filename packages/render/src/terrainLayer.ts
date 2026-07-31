import {
  BufferImageSource,
  Geometry,
  GlProgram,
  Mesh,
  Shader,
  Texture,
  type Renderer,
} from 'pixi.js';
import type { MatchState, Terrain } from '@moa/sim';
import type { ArenaPalette, TerrainStyle } from './palette';

/**
 * The terrain is one quad and a fragment shader. The mask is uploaded as a
 * single-channel R8 texture and every colour decision happens on the GPU.
 *
 * The mask is column-major (index = x * height + y), so the texture is declared
 * `height` wide by `width` tall and the shader swizzles UVs. That makes the
 * transpose free, and it makes a dirty column range a *contiguous* run of
 * bytes — which is what lets the upload below be one texSubImage2D with no
 * repacking.
 */

const VERTEX = `#version 300 es
in vec2 aPosition;
out vec2 vWorld;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
}
`;

function fragmentSource(width: number, height: number): string {
  // Arena dimensions are fixed for the life of a match, so they are baked in
  // as constants rather than passed as uniforms. One less thing on the hot
  // path that can silently fail to sync.
  return `#version 300 es
precision highp float;

in vec2 vWorld;
out vec4 fragColor;

uniform sampler2D uMask;

const vec2 uArena = vec2(${width.toFixed(1)}, ${height.toFixed(1)});

uniform float uHorizonY;    // world y where the sky gradient bottoms out
uniform float uSoilTopY;    // world y where the strata ramp starts
uniform float uCrustCells;
uniform float uBands;

uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uCrust;
uniform vec3 uSoilSurface;
uniform vec3 uSoilDeep;
uniform vec3 uSoilFloor;

// Texture is transposed: texel x is world y, texel y is world x.
float maskAt(vec2 cell) {
  if (cell.x < 0.0 || cell.x >= uArena.x || cell.y < 0.0 || cell.y >= uArena.y) return 0.0;
  vec2 uv = vec2((floor(cell.y) + 0.5) / uArena.y, (floor(cell.x) + 0.5) / uArena.x);
  return texture(uMask, uv).r;
}

// "Is there empty space within r cells", sampled around a ring. The crust in
// the reference art hugs crater walls and undersides, not just the top
// surface, so this has to be a distance to the nearest edge rather than a
// function of depth. Two rings keep the angular gaps from letting thin
// features slip through.
bool nearEdge(vec2 cell, float r) {
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853981634;
    vec2 o = vec2(cos(a), sin(a)) * r;
    if (maskAt(cell + o) < 0.5) return true;
  }
  return false;
}

vec3 strata(float y) {
  float t = clamp((y - uSoilTopY) / max(1.0, uArena.y - uSoilTopY), 0.0, 1.0);
  float band = floor(t * uBands) / max(1.0, uBands - 1.0);
  return band < 0.5
    ? mix(uSoilSurface, uSoilDeep, band * 2.0)
    : mix(uSoilDeep, uSoilFloor, (band - 0.5) * 2.0);
}

// How enclosed an empty cell is, measured horizontally. Terrain is a
// heightmap, so a crater is genuinely a hole to the sky — but painting it sky
// colour makes it read as a glowing pit rather than a dug-out hollow. Walls to
// either side darken it toward the deep soil colour instead.
float cavity(vec2 cell) {
  float occ = 0.0;
  float total = 0.0;
  for (int k = 1; k <= 6; k++) {
    float d = float(k) * 5.0;
    float wgt = 1.0 - float(k - 1) / 7.0;
    total += wgt * 2.0;
    if (maskAt(cell + vec2(d, 0.0)) > 0.5) occ += wgt;
    if (maskAt(cell - vec2(d, 0.0)) > 0.5) occ += wgt;
  }
  // Only genuinely enclosed air darkens. Without the threshold every surface
  // gets a dark halo where one side happens to be higher than the other.
  return smoothstep(0.45, 0.95, occ / max(0.001, total));
}

void main() {
  vec2 cell = floor(vWorld);

#ifdef MOA_DEBUG_MASK
  float m = maskAt(cell);
  fragColor = vec4(m, 1.0 - m, 0.0, 1.0);
  return;
#endif

  if (maskAt(cell) < 0.5) {
    float t = clamp(vWorld.y / max(1.0, uHorizonY), 0.0, 1.0);
    vec3 sky = mix(uSkyTop, uSkyHorizon, t);
    fragColor = vec4(mix(sky, uSoilFloor * 0.5, cavity(cell) * 0.92), 1.0);
    return;
  }

  if (nearEdge(cell, uCrustCells) || nearEdge(cell, uCrustCells * 0.5)) {
    fragColor = vec4(uCrust, 1.0);
    return;
  }

  fragColor = vec4(strata(vWorld.y), 1.0);
}
`;
}

/**
 * The narrow slice of Pixi's WebGL internals this layer needs in order to do a
 * partial texture upload. Declared structurally rather than reached for with
 * `any`, so a Pixi upgrade that moves any of it fails to compile instead of
 * failing at runtime.
 */
type GlTextureHandle = { readonly texture: WebGLTexture | undefined };
type GlTextureSystem = {
  getGlSource(source: BufferImageSource): GlTextureHandle | undefined;
  unbind(source: BufferImageSource): void;
};
type GlRendererInternals = { readonly gl: WebGL2RenderingContext; readonly texture: GlTextureSystem };

function glInternals(renderer: Renderer): GlRendererInternals | null {
  const r = renderer as unknown as Partial<GlRendererInternals>;
  if (r.gl === undefined || r.texture === undefined) return null;
  if (typeof r.texture.getGlSource !== 'function') return null;
  if (typeof r.texture.unbind !== 'function') return null;
  return { gl: r.gl, texture: r.texture };
}

export type TerrainLayer = {
  readonly mesh: Mesh<Geometry, Shader>;
  /** Upload whatever the sim changed on the tick just stepped. */
  sync(renderer: Renderer, state: MatchState): void;
  /** Force a full re-upload; used on first frame and after a context loss. */
  invalidate(): void;
  destroy(): void;
};

export function createTerrainLayer(
  terrain: Terrain,
  palette: ArenaPalette,
  style: TerrainStyle,
  arena: { readonly minGround: number; readonly maxGround: number },
  debugMask = false,
): TerrainLayer {
  /**
   * RGBA rather than R8. Single-channel textures were the obvious choice —
   * one byte per cell instead of four — but r8unorm sampled as zero on this
   * stack, so the mask is staged into the red channel of an RGBA buffer
   * instead. The cost is bandwidth on a path that is already tiny: a dirty
   * range is a few dozen columns, and the once-per-match full upload is 2MB.
   */
  const staging = new Uint8Array(terrain.width * terrain.height * 4);

  function stageColumns(minX: number, maxX: number): Uint8Array {
    const start = minX * terrain.height;
    const end = (maxX + 1) * terrain.height;
    for (let i = start; i < end; i++) {
      const v = terrain.mask[i] === 1 ? 255 : 0;
      const o = i * 4;
      staging[o] = v;
      staging[o + 1] = v;
      staging[o + 2] = v;
      staging[o + 3] = 255;
    }
    return staging.subarray(start * 4, end * 4);
  }

  stageColumns(0, terrain.width - 1);

  const source = new BufferImageSource({
    // Transposed on purpose: width = arena height, height = arena width.
    resource: staging,
    width: terrain.height,
    height: terrain.width,
    format: 'rgba8unorm',
    scaleMode: 'nearest',
    alphaMode: 'no-premultiply-alpha',
  });
  const texture = new Texture({ source });

  const geometry = new Geometry({
    attributes: { aPosition: [0, 0, terrain.width, 0, terrain.width, terrain.height, 0, terrain.height] },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });

  const baseFragment = fragmentSource(terrain.width, terrain.height);

  const shader = new Shader({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: debugMask ? baseFragment.replace('precision highp float;', 'precision highp float;\n#define MOA_DEBUG_MASK') : baseFragment,
      name: 'moa-terrain',
    }),
    resources: {
      uMask: source,
      uSampler: source.style,
      terrainUniforms: {
        uHorizonY: { value: arena.maxGround, type: 'f32' },
        uSoilTopY: { value: arena.minGround, type: 'f32' },
        uCrustCells: { value: style.crustCells, type: 'f32' },
        uBands: { value: style.strataBands, type: 'f32' },
        uSkyTop: { value: new Float32Array(palette.skyTop), type: 'vec3<f32>' },
        uSkyHorizon: { value: new Float32Array(palette.skyHorizon), type: 'vec3<f32>' },
        uCrust: { value: new Float32Array(palette.crust), type: 'vec3<f32>' },
        uSoilSurface: { value: new Float32Array(palette.soilSurface), type: 'vec3<f32>' },
        uSoilDeep: { value: new Float32Array(palette.soilDeep), type: 'vec3<f32>' },
        uSoilFloor: { value: new Float32Array(palette.soilFloor), type: 'vec3<f32>' },
      },
    },
  });

  const mesh = new Mesh({ geometry, shader });
  let needsFullUpload = true;

  function uploadRange(renderer: Renderer, minX: number, maxX: number): boolean {
    const gl = glInternals(renderer);
    if (gl === null) return false;

    const handle = gl.texture.getGlSource(source);
    if (handle === undefined || handle.texture === undefined) return false;
    // Rows of the transposed texture are arena columns, so a dirty column
    // range is already a contiguous run — no repacking, just a channel splat.
    const rows = maxX - minX + 1;
    const bytes = stageColumns(minX, maxX);

    gl.gl.bindTexture(gl.gl.TEXTURE_2D, handle.texture);
    // Default alignment is 4. Arena heights that are not a multiple of 4 would
    // otherwise shear the upload, and arena size is content-editable.
    gl.gl.pixelStorei(gl.gl.UNPACK_ALIGNMENT, 1);
    gl.gl.texSubImage2D(
      gl.gl.TEXTURE_2D,
      0,
      0,
      minX,
      terrain.height,
      rows,
      gl.gl.RGBA,
      gl.gl.UNSIGNED_BYTE,
      bytes,
    );
    // Pixi caches which texture is bound per unit; a raw bind behind its back
    // would leave that cache lying. Re-syncing here keeps the next draw honest.
    gl.texture.unbind(source);
    return true;
  }

  return {
    mesh,
    invalidate() {
      needsFullUpload = true;
    },
    sync(renderer, state) {
      if (needsFullUpload) {
        stageColumns(0, terrain.width - 1);
        if (!uploadRange(renderer, 0, terrain.width - 1)) source.update();
        needsFullUpload = false;
        return;
      }
      const minX = state.tickDirtyMinX;
      const maxX = state.tickDirtyMaxX;
      if (maxX < minX) return;
      const lo = Math.max(0, minX);
      const hi = Math.min(terrain.width - 1, maxX);
      if (!uploadRange(renderer, lo, hi)) {
        stageColumns(lo, hi);
        source.update();
      }
    },
    destroy() {
      mesh.destroy();
      texture.destroy(true);
    },
  };
}
