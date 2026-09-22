// calc-engine.js – Czysty silnik obliczeniowy i redukcji jednostek fizycznych
// Działa bez DOM – w Node.js (testy regresyjne) oraz w przeglądarce (calc-app.js)

export class CalcError extends Error {}
const err = (m) => new CalcError(m);

// ================= Jednostki podstawowe i pochodne =================
export const BASE = ['kg', 'm', 's', 'A', 'K', 'mol', 'cd'];
export const SUP_DIGIT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
export const supNum = (n) => String(n).replace(/[-0-9]/g, (c) => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }[c]));

export const uMul = (a, b, sg = 1) => {
  const r = { ...a };
  for (const [k, e] of Object.entries(b || {})) {
    const v = (r[k] || 0) + sg * e;
    if (Math.abs(v) > 1e-9) r[k] = v;
    else delete r[k];
  }
  return r;
};

export const uPow = (u, n) => {
  const r = {};
  for (const [k, e] of Object.entries(u || {})) {
    const v = e * n;
    if (Math.abs(v - Math.round(v * 2) / 2) > 1e-9) throw err('Nie da się podnieść jednostki do takiej potęgi');
    if (Math.abs(v) > 1e-9) r[k] = Math.round(v * 1e6) / 1e6;
  }
  return r;
};

export const uNone = (u) => !u || Object.keys(u).length === 0;

export const uEq = (a, b) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if (Math.abs(((a && a[k]) || 0) - ((b && b[k]) || 0)) > 1e-9) return false;
  }
  return true;
};

export const DERIVED = {
  N: 'kg*m/s^2', J: 'N*m', W: 'J/s', Pa: 'N/m^2', C: 'A*s', V: 'W/A',
  'Ω': 'V/A', S: 'A/V', F: 'C/V', Wb: 'V*s', T: 'Wb/m^2', H: 'Wb/A',
  Hz: '1/s', Bq: '1/s', Gy: 'J/kg', Sv: 'J/kg', rad: '1', sr: '1'
};

export const EXTRA = {
  g: ['kg', 1e-3], t: ['kg', 1e3], L: ['m^3', 1e-3], l: ['m^3', 1e-3],
  min: ['s', 60], h: ['s', 3600], godz: ['s', 3600], d: ['s', 86400],
  ha: ['m^2', 1e4], bar: ['Pa', 1e5], atm: ['Pa', 101325],
  eV: ['J', 1.602176634e-19], u: ['kg', 1.66053906660e-27], au: ['m', 1.495978707e11],
  ly: ['m', 9.4607304725808e15], pc: ['m', 3.0856775814914e16],
  kmh: ['m/s', 1 / 3.6], Wh: ['J', 3600], kWh: ['J', 3.6e6], MWh: ['J', 3.6e9],
  cal: ['J', 4.184], kcal: ['J', 4184],
  uF: ['F', 1e-6], mAh: ['C', 3.6], kVA: ['W', 1000],
  deg: ['rad', Math.PI / 180], '°': ['rad', Math.PI / 180]
};

export const PREFIX = {
  Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 10,
  d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, µ: 1e-6, μ: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18
};

// ================= Stałe fizyczne =================
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
  ['clod', 'c<sub>lodu</sub>', 'ciepło właściwe lodu', 2100, 'J/(kg·K)', 'Termodynamika', ['c_lodu']],
  ['ctop', 'c<sub>top</sub>', 'ciepło topnienia lodu', 333700, 'J/kg', 'Termodynamika', ['c_top']],
  ['cpar', 'c<sub>par</sub>', 'ciepło parowania wody (100 °C)', 2257000, 'J/kg', 'Termodynamika', ['c_par']],

  ['MZ', 'M<sub>Z</sub>', 'masa Ziemi', 5.9722e24, 'kg', 'Astronomia', ['M_Z']],
  ['RZ', 'R<sub>Z</sub>', 'średni promień Ziemi', 6371000, 'm', 'Astronomia', ['R_Z']],
  ['MS', 'M<sub>☉</sub>', 'masa Słońca', 1.9885e30, 'kg', 'Astronomia', ['M_S', 'M_slonca']],
  ['RS', 'R<sub>☉</sub>', 'promień Słońca', 696340000, 'm', 'Astronomia', ['R_S']],
  ['MK', 'M<sub>K</sub>', 'masa Księżyca', 7.342e22, 'kg', 'Astronomia', ['M_K']],
  ['RK', 'R<sub>K</sub>', 'promień Księżyca', 1737400, 'm', 'Astronomia', ['R_K']],
  ['dZK', 'd<sub>Z-K</sub>', 'średnia odległość Ziemia–Księżyc', 384400000, 'm', 'Astronomia', ['d_ZK']],
  ['dZS', '1 au', 'średnia odległość Ziemia–Słońce', 149597870700, 'm', 'Astronomia', ['au', '1au']],

  ['me', 'm<sub>e</sub>', 'masa spoczynkowa elektronu', 9.1093837015e-31, 'kg', 'Fizyka atomowa'],
  ['mp', 'm<sub>p</sub>', 'masa spoczynkowa protonu', 1.67262192369e-27, 'kg', 'Fizyka atomowa'],
  ['mn', 'm<sub>n</sub>', 'masa spoczynkowa neutronu', 1.67492749804e-27, 'kg', 'Fizyka atomowa'],
  ['u_atomic', 'u', 'jednostka masy atomowej (dalton)', 1.66053906660e-27, 'kg', 'Fizyka atomowa', ['amu', 'Da']],
  ['a0', 'a<sub>0</sub>', 'promień Bohra', 5.29177210903e-11, 'm', 'Fizyka atomowa', ['a_0']],
  ['Rinf', 'R<sub>∞</sub>', 'stała Rydberga', 10973731.568160, '1/m', 'Fizyka atomowa', ['R_inf']],
  ['alpha', 'α', 'stała struktury subtelnej ≈ 1/137', 7.2973525693e-3, '', 'Fizyka atomowa', ['alfa']],
  ['sigmaSB', 'σ', 'stała Stefana-Boltzmanna', 5.670374419e-8, 'W/(m²·K⁴)', 'Fizyka atomowa', ['sigma_SB']]
];

export const CONST = Object.create(null);
CONST['pi'] = { name: 'pi', value: Math.PI, u: {}, unit: '' };
CONST['π'] = { name: 'π', value: Math.PI, u: {}, unit: '' };
CONST['e'] = { name: 'e', value: Math.E, u: {}, unit: '' };

export const CONST_NAMES = new Set(['pi', 'π', 'e']);

for (const [id, sym, name, val, unitStr, grp, aliases] of CONSTS) {
  let parsedU = {};
  if (unitStr) {
    try { parsedU = parseUnit(unitStr).u; } catch {}
  }
  const entry = { id, sym, name, value: val, unit: unitStr, u: parsedU, grp };
  CONST[id] = entry;
  CONST_NAMES.add(id);
  if (aliases) {
    for (const al of aliases) {
      CONST[al] = entry;
      CONST_NAMES.add(al);
    }
  }
}

// ================= Rozpoznawanie symbolu jednostki =================
export function symbolUnit(name) {
  if (name === '1') return { u: {}, f: 1 };
  if (BASE.includes(name)) return { u: { [name]: 1 }, f: 1 };
  if (name in DERIVED) return parseUnit(DERIVED[name]);
  if (name in EXTRA) {
    const [str, f] = EXTRA[name];
    const p = parseUnit(str);
    return { u: p.u, f: p.f * f };
  }
  // Pojedynczy przedrostek da (deka-)
  if (name.length > 2 && name.startsWith('da')) {
    const root = name.slice(2);
    if (BASE.includes(root) || root in DERIVED || root in EXTRA) {
      const inner = symbolUnit(root);
      return { u: inner.u, f: inner.f * 10 };
    }
  }
  // Pojedynczy przedrostek SI (1 litera)
  if (name.length > 1) {
    const p = name[0];
    if (p in PREFIX) {
      const root = name.slice(1);
      if (BASE.includes(root) || root in DERIVED || root in EXTRA) {
        const inner = symbolUnit(root);
        return { u: inner.u, f: inner.f * PREFIX[p] };
      }
    }
  }
  throw err(`Nieznana jednostka: ${name}`);
}

export function parseUnit(str) {
  const SUPS = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g;
  const src = str
    .replace(/·/g, '*')
    .replace(/⋅/g, '*')
    .replace(SUPS, (c) => (c === '⁻' ? '^-' : '^' + SUP_DIGIT[c]))
    .replace(/\^(-?)(\d)\^(\d)/g, '^$1$2$3');

  let i = 0;
  const skip = () => { while (src[i] === ' ') i++; };

  function atom() {
    skip();
    if (src[i] === '(') {
      i++;
      const r = expr();
      skip();
      if (src[i] === ')') i++;
      return r;
    }
    const m = /^[A-Za-zΩµμ°]+/.exec(src.slice(i));
    if (!m) {
      const n = /^\d+/.exec(src.slice(i));
      if (n) { i += n[0].length; return { u: {}, f: 1 }; }
      throw err(`Zła jednostka: ${str}`);
    }
    i += m[0].length;
    return symbolUnit(m[0]);
  }

  function term() {
    let r = atom();
    skip();
    if (src[i] === '^') {
      i++;
      const m = /^-?\d+(\.\d+)?/.exec(src.slice(i));
      if (!m) throw err(`Zła jednostka: ${str}`);
      i += m[0].length;
      const n = parseFloat(m[0]);
      r = { u: uPow(r.u, n), f: Math.pow(r.f, n) };
    }
    return r;
  }

  function expr() {
    let r = term();
    for (;;) {
      skip();
      const op = src[i];
      if (op !== '*' && op !== '/') return r;
      i++;
      const next = term();
      if (op === '*') {
        r = { u: uMul(r.u, next.u, 1), f: r.f * next.f };
      } else {
        r = { u: uMul(r.u, next.u, -1), f: r.f / next.f };
      }
    }
  }

  return expr();
}

// ================= Prezentacja jednostek (Tekst / TeX) =================
const fmtUnitPart = (k, e) => {
  if (e === 1) return k;
  if (e === 0.5) return `√${k}`;
  if (e === -0.5) return `√${k}`;
  if (e === 1 / 3 || Math.abs(e - 1 / 3) < 1e-6) return `∛${k}`;
  if (Number.isInteger(e)) return `${k}${supNum(Math.abs(e))}`;
  return `${k}^(${Math.abs(e)})`;
};

export const uText = (u) => {
  if (!u || uNone(u)) return '';
  const pos = [], neg = [];
  for (const k of BASE) {
    const e = u[k];
    if (!e) continue;
    if (e > 0) pos.push(fmtUnitPart(k, e));
    else neg.push(fmtUnitPart(k, -e));
  }
  for (const [k, e] of Object.entries(u)) {
    if (BASE.includes(k) || !e) continue;
    if (e > 0) pos.push(fmtUnitPart(k, e));
    else neg.push(fmtUnitPart(k, -e));
  }
  if (!pos.length && !neg.length) return '';
  if (!neg.length) return pos.join('·');
  if (!pos.length) return '1/' + (neg.length > 1 ? `(${neg.join('·')})` : neg[0]);
  return `${pos.join('·')}/${neg.length > 1 ? `(${neg.join('·')})` : neg[0]}`;
};

const fmtTexPart = (k, e) => {
  const sym = k === 'Ω' ? '\\Omega' : `\\text{${k}}`;
  if (e === 1) return sym;
  if (e === 0.5) return `\\sqrt{${sym}}`;
  if (Math.abs(e - 1 / 3) < 1e-6) return `\\sqrt[3]{${sym}}`;
  return `${sym}^{${e}}`;
};

export const uTex = (u) => {
  if (!u || uNone(u)) return '';
  const pos = [], neg = [];
  for (const k of BASE) {
    const e = u[k];
    if (!e) continue;
    if (e > 0) pos.push(fmtTexPart(k, e));
    else neg.push(fmtTexPart(k, -e));
  }
  for (const [k, e] of Object.entries(u)) {
    if (BASE.includes(k) || !e) continue;
    if (e > 0) pos.push(fmtTexPart(k, e));
    else neg.push(fmtTexPart(k, -e));
  }
  if (!pos.length && !neg.length) return '';
  const num = pos.length ? pos.join(' \\cdot ') : '1';
  if (!neg.length) return num;
  const den = neg.join(' \\cdot ');
  return `\\frac{${num}}{${den}}`;
};

export const NAMED_PAIRS = [
  ['N', 'kg*m/s^2'], ['J', 'kg*m^2/s^2'], ['W', 'kg*m^2/s^3'], ['Pa', 'kg/(m*s^2)'],
  ['C', 'A*s'], ['V', 'kg*m^2/(s^3*A)'], ['Ω', 'kg*m^2/(s^3*A^2)'], ['F', 's^4*A^2/(kg*m^2)'],
  ['T', 'kg/(s^2*A)'], ['Wb', 'kg*m^2/(s^2*A)'], ['H', 'kg*m^2/(s^2*A^2)'], ['S', 's^3*A^2/(kg*m^2)'],
  ['Hz', '1/s']
].map(([n, d]) => [n, parseUnit(d).u]);

export const uName = (u) => {
  if (!u || uNone(u)) return null;
  const match = NAMED_PAIRS.find(([, d]) => uEq(d, u));
  return match ? match[0] : null;
};

export const uInline = (u) => {
  if (!u || uNone(u)) return '';
  const name = uName(u);
  if (name) return name;
  return uText(u)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + [...m].map((c) => SUP_DIGIT[c]).join(''))
    .replace(/·/g, '*');
};

function formatProductTex(str) {
  if (!str) return '';
  const tokens = str.split(/[*·]/).map((t) => t.trim()).filter(Boolean);
  const parts = tokens.map((tok) => {
    if (tok.includes('Ω')) {
      return tok.replace(/Ω(?:\^(-?\d+(?:\.\d+)?))?/g, (_, exp) => '\\Omega' + (exp ? `^{${exp}}` : ''));
    }
    const m = /^([A-Za-zΩµμ°]+)(?:\^(-?\d+(?:\.\d+)?))?$/.exec(tok);
    if (m) {
      const u = m[1];
      const exp = m[2];
      return `\\text{${u}}` + (exp ? `^{${exp}}` : '');
    }
    if (/^\d+$/.test(tok)) return tok;
    return `\\text{${tok}}`;
  });
  return parts.join(' \\cdot ');
}

export function rawToTex(s) {
  if (!s) return '';
  let str = s.trim()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + [...m].map((c) => SUP_DIGIT[c]).join(''));
  const slashIdx = str.indexOf('/');
  if (slashIdx !== -1) {
    let num = str.slice(0, slashIdx).trim();
    let den = str.slice(slashIdx + 1).trim();
    if (den.startsWith('(') && den.endsWith(')')) den = den.slice(1, -1).trim();
    return `\\frac{${formatProductTex(num) || '1'}}{${formatProductTex(den) || '1'}}`;
  }
  return formatProductTex(str);
}

// ================= Kąty i funkcje matematyczne =================
let currentAngleMode = 'deg';
export function getAngleMode() { return currentAngleMode; }
export function setAngleMode(m) { currentAngleMode = (m === 'rad' ? 'rad' : 'deg'); }

const toRad = (x) => currentAngleMode === 'deg' ? x * Math.PI / 180 : x;
const fromRad = (x) => currentAngleMode === 'deg' ? x * 180 / Math.PI : x;
const clean = (x) => Math.abs(x) < 1e-14 ? 0 : x;
const inUnit = (x, f) => { if (x < -1 || x > 1) throw err(`${f}: argument musi być z przedziału [−1; 1]`); return x; };
const pos = (x, f) => { if (x <= 0) throw err(`${f}: argument musi być dodatni`); return x; };

// Zaokrąglenie symetryczne (half away from zero, jak Casio i Excel) z kompensacją float epsilon
export function roundHalfAway(x, n = 0) {
  const f = 10 ** n;
  const sign = Math.sign(x) || 1;
  const val = Math.abs(x) * f;
  return (sign * Math.round(val + 1e-12)) / f;
}

const tg = (x) => {
  const r = toRad(x);
  if (Math.abs(Math.cos(r)) < 1e-12) throw err('tg nieokreślony dla tego kąta');
  return clean(Math.tan(r));
};

const ctg = (x) => {
  const r = toRad(x);
  if (Math.abs(Math.sin(r)) < 1e-12) throw err('ctg nieokreślony dla tego kąta');
  return clean(Math.cos(r) / Math.sin(r));
};

export const FUNCS = Object.create(null);
Object.assign(FUNCS, {
  sin: [1, 1, (x) => clean(Math.sin(toRad(x)))],
  cos: [1, 1, (x) => clean(Math.cos(toRad(x)))],
  tg: [1, 1, tg], tan: [1, 1, tg],
  ctg: [1, 1, ctg], cot: [1, 1, ctg],
  asin: [1, 1, (x) => fromRad(Math.asin(inUnit(x, 'asin')))],
  arcsin: [1, 1, (x) => fromRad(Math.asin(inUnit(x, 'arcsin')))],
  acos: [1, 1, (x) => fromRad(Math.acos(inUnit(x, 'acos')))],
  arccos: [1, 1, (x) => fromRad(Math.acos(inUnit(x, 'arccos')))],
  atan: [1, 1, (x) => fromRad(Math.atan(x))],
  arctg: [1, 1, (x) => fromRad(Math.atan(x))],
  arcctg: [1, 1, (x) => fromRad(Math.PI / 2 - Math.atan(x))],
  sinh: [1, 1, Math.sinh], cosh: [1, 1, Math.cosh], tgh: [1, 1, Math.tanh], tanh: [1, 1, Math.tanh],
  sqrt: [1, 1, (x) => { if (x < 0) throw err('Pierwiastek z liczby ujemnej'); return Math.sqrt(x); }],
  cbrt: [1, 1, Math.cbrt],
  root: [2, 2, (x, n) => {
    if (n === 0) throw err('root: stopień nie może być 0');
    if (x < 0) {
      if (Number.isInteger(n) && n % 2) return -Math.pow(-x, 1 / n);
      throw err('Pierwiastek parzystego stopnia z liczby ujemnej');
    }
    return Math.pow(x, 1 / n);
  }],
  ln: [1, 1, (x) => Math.log(pos(x, 'ln'))],
  log: [1, 2, (x, b) => b === undefined ? Math.log10(pos(x, 'log')) : Math.log(pos(x, 'log')) / Math.log(pos(b, 'log (podstawa)'))],
  log2: [1, 1, (x) => Math.log2(pos(x, 'log2'))],
  exp: [1, 1, Math.exp],
  abs: [1, 1, Math.abs],
  round: [1, 2, roundHalfAway],
  floor: [1, 1, Math.floor], ceil: [1, 1, Math.ceil],
  min: [1, 99, Math.min], max: [1, 99, Math.max],
  rad: [1, 1, (x) => x * Math.PI / 180],
  deg: [1, 1, (x) => x * 180 / Math.PI],
});
FUNCS['√'] = FUNCS.sqrt;

// ================= Tokenizer & Parser =================
const ID_START = /[A-Za-z_\u0370-\u03FF\u0127]/;
const ID_RE = /^[A-Za-z_\u0370-\u03FF][A-Za-z0-9_\u0370-\u03BF\u03C1-\u03FF]*/;
const OP_MAP = { '×': '*', '·': '*', '⋅': '*', '÷': '/', '−': '-', '–': '-', ';': ',' };

export function createTokenizer(vars = {}, options = {}) {
  const notes = [];
  const known = (n) => n in FUNCS || n in CONST || Object.prototype.hasOwnProperty.call(vars, n) || n === 'ans';

  const isUserVar = (n) => Object.prototype.hasOwnProperty.call(vars, n);

  function isValidUnitAtom(sym) {
    if (sym === 'ans') return false;
    if (CONST_NAMES.has(sym)) return false;
    try { symbolUnit(sym); return true; } catch { return false; }
  }

  function readUnit(src, i, hadWhitespaceBefore) {
    const SYM = /^[A-Za-zΩµμ°]+/;
    let j = i, u = {}, f = 1, rawParts = [], first = true;
    while (j < src.length && src[j] === ' ') j++;

    for (;;) {
      let sign = 1;
      let savedJ = j;

      if (!first) {
        while (j < src.length && src[j] === ' ') j++;
        const op = src[j];
        if (op !== '*' && op !== '·' && op !== '⋅' && op !== '/') { j = savedJ; break; }

        const restAfterOp = src.slice(j + 1).replace(/^\s+/, '');
        if (!SYM.test(restAfterOp) && !restAfterOp.startsWith('(')) {
          j = savedJ;
          break;
        }

        // Obsługa jednostek w nawiasie w mianowniku, np. /(kg*s) lub /(kg·K)
        if (op === '/' && restAfterOp.startsWith('(')) {
          const closeIdx = restAfterOp.indexOf(')');
          if (closeIdx > 1) {
            const innerUnitStr = restAfterOp.slice(1, closeIdx);
            try {
              const parsed = parseUnit(innerUnitStr);
              u = uMul(u, parsed.u, -1);
              f = f / parsed.f;
              rawParts.push('/(' + innerUnitStr + ')');
              j = j + 1 + (src.slice(j + 1).indexOf('(')) + closeIdx + 1;
              first = false;
              continue;
            } catch {
              j = savedJ;
              break;
            }
          }
        }

        const symMatch = SYM.exec(restAfterOp);
        if (symMatch) {
          const nextSym = symMatch[0];
          if (!isValidUnitAtom(nextSym) || CONST_NAMES.has(nextSym) || (nextSym in FUNCS && restAfterOp[nextSym.length] === '(')) {
            j = savedJ;
            break;
          }
        }

        sign = op === '/' ? -1 : 1;
        j++;
        while (j < src.length && src[j] === ' ') j++;
      }

      const idMatch = ID_RE.exec(src.slice(j));
      if (idMatch) {
        const fullId = idMatch[0];
        if (CONST_NAMES.has(fullId)) break;
        if (first && isUserVar(fullId)) {
          if (!hadWhitespaceBefore) {
            notes.push(`Użyto zmiennej „${fullId}”. Wpisz spację (np. „... ${fullId}”), aby użyć jednostki.`);
            break;
          }
        }
        if (fullId in FUNCS && src[j + fullId.length] === '(') break;
      }

      const m = SYM.exec(src.slice(j));
      if (!m) break;
      const sym = m[0];

      if (sym === 'ans') break;
      if (CONST_NAMES.has(sym)) break;
      if (sym in FUNCS && src[j + sym.length] === '(') break;

      let part;
      try { part = symbolUnit(sym); } catch { break; }

      j += sym.length;

      let e = 1;
      const sup = /^(\^(-?\d+)|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+|([2-9]))/.exec(src.slice(j));
      if (sup) {
        if (sup[2] !== undefined) {
          e = parseInt(sup[2], 10);
        } else if (sup[3] !== undefined) {
          e = parseInt(sup[3], 10);
        } else {
          e = parseInt([...sup[0]].map((c) => SUP_DIGIT[c] || c).join(''), 10);
        }
        j += sup[0].length;
      }

      u = uMul(u, uPow(part.u, e), sign);
      f = sign > 0 ? f * Math.pow(part.f, e) : f / Math.pow(part.f, e);
      rawParts.push(sign < 0 ? `/${sym}${e !== 1 ? '^' + e : ''}` : `${first ? '' : '·'}${sym}${e !== 1 ? '^' + e : ''}`);
      first = false;
    }

    return first ? null : { u, f, raw: rawParts.join(''), end: j };
  }

  function tokenize(rawSrc) {
    const t = [];

    // Normalizacja zapisu naukowego z jednostką: 6,67·10^-11 N·m²/kg² -> 6,67e-11 N·m²/kg²
    let src = rawSrc
      .replace(/([0-9.,]+)\s*[·*×⋅]\s*10\^([+-]?\d+)/g, (m, g1, g2) => `${g1}e${g2}`)
      .replace(/([0-9.,]+)\s*[·*×⋅]\s*10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (m, g1, sups) => {
        const exp = [...sups].map((c) => SUP_DIGIT[c] || c).join('');
        return `${g1}e${exp}`;
      });

    let i = 0;
    const NUM_WITH_SPACES_RE = /^(\d{1,3}(?:[\s\u00A0\u202F]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][+-]?\d+)?/;

    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }

      const rest = src.slice(i);

      if (ch === '⋅') { t.push({ k: 'op', v: '*' }); i++; continue; }

      if (ch === '°') {
        t.push({ k: 'op', v: '*' }, { k: 'num', v: Math.PI / 180, u: {}, rawU: '' });
        i++;
        continue;
      }

      if (/[0-9.,]/.test(ch) && NUM_WITH_SPACES_RE.test(rest)) {
        const m = NUM_WITH_SPACES_RE.exec(rest)[0];
        i += m.length;
        const cleanNum = m.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.');
        const numVal = parseFloat(cleanNum);

        const hadSpace = (i < src.length && /\s/.test(src[i]));
        const un = readUnit(src, i, hadSpace);
        if (un) {
          t.push({ k: 'num', v: numVal * un.f, u: un.u, rawU: un.raw, origV: numVal });
          i = un.end;
        } else {
          t.push({ k: 'num', v: numVal, u: {}, rawU: '' });
        }
        continue;
      }

      if (ch === ',') throw err('Przecinek to część dziesiętna – argumenty oddzielaj średnikiem ;');
      if (ch === 'π' || ch === 'ħ') { t.push({ k: 'id', v: ch }); i++; continue; }

      if (ID_START.test(ch)) {
        const m = ID_RE.exec(rest)[0];
        const split = /^([A-Za-z]+)(\d+(?:[.,]\d+)?)$/.exec(m);
        if (!known(m) && split && split[1] in FUNCS) {
          t.push({ k: 'id', v: split[1] }, { k: 'num', v: parseFloat(split[2].replace(',', '.')), u: {}, rawU: '' });
        } else {
          t.push({ k: 'id', v: m });
        }
        i += m.length;
        continue;
      }

      if (ch === '²' || ch === '³') {
        t.push({ k: 'op', v: '^' }, { k: 'num', v: ch === '²' ? 2 : 3, u: {}, rawU: '' });
        i++;
        continue;
      }

      if (/^[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/.test(rest)) {
        const sm = /^[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/.exec(rest)[0];
        const expVal = parseInt([...sm].map((c) => SUP_DIGIT[c] || c).join(''), 10);
        t.push({ k: 'op', v: '^' }, { k: 'num', v: expVal, u: {}, rawU: '' });
        i += sm.length;
        continue;
      }

      const op = OP_MAP[ch] || ch;
      if ('+-*/^()!%=,√'.includes(op)) {
        t.push({ k: 'op', v: op });
        i++;
        continue;
      }

      throw err(`Nieznany znak: ${ch}`);
    }

    return { tokens: t, notes };
  }

  return { tokenize };
}

export function parse(tokenResult, vars = {}) {
  const tokens = Array.isArray(tokenResult) ? tokenResult : tokenResult.tokens;
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  let assign = null;
  if (tokens[0]?.k === 'id' && tokens[1]?.k === 'op' && tokens[1]?.v === '=') {
    assign = tokens[0].v;
    if (assign in FUNCS) throw err(`„${assign}” to nazwa funkcji – nie można jej nadpisać`);
    i = 2;
  }

  function primary() {
    const t = next();
    if (!t) throw err('Nieoczekiwany koniec wyrażenia');
    if (t.k === 'num') return { t: 'num', v: t.v, u: t.u, rawU: t.rawU, origV: t.origV };
    if (t.k === 'id') {
      if (peek()?.k === 'op' && peek()?.v === '(') {
        next();
        const args = [];
        if (peek()?.k !== 'op' || peek()?.v !== ')') {
          for (;;) {
            args.push(expr());
            if (peek()?.k === 'op' && peek()?.v === ',') { next(); continue; }
            break;
          }
        }
        if (next()?.v !== ')') throw err(`Brakujący nawias zamykający w ${t.v}(...)`);
        if (!(t.v in FUNCS)) throw err(`Nieznana funkcja: ${t.v}`);
        return { t: 'call', f: t.v, args };
      }
      return { t: 'var', name: t.v };
    }
    if (t.k === 'op') {
      if (t.v === '(') {
        const e = expr();
        if (next()?.v !== ')') throw err('Brakujący nawias zamykający „)”');
        return e;
      }
      if (t.v === '√') {
        const a = factor();
        return { t: 'call', f: 'sqrt', args: [a] };
      }
      if (t.v === '-') return { t: 'neg', a: factor() };
      if (t.v === '+') return factor();
    }
    throw err('Niepoprawne wyrażenie');
  }

  function postfix() {
    let node = primary();
    for (;;) {
      const p = peek();
      if (!p) break;
      if (p.k === 'op' && p.v === '!') { next(); node = { t: 'fact', a: node }; continue; }
      if (p.k === 'op' && p.v === '%') { next(); node = { t: 'pct', a: node }; continue; }
      break;
    }
    return node;
  }

  function factor() {
    let base = postfix();
    if (peek()?.k === 'op' && peek()?.v === '^') {
      next();
      const exp = unary();
      return { t: 'bin', o: '^', a: base, b: exp };
    }
    return base;
  }

  function unary() {
    const p = peek();
    if (p?.k === 'op' && (p.v === '-' || p.v === '+')) {
      next();
      const a = factor();
      return p.v === '-' ? { t: 'neg', a } : a;
    }
    return factor();
  }

  function implicit() {
    let node = factor();
    for (;;) {
      const p = peek();
      if (!p) break;
      if (p.k === 'num' || p.k === 'id' || (p.k === 'op' && (p.v === '(' || p.v === '√'))) {
        const right = factor();
        node = { t: 'bin', o: '*', a: node, b: right };
        continue;
      }
      break;
    }
    return node;
  }

  function term() {
    let node = implicit();
    for (;;) {
      const p = peek();
      if (p?.k === 'op' && (p.v === '*' || p.v === '/')) {
        next();
        const right = implicit();
        node = { t: 'bin', o: p.v, a: node, b: right };
        continue;
      }
      break;
    }
    return node;
  }

  function expr() {
    let node = term();
    for (;;) {
      const p = peek();
      if (p?.k === 'op' && (p.v === '+' || p.v === '-')) {
        next();
        const right = term();
        node = { t: 'bin', o: p.v, a: node, b: right };
        continue;
      }
      break;
    }
    return node;
  }

  const tree = expr();
  if (i < tokens.length) throw err('Nieoczekiwany znak na końcu wyrażenia');
  return { assign, tree };
}

// ================= Ewaluacja drzewa AST =================
const Q = (v, u = {}) => ({ v, u });
const U_KEEP = new Set(['abs', 'floor', 'ceil', 'round', 'min', 'max']);
const TRIG_FN = new Set(['sin', 'cos', 'tg', 'tan', 'ctg', 'cot']);

export function evaluateTree(n, vars = {}, ans = 0) {
  function evq(node) {
    switch (node.t) {
      case 'num': return Q(node.v, node.u || {});
      case 'var': {
        if (Object.prototype.hasOwnProperty.call(vars, node.name)) {
          const val = vars[node.name];
          return (typeof val === 'object' && val !== null && 'v' in val) ? val : Q(val, {});
        }
        if (node.name === 'ans') return (typeof ans === 'object' && ans !== null && 'v' in ans) ? ans : Q(ans, {});
        if (node.name in CONST) return Q(CONST[node.name].value, CONST[node.name].u);
        throw err(`Nieznana nazwa: ${node.name}`);
      }
      case 'neg': { const a = evq(node.a); return Q(-a.v, a.u); }
      case 'pct': { const a = evq(node.a); return Q(a.v / 100, a.u); }
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

        // Kąty w trygonometrii
        if (TRIG_FN.has(node.f)) {
          const firstArg = node.args[0];
          let radVal;
          if (firstArg && (firstArg.rawU === '°' || firstArg.rawU === 'deg')) {
            // Użytkownik jawnie wpisał stopnie: np. sin(30°)
            const degVal = firstArg.origV !== undefined ? firstArg.origV : firstArg.v;
            radVal = degVal * Math.PI / 180;
          } else {
            // Domyślnie wg trybu kalkulatora (DEG lub RAD)
            radVal = toRad(args[0].v);
          }
          const trigFns = {
            sin: (r) => clean(Math.sin(r)),
            cos: (r) => clean(Math.cos(r)),
            tg: (r) => { if (Math.abs(Math.cos(r)) < 1e-12) throw err('tg nieokreślony dla tego kąta'); return clean(Math.tan(r)); },
            tan: (r) => { if (Math.abs(Math.cos(r)) < 1e-12) throw err('tan nieokreślony dla tego kąta'); return clean(Math.tan(r)); },
            ctg: (r) => { if (Math.abs(Math.sin(r)) < 1e-12) throw err('ctg nieokreślony dla tego kąta'); return clean(Math.cos(r) / Math.sin(r)); },
            cot: (r) => { if (Math.abs(Math.sin(r)) < 1e-12) throw err('cot nieokreślony dla tego kąta'); return clean(Math.cos(r) / Math.sin(r)); }
          };
          return Q(trigFns[node.f](radVal));
        }

        const v = fn(...args.map((q) => q.v));

        if (node.f === 'sqrt') return Q(v, uPow(args[0].u, 0.5));
        if (node.f === 'cbrt') return Q(v, uPow(args[0].u, 1 / 3));
        if (node.f === 'root') {
          if (!uNone(args[1].u)) throw err('Stopień pierwiastka nie może mieć jednostki');
          return Q(v, uPow(args[0].u, 1 / args[1].v));
        }
        if (U_KEEP.has(node.f)) {
          const u = args[0].u;
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

// Druga linia: operacje na jednostkach krok po kroku
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };

export function createUnitLineEvaluator(vars = {}, ans = 0) {
  function evq(node) { return evaluateTree(node, vars, ans); }

  function unitWalk(n) {
    const plain = (u) => ({ text: '1', tex: '1', u, bare: true, prec: 9 });
    switch (n.t) {
      case 'num': {
        if (uNone(n.u)) return plain(n.u);
        let txt = uText(n.u);
        let tx = uTex(n.u);
        if (n.rawU) {
          txt = n.rawU.replace(/\^1\b/g, '').replace(/\^2\b/g, '²').replace(/\^3\b/g, '³').replace(/\*/g, '·');
          tx = rawToTex(n.rawU);
        }
        return { text: txt, tex: tx, u: n.u, bare: false, prec: 9 };
      }
      case 'var': {
        const q = evq(n);
        if (uNone(q.u)) return plain(q.u);
        const txt = (n.name in CONST && CONST[n.name].unit) ? CONST[n.name].unit : uText(q.u);
        const tx = (n.name in CONST && CONST[n.name].unit) ? rawToTex(CONST[n.name].unit) : uTex(q.u);
        return { text: txt, tex: tx, u: q.u, bare: false, prec: 9 };
      }
      case 'neg': case 'pct': return unitWalk(n.a);
      case 'fact': return plain({});
      case 'bin': {
        const q = evq(n);
        if (n.o === '^') {
          const a = unitWalk(n.a);
          const expVal = evq(n.b).v;
          if (a.bare) return plain(q.u);
          const aText = a.prec < 3 || a.text.includes('/') ? `(${a.text})` : a.text;
          const expText = supNum(expVal);
          const aTex = a.prec < 3 || a.tex.includes('\\frac') ? `\\left(${a.tex}\\right)` : a.tex;
          const expTex = `^{${expVal}}`;
          return { text: `${aText}${expText}`, tex: `${aTex}${expTex}`, u: q.u, bare: false, prec: 3 };
        }
        const a = unitWalk(n.a), b = unitWalk(n.b);
        if (a.bare && b.bare) return plain(q.u);

        const p = PREC[n.o];
        const op = { '*': ' · ', '/': ' / ', '+': ' + ', '-': ' − ' }[n.o];
        const wrap = (side, min) => (side.prec < min ? `(${side.text})` : side.text);
        let left = wrap(a, p);
        let right = wrap(b, p + (n.o === '/' || n.o === '-' ? 1 : 0));

        let tex;
        if (n.o === '*') {
          const wrapTex = (side, min) => (side.prec < min ? `\\left(${side.tex}\\right)` : side.tex);
          tex = `${wrapTex(a, p)} \\cdot ${wrapTex(b, p)}`;
        } else if (n.o === '/') {
          tex = `\\frac{${a.tex}}{${b.tex}}`;
        } else {
          const opTex = n.o === '+' ? ' + ' : ' - ';
          const wrapTex = (side, min) => (side.prec < min ? `\\left(${side.tex}\\right)` : side.tex);
          tex = `${wrapTex(a, p)}${opTex}${wrapTex(b, p + 1)}`;
        }
        return { text: `${left}${op}${right}`, tex, u: q.u, bare: false, prec: p };
      }
      case 'call': {
        const parts = n.args.map(unitWalk);
        const q = evq(n);
        if (parts.every((x) => x.bare)) return plain(q.u);
        const inner = parts.map((x) => x.text).join('; ');
        const innerTex = parts.map((x) => x.tex).join(', ');
        if (n.f === 'sqrt') return { text: `√(${inner})`, tex: `\\sqrt{${innerTex}}`, u: q.u, bare: false, prec: 9 };
        if (n.f === 'cbrt') return { text: `∛(${inner})`, tex: `\\sqrt[3]{${innerTex}}`, u: q.u, bare: false, prec: 9 };
        return { text: `${n.f}(${inner})`, tex: `\\operatorname{${n.f}}\\left(${innerTex}\\right)`, u: q.u, bare: false, prec: 9 };
      }
    }
    return plain({});
  }

  function unitLine(tree) {
    const w = unitWalk(tree);
    if (w.bare) return null;
    const name = uName(w.u);
    const steps = [[w.text.trim(), w.tex.trim()], [uText(w.u) || '1', uTex(w.u) || '1']];
    if (name) steps.push([name, `\\text{${name}}`]);
    const uniq = steps.filter((st, i) => steps.findIndex((o) => o[0] === st[0]) === i);
    if (uniq.length === 1) return null;
    return { text: uniq.map((st) => st[0]).join(' = '), tex: '\\displaystyle ' + uniq.map((st) => st[1]).join(' = ') };
  }

  return { unitLine };
}

// Domknięcie nawiasów przy wpisywaniu na bieżąco
export function balance(src) {
  let depth = 0, need = 0;
  for (const ch of src) {
    if (ch === '(') depth++;
    else if (ch === ')') { depth > 0 ? depth-- : need++; }
  }
  let out = src;
  if (need) {
    const m = /^\s*[A-Za-z_\u0370-\u03FF][A-Za-z0-9_\u0370-\u03FF]*\s*=\s*/.exec(out);
    const at = m ? m[0].length : 0;
    out = out.slice(0, at) + '('.repeat(need) + out.slice(at);
  }
  return out + ')'.repeat(depth);
}

// ================= Formatowanie liczb =================
export const NNBSP = '\u202f';

export function group(intStr) {
  return intStr.length > 4 ? intStr.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP) : intStr;
}

export function plain(numStr) {
  let neg = numStr.startsWith('-');
  if (neg) numStr = numStr.slice(1);
  let [i, d] = numStr.split('.');
  return (neg ? '−' : '') + group(i) + (d !== undefined ? ',' + d : '');
}

export function fmt(x, sig = 'auto') {
  if (x === 0) return { html: '0', text: '0' };
  const digits = sig === 'auto' ? 10 : +sig;
  let e = Math.floor(Math.log10(Math.abs(x)));
  let m = +(x / 10 ** e).toPrecision(digits);
  if (Math.abs(m) >= 10) { m /= 10; e += 1; m = +m.toPrecision(digits); }
  if (e >= 6 || e <= -4) {
    const ms = sig === 'auto' ? String(m) : m.toFixed(digits - 1);
    return { html: `${plain(ms)} × 10<sup>${String(e).replace('-', '−')}</sup>`, text: `${ms.replace('.', ',')}e${e}` };
  }
  let str;
  if (sig === 'auto') str = String(+x.toPrecision(12));
  else str = e >= digits - 1 ? String(+x.toPrecision(digits)) : x.toPrecision(digits);
  return { html: plain(str), text: str.replace('.', ',') };
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

export function fracHtml(f) {
  const stack = (n, d) => `<span class="frac"><span>${n}</span><span>${d}</span></span>`;
  const sign = f.n < 0 ? '−' : '';
  const n = Math.abs(f.n);
  let html = sign + stack(n, f.d);
  if (n > f.d) html += ` = ${sign}${Math.floor(n / f.d)} ${stack(n % f.d, f.d)}`;
  return html;
}

export const exactText = (x) => String(+x.toPrecision(15)).replace('.', ',');

// Główna funkcja wykonawcza
export function calc(raw, vars = {}, ans = 0) {
  const src = balance(raw);
  const tokenizer = createTokenizer(vars);
  const tokenResult = tokenizer.tokenize(src);
  const { assign, tree } = parse(tokenResult, vars);
  const q = evaluateTree(tree, vars, ans);
  if (Number.isNaN(q.v)) throw err('Wynik nieokreślony');
  if (!Number.isFinite(q.v)) throw err('Wynik poza zakresem');
  const { unitLine } = createUnitLineEvaluator(vars, ans);
  return {
    assign,
    v: q.v,
    u: q.u,
    src,
    units: unitLine(tree),
    notes: tokenResult.notes || []
  };
}
