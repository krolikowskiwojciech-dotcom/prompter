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
```

Tryb pracy: `pokaz` → zmiana w pliku tymczasowym (scratchpad) → pokaż Wojtkowi, co się zmienia → `zapisz`.
Usuwanie tylko na wyraźną prośbę. Teksty mówione pisz skillem `active-fizjo-reels` / głosem marki.
Znaczniki w tekście: pusta linia = akapit, `*wyróżnienie*`, `[notatka — nie czyta]`, `//` pauza, `# Nagłówek`.
Komenda głosowa „jeszcze raz” cofa do początku akapitu — nie wstawiaj tej frazy do treści skryptu.

## Zmiany w aplikacji
- Pliki: `index.html` (UI + CSS), `app.js` (logika), `parsers.js` (import plików), `voice.js` (ElevenLabs Scribe,
  dopasowanie do tekstu, komenda „jeszcze raz”), `sync.js` (GitHub API), `sw.js` (offline).
- Po każdej zmianie podbij `CACHE` w `sw.js`, potem commit + `git push` (Pages publikuje sam w 1–2 min).
- Podgląd lokalny: `python3 -m http.server 8777` w tym katalogu → http://localhost:8777 (`#debug` = stan głosu w `window.tp`).
- Testy w przeglądarce podglądu na atrapie API: po teście przywróć localStorage — inaczej dane testowe trafią do repo
  przy włączonej synchronizacji (wpadka z 2026-10-02).
- Tworzenia publicznych repo i zmian uprawnień nie robię sam — Wojtek uruchamia takie polecenia.
