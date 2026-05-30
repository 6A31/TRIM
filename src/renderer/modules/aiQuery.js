let isQuerying = false;
let hasConversation = false;
let conversationPrefix = null; // 'ai' or 'ai_pro'

async function search(query) {
  if (!query.trim()) return [];
  // Return a loading indicator - actual response rendered after
  return [{ type: 'ai-loading' }];
}

async function execute(query, mode, forceShow, renderFn, pastedImages) {
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
    const result = await window.trim.aiQuery(query, usePro, forceShow, followUp, pastedImages || []);

    // Silently ignore aborted queries
    if (result.error === '__aborted__') return;

    if (result.error) {
      renderFn({ type: 'ai-error', error: result.error });
    } else {
      // Mark conversation active before rendering so the input hint can show
      hasConversation = true;
      conversationPrefix = mode;
      renderFn({
        type: 'ai-response',
        text: result.text,
        sources: result.sources || [],
        codeOutputs: result.codeOutputs || [],
        generatedImages: result.generatedImages || [],
        turnIndex: result.turnIndex,
        hadFileChanges: result.hadFileChanges || false,
      });
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

const { formatMarkdown: formatMarkdownCore } = require('../../shared/markdownFormat');

function formatMarkdown(text) {
  return formatMarkdownCore(text, { renderLatex });
}

function highlightCodeBlocks(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre code[class*="language-"]').forEach(el => {
    hljs.highlightElement(el);
  });
}

window._aiQuery = { search, execute, prepareForQuery, formatMarkdown, clearConversation, isFollowUp, getConversationPrefix, highlightCodeBlocks };
