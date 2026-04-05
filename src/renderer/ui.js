let selectedIndex = -1;
let currentResults = [];
const MAX_VISIBLE = 8;

function init() {
  document.addEventListener('keydown', handleKeyboard);
}

function handleKeyboard(e) {
  if (window._settings.isOpen()) {
    if (e.key === 'Escape') {
      e.preventDefault();
      window._settings.close();
    }
    return;
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectNext();
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectPrev();
      break;
    case 'Enter':
      e.preventDefault();
      // If file picker is showing, select the file instead of sending
      if (window._inputRouter.isFilePickActive() && currentResults.length > 0 && currentResults[0].type === 'file-ref') {
        const sel = currentResults[selectedIndex >= 0 ? selectedIndex : 0];
        if (sel.action) sel.action();
        break;
      }
      // If in AI mode, fire the query
      const input = document.getElementById('search-input').value;
      const forceShow = window._chips && window._chips.isActive('force_code');
      if (input.startsWith('??')) {
        const query = input.slice(2).trim();
        if (query) {
          window._aiQuery.prepareForQuery('ai_pro');
          showAILoading('Asking Gemini Pro...');
          window._aiQuery.execute(query, 'ai_pro', forceShow, (response) => {
            renderAIResponse(response);
          });
        }
      } else if (input.startsWith('?')) {
        const query = input.slice(1).trim();
        if (query) {
          window._aiQuery.prepareForQuery('ai');
          showAILoading();
          window._aiQuery.execute(query, 'ai', forceShow, (response) => {
            renderAIResponse(response);
          });
        }
      } else if (input.startsWith('cs:')) {
        const expr = input.slice(3).trim();
        if (expr) {
          window._aiQuery.prepareForQuery('solve');
          showAILoading('Solving...');
          // Only wrap with solve instructions on first query, not follow-ups
          const isFollowUp = window._aiQuery.isFollowUp();
          const solvePrompt = isFollowUp ? expr : `Solve this math problem step by step. Use LaTeX notation ($$...$$ for display, $...$ for inline) for all math expressions. Use the run_python tool to compute and verify your answer. Show clear, concise steps.\n\nProblem: ${expr}`;
          window._aiQuery.execute(solvePrompt, 'solve', true, (response) => {
            renderAIResponse(response);
          });
        }
      } else {
        executeSelected();
      }
      break;
    case 'Escape':
      e.preventDefault();
      window.trim.hideWindow();
      break;
    case 'Tab':
      e.preventDefault();
      // Autocomplete for file references or commands
      if (currentResults.length > 0 && currentResults[0].type === 'file-ref') {
        const sel = currentResults[selectedIndex >= 0 ? selectedIndex : 0];
        if (sel.action) sel.action();
      } else if (currentResults.length > 0 && currentResults[0].type === 'command') {
        document.getElementById('search-input').value = currentResults[selectedIndex >= 0 ? selectedIndex : 0].title;
      }
      break;
  }
}

function selectNext() {
  if (currentResults.length === 0) return;
  selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
  updateSelection();
}

function selectPrev() {
  if (currentResults.length === 0) return;
  selectedIndex = Math.max(selectedIndex - 1, 0);
  updateSelection();
}

function updateSelection() {
  const items = document.querySelectorAll('.result-item');
  items.forEach((el, i) => {
    el.classList.toggle('selected', i === selectedIndex);
  });
  // Scroll into view
  const selected = items[selectedIndex];
  if (selected) selected.scrollIntoView({ block: 'nearest' });
}

function executeSelected() {
  if (selectedIndex >= 0 && selectedIndex < currentResults.length) {
    const result = currentResults[selectedIndex];
    if (result.action) result.action();
    if (result.type !== 'command' && result.type !== 'calc') {
      window.trim.hideWindow();
    }
  }
}

function getBarHeight() {
  return document.getElementById('search-bar').offsetHeight;
}

async function renderResults(results) {
  const container = document.getElementById('results-container');
  const aiContainer = document.getElementById('ai-response-container');
  const settingsPanel = document.getElementById('settings-panel');

  aiContainer.classList.add('hidden');
  settingsPanel.classList.add('hidden');
  container.classList.remove('hidden');

  currentResults = results;
  selectedIndex = results.length > 0 ? 0 : -1;

  if (results.length === 0) {
    container.innerHTML = '';
    document.getElementById('search-bar').classList.remove('has-results');
    window.trim.resizeWindow(getBarHeight());
    return;
  }

  document.getElementById('search-bar').classList.add('has-results');
  container.innerHTML = '';
  for (const result of results) {
    const el = createResultElement(result);
    container.appendChild(el);
  }

  updateSelection();

  // Measure after paint to get accurate heights
  requestAnimationFrame(() => {
    const barH = getBarHeight();
    const resultsH = container.scrollHeight;
    window.trim.resizeWindow(barH + resultsH + 2);
  });

  // Lazy-load app icons
  for (const result of results) {
    if (result.type === 'app' && result.iconPath && !result.icon) {
      loadAppIcon(result);
    }
  }
}

function createResultElement(result) {
  const el = document.createElement('div');
  el.className = 'result-item';
  el.addEventListener('click', () => {
    if (result.action) result.action();
    if (result.type !== 'command' && result.type !== 'calc') {
      window.trim.hideWindow();
    }
  });

  const iconDiv = document.createElement('div');
  iconDiv.className = 'result-icon';

  if (result.icon && result.icon.startsWith('data:')) {
    const img = document.createElement('img');
    img.src = result.icon;
    iconDiv.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'material-symbols-rounded';
    span.textContent = result.icon || 'apps';
    iconDiv.appendChild(span);
  }

  const textDiv = document.createElement('div');
  textDiv.className = 'result-text';

  const titleEl = document.createElement('div');
  titleEl.className = 'result-title';
  titleEl.textContent = result.title;

  const subtitleEl = document.createElement('div');
  subtitleEl.className = 'result-subtitle';
  subtitleEl.textContent = result.subtitle || '';

  textDiv.appendChild(titleEl);
  textDiv.appendChild(subtitleEl);

  el.appendChild(iconDiv);
  el.appendChild(textDiv);

  if (result.type) {
    const badge = document.createElement('span');
    badge.className = 'result-badge';
    const labels = { app: 'App', calc: 'Copy', folder: 'Open', command: 'Run', 'file-ref': 'Ref' };
    badge.textContent = labels[result.type] || '';
    if (badge.textContent) el.appendChild(badge);
  }

  const shortcut = document.createElement('span');
  shortcut.className = 'result-shortcut';
  const shortcutIcon = document.createElement('span');
  shortcutIcon.className = 'material-symbols-rounded';
  shortcutIcon.style.fontSize = '16px';
  shortcutIcon.textContent = 'keyboard_return';
  shortcut.appendChild(shortcutIcon);
  el.appendChild(shortcut);

  return el;
}

async function loadAppIcon(result) {
  try {
    const icon = await window._appSearch.loadIcon(result.iconPath);
    if (icon) {
      result.icon = icon;
      // Update the DOM if visible
      const items = document.querySelectorAll('.result-item');
      const idx = currentResults.indexOf(result);
      if (idx >= 0 && items[idx]) {
        const iconDiv = items[idx].querySelector('.result-icon');
        iconDiv.innerHTML = `<img src="${icon}">`;
      }
    }
  } catch {
    // ignore
  }
}

function showAILoading(statusText) {
  const container = document.getElementById('results-container');
  const aiContainer = document.getElementById('ai-response-container');
  const settingsPanel = document.getElementById('settings-panel');

  container.classList.add('hidden');
  settingsPanel.classList.add('hidden');
  aiContainer.classList.remove('hidden');
  document.getElementById('search-bar').classList.add('has-results');

  const isFollowUp = window._aiQuery && window._aiQuery.isFollowUp();

  if (!isFollowUp) {
    aiContainer.innerHTML = '';
  }

  // Show the user's query as a header for follow-ups
  if (isFollowUp) {
    const input = document.getElementById('search-input').value;
    const queryText = input.startsWith('cs:') ? input.slice(3).trim()
      : input.startsWith('??') ? input.slice(2).trim()
      : input.startsWith('?') ? input.slice(1).trim() : input;
    const queryDiv = document.createElement('div');
    queryDiv.className = 'ai-follow-up-query';
    queryDiv.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px">person</span> ${escapeHtml(queryText)}`;
    aiContainer.appendChild(queryDiv);
  }

  // Add loading spinner in a turn container
  const turnDiv = document.createElement('div');
  turnDiv.className = 'ai-current-turn';
  turnDiv.innerHTML = `
    <div class="ai-loading">
      <div class="spinner"></div>
      <span>${escapeHtml(statusText || 'Asking Gemini...')}</span>
    </div>
  `;
  aiContainer.appendChild(turnDiv);

  requestAnimationFrame(() => {
    const h = getBarHeight() + aiContainer.scrollHeight;
    window.trim.resizeWindow(Math.min(h, 500));
    smartScroll(aiContainer);
  });
  currentResults = [];
  selectedIndex = -1;
}

function updateAIStatus(statusText) {
  const aiContainer = document.getElementById('ai-response-container');
  const loadingEl = aiContainer.querySelector('.ai-loading');
  if (loadingEl) {
    const span = loadingEl.querySelector('span');
    if (span) span.textContent = statusText;
    requestAnimationFrame(() => {
      const h = getBarHeight() + aiContainer.scrollHeight;
      window.trim.resizeWindow(Math.min(h, 500));
    });
  }
}

function buildResponseHTML(response) {
  let html = `<div class="ai-text">${window._aiQuery.formatMarkdown(response.text)}</div>`;

  if (response.codeOutputs && response.codeOutputs.length > 0) {
    for (const output of response.codeOutputs) {
      html += `<div class="ai-code-output">`;
      if (output.code) {
        html += `<div class="ai-code-header">
          <span class="material-symbols-rounded" style="font-size:14px">code</span>
          <span>Python</span>
          <button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.ai-code-output').querySelector('.ai-code-block code').textContent).then(()=>{this.querySelector('span').textContent='check';setTimeout(()=>this.querySelector('span').textContent='content_copy',1500)})">
            <span class="material-symbols-rounded" style="font-size:14px">content_copy</span>
          </button>
        </div>
        <pre class="ai-code-block"><code class="language-python">${escapeHtml(output.code)}</code></pre>`;
      }
      if (output.stdout) {
        html += `<div class="ai-code-header">
          <span class="material-symbols-rounded" style="font-size:14px">terminal</span>
          <span>Output</span>
        </div>
        <pre class="ai-code-result"><code>${escapeHtml(output.stdout)}</code></pre>`;
      }
      if (output.plot) {
        html += `<div class="ai-code-header">
          <span class="material-symbols-rounded" style="font-size:14px">show_chart</span>
          <span>Plot</span>
        </div>
        <div class="ai-plot"><img src="${output.plot}" alt="Plot"></div>`;
      }
      if (output.error) {
        html += `<pre class="ai-code-error"><code>${escapeHtml(output.error)}</code></pre>`;
      }
      html += `</div>`;
    }
  }

  if (response.sources && response.sources.length > 0) {
    html += `<div class="ai-sources">
      <button class="ai-sources-toggle" onclick="this.parentElement.classList.toggle('expanded'); setTimeout(() => {
        const c = document.getElementById('ai-response-container');
        const h = document.getElementById('search-bar').offsetHeight + c.scrollHeight;
        window.trim.resizeWindow(Math.min(h, 500));
      }, 10)">
        <span class="material-symbols-rounded" style="font-size:14px">link</span>
        <span>${response.sources.length} source${response.sources.length > 1 ? 's' : ''}</span>
        <span class="material-symbols-rounded ai-sources-chevron" style="font-size:16px">expand_more</span>
      </button>
      <div class="ai-sources-list">
        ${response.sources.map(s =>
          `<a class="ai-source-link" href="#" onclick="event.preventDefault()" title="${escapeHtml(s.uri || '')}">
            <span class="material-symbols-rounded" style="font-size:14px">open_in_new</span>
            ${escapeHtml(s.title || s.uri || 'Source')}
          </a>`
        ).join('')}
      </div>
    </div>`;
  }

  return html;
}

function renderAIResponse(response) {
  const aiContainer = document.getElementById('ai-response-container');
  const turnDiv = aiContainer.querySelector('.ai-current-turn');

  if (response.type === 'ai-error') {
    const errorHTML = `
      <div class="ai-error">
        <span class="material-symbols-rounded" style="font-size:18px">error</span>
        ${escapeHtml(response.error)}
      </div>
    `;
    if (turnDiv) {
      turnDiv.innerHTML = errorHTML;
      turnDiv.classList.remove('ai-current-turn');
    } else {
      aiContainer.innerHTML = errorHTML;
    }
    requestAnimationFrame(() => {
      const h = getBarHeight() + aiContainer.scrollHeight;
      window.trim.resizeWindow(Math.min(h, 500));
      smartScroll(aiContainer);
    });
    return;
  }

  const html = buildResponseHTML(response);

  if (turnDiv) {
    turnDiv.innerHTML = html;
    turnDiv.classList.remove('ai-current-turn');
  } else {
    aiContainer.innerHTML = html;
  }

  // Syntax highlighting + copy buttons for markdown code blocks
  postProcessCodeBlocks(aiContainer);

  // Resize to fit content, capped
  requestAnimationFrame(() => {
    const contentH = getBarHeight() + aiContainer.scrollHeight;
    window.trim.resizeWindow(Math.min(contentH, 500));
    smartScroll(aiContainer);
  });

  // Prep input for follow-up: clear to just the prefix
  const searchInput = document.getElementById('search-input');
  const val = searchInput.value;
  const prefix = val.startsWith('cs:') ? 'cs: '
    : val.startsWith('??') ? '?? '
    : val.startsWith('?') ? '? ' : '';
  if (prefix) {
    searchInput.value = prefix;
    searchInput.setSelectionRange(prefix.length, prefix.length);
  }
}

function postProcessCodeBlocks(container) {
  // Syntax highlighting
  if (window._aiQuery) window._aiQuery.highlightCodeBlocks(container);

  // Add copy buttons to markdown code blocks (ai-text pre blocks that don't already have one)
  container.querySelectorAll('.ai-text pre').forEach(pre => {
    if (pre.querySelector('.code-copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px">content_copy</span>';
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code');
      if (code) navigator.clipboard.writeText(code.textContent).then(() => {
        btn.querySelector('span').textContent = 'check';
        setTimeout(() => btn.querySelector('span').textContent = 'content_copy', 1500);
      });
    });
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

function clearResults() {
  document.getElementById('results-container').innerHTML = '';
  document.getElementById('results-container').classList.remove('hidden');
  document.getElementById('ai-response-container').innerHTML = '';
  document.getElementById('ai-response-container').classList.add('hidden');
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('search-bar').classList.remove('has-results');
  currentResults = [];
  selectedIndex = -1;
  window.trim.resizeWindow(getBarHeight());
  // Clear conversation history
  if (window._aiQuery) window._aiQuery.clearConversation();
}

function smartScroll(aiContainer) {
  const followUps = aiContainer.querySelectorAll('.ai-follow-up-query');
  if (followUps.length === 0) {
    // Single request — always top-aligned
    aiContainer.scrollTop = 0;
    return;
  }
  // Follow-up — anchor the latest follow-up query to the top,
  // unless remaining content is shorter than the viewport (fill it instead)
  const lastQuery = followUps[followUps.length - 1];
  const queryTop = lastQuery.offsetTop;
  const remainingHeight = aiContainer.scrollHeight - queryTop;
  if (remainingHeight >= aiContainer.clientHeight) {
    aiContainer.scrollTop = queryTop;
  } else {
    aiContainer.scrollTop = aiContainer.scrollHeight - aiContainer.clientHeight;
  }
}

function showConfirmation(details) {
  const aiContainer = document.getElementById('ai-response-container');
  const turnDiv = aiContainer.querySelector('.ai-current-turn');
  if (!turnDiv) return;

  let icon, title, body;
  if (details.tool === 'write_file') {
    icon = 'edit_document';
    title = 'Write file';
    body = `<div class="confirm-path">${escapeHtml(details.path)}</div>`;
    if (details.contentPreview) {
      body += `<pre class="confirm-preview"><code>${escapeHtml(details.contentPreview)}</code></pre>`;
      if (details.contentLength > 500) {
        body += `<div class="confirm-truncated">${details.contentLength.toLocaleString()} chars total</div>`;
      }
    }
  } else if (details.tool === 'edit_file') {
    icon = 'find_replace';
    title = 'Edit file';
    body = `<div class="confirm-path">${escapeHtml(details.path)}</div>`;
    body += `<div class="confirm-diff">`;
    body += `<div class="confirm-diff-old"><span class="confirm-diff-label">-</span><code>${escapeHtml(details.oldText || '')}</code></div>`;
    body += `<div class="confirm-diff-new"><span class="confirm-diff-label">+</span><code>${escapeHtml(details.newText || '')}</code></div>`;
    body += `</div>`;
  } else if (details.tool === 'delete_file') {
    icon = 'delete';
    title = details.isDirectory ? 'Delete folder' : 'Delete file';
    body = `<div class="confirm-path">${escapeHtml(details.path)}</div>`;
  } else {
    icon = 'warning';
    title = details.tool;
    body = `<div class="confirm-path">${escapeHtml(details.path || '')}</div>`;
  }

  turnDiv.innerHTML = `
    <div class="confirm-action">
      <div class="confirm-header">
        <span class="material-symbols-rounded confirm-icon">${icon}</span>
        <span class="confirm-title">${title}</span>
      </div>
      ${body}
      <div class="confirm-buttons">
        <button class="confirm-btn confirm-deny" id="confirm-deny-btn">
          <span class="material-symbols-rounded" style="font-size:16px">close</span>
          Deny
        </button>
        <button class="confirm-btn confirm-approve" id="confirm-approve-btn">
          <span class="material-symbols-rounded" style="font-size:16px">check</span>
          Approve
        </button>
      </div>
    </div>
  `;

  // Prevent buttons from stealing focus
  turnDiv.querySelectorAll('.confirm-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });

  document.getElementById('confirm-approve-btn').addEventListener('click', () => {
    window.trim.respondConfirmAction(true);
    turnDiv.innerHTML = `
      <div class="ai-loading">
        <div class="spinner"></div>
        <span>Executing ${escapeHtml(details.tool.replace(/_/g, ' '))}...</span>
      </div>
    `;
  });

  document.getElementById('confirm-deny-btn').addEventListener('click', () => {
    window.trim.respondConfirmAction(false);
    turnDiv.innerHTML = `
      <div class="confirm-denied">
        <span class="material-symbols-rounded" style="font-size:16px">block</span>
        Operation denied
      </div>
    `;
  });

  requestAnimationFrame(() => {
    const h = getBarHeight() + aiContainer.scrollHeight;
    window.trim.resizeWindow(Math.min(h, 500));
    smartScroll(aiContainer);
  });
}

function restoreAIArea() {
  const rc = document.getElementById('results-container');
  const aiContainer = document.getElementById('ai-response-container');
  rc.innerHTML = '';
  rc.classList.add('hidden');
  // If there's AI content, show it again
  if (aiContainer.innerHTML) {
    aiContainer.classList.remove('hidden');
    document.getElementById('search-bar').classList.add('has-results');
    requestAnimationFrame(() => {
      const h = getBarHeight() + aiContainer.scrollHeight;
      window.trim.resizeWindow(Math.min(h, 500));
    });
  } else {
    document.getElementById('search-bar').classList.remove('has-results');
    window.trim.resizeWindow(getBarHeight());
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window._ui = { init, renderResults, showAILoading, updateAIStatus, renderAIResponse, clearResults, restoreAIArea, showConfirmation };
