// Recenzja skryptu przed wgraniem do Promptera (zasady Wojtka z 2026-11-18).
// Błędy blokują zapis; ostrzeżenia tylko się wypisują. Ominięcie: --bez-recenzji (tylko na wyraźną prośbę Wojtka).
//
// 1. Jedno zdanie = jeden blok (pusta linia między zdaniami). Komenda „jeszcze raz” cofa do początku bloku,
//    więc dłuższy blok kasuje Wojtkowi dobrze nagrane zdania. Wyjątek: dopinka do KROTKIE słów
//    („Do zobaczenia.”, „Brzmi dziwnie?”) idzie razem z sąsiednim zdaniem.
// 1a. Blok krótszy niż MIN_SLOW słów = błąd (Wojtek: „cofa tylko o dwa słowa, przesadziłeś”) — dołącz do sąsiada.
// 2. Bez enterów w środku bloku (zdanie rozbite na kilka linii).
// 3. Zdanie najwyżej MAX_SLOW słów (krótkie zdania).
// 4. Bez fraz, które Prompter bierze za komendy głosowe („jeszcze raz”, „od nowa”, „od początku”).
// 5. Ostrzeżenie: zapowiedziana wyliczanka („cztery miejsca”) bez wszystkich liczebników porządkowych.

export const MAX_SLOW = 15;
export const MIN_SLOW = 4;   // blok krótszy = dołącz do sąsiedniego zdania
export const KROTKIE = 3;    // zdanie-dopinka, które może stać w bloku obok pełnego zdania

const LICZBY = { dwa: 2, dwie: 2, dwóch: 2, trzy: 3, trzech: 3, cztery: 4, czterech: 4, pięć: 5, pięciu: 5, sześć: 6, sześciu: 6 };
const PORZADKOWE = ['pierwsz', 'drug', 'trzec', 'czwart', 'piąt', 'szóst'];
const RZECZOWNIKI = /^(miejsc|punkt|rzecz|sygnał|krok|test|prób|objaw|błęd|powod|zasad|ćwicze|etap|pytani)/;

const czysty = (t) => t.replace(/\[[^\]]*\]/g, ' ').replace(/[*]/g, '').replace(/\/\//g, ' ').replace(/\s+/g, ' ').trim();
const slowa = (t) => (t.match(/[\p{L}\p{N}]+/gu) || []).length;
// zdania: koniec na . ? ! … i dalej coś jeszcze w tym samym bloku
const zdania = (t) => t.split(/(?<=[.?!…])\s+(?=\S)/u).filter((z) => slowa(z) > 0);

export function recenzja(text) {
  const bledy = [];
  const ostrzezenia = [];
  const bloki = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  bloki.forEach((blok, i) => {
    const nr = `blok ${i + 1}`;
    if (blok.startsWith('#')) return;
    const linie = blok.split('\n').map((l) => l.trim()).filter(Boolean);
    const pokaz = czysty(blok).slice(0, 70);
    if (linie.length > 1) bledy.push(`${nr}: ${linie.length} linie w jednym bloku — każde zdanie osobno, z pustą linią („${pokaz}…”)`);
    const z = zdania(czysty(blok));
    const pelne = z.filter((zd) => slowa(zd) > KROTKIE);
    if (pelne.length > 1 || z.length > 2) bledy.push(`${nr}: ${z.length} zdania w jednym bloku — „jeszcze raz” cofnie całość („${pokaz}…”)`);
    if (slowa(czysty(blok)) < MIN_SLOW) bledy.push(`${nr}: tylko ${slowa(czysty(blok))} słowa („${pokaz}”) — dołącz do sąsiedniego zdania, żeby „jeszcze raz” nie cofało o dwa słowa`);
    for (const zd of z) if (slowa(zd) > MAX_SLOW) bledy.push(`${nr}: zdanie ma ${slowa(zd)} słów (maks. ${MAX_SLOW}) — „${zd.slice(0, 70)}…”`);
  });
  const plain = czysty(text).toLowerCase();
  for (const f of ['jeszcze raz', 'od nowa', 'od początku']) if (plain.includes(f)) bledy.push(`fraza „${f}” to komenda głosowa Promptera — przeformułuj`);
  // wyliczanka: „cztery miejsca” → w dalszym tekście mają paść pierwsze…czwarte
  const re = /\b(dwa|dwie|dwóch|trzy|trzech|cztery|czterech|pięć|pięciu|sześć|sześciu)\s+(\p{L}+)/gu;
  for (const m of plain.matchAll(re)) {
    if (!RZECZOWNIKI.test(m[2])) continue;
    const n = LICZBY[m[1]];
    const dalej = plain.slice(m.index + m[0].length);
    const brak = PORZADKOWE.slice(0, n).filter((p) => !dalej.includes(p));
    if (brak.length) ostrzezenia.push(`zapowiedź „${m[0]}”, a dalej brakuje: ${brak.map((p) => p + '…').join(', ')} — wyliczanka do końca`);
  }
  return { bledy, ostrzezenia, bloki: bloki.length };
}

export function raport(r) {
  const out = [];
  if (r.bledy.length) out.push('RECENZJA — do poprawy:', ...r.bledy.map((b) => '  ✗ ' + b));
  if (r.ostrzezenia.length) out.push('RECENZJA — sprawdź:', ...r.ostrzezenia.map((b) => '  ! ' + b));
  if (!r.bledy.length && !r.ostrzezenia.length) out.push(`Recenzja OK (${r.bloki} bloków: po jednym zdaniu, krótkie dopinki przy sąsiadach).`);
  return out.join('\n');
}
