import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';
import { IpcChannel, type WindowState } from '@shared/ipc';

const MINI_WIDTH = 480;
const MINI_HEIGHT = 270;
const MINI_MARGIN = 24;

export class MainWindow {
  readonly window: BrowserWindow;
  private miniPlayer = false;
  private restoreBounds: Electron.Rectangle | null = null;

  constructor(startFullscreen: boolean, icon: string) {
    this.window = new BrowserWindow({
      width: 1280,
      height: 720,
      minWidth: 320,
      minHeight: 180,
      show: false,
      backgroundColor: '#000000',
      title: 'RipView',
      icon,
      autoHideMenuBar: true,
      fullscreen: startFullscreen,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        spellcheck: false,
      },
    });

    this.window.once('ready-to-show', () => this.window.show());
    this.window.on('enter-full-screen', () => this.emitState());
    this.window.on('leave-full-screen', () => this.emitState());
    this.window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    this.window.webContents.on('will-navigate', (event) => event.preventDefault());
  }

  load(): Promise<void> {
    const devServer = process.env['ELECTRON_RENDERER_URL'];
    if (devServer) return this.window.loadURL(devServer);
    return this.window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  state(): WindowState {
    return {
      fullscreen: this.window.isFullScreen(),
      miniPlayer: this.miniPlayer,
      alwaysOnTop: this.window.isAlwaysOnTop(),
    };
  }

  setFullscreen(value: boolean): WindowState {
    if (value && this.miniPlayer) this.exitMiniPlayer();
    this.window.setFullScreen(value);
    return this.state();
  }

  toggleFullscreen(): WindowState {
    return this.setFullscreen(!this.window.isFullScreen());
  }

  toggleMiniPlayer(): WindowState {
    if (this.miniPlayer) this.exitMiniPlayer();
    else this.enterMiniPlayer();
    this.emitState();
    return this.state();
  }

  private enterMiniPlayer(): void {
    if (this.window.isFullScreen()) this.window.setFullScreen(false);
    this.restoreBounds = this.window.getBounds();
    const area = screen.getDisplayMatching(this.restoreBounds).workArea;
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setBounds({
      x: area.x + area.width - MINI_WIDTH - MINI_MARGIN,
      y: area.y + area.height - MINI_HEIGHT - MINI_MARGIN,
      width: MINI_WIDTH,
      height: MINI_HEIGHT,
    });
    this.window.setAspectRatio(16 / 9);
    this.miniPlayer = true;
  }

  private exitMiniPlayer(): void {
    this.window.setAlwaysOnTop(false);
    this.window.setAspectRatio(0);
    if (this.restoreBounds) this.window.setBounds(this.restoreBounds);
    this.miniPlayer = false;
  }

  private emitState(): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(IpcChannel.WindowStateChanged, this.state());
    }
  }
}
