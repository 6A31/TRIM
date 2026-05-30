const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatMarkdown } = require('../src/shared/markdownFormat');

describe('formatMarkdown', () => {
  it('renders bullet list with inline code containing %U', () => {
    const html = formatMarkdown('The command is:\n\n- `vesktop %U`');
    assert.match(html, /<ul>/);
    assert.match(html, /<code>vesktop %U<\/code>/);
    assert.doesNotMatch(html, /\*\*/);
  });

  it('does not apply italic inside restored inline code placeholders', () => {
    const html = formatMarkdown('Use `Exec` on the `vesktop.desktop` path.');
    assert.match(html, /<code>Exec<\/code>/);
    assert.match(html, /<code>vesktop\.desktop<\/code>/);
  });

  it('wraps bold without breaking on line breaks inside paragraph', () => {
    const html = formatMarkdown('**Exec** line references `/usr/share/applications/vesktop.desktop`.');
    assert.match(html, /<strong>Exec<\/strong>/);
    assert.match(html, /<code>\/usr\/share\/applications\/vesktop\.desktop<\/code>/);
  });

  it('groups multi-line unordered lists', () => {
    const html = formatMarkdown('- one\n- two');
    assert.equal(html, '<ul><li>one</li><li>two</li></ul>');
  });

  it('leaves unclosed bold as literal asterisks', () => {
    const html = formatMarkdown('vesktop %U **(typically unresolved');
    assert.match(html, /\*\*\(typically unresolved/);
  });
});
