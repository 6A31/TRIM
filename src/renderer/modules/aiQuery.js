// Module scope: renderer scripts are classic <script>s, so without this wrapper
// every top-level function becomes a global and modules overwrite each other
// (and builtins like window.open / window.close).
(function () {
let isQuerying = false;
let hasConversation = false;
let conversationPrefix = null; // 'ai' or 'ai_pro'
let currentSessionId = null;
let sessionTitle = null;
let queryGeneration = 0; // bumped on abort so late results are ignored
let activeRenderFn = null;
let inflightMode = null; // mode of the query currently running

async function search(query) {
  if (!query.trim()) return [];
  return [{ type: 'ai-loading' }];
}

function newSessionId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function execute(query, mode, forceShow, renderFn, pastedImages) {
  if (isQuerying) return;
  isQuerying = true;
  const generation = ++queryGeneration;
  activeRenderFn = renderFn;
  inflightMode = mode;

  const usePro = mode === 'ai_pro';
  const followUp = hasConversation && conversationPrefix === mode;

  if (!followUp) {
    currentSessionId = newSessionId();
    sessionTitle = (query || '').trim().slice(0, 80) || 'New chat';
  }

  window.trim.offAIStatus();
  window.trim.onAIStatus((data) => {
    window._ui.updateAIStatus(data.text);
  });

  try {
    const result = await window.trim.aiQuery(query, usePro, forceShow, followUp, pastedImages || []);

    // Stopped by the user (or superseded): abort() already updated the UI
    if (generation !== queryGeneration || (result && result.error === '__aborted__')) return;

    if (result.error) {
      renderFn({ type: 'ai-error', error: result.error });
    } else {
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

      // Persist after DOM updates (caller renders synchronously before we await)
      queueMicrotask(() => {
        if (window._ui && window._ui.persistCurrentConversation) {
          window._ui.persistCurrentConversation();
        }
      });
    }
  } catch (err) {
    if (generation !== queryGeneration) return;
    renderFn({ type: 'ai-error', error: err.message || 'Failed to reach Gemini' });
  } finally {
    if (generation === queryGeneration) {
      isQuerying = false;
      activeRenderFn = null;
      inflightMode = null;
      window.trim.offAIStatus();
    }
  }
}

/** Stop the in-flight query. Returns true if something was running. */
function abort() {
  if (!isQuerying) return false;
  queryGeneration++;
  isQuerying = false;
  inflightMode = null;
  const renderFn = activeRenderFn;
  activeRenderFn = null;
  window.trim.offAIStatus();
  try { window.trim.abortAIQuery(); } catch {}
  if (renderFn) renderFn({ type: 'ai-stopped' });
  return true;
}

function prepareForQuery(mode) {
  if (hasConversation && conversationPrefix !== mode) {
    hasConversation = false;
    conversationPrefix = null;
    currentSessionId = null;
    sessionTitle = null;
  }
}

function clearConversation() {
  if (isQuerying) abort();
  hasConversation = false;
  conversationPrefix = null;
  currentSessionId = null;
  sessionTitle = null;
}

function isFollowUp() {
  return hasConversation;
}

function isBusy() {
  return isQuerying;
}

function getConversationPrefix() {
  return conversationPrefix;
}

/** Mode of the active chat, or of the query still running before the first answer. */
function getActiveMode() {
  return conversationPrefix || inflightMode || 'ai';
}

function getSessionMeta() {
  return { id: currentSessionId, title: sessionTitle, mode: conversationPrefix };
}

function restoreSession(meta) {
  hasConversation = true;
  conversationPrefix = meta.mode || 'ai';
  currentSessionId = meta.id || null;
  sessionTitle = meta.title || null;
}

function escapeHtmlInline(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function protectMath(text) {
  const slots = [];
  const stash = (html) => {
    slots.push(html);
    return `%%MATH_${slots.length - 1}%%`;
  };

  // Protect fenced + inline code from math rewriting
  const codeSlots = [];
  text = text.replace(/```[\s\S]*?```/g, (m) => {
    codeSlots.push(m);
    return `%%CODEPROTECT_${codeSlots.length - 1}%%`;
  });
  text = text.replace(/`[^`\n]+`/g, (m) => {
    codeSlots.push(m);
    return `%%CODEPROTECT_${codeSlots.length - 1}%%`;
  });

  // Display math first
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, expr) => {
    try {
      return stash(typeof katex !== 'undefined'
        ? katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false })
        : `$$${expr}$$`);
    } catch {
      return _m;
    }
  });
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, expr) => {
    try {
      return stash(typeof katex !== 'undefined'
        ? katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false })
        : `\\[${expr}\\]`);
    } catch {
      return _m;
    }
  });

  // Inline math
  text = text.replace(/\$([^\$\n]+?)\$/g, (_m, expr) => {
    // Render math ($5$, $x$, TeX); skip prose accidentally caught between $…$
    const shouldRender = (typeof window !== 'undefined' && window._aiSanitize)
      ? window._aiSanitize.shouldRenderDollarMath(expr)
      : true;
    if (!shouldRender) return _m;
    try {
      return stash(typeof katex !== 'undefined'
        ? katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false })
        : `$${expr}$`);
    } catch {
      return _m;
    }
  });
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_m, expr) => {
    try {
      return stash(typeof katex !== 'undefined'
        ? katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false })
        : `\\(${expr}\\)`);
    } catch {
      return _m;
    }
  });

  // Restore code before markdown parse
  text = text.replace(/%%CODEPROTECT_(\d+)%%/g, (_m, i) => codeSlots[Number(i)]);

  return { text, slots };
}

function formatMarkdown(text) {
  if (!text) return '';

  const { text: withMath, slots } = protectMath(text);

  let html;
  const parse = (typeof marked !== 'undefined')
    ? (marked.parse || marked.marked || (typeof marked === 'function' ? marked : null))
    : null;

  if (parse) {
    if (typeof marked.setOptions === 'function') {
      marked.setOptions({ gfm: true, breaks: true });
    }
    html = parse(withMath);
  } else {
    html = escapeHtmlInline(withMath)
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    html = `<p>${html}</p>`;
  }

  html = html.replace(/%%MATH_(\d+)%%/g, (_m, i) => slots[Number(i)] || '');
  return html;
}

function highlightCodeBlocks(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre code').forEach(el => {
    if (el.classList.contains('hljs')) return;
    try { hljs.highlightElement(el); } catch {}
  });
}

window._aiQuery = {
  search,
  execute,
  prepareForQuery,
  formatMarkdown,
  clearConversation,
  isFollowUp,
  isBusy,
  abort,
  getConversationPrefix,
  getActiveMode,
  getSessionMeta,
  restoreSession,
  highlightCodeBlocks,
};
})();
