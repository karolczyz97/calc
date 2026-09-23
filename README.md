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
npm start     # http://localhost:3333/calc/ (i /darkpdf/)
npm test      # testy silnika (Node 20+)
```

## Pliki

| Plik | Co robi |
|---|---|
| `calc-engine.js` | silnik bez DOM: jednostki, stałe, parser, obliczenia, formatowanie liczb (testowany) |
| `calc-app.js` | interfejs: pole działania, klawiatura, historia, zmienne, stałe |
| `calc.css` | wygląd (samodzielnie i w DarkPDF) |
| `sw.js` | pamięć podręczna do pracy offline |

Po wdrożeniu nie trzeba podbijać numerów `?v=` – `sw.js` zawsze sprawdza na serwerze, czy plik się zmienił.
