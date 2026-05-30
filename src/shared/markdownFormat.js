/**
 * Lightweight markdown → HTML for AI responses (renderer-safe subset).
 * Used by aiQuery.js; tested in Node without Electron.
 */

function escapeHtmlInline(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, (_m, inner) => `<strong>${inner}</strong>`)
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, (_m, inner) => `<em>${inner}</em>`);
}

function formatMarkdown(text, { renderLatex = (t) => t } = {}) {
  if (!text) return '';

  const codeBlocks = [];
  text = text.replace(/```(\w*)[\r\n]?([\s\S]*?)```/g, (_m, lang, code) => {
    const cls = lang ? ` class="language-${lang}"` : '';
    codeBlocks.push(`<pre><code${cls}>${escapeHtmlInline(code.replace(/\n$/, ''))}</code></pre>`);
    return `\n%%CODEBLOCK_${codeBlocks.length - 1}%%\n`;
  });

  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_m, code) => {
    inlineCodes.push(`<code>${escapeHtmlInline(code)}</code>`);
    return `%%INLINE_${inlineCodes.length - 1}%%`;
  });

  text = renderLatex(text);

  const restorePlaceholders = (chunk) => chunk
    .replace(/%%CODEBLOCK_(\d+)%%/g, (_m, i) => codeBlocks[Number(i)])
    .replace(/%%INLINE_(\d+)%%/g, (_m, i) => inlineCodes[Number(i)]);

  const blocks = text.split(/\n\n+/);
  const htmlBlocks = blocks.map((block) => {
    block = block.trim();
    if (!block) return '';

    if (/^%%CODEBLOCK_\d+%%$/.test(block)) {
      return restorePlaceholders(block);
    }

    const lines = block.split('\n').filter((l) => l.length > 0);
    if (lines.length === 0) return '';

    const isUl = lines.every((l) => /^[*-] /.test(l));
    if (isUl) {
      const items = lines.map((l) => {
        const body = formatInlineMarkdown(l.replace(/^[*-] /, ''));
        return `<li>${restorePlaceholders(body)}</li>`;
      });
      return `<ul>${items.join('')}</ul>`;
    }

    const isOl = lines.every((l) => /^\d+\.\s/.test(l));
    if (isOl) {
      const items = lines.map((l) => {
        const body = formatInlineMarkdown(l.replace(/^\d+\.\s/, ''));
        return `<li>${restorePlaceholders(body)}</li>`;
      });
      return `<ol>${items.join('')}</ol>`;
    }

    const body = lines
      .map((l) => restorePlaceholders(formatInlineMarkdown(l)))
      .join('<br>');
    return `<p>${body}</p>`;
  });

  return htmlBlocks.filter(Boolean).join('');
}

module.exports = { formatMarkdown, formatInlineMarkdown, escapeHtmlInline };
