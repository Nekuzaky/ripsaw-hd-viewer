export type QualityProfileId = '1080p60' | '1080p30' | '720p60' | '720p30';
export type ScaleMode = 'fit' | 'fill' | 'stretch';
export type ColorRange = 'auto' | 'full' | 'limited';
export type Locale = 'auto' | 'en' | 'fr';

export interface ImageSettings {
  scaleMode: ScaleMode;
  colorRange: ColorRange;
  sharpness: number;
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
}

export interface AudioSettings {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  volume: number;
  muted: boolean;
  nightMode: boolean;
  syncOffsetMs: number;
}

export interface CaptureSettings {
  videoDeviceId: string | null;
  quality: QualityProfileId;
  autoQuality: boolean;
}

export interface RecordingSettings {
  bitrateMbps: number;
  replayEnabled: boolean;
  replaySeconds: number;
  directory: string | null;
}

export interface InterfaceSettings {
  locale: Locale;
  showStats: boolean;
  startFullscreen: boolean;
  keepAwake: boolean;
}

export interface Settings {
  image: ImageSettings;
  audio: AudioSettings;
  capture: CaptureSettings;
  recording: RecordingSettings;
  ui: InterfaceSettings;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const DEFAULT_IMAGE: ImageSettings = {
  scaleMode: 'fit',
  colorRange: 'auto',
  sharpness: 0.3,
  brightness: 0,
  contrast: 1,
  saturation: 1,
  gamma: 1,
};

export const DEFAULT_SETTINGS: Settings = {
  image: DEFAULT_IMAGE,
  audio: {
    inputDeviceId: null,
    outputDeviceId: null,
    volume: 1,
    muted: false,
    nightMode: false,
    syncOffsetMs: 0,
  },
  capture: {
    videoDeviceId: null,
    quality: '1080p60',
    autoQuality: true,
  },
  recording: {
    bitrateMbps: 16,
    replayEnabled: true,
    replaySeconds: 30,
    directory: null,
  },
  ui: {
    locale: 'auto',
    showStats: false,
    startFullscreen: false,
    keepAwake: true,
  },
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function mergeSettings<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return base;
  const result: Record<string, unknown> = { ...base };
  for (const [key, baseValue] of Object.entries(base)) {
    if (!(key in patch)) continue;
    const next = patch[key];
    if (isPlainObject(baseValue)) {
      result[key] = mergeSettings(baseValue, next);
    } else if (next === null || baseValue === null || typeof next === typeof baseValue) {
      result[key] = next;
    }
  }
  return result as T;
}
