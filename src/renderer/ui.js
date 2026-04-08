let selectedIndex = -1;
let currentResults = [];
const MAX_VISIBLE = 8;
const HOTFIX_SCALE_FACTOR = 1;
let hotfixSettings = { showHints: false };
let displayScaleFactor = window.devicePixelRatio || null;

function init() {
  document.addEventListener('keydown', handleKeyboard);
  void loadHotfixContext();
}

async function loadHotfixContext() {
  try {
    const [settings, scaleFactor] = await Promise.all([
      window.trim.loadSettings(),
      window.trim.getDisplayScale(),
    ]);
    hotfixSettings = { ...hotfixSettings, ...(settings || {}) };
    displayScaleFactor = Number(scaleFactor);
  } catch {
    hotfixSettings = { ...hotfixSettings, showHints: false };
    displayScaleFactor = window.devicePixelRatio || null;
  }
}

// HOTFIX: Placeholder rows are only needed to avoid the broken empty-state layout
// at 100% Windows scaling. A future settings toggle can force these hints on by
// setting showHints=true, without changing the rest of the renderer flow.
function shouldShowHintRows() {
  if (hotfixSettings.showHints) return true;
  const scale = Number(displayScaleFactor || window.devicePixelRatio || 0);
  return scale === HOTFIX_SCALE_FACTOR;
}

function getCurrentModeForHints(rawInput) {
  if (window._inputRouter && typeof window._inputRouter.detectMode === 'function') {
    return window._inputRouter.detectMode(rawInput || '');
  }
  return 'app';
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
        const resolvedQuery = window._inputRouter.resolveAIFileRefsInQuery(query);
        if (query) {
          window._aiQuery.prepareForQuery('ai_pro');
          showAILoading('Asking Gemini Pro...');
          window._aiQuery.execute(resolvedQuery, 'ai_pro', forceShow, (response) => {
            renderAIResponse(response);
          });
        }
      } else if (input.startsWith('?')) {
        const query = input.slice(1).trim();
        const resolvedQuery = window._inputRouter.resolveAIFileRefsInQuery(query);
        if (query) {
          window._aiQuery.prepareForQuery('ai');
          showAILoading();
          window._aiQuery.execute(resolvedQuery, 'ai', forceShow, (response) => {
            renderAIResponse(response);
          });
        }
      } else {
        const didExecute = executeSelected();
        if (!didExecute && window._chips && window._chips.triggerVisibleAction) {
          window._chips.triggerVisibleAction();
        }
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
        const inputEl = document.getElementById('search-input');
        inputEl.value = currentResults[selectedIndex >= 0 ? selectedIndex : 0].title;
        if (window._inputRouter) window._inputRouter.refreshInputDecor(inputEl);
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
    if (result.type !== 'command' && result.type !== 'calc' && result.type !== 'calc-symbolic' && result.type !== 'calc-plot') {
      window.trim.hideWindow();
    }
    return true;
  }
  return false;
}

function getBarHeight() {
  return document.getElementById('search-bar').offsetHeight;
}

let lastResultsKey = '';

function getResultsKey(results) {
  return results.map(r => `${r.type}:${r.name || r.title || ''}:${r.target || r.path || ''}`).join('\n');
}

function getPlaceholderKey(mode, kind, placeholder) {
  return `placeholder:${mode}:${kind}:${placeholder.icon}:${placeholder.title}:${placeholder.subtitle}`;
}

function getPlaceholderResult(mode, kind) {
  if (kind === 'empty') {
    if (mode === 'ai') {
      return {
        type: 'placeholder',
        icon: 'auto_awesome',
        title: 'Ask Gemini Flash',
        subtitle: 'Type your prompt, then press Enter',
      };
    }

    if (mode === 'ai_pro') {
      return {
        type: 'placeholder',
        icon: 'auto_awesome',
        title: 'Ask Gemini Pro',
        subtitle: 'Type your prompt, then press Enter',
      };
    }

    if (mode === 'calc') {
      return {
        type: 'placeholder',
        icon: 'calculate',
        title: 'Enter an expression',
        subtitle: 'Try c: 2+2, c: x^2-4=0, c: derive x^3, or c: plot sin(x)',
      };
    }

    if (mode === 'folder') {
      return {
        type: 'placeholder',
        icon: 'folder_open',
        title: 'Search your files and folders',
        subtitle: 'Type after f: to start browsing matches',
      };
    }

    if (mode === 'command') {
      return {
        type: 'placeholder',
        icon: 'terminal',
        title: 'Run a command',
        subtitle: 'Type after / to filter available commands',
      };
    }

    return {
      type: 'placeholder',
      icon: 'search',
      title: 'Start typing to search',
      subtitle: 'Apps, folders, commands, and more. Type /help for tips',
    };
  }

  if (mode === 'ai') {
    return {
      type: 'placeholder',
      icon: 'auto_awesome',
      title: 'Press Enter to ask Gemini Flash',
      subtitle: 'AI queries do not show inline results while you type',
    };
  }

  if (mode === 'ai_pro') {
    return {
      type: 'placeholder',
      icon: 'auto_awesome',
      title: 'Press Enter to ask Gemini Pro',
      subtitle: 'AI queries do not show inline results while you type',
    };
  }

  if (mode === 'calc') {
    return {
      type: 'placeholder',
      icon: 'calculate',
      title: 'Expression not ready',
      subtitle: 'Check for missing operators, brackets, or function arguments',
    };
  }

  return {
    type: 'placeholder',
    icon: 'search_off',
    title: 'No results found',
    subtitle: 'Try a different query',
  };
}

// HOTFIX: This helper isolates the fake-row workaround so the main result
// rendering flow stays unchanged and the future showHints toggle only needs to
// affect shouldShowHintRows().
function renderPlaceholderState(kind, rawInput = '') {
  if (!shouldShowHintRows()) {
    lastResultsKey = '';
    currentResults = [];
    selectedIndex = -1;
    const container = document.getElementById('results-container');
    container.innerHTML = '';
    container.classList.add('hidden');
    document.getElementById('search-bar').classList.remove('has-results');
    window.trim.resizeWindow(getBarHeight());
    return;
  }

  const mode = getCurrentModeForHints(rawInput);
  const placeholderResult = getPlaceholderResult(mode, kind);
  const placeholderKey = getPlaceholderKey(mode, kind, placeholderResult);
  const container = document.getElementById('results-container');
  const needsRender =
    lastResultsKey !== placeholderKey ||
    container.childElementCount === 0 ||
    !container.firstElementChild ||
    !container.firstElementChild.classList.contains('result-placeholder');

  currentResults = [];
  selectedIndex = -1;
  if (needsRender) {
    const placeholder = createResultElement(placeholderResult);
    placeholder.classList.add('result-placeholder');
    placeholder.setAttribute('aria-hidden', 'true');
    container.replaceChildren(placeholder);
  }
  lastResultsKey = placeholderKey;
  container.classList.remove('hidden');
  document.getElementById('search-bar').classList.add('has-results');

  requestAnimationFrame(() => {
    const barH = getBarHeight();
    const resultsH = container.scrollHeight;
    window.trim.resizeWindow(barH + resultsH + 2);
  });
}

async function renderResults(results) {
  const container = document.getElementById('results-container');
  const aiContainer = document.getElementById('ai-response-container');
  const settingsPanel = document.getElementById('settings-panel');

  aiContainer.classList.add('hidden');
  settingsPanel.classList.add('hidden');

  currentResults = results;
  selectedIndex = results.length > 0 ? 0 : -1;
  if (window._chips) window._chips.setResultsCount(results.length);

  if (results.length === 0) {
    const rawInput = document.getElementById('search-input').value || '';
    renderPlaceholderState(rawInput.trim() ? 'no-results' : 'empty', rawInput);
    return;
  }

  // Check for special calc result types that need custom rendering
  const firstResult = results[0];
  if (firstResult.type === 'calc-symbolic' || firstResult.type === 'calc-plot') {
    lastResultsKey = '';
    const frag = document.createDocumentFragment();
    for (const result of results) {
      if (result.type === 'calc-symbolic') {
        frag.appendChild(createCalcSymbolicElement(result));
      } else if (result.type === 'calc-plot') {
        frag.appendChild(createCalcPlotElement(result));
      } else {
        frag.appendChild(createResultElement(result));
      }
    }
    container.replaceChildren(frag);
    container.classList.remove('hidden');
    document.getElementById('search-bar').classList.add('has-results');

    // Render Plotly charts after DOM insertion
    container.querySelectorAll('.calc-plot-container').forEach(el => {
      try {
        const data = JSON.parse(el.dataset.plotData);
        const layout = JSON.parse(el.dataset.plotLayout);
        const config = JSON.parse(el.dataset.plotConfig);
        if (typeof Plotly !== 'undefined') {
          Plotly.newPlot(el, data, layout, config);
        }
      } catch { /* ignore */ }
    });

    requestAnimationFrame(() => {
      const barH = getBarHeight();
      const resultsH = container.scrollHeight;
      window.trim.resizeWindow(Math.min(barH + resultsH + 2, 500));
    });
    return;
  }

  const key = getResultsKey(results);
  const unchanged = key === lastResultsKey;
  lastResultsKey = key;

  document.getElementById('search-bar').classList.add('has-results');

  if (!unchanged) {
    const frag = document.createDocumentFragment();
    for (const result of results) {
      const el = createResultElement(result);
      frag.appendChild(el);
    }
    container.replaceChildren(frag);
  }
  container.classList.remove('hidden');

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
    if (result.type !== 'command' && result.type !== 'calc' && result.type !== 'calc-symbolic' && result.type !== 'calc-plot') {
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

function createCalcSymbolicElement(result) {
  const el = document.createElement('div');
  el.className = 'calc-result';

  // Main result in KaTeX
  const mainDiv = document.createElement('div');
  mainDiv.className = 'calc-main-result';
  mainDiv.innerHTML = result.mainHtml;
  el.appendChild(mainDiv);

  // Steps (collapsible)
  if (result.steps && result.steps.length > 0) {
    const stepsDiv = document.createElement('div');
    stepsDiv.className = 'calc-steps collapsed';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'calc-steps-toggle';
    toggleBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px">expand_more</span> <span>Steps</span>';
    toggleBtn.addEventListener('mousedown', (e) => e.preventDefault());
    toggleBtn.addEventListener('click', () => {
      stepsDiv.classList.toggle('collapsed');
      const chevron = toggleBtn.querySelector('.material-symbols-rounded');
      chevron.textContent = stepsDiv.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
      requestAnimationFrame(() => {
        const container = document.getElementById('results-container');
        const barH = getBarHeight();
        window.trim.resizeWindow(Math.min(barH + container.scrollHeight + 2, 500));
      });
    });
    stepsDiv.appendChild(toggleBtn);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'calc-steps-content';
    for (const step of result.steps) {
      const stepEl = document.createElement('div');
      stepEl.className = 'calc-step';
      const labelEl = document.createElement('span');
      labelEl.className = 'calc-step-label';
      labelEl.textContent = step.label;
      const texEl = document.createElement('span');
      texEl.className = 'calc-step-tex';
      try {
        texEl.innerHTML = katex.renderToString(step.tex, { displayMode: false, throwOnError: false });
      } catch {
        texEl.textContent = step.tex;
      }
      stepEl.appendChild(labelEl);
      stepEl.appendChild(texEl);
      contentDiv.appendChild(stepEl);
    }
    stepsDiv.appendChild(contentDiv);
    el.appendChild(stepsDiv);
  }

  // Copy button
  if (result.copyText) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'calc-copy-btn';
    copyBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px">content_copy</span> <span>Copy</span>';
    copyBtn.addEventListener('mousedown', (e) => e.preventDefault());
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(result.copyText).then(() => {
        const icon = copyBtn.querySelector('.material-symbols-rounded');
        icon.textContent = 'check';
        setTimeout(() => { icon.textContent = 'content_copy'; }, 1500);
      });
    });
    el.appendChild(copyBtn);
  }

  return el;
}

function createCalcPlotElement(result) {
  const el = document.createElement('div');
  el.className = 'calc-result';

  // Title in KaTeX
  if (result.titleTex) {
    const titleDiv = document.createElement('div');
    titleDiv.className = 'calc-plot-title';
    try {
      titleDiv.innerHTML = katex.renderToString(result.titleTex, { displayMode: false, throwOnError: false });
    } catch {
      titleDiv.textContent = result.subtitle;
    }
    el.appendChild(titleDiv);
  }

  // Plotly container
  const plotDiv = document.createElement('div');
  plotDiv.className = 'calc-plot-container';
  plotDiv.dataset.plotData = JSON.stringify(result.plotData);
  plotDiv.dataset.plotLayout = JSON.stringify(result.plotLayout);
  plotDiv.dataset.plotConfig = JSON.stringify(result.plotConfig);
  el.appendChild(plotDiv);

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
        const img = document.createElement('img');
        img.src = icon;
        iconDiv.replaceChildren(img);
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
    const queryText = input.startsWith('??') ? input.slice(2).trim()
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

function sanitizeHTML(html) {
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'div', 'span', 'img', 'a', 'button', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
      ALLOWED_ATTR: ['class', 'style', 'alt', 'src', 'title', 'href', 'data-uri'],
      ALLOW_DATA_ATTR: false,
    });
  }
  // DOMPurify failed to load - strip all HTML tags as a safe fallback.
  return html.replace(/<[^>]*>/g, '');
}

function buildResponseHTML(response) {
  const rawMarkdown = window._aiQuery.formatMarkdown(response.text);
  let html = `<div class="ai-text">${sanitizeHTML(rawMarkdown)}</div>`;

  if (response.codeOutputs && response.codeOutputs.length > 0) {
    for (const output of response.codeOutputs) {
      html += `<div class="ai-code-output">`;
      if (output.code) {
        html += `<div class="ai-code-header">
          <span class="material-symbols-rounded" style="font-size:14px">code</span>
          <span>Python</span>
          <button class="code-copy-btn code-output-copy">
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
        <div class="ai-plot"><img src="${escapeHtml(output.plot)}" alt="Plot"></div>`;
      }
      if (output.error) {
        html += `<pre class="ai-code-error"><code>${escapeHtml(output.error)}</code></pre>`;
      }
      html += `</div>`;
    }
  }

  if (response.sources && response.sources.length > 0) {
    html += `<div class="ai-sources">
      <button class="ai-sources-toggle">
        <span class="material-symbols-rounded" style="font-size:14px">link</span>
        <span>${response.sources.length} source${response.sources.length > 1 ? 's' : ''}</span>
        <span class="material-symbols-rounded ai-sources-chevron" style="font-size:16px">expand_more</span>
      </button>
      <div class="ai-sources-list">
        ${response.sources.map(s => {
          const safeTitle = escapeHtml(s.title || s.uri || 'Source');
          return `<a class="ai-source-link" href="#" data-uri="${escapeHtml(s.uri || '')}">
            <span class="material-symbols-rounded" style="font-size:14px">open_in_new</span>
            ${safeTitle}
          </a>`;
        }).join('')}
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
  const prefix = val.startsWith('??') ? '?? '
    : val.startsWith('?') ? '? ' : '';
  if (prefix) {
    searchInput.value = prefix;
    searchInput.setSelectionRange(prefix.length, prefix.length);
    if (window._inputRouter) window._inputRouter.refreshInputDecor(searchInput);
  }
  searchInput.focus();
}

function postProcessCodeBlocks(container) {
  // Syntax highlighting
  if (window._aiQuery) window._aiQuery.highlightCodeBlocks(container);

  // Add copy buttons to markdown code blocks (ai-text pre blocks that don't already have one)
  container.querySelectorAll('.ai-text pre').forEach(pre => {
    if (pre.querySelector('.code-copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-rounded';
    icon.style.fontSize = '14px';
    icon.textContent = 'content_copy';
    btn.appendChild(icon);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code');
      if (code) navigator.clipboard.writeText(code.textContent).then(() => {
        icon.textContent = 'check';
        setTimeout(() => icon.textContent = 'content_copy', 1500);
      });
    });
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });

  // Wire up code-output copy buttons (replaced inline onclick)
  container.querySelectorAll('.code-output-copy').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      const codeEl = btn.closest('.ai-code-output')?.querySelector('.ai-code-block code');
      if (!codeEl) return;
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        const span = btn.querySelector('span');
        if (span) { span.textContent = 'check'; setTimeout(() => span.textContent = 'content_copy', 1500); }
      });
    });
  });

  // Wire up sources toggle (replaced inline onclick)
  container.querySelectorAll('.ai-sources-toggle').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      btn.parentElement.classList.toggle('expanded');
      setTimeout(() => {
        const c = document.getElementById('ai-response-container');
        const h = document.getElementById('search-bar').offsetHeight + c.scrollHeight;
        window.trim.resizeWindow(Math.min(h, 500));
      }, 10);
    });
  });

  // Wire up source links (replaced inline onclick)
  container.querySelectorAll('.ai-source-link').forEach(link => {
    link.addEventListener('click', (e) => e.preventDefault());
    link.title = link.dataset.uri || '';
  });
}

function clearResults() {
  const resultsContainer = document.getElementById('results-container');
  resultsContainer.classList.remove('hidden');
  document.getElementById('ai-response-container').innerHTML = '';
  document.getElementById('ai-response-container').classList.add('hidden');
  document.getElementById('settings-panel').classList.add('hidden');
  if (window._chips) window._chips.setResultsCount(0);
  const rawInput = document.getElementById('search-input').value || '';
  renderPlaceholderState('empty', rawInput);
  // Clear conversation history
  if (window._aiQuery) window._aiQuery.clearConversation();
}

function smartScroll(aiContainer) {
  const followUps = aiContainer.querySelectorAll('.ai-follow-up-query');
  if (followUps.length === 0) {
    // Single request - always top-aligned
    aiContainer.scrollTop = 0;
    return;
  }
  // Follow-up - anchor the latest follow-up query to the top,
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
    const rawInput = document.getElementById('search-input').value || '';
    renderPlaceholderState(rawInput.trim() ? 'no-results' : 'empty', rawInput);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window._ui = { init, renderResults, showAILoading, updateAIStatus, renderAIResponse, clearResults, restoreAIArea, showConfirmation, loadHotfixContext };
