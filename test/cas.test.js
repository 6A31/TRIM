// Calculator engine tests: drive the real SymPy worker through CasEngine.
// Needs Python 3 with SymPy (CI installs it). Set TRIM_CAS_LIB to a folder that
// contains SymPy (pip install --target) to test without a global install.
// Skips when no usable Python/SymPy is found.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { CasEngine } = require('../src/main/casEngine');

function findPython() {
  const libDir = process.env.TRIM_CAS_LIB || '';
  const candidates = process.env.TRIM_TEST_PYTHON ? [process.env.TRIM_TEST_PYTHON]
    : process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ['-I', '-c', 'import sys; p=sys.argv[1]; p and sys.path.insert(0,p); import sympy', libDir],
        { stdio: 'ignore', timeout: 60000 });
      return cmd;
    } catch { /* try next */ }
  }
  return null;
}

const python = findPython();
const skip = python ? false : 'Python with SymPy not available';

describe('CAS engine (SymPy)', { skip }, () => {
  let engine;
  let workDir;
  const ev = async (input, commit = false) => engine.evaluate(input, { commit });

  before(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-cas-test-'));
    engine = new CasEngine({
      findPython: () => python,
      libDir: process.env.TRIM_CAS_LIB || '',
      workDir,
      allowInstall: false,
      timeoutMs: 4000,
      supersedeMs: 800,
    });
    assert.equal(await engine.start(), true);
  });

  after(() => {
    engine.stop();
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('evaluates numbers exactly, with decimals', async () => {
    assert.equal((await ev('2+2')).text, '4');
    assert.equal((await ev('0.1+0.2')).text, '3/10');
    assert.equal((await ev('0.1+0.2')).decimal, '0.3');
    assert.equal((await ev('200*50%')).text, '100');
    assert.equal((await ev('mod(7, 3)')).text, '1');
    assert.equal((await ev('50%2')).text, '1');
    assert.equal((await ev('sqrt(8)')).text, '2*sqrt(2)');
    assert.equal((await ev('log(100)')).text, '2');
    assert.equal((await ev('ln(e)')).text, '1');
    assert.equal((await ev('5!')).text, '120');
    assert.equal((await ev('ggt(12, 8, 4)')).text, '4');
    assert.equal((await ev('kgv(2, 3, 4)')).text, '12');
    assert.equal((await ev('cbrt(-8)')).text, '-2');
    assert.equal((await ev('(2+3i)(1-i)')).text, '5 + I');
  });

  it('reports undefined results instead of inventing values', async () => {
    const r = await ev('1/0');
    assert.equal(r.ok, false);
    assert.match(r.error, /Undefined/);
  });

  it('follows normal bracket rules for algebra functions', async () => {
    assert.equal((await ev('expand(a+b)^2')).text, '(a + b)**2');
    assert.equal((await ev('expand((a+b)^2)')).text, 'a**2 + 2*a*b + b**2');
    assert.equal((await ev('expand (a+b)^2')).text, 'a**2 + 2*a*b + b**2');
    assert.equal((await ev('factor x^2-4')).text, '(x - 2)*(x + 2)');
    assert.equal((await ev('derive x^3')).text, '3*x**2');
    assert.equal((await ev('integrate x^2 dx')).text, 'x**3/3');
  });

  it('solves equations, identities and contradictions', async () => {
    assert.equal((await ev('(a+b)^2 = a^2+2ab+b^2')).kind, 'identity');
    assert.equal((await ev('x = x+1')).kind, 'nosolution');
    assert.equal((await ev('x^2-5x+6=0')).text, 'x = 2, x = 3');
    assert.equal((await ev('x^2=2')).text, 'x = -sqrt(2), x = sqrt(2)');
    assert.equal((await ev('x^2-2x+5=0')).text, 'x = 1 - 2*I, x = 1 + 2*I');
    assert.equal((await ev('e^x=1')).text, 'x = 0');
    assert.match((await ev('sin(x)=0')).latex, /n \\in \\mathbb\{Z\}/);
    const numeric = await ev('cos(x)=x');
    assert.equal(numeric.numeric, true);
    assert.match(numeric.text, /0\.739085133/);
    assert.equal((await ev('2+2=5')).text, 'false');
  });

  it('plots functions', async () => {
    assert.equal((await ev('sin(x)')).plot.type, '2d');
    assert.equal((await ev('x^2+y^2')).plot.type, '3d');
    const y = await ev('y=2x+1');
    assert.equal(y.kind, 'plot');
    assert.equal(y.plot.type, '2d');
    assert.equal((await ev('expand((a+b)^2)')).plot, undefined, 'algebra ops are not auto-plotted');
  });

  it('keeps definitions only when committed and supports nesting', async () => {
    const preview = await ev('f(x) := x^2 + 1');
    assert.equal(preview.kind, 'definition');
    assert.equal(preview.committed, false);
    assert.equal((await ev('f(3)')).ok && (await ev('f(3)')).text === '10', false, 'preview must not define f');
    await ev('f(x) := x^2 + 1', true);
    assert.equal((await ev('f(3)')).text, '10');
    await ev('g := expand(f(a+b))', true);
    assert.equal((await ev('diff(g, a)')).text, '2*a + 2*b');
    assert.equal((await ev('f(f(x))')).text, '(x**2 + 1)**2 + 1');
  });

  it('handles trigonometry in radians and degrees', async () => {
    assert.equal((await ev('sin(pi/6)')).text, '1/2');
    assert.equal((await ev('tan(pi/3)')).text, 'sqrt(3)');
    assert.equal((await ev('sin(30°)')).text, '1/2');
    assert.equal((await ev('cos(60 deg)')).text, '1/2');
    assert.equal((await ev('asin(1/2)/deg')).text, '30');
    assert.equal((await ev('simplify(sin^2(x)+cos^2(x))')).text, '1');
    assert.equal((await ev('diff(sin(x), x)')).text, 'cos(x)');
    assert.match((await ev('sin(x)=1/2')).latex, /\\frac\{\\pi\}\{6\}/);
  });

  it('understands typed math symbols', async () => {
    assert.equal((await ev('2π')).text, '2*pi');           // 2π
    assert.equal((await ev('√2')).text, 'sqrt(2)');         // √2
    assert.equal((await ev('x²+1')).text, 'x**2 + 1');      // x²+1
    assert.equal((await ev('3×4')).text, '12');             // 3×4
    assert.equal((await ev('8÷2')).text, '4');              // 8÷2
    assert.equal((await ev('5−7')).text, '-2');             // 5−7
    assert.equal((await ev('sin(90°)')).text, '1');         // sin(90°)
    assert.equal((await ev('2^30°')).text, '2**(pi/6)');    // ° binds to 30, not to 2^30
    assert.equal((await ev('sin 30°')).text, '1/2');        // no brackets needed
    assert.equal((await ev('(30+15)°')).text, 'pi/4');
  });

  it('refuses glued function names instead of misreading them', async () => {
    assert.match((await ev('xsin(x)')).error, /contains 'sin'/);
    assert.match((await ev('sinx')).error, /contains 'sin'/);
    assert.equal((await ev('2ab')).text, '2*a*b');
  });

  it('shows roots without a closed form as decimals', async () => {
    const r = await ev('x^5-x+1=0');
    assert.match(r.text, /x ≈ -1\.16730397/);
    assert.doesNotMatch(r.latex, /CRootOf/);
  });

  it('rejects unsafe input and reports syntax errors', async () => {
    assert.equal((await ev('x.subs')).ok, false);
    assert.equal((await ev('__import__("os")')).ok, false);
    assert.match((await ev('(1+')).error, /Incomplete or invalid/);
    assert.match((await ev('sin := 3')).error, /built-in/);
  });

  it('gives up on runaway computations and keeps definitions after the restart', async () => {
    await ev('k := 41', true);
    const slow = await ev('factorint(2^1000 + 1234567)', true);
    assert.equal(slow.ok, false);
    assert.match(slow.error, /Gave up/);
    assert.equal((await ev('k + 1')).text, '42', 'definitions survive the restart');
  });

  it('drops stale previews while typing', async () => {
    const results = await Promise.all(['2', '2+', '2+3', '2+3*4'].map(s => ev(s)));
    const last = results[results.length - 1];
    assert.equal(last.text, '14');
    assert.ok(results.slice(0, -1).some(r => r.superseded), 'older previews were superseded');
  });
});
