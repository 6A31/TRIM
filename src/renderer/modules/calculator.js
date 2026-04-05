function search(expression) {
  if (!expression.trim()) return [];

  try {
    const result = evaluate(expression);
    if (result === undefined || result === null || isNaN(result)) {
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

function evaluate(expr) {
  // Whitelist: digits, operators, parens, decimal, spaces, math keywords
  const sanitized = expr
    .replace(/\s+/g, '')
    .replace(/,/g, ''); // remove thousands separators

  // Check for disallowed chars
  if (/[^0-9+\-*/().%^a-zA-Z ]/.test(sanitized)) {
    return undefined;
  }

  // Replace math functions/constants
  const prepared = sanitized
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\basin\b/g, 'Math.asin')
    .replace(/\bacos\b/g, 'Math.acos')
    .replace(/\batan\b/g, 'Math.atan')
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\bcbrt\b/g, 'Math.cbrt')
    .replace(/\babs\b/g, 'Math.abs')
    .replace(/\blog\b/g, 'Math.log10')
    .replace(/\bln\b/g, 'Math.log')
    .replace(/\bexp\b/g, 'Math.exp')
    .replace(/\bround\b/g, 'Math.round')
    .replace(/\bceil\b/g, 'Math.ceil')
    .replace(/\bfloor\b/g, 'Math.floor')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/\^/g, '**')
    .replace(/%/g, '/100*');

  // Block anything that looks like assignment/property access/function call beyond Math
  if (/[a-zA-Z]/.test(prepared.replace(/Math\.\w+/g, ''))) {
    return undefined;
  }

  return new Function(`"use strict"; return (${prepared})`)();
}

window._calculator = { search };
