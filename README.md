# Kalkulator naukowy

Kalkulator z jednostkami i stałymi fizycznymi: `sqrt(2*g*h)`, `100 km/2h`, `G*MZ/RZ^2`.
Działa samodzielnie (https://karolczyz97.github.io/calc/) i jako panel w czytniku [DarkPDF](https://github.com/karolczyz97/darkpdf).

## Praca lokalna

Paleta kolorów (`theme.css`) pochodzi z repo darkpdf – sklonuj je obok, tak jak na GitHub Pages:

```
…/darkpdf
…/calc
```

```
npm ci        # zależności narzędzi i dokładne wersje z package-lock.json
npm start     # http://localhost:3333/calc/ (i /darkpdf/)
npm test      # testy silnika (Node 22.13+)
npm run lint
```

## Pliki

| Plik | Co robi |
|---|---|
| `calc-engine.js` | silnik bez DOM: jednostki, stałe, parser, obliczenia, formatowanie liczb (testowany) |
| `calc-app.js` | interfejs: pole działania, klawiatura, historia, zmienne, stałe |
| `calc.css` | wygląd (samodzielnie i w DarkPDF) |
| `lib/katex` | KaTeX 0.16.11 (tylko `katex.min.js`, `katex.min.css` i fonty `.woff2`; licencja MIT w `LICENSE`) – wzory jednostek offline |
| `sw.js` | pamięć podręczna do pracy offline |
| `manifest.webmanifest`, `icon*` | instalacja jako aplikacja i ikona |

Po wdrożeniu nie trzeba podbijać numerów `?v=` – `sw.js` zawsze sprawdza na serwerze, czy plik się zmienił.
Przy wolnej sieci po dwóch sekundach korzysta z cache, jeśli dana odpowiedź jest zapisana.
Nie usuwa cache innych aplikacji.

Kontrolki korzystają ze wspólnych tokenów Gemini i lokalnego Google Sans Flex z repo DarkPDF.
Font obejmuje polskie znaki i jest dostępny offline (licencja SIL OFL: `darkpdf/fonts/OFL.txt`).

Wynik można wybrać Tabem: Enter/Spacja albo klik wstawia go do działania od razu (z nawiasem, gdy ma minus
albo jednostkę: `(-5)`, `(20 m/s)`), Ctrl+C lub Command+C albo przycisk obok kopiuje.

Zapis działań:
- litery za liczbą to jednostka (`10 m`), `g` za liczbą to gram (`200 g` = 0,2 kg), przyspieszenie ziemskie mnóż jawnie (`2*g`);
- jednostka może stać też za nawiasem: `(2 + 3) m`, `sqrt(2) m`;
- spacja grupuje cyfry jak w tablicach: `384 400 km`, `6,626 070 15·10⁻³⁴ J·s`;
- mnożenie bez znaku wiąże mocniej niż dzielenie: `1/2π` to `1/(2π)` (kalkulator ostrzega, `(1/2)*π` daje inaczej);
- kąty: `2 rad / 1 s` to 2 Hz i `2 rad * 0,5 m` to 1 m niezależnie od trybu DEG/RAD; kąt przez kąt to zwykła liczba.
Małe wartości trygonometryczne pozostają niezerowe; dokładne szczególne kąty są obsługiwane osobno.
`round()` obsługuje również skrajne liczby miejsc i liczby bliskie granicom zakresu Number.
