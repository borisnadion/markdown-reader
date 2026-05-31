import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { existsSync, watch } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_NAME = 'Markdown Reader';
const APP_ICON = path.join(__dirname, '..', 'build', 'icon.png');
const MARKDOWN_FILE_PATTERN = /\.(md|markdown|mdown|mkd)$/i;

let mainWindow = null;
let pendingOpenPaths = [];
let rendererReady = false;
const watchedFiles = new Set();
const directoryWatchers = new Map();
const fileChangeTimers = new Map();

const isDev = Boolean(process.env.ELECTRON_START_URL);

app.setName(APP_NAME);
process.title = APP_NAME;

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  sendMarkdownFiles([filePath]);
});

function createWindow() {
  rendererReady = false;

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    icon: existsSync(APP_ICON) ? APP_ICON : undefined,
    width: 1120,
    height: 820,
    minWidth: 560,
    minHeight: 420,
    resizable: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (url !== currentUrl && /^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-start-loading', () => {
    rendererReady = false;
  });

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });
}

function configureAppIdentity() {
  app.setName(APP_NAME);
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion()
  });

  if (existsSync(APP_ICON)) app.dock?.setIcon(APP_ICON);
}

function setWindowPreset(width, height) {
  if (!mainWindow) return;
  mainWindow.setSize(width, height, true);
  mainWindow.center();
}

function getMarkdownFilePaths(paths) {
  return paths.filter((candidate) => MARKDOWN_FILE_PATTERN.test(candidate) && existsSync(candidate));
}

async function readMarkdownFile(filePath) {
  const normalizedPath = path.resolve(filePath);
  const content = await fs.readFile(normalizedPath, 'utf8');
  return {
    path: normalizedPath,
    name: path.basename(normalizedPath),
    content
  };
}

async function readMarkdownFiles(filePaths) {
  return Promise.all(filePaths.map((filePath) => readMarkdownFile(filePath)));
}

function normalizeWatchPath(filePath) {
  return filePath ? path.resolve(filePath) : '';
}

function watchMarkdownFiles(filePaths) {
  for (const filePath of filePaths) {
    const normalizedPath = normalizeWatchPath(filePath);
    if (!normalizedPath) continue;

    watchedFiles.add(normalizedPath);
    watchMarkdownDirectory(path.dirname(normalizedPath));
  }
}

function watchMarkdownDirectory(directoryPath) {
  if (directoryWatchers.has(directoryPath)) return;

  try {
    const watcher = watch(directoryPath, (_eventType, filename) => {
      if (!filename) return;

      const changedPath = path.join(directoryPath, filename.toString());
      if (watchedFiles.has(changedPath)) {
        scheduleFileChange(changedPath);
      }
    });

    watcher.on('error', () => closeDirectoryWatcher(directoryPath));
    directoryWatchers.set(directoryPath, watcher);
  } catch {
    // The file can still be viewed if the containing directory is not watchable.
  }
}

function closeDirectoryWatcher(directoryPath) {
  const watcher = directoryWatchers.get(directoryPath);
  if (!watcher) return;

  watcher.close();
  directoryWatchers.delete(directoryPath);
}

function scheduleFileChange(filePath) {
  clearTimeout(fileChangeTimers.get(filePath));

  fileChangeTimers.set(
    filePath,
    setTimeout(async () => {
      fileChangeTimers.delete(filePath);

      try {
        const file = await readMarkdownFile(filePath);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file:change', file);
        }
      } catch {
        // Ignore transient saves and deleted files; a future write will refresh the view.
      }
    }, 100)
  );
}

async function sendMarkdownFiles(filePaths) {
  if (filePaths.length === 0) return;

  if (!mainWindow || !rendererReady) {
    pendingOpenPaths.push(...filePaths);
    return;
  }

  const files = await readMarkdownFiles(filePaths);
  watchMarkdownFiles(filePaths);
  mainWindow.webContents.send('file:open', files);
}

async function flushPendingOpenPaths() {
  if (!mainWindow || !rendererReady || pendingOpenPaths.length === 0) return;

  const filePaths = pendingOpenPaths;
  pendingOpenPaths = [];
  await sendMarkdownFiles(filePaths);
}

function buildMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Markdown...',
          accelerator: 'CommandOrControl+O',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile', 'multiSelections'],
              filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] }]
            });
            if (!result.canceled && result.filePaths.length > 0) {
              await sendMarkdownFiles(result.filePaths);
            }
          }
        },
        { type: 'separator' },
        { role: 'close' }
      ]
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
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CommandOrControl+F',
          click: () => mainWindow?.webContents.send('search:focus')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CommandOrControl+=',
          click: () => mainWindow?.webContents.send('view:zoom-in')
        },
        {
          label: 'Zoom Out',
          accelerator: 'CommandOrControl+-',
          click: () => mainWindow?.webContents.send('view:zoom-out')
        },
        {
          label: 'Actual Size',
          accelerator: 'CommandOrControl+0',
          click: () => mainWindow?.webContents.send('view:zoom-reset')
        },
        { type: 'separator' },
        {
          label: 'Compact Window',
          accelerator: 'CommandOrControl+1',
          click: () => setWindowPreset(820, 620)
        },
        {
          label: 'Standard Window',
          accelerator: 'CommandOrControl+2',
          click: () => setWindowPreset(1120, 820)
        },
        {
          label: 'Wide Window',
          accelerator: 'CommandOrControl+3',
          click: () => setWindowPreset(1440, 960)
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Next Document',
          accelerator: 'CommandOrControl+`',
          click: () => mainWindow?.webContents.send('document:next')
        },
        {
          label: 'Previous Document',
          accelerator: 'CommandOrControl+Shift+`',
          click: () => mainWindow?.webContents.send('document:previous')
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'front' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('dialog:openMarkdown', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] }]
  });

  if (result.canceled || result.filePaths.length === 0) return [];
  const files = await readMarkdownFiles(result.filePaths);
  watchMarkdownFiles(result.filePaths);
  return files;
});

ipcMain.handle('file:watch', (_event, filePaths) => {
  watchMarkdownFiles(Array.isArray(filePaths) ? filePaths : [filePaths]);
});

ipcMain.handle('renderer:ready', async (event) => {
  if (mainWindow && event.sender === mainWindow.webContents) {
    rendererReady = true;
    await flushPendingOpenPaths();
  }
});

app.whenReady().then(() => {
  configureAppIdentity();
  buildMenu();
  createWindow();
  sendMarkdownFiles(getMarkdownFilePaths(process.argv));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
