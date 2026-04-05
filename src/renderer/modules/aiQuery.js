let isQuerying = false;

async function search(query) {
  if (!query.trim()) return [];
  isQuerying = true;

  // Return a loading indicator — actual response rendered after
  return [{ type: 'ai-loading' }];
}

async function execute(query, usePro, forceShow, renderFn) {
  // Listen for status updates from main process
  window.trim.onAIStatus((data) => {
    window._ui.updateAIStatus(data.text);
  });

  try {
    const result = await window.trim.aiQuery(query, usePro, forceShow);

    if (result.error) {
      renderFn({ type: 'ai-error', error: result.error });
    } else {
      renderFn({
        type: 'ai-response',
        text: result.text,
        sources: result.sources || [],
        codeOutputs: result.codeOutputs || [],
      });
    }
  } catch (err) {
    renderFn({ type: 'ai-error', error: err.message || 'Failed to reach Gemini' });
  } finally {
    isQuerying = false;
    window.trim.offAIStatus();
  }
}

function renderLatex(text) {
  if (!text || typeof katex === 'undefined') return text;

  // Display math: $$...$$ or \[...\]
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, expr) => {
    try { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
    catch { return _m; }
  });
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, expr) => {
    try { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
    catch { return _m; }
  });

  // Inline math: $...$ (not $$) or \(...\)
  text = text.replace(/\$([^\$\n]+?)\$/g, (_m, expr) => {
    try { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
    catch { return _m; }
  });
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_m, expr) => {
    try { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
    catch { return _m; }
  });

  return text;
}

function formatMarkdown(text) {
  if (!text) return '';

  // Protect code blocks from LaTeX processing
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });
  const inlineCodes = [];
  text = text.replace(/`([^`]+)`/g, (_m, code) => {
    inlineCodes.push(`<code>${code}</code>`);
    return `%%INLINE_${inlineCodes.length - 1}%%`;
  });

  // Render LaTeX
  text = renderLatex(text);

  // Restore code blocks
  text = text.replace(/%%CODEBLOCK_(\d+)%%/g, (_m, i) => codeBlocks[i]);
  text = text.replace(/%%INLINE_(\d+)%%/g, (_m, i) => inlineCodes[i]);

  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Ordered lists
    .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
    // Line breaks → paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/, '<p>$1</p>');
}

window._aiQuery = { search, execute, formatMarkdown };
