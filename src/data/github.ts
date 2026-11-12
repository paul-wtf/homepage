import { readFile } from 'node:fs/promises';
import { projects } from './projects';

export interface RepoMeta {
  release?: string;
  lastCommit?: string;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const API = 'https://api.github.com';
const TIMEOUT = 5000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

async function getJson(fetchFn: FetchFn, url: string, token: string | undefined): Promise<unknown> {
  try {
    const res = await fetchFn(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function clean(v: unknown): RepoMeta {
  const meta: RepoMeta = {};
  if (!isObj(v)) return meta;
  if (typeof v.release === 'string' && v.release) meta.release = v.release;
  if (typeof v.lastCommit === 'string' && !Number.isNaN(Date.parse(v.lastCommit))) {
    meta.lastCommit = v.lastCommit;
  }
  return meta;
}

export async function fetchRepoMeta(
  repoUrl: string,
  fetchFn: FetchFn = fetch,
  token: string | undefined = process.env.GITHUB_TOKEN
): Promise<RepoMeta> {
  const slug = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/.exec(repoUrl)?.[1];
  if (!slug) return {};
  const [release, commits] = await Promise.all([
    getJson(fetchFn, `${API}/repos/${slug}/releases/latest`, token),
    getJson(fetchFn, `${API}/repos/${slug}/commits?per_page=1`, token),
  ]);
  const head = Array.isArray(commits) && isObj(commits[0]) ? commits[0].commit : null;
  const committer = isObj(head) ? head.committer : null;
  return clean({
    release: isObj(release) ? release.tag_name : null,
    lastCommit: isObj(committer) ? committer.date : null,
  });
}

async function load(): Promise<Record<string, RepoMeta>> {
  const file = process.env.PROJECT_META_FILE;
  if (file) {
    const data: unknown = JSON.parse(await readFile(file, 'utf8'));
    return Object.fromEntries(Object.entries(isObj(data) ? data : {}).map(([name, v]) => [name, clean(v)]));
  }
  const metas = await Promise.all(projects.map((p) => fetchRepoMeta(p.repoUrl)));
  return Object.fromEntries(projects.map((p, i) => [p.name, metas[i]]));
}

let cached: Promise<Record<string, RepoMeta>> | undefined;

export function projectMeta(): Promise<Record<string, RepoMeta>> {
  return (cached ??= load());
}

const date = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
});

export function commitDate(iso: string): string {
  return date.format(new Date(iso));
}
