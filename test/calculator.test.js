// Calculator verification test suite
// Uses node:test + node:assert — shows in VS Code Test Explorer
// Run: npm test

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const nerdamer = require('nerdamer');
require('nerdamer/Solve');
require('nerdamer/Calculus');
require('nerdamer/Algebra');

// ── Replicate calculator internals ──────────────────────────────────────────

const FUNC_NAMES = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sqrt', 'cbrt', 'abs', 'log', 'ln', 'exp',
  'round', 'ceil', 'floor', 'pi',
]);

const MATH_FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  log: Math.log10, ln: Math.log, exp: Math.exp,
  round: Math.round, ceil: Math.ceil, floor: Math.floor,
};
const MATH_CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(expr) {
  const out = [];
  const s = expr.replace(/\s+/g, '').replace(/,/g, '');
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
      if (MATH_CONSTS[lower] !== undefined) out.push({ type: 'num', value: MATH_CONSTS[lower] });
      else if (MATH_FUNCS[lower]) out.push({ type: 'func', name: lower });
      else return null;
    } else if ('+-*/^%()'.includes(ch)) { out.push({ type: 'op', value: ch }); i++; }
    else return null;
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
  if (peek(ctx) && peek(ctx).type === 'op' && peek(ctx).value === '-') { consume(ctx); return -parseUnary(ctx); }
  if (peek(ctx) && peek(ctx).type === 'op' && peek(ctx).value === '+') { consume(ctx); return parseUnary(ctx); }
  return parsePostfix(ctx);
}
function parsePostfix(ctx) {
  let val = parsePrimary(ctx);
  while (peek(ctx) && peek(ctx).type === 'op' && peek(ctx).value === '%') { consume(ctx); val = val / 100; }
  return val;
}
function parsePrimary(ctx) {
  const tok = peek(ctx);
  if (!tok) throw new Error('unexpected end');
  if (tok.type === 'func') {
    consume(ctx);
    const fn = MATH_FUNCS[tok.name];
    if (!peek(ctx) || peek(ctx).value !== '(') throw new Error('expected ( after function');
    consume(ctx);
    const arg = parseExpr(ctx);
    if (!peek(ctx) || peek(ctx).value !== ')') throw new Error('expected )');
    consume(ctx);
    return fn(arg);
  }
  if (tok.type === 'num') { consume(ctx); return tok.value; }
  if (tok.type === 'op' && tok.value === '(') {
    consume(ctx);
    const val = parseExpr(ctx);
    if (!peek(ctx) || peek(ctx).value !== ')') throw new Error('expected )');
    consume(ctx);
    return val;
  }
  throw new Error('unexpected token');
}
function evaluate(expr) {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return undefined;
  const ctx = { tokens, pos: 0 };
  const result = parseExpr(ctx);
  if (ctx.pos < ctx.tokens.length) return undefined;
  return result;
}

function prepareForNerdamer(expr) {
  let result = '';
  let i = 0;
  while (i < expr.length) {
    const prevIsAlnum = i > 0 && /[a-zA-Z0-9_]/.test(expr[i - 1]);
    if (!prevIsAlnum && expr.slice(i, i + 3) === 'ln(') {
      result += 'log('; i += 3;
    } else if (!prevIsAlnum && expr.slice(i, i + 4) === 'log(') {
      const closeIdx = findClosingParen(expr, i + 4);
      if (closeIdx === -1) { result += expr[i]; i++; continue; }
      const inner = expr.slice(i + 4, closeIdx);
      result += `(log(${inner})/log(10))`;
      i = closeIdx + 1;
    } else { result += expr[i]; i++; }
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

function nerdEval(expr, vars) {
  return Number(nerdamer(prepareForNerdamer(expr), vars).evaluate().valueOf());
}

function solveFor(equation, variable) {
  const nExpr = prepareForNerdamer(equation);
  const sol = nerdamer.solve(nExpr, variable).toString();
  return sol.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
}

function diff(expr, variable) {
  const nExpr = prepareForNerdamer(expr);
  return nerdamer(`diff(${nExpr}, ${variable || 'x'})`).toString();
}

function integrate(expr, variable) {
  let nExpr = prepareForNerdamer(expr);
  const v = variable || 'x';
  nExpr = nExpr.replace(new RegExp(`\\s*d${v}$`), '').trim();
  return nerdamer(`integrate(${nExpr}, ${v})`).toString();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function approx(actual, expected, tol = 1e-6) {
  assert.ok(
    isFinite(actual) && Math.abs(actual - expected) < tol,
    `expected ≈${expected}, got ${actual}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Numeric Evaluation', () => {
  it('basic arithmetic: 2 + 3 * 4 = 14', () => {
    assert.equal(evaluate('2 + 3 * 4'), 14);
  });

  it('nested parens: (2 + 3) * (4 - 1) = 15', () => {
    assert.equal(evaluate('(2 + 3) * (4 - 1)'), 15);
  });

  it('exponent: 2^10 = 1024', () => {
    assert.equal(evaluate('2^10'), 1024);
  });

  it('right-assoc exponent: 2^3^2 = 512', () => {
    assert.equal(evaluate('2^3^2'), 512);
  });

  it('unary minus: -3 + 5 = 2', () => {
    assert.equal(evaluate('-3 + 5'), 2);
  });

  it('percentage: 200 * 50% = 100', () => {
    assert.equal(evaluate('200 * 50%'), 100);
  });

  it('sin(pi/2) = 1', () => {
    approx(evaluate('sin(pi/2)'), 1);
  });

  it('cos(0) = 1', () => {
    assert.equal(evaluate('cos(0)'), 1);
  });

  it('tan(pi/4) ≈ 1', () => {
    approx(evaluate('tan(pi/4)'), 1);
  });

  it('log(100) = 2 (base-10)', () => {
    approx(evaluate('log(100)'), 2);
  });

  it('ln(e) = 1 (natural log)', () => {
    approx(evaluate('ln(e)'), 1);
  });

  it('sqrt(144) = 12', () => {
    assert.equal(evaluate('sqrt(144)'), 12);
  });

  it('cbrt(27) = 3', () => {
    assert.equal(evaluate('cbrt(27)'), 3);
  });

  it('abs(-42) = 42', () => {
    assert.equal(evaluate('abs(-42)'), 42);
  });

  it('complex: sqrt(2^6) + 3*4 - 1 = 19', () => {
    assert.equal(evaluate('sqrt(2^6) + 3*4 - 1'), 19);
  });

  it('chained: (1+2)*(3+4)/(5-2) = 7', () => {
    assert.equal(evaluate('(1+2)*(3+4)/(5-2)'), 7);
  });

  it('division precision: 1/3', () => {
    approx(evaluate('1/3'), 1 / 3);
  });

  it('exp(1) ≈ e', () => {
    approx(evaluate('exp(1)'), Math.E);
  });

  it('asin(1) = pi/2', () => {
    approx(evaluate('asin(1)'), Math.PI / 2);
  });

  it('sin(pi/6) ≈ 0.5', () => {
    approx(evaluate('sin(pi/6)'), 0.5);
  });

  it('2^-3 = 0.125', () => {
    assert.equal(evaluate('2^-3'), 0.125);
  });

  it('floor(3.7) = 3', () => {
    assert.equal(evaluate('floor(3.7)'), 3);
  });

  it('ceil(3.2) = 4', () => {
    assert.equal(evaluate('ceil(3.2)'), 4);
  });

  it('round(3.5) = 4', () => {
    assert.equal(evaluate('round(3.5)'), 4);
  });
});

describe('Plot Evaluation (nerdamer)', () => {
  it('sin(x) at x=pi/2 ≈ 1', () => {
    approx(nerdEval('sin(x)', { x: Math.PI / 2 }), 1);
  });

  it('sin(x) at x=-pi/2 ≈ -1 (negative values)', () => {
    approx(nerdEval('sin(x)', { x: -Math.PI / 2 }), -1);
  });

  it('cos(x) at x=pi ≈ -1', () => {
    approx(nerdEval('cos(x)', { x: Math.PI }), -1);
  });

  it('x^3 at x=-2 = -8', () => {
    approx(nerdEval('x^3', { x: -2 }), -8);
  });

  it('ln(x) at x=e ≈ 1', () => {
    approx(nerdEval('ln(x)', { x: Math.E }), 1);
  });

  it('ln(x) at x=1 = 0', () => {
    approx(nerdEval('ln(x)', { x: 1 }), 0);
  });

  it('log(x) at x=100 ≈ 2 (base-10)', () => {
    approx(nerdEval('log(x)', { x: 100 }), 2);
  });

  it('log(x) at x=1000 ≈ 3', () => {
    approx(nerdEval('log(x)', { x: 1000 }), 3, 1e-4);
  });

  it('x^2 - 4 at x=3 = 5', () => {
    approx(nerdEval('x^2 - 4', { x: 3 }), 5);
  });

  it('sin(x)^2 + cos(x)^2 ≡ 1 (identity)', () => {
    approx(nerdEval('sin(x)^2 + cos(x)^2', { x: 1.7 }), 1);
  });

  it('sqrt(x) at x=9 = 3', () => {
    approx(nerdEval('sqrt(x)', { x: 9 }), 3);
  });

  it('abs(x) at x=-7 = 7', () => {
    approx(nerdEval('abs(x)', { x: -7 }), 7);
  });

  it('e^(-x^2) at x=0 = 1 (Gaussian)', () => {
    approx(nerdEval('e^(-x^2)', { x: 0 }), 1);
  });

  it('tan(x) at x=pi/4 ≈ 1', () => {
    approx(nerdEval('tan(x)', { x: Math.PI / 4 }), 1);
  });

  it('x*sin(x) at x=pi ≈ 0', () => {
    approx(nerdEval('x*sin(x)', { x: Math.PI }), 0, 1e-5);
  });

  it('3D: x^2 + y^2 at (3,4) = 25', () => {
    approx(nerdEval('x^2 + y^2', { x: 3, y: 4 }), 25);
  });

  it('3D: sin(x)*cos(y) at (0,0) = 0', () => {
    approx(nerdEval('sin(x)*cos(y)', { x: 0, y: 0 }), 0);
  });

  it('3D: x*y at (-2,3) = -6', () => {
    approx(nerdEval('x*y', { x: -2, y: 3 }), -6);
  });
});

describe('Equation Solving', () => {
  it('x^2 - 4 = 0 → x=±2', () => {
    const s = solveFor('x^2-4=0', 'x').map(Number).sort((a, b) => a - b);
    assert.equal(s.length, 2);
    assert.equal(s[0], -2);
    assert.equal(s[1], 2);
  });

  it('2x + 6 = 0 → x=-3', () => {
    const s = solveFor('2*x+6=0', 'x');
    assert.equal(s.length, 1);
    assert.equal(Number(s[0]), -3);
  });

  it('x^2 - 5x + 6 = 0 → x=2,3', () => {
    const s = solveFor('x^2-5*x+6=0', 'x').map(Number).sort((a, b) => a - b);
    assert.equal(s.length, 2);
    assert.equal(s[0], 2);
    assert.equal(s[1], 3);
  });

  it('x^3 - x = 0 → x=0,±1', () => {
    const s = solveFor('x^3-x=0', 'x').map(Number).sort((a, b) => a - b);
    assert.deepEqual(s, [-1, 0, 1]);
  });

  it('x^2 = 9 → x=±3', () => {
    const s = solveFor('x^2=9', 'x').map(Number).sort((a, b) => a - b);
    assert.deepEqual(s, [-3, 3]);
  });

  it('3x - 7 = 2x + 1 → x=8', () => {
    const s = solveFor('3*x-7=2*x+1', 'x');
    assert.equal(Number(s[0]), 8);
  });

  it('quadratic with irrational roots: x^2-2=0', () => {
    const s = solveFor('x^2-2=0', 'x').map(v => Number(nerdamer(v).evaluate().valueOf()));
    s.sort((a, b) => a - b);
    assert.equal(s.length, 2);
    approx(s[0], -Math.SQRT2);
    approx(s[1], Math.SQRT2);
  });
});

describe('Differentiation', () => {
  it('diff(x^3) = 3*x^2', () => {
    assert.equal(diff('x^3'), '3*x^2');
  });

  it('diff(sin(x)) = cos(x)', () => {
    assert.equal(diff('sin(x)'), 'cos(x)');
  });

  it('diff(cos(x)) = -sin(x)', () => {
    assert.equal(diff('cos(x)'), '-sin(x)');
  });

  it('diff(e^x) = e^x', () => {
    assert.equal(diff('e^x'), 'e^x');
  });

  it('diff(ln(x)) = 1/x', () => {
    const r = diff('ln(x)');
    assert.ok(r === 'x^(-1)' || r === '1/x', `got ${r}`);
  });

  it('diff(log(x)) includes log(10) chain rule', () => {
    assert.ok(diff('log(x)').includes('log(10)'));
  });

  it('diff(x^2*sin(x)) product rule', () => {
    const r = diff('x^2*sin(x)');
    assert.ok(r.includes('sin(x)') && r.includes('cos(x)'), `got ${r}`);
  });

  it('diff(sqrt(x)) = 1/(2*sqrt(x))', () => {
    const val = Number(nerdamer(diff('sqrt(x)'), { x: 4 }).evaluate().valueOf());
    approx(val, 0.25);
  });

  it('diff(tan(x)) = sec^2(x) numerically', () => {
    const val = Number(nerdamer(diff('tan(x)'), { x: 1 }).evaluate().valueOf());
    approx(val, 1 / (Math.cos(1) ** 2));
  });
});

describe('Integration', () => {
  it('integrate(x^2) contains x^3', () => {
    assert.ok(integrate('x^2').includes('x^3'));
  });

  it('integrate(sin(x)) = -cos(x)', () => {
    assert.equal(integrate('sin(x)'), '-cos(x)');
  });

  it('integrate(cos(x)) = sin(x)', () => {
    assert.equal(integrate('cos(x)'), 'sin(x)');
  });

  it('integrate(e^x) = e^x', () => {
    assert.equal(integrate('e^x'), 'e^x');
  });

  it('integrate(1/x) contains log', () => {
    assert.ok(integrate('1/x').includes('log'));
  });

  it('integrate(x^2 dx) strips dx', () => {
    assert.ok(integrate('x^2 dx').includes('x^3'));
  });

  it('integrate(sin(t) dt) strips dt', () => {
    assert.equal(integrate('sin(t) dt', 't'), '-cos(t)');
  });
});

describe('Factor / Expand / Simplify', () => {
  it('factor(x^2 - 4) = (x-2)(x+2)', () => {
    const r = nerdamer('factor(x^2-4)').toString();
    assert.ok(
      (r.includes('x-2') || r.includes('-2+x')) && (r.includes('x+2') || r.includes('2+x')),
      `got ${r}`
    );
  });

  it('expand((x+1)^3) contains x^3 and 3*x^2', () => {
    const r = nerdamer('expand((x+1)^3)').toString();
    assert.ok(r.includes('x^3') && r.includes('3*x^2'), `got ${r}`);
  });

  it('simplify(sin(x)^2 + cos(x)^2) = 1', () => {
    assert.equal(nerdamer('simplify(sin(x)^2+cos(x)^2)').toString(), '1');
  });

  it('factor(x^3 - 27) contains (x-3)', () => {
    const r = nerdamer('factor(x^3-27)').toString();
    assert.ok(r.includes('x-3') || r.includes('-3+x'), `got ${r}`);
  });

  it('expand((a+b)*(a-b)) = a^2 - b^2', () => {
    const r = nerdamer('expand((a+b)*(a-b))').toString();
    assert.ok(r.includes('a^2') && r.includes('b^2'), `got ${r}`);
  });
});

describe('Combined & Edge Cases', () => {
  it('ln + trig: ln(x) + sin(x) at x=1', () => {
    approx(nerdEval('ln(x) + sin(x)', { x: 1 }), Math.log(1) + Math.sin(1));
  });

  it('log + polynomial: log(x) + x^2 at x=10', () => {
    approx(nerdEval('log(x) + x^2', { x: 10 }), 101);
  });

  it('nested: sin(ln(x)) at x=e', () => {
    approx(nerdEval('sin(ln(x))', { x: Math.E }), Math.sin(1));
  });

  it('nested: log(sin(x)+2) at x=0', () => {
    approx(nerdEval('log(sin(x)+2)', { x: 0 }), Math.log10(2));
  });

  it('negative results: cos(pi) = -1', () => {
    approx(nerdEval('cos(x)', { x: Math.PI }), -1);
  });

  it('large negative: x^3 at x=-10 = -1000', () => {
    approx(nerdEval('x^3', { x: -10 }), -1000);
  });

  it('diff(ln(x) + sin(x)) combined', () => {
    const r = diff('ln(x) + sin(x)');
    assert.ok(r.includes('cos(x)') && r.includes('x'), `got ${r}`);
  });

  it('diff(x^2*ln(x)) product rule with ln', () => {
    const val = Number(nerdamer(diff('x^2*ln(x)'), { x: 1 }).evaluate().valueOf());
    approx(val, 1); // 2*1*ln(1) + 1 = 1
  });

  it('prepareForNerdamer preserves non-log functions', () => {
    assert.equal(prepareForNerdamer('sin(x) + cos(x)'), 'sin(x) + cos(x)');
  });

  it('prepareForNerdamer nested log: sin(log(x))', () => {
    assert.equal(prepareForNerdamer('sin(log(x))'), 'sin((log(x)/log(10)))');
  });
});
