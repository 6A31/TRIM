const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');
const {
  shouldRenderDollarMath,
  getAiHtmlSanitizeConfig,
} = require('../src/shared/aiSanitize');

describe('shouldRenderDollarMath', () => {
  it('renders real math including bare numbers and letters', () => {
    assert.equal(shouldRenderDollarMath('5'), true);
    assert.equal(shouldRenderDollarMath('x'), true);
    assert.equal(shouldRenderDollarMath('3^{\\frac{1}{3}}'), true);
    assert.equal(shouldRenderDollarMath('2x'), true);
    assert.equal(shouldRenderDollarMath('\\sqrt{n}'), true);
    assert.equal(shouldRenderDollarMath('x \\cdot x \\cdot x = 3'), true);
    assert.equal(shouldRenderDollarMath('f(x)=2x'), true);
    assert.equal(shouldRenderDollarMath('3\\cdot(a+b)'), true);
  });

  it('skips spaced prose captured between dollar signs', () => {
    assert.equal(shouldRenderDollarMath('5 and '), false);
    assert.equal(shouldRenderDollarMath('5 and 10 more'), false);
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
