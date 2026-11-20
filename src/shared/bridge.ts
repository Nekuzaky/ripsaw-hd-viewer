import type { AppInfo, SavedMedia, WindowState } from './ipc';
import type { DeepPartial, Settings } from './settings';

export interface RipViewBridge {
  settings: {
    get(): Promise<Settings>;
    set(patch: DeepPartial<Settings>): Promise<Settings>;
  };
  window: {
    toggleFullscreen(): Promise<WindowState>;
    setFullscreen(value: boolean): Promise<WindowState>;
    toggleMiniPlayer(): Promise<WindowState>;
    onStateChanged(listener: (state: WindowState) => void): () => void;
  };
  media: {
    saveScreenshot(data: ArrayBuffer): Promise<SavedMedia>;
    saveClip(data: ArrayBuffer, extension: string): Promise<SavedMedia>;
    openRecording(extension: string): Promise<string>;
    writeRecording(id: string, chunk: ArrayBuffer): Promise<void>;
    closeRecording(id: string): Promise<SavedMedia>;
    openFolder(): Promise<void>;
    showItem(path: string): Promise<void>;
  };
  power: {
    keepAwake(enabled: boolean): Promise<void>;
  };
  app: {
    info(): Promise<AppInfo>;
  };
}
