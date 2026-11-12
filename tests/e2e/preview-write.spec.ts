import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { writePreview } from '../../scripts/lib/write-preview.mjs';

const W = 320;
const H = 180;

function png(paint: (x: number, y: number) => [number, number, number]): Promise<Buffer> {
  const data = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) data.set(paint(x, y), (y * W + x) * 3);
  }
  return sharp(data, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

const base = (x: number, y: number): [number, number, number] => [30 + (x % 40), 30, 46 + (y % 30)];

test.describe('writePreview', () => {
  let dir: string;
  let out: string;

  test.beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'preview-'));
    out = join(dir, 'x-preview.webp');
  });
  test.afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('writes a missing file', async () => {
    expect(await writePreview(await png(base), out)).toBe(true);
    expect((await sharp(out).metadata()).format).toBe('webp');
  });

  test('keeps the file when the same picture comes again', async () => {
    await writePreview(await png(base), out);
    const before = await readFile(out);
    expect(await writePreview(await png(base), out)).toBe(false);
    expect((await readFile(out)).equals(before)).toBe(true);
  });

  test('keeps the file when only rendering noise differs', async () => {
    await writePreview(await png(base), out);
    const before = await readFile(out);
    const noisy = await png((x, y) => {
      const [r, g, b] = base(x, y);
      return [r + ((x + y) % 3), g + 1, b];
    });
    expect(await writePreview(noisy, out)).toBe(false);
    expect((await readFile(out)).equals(before)).toBe(true);
  });

  test('replaces the file when part of the picture changed', async () => {
    await writePreview(await png(base), out);
    const before = await readFile(out);
    const changed = await png((x, y) => (x < 80 && y < 40 ? [137, 180, 250] : base(x, y)));
    expect(await writePreview(changed, out)).toBe(true);
    expect((await readFile(out)).equals(before)).toBe(false);
  });

  test('replaces the file when the size changed', async () => {
    await writePreview(await png(base), out);
    const small = await sharp(await png(base)).resize(160, 90).png().toBuffer();
    expect(await writePreview(small, out)).toBe(true);
    expect((await sharp(out).metadata()).width).toBe(160);
    expect((await stat(out)).size).toBeGreaterThan(0);
  });
});
