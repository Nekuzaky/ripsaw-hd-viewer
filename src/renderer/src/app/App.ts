import type { UpdateStatus } from '@shared/ipc';
import type { DeepPartial, ScaleMode, Settings } from '@shared/settings';
import { AudioEngine } from '../audio/AudioEngine';
import { CaptureSource, type CaptureStatus } from '../capture/CaptureSource';
import { QUALITY_PROFILES, nextLowerProfile } from '../capture/qualityProfiles';
import type { SettingsService } from '../core/SettingsService';
import { StreamHealth } from '../health/StreamHealth';
import { setLocale, t } from '../i18n';
import { bindShortcuts } from '../input/Shortcuts';
import { composeStream } from '../record/codecs';
import { Recorder } from '../record/Recorder';
import { ReplayBuffer } from '../record/ReplayBuffer';
import { GpuRenderer } from '../render/GpuRenderer';
import { ControlBar } from '../ui/ControlBar';
import { h } from '../ui/dom';
import { SettingsPanel } from '../ui/SettingsPanel';
import { StatsOverlay } from '../ui/StatsOverlay';
import { StatusScreen } from '../ui/StatusScreen';
import { Toast } from '../ui/Toast';
import type { AppActions } from './actions';

const SCALE_MODES: ScaleMode[] = ['fit', 'fill', 'stretch'];
const NO_SIGNAL_SECONDS = 5;
const USB_HINT_COOLDOWN_MS = 60_000;

export class App implements AppActions {
  private readonly stage = h('main', { className: 'stage' });
  private readonly video = h('video', {
    className: 'source-video',
    autoplay: true,
    muted: true,
    playsinline: true,
  });
  private readonly capture = new CaptureSource();
  private readonly health = new StreamHealth();
  private readonly audio = new AudioEngine();
  private readonly recorder = new Recorder();
  private readonly replay = new ReplayBuffer();
  private readonly renderer: GpuRenderer;
  private readonly status: StatusScreen;
  private readonly controls: ControlBar;
  private readonly panel: SettingsPanel;
  private readonly stats: StatsOverlay;
  private readonly toast: Toast;
  private captureStatus: CaptureStatus = { kind: 'searching' };
  private silentSeconds = 0;
  private limitedRange = false;
  private detectedRange = false;
  private lastUsbHint = 0;
  private fullscreen = false;

  constructor(
    root: HTMLElement,
    private readonly settings: SettingsService,
  ) {
    this.video.muted = true;
    this.stage.appendChild(this.video);
    root.appendChild(this.stage);

    const s = settings.value;
    this.renderer = new GpuRenderer(this.stage, s.image);
    this.status = new StatusScreen(root);
    this.stats = new StatsOverlay(root);
    this.panel = new SettingsPanel(
      root,
      settings,
      () => this.toggleSettings(),
      () => void this.checkUpdates(),
    );
    this.controls = new ControlBar(root, this);
    this.toast = new Toast(root);

    this.wire();
    bindShortcuts(this);

    this.audio.apply(s.audio);
    this.controls.update(s);
    this.controls.relabel();
    this.stats.setVisible(s.ui.showStats);
    void window.ripview.power.keepAwake(s.ui.keepAwake);
    this.stage.addEventListener('dblclick', () => this.toggleFullscreen());
    window.ripview.window.onStateChanged((state) => {
      this.fullscreen = state.fullscreen;
      this.controls.updateWindow(state);
    });

    this.startCapture();
    this.tick();
  }

  toggleFullscreen(): void {
    void window.ripview.window.toggleFullscreen().then((state) => this.controls.updateWindow(state));
  }

  exitFullscreen(): void {
    if (this.panel.isOpen) this.panel.toggle(false);
    else if (this.fullscreen) void window.ripview.window.setFullscreen(false);
  }

  toggleMute(): void {
    const muted = !this.settings.value.audio.muted;
    this.settings.update({ audio: { muted } });
    this.toast.show(muted ? t('toast.muted') : t('toast.unmuted'));
  }

  changeVolume(delta: number): void {
    this.setVolume(this.settings.value.audio.volume + delta);
    this.toast.show(t('toast.volume', { value: Math.round(this.settings.value.audio.volume * 100) }));
  }

  setVolume(value: number): void {
    this.settings.update({
      audio: { volume: Math.round(Math.min(2, Math.max(0, value)) * 100) / 100, muted: false },
    });
  }

  screenshot(): void {
    void this.renderer.snapshot().then(async (blob) => {
      if (!blob) return this.toast.show(t('toast.noImage'));
      try {
        const saved = await window.ripview.media.saveScreenshot(await blob.arrayBuffer());
        this.notifySaved(t('toast.screenshot'), saved.path);
      } catch {
        this.toast.show(t('toast.saveFailed'), { tone: 'warning' });
      }
    });
  }

  saveReplay(): void {
    if (!this.settings.value.recording.replayEnabled) {
      this.toast.show(t('toast.replayDisabled'));
      return;
    }
    if (this.replay.bufferedSeconds < 3) {
      this.toast.show(t('toast.replayEmpty'));
      return;
    }
    void this.replay
      .save()
      .then((saved) =>
        saved ? this.notifySaved(t('toast.replay'), saved.path) : this.toast.show(t('toast.replayEmpty')),
      )
      .catch(() => this.toast.show(t('toast.saveFailed'), { tone: 'warning' }));
  }

  toggleRecording(): void {
    if (this.recorder.recording) {
      void this.recorder
        .stop()
        .then((saved) => saved && this.notifySaved(t('toast.recordStop'), saved.path))
        .catch(() => this.toast.show(t('toast.saveFailed'), { tone: 'warning' }));
      return;
    }
    const stream = this.capture.current;
    if (!stream) return this.toast.show(t('toast.noImage'));
    void this.recorder
      .start(composeStream(stream, this.audio.recordingStream), this.settings.value.recording.bitrateMbps)
      .then(() => this.toast.show(t('toast.recordStart'), { tone: 'success' }))
      .catch(() => this.toast.show(t('toast.saveFailed'), { tone: 'warning' }));
  }

  toggleMiniPlayer(): void {
    void window.ripview.window.toggleMiniPlayer().then((state) => this.controls.updateWindow(state));
  }

  toggleSettings(): void {
    this.panel.toggle();
    this.controls.wake();
  }

  cycleScaleMode(): void {
    const current = SCALE_MODES.indexOf(this.settings.value.image.scaleMode);
    const next = SCALE_MODES[(current + 1) % SCALE_MODES.length];
    this.settings.update({ image: { scaleMode: next } });
    this.toast.show(t(`settings.scale.${next}`));
  }

  toggleStats(): void {
    this.settings.update({ ui: { showStats: !this.settings.value.ui.showStats } });
  }

  reconnect(): void {
    this.startCapture();
  }

  private wire(): void {
    this.capture.on('status', (status) => {
      this.captureStatus = status;
      this.silentSeconds = 0;
      this.status.set(status);
    });
    this.capture.on('devices', (devices) => this.panel.setDevices(devices));
    this.capture.on('stream', (stream) => this.onStream(stream));

    this.renderer.onFrame((now, metadata) => this.health.onFrame(now, metadata));
    this.health.on('stats', (stats) => {
      this.stats.update(stats, this.audio.latencyMs, this.limitedRange);
      if (this.captureStatus.kind !== 'live') return;
      this.silentSeconds = stats.signalPresent && stats.fps > 0 ? 0 : this.silentSeconds + 1;
      this.status.set(this.silentSeconds >= NO_SIGNAL_SECONDS ? { kind: 'no-signal' } : this.captureStatus);
    });
    this.health.on('rangeDetected', (limited) => {
      this.detectedRange = limited;
      this.applyColorRange();
    });
    this.health.on('degraded', () => this.onDegraded());

    this.recorder.on('state', ({ recording }) => this.controls.updateRecording(recording, 0));
    this.recorder.on('error', () => this.toast.show(t('toast.saveFailed'), { tone: 'warning' }));

    this.settings.on('change', ({ settings, patch }) => this.onSettingsChange(settings, patch));
    window.ripview.updates.onStatus((status) => this.onUpdateStatus(status, false));
  }

  private startCapture(): void {
    const s = this.settings.value;
    void this.capture.start({
      videoDeviceId: s.capture.videoDeviceId,
      audioDeviceId: s.audio.inputDeviceId,
      quality: s.capture.quality,
    });
  }

  private onStream(stream: MediaStream | null): void {
    this.replay.stop();
    if (this.recorder.recording && !stream) void this.recorder.stop();
    this.video.srcObject = stream;
    this.audio.attach(stream);
    const fps = QUALITY_PROFILES[this.settings.value.capture.quality].fps;
    if (!stream) {
      this.renderer.attach(null);
      this.health.attach(null, fps);
      return;
    }
    void this.video.play().catch(() => undefined);
    this.renderer.attach(this.video);
    this.health.attach(this.video, Math.round(stream.getVideoTracks()[0]?.getSettings().frameRate ?? fps));
    this.startReplay();
  }

  private startReplay(): void {
    const stream = this.capture.current;
    const { replayEnabled, replaySeconds, bitrateMbps } = this.settings.value.recording;
    this.replay.stop();
    if (stream && replayEnabled) {
      this.replay.start(composeStream(stream, this.audio.recordingStream), replaySeconds, bitrateMbps);
    }
  }

  private onDegraded(): void {
    const { autoQuality, quality } = this.settings.value.capture;
    const lower = autoQuality ? nextLowerProfile(quality) : null;
    if (lower) {
      this.toast.show(t('toast.qualityDown', { quality: lower }), { tone: 'warning', ms: 4000 });
      this.settings.update({ capture: { quality: lower } });
    }
    if (Date.now() - this.lastUsbHint > USB_HINT_COOLDOWN_MS) {
      this.lastUsbHint = Date.now();
      this.toast.show(t('toast.usbHint'), { tone: 'warning', ms: 7000 });
    }
  }

  private applyColorRange(): void {
    const mode = this.settings.value.image.colorRange;
    this.limitedRange = mode === 'limited' || (mode === 'auto' && this.detectedRange);
    this.renderer.setLimitedRange(this.limitedRange);
  }

  private onSettingsChange(settings: Settings, patch: DeepPartial<Settings>): void {
    if (patch.image) {
      this.renderer.setImage(settings.image);
      if (patch.image.colorRange !== undefined) this.applyColorRange();
    }
    if (patch.audio) {
      this.audio.apply(settings.audio);
      this.controls.update(settings);
      if (patch.audio.inputDeviceId !== undefined) this.startCapture();
    }
    if (patch.capture && (patch.capture.quality !== undefined || patch.capture.videoDeviceId !== undefined)) {
      this.startCapture();
    }
    if (patch.recording && !patch.recording.directory) this.startReplay();
    if (patch.ui) {
      if (patch.ui.locale !== undefined) {
        setLocale(settings.ui.locale);
        this.controls.relabel();
        this.status.render();
        this.panel.render();
      }
      if (patch.ui.showStats !== undefined) this.stats.setVisible(settings.ui.showStats);
      if (patch.ui.keepAwake !== undefined) void window.ripview.power.keepAwake(settings.ui.keepAwake);
    }
  }

  private async checkUpdates(): Promise<void> {
    this.toast.show(t('toast.update.checking'));
    this.onUpdateStatus(await window.ripview.updates.check(), true);
  }

  private onUpdateStatus(status: UpdateStatus, manual: boolean): void {
    switch (status.state) {
      case 'ready':
        this.toast.show(t('toast.update.ready', { version: status.version }), {
          tone: 'success',
          ms: 15000,
          action: { label: t('toast.update.restart'), run: () => void window.ripview.updates.install() },
        });
        break;
      case 'downloading':
        if (manual || status.percent === 0) {
          this.toast.show(t('toast.update.downloading', { version: status.version }));
        }
        break;
      case 'up-to-date':
        if (manual) this.toast.show(t('toast.update.upToDate'), { tone: 'success' });
        break;
      case 'unsupported':
        if (manual) this.toast.show(t('toast.update.unsupported'));
        break;
      case 'error':
        if (manual) this.toast.show(t('toast.update.error'), { tone: 'warning' });
        break;
    }
  }

  private notifySaved(message: string, path: string): void {
    this.toast.show(message, {
      tone: 'success',
      action: { label: t('toast.open'), run: () => void window.ripview.media.showItem(path) },
    });
  }

  private tick(): void {
    const loop = (): void => {
      this.controls.updateLevel(this.audio.level() * 1.4);
      if (this.recorder.recording) this.controls.updateRecording(true, this.recorder.elapsedMs);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
