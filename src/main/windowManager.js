const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { parseLaunchArgv, shouldShowOnFirstReady } = require('./cliArgs');

let mainWindow = null;
const WIN_W = 680;
const BAR_H = 52;

const isLinux = process.platform === 'linux';
const LINUX_SOLID_BG = '#FF1E1E28';

function useBlurDismiss() {
  if (!isLinux) return true;
  return process.env.TRIM_LINUX_BLUR_DISMISS === '1';
}

function create() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  const winOpts = {
    width: WIN_W,
    height: BAR_H,
    x: Math.round((screenW - WIN_W) / 2),
    y: Math.round(screenH * 0.28),
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
  if (mainWindow.isVisible()) {
    hide();
  } else {
    show();
  }
}

function show() {
  if (!mainWindow) return;
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow.setContentSize(WIN_W, BAR_H);
  mainWindow.setPosition(Math.round((screenW - WIN_W) / 2), Math.round(screenH * 0.28));
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('trim:window-shown');
}

function hide() {
  if (!mainWindow) return;
  mainWindow.webContents.send('trim:window-hidden');
  mainWindow.hide();
}

function resize(height) {
  if (!mainWindow) return;
  const maxH = Math.round(screen.getPrimaryDisplay().workAreaSize.height * 0.6);
  mainWindow.setContentSize(WIN_W, Math.min(Math.round(height), maxH));
}

function getWindow() {
  return mainWindow;
}

module.exports = { create, toggle, show, hide, resize, getWindow };
