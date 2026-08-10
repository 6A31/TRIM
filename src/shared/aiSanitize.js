/**
 * AI response HTML sanitize + inline-math helpers (shared by renderer + tests).
 */

function isCurrencyLikeDollarMath(expr) {
  // Only treat bare amounts as currency ($5, $12.99). Do NOT skip real math like $3^{\frac{1}{3}}$.
  return /^\d+([.,]\d{1,2})?$/.test(String(expr).trim());
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

const api = { isCurrencyLikeDollarMath, getAiHtmlSanitizeConfig };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window._aiSanitize = api;
}
