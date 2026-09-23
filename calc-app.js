// calc-app.js – interfejs kalkulatora naukowego (samodzielna strona i panel w DarkPDF).
// Obliczenia, jednostki i formatowanie liczb są w calc-engine.js.

import { CalcError, CONSTS, CONST, evaluate, complete, fmt, toFraction, exactText, unitLabel, insertText, copyText } from './calc-engine.js';

const GROUPS_CLOSED = ['Mechanika', 'Elektryczność i magnetyzm', 'Termodynamika', 'Atom i kwanty', 'Astronomia', 'Układ Słoneczny', 'Przeliczniki', 'Matematyka'];
const MODES = ['dark', 'light', 'auto'];
const SIGS = ['auto', '2', '3', '4', '5'];
const HIST_MAX = 100;

const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

// Zapis z localStorage może być stary (zmienna jako sama liczba) albo uszkodzony – wtedy go pomijamy,
// zamiast wyłożyć cały kalkulator
function loadVars(raw) {
  const out = Object.create(null);          // bez prototypu: zmienna „constructor” to zwykła nazwa
  if (!isObj(raw)) return out;
  for (const [name, val] of Object.entries(raw)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[name] = { v: val, u: {} };
    else if (isObj(val) && Number.isFinite(val.v)) out[name] = { v: val.v, u: isObj(val.u) ? val.u : {} };
  }
  return out;
}

function loadHist(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((h) => isObj(h) && typeof h.e === 'string' && Number.isFinite(h.v))
    .map((h) => ({ ...h, u: isObj(h.u) ? h.u : {} }))
    .slice(0, HIST_MAX);
}

function fracHtml(f) {
  const stack = (n, d) => `<span class="frac"><span>${n}</span><span>${d}</span></span>`;
  const sign = f.n < 0 ? '−' : '';
  const n = Math.abs(f.n);
  let html = sign + stack(n, f.d);
  if (n > f.d) html += ` = ${sign}${Math.floor(n / f.d)} ${stack(n % f.d, f.d)}`;
  return html;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ================= Montowanie komponentu kalkulatora =================
export function mountCalculator(container, options = {}) {
  const isEmbedded = Boolean(options.isEmbedded);

  // Bezpieczny magazyn pamięci lokalnej
  const store = {
    get(k, d) { try { const v = localStorage.getItem('kalk:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('kalk:' + k, JSON.stringify(v)); } catch {} }
  };

  let angle = oneOf(store.get('angle', 'deg'), ['deg', 'rad'], 'deg');
  let sig = oneOf(String(store.get('sig', 'auto')), SIGS, 'auto');
  let vars = loadVars(store.get('vars', {}));
  let hist = loadHist(store.get('hist', []));
  let ans = hist.length ? { v: hist[0].v, u: hist[0].u } : { v: 0, u: {} };
  let histPos = -1;
  const closedRaw = store.get('closedGroups', GROUPS_CLOSED);
  let closed = new Set(Array.isArray(closedRaw) ? closedRaw : GROUPS_CLOSED);

  // Motyw w trybie samodzielnym
  let colorMode = oneOf(store.get('colorMode', 'auto'), MODES, 'auto');
  let palette = oneOf(store.get('palette', 'gemini'), ['gemini', 'system'], 'gemini');
  const MODE_ICON = { dark: '☾', light: '☀', auto: '◐' };
  const MODE_NAME = { dark: 'ciemny', light: 'jasny', auto: 'jak w systemie' };
  const systemDark = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : { matches: true };

  container.classList.add('calc-root');
  if (isEmbedded) container.classList.add('is-embedded');

  // Wstaw markup kalkulatora
  container.innerHTML = `
    <main class="calc-main">
      <section>
        <div class="panel display">
          <div class="bar">
            <div class="seg" id="calc-angle">
              <button data-m="deg" title="Kąty w stopniach">DEG</button>
              <button data-m="rad" title="Kąty w radianach">RAD</button>
            </div>
            <div class="icons">
              <button id="calc-mode-btn" class="icon" aria-label="Tryb jasny / ciemny / systemowy">☾</button>
              <button id="calc-palette-btn" class="icon" aria-label="Paleta standardowa / Gemini">✦</button>
            </div>
            <div class="seg" id="calc-sig" title="Cyfry znaczące wyniku">
              <span style="padding:2px 4px">cyfry:</span>
              <button data-s="auto">auto</button><button data-s="2">2</button><button data-s="3">3</button><button data-s="4">4</button><button data-s="5">5</button>
            </div>
          </div>
          <div class="calc-expr-wrap">
            <input id="calc-expr" class="calc-expr mono" autocomplete="off" autocapitalize="off" spellcheck="false"
                   placeholder="np. sqrt(2*g*h)  albo  v = 12">
            <div id="calc-ghost" class="calc-ghost mono" aria-hidden="true" hidden><span class="typed"></span><span class="rest" title="Dokończ (Tab)"></span></div>
          </div>
          <div id="calc-preview" class="calc-preview mono"></div>
          <div id="calc-last-expr" class="calc-last-expr mono"></div>
          <div id="calc-result" class="calc-result mono" title="Kliknij, żeby wstawić do działania · dwuklik kopiuje">0</div>
          <div id="calc-unit-track" class="calc-unit-track mono"></div>
          <div id="calc-result-raw" class="calc-result-raw mono"></div>
        </div>

        <div class="panel keys" id="calc-keys" style="margin-top:14px">
          <button class="fn" data-i="sin(">sin</button>
          <button class="fn" data-i="cos(">cos</button>
          <button class="fn" data-i="tg(">tg</button>
          <button class="fn" data-i="ln(">ln</button>
          <button class="fn" data-i="log(">log</button>
          <button class="fn" data-i="√(">√</button>

          <button class="fn" data-i="arcsin(">sin⁻¹</button>
          <button class="fn" data-i="arccos(">cos⁻¹</button>
          <button class="fn" data-i="arctg(">tg⁻¹</button>
          <button class="fn" data-i="^2">x²</button>
          <button class="fn" data-i="^">xʸ</button>
          <button class="fn" data-i="×10^">×10ⁿ</button>

          <button data-i="7">7</button><button data-i="8">8</button><button data-i="9">9</button>
          <button data-i="(">(</button><button data-i=")">)</button><button data-a="back" title="Usuń znak">⌫</button>

          <button data-i="4">4</button><button data-i="5">5</button><button data-i="6">6</button>
          <button data-i="×">×</button><button data-i="÷">÷</button><button data-a="clear" title="Wyczyść (Esc)">C</button>

          <button data-i="1">1</button><button data-i="2">2</button><button data-i="3">3</button>
          <button data-i="+">+</button><button data-i="−">−</button><button class="fn" data-i="ans">ans</button>

          <button data-i="0">0</button><button data-i=",">,</button><button class="fn" data-i="π">π</button>
          <button class="fn" data-i="!">n!</button><button class="fn" data-i="=" title="Przypisanie do zmiennej, np. v = 12">x=</button>
          <button class="eq" data-a="run" title="Oblicz (Enter)">=</button>
        </div>

        <div class="panel hist" style="margin-top:14px">
          <h2>Historia <button id="calc-clear-hist">wyczyść</button></h2>
          <ol id="calc-hist"></ol>
          <div class="empty" id="calc-hist-empty">Tu pojawią się obliczenia. Kliknij wynik, żeby wstawić go do wyrażenia.</div>
        </div>
        <div class="help">
          <b>Enter</b> oblicz · <b>↑ ↓</b> historia · <b>Esc</b> wyczyść ·
          część dziesiętna po przecinku <code>9,81</code>, argumenty oddziel średnikiem <code>root(8; 3)</code> ·
          zmienne: <code>v = 12m/s</code> ·
          jednostki: <code>5kg*2</code>, <code>5m/s*2</code>, <code>100km/2h</code>, <code>G*MZ/RZ^2</code> ·
          litery za liczbą to jednostka (<code>10 m</code>), zmienną mnóż jawnie: <code>10*m</code>
        </div>
      </section>

      <aside class="panel side">
        <div class="vars" id="calc-vars-box" hidden>
          <h2>Zmienne <button id="calc-clear-vars">wyczyść</button></h2>
          <ol id="calc-vars"></ol>
        </div>
        <h2>Stałe fizyczne</h2>
        <input id="calc-search" class="calc-search" placeholder="Szukaj: masa, ładunek, Ziemia…" autocomplete="off">
        <div class="consts" id="calc-consts"></div>
      </aside>
    </main>
    <div id="calc-hint" class="calc-hint" hidden></div>
  `;

  // Referencje do elementów DOM
  const expr = container.querySelector('#calc-expr');
  const preview = container.querySelector('#calc-preview');
  const result = container.querySelector('#calc-result');
  const resultRaw = container.querySelector('#calc-result-raw');
  const lastExpr = container.querySelector('#calc-last-expr');
  const unitTrack = container.querySelector('#calc-unit-track');
  const keysEl = container.querySelector('#calc-keys');
  const histEl = container.querySelector('#calc-hist');
  const histEmptyEl = container.querySelector('#calc-hist-empty');
  const clearHistBtn = container.querySelector('#calc-clear-hist');
  const clearVarsBtn = container.querySelector('#calc-clear-vars');
  const varsBoxEl = container.querySelector('#calc-vars-box');
  const varsEl = container.querySelector('#calc-vars');
  const searchEl = container.querySelector('#calc-search');
  const constsEl = container.querySelector('#calc-consts');
  const angleEl = container.querySelector('#calc-angle');
  const sigEl = container.querySelector('#calc-sig');
  const modeBtn = container.querySelector('#calc-mode-btn');
  const paletteBtn = container.querySelector('#calc-palette-btn');
  const hintEl = container.querySelector('#calc-hint');
  const ghost = container.querySelector('#calc-ghost');
  const [ghostTyped, ghostRest] = ghost.children;

  const fine = typeof matchMedia !== 'undefined' ? matchMedia('(pointer: fine)').matches : true;
  let hintTimer = null;

  function flash(text, ms = 1200) {
    if (options.onFlash) { options.onFlash(text, ms); return; }
    if (!hintEl) return;
    hintEl.textContent = text;
    hintEl.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintEl.hidden = true; }, ms);
  }

  function renderKatex(el, tex, fallbackHtml) {
    if (!el) return;
    if (typeof window !== 'undefined' && window.katex && tex) {
      try {
        window.katex.render(tex, el, { throwOnError: false, displayMode: false });
        return;
      } catch (e) {}
    }
    el.innerHTML = fallbackHtml !== undefined ? fallbackHtml : (tex || '');
  }

  const calc = (raw) => evaluate(raw, { vars, ans, angle });

  // Miejsce kursora w polu działania. Gdy pole nie ma fokusu (dotyk: klawiatura ekranowa schowana),
  // bierzemy ostatnie znane miejsce – i przyciski, i ⌫ działają wtedy w tym samym miejscu
  let lastSel = null;
  expr.addEventListener('blur', () => { lastSel = [expr.selectionStart, expr.selectionEnd]; });

  function selection() {
    const len = expr.value.length;
    const [s, e] = document.activeElement === expr ? [expr.selectionStart, expr.selectionEnd] : (lastSel || [len, len]);
    return [Math.min(s, len), Math.min(e, len)];
  }

  function setExpr(value, caret = value.length) {
    expr.value = value;
    expr.setSelectionRange(caret, caret);
    lastSel = [caret, caret];
    livePreview();
  }

  function clearExpr() {
    histPos = -1;
    setExpr('');
  }

  function insert(text) {
    const [s, e] = selection();
    if (expr.value === '' && /^[+×÷*/^!%]/.test(text) && hist.length) text = 'ans' + text;
    if (fine) expr.focus();
    setExpr(expr.value.slice(0, s) + text + expr.value.slice(e), s + text.length);
  }

  function backspace() {
    const [s, e] = selection();
    if (s !== e) setExpr(expr.value.slice(0, s) + expr.value.slice(e), s);
    else if (s > 0) {
      const m = /[A-Za-z√]+\($|.$/u.exec(expr.value.slice(0, s));   // „sin(” znika w całości
      const cut = m ? m[0].length : 1;
      setExpr(expr.value.slice(0, s - cut) + expr.value.slice(s), s - cut);
    }
  }

  // Wyszarzona podpowiedź za kursorem: reszta nazwy (sq → sqrt() albo brakujące nawiasy.
  // Tab, → na końcu pola albo kliknięcie w nią wstawia ją do działania.
  let suggestion = '';

  function updateGhost() {
    const [s, e] = selection();
    suggestion = s === e && e === expr.value.length ? complete(expr.value, vars) : '';
    ghostTyped.textContent = expr.value;
    ghostRest.textContent = suggestion;
    ghost.hidden = !suggestion;
    if (suggestion && ghost.scrollWidth > ghost.clientWidth) ghost.hidden = true;   // długie działanie: nie zmieściłaby się w polu
  }

  function acceptSuggestion() {
    if (!suggestion || ghost.hidden) return false;
    if (fine) expr.focus();
    setExpr(expr.value + suggestion);
    return true;
  }

  ghostRest.addEventListener('pointerdown', (e) => e.preventDefault());   // fokus zostaje w polu działania
  ghostRest.addEventListener('click', acceptSuggestion);
  for (const ev of ['keyup', 'click', 'focus', 'blur']) expr.addEventListener(ev, updateGhost);

  function livePreview() {
    updateGhost();
    preview.classList.remove('err');
    const src = expr.value.trim();
    if (!src) { preview.textContent = ''; return; }
    try {
      const { assign, v, u, src: full, units, notes } = calc(src);
      const fr = toFraction(v);
      const uStr = unitLabel(u);
      const shown = full !== src ? esc(full) + ' ' : '';
      let html = shown + (assign ? esc(assign) + ' ' : '') + '= ' + fmt(v, sig).html + (uStr ? ' ' + esc(uStr) : '') + (fr ? ' = ' + fracHtml(fr) + (uStr ? ' ' + esc(uStr) : '') : '');
      if (units) html += '<div class="preview-units"></div>';
      for (const note of notes) html += `<div class="preview-note">${esc(note)}</div>`;
      preview.innerHTML = html;
      if (units) renderKatex(preview.querySelector('.preview-units'), units.tex, esc(units.text));
    } catch {
      preview.textContent = '';
    }
  }

  function showResult(label, v, u = {}, units = null) {
    lastExpr.textContent = label;
    const f = fmt(v, sig);
    const uStr = unitLabel(u);
    result.innerHTML = f.html + (uStr ? `<span class="u">${esc(uStr)}</span>` : '');
    result.dataset.copy = copyText(v, u);
    result.dataset.insert = insertText(v, u);

    if (unitTrack) {
      if (units) {
        renderKatex(unitTrack, units.tex, esc(units.text));
      } else {
        unitTrack.innerHTML = '';
      }
    }

    const parts = [];
    const fr = toFraction(v);
    if (fr) parts.push('ułamek: ' + fracHtml(fr) + (uStr ? ' ' + esc(uStr) : ''));
    if (!(sig === 'auto' && f.text === exactText(v))) parts.push('dokładnie: ' + esc(exactText(v)) + (uStr ? ' ' + esc(uStr) : ''));
    resultRaw.innerHTML = parts.join(' &nbsp;·&nbsp; ');
  }

  // Ostatni wynik z historii jeszcze raz (po zmianie liczby cyfr, po załadowaniu KaTeX, na starcie)
  function showLast() {
    if (hist.length) showResult(lastExpr.textContent || hist[0].e + ' =', hist[0].v, hist[0].u, hist[0].units);
  }

  function run() {
    const src = expr.value.trim();
    if (!src) return;
    try {
      const { assign, v, u, src: full, units, notes } = calc(src);
      if (assign) {
        vars[assign] = { v, u };
        store.set('vars', vars);
        renderVars();
      }
      ans = { v, u };
      // To samo działanie drugi raz z rzędu (↑ i Enter, odświeżenie strony z ?expr=) nie dubluje historii
      const repeated = hist[0] && hist[0].e === full && hist[0].v === v && unitLabel(hist[0].u) === unitLabel(u);
      if (!repeated) {
        hist.unshift({ e: full, v, u, units });
        hist = hist.slice(0, HIST_MAX);
        store.set('hist', hist);
      }
      showResult(full + ' =', v, u, units);
      clearExpr();
      renderHist();
      const msgs = [...notes];
      if (assign && assign in CONST) msgs.push(`${assign} przesłania teraz stałą „${CONST[assign].name}”`);
      if (msgs.length) flash(msgs.join('\n'), notes.length ? 4000 : 2500);
    } catch (e) {
      preview.classList.add('err');
      preview.textContent = e instanceof CalcError ? e.message : 'Błąd: ' + e.message;
    }
  }

  function row(cls, left, right, onLeft, onRight) {
    const el = document.createElement('li');
    el.className = cls;
    const a = document.createElement('span');
    a.className = 'e mono';
    const b = document.createElement('span');
    b.className = 'r mono';
    if (typeof left === 'string') a.textContent = left; else a.innerHTML = left.html;
    if (typeof right === 'string') b.textContent = right; else b.innerHTML = right.html;
    if (onLeft) a.onclick = onLeft;
    if (onRight) b.onclick = onRight;
    el.append(a, b);
    return el;
  }

  function insertExpr(text) {
    const m = /^\s*[A-Za-z_\u0370-\u03FF][A-Za-z0-9_\u0370-\u03FF]*\s*=(.*)$/.exec(text);
    let t = m ? m[1].trim() : text;
    const simple = /^[A-Za-z0-9_,.\u0370-\u03FF]+$/.test(t);
    if (expr.value.trim() && !simple) t = '(' + t + ')';
    insert(t);
  }

  function renderHist() {
    histEl.replaceChildren();
    histEmptyEl.hidden = hist.length > 0;
    hist.forEach((h) => {
      const uStr = unitLabel(h.u);
      const resHtml = '= ' + fmt(h.v, sig).html + (uStr ? ' ' + esc(uStr) : '');
      const li = row('', h.e, { html: resHtml },
        () => insertExpr(h.e),
        () => insert(insertText(h.v, h.u)));
      li.firstChild.title = h.e + '  (kliknij, żeby wstawić)';
      li.lastChild.title = 'Wstaw wynik w miejsce kursora';
      if (h.units) {
        const sub = document.createElement('div');
        sub.className = 'unit-sub mono';
        renderKatex(sub, h.units.tex, esc(h.units.text));
        li.firstChild.append(sub);
      }
      histEl.append(li);
    });
  }

  function renderVars() {
    const names = Object.keys(vars);
    varsBoxEl.hidden = names.length === 0;
    varsEl.replaceChildren();
    for (const n of names) {
      const { v: num, u } = vars[n];
      const uStr = unitLabel(u);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'row';
      b.title = `Wstaw: ${n}`;
      const shadow = n in CONST;
      b.innerHTML = `<div class="top"><span class="sym">${esc(n)}</span>` +
        `<span class="name${shadow ? ' shadowed' : ''}">${shadow ? 'przesłania stałą: ' + esc(CONST[n].name) : ''}</span></div>` +
        `<div class="bottom"><span class="val mono">${fmt(num, sig).html}${uStr ? ' ' + esc(uStr) : ''}</span></div>`;
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.onclick = () => insert(n);
      const x = document.createElement('button');
      x.className = 'x'; x.textContent = '×'; x.title = 'Usuń zmienną';
      x.addEventListener('pointerdown', (e) => e.preventDefault());
      x.onclick = () => { delete vars[n]; store.set('vars', vars); renderVars(); livePreview(); };
      li.append(b, x);
      varsEl.append(li);
    }
  }

  function constRow(c) {
    const b = document.createElement('button');
    b.className = 'row';
    b.title = `Wstaw: ${c.id}`;
    const up = /^(eV|au|ly|pc|kWh|cal|bar|atm|mmHg|km\/h|KM)$/.test(c.sym) ? ' up' : '';
    b.innerHTML = `<div class="top"><span class="sym${up}">${c.sym}</span><span class="name">${esc(c.name)}</span></div>
      <div class="bottom"><span class="id mono">${esc(c.id)}</span><span class="val mono">${fmt(c.value, 'auto').html}${c.unit ? ' ' + esc(c.unit) : ''}</span></div>`;
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.onclick = () => insert(c.id);
    return b;
  }

  function renderConsts() {
    const q = norm(searchEl.value.trim());
    const box = constsEl;
    box.replaceChildren();

    const groups = new Map();
    for (const [id] of CONSTS) {
      const c = CONST[id];
      if (q && !norm(`${c.name} ${c.id} ${c.group} ${c.sym.replace(/<[^>]+>/g, '')}`).includes(q)) continue;
      if (!groups.has(c.group)) groups.set(c.group, []);
      groups.get(c.group).push(c);
    }
    if (!groups.size) { box.innerHTML = '<div class="empty">Nic nie znaleziono.</div>'; return; }

    for (const [name, list] of groups) {
      const open = !!q || !closed.has(name);
      const head = document.createElement('button');
      head.className = 'group' + (open ? ' open' : '');
      head.innerHTML = `<span class="caret">${open ? '▾' : '▸'}</span><span>${esc(name)}</span><span class="count">${list.length}</span>`;
      head.onclick = () => {
        if (q) return;
        closed.has(name) ? closed.delete(name) : closed.add(name);
        store.set('closedGroups', [...closed]);
        renderConsts();
      };
      box.append(head);
      if (open) for (const c of list) box.append(constRow(c));
    }
  }

  function renderModes() {
    for (const b of angleEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.m === angle);
    for (const b of sigEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.s === String(sig));
  }

  function applyStandaloneTheme() {
    if (isEmbedded) return;
    const dark = colorMode === 'auto' ? systemDark.matches : colorMode === 'dark';
    document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-palette', palette);
    if (modeBtn) {
      modeBtn.textContent = MODE_ICON[colorMode];
      modeBtn.title = `Tryb: ${MODE_NAME[colorMode]} – kliknij: ciemny / jasny / systemowy (Ctrl+M)`;
    }
    if (paletteBtn) {
      paletteBtn.textContent = palette === 'gemini' ? '✦' : '▣';
      paletteBtn.title = `Kolory: ${palette === 'gemini' ? 'Gemini' : 'standardowe (systemowe)'} – kliknij, żeby zmienić (Ctrl+Shift+M)`;
    }
  }

  function cycleMode() {
    colorMode = MODES[(MODES.indexOf(colorMode) + 1) % MODES.length];
    store.set('colorMode', colorMode);
    applyStandaloneTheme();
    flash(`Tryb: ${MODE_NAME[colorMode]}`);
  }

  function togglePalette() {
    palette = palette === 'gemini' ? 'system' : 'gemini';
    store.set('palette', palette);
    applyStandaloneTheme();
    flash(palette === 'gemini' ? 'Kolory: Gemini' : 'Kolory: standardowe (systemowe)');
  }

  function themeKey(e) {
    if (isEmbedded) return false;
    if (!(e.ctrlKey || e.metaKey) || (e.key !== 'm' && e.key !== 'M')) return false;
    e.preventDefault();
    e.shiftKey ? togglePalette() : cycleMode();
    return true;
  }

  // Zdarzenia kontrolek
  expr.addEventListener('input', () => {
    if (/^[+×÷*/^!%]$/.test(expr.value) && hist.length) { expr.value = 'ans' + expr.value; }
    histPos = -1;
    livePreview();
  });

  expr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape') {
      if (expr.value) {
        clearExpr();
        e.preventDefault();
      } else if (options.onClose) {
        options.onClose();
        e.preventDefault();
      }
    } else if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'ArrowRight' && expr.selectionStart === expr.value.length)) {
      if (acceptSuggestion()) e.preventDefault();          // bez podpowiedzi Tab i → działają jak zwykle
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!hist.length) return;
      e.preventDefault();
      histPos = e.key === 'ArrowUp' ? Math.min(hist.length - 1, histPos + 1) : Math.max(-1, histPos - 1);
      setExpr(histPos < 0 ? '' : hist[histPos].e);
    }
  });

  histEl.addEventListener('pointerdown', (e) => { if (e.target.closest('.e, .r')) e.preventDefault(); });
  keysEl.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  keysEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.i !== undefined) {
      let t = b.dataset.i;
      if (t === '=') t = expr.value.includes('=') ? '' : ' = ';
      insert(t);
      return;
    }
    const a = b.dataset.a;
    if (a === 'run') run();
    else if (a === 'clear') clearExpr();
    else if (a === 'back') backspace();
  });

  angleEl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    angle = b.dataset.m;
    store.set('angle', angle);
    renderModes();
    livePreview();
  });

  sigEl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    sig = b.dataset.s;
    store.set('sig', sig);
    renderModes();
    livePreview();
    renderHist();
    renderVars();
    showLast();
  });

  if (!isEmbedded) {
    modeBtn.addEventListener('click', cycleMode);
    paletteBtn.addEventListener('click', togglePalette);
    systemDark.addEventListener?.('change', () => { if (colorMode === 'auto') applyStandaloneTheme(); });
  }

  searchEl.addEventListener('input', renderConsts);
  clearHistBtn.addEventListener('click', () => { hist = []; store.set('hist', hist); renderHist(); });
  clearVarsBtn.addEventListener('click', () => { vars = Object.create(null); store.set('vars', vars); renderVars(); livePreview(); });

  let resultClickTimer = null;
  result.addEventListener('click', () => {
    if (!result.dataset.copy || resultClickTimer) return;
    resultClickTimer = setTimeout(() => {
      resultClickTimer = null;
      insert(result.dataset.insert || result.dataset.copy);
    }, 220);
  });

  result.addEventListener('dblclick', async () => {
    clearTimeout(resultClickTimer);
    resultClickTimer = null;
    const t = result.dataset.copy;
    if (!t) return;
    try { await navigator.clipboard.writeText(t); flash('Skopiowano: ' + t); }
    catch { flash('Nie udało się skopiować – schowek jest tu niedostępny'); }   // np. strona bez https
  });

  const onDocKeyDown = (e) => {
    if (themeKey(e)) return;
    if (document.activeElement === expr || document.activeElement === searchEl) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEmbedded && !container.contains(document.activeElement)) return;
    // W DarkPDF litery poza polem działania to skróty czytnika (D, T, P…) – nie przerzucamy ich do pola
    if (isEmbedded && /^[a-zA-Z?]$/.test(e.key)) return;
    if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') {
      expr.focus();
    }
  };
  document.addEventListener('keydown', onDocKeyDown);

  // Re-renderowanie KaTeX po załadowaniu
  window.onKatexLoaded = () => {
    livePreview();
    showLast();
    renderHist();
  };

  // Inicjalizacja widoku
  applyStandaloneTheme();
  renderModes();
  renderHist();
  renderVars();
  renderConsts();
  showLast();

  return {
    focus() { expr.focus(); },
    run(expression) {
      if (expression) expr.value = expression;
      run();
    },
    setExpression(val) { setExpr(val); },
    destroy() {
      document.removeEventListener('keydown', onDocKeyDown);
    }
  };
}
