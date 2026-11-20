import type { SavedMedia } from '@shared/ipc';
import { Emitter } from '../core/Emitter';
import { bestRecordingFormat, recorderOptions } from './codecs';

interface RecorderEvents {
  state: { recording: boolean; startedAt: number | null };
  error: Error;
}

const TIMESLICE_MS = 1000;

export class Recorder extends Emitter<RecorderEvents> {
  private recorder: MediaRecorder | null = null;
  private fileId: string | null = null;
  private writes: Promise<void> = Promise.resolve();
  private startedAt: number | null = null;

  get recording(): boolean {
    return this.recorder !== null;
  }

  get elapsedMs(): number {
    return this.startedAt ? performance.now() - this.startedAt : 0;
  }

  async start(stream: MediaStream, bitrateMbps: number): Promise<void> {
    if (this.recorder) return;
    const format = bestRecordingFormat();
    const fileId = await window.ripview.media.openRecording(format.extension);
    const recorder = new MediaRecorder(stream, recorderOptions(bitrateMbps));

    recorder.addEventListener('dataavailable', (event) => {
      if (!event.data.size) return;
      const chunk = event.data;
      this.writes = this.writes
        .then(async () => window.ripview.media.writeRecording(fileId, await chunk.arrayBuffer()))
        .catch((error: unknown) => this.emit('error', error as Error));
    });
    recorder.addEventListener('error', () => {
      this.emit('error', new Error('Recording failed'));
      void this.stop();
    });

    this.fileId = fileId;
    this.recorder = recorder;
    this.startedAt = performance.now();
    recorder.start(TIMESLICE_MS);
    this.emit('state', { recording: true, startedAt: this.startedAt });
  }

  async stop(): Promise<SavedMedia | null> {
    const recorder = this.recorder;
    const fileId = this.fileId;
    if (!recorder || !fileId) return null;
    this.recorder = null;
    this.fileId = null;
    this.startedAt = null;

    if (recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await this.writes;
    this.emit('state', { recording: false, startedAt: null });
    return window.ripview.media.closeRecording(fileId);
  }
}
