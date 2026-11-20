import { app, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { IpcChannel, type UpdateStatus } from '@shared/ipc';

const { autoUpdater } = electronUpdater;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class Updater {
  private status: UpdateStatus;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly window: BrowserWindow) {
    this.status = Updater.supported() ? { state: 'up-to-date' } : { state: 'unsupported' };
    if (!Updater.supported()) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => this.publish({ state: 'checking' }));
    autoUpdater.on('update-not-available', () => this.publish({ state: 'up-to-date' }));
    autoUpdater.on('update-available', (info) =>
      this.publish({ state: 'downloading', version: info.version, percent: 0 }),
    );
    autoUpdater.on('download-progress', (progress) => {
      if (this.status.state === 'downloading') {
        this.publish({ ...this.status, percent: Math.round(progress.percent) });
      }
    });
    autoUpdater.on('update-downloaded', (info) => this.publish({ state: 'ready', version: info.version }));
    autoUpdater.on('error', (error) => this.publish({ state: 'error', message: error.message }));
  }

  static supported(): boolean {
    return app.isPackaged && process.platform === 'win32' && !process.env['PORTABLE_EXECUTABLE_DIR'];
  }

  start(enabled: boolean): void {
    if (!enabled || !Updater.supported() || this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  async check(): Promise<UpdateStatus> {
    if (!Updater.supported() || this.status.state === 'downloading' || this.status.state === 'ready') {
      return this.status;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.publish({ state: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    return this.status;
  }

  install(): void {
    if (this.status.state === 'ready') autoUpdater.quitAndInstall(true, true);
  }

  private publish(status: UpdateStatus): void {
    this.status = status;
    if (!this.window.isDestroyed()) this.window.webContents.send(IpcChannel.UpdateStatus, status);
  }
}
