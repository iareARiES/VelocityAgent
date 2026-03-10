import { ipcMain, app } from "electron";
import * as os from "os";
import * as path from "path";

export interface SystemPaths {
    desktop: string;
    downloads: string;
    documents: string;
    home: string;
    appData: string;
    temp: string;
    username: string;
    platform: string;
}

/** Resolve real OS paths once — no hardcoded guesses. */
export function resolveSystemPaths(): SystemPaths {
    return {
        desktop: path.join(os.homedir(), "Desktop"),
        downloads: path.join(os.homedir(), "Downloads"),
        documents: path.join(os.homedir(), "Documents"),
        home: os.homedir(),
        appData: app.getPath("appData"),
        temp: os.tmpdir(),
        username: os.userInfo().username,
        platform: process.platform, // 'win32' | 'darwin' | 'linux'
    };
}

export function registerSystemIpc() {
    ipcMain.handle("resolve-system-paths", () => {
        return resolveSystemPaths();
    });
}
