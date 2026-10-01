// Synchronizacja skryptów między urządzeniami przez prywatne repozytorium GitHub (plik skrypty.json).
// Bez serwera: przeglądarka rozmawia z API GitHuba tokenem ograniczonym do jednego repozytorium.
// Scalanie: dla każdego skryptu wygrywa wersja z późniejszym `updated`; usunięcie = wpis z `deleted: true`.

const API = 'https://api.github.com';
const FILE = 'skrypty.json';

// pola tylko lokalne (np. kiedy ostatnio otwarty na tym urządzeniu) nie idą do repozytorium
export const forRemote = (list) => list
  .map(({ used, ...s }) => s)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function merge(local, remote) {
  const out = new Map();
  for (const r of remote) out.set(r.id, r);
  for (const l of local) {
    const r = out.get(l.id);
    if (!r || (l.updated || 0) > (r.updated || 0)) out.set(l.id, l);
  }
  return [...out.values()];
}

const enc = (str) => {
  const bytes = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function gh(token, path, opts = {}) {
  const r = await fetch(API + path, {
    cache: 'no-store',
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(opts.headers || {}) },
  });
  if (r.status === 401) throw new Error('Nieprawidłowy albo wygasły token GitHub');
  return r;
}

export async function pull(repo, token) {
  const r = await gh(token, `/repos/${repo}/contents/${FILE}`);
  if (r.status === 404) {
    // brak pliku (pierwsza synchronizacja) czy brak dostępu do repozytorium?
    const repoRes = await gh(token, `/repos/${repo}`);
    if (!repoRes.ok) throw new Error(`Brak dostępu do repozytorium ${repo} — sprawdź nazwę i uprawnienia tokenu`);
    return { sha: null, list: [] };
  }
  if (!r.ok) throw new Error(`GitHub: błąd ${r.status} przy pobieraniu`);
  const j = await r.json();
  const data = JSON.parse(dec(j.content || '') || '{}');
  return { sha: j.sha, list: Array.isArray(data.scripts) ? data.scripts : [] };
}

export async function push(repo, token, list, sha) {
  const live = list.filter((s) => !s.deleted).length;
  const body = {
    message: `Prompter: ${live} skryptów`,
    content: enc(JSON.stringify({ app: 'prompter', version: 1, scripts: list }, null, 1) + '\n'),
  };
  if (sha) body.sha = sha;
  const r = await gh(token, `/repos/${repo}/contents/${FILE}`, { method: 'PUT', body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) { const e = new Error('konflikt'); e.conflict = true; throw e; }
  if (r.status === 403 || r.status === 404) throw new Error('Token nie ma prawa zapisu (Contents: Read and write) do tego repozytorium');
  if (!r.ok) throw new Error(`GitHub: błąd ${r.status} przy zapisie`);
  return (await r.json()).content?.sha;
}
