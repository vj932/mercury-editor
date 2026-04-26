const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  exportPDF: (opts) => ipcRenderer.invoke('export-pdf', opts),
  exportTex: (content) => ipcRenderer.invoke('export-tex', content),
  openFile: () => ipcRenderer.invoke('open-file'),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  saveFileAs: (data) => ipcRenderer.invoke('save-file-as', data),
  newWindow: () => ipcRenderer.send('new-window'),

  // Workspace / document management
  chooseWorkspace: () => ipcRenderer.invoke('choose-workspace'),
  listWorkspace: (path) => ipcRenderer.invoke('list-workspace', path),
  loadDoc: (path) => ipcRenderer.invoke('load-doc', path),
  saveDoc: (data) => ipcRenderer.invoke('save-doc', data),
  deleteDoc: (path) => ipcRenderer.invoke('delete-doc', path),

  // Theme handling
  setTheme: (mode) => ipcRenderer.invoke('set-theme', mode),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  onThemeChanged: (cb) => ipcRenderer.on('theme-changed', (_, mode) => cb(mode)),

  // Menu event listeners
  onNewTab: (cb) => ipcRenderer.on('new-tab', cb),
  onOpenFile: (cb) => ipcRenderer.on('open-file', cb),
  onSaveFile: (cb) => ipcRenderer.on('save-file', cb),
  onSaveFileAs: (cb) => ipcRenderer.on('save-file-as', cb),
  onExportPDF: (cb) => ipcRenderer.on('export-pdf', cb),
  onExportTex: (cb) => ipcRenderer.on('export-tex', cb),
  onCloseTab: (cb) => ipcRenderer.on('close-tab', cb),
  onFormat: (cb) => ipcRenderer.on('format', (_, cmd) => cb(cmd)),
  onToggleSidebar: (cb) => ipcRenderer.on('toggle-sidebar', cb),
  onToggleTabBar: (cb) => ipcRenderer.on('toggle-tab-bar', cb),
  onOpenFilePath: (cb) => ipcRenderer.on('open-file-path', (_, path) => cb(path)),
  onNoPendingFile: (cb) => ipcRenderer.on('no-pending-file', cb),
  onShowPageSetup: (cb) => ipcRenderer.on('show-page-setup', cb),
});
