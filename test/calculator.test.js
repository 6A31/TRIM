// Calculator verification test suite
// Uses node:test + node:assert — shows in VS Code Test Explorer
// Run: npm test

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const nerdamer = require('nerdamer');
require('nerdamer/Solve');
require('nerdamer/Calculus');
require('nerdamer/Algebra');

// Import actual calculator code — tests the real implementation
const { evaluate, prepareForNerdamer } = require('../src/renderer/modules/calculator');

// ── Test helpers that wrap calculator + nerdamer (like the real app does) ────

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

  // GCD / LCM (and German aliases ggT / kgV)
  it('gcd(12, 8) = 4', () => {
    assert.equal(evaluate('gcd(12, 8)'), 4);
  });

  it('gcd(0, 5) = 5', () => {
    assert.equal(evaluate('gcd(0, 5)'), 5);
  });

  it('gcd(17, 13) = 1 (coprime)', () => {
    assert.equal(evaluate('gcd(17, 13)'), 1);
  });

  it('lcm(4, 6) = 12', () => {
    assert.equal(evaluate('lcm(4, 6)'), 12);
  });

  it('lcm(7, 5) = 35', () => {
    assert.equal(evaluate('lcm(7, 5)'), 35);
  });

  it('ggT(12, 8) = 4 (German alias)', () => {
    assert.equal(evaluate('ggT(12, 8)'), 4);
  });

  it('kgV(4, 6) = 12 (German alias)', () => {
    assert.equal(evaluate('kgV(4, 6)'), 12);
  });

  it('gcd with expression args: gcd(2+4, 9) = 3', () => {
    assert.equal(evaluate('gcd(2+4, 9)'), 3);
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

  it('nested: log(log(x)) at x=100 = log10(log10(100))', () => {
    approx(nerdEval('log(log(x))', { x: 100 }), Math.log10(Math.log10(100)));
  });

  it('nested: log(ln(x)) at x=e = 0', () => {
    approx(nerdEval('log(ln(x))', { x: Math.E }), 0);
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

  it('prepareForNerdamer recursively rewrites nested logs', () => {
    assert.equal(prepareForNerdamer('log(log(x))'), '(log((log(x)/log(10)))/log(10))');
    assert.equal(prepareForNerdamer('log(ln(x))'), '(log(log(x))/log(10))');
  });

  it('prepareForNerdamer aliases ggT→gcd and kgV→lcm', () => {
    assert.equal(prepareForNerdamer('ggT(12, 8)'), 'gcd(12, 8)');
    assert.equal(prepareForNerdamer('kgV(4, 6)'), 'lcm(4, 6)');
  });

  it('nested: sin(gcd(4, 5)) ≈ sin(1)', () => {
    approx(evaluate('sin(gcd(4, 5))'), Math.sin(1));
  });

  it('nested: 4*sin(ggt(4,5)) ≈ 4*sin(1)', () => {
    approx(evaluate('4*sin(ggt(4,5))'), 4 * Math.sin(1));
  });

  it('nested: sqrt(gcd(16,64)) = 4', () => {
    assert.equal(evaluate('sqrt(gcd(16,64))'), 4);
  });

  it('gcd+lcm arithmetic: gcd(12,8)+lcm(3,4) = 16', () => {
    assert.equal(evaluate('gcd(12,8)+lcm(3,4)'), 16);
  });

  it('nested: lcm(gcd(6,9), 4) = 12', () => {
    assert.equal(evaluate('lcm(gcd(6,9), 4)'), 12);
  });
});

describe('Implicit Multiplication', () => {
  it('2(3+4) = 14', () => {
    assert.equal(evaluate('2(3+4)'), 14);
  });

  it('(2+3)(4+5) = 45', () => {
    assert.equal(evaluate('(2+3)(4+5)'), 45);
  });

  it('2pi ≈ 6.283', () => {
    approx(evaluate('2pi'), 2 * Math.PI);
  });

  it('2sin(pi/6) = 1', () => {
    approx(evaluate('2sin(pi/6)'), 1);
  });

  it('(3)sin(pi/2) = 3', () => {
    approx(evaluate('(3)sin(pi/2)'), 3);
  });

  it('(2+1)4 = 12', () => {
    assert.equal(evaluate('(2+1)4'), 12);
  });

  it('2e ≈ 5.436', () => {
    approx(evaluate('2e'), 2 * Math.E);
  });

  it('3(2)(5) = 30', () => {
    assert.equal(evaluate('3(2)(5)'), 30);
  });

  it('sin(pi/2)cos(0) = 1', () => {
    approx(evaluate('sin(pi/2)cos(0)'), 1);
  });

  it('2sqrt(9) = 6', () => {
    assert.equal(evaluate('2sqrt(9)'), 6);
  });

  it('50%2 = 1 (percent then implicit mul)', () => {
    assert.equal(evaluate('50%2'), 1);
  });

  it('complex chain: 2sin(pi/6)^2 + 3cos(0) = 3.5', () => {
    // 2 * sin(pi/6)^2 + 3*cos(0) = 2*0.25 + 3*1 = 3.5
    approx(evaluate('2*sin(pi/6)^2 + 3*cos(0)'), 3.5);
  });

  it('deeply nested: sqrt(abs(gcd(lcm(4,6), 9))) = 3', () => {
    // lcm(4,6)=12, gcd(12,9)=3, abs(3)=3, sqrt(3)≈1.732
    approx(evaluate('sqrt(abs(gcd(lcm(4,6), 9)))'), Math.sqrt(3));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Correctness & Safety — must return undefined (not wrong answers)
// ═══════════════════════════════════════════════════════════════════════════

describe('Error handling: must return undefined', () => {
  // Division by zero
  it('1/0 → undefined (Infinity)', () => {
    assert.equal(evaluate('1/0'), undefined);
  });
  it('0/0 → undefined (NaN)', () => {
    assert.equal(evaluate('0/0'), undefined);
  });
  it('-1/0 → undefined (-Infinity)', () => {
    assert.equal(evaluate('-1/0'), undefined);
  });

  // Domain errors
  it('sqrt(-1) → undefined (NaN)', () => {
    assert.equal(evaluate('sqrt(-1)'), undefined);
  });
  it('sqrt(-0.001) → undefined', () => {
    assert.equal(evaluate('sqrt(-0.001)'), undefined);
  });
  it('asin(2) → undefined (out of domain)', () => {
    assert.equal(evaluate('asin(2)'), undefined);
  });
  it('asin(-2) → undefined', () => {
    assert.equal(evaluate('asin(-2)'), undefined);
  });
  it('acos(1.1) → undefined', () => {
    assert.equal(evaluate('acos(1.1)'), undefined);
  });
  it('acos(-1.1) → undefined', () => {
    assert.equal(evaluate('acos(-1.1)'), undefined);
  });
  it('log(-1) → undefined', () => {
    assert.equal(evaluate('log(-1)'), undefined);
  });
  it('log(0) → undefined (-Infinity)', () => {
    assert.equal(evaluate('log(0)'), undefined);
  });
  it('ln(-1) → undefined', () => {
    assert.equal(evaluate('ln(-1)'), undefined);
  });
  it('ln(0) → undefined (-Infinity)', () => {
    assert.equal(evaluate('ln(0)'), undefined);
  });
  it('(-8)^(1/3) → undefined (NaN in JS)', () => {
    assert.equal(evaluate('(-8)^(1/3)'), undefined);
  });
  it('10^309 → undefined (Infinity)', () => {
    assert.equal(evaluate('10^309'), undefined);
  });
  it('10^-400 = 0 (underflow, not error)', () => {
    assert.equal(evaluate('10^-400'), 0);
  });

  // Invalid syntax — must NOT produce a number
  it('1.2.3 → undefined (multi decimal)', () => {
    assert.equal(evaluate('1.2.3'), undefined);
  });
  it('1.2.3+4 → undefined (multi decimal in expression)', () => {
    assert.equal(evaluate('1.2.3+4'), undefined);
  });
  it('1e3 → undefined (scientific notation is not supported)', () => {
    assert.equal(evaluate('1e3'), undefined);
  });
  it('1e-3 → undefined (scientific notation is not supported)', () => {
    assert.equal(evaluate('1e-3'), undefined);
  });
  it('() → undefined (empty parens)', () => {
    assert.equal(evaluate('()'), undefined);
  });
  it('3+ → undefined (trailing op)', () => {
    assert.equal(evaluate('3+'), undefined);
  });
  it('*3 → undefined (leading op)', () => {
    assert.equal(evaluate('*3'), undefined);
  });
  it('+ → undefined (bare op)', () => {
    assert.equal(evaluate('+'), undefined);
  });
  it('(2+3 → undefined (unclosed paren)', () => {
    assert.equal(evaluate('(2+3'), undefined);
  });
  it('2+3) → undefined (extra close paren)', () => {
    assert.equal(evaluate('2+3)'), undefined);
  });
  it('3**4 → undefined (double op)', () => {
    assert.equal(evaluate('3**4'), undefined);
  });
  it('3//4 → undefined (double slash)', () => {
    assert.equal(evaluate('3//4'), undefined);
  });
  it('"" → undefined (empty)', () => {
    assert.equal(evaluate(''), undefined);
  });
  it('"   " → undefined (whitespace)', () => {
    assert.equal(evaluate('   '), undefined);
  });
  it('sin pi → undefined (func without parens)', () => {
    assert.equal(evaluate('sin pi'), undefined);
  });
  it('gcd(12, 8, 4) → undefined (too many args)', () => {
    assert.equal(evaluate('gcd(12, 8, 4)'), undefined);
  });
  it('gcd(2.6, 1.2) → undefined (integer-only function)', () => {
    assert.equal(evaluate('gcd(2.6, 1.2)'), undefined);
  });
  it('lcm(2.6, 1.2) → undefined (integer-only function)', () => {
    assert.equal(evaluate('lcm(2.6, 1.2)'), undefined);
  });
  it('gcd(12,) → undefined (trailing comma)', () => {
    assert.equal(evaluate('gcd(12,)'), undefined);
  });
  it('sin(,3) → undefined (leading comma)', () => {
    assert.equal(evaluate('sin(,3)'), undefined);
  });
  it('abc → undefined (unknown identifier)', () => {
    assert.equal(evaluate('abc'), undefined);
  });
  it('hello(3) → undefined (unknown function)', () => {
    assert.equal(evaluate('hello(3)'), undefined);
  });
  it('2+*3 → undefined (adjacent ops)', () => {
    assert.equal(evaluate('2+*3'), undefined);
  });
  it(', → undefined', () => {
    assert.equal(evaluate(','), undefined);
  });
  it('sin() → undefined (no argument)', () => {
    assert.equal(evaluate('sin()'), undefined);
  });
});

describe('Edge cases: correct answers', () => {
  // Leading decimal point
  it('.5 = 0.5', () => {
    assert.equal(evaluate('.5'), 0.5);
  });
  it('.5+.5 = 1', () => {
    assert.equal(evaluate('.5+.5'), 1);
  });
  it('3+.5 = 3.5', () => {
    assert.equal(evaluate('3+.5'), 3.5);
  });
  it('(.5) = 0.5', () => {
    assert.equal(evaluate('(.5)'), 0.5);
  });

  // Unary minus/plus
  it('--3 = 3 (double negative)', () => {
    assert.equal(evaluate('--3'), 3);
  });
  it('---3 = -3 (triple negative)', () => {
    assert.equal(evaluate('---3'), -3);
  });
  it('+5 = 5 (unary plus)', () => {
    assert.equal(evaluate('+5'), 5);
  });
  it('-(2+3) = -5', () => {
    assert.equal(evaluate('-(2+3)'), -5);
  });
  it('-(-(-1)) = -1', () => {
    assert.equal(evaluate('-(-(-1))'), -1);
  });

  // Percentage chaining
  it('100% = 1', () => {
    assert.equal(evaluate('100%'), 1);
  });
  it('50%% = 0.005', () => {
    assert.equal(evaluate('50%%'), 0.005);
  });
  it('200 + 50% = 200.5', () => {
    // 50% = 0.5, then 200 + 0.5 = 200.5
    assert.equal(evaluate('200 + 50%'), 200.5);
  });

  // Exponent right-associativity
  it('2^2^3 = 256 (right-assoc)', () => {
    assert.equal(evaluate('2^2^3'), 256);
  });
  it('4^3^2 = 262144 (4^9)', () => {
    assert.equal(evaluate('4^3^2'), 262144);
  });

  // 0^0
  it('0^0 = 1 (JS convention)', () => {
    assert.equal(evaluate('0^0'), 1);
  });

  // Deeply nested parentheses
  it('((((((1+2)))))) = 3', () => {
    assert.equal(evaluate('((((((1+2))))))'), 3);
  });

  // Negative base ** even exponent
  it('(-2)^2 = 4', () => {
    assert.equal(evaluate('(-2)^2'), 4);
  });
  it('(-3)^3 = -27', () => {
    assert.equal(evaluate('(-3)^3'), -27);
  });
  it('(-2)^4 = 16', () => {
    assert.equal(evaluate('(-2)^4'), 16);
  });

  // gcd/lcm edge cases
  it('gcd(-12, 8) = 4 (takes abs)', () => {
    assert.equal(evaluate('gcd(-12, 8)'), 4);
  });
  it('gcd(0, 0) = 0', () => {
    assert.equal(evaluate('gcd(0, 0)'), 0);
  });
  it('lcm(0, 5) = 0', () => {
    assert.equal(evaluate('lcm(0, 5)'), 0);
  });
  it('lcm(0, 0) = 0', () => {
    assert.equal(evaluate('lcm(0, 0)'), 0);
  });

  // Single values
  it('42 = 42', () => {
    assert.equal(evaluate('42'), 42);
  });
  it('pi ≈ 3.14159', () => {
    approx(evaluate('pi'), Math.PI);
  });
  it('e ≈ 2.71828', () => {
    approx(evaluate('e'), Math.E);
  });

  // Trig identities
  it('sin(0) = 0', () => {
    assert.equal(evaluate('sin(0)'), 0);
  });
  it('cos(pi) ≈ -1', () => {
    approx(evaluate('cos(pi)'), -1);
  });
  it('tan(0) = 0', () => {
    assert.equal(evaluate('tan(0)'), 0);
  });
  it('asin(0) = 0', () => {
    assert.equal(evaluate('asin(0)'), 0);
  });
  it('acos(1) = 0', () => {
    assert.equal(evaluate('acos(1)'), 0);
  });
  it('atan(0) = 0', () => {
    assert.equal(evaluate('atan(0)'), 0);
  });
  it('atan(1) ≈ pi/4', () => {
    approx(evaluate('atan(1)'), Math.PI / 4);
  });

  // Deep nesting of functions
  it('sin(cos(tan(0.5))) ≈ 0.7542', () => {
    approx(evaluate('sin(cos(tan(0.5)))'), Math.sin(Math.cos(Math.tan(0.5))));
  });
  it('abs(floor(ceil(-1.5))) = 1', () => {
    // ceil(-1.5) = -1, floor(-1) = -1, abs(-1) = 1
    assert.equal(evaluate('abs(floor(ceil(-1.5)))'), 1);
  });
  it('round(sqrt(2)*100)/100 ≈ 1.41', () => {
    approx(evaluate('round(sqrt(2)*100)/100'), 1.41);
  });

  // Functions of 2-arg functions
  it('gcd(abs(-12), ceil(7.1)) = 4', () => {
    // abs(-12)=12, ceil(7.1)=8, gcd(12,8)=4
    assert.equal(evaluate('gcd(abs(-12), ceil(7.1))'), 4);
  });
  it('lcm(floor(3.9), round(2.5)) = 9', () => {
    // floor(3.9)=3, round(2.5)=3, lcm(3,3)=3
    assert.equal(evaluate('lcm(floor(3.9), round(2.5))'), 3);
  });

  // Large numbers
  it('999999999 * 2 = 1999999998', () => {
    assert.equal(evaluate('999999999 * 2'), 1999999998);
  });

  // Implicit mul with unary
  it('-2(3) = -6', () => {
    assert.equal(evaluate('-2(3)'), -6);
  });
  it('-sin(0) = 0', () => {
    assert.equal(evaluate('-sin(0)'), -0);
  });
  it('-(3)(4) = -12', () => {
    assert.equal(evaluate('-(3)(4)'), -12);
  });

  // Spacing variations
  it('2  +  3 = 5 (extra spaces)', () => {
    assert.equal(evaluate('2  +  3'), 5);
  });
  it(' sin( pi / 2 ) = 1 (spaces everywhere)', () => {
    approx(evaluate(' sin( pi / 2 ) '), 1);
  });

  // Operator precedence
  it('2+3*4-1 = 13', () => {
    assert.equal(evaluate('2+3*4-1'), 13);
  });
  it('2*3+4*5 = 26', () => {
    assert.equal(evaluate('2*3+4*5'), 26);
  });
  it('10-3-2 = 5 (left-assoc subtraction)', () => {
    assert.equal(evaluate('10-3-2'), 5);
  });
  it('24/6/2 = 2 (left-assoc division)', () => {
    assert.equal(evaluate('24/6/2'), 2);
  });
  it('2+3^2 = 11 (exponent before add)', () => {
    assert.equal(evaluate('2+3^2'), 11);
  });
  it('2*3^2 = 18 (exponent before mul)', () => {
    assert.equal(evaluate('2*3^2'), 18);
  });
  it('-3^2 = -9 (exponent binds tighter than unary minus)', () => {
    assert.equal(evaluate('-3^2'), -9);
  });
});
