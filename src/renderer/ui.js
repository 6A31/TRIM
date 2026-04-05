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
      // If in AI mode, fire the query
      const input = document.getElementById('search-input').value;
      const forceShow = window._chips && window._chips.isActive('show_output');
      if (input.startsWith('??')) {
        const query = input.slice(2).trim();
        if (query) {
          showAILoading('Asking Gemini Pro...');
          window._aiQuery.execute(query, true, forceShow, (response) => {
            renderAIResponse(response);
          });
        }
      } else if (input.startsWith('?')) {
        const query = input.slice(1).trim();
        if (query) {
          showAILoading();
          window._aiQuery.execute(query, false, forceShow, (response) => {
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
      // Autocomplete for commands
      if (currentResults.length > 0 && currentResults[0].type === 'command') {
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
    const labels = { app: 'App', calc: 'Copy', folder: 'Open', command: 'Run' };
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

  aiContainer.innerHTML = `
    <div class="ai-loading">
      <div class="spinner"></div>
      <span>${escapeHtml(statusText || 'Asking Gemini...')}</span>
    </div>
  `;

  requestAnimationFrame(() => {
    const h = getBarHeight() + aiContainer.scrollHeight;
    window.trim.resizeWindow(h);
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
      window.trim.resizeWindow(h);
    });
  }
}

function renderAIResponse(response) {
  const aiContainer = document.getElementById('ai-response-container');

  if (response.type === 'ai-error') {
    aiContainer.innerHTML = `
      <div class="ai-error">
        <span class="material-symbols-rounded" style="font-size:18px">error</span>
        ${escapeHtml(response.error)}
      </div>
    `;
    requestAnimationFrame(() => {
      window.trim.resizeWindow(getBarHeight() + aiContainer.scrollHeight);
    });
    return;
  }

  let html = `<div class="ai-text">${window._aiQuery.formatMarkdown(response.text)}</div>`;

  // Render code execution outputs if present
  if (response.codeOutputs && response.codeOutputs.length > 0) {
    for (const output of response.codeOutputs) {
      html += `<div class="ai-code-output">`;
      if (output.code) {
        html += `<div class="ai-code-header">
          <span class="material-symbols-rounded" style="font-size:14px">code</span>
          <span>Python</span>
        </div>
        <pre class="ai-code-block"><code>${escapeHtml(output.code)}</code></pre>`;
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

  aiContainer.innerHTML = html;

  // Resize to fit content, capped
  requestAnimationFrame(() => {
    const contentH = getBarHeight() + aiContainer.scrollHeight;
    window.trim.resizeWindow(Math.min(contentH, 500));
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
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window._ui = { init, renderResults, showAILoading, updateAIStatus, renderAIResponse, clearResults };
