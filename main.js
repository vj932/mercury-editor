const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

let windows = [];
let pendingFilePath = null; // file opened from Finder before app is ready
let themeMode = 'system'; // 'system', 'light', 'dark'

// Enforce single instance — if a second instance launches, focus the first
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    // On macOS, open-file handles this; on other platforms, file path is in argv
    const win = BrowserWindow.getFocusedWindow() || windows[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function createWindow(filePath) {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 480,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  windows.push(win);

  win.webContents.once('did-finish-load', () => {
    if (filePath) {
      // Opened from Finder — tell renderer to skip the blank Untitled tab
      win.webContents.send('open-file-path', filePath);
    } else {
      // Normal launch — tell renderer no file is pending
      win.webContents.send('no-pending-file');
    }
  });

  win.on('closed', () => {
    windows = windows.filter((w) => w !== win);
  });

  return win;
}

// === macOS: open file from Finder / double-click ===
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) {
    // App is already running — open in a new tab in the focused window, or new window
    const win = BrowserWindow.getFocusedWindow() || windows[0];
    if (win) {
      win.webContents.send('open-file-path', filePath);
      win.focus();
    } else {
      createWindow(filePath);
    }
  } else {
    // App hasn't launched yet — store for when it's ready
    pendingFilePath = filePath;
  }
});

// --- IPC Handlers ---

// LaTeX export
ipcMain.handle('export-tex', async (event, texContent) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { filePath } = await dialog.showSaveDialog(win, {
    defaultPath: 'document.tex',
    filters: [{ name: 'LaTeX', extensions: ['tex'] }],
  });
  if (!filePath) return null;
  fs.writeFileSync(filePath, texContent, 'utf-8');
  return filePath;
});

// PDF export
ipcMain.handle('export-pdf', async (event, layoutOpts) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { filePath } = await dialog.showSaveDialog(win, {
    defaultPath: 'document.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!filePath) return null;

  const pageSize = layoutOpts?.pageSize || 'Letter';
  const landscape = layoutOpts?.orientation === 'landscape';
  const m = layoutOpts?.margins || { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 };

  const pdfData = await event.sender.printToPDF({
    printBackground: true,
    pageSize,
    landscape,
    margins: { top: m.top, bottom: m.bottom, left: m.left, right: m.right },
  });
  fs.writeFileSync(filePath, pdfData);
  return filePath;
});

// File open (dialog)
ipcMain.handle('open-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Mercury Documents', extensions: ['merc'] },
      { name: 'Text Files', extensions: ['md', 'txt', 'html'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (!filePaths.length) return null;
  return readFileForEditor(filePaths[0]);
});

// Read any supported file and return { path, title, content (HTML) }
function readFileForEditor(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath, ext);

  if (ext === '.merc') {
    // Mercury native format: HTML content directly
    return { path: filePath, title: name, content: raw };
  }

  // Plain text / markdown / html — wrap in paragraphs
  const content = ext === '.html' ? raw : `<p>${raw.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  return { path: filePath, title: name, content };
}

// Read file by path (used for open-from-Finder)
ipcMain.handle('read-file', async (_, filePath) => {
  return readFileForEditor(filePath);
});

// File save
ipcMain.handle('save-file', async (event, { content, filePath }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  let savePath = filePath;
  if (!savePath) {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'untitled.merc',
      filters: [
        { name: 'Mercury Document', extensions: ['merc'] },
        { name: 'HTML', extensions: ['html'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });
    savePath = result.filePath;
  }
  if (!savePath) return null;
  fs.writeFileSync(savePath, content, 'utf-8');
  return savePath;
});

// Save As (always shows dialog)
ipcMain.handle('save-file-as', async (event, { content }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: 'untitled.merc',
    filters: [
      { name: 'Mercury Document', extensions: ['merc'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  });
  if (!result.filePath) return null;
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return result.filePath;
});

// Theme handling
ipcMain.handle('set-theme', async (_, mode) => {
  themeMode = mode;
  // Notify all windows
  windows.forEach(w => w.webContents.send('theme-changed', mode));
  return mode;
});

ipcMain.handle('get-theme', async () => themeMode);

// New window
ipcMain.on('new-window', () => createWindow());

// --- Workspace / File System ---
// Documents are saved as .merc files (HTML content) in ~/Documents/Mercury

function getWorkspacePath() {
  const dir = path.join(app.getPath('documents'), 'Mercury');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Choose workspace folder
ipcMain.handle('choose-workspace', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose workspace folder',
  });
  return filePaths[0] || null;
});

// List files in workspace
ipcMain.handle('list-workspace', async (_, workspacePath) => {
  const dir = workspacePath || getWorkspacePath();
  if (!fs.existsSync(dir)) return { path: dir, files: [] };

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && (e.name.endsWith('.merc') || e.name.endsWith('.html') || e.name.endsWith('.md')))
    .map((e) => {
      const fullPath = path.join(dir, e.name);
      const stat = fs.statSync(fullPath);
      const ext = path.extname(e.name);
      return {
        name: e.name,
        path: fullPath,
        title: path.basename(e.name, ext),
        lastModified: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

  return { path: dir, files };
});

// Load a document
ipcMain.handle('load-doc', async (_, filePath) => {
  return readFileForEditor(filePath);
});

// Save a document to workspace
ipcMain.handle('save-doc', async (_, { filePath, title, content }) => {
  const workDir = getWorkspacePath();
  const safeName = title.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'Untitled';
  const savePath = filePath || path.join(workDir, `${safeName}.merc`);

  fs.writeFileSync(savePath, content, 'utf-8');
  return savePath;
});

// Delete a document
ipcMain.handle('delete-doc', async (event, filePath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Cancel', 'Delete'],
    defaultId: 0,
    message: 'Delete this document?',
    detail: 'This action cannot be undone.',
  });
  if (response === 1) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
});

// --- App Menu ---
function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: (_, win) => win?.webContents.send('new-tab'),
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: (_, win) => win?.webContents.send('open-file'),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: (_, win) => win?.webContents.send('save-file'),
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: (_, win) => win?.webContents.send('save-file-as'),
        },
        { type: 'separator' },
        {
          label: 'Export as PDF…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: (_, win) => win?.webContents.send('export-pdf'),
        },
        {
          label: 'Export as LaTeX…',
          click: (_, win) => win?.webContents.send('export-tex'),
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: (_, win) => win?.webContents.send('close-tab'),
        },
      ],
    },
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
    {
      label: 'Format',
      submenu: [
        {
          label: 'Bold',
          accelerator: 'CmdOrCtrl+B',
          click: (_, win) => win?.webContents.send('format', 'bold'),
        },
        {
          label: 'Italic',
          accelerator: 'CmdOrCtrl+I',
          click: (_, win) => win?.webContents.send('format', 'italic'),
        },
        {
          label: 'Underline',
          accelerator: 'CmdOrCtrl+U',
          click: (_, win) => win?.webContents.send('format', 'underline'),
        },
        { type: 'separator' },
        {
          label: 'Font',
          submenu: [
            { label: 'KaTeX (Default)', click: (_, win) => win?.webContents.send('format', 'font-KaTeX_Main') },
            { label: 'System UI', click: (_, win) => win?.webContents.send('format', 'font-System UI') },
            { label: 'Georgia', click: (_, win) => win?.webContents.send('format', 'font-Georgia') },
            { label: 'Times New Roman', click: (_, win) => win?.webContents.send('format', 'font-Times New Roman') },
            { label: 'Helvetica Neue', click: (_, win) => win?.webContents.send('format', 'font-Helvetica Neue') },
            { label: 'Menlo', click: (_, win) => win?.webContents.send('format', 'font-Menlo') },
            { label: 'Courier New', click: (_, win) => win?.webContents.send('format', 'font-Courier New') },
          ],
        },
        {
          label: 'Size',
          submenu: [
            { label: '11', click: (_, win) => win?.webContents.send('format', 'size-11px') },
            { label: '12', click: (_, win) => win?.webContents.send('format', 'size-12px') },
            { label: '14', click: (_, win) => win?.webContents.send('format', 'size-14px') },
            { label: '16', click: (_, win) => win?.webContents.send('format', 'size-16px') },
            { label: '18', click: (_, win) => win?.webContents.send('format', 'size-18px') },
            { label: '20', click: (_, win) => win?.webContents.send('format', 'size-20px') },
            { label: '24', click: (_, win) => win?.webContents.send('format', 'size-24px') },
            { label: '28', click: (_, win) => win?.webContents.send('format', 'size-28px') },
            { label: '32', click: (_, win) => win?.webContents.send('format', 'size-32px') },
            { label: '36', click: (_, win) => win?.webContents.send('format', 'size-36px') },
            { label: '48', click: (_, win) => win?.webContents.send('format', 'size-48px') },
          ],
        },
        {
          label: 'Line Spacing',
          submenu: [
            { label: '1.0×', click: (_, win) => win?.webContents.send('format', 'lineheight-1.0') },
            { label: '1.2×', click: (_, win) => win?.webContents.send('format', 'lineheight-1.2') },
            { label: '1.4×', click: (_, win) => win?.webContents.send('format', 'lineheight-1.4') },
            { label: '1.6×', click: (_, win) => win?.webContents.send('format', 'lineheight-1.6') },
            { label: '2.0×', click: (_, win) => win?.webContents.send('format', 'lineheight-2.0') },
            { label: '2.5×', click: (_, win) => win?.webContents.send('format', 'lineheight-2.5') },
          ],
        },
        { type: 'separator' },
        {
          label: 'Table',
          submenu: [
            {
              label: 'Add Row Above',
              click: (_, win) => win?.webContents.send('format', 'addRowBefore'),
            },
            {
              label: 'Add Row Below',
              click: (_, win) => win?.webContents.send('format', 'addRowAfter'),
            },
            {
              label: 'Add Column Left',
              click: (_, win) => win?.webContents.send('format', 'addColumnBefore'),
            },
            {
              label: 'Add Column Right',
              click: (_, win) => win?.webContents.send('format', 'addColumnAfter'),
            },
            { type: 'separator' },
            {
              label: 'Delete Row',
              click: (_, win) => win?.webContents.send('format', 'deleteRow'),
            },
            {
              label: 'Delete Column',
              click: (_, win) => win?.webContents.send('format', 'deleteColumn'),
            },
            {
              label: 'Delete Table',
              click: (_, win) => win?.webContents.send('format', 'deleteTable'),
            },
            { type: 'separator' },
            {
              label: 'Merge Cells',
              click: (_, win) => win?.webContents.send('format', 'mergeCells'),
            },
            {
              label: 'Split Cell',
              click: (_, win) => win?.webContents.send('format', 'splitCell'),
            },
          ],
        },
      ],
    },
    {
      label: 'Insert',
      submenu: [
        {
          label: 'Image…',
          click: (_, win) => win?.webContents.send('format', 'insertImage'),
        },
        {
          label: 'File Attachment…',
          click: (_, win) => win?.webContents.send('format', 'insertFile'),
        },
        {
          label: 'Link…',
          accelerator: 'CmdOrCtrl+K',
          click: (_, win) => win?.webContents.send('format', 'insertLink'),
        },
        { type: 'separator' },
        {
          label: 'Math',
          accelerator: 'CmdOrCtrl+E',
          click: (_, win) => win?.webContents.send('format', 'math'),
        },
        {
          label: 'Table',
          click: (_, win) => win?.webContents.send('format', 'insertTable'),
        },
        {
          label: 'Horizontal Rule',
          click: (_, win) => win?.webContents.send('format', 'insertHorizontalRule'),
        },
        { type: 'separator' },
        {
          label: 'Drawing…',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: (_, win) => win?.webContents.send('format', 'insertDrawing'),
        },
      ],
    },
    {
      label: 'Layout',
      submenu: [
        {
          label: 'Page Setup…',
          click: (_, win) => win?.webContents.send('show-page-setup'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        {
          label: 'Toggle Tab Bar',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: (_, win) => win?.webContents.send('toggle-tab-bar'),
        },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: [
            {
              label: 'System Default',
              type: 'radio',
              checked: themeMode === 'system',
              click: (_, win) => { themeMode = 'system'; windows.forEach(w => w.webContents.send('theme-changed', 'system')); },
            },
            {
              label: 'Light',
              type: 'radio',
              checked: themeMode === 'light',
              click: (_, win) => { themeMode = 'light'; windows.forEach(w => w.webContents.send('theme-changed', 'light')); },
            },
            {
              label: 'Dark',
              type: 'radio',
              checked: themeMode === 'dark',
              click: (_, win) => { themeMode = 'dark'; windows.forEach(w => w.webContents.send('theme-changed', 'dark')); },
            },
          ],
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- App Lifecycle ---
app.whenReady().then(() => {
  buildMenu();
  createWindow(pendingFilePath);
  pendingFilePath = null;

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
