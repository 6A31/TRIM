let isQuerying = false;
let hasConversation = false;
let conversationPrefix = null; // 'ai', 'ai_pro', or 'solve'

async function search(query) {
  if (!query.trim()) return [];
  // Return a loading indicator - actual response rendered after
  return [{ type: 'ai-loading' }];
}

async function execute(query, mode, forceShow, renderFn) {
  if (isQuerying) return; // Prevent concurrent queries
  isQuerying = true;

  const usePro = mode === 'ai_pro';
  const followUp = hasConversation && conversationPrefix === mode;

  // Clean up previous listener before re-registering
  window.trim.offAIStatus();
  window.trim.onAIStatus((data) => {
    window._ui.updateAIStatus(data.text);
  });

  try {
    const result = await window.trim.aiQuery(query, usePro, forceShow, followUp);

    // Silently ignore aborted queries
    if (result.error === '__aborted__') return;

    if (result.error) {
      renderFn({ type: 'ai-error', error: result.error });
    } else {
      renderFn({
        type: 'ai-response',
        text: result.text,
        sources: result.sources || [],
        codeOutputs: result.codeOutputs || [],
      });
      // Mark conversation active
      hasConversation = true;
      conversationPrefix = mode;
    }
  } catch (err) {
    renderFn({ type: 'ai-error', error: err.message || 'Failed to reach Gemini' });
  } finally {
    isQuerying = false;
    window.trim.offAIStatus();
  }
}

// Call before showAILoading to handle mode switches (e.g. ? → ??)
function prepareForQuery(mode) {
  if (hasConversation && conversationPrefix !== mode) {
    hasConversation = false;
    conversationPrefix = null;
  }
}

function clearConversation() {
  hasConversation = false;
  conversationPrefix = null;
}

function isFollowUp() {
  return hasConversation;
}

function getConversationPrefix() {
  return conversationPrefix;
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
  text = text.replace(/\$([^\$]+?)\$/g, (_m, expr) => {
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
    const cls = lang ? ` class="language-${lang}"` : '';
    codeBlocks.push(`<pre><code${cls}>${escapeHtmlInline(code)}</code></pre>`);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });
  const inlineCodes = [];
  text = text.replace(/`([^`]+)`/g, (_m, code) => {
    inlineCodes.push(`<code>${escapeHtmlInline(code)}</code>`);
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

function escapeHtmlInline(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightCodeBlocks(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre code[class*="language-"]').forEach(el => {
    hljs.highlightElement(el);
  });
}

window._aiQuery = { search, execute, prepareForQuery, formatMarkdown, clearConversation, isFollowUp, getConversationPrefix, highlightCodeBlocks };
