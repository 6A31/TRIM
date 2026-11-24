const { BrowserWindow, screen, shell } = require('electron');
const path = require('path');
const { parseLaunchArgv, shouldShowOnFirstReady } = require('./cliArgs');

let mainWindow = null;
let currentWorkArea = null;
const GOLDEN = 1.618;
const WIN_W = 810;        // normal bar; fully grown it is golden: 810 x 500
const WIN_W_WIDE = 960;   // calculator worksheet (CAS editor): 960 x 593
const BAR_H = 52;
let currentWidth = WIN_W;

const isLinux = process.platform === 'linux';
const LINUX_SOLID_BG = '#FF1E1E28';

function useBlurDismiss() {
  if (!isLinux) return true;
  return process.env.TRIM_LINUX_BLUR_DISMISS === '1';
}

function isSafeExternalUrl(url) {
  return typeof url === 'string' && /^(https?:|mailto:)/i.test(url.trim());
}

function openExternalSafe(url) {
  if (!isSafeExternalUrl(url)) return false;
  shell.openExternal(url.trim()).catch(() => {});
  // Hide the launcher so the browser window isn't covered by an always-on-top bar
  hide();
  return true;
}

/** Work area of the display the user is on (cursor), falling back to primary. */
function activeWorkArea() {
  try {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  } catch {
    return screen.getPrimaryDisplay().workArea;
  }
}

function centeredPosition(area, width = WIN_W) {
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + area.height * 0.28),
  };
}

/** Tallest the window may get: golden ratio of its width, and never more than a share of the screen. */
function maxHeightFor(width, area) {
  const share = width > WIN_W ? 0.8 : 0.6;
  return Math.max(BAR_H, Math.min(Math.round(width / GOLDEN), Math.round(area.height * share)));
}

function create() {
  const startPos = centeredPosition(screen.getPrimaryDisplay().workArea);

  const winOpts = {
    width: WIN_W,
    height: BAR_H,
    x: startPos.x,
    y: startPos.y,
    frame: false,
    transparent: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: isLinux ? LINUX_SOLID_BG : '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  mainWindow = new BrowserWindow(winOpts);

  if (process.platform === 'win32') {
    mainWindow.setBackgroundMaterial('acrylic');
  } else if (process.platform === 'darwin') {
    mainWindow.setVibrancy('under-window');
  }

  if (isLinux) {
    try {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch { /* compositor may not support */ }
  }

  // Never let links navigate (or open popups inside) the tiny launcher window:
  // hand http(s)/mailto links to the system browser and block everything else.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') && url.split('#')[0] === mainWindow.webContents.getURL().split('#')[0]) return;
    e.preventDefault();
    openExternalSafe(url);
  });
  mainWindow.webContents.on('will-redirect', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      openExternalSafe(url);
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (useBlurDismiss()) {
    mainWindow.on('blur', () => {
      hide();
    });
  }

  // Prevent Alt+Space from opening the system menu on Windows (frameless window).
  // Without this, the renderer can't capture Alt+Space as a keybind.
  // Also forward the event to the renderer so the shortcut recorder can capture it.
  mainWindow.on('system-context-menu', (e) => {
    e.preventDefault();
    mainWindow.webContents.send('trim:system-key', 'Alt+Space');
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.setContentSize(WIN_W, BAR_H);
    const cli = parseLaunchArgv(process.argv);
    if (!shouldShowOnFirstReady(cli)) return;
    show();
  });

  return mainWindow;
}

function toggle() {
  if (!mainWindow) return;
  // Visible but buried behind another window (common on Linux, where click-away
  // dismiss is off): bring it forward instead of hiding it
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    hide();
  } else {
    show();
  }
}

function show() {
  if (!mainWindow) return;
  const area = activeWorkArea();
  currentWorkArea = area;
  const pos = centeredPosition(area);
  currentWidth = WIN_W;
  mainWindow.setContentSize(WIN_W, BAR_H);
  mainWindow.setPosition(pos.x, pos.y);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('trim:window-shown');
}

function hide() {
  if (!mainWindow) return;
  mainWindow.webContents.send('trim:window-hidden');
  mainWindow.hide();
}

/** Fit the window to `height` of content; `wide` is the calculator worksheet. */
function resize(height, wide = false) {
  if (!mainWindow) return;
  const area = currentWorkArea || screen.getPrimaryDisplay().workArea;
  const width = wide ? WIN_W_WIDE : WIN_W;
  const h = Math.min(Math.max(BAR_H, Math.round(Number(height) || BAR_H)), maxHeightFor(width, area));
  if (width !== currentWidth) {
    // Grow/shrink around the same centre line so the bar doesn't jump sideways
    const [x, y] = mainWindow.getPosition();
    const cx = x + Math.round(currentWidth / 2);
    currentWidth = width;
    mainWindow.setContentSize(width, h);
    mainWindow.setPosition(Math.round(cx - width / 2), y);
    return;
  }
  mainWindow.setContentSize(width, h);
}

function getWindow() {
  return mainWindow;
}

module.exports = { create, toggle, show, hide, resize, getWindow, openExternalSafe, isSafeExternalUrl, WIN_W, WIN_W_WIDE, GOLDEN };
