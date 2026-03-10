import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./window";
import { ensureStoragePathsExist } from "./store";
import { registerAIIpc } from "./ai-ipc";
import { registerHistoryIpc } from "./history-ipc";
import { registerWindowIpc } from "./window-ipc";
import { registerSystemIpc } from "./system-ipc";

app.commandLine.appendSwitch('enable-speech-dispatcher');

app.on('web-contents-created', (event, webContents) => {
  webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true); // Always allow microphone
    } else {
      callback(false);
    }
  });
});

app.whenReady().then(() => {
  ensureStoragePathsExist();
  createMainWindow();

  registerAIIpc();
  registerHistoryIpc();
  registerWindowIpc();
  registerSystemIpc();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});