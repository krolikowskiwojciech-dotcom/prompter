# Zasady skryptów do rolek (Wojtek)

Obowiązuje każdego agenta (Claude, Astra), który pisze albo poprawia tekst do Promptera.
Spisane 2026-11-18 po serii „Kostka” (skręcenie kostki, 5 rolek). Źródło uwag: `~/Movies/ACTIVE_FIZJO_MONTAZ/docs/LEKCJE.md`, kategoria `skrypt`.

## Kim jest Wojtek w rolce

Fizjoterapeuta, który mówi do kamery do pacjenta. Rzeczowo, konkretnie, z liczbami z badań, na „Ty”.
Prostota jest ważna, ale **nigdy kosztem ścisłości**. Wojtek woli mieć mniej obserwujących, niż powiedzieć coś
nieprecyzyjnie: „takie uproszczenia mnie rażą, u mnie to nie przejdzie”. Nie lubi „głupich nieścisłości”.

## 1. Ścisłość

- **Anatomia po imieniu.** Konkretna struktura, którą zmierzono albo o której mowa: „mięśnie odwodzące biodro”,
  „mięśnie łydki”, „więzadła po zewnętrznej stronie kostki”. Nie „słabe biodro”, „siła biodra”.
- **Uraz zawsze nazwany.** „Po skręceniu kostki”, nie samo „po skręceniu” czy „po urazie”.
- **Kość się łamie, nie skręca.** „Skręcenie czy złamanie?”, a nie „więzadła czy kość?”.
- **Grupa z badania taka, jaka była.** Młodzi amatorzy z klubów to nie „sportowcy” (brzmi jak zawodowcy).
  Piłkarze, wiek, amatorzy/zawodowcy — według badania.
- **Liczby i wnioski dokładnie jak w źródle.** Sprawdź w PubMed przed napisaniem zdania z liczbą.
  Związek z badania podawaj jako to, co zaobserwowano („częściej skręcali kostkę”), nie jako pewną przyczynę.
  Nie przesadzaj słowami („ból maleje”, a nie „ból ustępuje”, jeśli badanie mówi o spadku).
- Jeśli dopisujesz coś spoza źródła (np. alarmy, przy których jechać na SOR), powiedz o tym Wojtkowi.

## 2. Każde zdanie zrozumiałe samo

- Przeczytaj każde zdanie osobno: czy wiadomo, **kto, co i czego dotyczy**, bez domyślania się z poprzednich?
- **Wynik badania opowiedz jak krótką historię**: kto to był, co robił, co wyszło.
  Dobrze: „Dwa tygodnie po skręceniu kostki badani zeskakiwali na chorą nogę. Część nie umiała na niej wylądować.
  To właśnie im po roku kostka uciekała częściej.” Źle: „Kto nie dawał rady, temu kostka później częściej uciekała.”
- Żadnych zdań, które brzmią głupio po polsku: „ból najmocniej słabnie”, „zacznij od schodów w dół”.

## 3. Mowa Wojtka

- Tak, jak mówi na co dzień. Pełne polecenia: „Postaw stopę przed ścianą. Dotknij ściany kolanem.”,
  nie hasła z listy: „Stopa przed ścianą.”
- Krótkie zdania (najwyżej 15 słów), ale pełne. Bez urwanych kawałków typu „Nawet utykając.”, „W liczbach.”
- Spójniki, które prowadzą widza: „Bo…”, „Dlatego…”, „A co z…?”, „Co ciekawe…”.
- Bez metafor w miejsce terminów, bez zastrzeżeń metodologicznych w tekście mówionym, bez tematów o zgonach.

## 4. Budowa rolki

- **Hak = konkret**: liczba albo sytuacja z życia („Kostka nie boli. Ale na krawężniku nagle ucieka.”).
  Zaraz po haku zdanie o mechanizmie, które da się pokazać animacją 3D.
- **Wyliczanka do końca.** Zapowiadasz cztery miejsca — wymieniasz pierwsze, drugie, trzecie i czwarte, po kolei.
- Jedna rolka = jedna myśl. W serii zapowiedz kolejną część.
- Zakończenie: „Obserwuj mój profil. Do zobaczenia.” albo CTA do gabinetu, gdy temat prowadzi do badania.

## 5. Bezpieczeństwo widza

- **Bez samodiagnozy.** Objawy urazu = kiedy iść do lekarza (najlepiej tego samego dnia, o RTG decyduje lekarz).
  „Nie jesteś pewny? Też idź.” SOR tylko przy wyraźnych alarmach — „nie ma co obciążać SOR-u”.
- Bez liczb, które uspokajają widza bez lekarza (np. „ryzyko złamania poniżej 1,4 %”).
- Domowe próby funkcjonalne są w porządku (porównanie chorej i zdrowej nogi).

## 6. Format w Prompterze (sprawdza go `narzedzia/recenzja.mjs`)

- **Jedno zdanie = jeden blok** (pusta linia). „Jeszcze raz” cofa do początku bloku, a Wojtek chce powtórzyć
  tylko jedno zdanie.
- **Blok co najmniej 4 słowa.** Krótka dopinka („Do zobaczenia.”, „Brzmi dziwnie?”) idzie razem z sąsiednim zdaniem.
- `*akcent*` — jedno–dwa słowa na blok (liczba, słowo klucz). Wojtek: kolory „bardzo mi pomagają”.
- `//` — krótka pauza przed puentą albo drugą częścią zdania.
- Wskazówki intonacji na początku linii (Prompter ich nie czyta): `[wolniej]` ważna liczba albo instrukcja,
  `[pytanie]` głos w górę, `[puenta]` głos w dół, pewnie, `[lżej]` luźniej, `[uśmiech]` zakończenie. Najwyżej jedna na blok.
- Bez fraz-komend: „jeszcze raz”, „od nowa”, „od początku”.
- `node narzedzia/skrypt.mjs zapisz|dodaj` robi recenzję sam i nie zapisze tekstu z błędami.
  `recenzja <plik>` sprawdza bez zapisu. `--bez-recenzji` tylko na wyraźną prośbę Wojtka.

## 7. Praca z Wojtkiem nad tekstem

- Gdy narzeka na formę — popraw **tylko to, co wskazał**. Nie przepisuj całości od nowa (to dwa razy pogorszyło tekst).
- Nagranych rolek nie ruszaj (sprawdź `skrypt.mjs nagrania <tytuł>`).
- Pokazuj teksty w artefakcie z tym samym formatowaniem co Prompter, a w czacie pisz krótko.
- Gdy nagrywa, wykorzystaj czas: poprawiaj następne rolki w kolejności, w jakiej będzie je nagrywał.
- Przed zapisem sprawdź, czy inny agent nie zmienia tych samych skryptów (`skrypt.mjs lista`, `af dziennik`).
