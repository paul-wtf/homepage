import { readFile } from 'node:fs/promises';

export type ChangeType = 'feat' | 'fix' | 'perf';

export interface Change {
  type: ChangeType;
  scope: string | null;
  subject: string;
}

export interface Release {
  tag: string;
  base: string | null;
  date: string | null;
  changes: Change[];
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export const REPO = 'paul-wtf/homepage';
const API = 'https://api.github.com';
const TIMEOUT = 5000;
const RELEASES = 8;
const TYPES: ChangeType[] = ['feat', 'perf', 'fix'];
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;
const CONVENTIONAL = /^(feat|fix|perf)(?:\(([^()]+)\))?!?: *(\S.*)$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';

export function parseSubject(message: string): Change | null {
  const m = CONVENTIONAL.exec(message.split('\n', 1)[0].trim());
  if (!m) return null;
  return { type: m[1] as ChangeType, scope: m[2]?.trim() || null, subject: m[3].trim() };
}

function version(tag: string): number[] | null {
  const m = SEMVER.exec(tag);
  return m ? m.slice(1).map(Number) : null;
}

function newestFirst(a: number[], b: number[]): number {
  return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
}

function order(changes: Change[]): Change[] {
  return TYPES.flatMap((type) => changes.filter((c) => c.type === type));
}

interface Answer {
  body: unknown;
  exhausted: boolean;
}

async function get(fetchFn: FetchFn, url: string, token: string | undefined): Promise<Answer | null> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return { body: await res.json(), exhausted: res.headers.get('x-ratelimit-remaining') === '0' };
  } catch {
    return null;
  }
}

function release(tag: string, base: string, sha: string | null, body: unknown): Release | null {
  if (!isObj(body) || !Array.isArray(body.commits)) return null;
  const commits = body.commits.filter(isObj);
  const head = commits.find((c) => c.sha === sha) ?? commits[commits.length - 1];
  const committer = isObj(head?.commit) && isObj(head.commit.committer) ? head.commit.committer : null;
  const date = isStr(committer?.date) && !Number.isNaN(Date.parse(committer.date)) ? committer.date : null;
  const changes = commits
    .map((c) => (isObj(c.commit) && isStr(c.commit.message) ? parseSubject(c.commit.message) : null))
    .filter((c): c is Change => c !== null)
    .reverse();
  return { tag, base, date, changes: order(changes) };
}

export async function fetchChangelog(
  fetchFn: FetchFn = fetch,
  token: string | undefined = process.env.GITHUB_TOKEN,
  repo: string = REPO
): Promise<Release[] | null> {
  const listed = await get(fetchFn, `${API}/repos/${repo}/tags?per_page=100`, token);
  if (!listed || !Array.isArray(listed.body)) return null;
  const tags = listed.body
    .filter(isObj)
    .flatMap((t) => {
      const v = isStr(t.name) ? version(t.name) : null;
      const sha = isObj(t.commit) && isStr(t.commit.sha) ? t.commit.sha : null;
      return v ? [{ name: t.name as string, v, sha }] : [];
    })
    .sort((a, b) => newestFirst(a.v, b.v));

  const releases: Release[] = [];
  let exhausted = listed.exhausted;
  for (let i = 0; i < Math.min(RELEASES, tags.length - 1) && !exhausted; i++) {
    const [head, base] = [tags[i], tags[i + 1]];
    const answer = await get(
      fetchFn,
      `${API}/repos/${repo}/compare/${encodeURIComponent(base.name)}...${encodeURIComponent(head.name)}`,
      token
    );
    const r = answer && release(head.name, base.name, head.sha, answer.body);
    if (!r) break;
    releases.push(r);
    exhausted = answer.exhausted;
  }
  return releases.length ? releases : null;
}

function clean(v: unknown): Release[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((r) => {
    if (!isStr(r.tag) || !r.tag) return [];
    const changes = Array.isArray(r.changes)
      ? r.changes.filter(isObj).flatMap((c) =>
          TYPES.includes(c.type as ChangeType) && isStr(c.subject) && c.subject
            ? [{ type: c.type as ChangeType, scope: isStr(c.scope) && c.scope ? c.scope : null, subject: c.subject }]
            : []
        )
      : [];
    return [
      {
        tag: r.tag,
        base: isStr(r.base) && r.base ? r.base : null,
        date: isStr(r.date) && !Number.isNaN(Date.parse(r.date)) ? r.date : null,
        changes: order(changes),
      },
    ];
  });
}

async function load(): Promise<Release[] | null> {
  const file = process.env.CHANGELOG_FILE;
  if (!file) return fetchChangelog();
  const releases = clean(JSON.parse(await readFile(file, 'utf8')));
  return releases.length ? releases : null;
}

let cached: Promise<Release[] | null> | undefined;

export function changelog(): Promise<Release[] | null> {
  return (cached ??= load());
}

export function compareUrl(r: Release, repo: string = REPO): string {
  return r.base
    ? `https://github.com/${repo}/compare/${encodeURIComponent(r.base)}...${encodeURIComponent(r.tag)}`
    : `https://github.com/${repo}/releases/tag/${encodeURIComponent(r.tag)}`;
}
