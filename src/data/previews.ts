import type { ImageMetadata } from 'astro';

const previewModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/*-preview.{webp,png,jpg,jpeg}',
  { eager: true }
);

export const previews: Record<string, ImageMetadata> = {};
for (const [path, mod] of Object.entries(previewModules)) {
  const name = path.split('/').pop()!.replace(/-preview\.\w+$/, '');
  previews[name] = mod.default;
}
