// Calculator worksheet (CAS editor) tests against the real SymPy worker.
// Needs Python with SymPy (see cas.test.js); skips otherwise.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { CasEngine } = require('../src/main/casEngine');
const { isSimple } = require('../src/renderer/modules/calculator');

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

describe('quick path vs worksheet', () => {
  it('treats plain arithmetic as simple', () => {
    for (const s of ['2+2', '3*(4-1)', '2^10', 'sqrt(2)*pi', '200*50%', '5!', 'e^2', '1/3']) assert.equal(isSimple(s), true, s);
  });
  it('opens the worksheet for anything else', () => {
    for (const s of ['x^2', 'ggt(12, 8)', 'kgv(ggt(4,8),6)', 'a := 5', 'x=2', '$1+1', 'ans*2', 'sin(1)', '2ab', '']) {
      assert.equal(isSimple(s), false, s);
    }
  });
});

const python = findPython();

describe('CAS worksheet', { skip: python ? false : 'Python with SymPy not available' }, () => {
  let dir;
  let file;
  let engine;
  const make = (opts = {}) => new CasEngine({
    findPython: () => python, libDir: process.env.TRIM_CAS_LIB || '', workDir: path.join(dir, 'work'),
    worksheetFile: file, allowInstall: false, timeoutMs: 3000, ...opts,
  });
  const texts = (sheet) => sheet.rows.map(r => (r.result && r.result.ok ? r.result.text : `ERR ${r.result && r.result.error}`));

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-cas-sheet-'));
    file = path.join(dir, 'cas-worksheet.json');
    engine = make();
    assert.equal(await engine.start(), true);
  });

  after(() => {
    engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('adds rows and reuses results with $n and ans (nested ggT/kgV)', async () => {
    await engine.commitRow('ggt(48, 18, 30)');
    await engine.commitRow('kgv($1, 4, ggt(9, 12))');
    await engine.commitRow('f(x) := x^2 + $1');
    await engine.commitRow('f(3)');
    const s = await engine.commitRow('ans + 1');
    assert.equal(s.ok, true);
    assert.deepEqual(texts(s), ['6', '12', 'f(x) := x^2 + $1', '15', '16']);
    assert.equal((await engine.evaluate('$1 + $2')).text, '18');
  });

  it('rejects invalid lines and leaves the worksheet untouched', async () => {
    const before = (await engine.getWorksheet()).rows.length;
    const r = await engine.commitRow('(1+');
    assert.equal(r.ok, false);
    assert.match(r.error, /Incomplete/);
    assert.equal((await engine.commitRow('$99 + 1')).ok, false);
    assert.equal((await engine.getWorksheet()).rows.length, before);
  });

  it('editing a row recalculates the rows that depend on it', async () => {
    const s = await engine.commitRow('ggt(100, 75)', 0); // $1: 6 -> 25
    assert.equal(s.ok, true);
    assert.deepEqual(texts(s), ['25', '300', 'f(x) := x^2 + $1', '34', '35']);
  });

  it('a rejected edit keeps the old row', async () => {
    const s = await engine.commitRow('ggt(1.5, 3)', 0);
    assert.equal(s.ok, false);
    assert.equal(s.rows[0].input, 'ggt(100, 75)');
    assert.equal(texts(s)[3], '34');
  });

  it('deleting a row renumbers later references', async () => {
    await engine.commitRow('$5 * 2'); // $6 = 70
    const s = await engine.deleteRow(1); // remove the kgv row: $5 -> $4, $1 unchanged
    assert.equal(s.rows[1].input, 'f(x) := x^2 + $1');
    assert.equal(s.rows[4].input, '$4 * 2');
    assert.deepEqual(texts(s), ['25', 'f(x) := x^2 + $1', '34', '35', '70']);
  });

  it('functions are called, not used as values; ans skips definitions', async () => {
    assert.match((await engine.evaluate('$2 + 1')).error, /function, not a value/);
    assert.equal((await engine.evaluate('$2(2)')).text, '29');
    await engine.commitRow('g(t) := 2t');
    assert.equal((await engine.evaluate('ans')).text, '70', 'ans is still the last value');
    await engine.deleteRow(5);
  });

  it('saves the worksheet and restores it in a new session', async () => {
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8')).rows;
    const other = make();
    try {
      const s = await other.getWorksheet();
      assert.deepEqual(s.rows.map(r => r.input), saved);
      assert.deepEqual(texts(s), texts(await engine.getWorksheet()));
    } finally {
      other.stop();
    }
  });

  it('a row that takes too long is rejected without breaking the worksheet', async () => {
    const before = texts(await engine.getWorksheet());
    const slow = await engine.commitRow('factorint(2^1000 + 1234567)');
    assert.equal(slow.ok, false);
    assert.match(slow.error, /Gave up/);
    assert.deepEqual(texts(await engine.getWorksheet()), before);
    assert.equal((await engine.evaluate('$1')).text, '25', 'session was replayed after the restart');
  });

  it('reset clears everything', async () => {
    const s = await engine.commitRow('reset');
    assert.equal(s.rows.length, 0);
    assert.equal((await engine.evaluate('$1')).ok, false);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf-8')).rows, []);
  });
});
