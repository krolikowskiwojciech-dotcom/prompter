# Prompter — teleprompter Wojtka (PWA)

Zawsze po polsku. Aplikacja webowa na iPada (obudowa teleprompteru w gabinecie) i iPhone'a, zamiast Teleprompter.com.

- **Adres:** https://krolikowskiwojciech-dotcom.github.io/prompter/ (GitHub Pages z gałęzi `main` tego repo, repo publiczne).
- **Dane:** prywatne repo `krolikowskiwojciech-dotcom/prompter-dane`:
  `skrypty.json` (skrypty + tempo per skrypt) i `klucze.json` (klucz ElevenLabs — nigdy go nie wypisuj ani nie pokazuj).
  Urządzenia synchronizują się co minutę i przy otwarciu aplikacji.

## Prośby o skrypty („popraw skrypt…”, „dodaj do promptera…”)
Używaj `narzedzia/skrypt.mjs` (token z `gh auth token`):

```
node narzedzia/skrypt.mjs lista
node narzedzia/skrypt.mjs pokaz <id albo fragment tytułu>
node narzedzia/skrypt.mjs zapisz <id albo fragment tytułu> <plik.txt>
node narzedzia/skrypt.mjs tytul <skrypt> "<nowy tytuł>"
node narzedzia/skrypt.mjs dodaj "<tytuł>" <plik.txt>
node narzedzia/skrypt.mjs usun <skrypt>
node narzedzia/skrypt.mjs status <skrypt> <roboczy|gotowy|nagrany|zmontowany>
node narzedzia/skrypt.mjs nagrania [tytuł]        # dzienniki nagrań
node narzedzia/skrypt.mjs nagranie <ścieżka>      # jeden dziennik (JSON)
```

## Dziennik nagrania (dla montażu)
Każda sesja czytania (≥ 5 s) zapisuje `prompter-dane/nagrania/<data>/<HHMMSS UTC>_<tytuł>_<id>.json`:
`scriptText`, `paragraphs` (tekst akapitów w kolejności), `events` (`t` ms od startu sesji; `play|pause|end|para|again|restart|jump`,
`para` = indeks akapitu), `transcript` (zatwierdzone wypowiedzi z ElevenLabs, `t` ms), `playMs`, `voice`, `reachedEnd`, `device`, `startedAt` (UTC).
Przeczytanie do końca ustawia status skryptu „nagrany”. Zegar iPada ≠ zegar kamery — dopasowanie do materiału po treści.
Statusy: `roboczy` (Do dopracowania) → `gotowy` → `nagrany` → `zmontowany` (ustawia montaż po zakończeniu rolki).

Tryb pracy: `pokaz` → zmiana w pliku tymczasowym (scratchpad) → pokaż Wojtkowi, co się zmienia → `zapisz`.
Usuwanie tylko na wyraźną prośbę. Teksty mówione pisz skillem `active-fizjo-reels` / głosem marki.
Znaczniki w tekście: pusta linia = akapit, `*wyróżnienie*`, `[notatka — nie czyta]`, `//` pauza, `# Nagłówek`.
Komenda głosowa „jeszcze raz” cofa do początku akapitu — nie wstawiaj tej frazy do treści skryptu.

## Zmiany w aplikacji
- Pliki: `index.html` (UI + CSS), `app.js` (logika), `parsers.js` (import plików), `voice.js` (ElevenLabs Scribe,
  dopasowanie do tekstu, komenda „jeszcze raz”), `sync.js` (GitHub API), `sw.js` (offline).
- Po każdej zmianie podbij `CACHE` w `sw.js`, potem commit + `git push` (Pages publikuje sam w 1–2 min).
- Podgląd lokalny: `python3 -m http.server 8777` w tym katalogu → http://localhost:8777 (`#debug` = stan głosu w `window.tp`).
- Testy w przeglądarce podglądu TYLKO pod http://127.0.0.1:8777 (osobny origin = osobny localStorage, bez tokenu Wojtka).
  `localhost:8777` w podglądzie ma prawdziwą synchronizację — testy tam wysyłały dane testowe do repo (wpadki z 2026-10-02:
  skrypty testowe, potem status „RIR”). Przywrócenie localStorage nie wystarcza: stan w pamięci strony zapisuje się dalej.
- Tworzenia publicznych repo i zmian uprawnień nie robię sam — Wojtek uruchamia takie polecenia.
