const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');
const {
  isCurrencyLikeDollarMath,
  getAiHtmlSanitizeConfig,
} = require('../src/shared/aiSanitize');

describe('isCurrencyLikeDollarMath', () => {
  it('treats bare amounts as currency', () => {
    assert.equal(isCurrencyLikeDollarMath('5'), true);
    assert.equal(isCurrencyLikeDollarMath('12.99'), true);
    assert.equal(isCurrencyLikeDollarMath('12,50'), true);
  });

  it('does not treat real math as currency', () => {
    assert.equal(isCurrencyLikeDollarMath('3^{\\frac{1}{3}}'), false);
    assert.equal(isCurrencyLikeDollarMath('2x'), false);
    assert.equal(isCurrencyLikeDollarMath('\\sqrt{n}'), false);
    assert.equal(isCurrencyLikeDollarMath('x \\cdot x \\cdot x = 3'), false);
  });
});

describe('KaTeX sanitize allowlist', () => {
  it('includes svg/path so radicals survive DOMPurify', () => {
    const cfg = getAiHtmlSanitizeConfig();
    assert.ok(cfg.ALLOWED_TAGS.includes('svg'));
    assert.ok(cfg.ALLOWED_TAGS.includes('path'));
    assert.ok(cfg.ALLOWED_TAGS.includes('math'));
    assert.ok(cfg.ALLOWED_ATTR.includes('viewBox'));
    assert.ok(cfg.ALLOWED_ATTR.includes('d'));
  });

  it('KaTeX emits svg for square and cube roots', () => {
    const html = katex.renderToString('\\sqrt{n}+\\sqrt[3]{3}', { throwOnError: false });
    assert.match(html, /<svg/);
    assert.match(html, /<path/);
  });
});
