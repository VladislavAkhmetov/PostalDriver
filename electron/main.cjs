const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const url = require('url');

// GPU & performance flags for gaming
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// Force high performance GPU on dual-GPU systems
app.commandLine.appendSwitch('force_high_performance_gpu');

// Register custom scheme 'app' as privileged for local assets, AudioWorklets, WebGL, Fetch
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'Сельская почта',
    autoHideMenuBar: true,
    backgroundColor: '#0f1114',
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Capture renderer console messages for debugging
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer log ${level}]: ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer load error]: ${errorDescription} (${errorCode}) at ${validatedURL}`);
  });

  // Load from local custom protocol
  mainWindow.loadURL('app://localhost/index.html');

  // Handle hotkeys (F11 fullscreen, F12 devtools)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F11') {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        event.preventDefault();
      } else if (input.key === 'F12') {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Protocol handler serves dist directory like a web server
  protocol.handle('app', (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let pathname = decodeURIComponent(parsedUrl.pathname);
      if (!pathname || pathname === '/') {
        pathname = '/index.html';
      }
      const distDir = path.join(__dirname, '..', 'dist');
      const filePath = path.join(distDir, pathname);

      // Security check to ensure requests stay within dist
      if (!filePath.startsWith(distDir)) {
        return new Response('Forbidden', { status: 403 });
      }

      return net.fetch(url.pathToFileURL(filePath).toString());
    } catch (err) {
      console.error('Failed to serve app request:', err);
      return new Response('Not Found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
