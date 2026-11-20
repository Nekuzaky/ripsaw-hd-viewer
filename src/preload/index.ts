import { contextBridge, ipcRenderer } from 'electron';
import type { RipViewBridge } from '@shared/bridge';
import { IpcChannel, type UpdateStatus, type WindowState } from '@shared/ipc';

const bridge: RipViewBridge = {
  settings: {
    get: () => ipcRenderer.invoke(IpcChannel.SettingsGet),
    set: (patch) => ipcRenderer.invoke(IpcChannel.SettingsSet, patch),
  },
  window: {
    toggleFullscreen: () => ipcRenderer.invoke(IpcChannel.WindowToggleFullscreen),
    setFullscreen: (value) => ipcRenderer.invoke(IpcChannel.WindowSetFullscreen, value),
    toggleMiniPlayer: () => ipcRenderer.invoke(IpcChannel.WindowToggleMiniPlayer),
    onStateChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: WindowState): void => listener(state);
      ipcRenderer.on(IpcChannel.WindowStateChanged, handler);
      return () => ipcRenderer.off(IpcChannel.WindowStateChanged, handler);
    },
  },
  media: {
    saveScreenshot: (data) => ipcRenderer.invoke(IpcChannel.MediaSaveScreenshot, data),
    saveClip: (data, extension) => ipcRenderer.invoke(IpcChannel.MediaSaveClip, data, extension),
    openRecording: (extension) => ipcRenderer.invoke(IpcChannel.MediaRecordingOpen, extension),
    writeRecording: (id, chunk) => ipcRenderer.invoke(IpcChannel.MediaRecordingWrite, id, chunk),
    closeRecording: (id) => ipcRenderer.invoke(IpcChannel.MediaRecordingClose, id),
    openFolder: () => ipcRenderer.invoke(IpcChannel.MediaOpenFolder),
    showItem: (path) => ipcRenderer.invoke(IpcChannel.MediaShowItem, path),
  },
  power: {
    keepAwake: (enabled) => ipcRenderer.invoke(IpcChannel.PowerKeepAwake, enabled),
  },
  app: {
    info: () => ipcRenderer.invoke(IpcChannel.AppInfo),
  },
  updates: {
    check: () => ipcRenderer.invoke(IpcChannel.UpdateCheck),
    install: () => ipcRenderer.invoke(IpcChannel.UpdateInstall),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => listener(status);
      ipcRenderer.on(IpcChannel.UpdateStatus, handler);
      return () => ipcRenderer.off(IpcChannel.UpdateStatus, handler);
    },
  },
};

contextBridge.exposeInMainWorld('ripview', bridge);
