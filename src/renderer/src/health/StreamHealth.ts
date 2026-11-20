import { Emitter } from '../core/Emitter';

export interface HealthStats {
  width: number;
  height: number;
  fps: number;
  targetFps: number;
  droppedFrames: number;
  corruptedRatio: number;
  limitedRangeDetected: boolean;
  signalPresent: boolean;
}

interface HealthEvents {
  stats: HealthStats;
  degraded: { reason: 'low-fps' | 'corruption' };
  rangeDetected: boolean;
}

const SAMPLE_WIDTH = 64;
const SAMPLE_HEIGHT = 36;
const SAMPLE_EVERY = 6;
const DEGRADED_WINDOW_S = 6;
const CORRUPTION_THRESHOLD = 0.08;

export class StreamHealth extends Emitter<HealthEvents> {
  private readonly sampler = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private video: HTMLVideoElement | null = null;
  private targetFps = 60;
  private frameTimes: number[] = [];
  private sampledFrames = 0;
  private corruptedFrames = 0;
  private frameCounter = 0;
  private lowFpsSeconds = 0;
  private corruptSeconds = 0;
  private lumaMin = 255;
  private lumaMax = 0;
  private lumaSamples = 0;
  private limitedRange = false;
  private signal = false;
  private timer: number | null = null;
  private warmupUntil = 0;

  constructor() {
    super();
    this.sampler.width = SAMPLE_WIDTH;
    this.sampler.height = SAMPLE_HEIGHT;
    this.context = this.sampler.getContext('2d', { willReadFrequently: true })!;
  }

  attach(video: HTMLVideoElement | null, targetFps: number): void {
    this.video = video;
    this.targetFps = targetFps;
    this.reset();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = video ? window.setInterval(() => this.report(), 1000) : null;
  }

  onFrame(now: number): void {
    this.frameTimes.push(now);
    if (++this.frameCounter % SAMPLE_EVERY === 0) this.sample();
  }

  private reset(): void {
    this.frameTimes = [];
    this.sampledFrames = 0;
    this.corruptedFrames = 0;
    this.lowFpsSeconds = 0;
    this.corruptSeconds = 0;
    this.lumaMin = 255;
    this.lumaMax = 0;
    this.lumaSamples = 0;
    this.signal = false;
    this.warmupUntil = performance.now() + 3000;
  }

  private sample(): void {
    const video = this.video;
    if (!video || !video.videoWidth) return;
    this.context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const { data } = this.context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);

    let green = 0;
    const bottomStart = (SAMPLE_HEIGHT - 4) * SAMPLE_WIDTH * 4;
    for (let i = bottomStart; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (g > 90 && r < 50 && b < 50) green++;
    }
    this.sampledFrames++;
    if (green > SAMPLE_WIDTH * 4 * 0.6) this.corruptedFrames++;

    let min = 255;
    let max = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luma < min) min = luma;
      if (luma > max) max = luma;
      sum += luma;
    }
    const mean = sum / (SAMPLE_WIDTH * SAMPLE_HEIGHT);
    this.signal = max - min > 6 || mean > 20;
    if (max - min > 60) {
      this.lumaMin = Math.min(this.lumaMin, min);
      this.lumaMax = Math.max(this.lumaMax, max);
      this.lumaSamples++;
    }
  }

  private report(): void {
    const video = this.video;
    if (!video) return;
    const now = performance.now();
    this.frameTimes = this.frameTimes.filter((time) => now - time <= 1000);
    const fps = this.frameTimes.length;
    const quality = video.getVideoPlaybackQuality();
    const corruptedRatio = this.sampledFrames ? this.corruptedFrames / this.sampledFrames : 0;
    this.sampledFrames = 0;
    this.corruptedFrames = 0;

    if (this.lumaSamples >= 40) {
      const limited = this.lumaMin >= 12 && this.lumaMax <= 240;
      if (limited !== this.limitedRange) {
        this.limitedRange = limited;
        this.emit('rangeDetected', limited);
      }
      this.lumaMin = 255;
      this.lumaMax = 0;
      this.lumaSamples = 0;
    }

    if (now > this.warmupUntil && this.signal) {
      this.lowFpsSeconds = fps < this.targetFps * 0.8 ? this.lowFpsSeconds + 1 : 0;
      this.corruptSeconds = corruptedRatio > CORRUPTION_THRESHOLD ? this.corruptSeconds + 1 : 0;
      if (this.corruptSeconds >= DEGRADED_WINDOW_S / 2) {
        this.corruptSeconds = 0;
        this.emit('degraded', { reason: 'corruption' });
      } else if (this.lowFpsSeconds >= DEGRADED_WINDOW_S) {
        this.lowFpsSeconds = 0;
        this.emit('degraded', { reason: 'low-fps' });
      }
    }

    this.emit('stats', {
      width: video.videoWidth,
      height: video.videoHeight,
      fps,
      targetFps: this.targetFps,
      droppedFrames: quality.droppedVideoFrames,
      corruptedRatio,
      limitedRangeDetected: this.limitedRange,
      signalPresent: this.signal,
    });
  }
}
