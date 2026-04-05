function search(expression) {
  if (!expression.trim()) return [];

  try {
    const result = evaluate(expression);
    if (result === undefined || result === null || !isFinite(result)) {
      return [];
    }
    const formatted = typeof result === 'number'
      ? Number.isInteger(result) ? result.toString() : parseFloat(result.toPrecision(12)).toString()
      : String(result);

    return [{
      type: 'calc',
      icon: 'calculate',
      title: formatted,
      subtitle: expression.trim(),
      action: () => {
        navigator.clipboard.writeText(formatted);
      },
    }];
  } catch {
    return [];
  }
}

// Safe recursive-descent math parser (no eval/new Function).
// Supports: +, -, *, /, ^, %, (), unary minus, trig, log, sqrt, etc.

const MATH_FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  log: Math.log10, ln: Math.log, exp: Math.exp,
  round: Math.round, ceil: Math.ceil, floor: Math.floor,
};

const MATH_CONSTS = { pi: Math.PI, e: Math.E };

function evaluate(expr) {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return undefined;
  const ctx = { tokens, pos: 0 };
  const result = parseExpr(ctx);
  if (ctx.pos < ctx.tokens.length) return undefined; // leftover tokens
  return result;
}

function tokenize(expr) {
  const out = [];
  const s = expr.replace(/\s+/g, '').replace(/,/g, '');
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    // Number (integer or decimal)
    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < s.length && s[i + 1] >= '0' && s[i + 1] <= '9')) {
      let num = '';
      while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) { num += s[i++]; }
      out.push({ type: 'num', value: parseFloat(num) });
    // Alpha identifier (function name or constant)
    } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      let id = '';
      while (i < s.length && ((s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z'))) { id += s[i++]; }
      const lower = id.toLowerCase();
      if (MATH_CONSTS[lower] !== undefined) {
        out.push({ type: 'num', value: MATH_CONSTS[lower] });
      } else if (MATH_FUNCS[lower]) {
        out.push({ type: 'func', name: lower });
      } else {
        return null; // unknown identifier
      }
    } else if ('+-*/^%()'.includes(ch)) {
      out.push({ type: 'op', value: ch });
      i++;
    } else {
      return null; // disallowed character
    }
  }
  return out;
}

// Grammar:
// expr     = term (('+' | '-') term)*
// term     = exponent (('*' | '/') exponent)*
// exponent = unary ('^' exponent)?          (right-assoc)
// unary    = ('-' unary) | postfix
// postfix  = primary '%'*
// primary  = number | func '(' expr ')' | '(' expr ')'

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
    const exp = parseExponent(ctx); // right-associative
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

  // Function call: func(expr)
  if (tok.type === 'func') {
    consume(ctx);
    const fn = MATH_FUNCS[tok.name];
    if (!peek(ctx) || peek(ctx).value !== '(') throw new Error('expected ( after function');
    consume(ctx); // '('
    const arg = parseExpr(ctx);
    if (!peek(ctx) || peek(ctx).value !== ')') throw new Error('expected )');
    consume(ctx); // ')'
    return fn(arg);
  }

  // Number
  if (tok.type === 'num') {
    consume(ctx);
    return tok.value;
  }

  // Parenthesized expression
  if (tok.type === 'op' && tok.value === '(') {
    consume(ctx);
    const val = parseExpr(ctx);
    if (!peek(ctx) || peek(ctx).value !== ')') throw new Error('expected )');
    consume(ctx);
    return val;
  }

  throw new Error('unexpected token');
}

window._calculator = { search };
