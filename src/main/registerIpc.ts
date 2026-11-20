import { app, ipcMain, powerSaveBlocker } from 'electron';
import { IpcChannel, type AppInfo } from '@shared/ipc';
import type { DeepPartial, Settings } from '@shared/settings';
import type { MainWindow } from './MainWindow';
import type { MediaStorage } from './MediaStorage';
import type { SettingsStore } from './SettingsStore';
import type { Updater } from './Updater';

interface Services {
  window: MainWindow;
  settings: SettingsStore;
  media: MediaStorage;
  updater: Updater;
}

export function registerIpc({ window, settings, media, updater }: Services): void {
  let blockerId: number | null = null;

  ipcMain.handle(IpcChannel.UpdateCheck, () => updater.check());
  ipcMain.handle(IpcChannel.UpdateInstall, () => updater.install());

  ipcMain.handle(IpcChannel.SettingsGet, () => settings.get());
  ipcMain.handle(IpcChannel.SettingsSet, (_event, patch: DeepPartial<Settings>) => settings.update(patch));

  ipcMain.handle(IpcChannel.WindowToggleFullscreen, () => window.toggleFullscreen());
  ipcMain.handle(IpcChannel.WindowSetFullscreen, (_event, value: boolean) => window.setFullscreen(value));
  ipcMain.handle(IpcChannel.WindowToggleMiniPlayer, () => window.toggleMiniPlayer());

  ipcMain.handle(IpcChannel.MediaSaveScreenshot, (_event, data: ArrayBuffer) => media.saveScreenshot(data));
  ipcMain.handle(IpcChannel.MediaSaveClip, (_event, data: ArrayBuffer, extension: string) =>
    media.saveClip(data, extension),
  );
  ipcMain.handle(IpcChannel.MediaRecordingOpen, (_event, extension: string) =>
    media.openRecording(extension),
  );
  ipcMain.handle(IpcChannel.MediaRecordingWrite, (_event, id: string, chunk: ArrayBuffer) =>
    media.writeRecording(id, chunk),
  );
  ipcMain.handle(IpcChannel.MediaRecordingClose, (_event, id: string) => media.closeRecording(id));
  ipcMain.handle(IpcChannel.MediaOpenFolder, () => media.openFolder());
  ipcMain.handle(IpcChannel.MediaShowItem, (_event, path: string) => media.showItem(path));

  ipcMain.handle(IpcChannel.PowerKeepAwake, (_event, enabled: boolean) => {
    if (enabled && blockerId === null) {
      blockerId = powerSaveBlocker.start('prevent-display-sleep');
    } else if (!enabled && blockerId !== null) {
      powerSaveBlocker.stop(blockerId);
      blockerId = null;
    }
  });

  ipcMain.handle(IpcChannel.AppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    locale: app.getLocale(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }));
}
