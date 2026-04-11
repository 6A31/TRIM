const PREFIXES = {
  AI: '?',
  AI_PRO: '??',
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
  SET_BACKGROUND_MATERIAL: 'trim:set-background-material',
  UPDATE_SHORTCUT: 'trim:update-shortcut',
  SUSPEND_SHORTCUT: 'trim:suspend-shortcut',
  RESUME_SHORTCUT: 'trim:resume-shortcut',
  SYSTEM_KEY: 'trim:system-key',
  UPDATE_READY: 'trim:update-ready',
  QUIT_AND_INSTALL: 'trim:quit-and-install',
  IS_DEV_MODE: 'trim:is-dev-mode',
  REVERT_TO_TURN: 'trim:revert-to-turn',
};

const DEFAULT_SHORTCUT = 'Alt+Space';

const DEFAULTS = {
  theme: 'dark',
  model: 'gemini-3-flash-preview',
  modelPro: 'gemini-3.1-pro-preview',
  apiKey: '',
  searchPaths: [],
  cachedFileTypes: [],
  autoStart: true,
  showHints: false,
  shortcut: DEFAULT_SHORTCUT,
  defaultMode: 'app',
  // Appearance
  accentColor: '#7c8aff',
  appColor: '#1e1e28',
  transparency: 0.76,
  transparencyType: 'acrylic', // 'acrylic' | 'mica' | 'none'
};

module.exports = { PREFIXES, IPC, DEFAULTS, DEFAULT_SHORTCUT };
