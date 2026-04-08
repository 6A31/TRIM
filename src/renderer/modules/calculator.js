// Unified c: math engine - evaluate, solve, differentiate, integrate, factor, expand, plot
// Auto-detects input type and returns appropriate results with KaTeX rendering

// --- Detection keywords ---
const KEYWORD_OPS = {
  derive: 'diff', diff: 'diff', differentiate: 'diff',
  integrate: 'integrate', integral: 'integrate',
  factor: 'factor',
  expand: 'expand',
  simplify: 'simplify',
};
const PLOT_KEYWORDS = ['plot', 'graph'];

// Variable pattern - single letters commonly used in math (not function names)
const FUNC_NAMES = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sqrt', 'cbrt', 'abs', 'log', 'ln', 'exp',
  'round', 'ceil', 'floor', 'pi',
  'gcd', 'lcm', 'ggt', 'kgv',
]);

function hasVariables(expr) {
  // Match standalone letters that aren't function names or constants
  const tokens = expr.match(/[a-zA-Z]+/g);
  if (!tokens) return false;
  return tokens.some(t => !FUNC_NAMES.has(t.toLowerCase()) && t.toLowerCase() !== 'e');
}

function getVariables(expr) {
  const tokens = expr.match(/[a-zA-Z]+/g);
  if (!tokens) return [];
  const vars = [];
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (!FUNC_NAMES.has(lower) && lower !== 'e' && !vars.includes(t)) {
      vars.push(t);
    }
  }
  return vars;
}

// --- Expression preprocessing for nerdamer compatibility ---
// Nerdamer uses 'log' for natural logarithm. Our calculator convention:
//   ln(x)  = natural log  → nerdamer: log(x)
//   log(x) = base-10 log  → nerdamer: log(x)/log(10)
function prepareForNerdamer(expr) {
  // Alias German terms before other transformations
  expr = expr.replace(/\bggt\(/gi, 'gcd(').replace(/\bkgv\(/gi, 'lcm(');
  let result = '';
  let i = 0;
  while (i < expr.length) {
    const prevIsAlnum = i > 0 && /[a-zA-Z0-9_]/.test(expr[i - 1]);
    if (!prevIsAlnum && expr.slice(i, i + 3) === 'ln(') {
      result += 'log(';
      i += 3;
    } else if (!prevIsAlnum && expr.slice(i, i + 4) === 'log(') {
      const closeIdx = findClosingParen(expr, i + 4);
      if (closeIdx === -1) { result += expr[i]; i++; continue; }
      const inner = expr.slice(i + 4, closeIdx);
      result += `(log(${inner})/log(10))`;
      i = closeIdx + 1;
    } else {
      result += expr[i];
      i++;
    }
  }
  return result;
}

function findClosingParen(str, start) {
  let depth = 1;
  for (let i = start; i < str.length; i++) {
    if (str[i] === '(') depth++;
    if (str[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// --- Internal debounce for heavy operations ---
let heavyTimer = null;
let lastHeavyResult = null;

function search(expression) {
  if (!expression.trim()) return [];
  const trimmed = expression.trim();
  const detected = detectMathMode(trimmed);

  // Pure numeric - instant, no debounce
  if (detected.mode === 'evaluate') {
    clearTimeout(heavyTimer);
    lastHeavyResult = null;
    return handleEvaluate(trimmed);
  }

  // Heavy operations - debounce internally
  return handleHeavy(detected);
}

function detectMathMode(expr) {
  const lower = expr.toLowerCase();

  // 1. Check for plot/graph keyword
  for (const kw of PLOT_KEYWORDS) {
    if (lower.startsWith(kw + ' ') || lower.startsWith(kw + '(')) {
      return { mode: 'plot', expr: expr.slice(kw.length).trim(), explicit: true };
    }
  }

  // 2. Check for symbolic operation keyword
  for (const [keyword, op] of Object.entries(KEYWORD_OPS)) {
    if (lower.startsWith(keyword + ' ') || lower.startsWith(keyword + '(')) {
      return { mode: 'symbolic', op, expr: expr.slice(keyword.length).trim() };
    }
  }

  // 3. Has = and variables → solve
  if (expr.includes('=') && hasVariables(expr)) {
    return { mode: 'solve', expr };
  }

  // 4. Has variables, no = → plot
  if (hasVariables(expr)) {
    const vars = getVariables(expr);
    return { mode: 'plot', expr, explicit: false, vars };
  }

  // 5. Pure numeric
  return { mode: 'evaluate', expr };
}

// --- Evaluate (existing recursive-descent parser) ---

function handleEvaluate(expression) {
  try {
    const result = evaluate(expression);
    if (result === undefined || result === null || !isFinite(result)) return [];
    const formatted = typeof result === 'number'
      ? Number.isInteger(result) ? result.toString() : parseFloat(result.toPrecision(12)).toString()
      : String(result);

    return [{
      type: 'calc',
      icon: 'calculate',
      title: formatted,
      subtitle: expression.trim(),
      action: () => navigator.clipboard.writeText(formatted),
    }];
  } catch {
    return [];
  }
}

// --- Heavy operations (symbolic, solve, plot) ---

function handleHeavy(detected) {
  if (typeof nerdamer === 'undefined') return [];

  try {
    switch (detected.mode) {
      case 'solve': return handleSolve(detected);
      case 'symbolic': return handleSymbolic(detected);
      case 'plot': return handlePlot(detected);
      default: return [];
    }
  } catch {
    return [];
  }
}

// --- Solve equations ---

function handleSolve(detected) {
  const expr = detected.expr;
  const nExpr = prepareForNerdamer(expr);
  const vars = getVariables(expr);
  const solveVar = vars[0] || 'x';

  let solutions;
  try {
    solutions = nerdamer.solve(nExpr, solveVar);
  } catch {
    return [];
  }

  const solStr = solutions.toString();
  if (!solStr || solStr === '[]') return [];

  // Parse solutions from [a,b,c] format
  const solArray = solStr.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);

  // Build KaTeX HTML for the main result
  const solTexParts = solArray.map(s => {
    try { return nerdamer(s).toTeX(); } catch { return s; }
  });
  const mainTex = solTexParts.length === 1
    ? `${solveVar} = ${solTexParts[0]}`
    : solTexParts.map(t => `${solveVar} = ${t}`).join(', \\quad ');

  const mainHtml = renderKaTeX(mainTex, true);

  // Build steps
  const steps = buildSolveSteps(nExpr, solveVar, solArray);

  const copyText = solTexParts.length === 1
    ? `${solveVar} = ${solArray[0]}`
    : solArray.map(s => `${solveVar} = ${s}`).join(', ');

  return [{
    type: 'calc-symbolic',
    icon: 'function',
    mainHtml,
    steps,
    copyText,
    subtitle: expr,
    varsNote: vars.length > 0 ? `Variables: ${vars.join(', ')}` : null,
  }];
}

function buildSolveSteps(nExpr, variable, solutions) {
  const steps = [];

  // Step 1: Original equation
  try {
    const origTex = nExpr.includes('=')
      ? nExpr.split('=').map(s => { try { return nerdamer(s.trim()).toTeX(); } catch { return s.trim(); } }).join(' = ')
      : nerdamer(nExpr).toTeX() + ' = 0';
    steps.push({ label: 'Given', tex: origTex });
  } catch {
    steps.push({ label: 'Given', tex: nExpr });
  }

  // Step 2: Simplify/rearrange if equation form
  if (nExpr.includes('=')) {
    const [lhs, rhs] = nExpr.split('=').map(s => s.trim());
    try {
      const simplified = nerdamer(`${lhs}-(${rhs})`).toTeX();
      steps.push({ label: 'Rearranged', tex: `${simplified} = 0` });
    } catch { /* skip */ }
  }

  // Step 3: Show solutions
  for (let i = 0; i < solutions.length; i++) {
    try {
      const tex = nerdamer(solutions[i]).toTeX();
      steps.push({ label: solutions.length > 1 ? `Solution ${i + 1}` : 'Solution', tex: `${variable} = ${tex}` });
    } catch {
      steps.push({ label: `Solution ${i + 1}`, tex: `${variable} = ${solutions[i]}` });
    }
  }

  return steps;
}

// --- Symbolic operations (diff, integrate, factor, expand, simplify) ---

function handleSymbolic(detected) {
  const { op, expr } = detected;
  const vars = getVariables(expr);
  const mainVar = vars[0] || 'x';
  const nExpr = prepareForNerdamer(expr);

  let result;
  try {
    if (op === 'diff') {
      result = nerdamer(`diff(${nExpr}, ${mainVar})`);
    } else if (op === 'integrate') {
      // Strip trailing dx, dt, etc.
      const cleanExpr = nExpr.replace(new RegExp(`\\s*d${mainVar}$`), '').trim();
      result = nerdamer(`integrate(${cleanExpr}, ${mainVar})`);
    } else {
      result = nerdamer(`${op}(${nExpr})`);
    }
  } catch {
    return [];
  }

  const resultTex = result.toTeX();
  let inputTex;
  try { inputTex = nerdamer(nExpr).toTeX(); } catch { inputTex = expr; }

  // Build display with operation notation
  let displayTex;
  if (op === 'diff') {
    displayTex = `\\frac{d}{d${mainVar}}\\left(${inputTex}\\right) = ${resultTex}`;
  } else if (op === 'integrate') {
    displayTex = `\\int ${inputTex} \\, d${mainVar} = ${resultTex} + C`;
  } else if (op === 'factor') {
    displayTex = `\\text{factor}\\left(${inputTex}\\right) = ${resultTex}`;
  } else if (op === 'expand') {
    displayTex = `\\text{expand}\\left(${inputTex}\\right) = ${resultTex}`;
  } else if (op === 'simplify') {
    displayTex = `\\text{simplify}\\left(${inputTex}\\right) = ${resultTex}`;
  } else {
    displayTex = `${inputTex} = ${resultTex}`;
  }

  const mainHtml = renderKaTeX(displayTex, true);

  // Steps for calculus operations
  const steps = [];
  if (op === 'diff') {
    steps.push({ label: 'Input', tex: `f(${mainVar}) = ${inputTex}` });
    steps.push({ label: 'Derivative', tex: `f'(${mainVar}) = ${resultTex}` });
  } else if (op === 'integrate') {
    steps.push({ label: 'Input', tex: `f(${mainVar}) = ${inputTex}` });
    steps.push({ label: 'Integral', tex: `F(${mainVar}) = ${resultTex} + C` });
  }

  const copyText = result.toString();

  return [{
    type: 'calc-symbolic',
    icon: 'function',
    mainHtml,
    steps,
    copyText,
    subtitle: `${op}(${expr})`,
  }];
}

// --- Plot ---

function handlePlot(detected) {
  if (typeof Plotly === 'undefined') return [];

  const expr = detected.expr;
  const vars = detected.vars || getVariables(expr);

  // Determine 2D vs 3D
  const is3D = vars.length >= 2;

  if (is3D) {
    return buildPlot3D(expr, vars);
  }
  return buildPlot2D(expr, vars[0] || 'x');
}

function buildPlot2D(expr, variable) {
  const nExpr = prepareForNerdamer(expr);
  // Generate data points
  const xMin = -10, xMax = 10, steps = 500;
  const xVals = [], yVals = [];
  const step = (xMax - xMin) / steps;

  for (let i = 0; i <= steps; i++) {
    const xVal = xMin + i * step;
    try {
      const yNum = Number(nerdamer(nExpr, { [variable]: xVal }).evaluate().valueOf());
      xVals.push(xVal);
      yVals.push(isFinite(yNum) ? yNum : null);
    } catch {
      xVals.push(xVal);
      yVals.push(null);
    }
  }

  // Build LaTeX title
  let titleTex = '';
  try { titleTex = nerdamer(nExpr).toTeX(); } catch { titleTex = expr; }

  const plotData = [{
    x: xVals,
    y: yVals,
    type: 'scatter',
    mode: 'lines',
    line: { color: '#7c8aff', width: 2.5 },
    hovertemplate: `${variable}: %{x:.3f}<br>f(${variable}): %{y:.3f}<extra></extra>`,
    connectgaps: false,
  }];

  const vars = getVariables(expr);
  return [{
    type: 'calc-plot',
    icon: 'show_chart',
    plotData,
    plotLayout: makePlotLayout2D(variable),
    plotConfig: PLOT_CONFIG,
    titleTex,
    subtitle: expr,
    varsNote: vars.length > 0 ? `Variables: ${vars.join(', ')}` : null,
  }];
}

function buildPlot3D(expr, vars) {
  const nExpr = prepareForNerdamer(expr);
  const xVar = vars[0], yVar = vars[1];
  const min = -5, max = 5, n = 60;
  const step = (max - min) / n;

  const zData = [];
  const xRange = [], yRange = [];

  for (let i = 0; i <= n; i++) xRange.push(min + i * step);
  for (let j = 0; j <= n; j++) yRange.push(min + j * step);

  for (let j = 0; j <= n; j++) {
    const row = [];
    for (let i = 0; i <= n; i++) {
      try {
        const zNum = Number(nerdamer(nExpr, { [xVar]: xRange[i], [yVar]: yRange[j] }).evaluate().valueOf());
        row.push(isFinite(zNum) ? zNum : null);
      } catch {
        row.push(null);
      }
    }
    zData.push(row);
  }

  let titleTex = '';
  try { titleTex = nerdamer(nExpr).toTeX(); } catch { titleTex = expr; }

  const plotData = [{
    z: zData,
    x: xRange,
    y: yRange,
    type: 'surface',
    colorscale: [
      [0, '#1e1e3f'],
      [0.25, '#3d3d8f'],
      [0.5, '#7c8aff'],
      [0.75, '#a8b4ff'],
      [1, '#e0e4ff'],
    ],
    hovertemplate: `${xVar}: %{x:.2f}<br>${yVar}: %{y:.2f}<br>f: %{z:.2f}<extra></extra>`,
  }];

  const allVars = getVariables(expr);
  return [{
    type: 'calc-plot',
    icon: 'show_chart',
    plotData,
    plotLayout: makePlotLayout3D(xVar, yVar),
    plotConfig: PLOT_CONFIG,
    titleTex,
    subtitle: expr,
    varsNote: allVars.length > 0 ? `Variables: ${allVars.join(', ')}` : null,
  }];
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

// --- KaTeX rendering helper ---

function renderKaTeX(tex, displayMode) {
  if (typeof katex === 'undefined') return tex;
  try {
    return katex.renderToString(tex, { displayMode: !!displayMode, throwOnError: false });
  } catch {
    return tex;
  }
}

// --- Existing recursive-descent parser (kept for fast numeric eval) ---

const MATH_FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  log: Math.log10, ln: Math.log, exp: Math.exp,
  round: Math.round, ceil: Math.ceil, floor: Math.floor,
};

function _gcd(a, b) { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) { [a, b] = [b, a % b]; } return a; }
function _lcm(a, b) { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); return a && b ? (a / _gcd(a, b)) * b : 0; }

const MATH_FUNCS_2 = {
  gcd: _gcd, ggt: _gcd,
  lcm: _lcm, kgv: _lcm,
};

const MATH_CONSTS = { pi: Math.PI, e: Math.E };

function evaluate(expr) {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return undefined;
  const ctx = { tokens, pos: 0 };
  const result = parseExpr(ctx);
  if (ctx.pos < ctx.tokens.length) return undefined;
  return result;
}

function tokenize(expr) {
  const out = [];
    const s = expr.replace(/\s+/g, '');
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < s.length && s[i + 1] >= '0' && s[i + 1] <= '9')) {
      let num = '';
      while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) { num += s[i++]; }
      out.push({ type: 'num', value: parseFloat(num) });
    } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      let id = '';
      while (i < s.length && ((s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z'))) { id += s[i++]; }
      const lower = id.toLowerCase();
      if (MATH_CONSTS[lower] !== undefined) {
        out.push({ type: 'num', value: MATH_CONSTS[lower] });
      } else if (MATH_FUNCS[lower] || MATH_FUNCS_2[lower]) {
        out.push({ type: 'func', name: lower });
      } else {
        return null;
      }
    } else if ('+-*/^%(),'.includes(ch)) {
      out.push({ type: 'op', value: ch });
      i++;
    } else {
      return null;
    }
  }
  return out;
}

function peek(ctx) { return ctx.pos < ctx.tokens.length ? ctx.tokens[ctx.pos] : null; }
function consume(ctx) { return ctx.tokens[ctx.pos++]; }

function parseExpr(ctx) {
  let left = parseTerm(ctx);
  while (peek(ctx) && peek(ctx).type === 'op' && (peek(ctx).value === '+' || peek(ctx).value === '-')) {
    const op = consume(ctx).value;
    const right = parseTerm(ctx);
    left = op === '+' ? left + right : left - right;
  }
  return left;
}

function parseTerm(ctx) {
  let left = parseExponent(ctx);
  while (peek(ctx) && peek(ctx).type === 'op' && (peek(ctx).value === '*' || peek(ctx).value === '/')) {
    const op = consume(ctx).value;
    const right = parseExponent(ctx);
    left = op === '*' ? left * right : left / right;
  }
  return left;
}

function parseExponent(ctx) {
  const base = parseUnary(ctx);
  if (peek(ctx) && peek(ctx).type === 'op' && peek(ctx).value === '^') {
    consume(ctx);
    const exp = parseExponent(ctx);
    return Math.pow(base, exp);
  }
  return base;
}

function parseUnary(ctx) {
  if (peek(ctx) && peek(ctx).type === 'op' && peek(ctx).value === '-') {
    consume(ctx);
    return -parseUnary(ctx);
  }
  if (peek(ctx) && peek(ctx).type === 'op' && peek(ctx).value === '+') {
    consume(ctx);
    return parseUnary(ctx);
  }
  return parsePostfix(ctx);
}

function parsePostfix(ctx) {
  let val = parsePrimary(ctx);
  while (peek(ctx) && peek(ctx).type === 'op' && peek(ctx).value === '%') {
    consume(ctx);
    val = val / 100;
  }
  return val;
}

function parsePrimary(ctx) {
  const tok = peek(ctx);
  if (!tok) throw new Error('unexpected end');

  if (tok.type === 'func') {
    consume(ctx);
    const fn2 = MATH_FUNCS_2[tok.name];
    const fn = MATH_FUNCS[tok.name];
    if (!peek(ctx) || peek(ctx).value !== '(') throw new Error('expected ( after function');
    consume(ctx);
    const arg1 = parseExpr(ctx);
    if (fn2 && peek(ctx) && peek(ctx).value === ',') {
      consume(ctx);
      const arg2 = parseExpr(ctx);
      if (!peek(ctx) || peek(ctx).value !== ')') throw new Error('expected )');
      consume(ctx);
      return fn2(arg1, arg2);
    }
    if (!peek(ctx) || peek(ctx).value !== ')') throw new Error('expected )');
    consume(ctx);
    return fn(arg1);
  }

  if (tok.type === 'num') {
    consume(ctx);
    return tok.value;
  }

  if (tok.type === 'op' && tok.value === '(') {
    consume(ctx);
    const val = parseExpr(ctx);
    if (!peek(ctx) || peek(ctx).value !== ')') throw new Error('expected )');
    consume(ctx);
    return val;
  }

  throw new Error('unexpected token');
}

if (typeof window !== 'undefined') {
  window._calculator = { search };
}

// Allow tests to import internals directly
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { search, evaluate, prepareForNerdamer, findClosingParen, hasVariables, getVariables, detectMathMode };
}
