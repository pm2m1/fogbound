/**
 * Procedural fog: multi-octave value noise painted once into a canvas and reused
 * as an <image> in the SVG. Drifting two copies is cheap (transform only) and looks
 * far more like sea fog than blurred ellipses.
 */
let cached: string | null | undefined;

const hash = (x: number, y: number, seed: number) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

const valueNoise = (x: number, y: number, seed: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
};

export const fogTexture = (): string | null => {
  if (cached !== undefined) return cached;
  try {
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return (cached = null);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 0;
        let amp = 0.55;
        let f = 3 / size;
        for (let o = 0; o < 5; o++) {
          v += amp * valueNoise(x * f, y * f, 7 + o);
          amp *= 0.5;
          f *= 2.03;
        }
        // soft, wispy banks: bias towards clear patches
        const a = Math.max(0, Math.min(1, (v - 0.38) * 2.1));
        const i = (y * size + x) * 4;
        img.data[i] = 204;
        img.data[i + 1] = 218;
        img.data[i + 2] = 228;
        img.data[i + 3] = Math.round(255 * a * a * 0.85);
      }
    }
    ctx.putImageData(img, 0, 0);
    cached = canvas.toDataURL('image/png');
  } catch {
    cached = null;
  }
  return cached;
};
