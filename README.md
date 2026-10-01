# Prompter

Teleprompter na iPada / iPhone'a jako aplikacja webowa (PWA). Bez kont, bez serwera: skrypty, ustawienia
i klucz ElevenLabs zostają w pamięci przeglądarki na urządzeniu.

**Adres:** https://krolikowskiwojciech-dotcom.github.io/prompter/
Instalacja: Safari → Udostępnij → „Dodaj do ekranu początkowego”.

## Funkcje
- Import z iCloud (Pliki): TXT, MD, RTF, DOCX, PDF, Pages — parsery w `parsers.js`, bez zależności (PDF: pdf.js z CDN).
- Tempo: stała prędkość, słowa/min albo czas całości; zapamiętywane osobno dla każdego skryptu.
- Odbicie w poziomie/pionie, wskaźnik odczytu, przyciemnianie przeczytanego tekstu, odliczanie.
- Gesty: stuknięcie = start/pauza, przeciąganie = przewijanie, szczypanie = rozmiar tekstu,
  uchwyt przy prawej krawędzi = marginesy. Klawisze (pilot/pedał Bluetooth): spacja, strzałki, PageUp/PageDown.
- Śledzenie głosu (`voice.js`): ElevenLabs Scribe v2 Realtime, tryb mieszany — głos koryguje stałe tempo.
  Token jednorazowy pobierany w przeglądarce kluczem wpisanym w Ustawieniach.

## Znaczniki w tekście
Pusta linia = nowy akapit · `*wyróżnienie*` · `[notatka — nie czytasz]` · `//` pauza · `# Ujęcie 2` nagłówek.

## Rozwój
`python3 -m http.server 8777` w tym katalogu, potem http://localhost:8777 (`#debug` udostępnia stan głosu w konsoli).
Po zmianie plików podbij `CACHE` w `sw.js`, żeby urządzenia pobrały nową wersję.
