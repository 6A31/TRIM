const PREFIXES = {
  AI: '?',
  AI_PRO: '??',
  SOLVE: 'cs:',
  FOLDER: 'f:',
  CALC: 'c:',
  COMMAND: '/',
};

const IPC = {
  SEARCH_APPS: 'trim:search-apps',
  GET_ICON: 'trim:get-icon',
  OPEN_APP: 'trim:open-app',
  GET_USAGE: 'trim:get-usage',
  GET_DISPLAY_SCALE: 'trim:get-display-scale',
  AI_QUERY: 'trim:ai-query',
  AI_STATUS: 'trim:ai-status',
  SEARCH_FOLDERS: 'trim:search-folders',
  SEARCH_FOLDERS_UPDATE: 'trim:folder-search-update',
  OPEN_FOLDER: 'trim:open-folder',
  LOAD_SETTINGS: 'trim:load-settings',
  SAVE_SETTINGS: 'trim:save-settings',
  HIDE_WINDOW: 'trim:hide-window',
  CLEANUP: 'trim:cleanup',
  CLEAR_CACHE: 'trim:clear-cache',
  GET_CACHE_SIZE: 'trim:get-cache-size',
  CONFIRM_ACTION: 'trim:confirm-action',
  CONFIRM_ACTION_RESPONSE: 'trim:confirm-action-response',
};

const DEFAULTS = {
  theme: 'dark',
  model: 'gemini-3-flash-preview',
  modelPro: 'gemini-3.1-pro-preview',
  apiKey: '',
  searchPaths: [],
  cachedFileTypes: [],
  autoStart: true,
  // Hotfix override for placeholder hint rows; the settings UI can expose this later.
  showHints: false,
};

module.exports = { PREFIXES, IPC, DEFAULTS };
