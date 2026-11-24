// Regression table ported from the old hand-written calculator's tests.
// Every input here produced a known-correct number (or an error) before the
// switch to SymPy; the new engine must agree. Inputs whose old result was a
// limitation rather than a decision are left out on purpose: 1e3 and 1e-3
// (scientific notation now works), 3**4 and 3//4 (Python operators), 10^309
// (exact big numbers instead of float overflow), "sin pi" (implicit function
// application now works), "abc" (letters are symbols, not an error).

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { CasEngine } = require('../src/main/casEngine');

const CASES = [
  ["   ",null],
  [" sin( pi / 2 ) ",1],
  ["((((((1+2))))))",3],
  ["()",null],
  ["(-2)^2",4],
  ["(-2)^4",16],
  ["(-3)^3",-27],
  ["(-8)^(1/3)",null],
  ["(.5)",0.5],
  ["(1+2)*(3+4)/(5-2)",7],
  ["(2 + 3) * (4 - 1)",15],
  ["(2+1)4",12],
  ["(2+3)(4+5)",45],
  ["(2+3",null],
  ["(3)sin(pi/2)",3],
  ["(ggt(12,8)+2)*3",18],
  ["*3",null],
  ["+5",5],
  ["+",null],
  [",",null],
  ["-(-(-1))",-1],
  ["-(2+3)",-5],
  ["-(3)(4)",-12],
  ["---3",-3],
  ["--3",3],
  ["-1/0",null],
  ["-2(3)",-6],
  ["-3 + 5",2],
  ["-3^2",-9],
  ["-ggt(12,8)",-4],
  ["-sin(0)",0],
  [".5+.5",1],
  [".5",0.5],
  ["0/0",null],
  ["0^0",1],
  ["1.2.3+4",null],
  ["1.2.3",null],
  ["1/0",null],
  ["1/3",0.3333333333333333],
  ["10-3-2",5],
  ["100%",1],
  ["10^-400",0],
  ["15 * 2 * ggt(14, 24)",60],
  ["15*2*ggt(14,24)",60],
  ["2  +  3",5],
  ["2 + 3 * 4",14],
  ["2(3+4)",14],
  ["2*3+4*5",26],
  ["2*3^2",18],
  ["2*sin(pi/6)^2 + 3*cos(0)",3.5],
  ["2+*3",null],
  ["2+3)",null],
  ["2+3*4-1",13],
  ["2+3^2",11],
  ["2+ggt(12,8)*3",14],
  ["200 * 50%",100],
  ["200 + 50%",200.5],
  ["24/6/2",2],
  ["2^-3",0.125],
  ["2^10",1024],
  ["2^2^3",256],
  ["2^3^2",512],
  ["2^ggt(4,2)",4],
  ["2e",5.43656365691809],
  ["2pi",6.283185307179586],
  ["2sin(pi/6)",1],
  ["2sqrt(9)",6],
  ["3(2)(5)",30],
  ["3+.5",3.5],
  ["3+",null],
  ["42",42],
  ["4^3^2",262144],
  ["50%%",0.005],
  ["50%2",1],
  ["999999999 * 2",1999999998],
  ["abs(-42)",42],
  ["abs(floor(ceil(-1.5)))",1],
  ["acos(-1.1)",null],
  ["acos(1)",0],
  ["acos(1.1)",null],
  ["asin(-2)",null],
  ["asin(0)",0],
  ["asin(1)",1.5707963267948966],
  ["asin(2)",null],
  ["atan(0)",0],
  ["atan(1)",0.7853981633974483],
  ["cbrt(27)",3],
  ["ceil(3.2)",4],
  ["cos(0)",1],
  ["cos(pi)",-1],
  ["exp(1)",2.718281828459045],
  ["e",2.718281828459045],
  ["floor(3.7)",3],
  ["gcd(-12, 8)",4],
  ["gcd(0, 0)",0],
  ["gcd(0, 5)",5],
  ["gcd(12)",null],
  ["gcd(12, 8)",4],
  ["gcd(12, 8, 2.5)",null],
  ["gcd(12, 8, 4)",4],
  ["gcd(12,)",null],
  ["gcd(12,8)+lcm(3,4)",16],
  ["gcd(17, 13)",1],
  ["gcd(2+4, 9)",3],
  ["gcd(2.6, 1.2)",null],
  ["gcd(abs(-12), ceil(7.1))",4],
  ["ggT(12, 8)",4],
  ["ggt()",null],
  ["ggt(,12)",null],
  ["ggt(-12,-8,4)",4],
  ["ggt(0,0,0)",0],
  ["ggt(0,0,5)",5],
  ["ggt(1.5,3)",null],
  ["ggt(12 8)",null],
  ["ggt(12)",null],
  ["ggt(12,)",null],
  ["ggt(12,8)%",0.04],
  ["ggt(12,8)^2",16],
  ["ggt(12,8,)",null],
  ["ggt(12,8,2.5)",null],
  ["ggt(12,8,4,16,32)",4],
  ["ggt(14,24)*15*2",60],
  ["ggt(2*6,3*3)",3],
  ["ggt(2+4,9)",3],
  ["ggt(48, 18, 30)",6],
  ["ggt(48,18,30)",6],
  ["ggt(ggt(12),8)",null],
  ["ggt(ggt(4,8),ggt(8,16))",4],
  ["ggt(ggt(ggt(48,18),30),12)",6],
  ["ggt(lcm(4,6),9)",3],
  ["hello(3)",null],
  ["kgV(4, 6)",12],
  ["kgv(2,4,8,3)",24],
  ["lcm(0, 0)",0],
  ["lcm(0, 5)",0],
  ["lcm(0,5,10)",0],
  ["lcm(2, 3, 4)",12],
  ["lcm(2,3,1.1)",null],
  ["lcm(2,3,4)",12],
  ["lcm(2.6, 1.2)",null],
  ["lcm(4, 6)",12],
  ["lcm(7, 5)",35],
  ["lcm(floor(3.9), round(2.5))",3],
  ["lcm(gcd(6,9), 4)",12],
  ["lcm(ggt(12,8),3)",12],
  ["ln(-1)",null],
  ["ln(0)",null],
  ["ln(e)",1],
  ["log(-1)",null],
  ["log(0)",null],
  ["log(100)",2],
  ["pi",3.141592653589793],
  ["round(3.5)",4],
  ["round(sqrt(2)*100)/100",1.41],
  ["sin()",null],
  ["sin(,3)",null],
  ["sin(0)",0],
  ["sin(pi/2)cos(0)",1],
  ["sin(pi/2)",1],
  ["sin(pi/6)",0.5],
  ["sqrt(-0.001)",null],
  ["sqrt(-1)",null],
  ["sqrt(144)",12],
  ["sqrt(2^6) + 3*4 - 1",19],
  ["sqrt(gcd(16,64))",4],
  ["tan(0)",0],
  ["tan(pi/4)",1],
];

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

describe('calculator regression table (old expectations vs SymPy engine)', { skip: python ? false : 'Python with SymPy not available' }, () => {
  let engine;
  let workDir;
  before(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-cas-reg-'));
    engine = new CasEngine({ findPython: () => python, libDir: process.env.TRIM_CAS_LIB || '', workDir, allowInstall: false });
    assert.equal(await engine.start(), true);
  });
  after(() => { engine.stop(); fs.rmSync(workDir, { recursive: true, force: true }); });

  for (const [input, expected] of CASES) {
    it(`${JSON.stringify(input)} → ${expected === null ? 'no real number' : expected}`, async () => {
      const res = await engine.evaluate(input, { commit: false });
      const asNumber = res.ok && res.kind === 'number' ? Number(res.decimal ?? res.text) : NaN;
      if (expected === null) {
        assert.ok(!Number.isFinite(asNumber), `expected an error or non-real result, got ${JSON.stringify(res)}`);
      } else {
        assert.ok(Number.isFinite(asNumber), `expected ${expected}, got ${JSON.stringify(res)}`);
        assert.ok(Math.abs(asNumber - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `expected ${expected}, got ${asNumber}`);
      }
    });
  }
});
