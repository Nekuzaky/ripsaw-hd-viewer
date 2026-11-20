import type { QualityProfileId } from '@shared/settings';
import { Emitter } from '../core/Emitter';
import { QUALITY_PROFILES } from './qualityProfiles';

export type CaptureStatus =
  | { kind: 'searching' }
  | { kind: 'not-found' }
  | { kind: 'busy' }
  | { kind: 'permission-denied' }
  | { kind: 'error'; message: string }
  | { kind: 'live' };

export interface DeviceLists {
  video: MediaDeviceInfo[];
  audioInput: MediaDeviceInfo[];
  audioOutput: MediaDeviceInfo[];
}

export interface CaptureRequest {
  videoDeviceId: string | null;
  audioDeviceId: string | null;
  quality: QualityProfileId;
}

interface CaptureEvents {
  status: CaptureStatus;
  stream: MediaStream | null;
  devices: DeviceLists;
}

const CAPTURE_PATTERNS = [/ripsaw.*hdmi/i, /ripsaw/i, /capture|cam link|elgato|avermedia|hdmi/i];
const VIRTUAL_DEVICE = /^(default|communications)$/;
const RETRY_DELAY_MS = 2500;

export class CaptureSource extends Emitter<CaptureEvents> {
  private stream: MediaStream | null = null;
  private request: CaptureRequest | null = null;
  private retryTimer: number | null = null;
  private generation = 0;
  private lists: DeviceLists = { video: [], audioInput: [], audioOutput: [] };

  constructor() {
    super();
    navigator.mediaDevices.addEventListener('devicechange', () => void this.onDeviceChange());
  }

  get current(): MediaStream | null {
    return this.stream;
  }

  get devices(): DeviceLists {
    return this.lists;
  }

  async start(request: CaptureRequest): Promise<void> {
    this.request = request;
    const generation = ++this.generation;
    this.clearRetry();
    this.release();
    this.emit('status', { kind: 'searching' });

    try {
      await this.refreshDevices(true);
      if (generation !== this.generation) return;

      const videoId = this.resolve(this.lists.video, request.videoDeviceId);
      if (!videoId) {
        this.emit('status', { kind: 'not-found' });
        this.scheduleRetry();
        return;
      }
      const audioId = this.resolve(this.lists.audioInput, request.audioDeviceId, videoId);
      const profile = QUALITY_PROFILES[request.quality];

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: videoId },
          width: { ideal: profile.width },
          height: { ideal: profile.height },
          frameRate: { ideal: profile.fps },
          resizeMode: 'none',
        } as MediaTrackConstraints,
        audio: audioId
          ? {
              deviceId: { exact: audioId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: { ideal: 2 },
              sampleRate: { ideal: 48000 },
              sampleSize: { ideal: 16 },
            }
          : false,
      });

      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.stream = stream;
      for (const track of stream.getTracks()) {
        track.addEventListener('ended', () => this.onTrackEnded(generation));
      }
      this.emit('stream', stream);
      this.emit('status', { kind: 'live' });
    } catch (error) {
      if (generation !== this.generation) return;
      this.emit('status', this.describe(error));
      this.scheduleRetry();
    }
  }

  restart(): Promise<void> {
    return this.request ? this.start(this.request) : Promise.resolve();
  }

  stop(): void {
    this.generation++;
    this.clearRetry();
    this.release();
  }

  selectedVideoLabel(): string {
    return this.stream?.getVideoTracks()[0]?.label ?? '';
  }

  private async refreshDevices(requestLabels: boolean): Promise<void> {
    let devices = await navigator.mediaDevices.enumerateDevices();
    if (requestLabels && !devices.some((device) => device.label)) {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      probe.getTracks().forEach((track) => track.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
    }
    this.lists = {
      video: devices.filter((device) => device.kind === 'videoinput'),
      audioInput: devices.filter(
        (device) => device.kind === 'audioinput' && !VIRTUAL_DEVICE.test(device.deviceId),
      ),
      audioOutput: devices.filter(
        (device) => device.kind === 'audiooutput' && device.deviceId !== 'communications',
      ),
    };
    this.emit('devices', this.lists);
  }

  private resolve(devices: MediaDeviceInfo[], preferred: string | null, pairedWith?: string): string | null {
    if (preferred && devices.some((device) => device.deviceId === preferred)) return preferred;
    if (pairedWith) {
      const groupId = this.lists.video.find((device) => device.deviceId === pairedWith)?.groupId;
      const sibling = devices.find((device) => groupId && device.groupId === groupId);
      if (sibling) return sibling.deviceId;
    }
    for (const pattern of CAPTURE_PATTERNS) {
      const match = devices.find((device) => pattern.test(device.label));
      if (match) return match.deviceId;
    }
    return null;
  }

  private describe(error: unknown): CaptureStatus {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotReadableError' || name === 'AbortError') return { kind: 'busy' };
    if (name === 'NotAllowedError' || name === 'SecurityError') return { kind: 'permission-denied' };
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return { kind: 'not-found' };
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }

  private async onDeviceChange(): Promise<void> {
    await this.refreshDevices(false).catch(() => undefined);
    if (!this.stream && this.request) {
      this.clearRetry();
      void this.start(this.request);
    }
  }

  private onTrackEnded(generation: number): void {
    if (generation !== this.generation) return;
    this.release();
    this.emit('status', { kind: 'searching' });
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    this.clearRetry();
    this.retryTimer = window.setTimeout(() => void this.restart(), RETRY_DELAY_MS);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private release(): void {
    if (!this.stream) return;
    this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.emit('stream', null);
  }
}
