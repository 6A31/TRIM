const PREFIXES = {
  AI: '?',
  FOLDER: 'f:',
  CALC: 'c:',
  COMMAND: '/',
};

const IPC = {
  SEARCH_APPS: 'trim:search-apps',
  GET_ICON: 'trim:get-icon',
  OPEN_APP: 'trim:open-app',
  AI_QUERY: 'trim:ai-query',
  SEARCH_FOLDERS: 'trim:search-folders',
  OPEN_FOLDER: 'trim:open-folder',
  LOAD_SETTINGS: 'trim:load-settings',
  SAVE_SETTINGS: 'trim:save-settings',
  HIDE_WINDOW: 'trim:hide-window',
};

const DEFAULTS = {
  theme: 'dark',
  model: 'gemini-2.5-flash',
  apiKey: '',
  searchPaths: [],
};

module.exports = { PREFIXES, IPC, DEFAULTS };
