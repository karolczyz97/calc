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
| `sw.js` | pamięć podręczna do pracy offline |

Po wdrożeniu nie trzeba podbijać numerów `?v=` – `sw.js` zawsze sprawdza na serwerze, czy plik się zmienił.
Przy wolnej sieci po dwóch sekundach korzysta z cache, jeśli dana odpowiedź jest zapisana.
Nie usuwa cache innych aplikacji.

Kontrolki korzystają ze wspólnych tokenów Gemini i lokalnego Google Sans Flex z repo DarkPDF.
Font obejmuje polskie znaki i jest dostępny offline (licencja SIL OFL: `darkpdf/fonts/OFL.txt`).

Wynik można wybrać Tabem: Enter/Spacja wstawia go do działania, Ctrl+C lub Command+C kopiuje.
Małe wartości trygonometryczne pozostają niezerowe; dokładne szczególne kąty są obsługiwane osobno.
`round()` obsługuje również skrajne liczby miejsc i liczby bliskie granicom zakresu Number.
