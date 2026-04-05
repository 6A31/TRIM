const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trim', {
  searchApps:    ()           => ipcRenderer.invoke('trim:search-apps'),
  getIcon:       (exePath)    => ipcRenderer.invoke('trim:get-icon', exePath),
  openApp:       (appPath)    => ipcRenderer.invoke('trim:open-app', appPath),
  aiQuery:       (query)      => ipcRenderer.invoke('trim:ai-query', query),
  searchFolders: (query)      => ipcRenderer.invoke('trim:search-folders', query),
  openFolder:    (folderPath) => ipcRenderer.invoke('trim:open-folder', folderPath),
  loadSettings:  ()           => ipcRenderer.invoke('trim:load-settings'),
  saveSettings:  (data)       => ipcRenderer.invoke('trim:save-settings', data),
  hideWindow:    ()           => ipcRenderer.send('trim:hide-window'),
  resizeWindow:  (h)          => ipcRenderer.invoke('trim:resize-window', h),
  onWindowShown: (cb)         => ipcRenderer.on('trim:window-shown', cb),
  onWindowHidden:(cb)         => ipcRenderer.on('trim:window-hidden', cb),
  onAIStatus:    (cb)         => ipcRenderer.on('trim:ai-status', (_e, data) => cb(data)),
  offAIStatus:   ()           => ipcRenderer.removeAllListeners('trim:ai-status'),
});
