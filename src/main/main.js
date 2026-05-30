const { app } = require('electron');

// Packaged TRIM and `electron .` would otherwise share the same userData directory
// and thus the same single-instance lock. Then either (a) npm run dev exits at once
// while the AppImage is still running, or (b) your keybind only talks to the packaged
// binary; dev never shows. A separate -dev profile gives dev its own lock and config.
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`);
}

// Exit duplicate instances before loading heavy main-process modules (ipcHandlers,
// platform adapters, etc.). A WM keybind that execs the AppImage with --toggle
// spawns a short-lived second process; keeping this path minimal makes toggles
// feel much snappier.
if (!app.requestSingleInstanceLock()) {
  // Same as a WM `exec …/TRIM.AppImage --toggle` hitting an already-running app:
  // this process is redundant and must exit. If you ran `npm run dev` and saw
  // the terminal return immediately, another TRIM/Electron instance is still
  // running. Quit it first (e.g. `node scripts/kill.js` or pkill) or use
  // your keybind, which forwards to the existing process.
  console.error(
    '[TRIM] Another instance is already running; exiting (single-instance lock). '
    + 'Stop the other TRIM before `npm run dev`, or this was an intentional --toggle.',
  );
  app.exit(0);
} else {
  const { ipcMain, Menu, screen } = require('electron');
  const windowManager = require('./windowManager');
  const globalHotkey = require('./globalHotkey');
  const updater = require('./updater');
  const { registerHandlers, loadSettingsSync } = require('./ipcHandlers');
  const { IPC } = require('../shared/constants');
  const { parseLaunchArgv, secondInstanceAction } = require('./cliArgs');

  app.setName('TRIM');

  // On macOS, hide the dock icon so TRIM doesn't appear in the app switcher.
  // It's a utility launcher - it should behave like Spotlight, not a regular app.
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  // Set an explicit minimal application menu.
  // On macOS this prevents the "representedObject is not a
  // WeakPtrToElectronMenuModelAsNSObject" SIGTRAP crash that occurs when
  // Electron auto-creates a default menu in a dockless/frameless app under
  // heavy IPC load (e.g. f: deep scan streaming).
  // The Edit submenu preserves standard Cmd+C/V/X/A shortcuts.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [{ role: 'quit' }],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]));

  app.on('second-instance', (_event, commandLine) => {
    const cli = parseLaunchArgv(commandLine);
    const action = secondInstanceAction(cli);
    if (action === 'toggle') windowManager.toggle();
    else windowManager.show();
  });

  app.whenReady().then(() => {
    windowManager.create();
    const settings = loadSettingsSync();
    if (process.platform !== 'linux') {
      globalHotkey.register(settings.shortcut);
    }
    registerHandlers(ipcMain);

    ipcMain.on(IPC.HIDE_WINDOW, () => {
      windowManager.hide();
    });

    ipcMain.handle('trim:resize-window', (_e, height) => {
      windowManager.resize(height);
    });

    ipcMain.handle(IPC.GET_DISPLAY_SCALE, () => {
      return screen.getPrimaryDisplay().scaleFactor;
    });

    ipcMain.on(IPC.QUIT_AND_INSTALL, () => {
      updater.quitAndInstall();
    });

    updater.init(windowManager.getWindow());
  });

  app.on('will-quit', () => {
    globalHotkey.unregister();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    windowManager.show();
  });
}
