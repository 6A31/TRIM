const { BrowserWindow, screen } = require('electron');
const path = require('path');

let mainWindow = null;
const WIN_W = 680;
const BAR_H = 52;

function create() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
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
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setBackgroundMaterial('acrylic');
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('blur', () => {
    hide();
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.setContentSize(WIN_W, BAR_H);
    mainWindow.show();
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
  mainWindow.hide();
  mainWindow.webContents.send('trim:window-hidden');
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
