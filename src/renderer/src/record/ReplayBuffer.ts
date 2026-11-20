import type { SavedMedia } from '@shared/ipc';
import { bestRecordingFormat, recorderOptions } from './codecs';

interface Segment {
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
}

export class ReplayBuffer {
  private segments: Segment[] = [];
  private stream: MediaStream | null = null;
  private timer: number | null = null;
  private seconds = 30;
  private bitrateMbps = 16;

  get active(): boolean {
    return this.stream !== null;
  }

  get bufferedSeconds(): number {
    const oldest = this.segments[0];
    return oldest ? Math.min(this.seconds, (performance.now() - oldest.startedAt) / 1000) : 0;
  }

  start(stream: MediaStream, seconds: number, bitrateMbps: number): void {
    this.stop();
    this.stream = stream;
    this.seconds = seconds;
    this.bitrateMbps = bitrateMbps;
    this.spawn();
    this.timer = window.setInterval(() => this.rotate(), (seconds * 1000) / 2);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const segment of this.segments) this.halt(segment);
    this.segments = [];
    this.stream = null;
  }

  async save(): Promise<SavedMedia | null> {
    const segment = this.segments.shift();
    if (!segment) return null;
    const blob = await new Promise<Blob>((resolve) => {
      segment.recorder.addEventListener(
        'stop',
        () => resolve(new Blob(segment.chunks, { type: segment.recorder.mimeType })),
        { once: true },
      );
      segment.recorder.stop();
    });
    if (!this.segments.length && this.stream) this.spawn();
    if (!blob.size) return null;
    return window.ripview.media.saveClip(await blob.arrayBuffer(), bestRecordingFormat().extension);
  }

  private rotate(): void {
    if (!this.stream) return;
    this.spawn();
    const now = performance.now();
    while (this.segments.length > 1 && now - this.segments[1].startedAt >= this.seconds * 1000) {
      const expired = this.segments.shift();
      if (expired) this.halt(expired);
    }
  }

  private spawn(): void {
    if (!this.stream) return;
    const recorder = new MediaRecorder(this.stream, recorderOptions(this.bitrateMbps));
    const segment: Segment = { recorder, chunks: [], startedAt: performance.now() };
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) segment.chunks.push(event.data);
    });
    recorder.start(1000);
    this.segments.push(segment);
  }

  private halt(segment: Segment): void {
    if (segment.recorder.state !== 'inactive') segment.recorder.stop();
    segment.chunks = [];
  }
}
