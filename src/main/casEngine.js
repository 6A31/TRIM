// Manages the SymPy math engine process (src/main/cas/cas_worker.py) and the
// calculator worksheet. Plain Node (no Electron imports) so tests can drive it.
//
// - Finds Python, makes sure the pinned SymPy is importable (installing it once
//   into `libDir` with pip if needed), and keeps one worker process alive.
// - Requests are serialized. Live-preview requests that pile up while typing
//   are dropped in favour of the newest one.
// - Every request has a time limit. A worker stuck in a slow computation is
//   killed and restarted.
// - The worksheet (list of row inputs) is the source of truth: it is saved to
//   disk and replayed into a fresh worker row by row. A row that times out is
//   marked and skipped on later replays instead of hanging the worksheet.

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const SYMPY_REQUIREMENT = 'sympy==1.14.0';
const WORKER_SOURCE = path.join(__dirname, 'cas', 'cas_worker.py');
const MAX_ROWS = 200;

class CasEngine {
  /**
   * @param {object} opts
   * @param {() => (string|null)} opts.findPython  returns a python executable or null
   * @param {string} opts.libDir     where SymPy gets installed if the interpreter lacks it
   * @param {string} opts.workDir    where the worker script is copied (must be a real dir, not asar)
   * @param {string} [opts.worksheetFile]  JSON file the worksheet is saved to
   * @param {object} [opts.env]      environment for child processes
   * @param {number} [opts.timeoutMs]    hard limit per request
   * @param {number} [opts.supersedeMs]  kill a slow preview after this long when newer input is waiting
   * @param {boolean} [opts.allowInstall]
   * @param {(status: {state: string, message?: string}) => void} [opts.onStatus]
   */
  constructor(opts) {
    this.findPython = opts.findPython;
    this.libDir = opts.libDir;
    this.workDir = opts.workDir;
    this.worksheetFile = opts.worksheetFile || null;
    this.env = opts.env || process.env;
    this.timeoutMs = opts.timeoutMs || 8000;
    this.supersedeMs = opts.supersedeMs || 1500;
    this.allowInstall = opts.allowInstall !== false;
    this.onStatus = opts.onStatus || (() => {});

    this.proc = null;
    this.python = null;
    this.startPromise = null;
    this.unavailable = null; // error message once we know the engine can't run
    this.nextId = 1;
    this.queue = [];        // pending { id, payload, resolve, preview }
    this.inflight = null;   // { id, payload, resolve, preview, timer, startedAt }
    this.buffer = '';
    this.status = { state: 'idle' };
    this.replaying = false;
    this.opChain = Promise.resolve();
    this.rows = this._loadRows(); // [{ input, result?, timedOut? }]
  }

  setStatus(state, message) {
    this.status = { state, message };
    try { this.onStatus(this.status); } catch { /* ignore listener errors */ }
  }

  // --- worksheet persistence ---

  _loadRows() {
    if (!this.worksheetFile) return [];
    try {
      const data = JSON.parse(fs.readFileSync(this.worksheetFile, 'utf-8'));
      const rows = Array.isArray(data && data.rows) ? data.rows : [];
      return rows.filter(r => typeof r === 'string' && r.trim()).slice(0, MAX_ROWS).map(input => ({ input }));
    } catch {
      return [];
    }
  }

  _saveRows() {
    if (!this.worksheetFile) return;
    try {
      fs.mkdirSync(path.dirname(this.worksheetFile), { recursive: true });
      const tmp = `${this.worksheetFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, rows: this.rows.map(r => r.input) }, null, 2), 'utf-8');
      fs.renameSync(tmp, this.worksheetFile);
    } catch { /* not fatal: the worksheet still works for this session */ }
  }

  // --- process lifecycle ---

  /** Start (or reuse) the worker. Resolves true when ready, false if unavailable. */
  start() {
    if (this.proc && !this.startPromise) return Promise.resolve(true);
    if (this.unavailable) return Promise.resolve(false);
    if (!this.startPromise) {
      this.startPromise = this._start().finally(() => { this.startPromise = null; });
    }
    return this.startPromise;
  }

  async _start() {
    this.setStatus('starting', 'Starting math engine…');
    if (!this.python) this.python = this.findPython();
    if (!this.python) {
      return this._fail('Python 3 was not found. The calculator needs Python with SymPy.');
    }
    if (!(await this._hasSympy())) {
      if (!this.allowInstall) return this._fail('SymPy is not installed.');
      this.setStatus('installing', 'Installing math engine (one-time, about 10 MB)…');
      const ok = await this._installSympy();
      if (!ok || !(await this._hasSympy())) {
        return this._fail('Could not install SymPy. Check your internet connection and try again.', true);
      }
    }
    try {
      await this._spawnWorker();
    } catch (err) {
      return this._fail(`Math engine failed to start: ${err.message}`, true);
    }
    await this._replayRows();
    this.setStatus('ready');
    return true;
  }

  async _spawnWorker() {
    fs.mkdirSync(this.workDir, { recursive: true });
    const script = path.join(this.workDir, 'cas_worker.py');
    const src = fs.readFileSync(WORKER_SOURCE, 'utf-8');
    let current = null;
    try { current = fs.readFileSync(script, 'utf-8'); } catch { /* first run */ }
    if (current !== src) fs.writeFileSync(script, src, 'utf-8');
    await this._spawn(script);
  }

  _fail(message, retryable = false) {
    if (!retryable) this.unavailable = message;
    this.setStatus('unavailable', message);
    return false;
  }

  _childEnv() {
    return { ...this.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' };
  }

  _hasSympy() {
    const code = 'import sys; p=sys.argv[1]; p and sys.path.insert(0, p); import sympy; print(sympy.__version__)';
    return new Promise((resolve) => {
      execFile(this.python, ['-I', '-c', code, this.libDir || ''], { env: this._childEnv(), timeout: 60000, windowsHide: true },
        (err) => resolve(!err));
    });
  }

  _installSympy() {
    try { fs.mkdirSync(this.libDir, { recursive: true }); } catch { /* reported by pip */ }
    const args = ['-I', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--quiet',
      '--upgrade', '--target', this.libDir, SYMPY_REQUIREMENT];
    return new Promise((resolve) => {
      execFile(this.python, args, { env: this._childEnv(), timeout: 5 * 60 * 1000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
        (err) => resolve(!err));
    });
  }

  _spawn(script) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.python, ['-I', script, this.libDir || ''], {
        env: this._childEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      });
      this.proc = proc;
      this.buffer = '';
      let ready = false;
      let stderr = '';
      const readyTimer = setTimeout(() => {
        if (!ready) { this._kill(); reject(new Error('timed out waiting for SymPy to load')); }
      }, 60000);

      proc.stdout.setEncoding('utf-8');
      proc.stdout.on('data', (chunk) => {
        if (this.proc !== proc) return;
        this.buffer += chunk;
        let nl;
        while ((nl = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, nl).trim();
          this.buffer = this.buffer.slice(nl + 1);
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          if (!ready && msg.kind === 'ready') {
            ready = true;
            clearTimeout(readyTimer);
            resolve();
            continue;
          }
          this._onReply(msg);
        }
      });
      proc.stderr.setEncoding('utf-8');
      proc.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000); });
      proc.on('error', (err) => {
        clearTimeout(readyTimer);
        if (!ready) reject(err);
      });
      proc.on('exit', () => {
        clearTimeout(readyTimer);
        const wasCurrent = this.proc === proc;
        if (wasCurrent) this.proc = null;
        if (!ready) { reject(new Error(stderr.trim().split('\n').pop() || 'worker exited')); return; }
        if (!wasCurrent) return;
        // Crashed mid-request: report it and let the next request restart the worker
        if (this.inflight) {
          const req = this.inflight;
          this.inflight = null;
          clearTimeout(req.timer);
          req.resolve({ ok: false, error: 'The math engine stopped unexpectedly; try again.' });
        }
        this._pump();
      });
    });
  }

  _kill() {
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      try { proc.kill(); } catch { /* already gone */ }
    }
  }

  _onReply(msg) {
    const req = this.inflight;
    if (!req || msg.id !== req.id) return;
    this.inflight = null;
    clearTimeout(req.timer);
    clearTimeout(req.supersedeTimer);
    req.resolve(msg);
    this._pump();
  }

  /** Send a request; previews may be dropped when newer input arrives. */
  _send(payload, preview, internal = false) {
    return new Promise((resolve) => {
      const id = this.nextId++;
      const req = { id, payload: { ...payload, id }, resolve, preview, internal };
      if (preview) {
        // Only the newest preview matters
        for (const q of this.queue.filter(r => r.preview)) q.resolve({ ok: false, superseded: true });
        this.queue = this.queue.filter(r => !r.preview);
      }
      if (internal) this.queue.unshift(req);
      else this.queue.push(req);
      this._pump();
    });
  }

  _pump() {
    if (this.inflight || !this.queue.length || !this.proc) {
      // A slow preview is blocking newer input: give it a moment, then restart the worker
      if (this.inflight && this.inflight.preview && this.queue.length && !this.inflight.supersedeTimer) {
        const req = this.inflight;
        const elapsed = Date.now() - req.startedAt;
        req.supersedeTimer = setTimeout(() => {
          if (this.inflight !== req) return;
          this.inflight = null;
          clearTimeout(req.timer);
          req.resolve({ ok: false, superseded: true });
          this._restart();
        }, Math.max(0, this.supersedeMs - elapsed));
      }
      if (!this.proc && this.queue.length && !this.startPromise && !this.replaying && !this.unavailable) {
        this.start().then((ok) => {
          if (!ok) this._drainUnavailable();
          else this._pump();
        });
      }
      return;
    }
    const req = this.queue.shift();
    req.startedAt = Date.now();
    req.timer = setTimeout(() => {
      if (this.inflight !== req) return;
      this.inflight = null;
      req.resolve({ ok: false, timedOut: true, error: `Gave up after ${Math.round(this.timeoutMs / 1000)} s; this is too hard to compute here.` });
      this._restart();
    }, this.timeoutMs);
    this.inflight = req;
    try {
      this.proc.stdin.write(JSON.stringify(req.payload) + '\n');
    } catch {
      this.inflight = null;
      clearTimeout(req.timer);
      req.resolve({ ok: false, error: 'The math engine stopped unexpectedly; try again.' });
      this._restart();
    }
  }

  _restart() {
    this._kill();
    // During start-up or a worksheet replay, the replay loop respawns the worker itself
    if (this.startPromise || this.replaying) return;
    this.start().then((ok) => {
      if (!ok) this._drainUnavailable();
      else this._pump();
    });
  }

  _drainUnavailable() {
    const message = this.status.message || 'The math engine is unavailable.';
    const pending = this.queue;
    this.queue = [];
    for (const r of pending) r.resolve({ ok: false, unavailable: true, error: message });
  }

  /**
   * Evaluate every worksheet row, in order, into a fresh session. Rows that time
   * out are marked and skipped (their dependants then report missing $n).
   */
  async _replayRows() {
    this.replaying = true;
    try {
      for (let attempt = 0; attempt <= this.rows.length + 1; attempt++) {
        if (!this.proc) await this._spawnWorker();
        await this._send({ op: 'clear' }, false, true);
        let interrupted = false;
        for (let i = 0; i < this.rows.length; i++) {
          const row = this.rows[i];
          if (row.timedOut) {
            row.result = { ok: false, timedOut: true, row: i + 1, error: 'Skipped: this row took too long to compute' };
            continue;
          }
          const res = await this._send({ op: 'eval', input: row.input, row: i + 1 }, false, true);
          if (res.timedOut || !this.proc) {
            row.timedOut = true;
            row.result = { ok: false, timedOut: true, row: i + 1, error: res.error || 'Timed out' };
            interrupted = true;
            break; // worker was killed; start over without this row
          }
          row.result = res;
        }
        if (!interrupted) return;
      }
    } finally {
      this.replaying = false;
    }
  }

  /** Run worksheet operations one at a time. */
  _serial(fn) {
    const run = this.opChain.then(fn, fn);
    this.opChain = run.catch(() => {});
    return run;
  }

  _sheet() {
    return {
      rows: this.rows.map((r, i) => ({ index: i, number: i + 1, input: r.input, result: r.result || null })),
    };
  }

  // --- public API ---

  /** Live preview of a line against the current worksheet. Never changes state. */
  async evaluate(input, { commit = false } = {}) {
    const ok = await this.start();
    if (!ok) return { ok: false, unavailable: true, error: this.status.message || 'The math engine is unavailable.' };
    if (commit) return this.commitRow(input);
    return this._send({ op: 'eval', input: String(input || '') }, true);
  }

  /** The worksheet rows with their results. */
  async getWorksheet() {
    if (this.rows.length) await this.start();
    return this._sheet();
  }

  /**
   * Add a row (index null) or replace row `index`. Invalid input is rejected and
   * the worksheet stays as it was.
   */
  commitRow(input, index = null) {
    return this._serial(async () => {
      const text = String(input || '').trim();
      if (!text) return { ok: false, error: 'Empty line', ...this._sheet() };
      if (/^(reset|clear)$/i.test(text)) return this._clearRowsNow();
      if (!(await this.start())) {
        return { ok: false, unavailable: true, error: this.status.message || 'The math engine is unavailable.', ...this._sheet() };
      }
      const appending = index === null || index === undefined || index >= this.rows.length;
      if (appending) {
        if (this.rows.length >= MAX_ROWS) return { ok: false, error: `The worksheet is full (${MAX_ROWS} rows)`, ...this._sheet() };
        const res = await this._send({ op: 'eval', input: text, row: this.rows.length + 1 }, false);
        if (!res.ok) {
          if (res.timedOut) await this.start(); // worker restarted; worksheet replayed without this row
          return { ok: false, error: res.error, ...this._sheet() };
        }
        this.rows.push({ input: text, result: res });
        this._saveRows();
        return { ok: true, ...this._sheet() };
      }
      const previous = this.rows.map(r => ({ input: r.input, timedOut: r.timedOut }));
      this.rows[index] = { input: text };
      await this._ensureReplay();
      const edited = this.rows[index].result;
      if (!edited || !edited.ok) {
        this.rows = previous;
        await this._ensureReplay();
        return { ok: false, error: (edited && edited.error) || 'Could not evaluate this row', ...this._sheet() };
      }
      this._saveRows();
      return { ok: true, ...this._sheet() };
    });
  }

  /** Remove row `index`; later $n references are renumbered so they keep pointing at the same rows. */
  deleteRow(index) {
    return this._serial(async () => {
      if (index < 0 || index >= this.rows.length) return { ok: false, error: 'No such row', ...this._sheet() };
      const removed = index + 1;
      this.rows.splice(index, 1);
      for (const row of this.rows) {
        row.input = row.input.replace(/\$(\d+)/g, (m, n) => (Number(n) > removed ? `$${Number(n) - 1}` : m));
      }
      if (this.rows.length) await this._ensureReplay();
      else if (this.proc) await this._send({ op: 'clear' }, false);
      this._saveRows();
      return { ok: true, ...this._sheet() };
    });
  }

  /** Start a new, empty worksheet. */
  clearWorksheet() {
    return this._serial(() => this._clearRowsNow());
  }

  async _clearRowsNow() {
    this.rows = [];
    this._saveRows();
    if (this.proc) await this._send({ op: 'clear' }, false);
    return { ok: true, cleared: true, ...this._sheet() };
  }

  async _ensureReplay() {
    if (!(await this.start())) return;
    await this._replayRows();
  }

  async reset() {
    return this.clearWorksheet();
  }

  getStatus() {
    return this.status;
  }

  stop() {
    this.queue.forEach(r => r.resolve({ ok: false, error: 'Math engine stopped' }));
    this.queue = [];
    if (this.inflight) {
      clearTimeout(this.inflight.timer);
      this.inflight.resolve({ ok: false, error: 'Math engine stopped' });
      this.inflight = null;
    }
    this._kill();
  }
}

module.exports = { CasEngine, SYMPY_REQUIREMENT };
