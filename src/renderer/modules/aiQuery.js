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

function formatMarkdown(text) {
  if (!text) return '';
  return text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
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
