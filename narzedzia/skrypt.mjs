#!/usr/bin/env node
// Skrypty Promptera z terminala (dla Claude i dla Wojtka). Dane: prywatne repo prompter-dane, plik skrypty.json.
// Token: z `gh auth token` (zalogowany gh) albo zmienna GH_TOKEN. Zmiany trafiają na iPada/iPhone'a w ciągu minuty.
//
//   node narzedzia/skrypt.mjs lista
//   node narzedzia/skrypt.mjs pokaz  <id albo fragment tytułu>
//   node narzedzia/skrypt.mjs zapisz <id albo fragment tytułu> <plik.txt>     (podmienia tekst)
//   node narzedzia/skrypt.mjs tytul  <id albo fragment tytułu> "<nowy tytuł>"
//   node narzedzia/skrypt.mjs dodaj  "<tytuł>" <plik.txt>
//   node narzedzia/skrypt.mjs usun   <id albo fragment tytułu>
//   node narzedzia/skrypt.mjs status <id albo fragment tytułu> <roboczy|gotowy|nagrany|zmontowany>
//   node narzedzia/skrypt.mjs nagrania [fragment tytułu]          (dzienniki nagrań z Promptera)
//   node narzedzia/skrypt.mjs nagranie <ścieżka z listy>            (cały dziennik jako JSON)

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { pull, push, pullJson } from '../sync.js';
import { normalize } from '../parsers.js';

const REPO = process.env.PROMPTER_REPO || 'krolikowskiwojciech-dotcom/prompter-dane';
const token = process.env.GH_TOKEN || execSync('gh auth token', { encoding: 'utf8' }).trim();
const [cmd, a, b] = process.argv.slice(2);

const fold = (t) => t.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '');
const words = (t) => (t.match(/[\p{L}\p{N}]+/gu) || []).length;
const readText = (file) => normalize(readFileSync(file, 'utf8'));

function find(list, q) {
  const live = list.filter((s) => !s.deleted);
  const byId = live.find((s) => s.id === q);
  if (byId) return byId;
  const hits = live.filter((s) => fold(s.title).includes(fold(q || '')));
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error(`Nie ma skryptu pasującego do „${q}”. Sprawdź: lista`);
  throw new Error(`Kilka skryptów pasuje do „${q}”:\n${hits.map((s) => `  ${s.id}  ${s.title}`).join('\n')}\nPodaj id.`);
}

// odczyt → zmiana → zapis; przy jednoczesnym zapisie z urządzenia ponawiamy na świeżych danych
async function edit(change) {
  for (let attempt = 0; ; attempt++) {
    const { sha, list } = await pull(REPO, token);
    const msg = change(list);
    try { await push(REPO, token, list, sha); return msg; }
    catch (e) { if (!(e.conflict && attempt < 3)) throw e; }
  }
}

const now = () => Date.now();
const STATUSY = ['roboczy', 'gotowy', 'nagrany', 'zmontowany'];

// dzienniki nagrań: prompter-dane/nagrania/<RRRR-MM-DD>/<HHMMSS UTC>_<tytuł>_<id>.json
async function listRecordings() {
  const ghJson = (path) => fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  }).then((r) => (r.status === 404 ? [] : r.json()));
  const out = [];
  for (const day of await ghJson('nagrania')) {
    if (day.type !== 'dir') continue;
    for (const f of await ghJson(day.path)) if (f.name.endsWith('.json')) out.push(f.path);
  }
  return out.sort().reverse();
}

try {
  if (cmd === 'lista' || !cmd) {
    const { list } = await pull(REPO, token);
    for (const s of list.filter((x) => !x.deleted).sort((x, y) => y.updated - x.updated)) {
      console.log(`${s.id.padEnd(14)} ${String(words(s.text)).padStart(4)} sł.  ${new Date(s.updated).toISOString().slice(0, 16).replace('T', ' ')}  ${s.title}`);
    }
  } else if (cmd === 'pokaz') {
    const { list } = await pull(REPO, token);
    const s = find(list, a);
    console.log(`# ${s.title}  (id: ${s.id}, ${words(s.text)} słów)\n\n${s.text}`);
  } else if (cmd === 'zapisz') {
    const text = readText(b);
    console.log(await edit((list) => { const s = find(list, a); Object.assign(s, { text, updated: now() }); return `Zapisano: ${s.title} (${words(text)} słów)`; }));
  } else if (cmd === 'tytul') {
    console.log(await edit((list) => { const s = find(list, a); const old = s.title; Object.assign(s, { title: b, updated: now() }); return `Tytuł: ${old} → ${b}`; }));
  } else if (cmd === 'dodaj') {
    const text = readText(b);
    console.log(await edit((list) => {
      const t = now();
      list.push({ id: t.toString(36) + Math.random().toString(36).slice(2, 6), title: a, text, created: t, updated: t });
      return `Dodano: ${a} (${words(text)} słów)`;
    }));
  } else if (cmd === 'usun') {
    console.log(await edit((list) => {
      const s = find(list, a); const title = s.title;
      for (const k of Object.keys(s)) if (k !== 'id') delete s[k];
      Object.assign(s, { deleted: true, updated: now() });
      return `Usunięto: ${title}`;
    }));
  } else if (cmd === 'status') {
    if (!STATUSY.includes(b)) throw new Error(`Status: ${STATUSY.join(' | ')}`);
    console.log(await edit((list) => { const s = find(list, a); Object.assign(s, { status: b, updated: now() }); return `Status: ${s.title} → ${b}`; }));
  } else if (cmd === 'nagrania') {
    const paths = await listRecordings();
    const hits = a ? paths.filter((p) => fold(p).includes(fold(a).replace(/\s+/g, '-'))) : paths;
    console.log(hits.join('\n') || 'Brak nagrań.');
  } else if (cmd === 'nagranie') {
    const { data } = await pullJson(REPO, token, a);
    if (!data) throw new Error(`Nie ma dziennika ${a}`);
    console.log(JSON.stringify(data, null, 1));
  } else {
    console.log('Komendy: lista | pokaz <skrypt> | zapisz <skrypt> <plik> | tytul <skrypt> "<tytuł>" | dodaj "<tytuł>" <plik> | usun <skrypt> | status <skrypt> <status> | nagrania [tytuł] | nagranie <ścieżka>');
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
