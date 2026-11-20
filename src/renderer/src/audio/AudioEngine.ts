import type { AudioSettings } from '@shared/settings';

type SinkCapableContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

const MAX_DELAY_S = 1;

export class AudioEngine {
  private readonly context: SinkCapableContext;
  private readonly delay: DelayNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly makeup: GainNode;
  private readonly bypass: GainNode;
  private readonly nightPath: GainNode;
  private readonly volume: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly recordTap: MediaStreamAudioDestinationNode;
  private source: MediaStreamAudioSourceNode | null = null;
  private readonly levelBuffer: Float32Array<ArrayBuffer>;
  private sinkId = '';

  constructor() {
    this.context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    const ctx = this.context;

    this.delay = ctx.createDelay(MAX_DELAY_S);
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -32;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.25;
    this.makeup = ctx.createGain();
    this.makeup.gain.value = 2.2;
    this.bypass = ctx.createGain();
    this.nightPath = ctx.createGain();
    this.volume = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.levelBuffer = new Float32Array(this.analyser.fftSize);
    this.recordTap = ctx.createMediaStreamDestination();

    this.delay.connect(this.bypass);
    this.delay.connect(this.compressor);
    this.compressor.connect(this.makeup);
    this.makeup.connect(this.nightPath);
    this.bypass.connect(this.volume);
    this.nightPath.connect(this.volume);
    this.volume.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.bypass.connect(this.recordTap);
    this.nightPath.connect(this.recordTap);

    document.addEventListener('pointerdown', () => void this.resume(), { capture: true });
  }

  get recordingStream(): MediaStream {
    return this.recordTap.stream;
  }

  get latencyMs(): number {
    return Math.round((this.context.baseLatency + (this.context.outputLatency || 0)) * 1000);
  }

  get supportsOutputSelection(): boolean {
    return typeof this.context.setSinkId === 'function';
  }

  attach(stream: MediaStream | null): void {
    this.source?.disconnect();
    this.source = null;
    if (stream && stream.getAudioTracks().length) {
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.delay);
    }
    void this.resume();
  }

  apply(settings: AudioSettings): void {
    const now = this.context.currentTime;
    const target = settings.muted ? 0 : settings.volume;
    this.volume.gain.setTargetAtTime(target, now, 0.015);
    this.bypass.gain.setTargetAtTime(settings.nightMode ? 0 : 1, now, 0.03);
    this.nightPath.gain.setTargetAtTime(settings.nightMode ? 1 : 0, now, 0.03);
    this.delay.delayTime.setTargetAtTime(
      Math.min(MAX_DELAY_S, Math.max(0, settings.syncOffsetMs / 1000)),
      now,
      0.02,
    );
    void this.setOutput(settings.outputDeviceId);
  }

  level(): number {
    this.analyser.getFloatTimeDomainData(this.levelBuffer);
    let peak = 0;
    for (const sample of this.levelBuffer) peak = Math.max(peak, Math.abs(sample));
    return peak;
  }

  private async setOutput(deviceId: string | null): Promise<void> {
    const id = deviceId && deviceId !== 'default' ? deviceId : '';
    if (!this.context.setSinkId || id === this.sinkId) return;
    try {
      await this.context.setSinkId(id);
      this.sinkId = id;
    } catch (error) {
      console.warn('Audio output unavailable, using system default', error);
    }
  }

  private async resume(): Promise<void> {
    if (this.context.state === 'suspended') await this.context.resume().catch(() => undefined);
  }
}
