// Module scope: renderer scripts are classic <script>s, so without this wrapper
// every top-level function becomes a global and modules overwrite each other
// (and builtins like window.open / window.close).
(function () {
/**
 * AI response HTML sanitize + inline-math helpers (shared by renderer + tests).
 */

/**
 * Decide whether paired $...$ content should go through KaTeX.
 * Renders real math (including $5$, $x$) but skips accidental prose
 * captured between two dollar signs (e.g. "$5 and $10" → "5 and ").
 */
function shouldRenderDollarMath(expr) {
  const t = String(expr).trim();
  if (!t) return false;

  // Single number or single-letter identifier: $5$, $42$, $3.14$, $x$
  if (/^([A-Za-z]|(\d+([.,]\d+)?))$/.test(t)) return true;

  // TeX commands, operators, relations, braces
  if (/[\\^_={}<>]|[+\-*/×÷·±]/.test(t)) return true;

  // Spaced content: only math if it still has math structure (e.g. "x = 2")
  if (/\s/.test(t)) {
    if (/[=\\^_{}+*/<>()]|\\[a-zA-Z]+/.test(t)) return true;
    return false; // prose like "5 and "
  }

  // Compact identifiers / calls: 2x, f(x), abc
  if (/[A-Za-z()]/.test(t)) return true;

  return true;
}

/** @deprecated use shouldRenderDollarMath; kept for older call sites */
function isCurrencyLikeDollarMath(expr) {
  return !shouldRenderDollarMath(expr) && /^\d+([.,]\d{1,2})?$/.test(String(expr).trim());
}

function getAiHtmlSanitizeConfig() {
  return {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
      'ul', 'ol', 'li', 'code', 'pre', 'div', 'span', 'img', 'a', 'button',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'hr', 'sup', 'sub',
      // KaTeX radicals / stretchy chars use SVG; MathML is the accessibility tree
      'svg', 'path', 'line', 'g', 'defs', 'use', 'rect', 'clippath',
      'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msubsup',
      'mfrac', 'msqrt', 'mroot', 'mtext', 'annotation', 'mspace',
      'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd',
      'mstyle', 'mpadded', 'mphantom', 'menclose',
    ],
    ALLOWED_ATTR: [
      'class', 'style', 'alt', 'src', 'title', 'href', 'data-uri', 'target', 'rel', 'align',
      'viewBox', 'xmlns', 'd', 'width', 'height', 'preserveAspectRatio',
      'aria-hidden', 'focusable', 'role', 'encoding',
      'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
      'fill', 'stroke', 'stroke-width', 'transform', 'clip-path',
    ],
    ALLOW_DATA_ATTR: false,
  };
}

const api = { shouldRenderDollarMath, isCurrencyLikeDollarMath, getAiHtmlSanitizeConfig };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window._aiSanitize = api;
}
})();
