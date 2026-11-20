export const IpcChannel = {
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  WindowToggleFullscreen: 'window:toggle-fullscreen',
  WindowSetFullscreen: 'window:set-fullscreen',
  WindowToggleMiniPlayer: 'window:toggle-mini-player',
  WindowStateChanged: 'window:state-changed',
  MediaSaveScreenshot: 'media:save-screenshot',
  MediaSaveClip: 'media:save-clip',
  MediaRecordingOpen: 'media:recording-open',
  MediaRecordingWrite: 'media:recording-write',
  MediaRecordingClose: 'media:recording-close',
  MediaOpenFolder: 'media:open-folder',
  MediaShowItem: 'media:show-item',
  PowerKeepAwake: 'power:keep-awake',
  AppInfo: 'app:info',
  UpdateCheck: 'update:check',
  UpdateInstall: 'update:install',
  UpdateStatus: 'update:status',
} as const;

export type UpdateStatus =
  | { state: 'unsupported' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface WindowState {
  fullscreen: boolean;
  miniPlayer: boolean;
  alwaysOnTop: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  locale: string;
  electron: string;
  chrome: string;
}

export type MediaKind = 'screenshot' | 'clip' | 'recording';

export interface SavedMedia {
  path: string;
  kind: MediaKind;
}
