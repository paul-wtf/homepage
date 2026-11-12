import { test, expect } from '@playwright/test';
import { inlineMarkdown, tilItems } from '../../src/data/til-load';

test.describe('inlineMarkdown', () => {
  test('renders code, bold, emphasis and https links', () => {
    expect(inlineMarkdown('`nix flake check` runs **all** checks, *even* [the slow ones](https://nixos.org/manual)'))
      .toBe(
        '<code>nix flake check</code> runs <strong>all</strong> checks, <em>even</em> ' +
          '<a href="https://nixos.org/manual" target="_blank" rel="noopener noreferrer">the slow ones</a>'
      );
  });

  test('escapes html and leaves other links as text', () => {
    expect(inlineMarkdown('<script>alert(1)</script> & "x"')).toBe('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
    expect(inlineMarkdown('[bad](javascript:alert(1))')).toBe('[bad](javascript:alert(1))');
    expect(inlineMarkdown('`<b>`')).toBe('<code>&lt;b&gt;</code>');
    expect(inlineMarkdown('[a "b"](https://x.test/?q="y")')).toBe(
      '<a href="https://x.test/?q=&quot;y&quot;" target="_blank" rel="noopener noreferrer">a &quot;b&quot;</a>'
    );
  });

  test('leaves snake_case and lone stars alone', () => {
    expect(inlineMarkdown('node_boot_time_seconds is 2 * 3')).toBe('node_boot_time_seconds is 2 * 3');
  });
});

test.describe('tilItems', () => {
  const entry = (date: string, text: unknown, link?: string) => ({ date, text, ...(link ? { link } : {}) });

  test('newest first, at most twelve', () => {
    const entries = Array.from({ length: 14 }, (_, i) => entry(`2026-01-${String(i + 1).padStart(2, '0')}`, `n${i + 1}`));
    const items = tilItems(entries, 'de');
    expect(items.map((i) => i.html)).toEqual(['n14', 'n13', 'n12', 'n11', 'n10', 'n9', 'n8', 'n7', 'n6', 'n5', 'n4', 'n3']);
  });

  test('picks the page language and falls back to the other one', () => {
    const entries = [entry('2026-03-02', { de: 'deutsch', en: 'english' }), entry('2026-03-01', { en: 'only english' }), entry('2026-02-28', 'plain')];
    expect(tilItems(entries, 'de').map((i) => i.html)).toEqual(['deutsch', 'only english', 'plain']);
    expect(tilItems(entries, 'en').map((i) => i.html)).toEqual(['english', 'only english', 'plain']);
  });

  test('keeps the link and its host', () => {
    const [item] = tilItems([entry('2026-03-02', 'x', 'https://www.example.org/a/b')], 'en');
    expect(item).toEqual({ date: '2026-03-02', html: 'x', link: 'https://www.example.org/a/b', host: 'example.org' });
  });

  test('rejects an entry it cannot show', () => {
    for (const bad of [
      entry('12.11.2026', 'x'),
      entry('2026-02-30', 'x'),
      entry('2026-03-01', ''),
      entry('2026-03-01', {}),
      entry('2026-03-01', 'x', 'http://example.org'),
      { text: 'x' },
    ]) {
      expect(() => tilItems([bad], 'de'), JSON.stringify(bad)).toThrow(/TIL entry/);
    }
  });
});
