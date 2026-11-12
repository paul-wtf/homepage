import { test, expect } from '@playwright/test';
import { fetchRepoMeta } from '../../src/data/github';

const REPO = 'https://github.com/someone/thing';

function fake(routes: Record<string, { status: number; body: unknown }>) {
  const calls: string[] = [];
  const fetchFn = async (url: string | URL | Request): Promise<Response> => {
    const u = String(url);
    calls.push(u);
    const hit = Object.entries(routes).find(([path]) => u.includes(path));
    if (!hit) throw new Error(`unexpected request ${u}`);
    return new Response(JSON.stringify(hit[1].body), { status: hit[1].status });
  };
  return { fetchFn, calls };
}

const commits = (date: unknown) => ({ status: 200, body: [{ commit: { committer: { date } } }] });

test.describe('fetchRepoMeta', () => {
  test('release tag and last commit', async () => {
    const { fetchFn, calls } = fake({
      '/releases/latest': { status: 200, body: { tag_name: 'v1.2.3' } },
      '/commits': commits('2026-11-06T11:11:26Z'),
    });
    expect(await fetchRepoMeta(REPO, fetchFn)).toEqual({ release: 'v1.2.3', lastCommit: '2026-11-06T11:11:26Z' });
    expect(calls.every((u) => u.startsWith('https://api.github.com/repos/someone/thing/'))).toBe(true);
  });

  test('a repo without releases only has the commit date', async () => {
    const { fetchFn } = fake({
      '/releases/latest': { status: 404, body: { message: 'Not Found' } },
      '/commits': commits('2026-11-06T11:11:26Z'),
    });
    expect(await fetchRepoMeta(REPO, fetchFn)).toEqual({ lastCommit: '2026-11-06T11:11:26Z' });
  });

  test('rate limited requests leave both fields out', async () => {
    const { fetchFn } = fake({
      '/releases/latest': { status: 403, body: { message: 'API rate limit exceeded' } },
      '/commits': { status: 429, body: { message: 'API rate limit exceeded' } },
    });
    expect(await fetchRepoMeta(REPO, fetchFn)).toEqual({});
  });

  test('a network failure leaves both fields out', async () => {
    const fetchFn = async (): Promise<Response> => {
      throw new TypeError('fetch failed');
    };
    expect(await fetchRepoMeta(REPO, fetchFn)).toEqual({});
  });

  test('unexpected shapes are ignored', async () => {
    const { fetchFn } = fake({
      '/releases/latest': { status: 200, body: { tag_name: '' } },
      '/commits': commits('gestern'),
    });
    expect(await fetchRepoMeta(REPO, fetchFn)).toEqual({});
    const html = fake({
      '/releases/latest': { status: 200, body: [] },
      '/commits': { status: 200, body: {} },
    });
    expect(await fetchRepoMeta(REPO, html.fetchFn)).toEqual({});
  });

  test('a url outside github is never requested', async () => {
    const { fetchFn, calls } = fake({});
    expect(await fetchRepoMeta('https://example.org/someone/thing', fetchFn)).toEqual({});
    expect(calls).toEqual([]);
  });

  test('the token is sent when there is one', async () => {
    let auth: string | null = 'unset';
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      auth = new Headers(init?.headers).get('authorization');
      return new Response('{}', { status: 404 });
    };
    await fetchRepoMeta(REPO, fetchFn, 'secret');
    expect(auth).toBe('Bearer secret');
    await fetchRepoMeta(REPO, fetchFn, undefined);
    expect(auth).toBeNull();
  });
});
