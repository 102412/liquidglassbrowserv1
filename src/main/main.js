const { app, BrowserWindow, WebContentsView, ipcMain, session } = require('electron');
const path = require('node:path');
const os = require('node:os');

// Height, in CSS px, of the chrome strip (titlebar + tab bar + address bar)
// that sits visually on top of the page content.
const CHROME_HEIGHT = 84;

const HOME_URL = 'https://www.google.com';

/** @type {BrowserWindow} */
let mainWindow;
/** @type {WebContentsView} */
let chromeView;

/** Map<number, { id: number, view: WebContentsView, title: string, url: string }> */
const tabs = new Map();
let activeTabId = null;
let nextTabId = 1;

let frameCaptureTimer = null;

function supportsAcrylic() {
  if (process.platform !== 'win32') return false;
  const release = os.release().split('.').map(Number);
  // Windows 11 is release 10.0.22000+
  return release[0] === 10 && release[2] >= 22000;
}

function createWindow() {
  const windowOptions = {
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 420,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (supportsAcrylic()) {
    windowOptions.backgroundMaterial = 'acrylic';
  }

  mainWindow = new BrowserWindow(windowOptions);

  chromeView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  chromeView.setBackgroundColor('#00000000');
  mainWindow.contentView.addChildView(chromeView);
  chromeView.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  layoutViews();
  mainWindow.on('resize', layoutViews);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('closed', () => {
    stopFrameCapture();
    mainWindow = null;
  });

  createTab(HOME_URL);
}

function layoutViews() {
  if (!mainWindow) return;
  const [width, height] = mainWindow.getContentSize();
  chromeView.setBounds({ x: 0, y: 0, width, height: CHROME_HEIGHT });
  for (const tab of tabs.values()) {
    tab.view.setBounds({ x: 0, y: 0, width, height });
  }
}

function normalizeInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return HOME_URL;

  const looksLikeUrl =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
    (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/i.test(trimmed) && !trimmed.includes(' '));

  if (looksLikeUrl) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function serializeTabs() {
  return {
    activeTabId,
    tabs: Array.from(tabs.values()).map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      loading: t.loading,
      canGoBack: t.view.webContents.navigationHistory
        ? t.view.webContents.navigationHistory.canGoBack()
        : t.view.webContents.canGoBack(),
      canGoForward: t.view.webContents.navigationHistory
        ? t.view.webContents.navigationHistory.canGoForward()
        : t.view.webContents.canGoForward(),
    })),
  };
}

function broadcastTabs() {
  if (chromeView && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send('tabs:state', serializeTabs());
  }
}

function createTab(url) {
  const id = nextTabId++;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const tab = { id, view, title: 'New Tab', url, loading: true };
  tabs.set(id, tab);

  const wc = view.webContents;
  wc.on('page-title-updated', (_e, title) => {
    tab.title = title;
    broadcastTabs();
  });
  wc.on('did-start-loading', () => {
    tab.loading = true;
    broadcastTabs();
  });
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    broadcastTabs();
  });
  wc.on('did-navigate', (_e, navUrl) => {
    tab.url = navUrl;
    broadcastTabs();
  });
  wc.on('did-navigate-in-page', (_e, navUrl) => {
    tab.url = navUrl;
    broadcastTabs();
  });

  // Insert below the chrome view (added first among page views = bottom of
  // that group), but the chrome view itself is always added last overall so
  // it stays visually on top and can be captured "through" for the glass
  // texture.
  mainWindow.contentView.addChildView(view, 0);
  layoutViews();

  wc.loadURL(url);
  activateTab(id);
  return tab;
}

function activateTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  activeTabId = id;
  for (const t of tabs.values()) {
    t.view.setVisible(t.id === id);
  }
  broadcastTabs();
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  mainWindow.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  tabs.delete(id);

  if (activeTabId === id) {
    const remaining = Array.from(tabs.keys());
    if (remaining.length) {
      activateTab(remaining[remaining.length - 1]);
    } else {
      activeTabId = null;
      createTab(HOME_URL);
    }
  }
  broadcastTabs();
}

function activeTab() {
  return activeTabId ? tabs.get(activeTabId) : null;
}

// --- Periodic capture of the page pixels sitting directly beneath the glass
// chrome, streamed to the renderer as a texture for the WebGL refraction
// layer. This is a real screenshot of live content, not a synthetic blur.
function startFrameCapture() {
  stopFrameCapture();
  frameCaptureTimer = setInterval(async () => {
    const tab = activeTab();
    if (!tab || !mainWindow || mainWindow.isMinimized()) return;
    if (chromeView.webContents.isDestroyed() || tab.view.webContents.isDestroyed()) return;

    const [width] = mainWindow.getContentSize();
    try {
      const image = await tab.view.webContents.capturePage({
        x: 0,
        y: 0,
        width,
        height: CHROME_HEIGHT,
      });
      if (image.isEmpty()) return;
      chromeView.webContents.send('glass:frame', {
        dataUrl: image.toDataURL(),
        width,
        height: CHROME_HEIGHT,
      });
    } catch {
      // Capture can race with tab teardown/navigation; skip this tick.
    }
  }, 90);
}

function stopFrameCapture() {
  if (frameCaptureTimer) {
    clearInterval(frameCaptureTimer);
    frameCaptureTimer = null;
  }
}

// --- IPC surface used by the chrome UI (see preload.js) ---
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());

ipcMain.handle('tabs:create', (_e, url) => {
  createTab(url || HOME_URL);
});
ipcMain.handle('tabs:close', (_e, id) => closeTab(id));
ipcMain.handle('tabs:activate', (_e, id) => activateTab(id));
ipcMain.handle('tabs:get', () => serializeTabs());

ipcMain.handle('nav:go', (_e, input) => {
  const tab = activeTab();
  if (!tab) return;
  const url = normalizeInput(input);
  tab.view.webContents.loadURL(url);
});
ipcMain.handle('nav:back', () => {
  const tab = activeTab();
  if (tab?.view.webContents.navigationHistory?.canGoBack()) tab.view.webContents.navigationHistory.goBack();
  else if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack();
});
ipcMain.handle('nav:forward', () => {
  const tab = activeTab();
  if (tab?.view.webContents.navigationHistory?.canGoForward()) tab.view.webContents.navigationHistory.goForward();
  else if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward();
});
ipcMain.handle('nav:reload', () => activeTab()?.view.webContents.reload());

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  createWindow();
  startFrameCapture();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopFrameCapture();
  if (process.platform !== 'darwin') app.quit();
});
