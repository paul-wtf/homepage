import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

// Chromium builds antialias differently, so a preview counts as changed only
// when more than CHANGED of its pixels moved by more than DELTA on a channel.
const DELTA = 32;
const CHANGED = 0.001;

async function pixels(image) {
  return sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function differs(oldFile, next) {
  let old;
  try {
    old = await pixels(await readFile(oldFile));
  } catch {
    return true;
  }
  const now = await pixels(next);
  if (old.info.width !== now.info.width || old.info.height !== now.info.height) return true;
  let moved = 0;
  for (let i = 0; i < now.data.length; i += 3) {
    if (
      Math.abs(now.data[i] - old.data[i]) > DELTA ||
      Math.abs(now.data[i + 1] - old.data[i + 1]) > DELTA ||
      Math.abs(now.data[i + 2] - old.data[i + 2]) > DELTA
    ) {
      moved++;
    }
  }
  return moved / (now.data.length / 3) > CHANGED;
}

export async function writePreview(png, out) {
  const webp = await sharp(png).webp({ quality: 82 }).toBuffer();
  if (!(await differs(out, webp))) return false;
  await writeFile(out, webp);
  return true;
}
