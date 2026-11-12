import { test, expect } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = '.github/workflows';

test('every action is pinned to a commit', async () => {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.yml'));
  expect(files).toContain('previews.yml');
  for (const file of files) {
    const uses = (await readFile(join(DIR, file), 'utf8')).match(/uses:\s*\S+/g) ?? [];
    expect(uses.length, file).toBeGreaterThan(0);
    for (const u of uses) expect(u, file).toMatch(/@[0-9a-f]{40}$/);
  }
});

test('the preview refresh runs weekly and by hand, and opens a pull request', async () => {
  const text = await readFile(join(DIR, 'previews.yml'), 'utf8');
  expect(text).toMatch(/schedule:\s*\n\s*- cron: '\d+ \d+ \* \* [0-6]'/);
  expect(text).toContain('workflow_dispatch:');
  expect(text).toContain('pnpm capture-previews');
  expect(text).toContain('pnpm capture-tidalwave-demo');
  expect(text).toContain('gh pr create');
});
