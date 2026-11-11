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
- Synchronizacja (`sync.js`): skrypty i ich tempo w prywatnym repo `krolikowskiwojciech-dotcom/prompter-dane`
  (plik `skrypty.json`), token fine-grained ograniczony do tego repo; scalanie po `updated`, usunięcia jako `deleted`.
- Śledzenie głosu (`voice.js`): ElevenLabs Scribe v2 Realtime, tryb mieszany — głos koryguje stałe tempo.
  Token jednorazowy pobierany w przeglądarce kluczem wpisanym w Ustawieniach.
  Komenda głosowa „jeszcze raz” (albo klawisz R) cofa do początku akapitu i czeka na ponowne czytanie.

## Znaczniki w tekście
Pusta linia = nowy akapit · `*wyróżnienie*` · `[notatka — nie czytasz]` · `//` pauza · `# Ujęcie 2` nagłówek.

## Rozwój
`python3 -m http.server 8777` w tym katalogu, potem http://localhost:8777 (`#debug` udostępnia stan głosu w konsoli).
Po zmianie plików podbij `CACHE` w `sw.js`, żeby urządzenia pobrały nową wersję.


## Aparat i nagrywanie na telefonie
Otwórz skrypt → **Aparat** → **Włącz aparat** i zezwól na kamerę oraz mikrofon.
**Nagraj i czytaj** rozpoczyna nagrywanie i uruchamia tekst z ustawionym odliczaniem.
Podgląd przedniej kamery jest lustrzany; zapisany film ma oryginalny obraz bez tekstu.
Przycisk **Zakończ** pozostaje widoczny podczas czytania. Pauza tekstu nie przerywa filmu.
Po zakończeniu można odtworzyć, pobrać lub udostępnić film (na iPhonie: Zapisz wideo / Zachowaj w Plikach).
Ostatni film jest przechowywany lokalnie w aplikacji, bez wysyłki do GitHuba. Nowe nagranie zastępuje lokalną kopię po potwierdzeniu.
Nie jest to archiwum: zapisz ważne nagranie w Zdjęciach/Plikach. Brak miejsca jest sygnalizowany.
Zablokowanie ekranu lub przejście do innej aplikacji kończy nagranie; podczas nagrywania trzymaj aplikację na ekranie.
Format jest wybierany według możliwości przeglądarki (preferowany MP4, alternatywnie WebM).

W panelu Aparat dostępne są preferencje 720p / 1080p / 4K, 24 / 25 / 30 / 50 / 60 kl./s,
format automatyczny / MP4 H.264 / MP4 HEVC (tylko gdy przeglądarka deklaruje obsługę) oraz jakość zapisu.
Preferencje są zapamiętywane na urządzeniu. Zmiana rozdzielczości lub klatek ponownie uruchamia podgląd;
w trakcie nagrywania ustawienia są zablokowane. Panel pokazuje faktyczne parametry ścieżki kamery
oraz docelowy bitrate — urządzenie może nie spełnić preferencji, a enkoder może zmienić bitrate i klatkaż.
ProRes i natywny tryb filmowy Apple nie są dostępne przez używany interfejs webowy.
