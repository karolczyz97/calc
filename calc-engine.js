// calc-engine.js – silnik kalkulatora naukowego: jednostki, stałe, parser, obliczenia, formatowanie.
// Bez DOM – ten sam kod liczy w przeglądarce (calc-app.js) i w testach (node --test).

export class CalcError extends Error {}
const err = (m) => new CalcError(m);
const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const dict = (o) => Object.assign(Object.create(null), o);   // bez prototypu: „constructor” czy „__proto__” to zwykłe nazwy

// ================= Jednostki =================
const BASE = ['kg', 'm', 's', 'A', 'K', 'mol', 'cd'];   // kolejność jest też kolejnością wyświetlania
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' };
const SUP_DIGIT = dict(Object.fromEntries(Object.entries(SUP).map(([d, s]) => [s, d])));
const SUP_RUN = /^[⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/;        // indeks górny: ², ⁴, ⁻¹¹
const SUP_ANY = /[⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;
const supToNum = (s) => Number([...s].map((c) => SUP_DIGIT[c]).join(''));
const supNum = (n) => String(n).replace(/[-+0-9]/g, (c) => SUP[c]);
// Wykładnik do wyświetlenia: całkowity jako indeks górny (m²), ułamkowy jako ^0,5 (nie „m⁰.⁵”)
const expText = (e) => (Number.isInteger(e) ? supNum(e) : '^' + String(e).replace('.', ','));

const uMul = (a, b, sg = 1) => {
  const r = { ...a };
  for (const [k, e] of Object.entries(b)) {
    const v = (r[k] || 0) + sg * e;
    if (Math.abs(v) > 1e-9) r[k] = v;
    else delete r[k];
  }
  return r;
};

const uPow = (u, n) => {
  const r = {};
  for (const [k, e] of Object.entries(u)) {
    const v = e * n;
    if (Math.abs(v - Math.round(v * 2) / 2) > 1e-9) throw err('Nie da się podnieść jednostki do takiej potęgi');
    if (Math.abs(v) > 1e-9) r[k] = Math.round(v * 1e6) / 1e6;
  }
  return r;
};

const uNone = (u) => !u || Object.keys(u).length === 0;
const uEq = (a, b) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if (Math.abs(((a && a[k]) || 0) - ((b && b[k]) || 0)) > 1e-9) return false;
  }
  return true;
};

const DERIVED = dict({
  N: 'kg*m/s^2', J: 'N*m', W: 'J/s', Pa: 'N/m^2', C: 'A*s', V: 'W/A',
  'Ω': 'V/A', S: 'A/V', F: 'C/V', Wb: 'V*s', T: 'Wb/m^2', H: 'Wb/A',
  Hz: '1/s', Bq: '1/s', Gy: 'J/kg', Sv: 'J/kg', rad: '1', sr: '1',
  VA: 'V*A', ohm: 'V/A', Ohm: 'V/A'            // woltoamper; om bez znaku Ω (4,7 kohm)
});

const EXTRA = dict({
  g: ['kg', 1e-3], t: ['kg', 1e3], L: ['m^3', 1e-3], l: ['m^3', 1e-3],
  min: ['s', 60], h: ['s', 3600], godz: ['s', 3600], d: ['s', 86400],
  ha: ['m^2', 1e4], bar: ['Pa', 1e5], atm: ['Pa', 101325], mmHg: ['Pa', 133.322],
  eV: ['J', 1.602176634e-19], u: ['kg', 1.66053906660e-27], au: ['m', 1.495978707e11],
  ly: ['m', 9.4607304725808e15], pc: ['m', 3.0856775814914e16],
  kmh: ['m/s', 1 / 3.6], Wh: ['J', 3600], kWh: ['J', 3.6e6], MWh: ['J', 3.6e9],
  Ah: ['A*s', 3600], cal: ['J', 4.1868]        // mAh (akumulatory), kcal
});

const PREFIX = dict({
  Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 10,
  d: 1e-1, c: 1e-2, m: 1e-3, µ: 1e-6, μ: 1e-6, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18   // u = µ z klawiatury (4,7 uF)
});

// Symbol bez przedrostka (m, kg, N, h, eV…) → { u, f } albo null
const plainCache = new Map();
function plainUnit(name) {
  if (plainCache.has(name)) return plainCache.get(name);
  let r = null;
  if (BASE.includes(name)) r = { u: { [name]: 1 }, f: 1 };
  else if (has(DERIVED, name)) r = parseUnit(DERIVED[name]);
  else if (has(EXTRA, name)) {
    const [str, f] = EXTRA[name];
    const p = parseUnit(str);
    r = { u: p.u, f: p.f * f };
  }
  plainCache.set(name, r);
  return r;
}

// Symbol z co najwyżej jednym przedrostkiem SI (km, µF, hPa, kWh) → { u, f } albo null.
// Jeden przedrostek: „kcal” to kilokaloria, a nie kilo·centy·atto·litr; „kg” już ma przedrostek.
function unitOf(name) {
  const direct = plainUnit(name);
  if (direct) return direct;
  for (const p of ['da', name[0]]) {
    if (name.length <= p.length || !name.startsWith(p) || !has(PREFIX, p)) continue;
    const rest = name.slice(p.length);
    if (rest === 'kg') continue;
    const inner = plainUnit(rest);
    if (inner) return { u: inner.u, f: inner.f * PREFIX[p] };
  }
  return null;
}

// Napis jednostki z tabel i stałych: „kg*m/s^2”, „N·m²/kg²”, „J/(mol·K)”, „1/mol”, „1”
function parseUnit(str) {
  if (str.trim() === '1') return { u: {}, f: 1 };
  const r = scanUnit(str, 0, null);
  if (!r || str.slice(r.end).trim()) throw err(`Zła jednostka: ${str}`);
  return r;
}

// ---- Czytanie jednostki z tekstu ----
const WS = /\s/;
const skipWs = (s, j) => { while (j < s.length && WS.test(s[j])) j++; return j; };
const UNIT_OPS = '*·⋅∙/';
const SYM_RE = /^[A-Za-zΩµμ]+/;
const ID_START = /[A-Za-z_\u0370-\u03FF]/;
const ID_RE = /^[A-Za-z_\u0370-\u03FF][A-Za-z0-9_\u0370-\u03BF\u03C1-\u03FF]*/;
const EXP_RE = /^\^(?:\(([+-]?\d+(?:[.,]\d+)?)\)|([+-]?\d+(?:[.,]\d+)?))/;   // ^2, ^-1, ^(-2), ^0,5

// Wykładnik jednostki zaraz za symbolem → { e, len } albo null
function readExp(src, j) {
  const rest = src.slice(j);
  const m = EXP_RE.exec(rest);
  if (m) return { e: parseFloat((m[1] ?? m[2]).replace(',', '.')), len: m[0].length };
  const s = SUP_RUN.exec(rest);
  if (s) return { e: supToNum(s[0]), len: s[0].length };
  return null;
}

const NOTE_G = '„g” to przyspieszenie ziemskie, nie gram (masę wpisz w kg, np. 0,25 kg)';

// Czy symbol w miejscu jednostki jest jednak nazwą (stałą, zmienną, funkcją)? Tylko dla tekstu użytkownika.
// Zasada: po liczbie litery to jednostka („10 m”, „20 m/s”), także gdy istnieje zmienna o tej nazwie –
// wyjątek: pierwszy symbol sklejony z liczbą („3m”, „2h/g”) jest zmienną. Każda kolizja daje notkę.
function isNameHere(src, j, sym, word, first, glued, ctx, notes) {
  const { vars } = ctx;
  if (word !== sym) {                                   // nazwa z cyframi lub _: T0, mu0, v1, m_e
    const known = word === 'ans' || has(vars, word) || has(CONST, word) || has(FUNCS, word);
    if (!known) return false;
    const d = word.slice(sym.length);
    if (has(vars, word) && /^[1-9]$/.test(d) && unitOf(sym)) notes.push(`„${word}” to tu zmienna, nie jednostka ${sym}${supNum(d)} (jednostka: ${sym}^${d})`);
    return true;
  }
  if (sym === 'ans') return true;
  if (sym === 'g') {                                    // samo g = przyspieszenie ziemskie (mg, kg działają)
    if (first && !has(vars, 'g')) notes.push(NOTE_G);
    return true;
  }
  if (has(FUNCS, sym) && src[j + sym.length] === '(') return true;   // min( = funkcja, 60 min = minuty
  if (has(CONST, sym) && !plainUnit(sym)) return true;             // MS, MK, hbar, cl – stała, nie jednostka z przedrostkiem
  if (has(vars, sym) && unitOf(sym)) {
    if (first && glued) {
      notes.push(`„${sym}” to tu zmienna ${sym}, nie jednostka (jednostka: liczba, spacja, ${sym})`);
      return true;
    }
    notes.push(`„${sym}” to tu jednostka, nie zmienna ${sym} (zmienna: 2*${sym})`);
  }
  return false;
}

// Jeden składnik: symbol z wykładnikiem (m, km, s², m^-1, mm2 = mm²) albo nawias „(kg·K)”
function unitTerm(src, j, ctx, first, glued, notes) {
  if (src[j] === '(') return first ? null : unitGroup(src, j, ctx, notes);
  const m = SYM_RE.exec(src.slice(j));
  if (!m) return null;
  const sym = m[0];
  const word = ID_RE.exec(src.slice(j))?.[0] ?? sym;
  if (ctx && isNameHere(src, j, sym, word, first, glued, ctx, notes)) return null;
  const part = unitOf(sym);
  if (!part) return null;
  let k = j + sym.length, e = 1;
  const x = readExp(src, k);
  if (x) { e = x.e; k += x.len; }
  else if (word.length === sym.length + 1 && /[1-9]/.test(word[sym.length])) { e = +word[sym.length]; k++; }   // m2, s2, mm2
  return { u: uPow(part.u, e), f: Math.pow(part.f, e), num: [{ sym, e }], den: [], end: k };
}

function unitGroup(src, j, ctx, notes) {
  const inner = [];                                     // notki z nieudanej próby przepadają
  const g = unitChain(src, skipWs(src, j + 1), ctx, false, inner);
  if (!g) return null;
  let k = skipWs(src, g.end);
  if (src[k] !== ')') return null;
  k++;
  let e = 1;
  const x = readExp(src, k);
  if (x) { e = x.e; k += x.len; }
  notes.push(...inner);
  const pow = (list) => list.map((t) => ({ sym: t.sym, e: t.e * e }));
  return { u: uPow(g.u, e), f: Math.pow(g.f, e), num: pow(g.num), den: pow(g.den), end: k };
}

// Ciąg składników połączonych * · / (albo zaczynający się od „1/”). Operator, za którym nie stoi
// jednostka, zostaje w wyrażeniu: „100 N / g” to 100 N podzielone przez g.
function unitChain(src, j, ctx, glued, notes) {
  const acc = { u: {}, f: 1, num: [], den: [], end: j };
  let op = '*', n = 0;
  const one = /^1\s*\/\s*/.exec(src.slice(j));          // „1/mol”, „1/(m·s)”
  if (one) { op = '/'; j += one[0].length; }
  for (;;) {
    const lead = n === 0 && !one;
    const t = unitTerm(src, j, ctx, lead, glued && lead, notes);
    if (!t) break;
    const div = op === '/';
    acc.u = uMul(acc.u, t.u, div ? -1 : 1);
    acc.f = div ? acc.f / t.f : acc.f * t.f;
    acc.num.push(...(div ? t.den : t.num));
    acc.den.push(...(div ? t.num : t.den));
    n++;
    acc.end = j = t.end;
    const k = skipWs(src, j);
    if (!src[k] || !UNIT_OPS.includes(src[k])) break;
    op = src[k] === '/' ? '/' : '*';
    j = skipWs(src, k + 1);
  }
  return n ? acc : null;
}

// Zapis jednostki w jednej postaci: licznik·licznik/(mianownik·mianownik)
const termRaw = (t) => t.sym + (t.e === 1 ? '' : '^' + t.e);
function rawOf(num, den) {
  const top = num.length ? num.map(termRaw).join('·') : '1';
  if (!den.length) return top;
  return top + '/' + (den.length > 1 ? '(' + den.map(termRaw).join('·') + ')' : termRaw(den[0]));
}

// Jednostka od pozycji i → { u, f, raw, end } albo null.
// ctx = null: napisy z tabel; ctx = { vars, notes }: tekst użytkownika (nazwy, zmienne, notki).
function scanUnit(src, i, ctx) {
  const start = skipWs(src, i);
  const notes = [];
  const r = unitChain(src, start, ctx, start === i, notes);
  if (ctx) for (const n of notes) ctx.notes.add(n);
  return r ? { u: r.u, f: r.f, raw: rawOf(r.num, r.den), end: r.end } : null;
}

function uSplit(u, part) {
  const keys = Object.keys(u || {}).filter((k) => Math.abs(u[k]) > 1e-9).sort((a, b) => BASE.indexOf(a) - BASE.indexOf(b));
  return {
    top: keys.filter((k) => u[k] > 0).map((k) => part(k, u[k])),
    bot: keys.filter((k) => u[k] < 0).map((k) => part(k, -u[k]))
  };
}

function uText(u) {
  const { top, bot } = uSplit(u, (k, e) => k + (e === 1 ? '' : expText(e)));
  if (!top.length && !bot.length) return '';
  if (!bot.length) return top.join('·');
  const den = bot.length > 1 ? `(${bot.join('·')})` : bot[0];
  return `${top.length ? top.join('·') : '1'}/${den}`;
}

function uTex(u) {
  const { top, bot } = uSplit(u, (k, e) =>
    e === 1 ? `\\text{${k}}` : e === 0.5 ? `\\sqrt{\\text{${k}}}` : `\\text{${k}}^{${e}}`);
  if (!top.length && !bot.length) return '';
  if (!bot.length) return top.join(' \\cdot ');
  const num = top.length ? top.join(' \\cdot ') : '1';
  const den = bot.join(' \\cdot ');
  return `\\frac{${num}}{${den}}`;
}

// Zapis jednostki (z rawOf() albo z tablicy stałych) w TeX-u. Ma najwyżej jedno „/”, mianownik bywa
// w nawiasie: „N·m²/kg²” → \frac{N·m^2}{kg^2}, „J/(mol·K)”, „1/mol”
function rawToTex(raw) {
  const product = (s) => s.replace(/^\(|\)$/g, '').split(/[*·]/).map((t) => {
    const [, sym, e] = /^(.*?)(?:\^(.+))?$/.exec(t.trim());
    return /^\d+$/.test(sym) ? sym : `\\text{${sym}}` + (e ? `^{${e}}` : '');
  }).join(' \\cdot ');
  const [num, den] = raw.replace(SUP_ANY, (m) => '^' + supToNum(m)).split('/');
  return den === undefined ? product(num) : `\\frac{${product(num)}}{${product(den)}}`;
}

// Zapis jednostki w śladzie obliczeń: m^2 → m², s^-1 → s⁻¹, m^0.5 → m^0,5
const rawText = (raw) => raw.replace(/\^(-?\d+)(?![\d.])/g, (_, e) => supNum(e)).replace(/\^(-?\d+)\.(\d+)/g, '^$1,$2');

const NAMED_PAIRS = [
  ['N', 'kg*m/s^2'], ['J', 'kg*m^2/s^2'], ['W', 'kg*m^2/s^3'], ['Pa', 'kg/(m*s^2)'],
  ['C', 'A*s'], ['V', 'kg*m^2/(s^3*A)'], ['Ω', 'kg*m^2/(s^3*A^2)'], ['F', 's^4*A^2/(kg*m^2)'],
  ['T', 'kg/(s^2*A)'], ['Wb', 'kg*m^2/(s^2*A)'], ['H', 'kg*m^2/(s^2*A^2)'], ['S', 's^3*A^2/(kg*m^2)'],
  ['Hz', '1/s']
].map(([n, d]) => [n, parseUnit(d).u]);

const uName = (u) => {
  if (!u || uNone(u)) return null;
  const match = NAMED_PAIRS.find(([, d]) => uEq(d, u));
  return match ? match[0] : null;
};

export const unitLabel = (u) => uName(u) || uText(u);   // to, co widać przy wyniku: N, m/s², 1/mol

// Jednostka do wstawienia w pole działania – zawsze da się ją odczytać z powrotem (m^3/(kg*s^2), 1/mol)
const uInline = (u) => {
  if (!u || uNone(u)) return '';
  const name = uName(u);
  if (name) return name;
  return uText(u).replace(SUP_ANY, (s) => '^' + supToNum(s)).replace(/·/g, '*');
};

// ================= Stałe =================
export const CONSTS = [
  ['c', 'c', 'prędkość światła w próżni', 299792458, 'm/s', 'Podstawowe'],
  ['G', 'G', 'stała grawitacji', 6.67430e-11, 'N·m²/kg²', 'Podstawowe'],
  ['h', 'h', 'stała Plancka', 6.62607015e-34, 'J·s', 'Podstawowe'],
  ['hbar', 'ħ', 'zredukowana stała Plancka (h/2π)', 1.054571817e-34, 'J·s', 'Podstawowe', ['ħ']],
  ['qe', 'e', 'ładunek elementarny', 1.602176634e-19, 'C', 'Podstawowe', ['q_e']],
  ['kB', 'k<sub>B</sub>', 'stała Boltzmanna', 1.380649e-23, 'J/K', 'Podstawowe', ['k_B']],
  ['NA', 'N<sub>A</sub>', 'liczba Avogadra', 6.02214076e23, '1/mol', 'Podstawowe', ['N_A']],
  ['R', 'R', 'uniwersalna stała gazowa', 8.314462618, 'J/(mol·K)', 'Podstawowe'],

  ['g', 'g', 'przyspieszenie ziemskie (szkolne)', 9.81, 'm/s²', 'Mechanika'],
  ['gn', 'g<sub>n</sub>', 'przyspieszenie ziemskie normalne', 9.80665, 'm/s²', 'Mechanika', ['g_n']],
  ['vdz', 'v<sub>dź</sub>', 'prędkość dźwięku w powietrzu (≈20 °C)', 343, 'm/s', 'Mechanika', ['v_dz']],
  ['rhow', 'ρ<sub>w</sub>', 'gęstość wody', 1000, 'kg/m³', 'Mechanika', ['rho_w']],
  ['rhop', 'ρ<sub>p</sub>', 'gęstość powietrza (0 °C, 1 atm)', 1.29, 'kg/m³', 'Mechanika', ['rho_p']],
  ['rholod', 'ρ<sub>lodu</sub>', 'gęstość lodu', 917, 'kg/m³', 'Mechanika'],
  ['rhoHg', 'ρ<sub>Hg</sub>', 'gęstość rtęci', 13550, 'kg/m³', 'Mechanika'],
  ['rhoFe', 'ρ<sub>Fe</sub>', 'gęstość żelaza', 7860, 'kg/m³', 'Mechanika'],
  ['rhoAlu', 'ρ<sub>Al</sub>', 'gęstość aluminium', 2700, 'kg/m³', 'Mechanika'],

  ['muB', 'μ<sub>B</sub>', 'magneton Bohra', 9.2740100783e-24, 'J/T', 'Elektryczność i magnetyzm', ['μB']],
  ['rhoCu', 'ρ<sub>Cu</sub>', 'opór właściwy miedzi (20 °C)', 1.68e-8, 'Ω·m', 'Elektryczność i magnetyzm'],
  ['rhoAl', 'ρ<sub>Al</sub>', 'opór właściwy aluminium (20 °C)', 2.65e-8, 'Ω·m', 'Elektryczność i magnetyzm'],
  ['k', 'k', 'stała Coulomba 1/(4πε₀)', 8.9875517923e9, 'N·m²/C²', 'Elektryczność i magnetyzm'],

  ['eps0', 'ε<sub>0</sub>', 'przenikalność elektryczna próżni', 8.8541878128e-12, 'F/m', 'Elektryczność i magnetyzm', ['ε0', 'ε_0']],
  ['mu0', 'μ<sub>0</sub>', 'przenikalność magnetyczna próżni', 1.25663706212e-6, 'N/A²', 'Elektryczność i magnetyzm', ['μ0', 'μ_0']],

  ['T0', 'T<sub>0</sub>', 'temperatura 0 °C', 273.15, 'K', 'Termodynamika', ['T_0']],
  ['p0', 'p<sub>0</sub>', 'ciśnienie normalne', 101325, 'Pa', 'Termodynamika', ['p_0']],
  ['cw', 'c<sub>w</sub>', 'ciepło właściwe wody', 4190, 'J/(kg·K)', 'Termodynamika', ['c_w']],
  ['cl', 'c<sub>l</sub>', 'ciepło właściwe lodu', 2100, 'J/(kg·K)', 'Termodynamika', ['c_l']],
  ['ctw', 'c<sub>t,w</sub>', 'ciepło topnienia lodu', 333700, 'J/kg', 'Termodynamika', ['c_tw']],
  ['cpar', 'c<sub>p,w</sub>', 'ciepło parowania wody (100 °C)', 2257000, 'J/kg', 'Termodynamika', ['c_par']],
  ['sigma', 'σ', 'stała Stefana-Boltzmanna', 5.670374419e-8, 'W/(m²·K⁴)', 'Termodynamika'],
  ['bWien', 'b', 'stała Wiena', 2.897771955e-3, 'm·K', 'Termodynamika', ['b_Wien']],

  ['me', 'm<sub>e</sub>', 'masa spoczynkowa elektronu', 9.1093837015e-31, 'kg', 'Atom i kwanty', ['m_e']],
  ['mp', 'm<sub>p</sub>', 'masa spoczynkowa protonu', 1.67262192369e-27, 'kg', 'Atom i kwanty', ['m_p']],
  ['mn', 'm<sub>n</sub>', 'masa spoczynkowa neutronu', 1.67492749804e-27, 'kg', 'Atom i kwanty', ['m_n']],
  ['u', 'u', 'unifikowana jednostka masy atomowej', 1.66053906660e-27, 'kg', 'Atom i kwanty'],
  ['a0', 'a<sub>0</sub>', 'promień Bohra', 5.29177210903e-11, 'm', 'Atom i kwanty', ['a_0']],
  ['Rinf', 'R<sub>∞</sub>', 'stała Rydberga', 10973731.568160, '1/m', 'Atom i kwanty', ['R_inf']],

  ['MZ', 'M<sub>Z</sub>', 'masa Ziemi', 5.9722e24, 'kg', 'Astronomia', ['M_Z']],
  ['RZ', 'R<sub>Z</sub>', 'średni promień Ziemi', 6371000, 'm', 'Astronomia', ['R_Z']],
  ['MS', 'M<sub>S</sub>', 'masa Słońca', 1.9885e30, 'kg', 'Astronomia', ['M_S']],
  ['RS', 'R<sub>S</sub>', 'promień Słońca', 695700000, 'm', 'Astronomia', ['R_S']],
  ['MK', 'M<sub>K</sub>', 'masa Księżyca', 7.342e22, 'kg', 'Astronomia', ['M_K']],
  ['RK', 'R<sub>K</sub>', 'promień Księżyca', 1737400, 'm', 'Astronomia', ['R_K']],
  ['dZK', 'd<sub>ZK</sub>', 'średnia odległość Ziemia–Księżyc', 384400000, 'm', 'Astronomia', ['d_ZK']],
  ['au', 'au', 'jednostka astronomiczna (Ziemia–Słońce)', 149597870700, 'm', 'Astronomia'],
  ['ly', 'ly', 'rok świetlny', 9.4607304725808e15, 'm', 'Astronomia'],
  ['pc', 'pc', 'parsek', 3.0856775814914e16, 'm', 'Astronomia'],

  ['MMer', 'M<sub>Merkury</sub>', 'masa Merkurego', 3.301e+23, 'kg', 'Układ Słoneczny'],
  ['RMer', 'R<sub>Merkury</sub>', 'promień Merkurego', 2439700.0, 'm', 'Układ Słoneczny'],
  ['aMer', 'a<sub>Merkury</sub>', 'promień orbity Merkurego', 57910000000.0, 'm', 'Układ Słoneczny'],
  ['TMer', 'T<sub>Merkury</sub>', 'okres obiegu Merkurego', 7600500.0, 's', 'Układ Słoneczny'],
  ['MWen', 'M<sub>Wenus</sub>', 'masa Wenus', 4.867e+24, 'kg', 'Układ Słoneczny'],
  ['RWen', 'R<sub>Wenus</sub>', 'promień Wenus', 6051800.0, 'm', 'Układ Słoneczny'],
  ['aWen', 'a<sub>Wenus</sub>', 'promień orbity Wenus', 108210000000.0, 'm', 'Układ Słoneczny'],
  ['TWen', 'T<sub>Wenus</sub>', 'okres obiegu Wenus', 19414000.0, 's', 'Układ Słoneczny'],
  ['MMar', 'M<sub>Mars</sub>', 'masa Marsa', 6.417e+23, 'kg', 'Układ Słoneczny'],
  ['RMar', 'R<sub>Mars</sub>', 'promień Marsa', 3389500.0, 'm', 'Układ Słoneczny'],
  ['aMar', 'a<sub>Mars</sub>', 'promień orbity Marsa', 227920000000.0, 'm', 'Układ Słoneczny'],
  ['TMar', 'T<sub>Mars</sub>', 'okres obiegu Marsa', 59355000.0, 's', 'Układ Słoneczny'],
  ['MJow', 'M<sub>Jowisz</sub>', 'masa Jowisza', 1.898e+27, 'kg', 'Układ Słoneczny'],
  ['RJow', 'R<sub>Jowisz</sub>', 'promień Jowisza', 69911000.0, 'm', 'Układ Słoneczny'],
  ['aJow', 'a<sub>Jowisz</sub>', 'promień orbity Jowisza', 778500000000.0, 'm', 'Układ Słoneczny'],
  ['TJow', 'T<sub>Jowisz</sub>', 'okres obiegu Jowisza', 374350000.0, 's', 'Układ Słoneczny'],
  ['MSat', 'M<sub>Saturn</sub>', 'masa Saturna', 5.683e+26, 'kg', 'Układ Słoneczny'],
  ['RSat', 'R<sub>Saturn</sub>', 'promień Saturna', 58232000.0, 'm', 'Układ Słoneczny'],
  ['aSat', 'a<sub>Saturn</sub>', 'promień orbity Saturna', 1433500000000.0, 'm', 'Układ Słoneczny'],
  ['TSat', 'T<sub>Saturn</sub>', 'okres obiegu Saturna', 929290000.0, 's', 'Układ Słoneczny'],
  ['MUra', 'M<sub>Uran</sub>', 'masa Urana', 8.681e+25, 'kg', 'Układ Słoneczny'],
  ['RUra', 'R<sub>Uran</sub>', 'promień Urana', 25362000.0, 'm', 'Układ Słoneczny'],
  ['aUra', 'a<sub>Uran</sub>', 'promień orbity Urana', 2872500000000.0, 'm', 'Układ Słoneczny'],
  ['TUra', 'T<sub>Uran</sub>', 'okres obiegu Urana', 2651200000.0, 's', 'Układ Słoneczny'],
  ['MNep', 'M<sub>Neptun</sub>', 'masa Neptuna', 1.024e+26, 'kg', 'Układ Słoneczny'],
  ['RNep', 'R<sub>Neptun</sub>', 'promień Neptuna', 24622000.0, 'm', 'Układ Słoneczny'],
  ['aNep', 'a<sub>Neptun</sub>', 'promień orbity Neptuna', 4495100000000.0, 'm', 'Układ Słoneczny'],
  ['TNep', 'T<sub>Neptun</sub>', 'okres obiegu Neptuna', 5200400000.0, 's', 'Układ Słoneczny'],
  ['vZ', 'v<sub>Z</sub>', 'prędkość orbitalna Ziemi', 29780, 'm/s', 'Układ Słoneczny'],
  ['v1Z', 'v<sub>I</sub>', 'pierwsza prędkość kosmiczna', 7910, 'm/s', 'Układ Słoneczny'],
  ['v2Z', 'v<sub>II</sub>', 'druga prędkość kosmiczna (ucieczki)', 11186, 'm/s', 'Układ Słoneczny'],
  ['LS', 'L<sub>S</sub>', 'moc promieniowania Słońca', 3.828e26, 'W', 'Układ Słoneczny'],
  ['S0', 'S<sub>0</sub>', 'stała słoneczna (na orbicie Ziemi)', 1361, 'W/m²', 'Układ Słoneczny'],

  ['kWh', 'kWh', 'kilowatogodzina', 3.6e6, 'J', 'Przeliczniki'],
  ['cal', 'cal', 'kaloria', 4.1868, 'J', 'Przeliczniki'],
  ['bar', 'bar', 'bar', 1e5, 'Pa', 'Przeliczniki'],
  ['atm', 'atm', 'atmosfera', 101325, 'Pa', 'Przeliczniki'],
  ['mmHg', 'mmHg', 'milimetr słupa rtęci (tor)', 133.322, 'Pa', 'Przeliczniki'],
  ['kmh', 'km/h', 'kilometr na godzinę (72 kmh = 20 m/s)', 1 / 3.6, 'm/s', 'Przeliczniki'],
  ['KM', 'KM', 'koń mechaniczny', 735.49875, 'W', 'Przeliczniki'],

  ['pi', 'π', 'liczba pi', Math.PI, '', 'Matematyka', ['π']],
  ['e', 'e', 'liczba Eulera (podstawa ln)', Math.E, '', 'Matematyka'],
  ['phi', 'φ', 'złoty podział', (1 + Math.sqrt(5)) / 2, '', 'Matematyka', ['φ']],
];

export const CONST = Object.create(null);
for (const [id, sym, name, value, unit, group, aliases = []] of CONSTS) {
  const c = { id, sym, name, value, unit, group, u: unit ? parseUnit(unit).u : {} };
  CONST[id] = c;
  for (const a of aliases) CONST[a] = c;
}

// ================= Funkcje matematyczne =================
let angleMode = 'deg';                  // ustawiane w evaluate() na czas jednego obliczenia
const toRad = (x) => angleMode === 'deg' ? x * Math.PI / 180 : x;
const fromRad = (x) => angleMode === 'deg' ? x * 180 / Math.PI : x;
const clean = (x) => Math.abs(x) < 1e-14 ? 0 : x;
const inUnit = (x, f) => { if (x < -1 || x > 1) throw err(`${f}: argument musi być z przedziału [−1; 1]`); return x; };
const pos = (x, f) => { if (x <= 0) throw err(`${f}: argument musi być dodatni`); return x; };

const tg = (x) => { const r = toRad(x); if (Math.abs(Math.cos(r)) < 1e-12) throw err('tg nieokreślony dla tego kąta'); return clean(Math.tan(r)); };
const ctg = (x) => { const r = toRad(x); if (Math.abs(Math.sin(r)) < 1e-12) throw err('ctg nieokreślony dla tego kąta'); return clean(Math.cos(r) / Math.sin(r)); };

// Zaokrąglenie „jak na kalkulatorze”: połówki od zera (2,5 → 3, −2,5 → −3), a 1,005 → 1,01,
// chociaż w zapisie binarnym 1,005 to 1,00499… (poprawka o jeden najmniejszy krok liczby)
function roundTo(x, n = 0) {
  if (!Number.isInteger(n)) throw err('round: liczba miejsc musi być liczbą całkowitą');
  const a = Math.abs(x) * (1 + Number.EPSILON);
  const r = n >= 0 ? Math.round(a * 10 ** n) / 10 ** n : Math.round(a / 10 ** -n) * 10 ** -n;
  return Math.sign(x) * r;
}

const FUNCS = dict({
  sin: [1, 1, (x) => clean(Math.sin(toRad(x)))],
  cos: [1, 1, (x) => clean(Math.cos(toRad(x)))],
  tg: [1, 1, tg], tan: [1, 1, tg],
  ctg: [1, 1, ctg], cot: [1, 1, ctg],
  arcsin: [1, 1, (x) => fromRad(Math.asin(inUnit(x, 'arcsin')))],
  arccos: [1, 1, (x) => fromRad(Math.acos(inUnit(x, 'arccos')))],
  arctg: [1, 1, (x) => fromRad(Math.atan(x))],
  arcctg: [1, 1, (x) => fromRad(Math.PI / 2 - Math.atan(x))],
  sinh: [1, 1, Math.sinh], cosh: [1, 1, Math.cosh], tgh: [1, 1, Math.tanh], tanh: [1, 1, Math.tanh],
  sqrt: [1, 1, (x) => { if (x < 0) throw err('Pierwiastek z liczby ujemnej'); return Math.sqrt(x); }],
  cbrt: [1, 1, Math.cbrt],
  root: [2, 2, (x, n) => {
    if (n === 0) throw err('root: stopień nie może być 0');
    if (x < 0) { if (Number.isInteger(n) && n % 2) return -Math.pow(-x, 1 / n); throw err('Pierwiastek parzystego stopnia z liczby ujemnej'); }
    return Math.pow(x, 1 / n);
  }],
  ln: [1, 1, (x) => Math.log(pos(x, 'ln'))],
  log: [1, 2, (x, b) => b === undefined ? Math.log10(pos(x, 'log')) : Math.log(pos(x, 'log')) / Math.log(pos(b, 'log (podstawa)'))],
  log2: [1, 1, (x) => Math.log2(pos(x, 'log2'))],
  log10: [1, 1, (x) => Math.log10(pos(x, 'log10'))],   // bez tego log10(100) to log(10)·100 = 100
  exp: [1, 1, Math.exp],
  abs: [1, 1, Math.abs],
  round: [1, 2, roundTo],
  floor: [1, 1, Math.floor], ceil: [1, 1, Math.ceil],
  min: [1, 99, Math.min], max: [1, 99, Math.max],
  rad: [1, 1, (x) => x * Math.PI / 180],
  deg: [1, 1, (x) => x * 180 / Math.PI],
});
FUNCS['√'] = FUNCS.sqrt;

// ================= Tokenizer =================
// Liczba: 9,81 · 1,5e3 · ,5 · 384 400 · 6,626 070 15 (grupy po 3 cyfry oddzielone spacją, także twardą i wąską).
// Po przecinku grupy liczą się tylko wtedy, gdy pierwsza ma dokładnie 3 cyfry (zapis z tablic) – „2,5 3” to dalej 2,5·3.
const NUM_RE = /^(?:\d{1,3}(?:[ \u00a0\u2007\u2009\u202f]\d{3})+(?!\d)|\d+)(?:[.,]\d{3}(?:[ \u00a0\u2007\u2009\u202f]\d{3})*[ \u00a0\u2007\u2009\u202f]\d{1,3}(?!\d)|[.,]\d+)?(?:[eE][+-]?\d+)?|^[.,]\d+(?:[eE][+-]?\d+)?/;
const GROUP_SEP = /[ \u00a0\u2007\u2009\u202f]/g;
const OP_MAP = dict({ '×': '*', '·': '*', '⋅': '*', '∙': '*', '÷': '/', '−': '-', '–': '-', ';': ',' });
const OPS = '+-*/^()!%=,√°';

function tokenize(src, vars, notes) {
  const ctx = { vars, notes };
  const known = (n) => n === 'ans' || has(FUNCS, n) || has(CONST, n) || has(vars, n);
  const t = [];
  const isOp = (tok, v) => tok && tok.k === 'op' && tok.v === v;
  const isTen = (tok) => tok && tok.k === 'num' && tok.text === '10' && uNone(tok.u);
  // Wykładnik potęgi: 'sci' gdy podstawą jest 10 (6,67·10^-11 N·m²/kg²), 'pow' dla innej podstawy
  const powerCtx = () => {
    const [a, b, c] = [t[t.length - 1], t[t.length - 2], t[t.length - 3]];
    if (isOp(a, '^')) return isTen(b) ? 'sci' : 'pow';
    if ((isOp(a, '-') || isOp(a, '+')) && isOp(b, '^')) return isTen(c) ? 'sci' : 'pow';
    return null;
  };
  // Kąt w radianach (2 rad, 5 mrad) działa jak ° w drugą stronę: w trybie DEG przelicza się na stopnie
  const radOp = (raw) => { if (/^[^·/^]*rad$/.test(raw)) t.push({ k: 'op', v: 'rad' }); };
  // Jednostka za zapisem naukowym dotyczy całej liczby: (6,67·10⁻¹¹)·N·m²/kg²
  const unitToken = (i) => {
    const un = scanUnit(src, i, ctx);
    if (!un) return i;
    t.push({ k: 'unit', v: un.f, u: un.u, rawU: un.raw, uf: un.f });
    radOp(un.raw);
    return un.end;
  };
  const sciParens = [];                 // nawias otwarty zaraz po „10^”: 10^(-11) N
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (WS.test(ch)) { i++; continue; }
    const rest = src.slice(i);
    const num = /[0-9.,]/.test(ch) && NUM_RE.exec(rest);
    if (num) {
      const text = num[0];
      i += text.length;
      // „1.000.000” albo „max(1,2,3)” dałyby po cichu 1·0,000·0,000 = 0 i max(1,2·0,3)
      if (/^[.,]\d/.test(src.slice(i))) throw err('Dwa przecinki w jednej liczbie – tysiące oddzielaj spacją (1 000 000), argumenty średnikiem (max(1; 2; 3))');
      const v = parseFloat(text.replace(GROUP_SEP, '').replace(',', '.'));
      const tok = { k: 'num', v, u: {}, rawU: '', text };
      const pc = powerCtx();
      t.push(tok);
      if (pc === 'sci') { i = unitToken(i); continue; }
      if (pc === 'pow') continue;       // wykładnik to sama liczba: pi*r^2 h = π·r²·h
      const un = scanUnit(src, i, ctx);
      if (un) {
        Object.assign(tok, { v: v * un.f, u: un.u, rawU: un.raw, uf: un.f });
        i = un.end;
        radOp(un.raw);
      }
      continue;
    }
    if (ch === ',') throw err('Przecinek to część dziesiętna – argumenty oddzielaj średnikiem ;');
    if (/^°\s*[CF]\b/.test(rest)) throw err('°C i °F nie są obsługiwane – temperaturę podaj w kelwinach, np. 20 K + T0');
    const sup = SUP_RUN.exec(rest);     // x², 10⁻¹¹
    if (sup) {
      const e = supToNum(sup[0]);
      const sci = isTen(t[t.length - 1]);
      t.push({ k: 'op', v: '^' });
      if (e < 0) t.push({ k: 'op', v: '-' });
      t.push({ k: 'num', v: Math.abs(e), u: {}, rawU: '', text: String(Math.abs(e)) });
      i += sup[0].length;
      if (sci) i = unitToken(i);
      continue;
    }
    if (ch === 'π' || ch === 'ħ') { t.push({ k: 'id', v: ch }); i++; continue; }
    if (ID_START.test(ch)) {
      // sin30, ln2: sama nazwa funkcji, a liczbę (także 30,5) czyta gałąź liczb
      const m = ID_RE.exec(rest)[0];
      const fn = /^([A-Za-z]+)\d+$/.exec(m)?.[1];
      const name = !known(m) && has(FUNCS, fn) ? fn : m;
      t.push({ k: 'id', v: name });
      i += name.length; continue;
    }
    const op = OP_MAP[ch] || ch;
    if (OPS.includes(op)) {
      if (op === '(') sciParens.push(isOp(t[t.length - 1], '^') && isTen(t[t.length - 2]));
      t.push({ k: 'op', v: op });
      i++;
      if (op === ')' && sciParens.pop()) i = unitToken(i);
      continue;
    }
    throw err(`Nieznany znak: ${ch}`);
  }
  return t;
}

// ================= Parser =================
function parse(tokens, vars) {
  let p = 0;
  const peek = () => tokens[p];
  const isOpAt = (i, v) => tokens[i]?.k === 'op' && tokens[i].v === v;
  const isOp = (v) => isOpAt(p, v);
  const startsValue = (t) => t && (t.k === 'num' || t.k === 'unit' || t.k === 'id' || (t.k === 'op' && (t.v === '(' || t.v === '√')));

  function additive() {
    let n = term();
    while (isOp('+') || isOp('-')) { const o = tokens[p++].v; n = { t: 'bin', o, a: n, b: term() }; }
    return n;
  }
  function term() {
    let n = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const o = tokens[p++].v; n = { t: 'bin', o, a: n, b: unary() }; }
      else if (startsValue(peek())) n = { t: 'bin', o: '*', a: n, b: unary() };
      else return n;
    }
  }
  function unary() {
    if (isOp('-')) { p++; return { t: 'neg', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    if (isOp('√')) { p++; return { t: 'call', f: 'sqrt', args: [unary()] }; }
    return power();
  }
  function power() {
    const base = postfix();
    if (isOp('^')) { p++; return { t: 'bin', o: '^', a: base, b: unary() }; }
    return base;
  }
  function postfix() {
    let n = primary();
    for (;;) {
      if (isOp('!')) { p++; n = { t: 'fact', a: n }; }
      else if (isOp('%')) { p++; n = { t: 'pct', a: n }; }
      else if (isOp('°')) { p++; n = { t: 'deg', a: n }; }
      else if (isOp('rad')) { p++; n = { t: 'rad', a: n }; }
      else return n;
    }
  }
  function closeParen() {
    if (isOp(')')) { p++; return; }
    if (p < tokens.length) throw err('Brakuje nawiasu )');
  }
  function primary() {
    const tok = tokens[p++];
    if (!tok) throw err('Niedokończone wyrażenie');
    if (tok.k === 'num' || tok.k === 'unit') return { t: 'num', v: tok.v, u: tok.u, rawU: tok.rawU, uf: tok.uf ?? 1 };
    if (tok.k === 'op' && tok.v === '(') { const n = additive(); closeParen(); return n; }
    if (tok.k === 'id') {
      if (has(FUNCS, tok.v) && !has(vars, tok.v)) {
        if (isOp('(')) {
          p++;
          const args = [];
          if (!isOp(')')) { args.push(additive()); while (isOp(',')) { p++; args.push(additive()); } }
          closeParen();
          return { t: 'call', f: tok.v, args };
        }
        return { t: 'call', f: tok.v, args: [unary()] };
      }
      return { t: 'var', name: tok.v };
    }
    if (tok.k === 'op' && tok.v === ')') throw err(isOpAt(p - 2, '(') ? 'Puste nawiasy ()' : 'Nadmiarowy nawias )');
    throw err(`Nieoczekiwany znak: ${tok.v}`);
  }

  let assign = null;
  if (tokens[0]?.k === 'id' && isOpAt(1, '=')) {
    assign = tokens[0].v;
    if (has(FUNCS, assign)) throw err(`„${assign}” to nazwa funkcji – wybierz inną nazwę zmiennej`);
    if (assign === 'ans') throw err('„ans” jest zarezerwowane');
    p = 2;
  }
  if (p >= tokens.length) throw err('Puste wyrażenie');
  const tree = additive();
  if (p < tokens.length) {
    const v = tokens[p].v;
    if (v === '=') throw err('Przypisanie tylko na początku: nazwa = wyrażenie');
    if (v === ',') throw err('Średnik ; tylko między argumentami funkcji w nawiasie, np. root(8; 3). Ułamek dziesiętny pisz z przecinkiem: 9,81');
    if (v === ')') throw err('Nadmiarowy nawias )');
    throw err(`Nieoczekiwany znak: ${v}`);
  }
  return { assign, tree };
}

// ================= Obliczanie drzewa =================
const Q = (v, u = {}) => ({ v, u });
const U_KEEP = new Set(['abs', 'floor', 'ceil', 'min', 'max']);

function evaluateTree(n, vars, ans) {
  function evq(node) {
    switch (node.t) {
      case 'num': return Q(node.v, node.u || {});
      case 'var': {
        const name = node.name;
        if (has(vars, name)) return Q(vars[name].v, vars[name].u || {});
        if (name === 'ans') return Q(ans.v, ans.u || {});
        if (has(CONST, name)) return Q(CONST[name].value, CONST[name].u);
        if (unitOf(name)) throw err(`„${name}” to jednostka – pisz ją zaraz za liczbą, np. 5 ${name}`);
        throw err(`Nieznana nazwa: ${name}`);
      }
      case 'neg': { const a = evq(node.a); return Q(-a.v, a.u); }
      case 'pct': { const a = evq(node.a); return Q(a.v / 100, a.u); }
      case 'deg': {
        const a = evq(node.a);
        if (!uNone(a.u)) throw err('Znak ° stawiaj przy liczbie bez jednostki, np. sin(30°)');
        return Q(angleMode === 'deg' ? a.v : a.v * Math.PI / 180);
      }
      case 'rad': return Q(fromRad(evq(node.a).v));     // liczba z „rad” jest zawsze bez jednostki
      case 'fact': {
        const a = evq(node.a);
        if (!uNone(a.u)) throw err('Silnia działa tylko na liczbach bez jednostki');
        if (!Number.isInteger(a.v) || a.v < 0) throw err('Silnia tylko dla liczb całkowitych ≥ 0');
        if (a.v > 170) return Q(Infinity);
        let r = 1; for (let i = 2; i <= a.v; i++) r *= i; return Q(r);
      }
      case 'bin': {
        const a = evq(node.a), b = evq(node.b);
        switch (node.o) {
          case '+': case '-': {
            if (!uEq(a.u, b.u)) {
              const utA = uText(a.u) || 'bezwymiarowa';
              const utB = uText(b.u) || 'bezwymiarowa';
              throw err(`Nie można ${node.o === '+' ? 'dodać' : 'odjąć'} wielkości o różnych jednostkach: ${utA} i ${utB}`);
            }
            return Q(node.o === '+' ? a.v + b.v : a.v - b.v, a.u);
          }
          case '*': return Q(a.v * b.v, uMul(a.u, b.u, 1));
          case '/': {
            if (b.v === 0) throw err('Dzielenie przez zero');
            return Q(a.v / b.v, uMul(a.u, b.u, -1));
          }
          case '^': {
            if (!uNone(b.u)) throw err('Wykładnik potęgi nie może mieć jednostki');
            if (a.v < 0 && !Number.isInteger(b.v)) throw err('Potęga o niecałkowitym wykładniku z liczby ujemnej');
            return Q(Math.pow(a.v, b.v), uPow(a.u, b.v));
          }
        }
        break;
      }
      case 'call': {
        const [min, max, fn] = FUNCS[node.f];
        if (node.args.length < min || node.args.length > max) {
          throw err(min === max ? `${node.f}: potrzebne ${min} argument(y)` : `${node.f}: od ${min} do ${max} argumentów`);
        }
        const args = node.args.map(evq);
        if (node.f === 'round' && args[1] && !uNone(args[1].u)) throw err('round: liczba miejsc nie może mieć jednostki');
        const v = fn(...args.map((q) => q.v));
        if (node.f === 'sqrt') return Q(v, uPow(args[0].u, 0.5));
        if (node.f === 'cbrt') return Q(v, uPow(args[0].u, 1 / 3));
        if (node.f === 'root') {
          if (!uNone(args[1].u)) throw err('Stopień pierwiastka nie może mieć jednostki');
          return Q(v, uPow(args[0].u, 1 / args[1].v));
        }
        if (node.f === 'round') return Q(v, args[0].u);   // jednostkę ma tylko liczba, nie liczba miejsc
        if (U_KEEP.has(node.f)) {
          const u = args[0].u;
          if (!args.every((q) => uEq(q.u, u))) throw err(`${node.f}: argumenty muszą mieć tę samą jednostkę`);
          return Q(v, u);
        }
        const bad = args.find((q) => !uNone(q.u));
        if (bad) throw err(`${node.f}: argument nie może mieć jednostki (${uText(bad.u)})`);
        return Q(v);
      }
    }
    throw err('Błąd wyrażenia');
  }

  return evq(n);
}

// ================= Druga linia: działania na jednostkach krok po kroku =================
// Każdy kawałek śladu: { text, tex, prec }. prec mówi, jak mocno kawałek się trzyma – słabszy od działania
// obok dostaje nawias: 1 suma/różnica, 2 iloczyn/iloraz (też N·m, m/s²), 3 potęga (m²), 9 symbol (m, km)
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
const OP_TEXT = { '+': ' + ', '-': ' − ', '*': ' · ', '/': ' / ' };
const OP_TEX = { '+': ' + ', '-': ' - ', '*': ' \\cdot ' };
const BARE = { text: '1', tex: '1', prec: 9, bare: true };     // liczba bez jednostki

// Jednostka liczby lub stałej: jej zapis (raw, np. „N·m²/kg²”), a gdy go nie ma – jednostka w SI
function unitPiece(raw, u) {
  const text = raw ? rawText(raw) : uText(u);
  return { text, tex: raw ? rawToTex(raw) : uTex(u), prec: /[·/]/.test(text) ? 2 : /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻^]/.test(text) ? 3 : 9 };
}

function unitLine(tree, vars, ans) {
  const evq = (node) => evaluateTree(node, vars, ans);
  const paren = (s, need) => (need ? { text: `(${s.text})`, tex: `\\left(${s.tex}\\right)` } : s);

  function walk(n) {
    switch (n.t) {
      case 'num': return uNone(n.u) ? BARE : unitPiece(n.rawU, n.u);
      case 'var': {
        const { u } = evq(n);
        if (uNone(u)) return BARE;
        const own = !has(vars, n.name) && has(CONST, n.name) && CONST[n.name].unit;   // stała: jej zapis z tablic
        return unitPiece(own, u);
      }
      case 'neg': case 'pct': case 'deg': case 'rad': return walk(n.a);
      case 'bin': {
        const a = walk(n.a);
        if (n.o === '^') {
          if (a.bare) return BARE;
          const e = evq(n.b).v, base = paren(a, a.prec <= 3);     // (m/s)², (N·m)², (m²)^0,5
          return { text: base.text + expText(e), tex: `${base.tex}^{${e}}`, prec: 3 };
        }
        const b = walk(n.b);
        if (a.bare && b.bare) return BARE;
        if (n.o === '*' && (a.bare || b.bare)) return a.bare ? b : a;   // liczba nic nie wnosi: „2 · m/s²” → „m/s²”
        if (n.o === '/' && b.bare) return a;
        const p = PREC[n.o];
        const l = paren(a, a.prec < p);
        const r = paren(b, b.prec < p || (b.prec === p && (n.o === '-' || n.o === '/')));   // m − (m − m), N / (m/s²)
        return { text: l.text + OP_TEXT[n.o] + r.text, tex: n.o === '/' ? `\\frac{${a.tex}}{${b.tex}}` : l.tex + OP_TEX[n.o] + r.tex, prec: p };
      }
      case 'call': {
        const one = n.f === 'round' || n.f === 'root';           // liczba miejsc i stopień pierwiastka nie mają jednostki
        const parts = (one ? n.args.slice(0, 1) : n.args).map(walk);
        if (parts.every((x) => x.bare)) return BARE;
        const text = parts.map((x) => x.text).join('; '), tex = parts.map((x) => x.tex).join(', ');
        const k = n.f === 'root' ? evq(n.args[1]).v : { sqrt: 2, cbrt: 3 }[n.f];   // stopień pierwiastka
        const sign = k && ({ 2: '√', 3: '∛', 4: '∜' }[k] || (Number.isInteger(k) && k > 0 && supNum(k) + '√'));
        if (sign) return { text: `${sign}(${text})`, tex: `\\sqrt${k === 2 ? '' : `[${k}]`}{${tex}}`, prec: 9 };
        return { text: `${n.f}(${text})`, tex: `\\operatorname{${n.f}}\\left(${tex}\\right)`, prec: 9 };
      }
    }
    return BARE;                                                 // silnia: tylko liczby bez jednostki
  }

  const w = walk(tree);
  if (w.bare) return null;
  const { u } = evq(tree), name = uName(u);
  const steps = [[w.text, w.tex], [uText(u) || '1', uTex(u) || '1']];
  if (name) steps.push([name, `\\text{${name}}`]);
  // bez powtórzeń: „1 / s” i „1/s” to ten sam krok
  const key = ([text]) => text.replace(/\s/g, '');
  const uniq = steps.filter((st, i) => steps.findIndex((o) => key(o) === key(st)) === i);
  if (uniq.length === 1) return null;
  return { text: uniq.map((st) => st[0]).join(' = '), tex: '\\displaystyle ' + uniq.map((st) => st[1]).join(' = ') };
}

// Niedomknięte „(” i nadmiarowe „)”
function parens(src) {
  let open = 0, extra = 0;
  for (const ch of src) {
    if (ch === '(') open++;
    else if (ch === ')') { open > 0 ? open-- : extra++; }
  }
  return { open, extra };
}

// „nazwa = ” na początku działania
const ASSIGN = /^\s*[A-Za-z_\u0370-\u03FF][A-Za-z0-9_\u0370-\u03FF]*\s*=\s*/;
export const stripAssign = (s) => s.replace(ASSIGN, '');

// Brakujące nawiasy: „(2+3” → „(2+3)”, „2+3)” → „(2+3)”, „x = 2+3)” → „x = (2+3)”
function balance(src) {
  const { open, extra } = parens(src);
  const at = extra ? (ASSIGN.exec(src)?.[0].length ?? 0) : 0;
  return src.slice(0, at) + '('.repeat(extra) + src.slice(at) + ')'.repeat(open);
}

// ================= Podpowiedź dokończenia =================
// Wyszarzony tekst za kursorem: reszta nazwy (funkcja z „(”, stała, zmienna, ans) albo brakujące nawiasy.
// complete('sq') → 'rt(', complete('2*rh') → 'ow', complete('sqrt(2*g*h') → ')'; nic do podpowiedzenia → ''
const NAME_AT_END = /[A-Za-z_\u0370-\u03FF][A-Za-z0-9_\u0370-\u03FF]*$/;
const ENDS_WITH_OPERATOR = /[-+*/^(=;,×÷−–·⋅∙√]\s*$/;
const MIN_PREFIX = 2;     // po jednej literze podpowiedzi byłoby za dużo (s → sin, sinh, sqrt, sigma…)

// Kandydaci w kolejności podpowiadania: zmienne użytkownika, ans, funkcje, stałe (w kolejności z tablicy)
const BUILTIN_NAMES = [
  ['ans', ''],
  ...Object.keys(FUNCS).filter((f) => f !== '√').map((f) => [f, '(']),
  ...CONSTS.flatMap(([id, , , , , , aliases = []]) => [id, ...aliases]).map((n) => [n, ''])
];
const names = (vars) => [...Object.keys(vars).map((n) => [n, '']), ...BUILTIN_NAMES];

export function complete(src, vars = {}) {
  if (!src.trim()) return '';
  const word = NAME_AT_END.exec(src)?.[0];
  if (word) {
    // litery zaraz za liczbą to jednostka (10 km/mi…) – tam nazw nie podpowiadamy
    const operand = src.slice(0, src.length - word.length).split(/[-+(=;,−–]/).pop();
    if (!/^\s*[\d.,][\d\s.,]*[A-Za-zΩµμ]/.test(operand + word)) {
      const all = names(vars);
      const exact = all.find(([n]) => n === word);
      if (exact?.[1]) return exact[1];                                  // sqrt → „(”
      if (!exact && word.length >= MIN_PREFIX) {
        const hit = all.find(([n]) => n.startsWith(word));
        if (hit) return hit[0].slice(word.length) + hit[1];              // funkcja: bez zamykania, argument dopiero będzie
      }
    }
  }
  if (ENDS_WITH_OPERATOR.test(src)) return '';                          // „sqrt(2*” – jeszcze nie ma czego zamykać
  return ')'.repeat(parens(src).open);
}

// ================= Formatowanie liczb =================
const NNBSP = '\u202f';

function group(intStr) {
  return intStr.length > 4 ? intStr.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP) : intStr;
}

function plainNum(numStr) {
  const neg = numStr.startsWith('-');
  const [i, d] = (neg ? numStr.slice(1) : numStr).split('.');
  return (neg ? '−' : '') + group(i) + (d === undefined ? '' : ',' + d);
}

export function fmt(x, sig = 'auto') {
  if (x === 0) return { html: '0', text: '0' };
  const digits = sig === 'auto' ? 10 : +sig;
  // Połówki od zera jak w round(): 2,675 przy 3 cyfrach → 2,68, chociaż w zapisie binarnym to 2,67499…
  const nx = Math.abs(x) < 1e308 ? x * (1 + Number.EPSILON) : x;   // przy samej górze zakresu byłoby Infinity
  // Mantysa i wykładnik już po zaokrągleniu (9,9999999999e5 → 1e6); bez dzielenia przez 10^e,
  // które dla bardzo małych liczb (< 1e-308) dawało „Infinity”
  const [mText, eText] = nx.toExponential(digits - 1).split('e');
  const e = +eText;
  if (e >= 6 || e <= -4) {
    const ms = sig === 'auto' ? String(+mText) : mText;
    return { html: `${plainNum(ms)} × 10<sup>${String(e).replace('-', '−')}</sup>`, text: `${ms.replace('.', ',')}e${e}` };
  }
  let str;
  if (sig === 'auto') str = String(+nx.toPrecision(12));
  else str = e >= digits - 1 ? String(+nx.toPrecision(digits)) : nx.toPrecision(digits);
  return { html: plainNum(str), text: str.replace('.', ',') };
}

export function toFraction(x, maxDen = 1000) {
  if (!Number.isFinite(x) || Number.isInteger(x) || Math.abs(x) >= 1e9) return null;
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, y = Math.abs(x);
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(y);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(Math.abs(x) - h1 / k1) <= 1e-12 * Math.max(1, Math.abs(x))) {
      return k1 === 1 ? null : { n: Math.sign(x) * h1, d: k1 };
    }
    const frac = y - a;
    if (frac < 1e-15) break;
    y = 1 / frac;
  }
  return null;
}

export const exactText = (x) => String(+x.toPrecision(15)).replace('.', ',');
// Wynik do wstawienia w pole działania i do schowka – oba da się wkleić z powrotem
export const insertText = (v, u) => { const s = uInline(u); return exactText(v) + (s ? ' ' + s : ''); };
export const copyText = (v, u) => { const s = unitLabel(u); return exactText(v) + (s ? ' ' + s : ''); };

// ================= Notki o prawdopodobnych pomyłkach =================
// round, floor i ceil działają na wartości w SI: round(1,5 cm; 1) zaokrągla 0,015 m, a nie 1,5 cm.
// sin(π/6) w trybie DEG to sinus z π/6 stopnia – prawie na pewno chodziło o radiany.
const ROUNDING = new Set(['round', 'floor', 'ceil']);
const TRIG = new Set(['sin', 'cos', 'tg', 'tan', 'ctg', 'cot']);
const children = (node) => [node.a, node.b, ...(node.args || [])].filter(Boolean);

// Pierwsza jednostka przeliczana na SI w poddrzewie (cm, km/h, h) albo null
function convertedUnit(node) {
  if (node.t === 'num') return Math.abs(node.uf - 1) > 1e-12 ? node.rawU : null;
  for (const child of children(node)) {
    const raw = convertedUnit(child);
    if (raw) return raw;
  }
  return null;
}

const hasPi = (node, vars) => (node.t === 'var' && (node.name === 'pi' || node.name === 'π') && !has(vars, node.name)) ||
  children(node).some((child) => hasPi(child, vars));

function treeNotes(node, vars, ans, notes) {
  const arg = node.t === 'call' && node.args[0];
  if (arg && ROUNDING.has(node.f)) {
    const raw = convertedUnit(arg);
    const u = raw && evaluateTree(arg, vars, ans).u;
    if (raw && !uNone(u)) notes.add(`${node.f} zaokrągla w jednostkach SI (${unitLabel(u)}), nie w ${rawText(raw)}`);
  }
  if (arg && TRIG.has(node.f) && angleMode === 'deg' && hasPi(arg, vars)) {
    notes.add(`Tryb DEG: ${node.f} liczy w stopniach, a π sugeruje radiany – przełącz na RAD`);
  }
  for (const child of children(node)) treeNotes(child, vars, ans, notes);
}

// ================= Wejście silnika =================
// evaluate('v = 72 km/h', { vars, ans, angle }) → { assign, v, u, src, units, notes }; błąd → CalcError.
// vars i ans: { v, u } – wartość w SI i jednostka
export function evaluate(raw, { vars = {}, ans = { v: 0, u: {} }, angle = 'deg' } = {}) {
  angleMode = angle === 'rad' ? 'rad' : 'deg';
  const src = balance(raw);
  const notes = new Set();
  // µ z polskiej klawiatury (AltGr+M, znak mikro U+00B5) czytamy jak greckie μ: μ0, μB, μF
  const { assign, tree } = parse(tokenize(src.replace(/µ/g, 'μ'), vars, notes), vars);
  const q = evaluateTree(tree, vars, ans);
  treeNotes(tree, vars, ans, notes);
  if (Number.isNaN(q.v)) throw err('Wynik nieokreślony');
  if (!Number.isFinite(q.v)) throw err('Wynik poza zakresem');
  return { assign, v: q.v, u: q.u, src, units: unitLine(tree, vars, ans), notes: [...notes] };
}
