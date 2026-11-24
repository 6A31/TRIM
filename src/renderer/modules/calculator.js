// Module scope: renderer scripts are classic <script>s, so without this wrapper
// every top-level function becomes a global and modules overwrite each other
// (and builtins like window.open / window.close).
(function () {
// c: calculator, a thin client for the SymPy math engine in the main process
// (src/main/cas/cas_worker.py). All parsing, evaluation and solving happens in
// SymPy; this file turns its replies into result rows, cards, plots and the
// worksheet (CAS editor).
//
// Two presentations:
// - Plain arithmetic (digits, + - * / ^ % ! brackets, sqrt, pi, e) gets a quick
//   result row; Enter copies it.
// - Anything else (variables, :=, =, ggT/kgV, nested functions, $n, ans) opens
//   the worksheet: numbered rows like GeoGebra's CAS view. Enter adds the line
//   as a row, ↑/↓ edit earlier rows, $n / ans reuse results.

let generation = 0;
let engineStatus = null;
let sheet = { rows: [] };
let sheetLoaded = false;
let sheetLoading = null;
let editingIndex = null;   // row being edited (0-based) or null for a new line
let editorVisible = false; // last render was the worksheet
let lastPreview = null;    // { input, res } for the line being typed
let flash = null;          // { message } shown once after a rejected Enter

if (typeof window !== 'undefined' && window.trim && window.trim.onCasStatus) {
  window.trim.onCasStatus((status) => {
    engineStatus = status;
    // Update a visible "Computing..." spinner with setup progress
    const span = document.querySelector('#results-container .ai-loading span');
    if (span && status && status.message) span.textContent = status.message;
  });
}

function loadingMessage() {
  if (engineStatus && (engineStatus.state === 'installing' || engineStatus.state === 'starting')) {
    return engineStatus.message;
  }
  return 'Computing...';
}

/** Plain arithmetic that doesn't need the worksheet. */
function isSimple(body) {
  const s = (body || '').trim();
  if (!s || /[$=:,]/.test(s)) return false;
  const withoutWords = s.replace(/\b(sqrt|pi|e)\b/gi, '1');
  // also typed symbols: π √ ² ³ × · ÷ − (unicode minus)
  return /^[\d\s.+\-*/^%()!π√²³×·÷−]+$/.test(withoutWords);
}

function ensureSheet(onLoaded) {
  if (sheetLoaded) return Promise.resolve(sheet);
  if (!sheetLoading) {
    sheetLoading = window.trim.casWorksheet().then((s) => {
      sheet = s && Array.isArray(s.rows) ? s : { rows: [] };
      sheetLoaded = true;
      return sheet;
    }).catch(() => {
      sheetLoaded = true;
      return sheet;
    }).finally(() => { sheetLoading = null; });
  }
  if (onLoaded) sheetLoading.then(onLoaded);
  return sheetLoading;
}

/**
 * Evaluate a calculator line. Returns results right away (quick row, worksheet
 * with a pending preview, or a loading row) and calls onResult with the
 * engine's answer.
 */
function search(expression, onResult) {
  const input = (expression || '').trim();
  const gen = ++generation;
  const deliver = (results) => { if (gen === generation && typeof onResult === 'function') onResult(results); };

  if (editingIndex === null && isSimple(input)) {
    editorVisible = false;
    window.trim.casEval(input, false).then((res) => {
      if (!res || res.superseded) return;
      deliver(toResults(res, input));
    }).catch((err) => deliver(toResults({ ok: false, error: err.message || String(err) }, input)));
    return [{ type: 'calc-loading', message: loadingMessage() }];
  }

  // Worksheet (CAS editor)
  if (!sheetLoaded) {
    ensureSheet(() => { if (gen === generation) deliver(worksheetResults(input, input ? { pending: true } : null)); });
    if (input) startPreview(input, gen, deliver);
    return [{ type: 'calc-loading', message: loadingMessage() }];
  }
  if (!input) {
    lastPreview = null;
    if (!sheet.rows.length && editingIndex === null) { editorVisible = false; return []; }
    return worksheetResults('', null);
  }
  startPreview(input, gen, deliver);
  const cached = lastPreview && lastPreview.input === input ? lastPreview.res : { pending: true };
  return worksheetResults(input, cached);
}

function startPreview(input, gen, deliver) {
  window.trim.casEval(input, false).then((res) => {
    if (!res || res.superseded) return;
    lastPreview = { input, res };
    if (gen === generation) deliver(worksheetResults(input, res));
  }).catch((err) => deliver(worksheetResults(input, { ok: false, error: err.message || String(err) })));
}

function worksheetResults(input, preview) {
  editorVisible = true;
  return [{
    type: 'calc-worksheet',
    title: 'Worksheet',
    render: () => buildSheet(input, preview),
    afterMount: (el) => {
      const rows = el.querySelector('.cas-rows');
      if (!rows) return;
      const target = editingIndex !== null ? rows.querySelector(`.cas-row[data-index="${editingIndex}"]`) : null;
      if (target) target.scrollIntoView({ block: 'nearest' });
      else rows.scrollTop = rows.scrollHeight;
    },
    action: () => commitCurrent(),
  }];
}

// --- rendering helpers ---

function renderKaTeX(tex, displayMode) {
  if (typeof katex === 'undefined') return escapeHtml(tex);
  try {
    return katex.renderToString(tex, { displayMode: !!displayMode, throwOnError: false });
  } catch {
    return escapeHtml(tex);
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function copyText(text) {
  if (window.trim && window.trim.copyText) return window.trim.copyText(String(text));
  if (navigator.clipboard) return navigator.clipboard.writeText(String(text)).catch(() => {});
  return Promise.resolve();
}

/** TeX for a successful engine reply (shared by cards and worksheet rows). */
function resultTex(res) {
  let tex = res.latex || '';
  if (res.kind === 'number' && res.decimal) tex += ` \\approx ${res.decimal.replace(/i/g, '\\,i')}`;
  if (res.kind === 'definition' && res.decimal && !tex.includes('\\approx') && res.decimal !== res.text.split(':=').pop().trim()) {
    tex += ` \\approx ${res.decimal}`;
  }
  return tex;
}

function copyValue(res) {
  if (!res || !res.ok) return '';
  if (res.kind === 'number' && res.decimal) return res.decimal;
  return (res.text || '').replace(/\*\*/g, '^').replace(/\bI\b/g, 'i');
}

function varsNote(res) {
  const parts = [];
  if (res.vars && res.vars.length) parts.push(`Variables: ${res.vars.join(', ')}`);
  if (res.solveFor && res.vars && res.vars.length > 1) parts.push(`solved for ${res.solveFor}`);
  if (res.note) parts.push(res.note);
  return parts.length ? parts.join(' · ') : null;
}

function iconButton(icon, title, onClick) {
  const b = document.createElement('button');
  b.className = 'cas-icon-btn';
  b.title = title;
  b.innerHTML = `<span class="material-symbols-rounded">${icon}</span>`;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
  return b;
}

function outputElement(res) {
  const out = document.createElement('div');
  out.className = 'cas-out';
  if (!res) return out;
  if (res.pending) {
    out.classList.add('cas-pending');
    out.textContent = loadingMessage();
    return out;
  }
  if (!res.ok) {
    out.classList.add('cas-error');
    out.textContent = res.error || 'Something went wrong';
    return out;
  }
  out.innerHTML = renderKaTeX(resultTex(res), false);
  const note = varsNote(res);
  if (note) {
    const n = document.createElement('div');
    n.className = 'cas-note';
    n.textContent = note;
    out.appendChild(n);
  }
  return out;
}

function plotElementFor(res) {
  if (!res || !res.ok || !res.plot || !window._ui || !window._ui.createCalcPlotElement) return null;
  const plot = toPlot(res);
  delete plot.titleTex; // the row already shows the expression
  return window._ui.createCalcPlotElement(plot);
}

function buildSheet(input, preview) {
  const root = document.createElement('div');
  root.className = 'cas-sheet';

  const rowsEl = document.createElement('div');
  rowsEl.className = 'cas-rows';
  sheet.rows.forEach((row, i) => {
    const el = document.createElement('div');
    el.className = 'cas-row' + (i === editingIndex ? ' editing' : '');
    el.dataset.index = String(i);
    el.title = 'Click to edit';

    const num = document.createElement('span');
    num.className = 'cas-num';
    num.textContent = `$${i + 1}`;
    const io = document.createElement('div');
    io.className = 'cas-io';
    const inEl = document.createElement('div');
    inEl.className = 'cas-in';
    inEl.textContent = row.input;
    io.appendChild(inEl);
    io.appendChild(outputElement(row.result));

    const actions = document.createElement('div');
    actions.className = 'cas-row-actions';
    if (row.result && row.result.ok && row.result.plot) {
      actions.appendChild(iconButton('show_chart', 'Show plot', () => {
        const existing = el.querySelector('.calc-plot-wrapper');
        if (existing) { existing.remove(); }
        else {
          const plot = plotElementFor(row.result);
          if (plot) {
            io.appendChild(plot);
            if (window._ui.renderPlotsIn) window._ui.renderPlotsIn(io);
          }
        }
        if (window._ui.resizeToContent) window._ui.resizeToContent();
      }));
    }
    if (row.result && row.result.ok) {
      actions.appendChild(iconButton('content_copy', 'Copy result', (b) => {
        copyText(copyValue(row.result)).then(() => {
          const s = b.querySelector('span');
          s.textContent = 'check';
          setTimeout(() => { s.textContent = 'content_copy'; }, 1200);
        });
      }));
    }
    actions.appendChild(iconButton('delete', 'Delete row', () => deleteRow(i)));

    el.appendChild(num);
    el.appendChild(io);
    el.appendChild(actions);
    el.addEventListener('mousedown', (e) => { if (!e.target.closest('button')) e.preventDefault(); });
    el.addEventListener('click', () => editRow(i));
    rowsEl.appendChild(el);
  });
  if (sheet.rows.length) root.appendChild(rowsEl);

  // The line being typed
  const line = document.createElement('div');
  line.className = 'cas-preview' + (editingIndex !== null ? ' editing' : '');
  const num = document.createElement('span');
  num.className = 'cas-num';
  num.textContent = `$${editingIndex !== null ? editingIndex + 1 : sheet.rows.length + 1}`;
  const io = document.createElement('div');
  io.className = 'cas-io';
  if (flash) {
    io.appendChild(outputElement({ ok: false, error: flash.message }));
    flash = null;
  } else if (input) {
    io.appendChild(outputElement(preview));
    const plot = plotElementFor(preview);
    if (plot) io.appendChild(plot);
  } else {
    const hint = document.createElement('div');
    hint.className = 'cas-out cas-pending';
    hint.textContent = editingIndex !== null ? 'Type the new version of this row' : 'Type an expression, equation or definition';
    io.appendChild(hint);
  }
  line.appendChild(num);
  line.appendChild(io);
  root.appendChild(line);

  const help = document.createElement('div');
  help.className = 'cas-help';
  help.textContent = editingIndex !== null
    ? `Editing $${editingIndex + 1}: Enter saves and recalculates · Esc cancels · ↑↓ other rows`
    : 'Enter adds a row · ↑↓ edit rows · reuse results with $1 or ans · f(x) := … defines · "reset" clears';
  root.appendChild(help);
  return root;
}

// --- worksheet actions ---

function setInput(text) {
  const inputEl = document.getElementById('search-input');
  inputEl.value = text;
  inputEl.setSelectionRange(text.length, text.length);
  inputEl.focus();
  inputEl.dispatchEvent(new Event('input'));
}

function rerender(input) {
  if (!window._ui) return;
  const body = input === undefined ? currentBody() : input;
  const preview = lastPreview && lastPreview.input === body ? lastPreview.res : (body ? { pending: true } : null);
  window._ui.renderResults(worksheetResults(body, preview));
}

function currentBody() {
  const raw = document.getElementById('search-input').value;
  return window._inputRouter ? window._inputRouter.stripPrefix(raw).trim() : raw.replace(/^\s*c:\s*/i, '').trim();
}

async function commitCurrent() {
  const body = currentBody();
  if (!body) {
    if (editingIndex !== null) cancelEdit();
    return;
  }
  const index = editingIndex;
  let res;
  try {
    res = await window.trim.casCommit(body, index);
  } catch (err) {
    res = { ok: false, error: err.message || String(err) };
  }
  if (res && Array.isArray(res.rows)) { sheet = { rows: res.rows }; sheetLoaded = true; }
  if (res && res.ok) {
    editingIndex = null;
    lastPreview = null;
    setInput('c: ');
    return;
  }
  // Rejected: keep the input so it can be fixed, show why
  flash = { message: (res && res.error) || 'Could not add this row' };
  rerender(body);
}

function editRow(i) {
  if (i < 0 || i >= sheet.rows.length) return;
  editingIndex = i;
  lastPreview = null;
  setInput(`c: ${sheet.rows[i].input}`);
}

function cancelEdit() {
  editingIndex = null;
  lastPreview = null;
  setInput('c: ');
}

async function deleteRow(i) {
  let res;
  try {
    res = await window.trim.casDeleteRow(i);
  } catch {
    return;
  }
  if (res && Array.isArray(res.rows)) sheet = { rows: res.rows };
  if (editingIndex !== null) {
    if (editingIndex === i) { cancelEdit(); return; }
    if (editingIndex > i) editingIndex -= 1;
  }
  rerender();
}

/** Keyboard handling while the calculator is active. Returns true when the key was used. */
function handleKey(e) {
  if (e.key === 'Escape' && editingIndex !== null) {
    cancelEdit();
    return true;
  }
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
  if (!sheet.rows.length) return false;
  const bodyEmpty = !currentBody();
  if (!(editingIndex !== null || editorVisible || bodyEmpty)) return false;
  if (e.key === 'ArrowUp') {
    editRow(editingIndex === null ? sheet.rows.length - 1 : Math.max(0, editingIndex - 1));
  } else {
    if (editingIndex === null) return false;
    if (editingIndex + 1 >= sheet.rows.length) cancelEdit();
    else editRow(editingIndex + 1);
  }
  return true;
}

function resetEditing() {
  editingIndex = null;
  lastPreview = null;
  flash = null;
}

// --- quick results (plain arithmetic) ---

function toResults(res, input) {
  if (!res || !res.ok) {
    return [{
      type: 'calc-error',
      icon: res && res.unavailable ? 'warning' : 'error',
      title: (res && res.error) || 'Something went wrong',
      subtitle: input,
    }];
  }
  if (res.kind === 'number' && !res.decimal) {
    const title = copyValue(res);
    return [{ type: 'calc', icon: 'calculate', title, subtitle: input, action: () => copyText(title) }];
  }
  if (res.kind === 'bool') {
    return [{ type: 'calc', icon: 'calculate', title: res.text, subtitle: res.detail || input, action: () => copyText(res.text) }];
  }
  const results = [];
  const plotOnly = res.plot && (res.kind === 'plot' || res.kind === 'expr');
  if (!plotOnly) {
    const card = {
      type: 'calc-symbolic',
      icon: 'function',
      mainHtml: renderKaTeX(resultTex(res), true),
      steps: [],
      copyText: copyValue(res),
      subtitle: input,
      varsNote: varsNote(res),
    };
    card.action = () => copyText(card.copyText);
    results.push(card);
  }
  if (res.plot) results.push(toPlot(res));
  return results;
}

function toPlot(res) {
  const p = res.plot;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c8aff';
  if (p.type === '2d') {
    const v = p.vars[0];
    return {
      type: 'calc-plot',
      icon: 'show_chart',
      plotData: [{
        x: p.x, y: p.y, type: 'scatter', mode: 'lines', connectgaps: false,
        line: { color: accent, width: 2.5 },
        hovertemplate: `${v}: %{x:.3f}<br>f(${v}): %{y:.3f}<extra></extra>`,
      }],
      plotLayout: makePlotLayout2D(v),
      plotConfig: PLOT_CONFIG,
      titleTex: res.latex,
      subtitle: res.text,
      varsNote: varsNote(res),
    };
  }
  const [xv, yv] = p.vars;
  return {
    type: 'calc-plot',
    icon: 'show_chart',
    plotData: [{
      z: p.z, x: p.x, y: p.y, type: 'surface',
      colorscale: [[0, '#1e1e3f'], [0.25, '#3d3d8f'], [0.5, '#7c8aff'], [0.75, '#a8b4ff'], [1, '#e0e4ff']],
      hovertemplate: `${xv}: %{x:.2f}<br>${yv}: %{y:.2f}<br>f: %{z:.2f}<extra></extra>`,
    }],
    plotLayout: makePlotLayout3D(xv, yv),
    plotConfig: PLOT_CONFIG,
    titleTex: res.latex,
    subtitle: res.text,
    varsNote: varsNote(res),
  };
}

const PLOT_CONFIG = {
  responsive: true,
  displayModeBar: false,
  scrollZoom: true,
};

function makePlotLayout2D(variable) {
  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'rgba(255,255,255,0.03)',
    font: { color: 'rgba(255,255,255,0.85)', size: 11 },
    margin: { t: 10, r: 15, b: 35, l: 40 },
    xaxis: {
      title: variable,
      gridcolor: 'rgba(255,255,255,0.08)',
      zerolinecolor: 'rgba(255,255,255,0.2)',
      zerolinewidth: 1.5,
    },
    yaxis: {
      gridcolor: 'rgba(255,255,255,0.08)',
      zerolinecolor: 'rgba(255,255,255,0.2)',
      zerolinewidth: 1.5,
    },
    hovermode: 'closest',
    hoverlabel: {
      bgcolor: 'rgba(20, 20, 30, 0.92)',
      bordercolor: 'rgba(124, 138, 255, 0.4)',
      font: { color: '#ffffff', size: 13 },
    },
  };
}

function makePlotLayout3D(xVar, yVar) {
  const axisStyle = {
    gridcolor: 'rgba(255,255,255,0.08)',
    zerolinecolor: 'rgba(255,255,255,0.2)',
    backgroundcolor: 'rgba(255,255,255,0.02)',
    showbackground: true,
  };
  return {
    paper_bgcolor: 'transparent',
    font: { color: 'rgba(255,255,255,0.85)', size: 11 },
    margin: { t: 10, r: 10, b: 10, l: 10 },
    scene: {
      xaxis: { ...axisStyle, title: xVar },
      yaxis: { ...axisStyle, title: yVar },
      zaxis: { ...axisStyle },
      camera: { eye: { x: 1.5, y: 1.5, z: 1.2 } },
    },
    hoverlabel: {
      bgcolor: 'rgba(20, 20, 30, 0.92)',
      bordercolor: 'rgba(124, 138, 255, 0.4)',
      font: { color: '#ffffff', size: 13 },
    },
  };
}

// --- Syntax highlighting for the input overlay (cosmetic only, no evaluation) ---

const HIGHLIGHT_FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sec', 'csc', 'cot',
  'sqrt', 'cbrt', 'abs', 'log', 'ln', 'lg', 'exp', 'round', 'ceil', 'floor',
  'gcd', 'lcm', 'ggt', 'kgv', 'factorial', 'binomial', 'mod',
  'diff', 'derive', 'integrate', 'expand', 'factor', 'simplify', 'solve', 'limit', 'series',
  'apart', 'together', 'cancel', 'trigsimp', 'subs', 'plot', 'graph', 'Matrix', 'det',
]);
const HIGHLIGHT_CONSTS = new Set(['pi', 'e', 'i', 'oo', 'E', 'I', 'ans']);

// Each token: { text, type: 'func'|'const'|'number'|'op'|'unknown', start, end }
function getCalcTokens(expr) {
  const tokens = [];
  const s = expr;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '$' && i + 1 < s.length && /\d/.test(s[i + 1])) {
      const start = i;
      i++;
      while (i < s.length && /\d/.test(s[i])) i++;
      tokens.push({ text: s.slice(start, i), type: 'const', start, end: i });
    } else if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < s.length && s[i + 1] >= '0' && s[i + 1] <= '9')) {
      const start = i;
      while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) i++;
      tokens.push({ text: s.slice(start, i), type: 'number', start, end: i });
    } else if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < s.length && /[A-Za-z_0-9]/.test(s[i])) i++;
      const word = s.slice(start, i);
      const type = HIGHLIGHT_CONSTS.has(word) ? 'const'
        : HIGHLIGHT_FUNCS.has(word.toLowerCase()) ? 'func' : 'unknown';
      tokens.push({ text: word, type, start, end: i });
    } else if ('+-*/^%(),=:!'.includes(ch)) {
      tokens.push({ text: ch, type: 'op', start: i, end: i + 1 });
      i++;
    } else {
      tokens.push({ text: ch, type: 'unknown', start: i, end: i + 1 });
      i++;
    }
  }
  return tokens;
}

if (typeof window !== 'undefined') {
  window._calculator = { search, getCalcTokens, toResults, handleKey, resetEditing, isSimple };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getCalcTokens, toResults, isSimple };
}
})();
