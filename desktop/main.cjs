const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let serverStarted = false;
async function createWindow() {
  if (!process.env.VYNODE_DEV && !serverStarted) {
    serverStarted = true;
    process.env.VYNODE_APP_ROOT = app.getAppPath();
    process.env.VYNODE_DATA_DIR = app.getPath("userData");
    await import("../server/index.js");
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#080a0f",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  await win.loadURL(
    process.env.VYNODE_DEV ? "http://localhost:4321" : "http://localhost:8787",
  );
}
app.whenReady().then(createWindow);
ipcMain.handle("choose-media-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose your media folder",
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
