import { test, expect } from '@playwright/test';
import { fetchChangelog, parseSubject } from '../../src/data/changelog';

const API = 'https://api.github.com/repos/someone/site';

type Route = { status?: number; body: unknown; remaining?: string };

function fake(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchFn = async (url: string | URL | Request): Promise<Response> => {
    const u = String(url);
    calls.push(u);
    const hit = routes[u.replace(API, '')];
    if (!hit) throw new Error(`unexpected request ${u}`);
    const headers = hit.remaining === undefined ? undefined : { 'x-ratelimit-remaining': hit.remaining };
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200, headers });
  };
  return { fetchFn, calls };
}

const tag = (name: string) => ({ name, commit: { sha: `sha-${name}` } });
const commit = (sha: string, message: string, date = '2026-11-01T10:00:00Z') => ({
  sha,
  commit: { message, committer: { date } },
});
const compare = (head: string, ...messages: string[]) => ({
  commits: [
    ...messages.map((m, i) => commit(`c${i}`, m)),
    commit(`sha-${head}`, 'chore: release', '2026-11-10T09:30:00Z'),
  ],
});
const run = (routes: Record<string, Route>) => {
  const f = fake(routes);
  return { result: fetchChangelog(f.fetchFn, undefined, 'someone/site'), calls: f.calls };
};

test.describe('parseSubject', () => {
  test('keeps feat, fix and perf with and without a scope', () => {
    expect(parseSubject('feat(desktop): music window\n\nbody')).toEqual({ type: 'feat', scope: 'desktop', subject: 'music window' });
    expect(parseSubject('fix: keep the token out of logs')).toEqual({ type: 'fix', scope: null, subject: 'keep the token out of logs' });
    expect(parseSubject('perf(api)!: one query instead of three')).toEqual({ type: 'perf', scope: 'api', subject: 'one query instead of three' });
  });

  test('drops every other type and anything that is not a conventional commit', () => {
    for (const m of ['chore: 0.2.0', 'docs: readme', 'refactor(api): split', 'Merge pull request #22 from x/y', 'feat:', 'feature: x', 'feat(a)(b): x']) {
      expect(parseSubject(m), m).toBeNull();
    }
  });
});

test.describe('fetchChangelog', () => {
  test('compares each tag with the one before it, newest first by version', async () => {
    const { result, calls } = run({
      '/tags?per_page=100': { body: [tag('v0.9.0'), tag('v0.10.0'), tag('nightly'), tag('v0.8.1')] },
      '/compare/v0.9.0...v0.10.0': { body: compare('v0.10.0', 'fix(api): b', 'feat(desktop): a', 'chore: c', 'perf: d') },
      '/compare/v0.8.1...v0.9.0': { body: compare('v0.9.0', 'docs: only docs') },
    });
    expect(await result).toEqual([
      {
        tag: 'v0.10.0',
        base: 'v0.9.0',
        date: '2026-11-10T09:30:00Z',
        changes: [
          { type: 'feat', scope: 'desktop', subject: 'a' },
          { type: 'perf', scope: null, subject: 'd' },
          { type: 'fix', scope: 'api', subject: 'b' },
        ],
      },
      { tag: 'v0.9.0', base: 'v0.8.1', date: '2026-11-10T09:30:00Z', changes: [] },
    ]);
    expect(calls).toEqual([
      `${API}/tags?per_page=100`,
      `${API}/compare/v0.9.0...v0.10.0`,
      `${API}/compare/v0.8.1...v0.9.0`,
    ]);
  });

  test('lists the newest change of a type first', async () => {
    const { result } = run({
      '/tags?per_page=100': { body: [tag('v1.0.1'), tag('v1.0.0')] },
      '/compare/v1.0.0...v1.0.1': { body: compare('v1.0.1', 'feat: older', 'feat: newer') },
    });
    expect((await result)?.[0].changes.map((c) => c.subject)).toEqual(['newer', 'older']);
  });

  test('stops after eight releases', async () => {
    const names = Array.from({ length: 12 }, (_, i) => `v1.${11 - i}.0`);
    const routes: Record<string, Route> = { '/tags?per_page=100': { body: names.map(tag) } };
    for (let i = 0; i < names.length - 1; i++) {
      routes[`/compare/${names[i + 1]}...${names[i]}`] = { body: compare(names[i], 'feat: x') };
    }
    const { result, calls } = run(routes);
    expect((await result)?.map((r) => r.tag)).toEqual(names.slice(0, 8));
    expect(calls).toHaveLength(9);
  });

  test('the first tag ever has nothing to compare with', async () => {
    const { result, calls } = run({ '/tags?per_page=100': { body: [tag('v0.1.0')] } });
    expect(await result).toBeNull();
    expect(calls).toHaveLength(1);
  });

  test('a failing tag list leaves the changelog out', async () => {
    const { result } = run({ '/tags?per_page=100': { status: 403, body: { message: 'API rate limit exceeded' } } });
    expect(await result).toBeNull();
    const offline = fetchChangelog(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await offline).toBeNull();
  });

  test('a failing compare ends the list there, without a gap', async () => {
    const { result, calls } = run({
      '/tags?per_page=100': { body: [tag('v3.0.0'), tag('v2.0.0'), tag('v1.0.0'), tag('v0.1.0')] },
      '/compare/v2.0.0...v3.0.0': { body: compare('v3.0.0', 'feat: three') },
      '/compare/v1.0.0...v2.0.0': { status: 500, body: {} },
    });
    expect((await result)?.map((r) => r.tag)).toEqual(['v3.0.0']);
    expect(calls).toHaveLength(3);
  });

  test('stops asking once the rate limit is used up', async () => {
    const { result, calls } = run({
      '/tags?per_page=100': { body: [tag('v3.0.0'), tag('v2.0.0'), tag('v1.0.0')], remaining: '1' },
      '/compare/v2.0.0...v3.0.0': { body: compare('v3.0.0', 'feat: three'), remaining: '0' },
    });
    expect((await result)?.map((r) => r.tag)).toEqual(['v3.0.0']);
    expect(calls).toHaveLength(2);
    const none = run({ '/tags?per_page=100': { body: [tag('v2.0.0'), tag('v1.0.0')], remaining: '0' } });
    expect(await none.result).toBeNull();
    expect(none.calls).toHaveLength(1);
  });

  test('ignores unexpected shapes', async () => {
    const { result } = run({
      '/tags?per_page=100': { body: [tag('v2.0.0'), { name: 7 }, tag('v1.0.0')] },
      '/compare/v1.0.0...v2.0.0': { body: { commits: [{ sha: 'x' }, commit('sha-v2.0.0', 'feat: kept', 'gestern')] } },
    });
    expect(await result).toEqual([
      { tag: 'v2.0.0', base: 'v1.0.0', date: null, changes: [{ type: 'feat', scope: null, subject: 'kept' }] },
    ]);
  });

  test('the token is sent when there is one', async () => {
    const seen: (string | null)[] = [];
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      seen.push(new Headers(init?.headers).get('authorization'));
      return new Response('[]', { status: 200 });
    };
    await fetchChangelog(fetchFn, 'secret');
    await fetchChangelog(fetchFn, undefined);
    expect(seen).toEqual(['Bearer secret', null]);
  });
});
