import { app, session } from 'electron';
import { join } from 'node:path';
import { MainWindow } from './MainWindow';
import { MediaStorage } from './MediaStorage';
import { SettingsStore } from './SettingsStore';
import { registerIpc } from './registerIpc';
import { Updater } from './Updater';

const ALLOWED_PERMISSIONS = new Set(['media', 'fullscreen', 'speaker-selection']);

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: MainWindow | null = null;

  app.on('second-instance', () => {
    const window = mainWindow?.window;
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.nekuzaky.ripview');

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) =>
      callback(ALLOWED_PERMISSIONS.has(permission)),
    );
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
      ALLOWED_PERMISSIONS.has(permission),
    );

    const settings = new SettingsStore();
    const media = new MediaStorage(settings);
    const icon = join(app.getAppPath(), 'build', 'icon.png');
    mainWindow = new MainWindow(settings.get().ui.startFullscreen, icon);
    const updater = new Updater(mainWindow.window);
    registerIpc({ window: mainWindow, settings, media, updater });

    app.on('before-quit', () => {
      settings.flush();
      media.closeAll();
    });

    await mainWindow.load();
    updater.start(settings.get().ui.autoUpdate);
  });

  app.on('window-all-closed', () => app.quit());
}
