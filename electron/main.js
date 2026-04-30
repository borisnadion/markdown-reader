import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_NAME = 'Markdown Reader';
const APP_ICON = path.join(__dirname, '..', 'build', 'icon.png');

let mainWindow = null;
let pendingOpenPaths = [];

const isDev = Boolean(process.env.ELECTRON_START_URL);

app.setName(APP_NAME);
process.title = APP_NAME;

function createWindow() {
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

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

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

  mainWindow.webContents.once('did-finish-load', async () => {
    if (pendingOpenPaths.length > 0) {
      const filePaths = pendingOpenPaths;
      pendingOpenPaths = [];
      await sendMarkdownFiles(filePaths);
    }
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

async function readMarkdownFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return {
    path: filePath,
    name: path.basename(filePath),
    content
  };
}

async function readMarkdownFiles(filePaths) {
  return Promise.all(filePaths.map((filePath) => readMarkdownFile(filePath)));
}

async function sendMarkdownFiles(filePaths) {
  if (!mainWindow) {
    pendingOpenPaths.push(...filePaths);
    return;
  }

  const files = await readMarkdownFiles(filePaths);
  mainWindow.webContents.send('file:open', files);
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
  return readMarkdownFiles(result.filePaths);
});

app.whenReady().then(() => {
  configureAppIdentity();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  sendMarkdownFiles([filePath]);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
