const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let mainWindow, tray;
let quitting = false, closePromptOpen = false;
let inProcessServer = false, serverStarting = false;
const serverPort = Number(process.env.PORT) || 8787;
const serverUrl = `http://127.0.0.1:${serverPort}`;
const writeAppLog = (value) => {
  try {
    const target = path.join(app.getPath("userData"), "app.log");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${new Date().toISOString()} ${value}\n`);
  } catch {}
};

async function startServer() {
  if (process.env.VYNODE_DEV || inProcessServer || serverStarting) return;
  serverStarting = true;
  const serverLog = path.join(app.getPath("userData"), "server.log");
  const log = (value) => { try { fs.mkdirSync(path.dirname(serverLog), { recursive: true }); fs.appendFileSync(serverLog, `${new Date().toISOString()} ${value}\n`); } catch {} };
  log("Starting media server in the background tray host.");
  try {
    process.env.VYNODE_APP_ROOT = app.getAppPath();
    process.env.VYNODE_DATA_DIR = app.getPath("userData");
    await import("../server/index.js");
    inProcessServer = true;
    log("Media server is running.");
  } catch (error) {
    log(`SERVER START FAILED ${error.stack || error}`);
  } finally {
    serverStarting = false;
    updateTray();
  }
}
function stopServer() {}
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${serverUrl}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error("The Vynode server did not start in time.");
}
function updateTray() {
  if (!tray) return;
  const running = Boolean(inProcessServer || process.env.VYNODE_DEV);
  tray.setToolTip(`Vynode Media — server ${running ? "running" : "stopped"}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Vynode Media", click: createWindow },
    { label: `Media server: ${running ? "Running" : "Stopped"}`, enabled: false },
    { type: "separator" },
    { label: "Exit client and server", click: quitEverything },
  ]));
}
function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromPath(path.join(__dirname, "tray-icon.svg"));
  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.on("double-click", createWindow);
  updateTray();
}
async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); return; }
  startServer();
  if (!process.env.VYNODE_DEV) {
    try { await waitForServer(); } catch (error) { dialog.showErrorBox("Vynode Media Server", error.message); return; }
  }
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 620,
    show: !process.env.VYNODE_TEST_DIAGNOSTIC,
    backgroundColor: "#080a0f", title: "Vynode Media", icon: path.join(__dirname, "tray-icon.svg"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.cjs") },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });
  mainWindow.webContents.on("console-message", (_event, details, message, line, source) => writeAppLog(typeof details === "object" ? `RENDERER ${details.level}: ${details.message} (${details.sourceId}:${details.lineNumber})` : `RENDERER ${details}: ${message} (${source}:${line})`));
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => writeAppLog(`LOAD FAILED ${code} ${description} ${url}`));
  mainWindow.webContents.on("render-process-gone", (_event, details) => writeAppLog(`RENDERER GONE ${JSON.stringify(details)}`));
  mainWindow.webContents.on("did-finish-load", async () => {
    writeAppLog(`Renderer loaded ${mainWindow.webContents.getURL()}`);
    if (process.env.VYNODE_TEST_DIAGNOSTIC) {
      const state = await mainWindow.webContents.executeJavaScript("({ text: document.body.innerText.slice(0, 500), htmlLength: document.body.innerHTML.length, rootChildren: document.getElementById('root')?.childElementCount || 0 })").catch((error) => ({ error: error.message }));
      writeAppLog(`DIAGNOSTIC ${JSON.stringify(state)}`);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  mainWindow.on("close", async (event) => {
    if (quitting) return;
    event.preventDefault();
    if (closePromptOpen) return;
    closePromptOpen = true;
    const result = await dialog.showMessageBox(mainWindow, {
      type: "question", title: "Close Vynode Media?", message: "Do you want the media server to keep running?",
      detail: "Keeping it running lets your TVs, phones, and other clients continue using this Windows server.",
      buttons: ["Keep server running", "Close client and server", "Cancel"], defaultId: 0, cancelId: 2, noLink: true,
    });
    closePromptOpen = false;
    if (result.response === 0) mainWindow.hide();
    else if (result.response === 1) quitEverything();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  try {
    await mainWindow.loadURL(process.env.VYNODE_DEV ? "http://localhost:4321" : serverUrl);
  } catch (error) {
    writeAppLog(`WINDOW LOAD ERROR ${error.stack || error}`);
    await mainWindow.loadURL(`data:text/html,${encodeURIComponent(`<body style="margin:0;background:#080a0f;color:white;font:18px sans-serif;padding:48px"><h1>Vynode could not start</h1><p>${String(error.message || error)}</p><p>Diagnostic log: ${path.join(app.getPath("userData"), "app.log")}</p></body>`)}`);
  }
}
function quitEverything() { quitting = true; stopServer(); app.quit(); }

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", createWindow);
  app.whenReady().then(() => {
    startServer();
    if (!process.env.VYNODE_TEST_HEADLESS) { createTray(); createWindow(); }
  });
}
ipcMain.handle("choose-media-folder", async () => {
  const result = await dialog.showOpenDialog({ title: "Choose your media folder", properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("toggle-fullscreen", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  window.setFullScreen(!window.isFullScreen());
  return window.isFullScreen();
});
app.on("before-quit", () => { quitting = true; stopServer(); });
app.on("window-all-closed", () => {});
app.on("activate", createWindow);
