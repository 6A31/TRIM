"""TRIM math engine: a long-running SymPy session.

Protocol: one JSON object per line on stdin, one JSON reply per line on stdout.
  request  {"id": 1, "op": "eval", "input": "x^2 = 4", "commit": false}
           {"id": 2, "op": "reset"} | {"id": 3, "op": "ping"}
  reply    {"id": 1, "ok": true, "kind": "...", "latex": "...", ...}
           {"id": 1, "ok": false, "error": "..."}

All parsing, evaluation and solving is done by SymPy. This file only maps
TRIM's calculator conventions onto SymPy (log = base 10, ln, e, i, %, ggT/kgV),
keeps user definitions (`a := 5`, `f(x) := x^2`) between lines, and shapes
results for display. Timeouts are enforced by the parent process.
"""

import json
import math
import re
import sys
from tokenize import TokenError

if len(sys.argv) > 1 and sys.argv[1]:
    sys.path.insert(0, sys.argv[1])

import sympy  # noqa: E402
from sympy import (  # noqa: E402
    Abs, E, Eq, Expr, FiniteSet, I, Integer, Lambda, Rational, S, Symbol,
    ceiling, latex, nsolve, real_root, solveset,
)
from sympy.core.function import AppliedUndef  # noqa: E402
from sympy.parsing.sympy_parser import (  # noqa: E402
    _token_splittable, convert_xor, function_exponentiation, implicit_application,
    implicit_multiplication, parse_expr, rationalize, split_symbols_custom,
    standard_transformations,
)
from sympy.sets.conditionset import ConditionSet  # noqa: E402

SYMPY_VERSION = sympy.__version__

# --- Parsing configuration -------------------------------------------------


def _percent(tokens, local_dict, global_dict):
    """TRIM convention: % always means percent (`50%` = 0.5, `50%2` = 1, `50%%` = 0.005).

    Modulo is available as Mod(a, b) / mod(a, b)."""
    from tokenize import NUMBER, OP
    out = []
    for tok in tokens:
        if tok[0] == OP and tok[1] == '%':
            out.extend([(OP, '*'), (OP, '('), (NUMBER, '1'), (OP, '/'), (NUMBER, '100'), (OP, ')')])
        else:
            out.append(tok)
    return out


# Function names that must never be split into letters: "xsin(x)" would
# otherwise become x*s*I*n*x without any error.
GLUED_FUNCTION_NAMES = ('asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan',
                        'sec', 'csc', 'cot', 'sqrt', 'cbrt', 'exp', 'log', 'ln', 'abs')


def _splittable(name):
    """SymPy's own rule for splitting `ab` into a*b, plus a refusal for glued function names."""
    lowered = name.lower()
    for fn in GLUED_FUNCTION_NAMES:
        if fn in lowered and lowered != fn:
            raise UserError(f"'{name}' contains '{fn}': write it with * and brackets, e.g. x*{fn}(x) or {fn}(x)")
    return _token_splittable(name)


# Typed math symbols, mapped character by character before parsing (Python's
# tokenizer glues some of them onto neighbouring tokens, so this can't be a
# token transformation).
UNICODE_MATH = str.maketrans({
    '\u03c0': ' pi ',       # π
    '\u221a': ' sqrt ',     # √x  (sqrt applied to what follows)
    '\u00b2': '**2',        # ²
    '\u00b3': '**3',        # ³
    '\u00d7': '*',          # ×
    '\u00b7': '*',          # ·
    '\u22c5': '*',          # ⋅
    '\u00f7': '/',          # ÷
    '\u2212': '-',          # − (unicode minus)
})


DEGREE = '\u00b0'


def _degrees(tokens, local_dict, global_dict):
    """Postfix degree sign, like `!`: it applies to the number, name or bracketed
    group right before it. `2^30°` = 2^(30°), `sin 30°` = sin(30°), `(30+15)°`.
    Each operand becomes `(operand * deg)` with deg = pi/180 exactly."""
    from tokenize import NAME, NUMBER, OP
    out = []
    for tok in tokens:
        kind, text = tok[0], tok[1]
        if kind == NAME and text.endswith(DEGREE) and text != DEGREE:
            # "x°" arrives as one name: split off the sign
            base = text[:-1]
            if DEGREE in base:
                raise UserError('Put ° right after a number, name or bracket, e.g. 30° or (a+b)°')
            out.append((NAME, base))
            kind, text = NAME, DEGREE
        elif kind == NAME and DEGREE in text and text != DEGREE:
            raise UserError('Put ° right after a number, name or bracket, e.g. 30° or (a+b)°')
        if not (kind == NAME and text == DEGREE):
            out.append(tok)
            continue
        if not out:
            raise UserError('° needs a number before it, e.g. 30°')
        # Find the start of the operand just before the sign
        end = len(out)
        if out[-1][1] == ')':
            depth = 0
            start = None
            for k in range(end - 1, -1, -1):
                if out[k][1] == ')':
                    depth += 1
                elif out[k][1] == '(':
                    depth -= 1
                    if depth == 0:
                        start = k
                        break
            if start is None:
                raise UserError('Unbalanced brackets before °')
            if start > 0 and out[start - 1][0] == NAME:
                start -= 1  # function call: f(2)°
        elif out[-1][0] in (NAME, NUMBER):
            start = end - 1
        else:
            raise UserError('° needs a number, name or bracket before it, e.g. 30°')
        operand = out[start:end]
        del out[start:end]
        out.extend([(OP, '(')] + operand + [(OP, '*'), (NAME, 'deg'), (OP, ')')])
    return out


# convert_xor must run before function_exponentiation so `sin^2(x)` works
TRANSFORMS = (_degrees, _percent) + standard_transformations + (
    convert_xor, rationalize, split_symbols_custom(_splittable), implicit_multiplication,
    implicit_application, function_exponentiation,
)


def _nary_int(fn, name):
    """gcd/lcm over two or more integers; anything else is an error, not a guess."""
    def wrapped(*args):
        if len(args) == 1 and isinstance(args[0], (list, tuple)):
            args = tuple(args[0])
        if len(args) < 2:
            raise UserError(f'{name} needs at least two whole numbers')
        vals = [sympy.sympify(a) for a in args]
        if not all(v.is_Integer for v in vals):
            raise UserError(f'{name} only works on whole numbers')
        acc = vals[0]
        for v in vals[1:]:
            acc = fn(acc, v)
        return acc
    return wrapped


def _log(x, base=10):
    return sympy.log(x, base)


def _round(x, ndigits=0):
    """Round half away from zero (2.5 -> 3, -2.5 -> -3), computed exactly."""
    x = sympy.sympify(x)
    if not (x.is_number and x.is_real):
        raise UserError('round() needs a real number')
    scale = Integer(10) ** int(ndigits)
    y = Abs(x) * scale
    r = sympy.floor(y + Rational(1, 2))
    return sympy.sign(x) * r / scale


def _build_global_dict():
    gd = {k: v for k, v in vars(sympy).items() if not k.startswith('_')}
    gd['__builtins__'] = {}
    return gd


GLOBAL_DICT = _build_global_dict()

# TRIM calculator conventions on top of SymPy's names
CONVENTIONS = {
    'e': E,
    'i': I,
    'ln': sympy.log,
    'log': _log,
    'lg': _log,
    'abs': Abs,
    'round': _round,
    'ceil': ceiling,
    'cbrt': lambda x: real_root(x, 3),
    'gcd': _nary_int(sympy.igcd, 'gcd'),
    'ggt': _nary_int(sympy.igcd, 'ggT'),
    'ggT': _nary_int(sympy.igcd, 'ggT'),
    'lcm': _nary_int(sympy.ilcm, 'lcm'),
    'kgv': _nary_int(sympy.ilcm, 'kgV'),
    'kgV': _nary_int(sympy.ilcm, 'kgV'),
    'mod': sympy.Mod,
    'derive': sympy.diff,
    'deg': sympy.pi / 180,
}
# Names that are SymPy functions/objects but people use as variables
for _name in ('beta', 'gamma', 'zeta', 'Lambda', 'S', 'N', 'O', 'Q', 'C'):
    CONVENTIONS[_name] = Symbol(_name)

RESERVED = set(CONVENTIONS) | {'ans', 'pi', 'oo', 'sin', 'cos', 'tan', 'sqrt', 'exp', 'diff', 'integrate',
                               'expand', 'factor', 'simplify', 'solve', 'limit', 'sum', 'Sum'}

# Ops whose result is the point, not a graph (no auto-plot for `expand(...)` etc.)
ALGEBRA_OPS = {
    'diff', 'derive', 'integrate', 'expand', 'factor', 'simplify', 'solve', 'solveset', 'limit',
    'series', 'apart', 'together', 'cancel', 'trigsimp', 'expand_trig', 'powsimp', 'radsimp',
    'nsimplify', 'collect', 'subs', 'summation', 'product', 'factorint', 'divisors', 'isprime',
    'primefactors', 'gcd', 'lcm', 'ggt', 'kgv', 'Matrix', 'det', 'N',
}

# Keyword shorthand from the old calculator: "derive x^3", "integrate x^2 dx", "plot sin(x)"
SHORTHAND = {
    'derive': 'diff', 'diff': 'diff', 'differentiate': 'diff',
    'integrate': 'integrate', 'integral': 'integrate',
    'expand': 'expand', 'factor': 'factor', 'simplify': 'simplify',
}

FORBIDDEN = re.compile(
    r"__|\b(?:import|lambda|exec|eval|open|compile|globals|locals|getattr|setattr|delattr|vars|"
    r"dir|type|object|os|sys|subprocess|input|print|breakpoint)\b"
)
ATTRIBUTE = re.compile(r"[A-Za-z_)\]]\s*\.\s*[A-Za-z_]")
# Python would silently read "1.2.3" as 1.2 * .3 and accept "f(1, 2,)": refuse instead
MALFORMED_NUMBER = re.compile(r"\d\.\d*\.|(?<![\d.])\.\d+\.")
DANGLING_COMMA = re.compile(r",\s*[)\]]|\(\s*,|,\s*,")
DEFINITION = re.compile(r"^\s*([A-Za-z]\w*)\s*(?:\(\s*([A-Za-z]\w*(?:\s*,\s*[A-Za-z]\w*)*)\s*\))?\s*:=\s*(.+)$", re.S)
PREFERRED_VARS = ['x', 'y', 'z', 't', 'n']
MAX_LATEX = 20000

user_defs = {}       # name -> SymPy object (value or Lambda)
user_def_src = {}    # name -> source line, for listing
row_values = {}      # worksheet row number -> value, referenced as $n
last_value = None    # value of the most recent row that has one, referenced as ans

ROW_REF = re.compile(r"\$(\d+)")
ANS_REF = re.compile(r"(?<![A-Za-z0-9_])ans(?![A-Za-z0-9_])")


def clear_session():
    global last_value
    user_defs.clear()
    user_def_src.clear()
    row_values.clear()
    last_value = None


class UserError(Exception):
    pass


def local_dict(extra=None):
    d = dict(CONVENTIONS)
    d.update(user_defs)
    for n, v in row_values.items():
        d[f'_row_{n}'] = v
    if last_value is not None:
        d['ans'] = last_value
    if extra:
        d.update(extra)
    return d


def resolve_refs(text):
    """$3 -> the value of worksheet row 3; ans -> the latest row value. Missing ones are errors."""
    def sub(m):
        n = int(m.group(1))
        if n not in row_values:
            raise UserError(f'${n} has no value (no such row, or that row has no result to reuse)')
        return f'_row_{n}'
    text = ROW_REF.sub(sub, text)
    if '$' in text:
        raise UserError('Use $ followed by a row number, e.g. $1')
    if ANS_REF.search(text) and last_value is None:
        raise UserError('ans has no value yet: add a row with a result first')
    return text


def parse(text, extra=None):
    text = text.translate(UNICODE_MATH).strip()
    if not text:
        raise UserError('Empty expression')
    if FORBIDDEN.search(text) or ATTRIBUTE.search(text):
        raise UserError('That syntax is not allowed in the calculator')
    text = resolve_refs(text)
    if MALFORMED_NUMBER.search(text):
        raise UserError('Invalid number (more than one decimal point)')
    if DANGLING_COMMA.search(text):
        raise UserError('Missing argument (check the commas)')
    return parse_expr(text, local_dict=local_dict(extra), global_dict=GLOBAL_DICT,
                      transformations=TRANSFORMS, evaluate=True)


def split_equation(text):
    """Split at a single top-level '=' (not :=, ==, <=, >=, !=)."""
    depth = 0
    hits = []
    for idx, ch in enumerate(text):
        if ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth -= 1
        elif ch == '=' and depth == 0:
            prev = text[idx - 1] if idx > 0 else ''
            nxt = text[idx + 1] if idx + 1 < len(text) else ''
            if prev in ':<>!=' or nxt == '=':
                continue
            hits.append(idx)
    if len(hits) != 1:
        return None
    i = hits[0]
    return text[:i], text[i + 1:]


def tex(obj):
    s = latex(obj)
    if len(s) > MAX_LATEX:
        raise UserError('Result is too large to display')
    return s


def decimal_of(value):
    try:
        if not getattr(value, 'is_number', False):
            return None
        approx = sympy.N(value, 15)
        if approx.has(sympy.nan, sympy.zoo, sympy.oo, -sympy.oo):
            return None
        re_part, im_part = approx.as_real_imag()

        def fmt(v):
            f = float(v)
            if f == int(f) and abs(f) < 1e15:
                return str(int(f))
            return f'{f:.12g}'
        if im_part == 0:
            return fmt(re_part)
        sign = '-' if float(im_part) < 0 else '+'
        im_abs = fmt(abs(im_part))
        im_txt = 'i' if im_abs == '1' else f'{im_abs}i'
        if re_part == 0:
            return ('-' if sign == '-' else '') + im_txt
        return f'{fmt(re_part)} {sign} {im_txt}'
    except Exception:
        return None


def sorted_symbols(expr):
    syms = sorted((s.name for s in expr.free_symbols), key=lambda n: (n not in PREFERRED_VARS,
                                                                      PREFERRED_VARS.index(n) if n in PREFERRED_VARS else 0, n))
    return syms


def plot_data(expr, names):
    if len(names) not in (1, 2) or not isinstance(expr, Expr) or expr.has(AppliedUndef):
        return None
    syms = [Symbol(n) for n in names]
    try:
        fn = sympy.lambdify(syms, expr, modules=['math'])
    except Exception:
        return None

    def safe(*args):
        try:
            v = fn(*args)
            if isinstance(v, complex):
                return None if abs(v.imag) > 1e-12 else float(v.real)
            v = float(v)
            return v if math.isfinite(v) else None
        except Exception:
            return None

    if len(syms) == 1:
        xs = [-10 + 20 * k / 400 for k in range(401)]
        ys = [safe(x) for x in xs]
        if not any(y is not None for y in ys):
            return None
        return {'type': '2d', 'vars': names, 'x': xs, 'y': ys}
    grid = [-5 + 10 * k / 60 for k in range(61)]
    zs = [[safe(x, y) for x in grid] for y in grid]
    if not any(v is not None for row in zs for v in row):
        return None
    return {'type': '3d', 'vars': names, 'x': grid, 'y': grid, 'z': zs}


def numeric_roots(f, var):
    """Fallback when SymPy can't solve exactly: mpmath root finding, verified by substitution."""
    roots = []
    for start in range(-10, 11):
        try:
            r = nsolve(f, var, start, verify=True)
        except Exception:
            continue
        if not r.is_real:
            continue
        rv = float(r)
        if any(abs(rv - q) < 1e-9 for q in roots):
            continue
        try:
            if abs(float(f.subs(var, r))) > 1e-9:
                continue
        except Exception:
            continue
        roots.append(rv)
    return sorted(roots, key=lambda v: (abs(v), v))


def solve_equation(lhs_txt, rhs_txt, raw):
    lhs = parse(lhs_txt)
    rhs = parse(rhs_txt)
    # "y = 2x + 1" / "f(x) = x^2" describe a function: plot it
    if re.match(r"^\s*(?:y|f\s*\(\s*x\s*\))\s*$", lhs_txt) and 'f' not in user_defs:
        names = sorted_symbols(rhs)
        if names and 'y' not in names:
            return {'kind': 'plot', 'latex': f'{lhs_txt.strip()} = {tex(rhs)}', 'text': str(rhs),
                    'vars': names, 'plot': plot_data(rhs, names), '_value': rhs}
    eq = sympy.Eq(lhs, rhs, evaluate=False)
    f = sympy.expand(lhs - rhs)
    names = sorted_symbols(f) or sorted_symbols(lhs) or sorted_symbols(rhs)
    all_names = sorted(set(sorted_symbols(lhs)) | set(sorted_symbols(rhs)))
    if not f.free_symbols and all_names:
        # The variables cancelled out: either an identity or a contradiction
        if sympy.simplify(lhs - rhs) == 0:
            return {'kind': 'identity', 'vars': all_names,
                    'latex': r'\text{Always true: holds for every value of } ' + ', '.join(all_names),
                    'text': f'Identity: true for all {", ".join(all_names)}'}
        return {'kind': 'nosolution', 'vars': all_names, 'latex': r'\text{No solution (never true)}',
                'text': 'No solution'}
    if not f.free_symbols:
        truth = sympy.simplify(lhs - rhs) == 0
        return {'kind': 'bool', 'latex': r'\text{true}' if truth else r'\text{false}',
                'text': 'true' if truth else 'false', 'vars': [], '_value': sympy.true if truth else sympy.false,
                'detail': f'{decimal_of(lhs) or lhs} {"=" if truth else "≠"} {decimal_of(rhs) or rhs}'}
    var = Symbol(names[0])
    polynomial = f.is_polynomial(var)
    domain = S.Complexes if polynomial else S.Reals
    sol = solveset(eq, var, domain)
    base = {'vars': all_names, 'solveFor': var.name}
    if sol == domain:
        return {**base, 'kind': 'identity', 'latex': r'\text{Always true: holds for every value of } ' + ', '.join(all_names),
                'text': f'Identity: true for all {", ".join(all_names)}'}
    if sol == S.EmptySet:
        what = 'No solution' if polynomial else 'No real solution'
        return {**base, 'kind': 'nosolution', 'latex': r'\text{' + what + '}', 'text': what}
    if isinstance(sol, FiniteSet):
        items = list(sol)
        try:
            items.sort(key=lambda v: (float(sympy.re(v)), float(sympy.im(v))))
        except Exception:
            pass
        parts, texts = [], []
        for v in items:
            d = decimal_of(v)
            if v.has(sympy.CRootOf) and d is not None:
                # Roots with no closed form: SymPy's exact CRootOf notation is unreadable
                parts.append(f'{var.name} \\approx ' + d.replace('i', r'\,i'))
                texts.append(f'{var.name} ≈ {d}')
                continue
            exact = tex(v)
            line = f'{var.name} = {exact}'
            re_v, im_v = v.as_real_imag()
            gaussian_int = getattr(re_v, 'is_Integer', False) and getattr(im_v, 'is_Integer', False)
            if d is not None and d != str(v) and not gaussian_int:
                line += r' \approx ' + d.replace('i', r'\,i') if 'i' in d else r' \approx ' + d
            parts.append(line)
            texts.append(f'{var.name} = {v}')
        return {**base, 'kind': 'solution', 'latex': r', \quad '.join(parts), 'text': ', '.join(texts),
                '_value': items[0] if len(items) == 1 else sympy.Tuple(*items)}
    if isinstance(sol, ConditionSet):
        roots = numeric_roots(f, var) if len(f.free_symbols) == 1 else []
        if roots:
            shown = roots[:6]
            fmt = [f'{r:.12g}' for r in shown]
            more = r', \quad \ldots' if len(roots) > 6 else ''
            return {**base, 'kind': 'solution', 'numeric': True,
                    'latex': r', \quad '.join(f'{var.name} \\approx {v}' for v in fmt) + more,
                    'text': ', '.join(f'{var.name} ≈ {v}' for v in fmt),
                    'note': 'No exact solution found; numeric roots in [-10, 10]',
                    '_value': sympy.Float(shown[0], 15) if len(shown) == 1 else sympy.Tuple(*[sympy.Float(r, 15) for r in shown])}
        return {**base, 'kind': 'nosolution', 'latex': r'\text{No closed-form solution found}',
                'text': 'No closed-form solution found'}
    return {**base, 'kind': 'solution', 'latex': f'{var.name} \\in {tex(sol)}', 'text': f'{var.name} in {sol}'}


def define(match, commit):
    name, params, body_txt = match.group(1), match.group(2), match.group(3)
    if name in RESERVED:
        raise UserError(f"'{name}' is a built-in name and can't be redefined")
    if params:
        plist = [p.strip() for p in params.split(',')]
        syms = {p: Symbol(p) for p in plist}
        body = parse(body_txt, extra=syms)
        value = Lambda(tuple(syms[p] for p in plist), body)
        shown = f'{name}({", ".join(plist)}) := {tex(body)}'
    else:
        value = parse(body_txt)
        shown = f'{name} := {tex(value)}'
    if commit:
        user_defs[name] = value
        user_def_src[name] = match.group(0).strip()
    d = decimal_of(value) if not params else None
    return {'kind': 'definition', 'name': name, 'committed': bool(commit), 'latex': shown,
            'text': match.group(0).strip(), 'decimal': d, '_value': value}


def evaluate(raw, commit):
    text = raw.strip()
    lowered = text.lower()
    if lowered in ('vars', 'variables', 'defs'):
        if not user_def_src:
            return {'kind': 'info', 'latex': r'\text{No definitions yet. Define one with } a := 5 \text{ or } f(x) := x^2',
                    'text': 'No definitions'}
        return {'kind': 'info', 'latex': r' \\ '.join(
            (f'{n}({", ".join(s.name for s in v.variables)}) := {tex(v.expr)}' if isinstance(v, Lambda)
             else f'{n} := {tex(v)}') for n, v in user_defs.items()),
            'text': '\n'.join(user_def_src.values())}
    if lowered in ('reset', 'clear'):
        if commit:
            clear_session()
        return {'kind': 'info', 'latex': r'\text{Definitions cleared}' if commit else r'\text{Press Enter to clear all definitions}',
                'text': 'reset'}

    m = DEFINITION.match(text)
    if m:
        return define(m, commit)

    explicit_plot = False
    pm = re.match(r'^(plot|graph)\s*(?:\((.*)\)|\s(.+))$', text, re.I | re.S)
    if pm:
        explicit_plot = True
        text = (pm.group(2) or pm.group(3) or '').strip()
    else:
        km = re.match(r'^([A-Za-z]+)\s+(.+)$', text, re.S)
        if km and km.group(1).lower() in SHORTHAND and not km.group(2).lstrip().startswith(('=', '+', '*', '/', '^')):
            op = SHORTHAND[km.group(1).lower()]
            body = km.group(2).strip()
            dm = re.search(r'(?:\s+|\*|,\s*)d([A-Za-z])\s*$', body) if op in ('diff', 'integrate') else None
            if dm:
                body = body[:dm.start()].strip()
                text = f'{op}({body}, {dm.group(1)})'
            else:
                text = f'{op}({body})'

    sides = split_equation(text)
    if sides and not explicit_plot:
        return solve_equation(sides[0], sides[1], raw)

    value = parse(text)
    if isinstance(value, bool) or value in (sympy.true, sympy.false):
        truth = bool(value)
        return {'kind': 'bool', 'latex': r'\text{true}' if truth else r'\text{false}', 'text': str(truth).lower(), 'vars': [],
                '_value': sympy.true if truth else sympy.false}
    if not isinstance(value, sympy.Basic):
        value = sympy.sympify(value)
    if value.has(sympy.Integral) and 'integrate' in text:
        raise UserError('SymPy could not find an antiderivative for this')
    if isinstance(value, Lambda) or value.has(Lambda):
        raise UserError('That is a function, not a value: call it, e.g. f(2) or $3(2)')
    if value.has(sympy.zoo) or value is sympy.nan or value.has(sympy.nan):
        raise UserError('Undefined (division by zero or an indeterminate form)')
    if getattr(value, 'is_number', False) and value.has(I):
        value = sympy.expand(value)
    names = sorted_symbols(value) if hasattr(value, 'free_symbols') else []
    result = {'kind': 'number' if getattr(value, 'is_number', False) else 'expr',
              'latex': tex(value), 'text': str(value), 'vars': names, '_value': value}
    if result['kind'] == 'number':
        d = decimal_of(value)
        if d is not None and d != str(value).replace('I', 'i').replace('*', ''):
            result['decimal'] = d
    head = re.match(r'^\s*([A-Za-z_]\w*)\s*\(', text)
    is_op = bool(head and head.group(1) in ALGEBRA_OPS)
    if names and (explicit_plot or not is_op):
        data = plot_data(value, names)
        if data:
            result['plot'] = data
    return result


def handle(req):
    op = req.get('op')
    if op == 'ping':
        return {'ok': True, 'kind': 'pong', 'version': SYMPY_VERSION}
    if op in ('reset', 'clear'):
        clear_session()
        return {'ok': True, 'kind': 'info'}
    if op == 'eval':
        global last_value
        row = req.get('row')
        row = int(row) if isinstance(row, int) and row > 0 else None
        try:
            res = evaluate(str(req.get('input', '')), bool(req.get('commit')) or row is not None)
            value = res.pop('_value', None)
            if row is not None:
                # A worksheet row: remember its value for $row and ans
                row_values.pop(row, None)
                if value is not None:
                    row_values[row] = value
                    # ans is the latest *value*; a function definition doesn't replace it
                    if not isinstance(value, Lambda):
                        last_value = value
                res['row'] = row
            res['ok'] = True
            return res
        except UserError as e:
            return {'ok': False, 'error': str(e)}
        except (SyntaxError, TokenError):
            return {'ok': False, 'error': 'Incomplete or invalid expression: check brackets and operators'}
        except sympy.SympifyError:
            return {'ok': False, 'error': 'Could not understand part of this expression'}
        except (TypeError, ValueError, AttributeError, NotImplementedError, ZeroDivisionError,
                sympy.PolynomialError) as e:
            msg = str(e).strip() or type(e).__name__
            return {'ok': False, 'error': msg[:300]}
        except RecursionError:
            return {'ok': False, 'error': 'Expression is too deeply nested'}
        except Exception as e:  # last resort: report, never crash the session
            return {'ok': False, 'error': f'{type(e).__name__}: {str(e)[:300]}'}
    return {'ok': False, 'error': f'Unknown op {op!r}'}


def main():
    # Isolated mode (-I) ignores PYTHONIOENCODING, and Windows pipes default to the
    # ANSI code page: without this, "30°" arrives as "30Â°"
    sys.stdin.reconfigure(encoding='utf-8', errors='replace')
    sys.stdout.reconfigure(encoding='utf-8')
    out = sys.stdout
    out.write(json.dumps({'id': 0, 'ok': True, 'kind': 'ready', 'version': SYMPY_VERSION}) + '\n')
    out.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError:
            continue
        res = handle(req)
        res['id'] = req.get('id')
        try:
            payload = json.dumps(res, allow_nan=False)
        except ValueError:
            payload = json.dumps({'id': req.get('id'), 'ok': False, 'error': 'Result could not be encoded'})
        out.write(payload + '\n')
        out.flush()


if __name__ == '__main__':
    main()
