import type { WindowState } from '@shared/ipc';
import type { Settings } from '@shared/settings';
import type { AppActions } from '../app/actions';
import { t, type TranslationKey } from '../i18n';
import { h, icon } from './dom';
import { Icons } from './icons';

const IDLE_MS = 2200;

export class ControlBar {
  private readonly root = h('div', { className: 'control-bar' });
  private readonly muteButton: HTMLButtonElement;
  private readonly volumeSlider: HTMLInputElement;
  private readonly recordButton: HTMLButtonElement;
  private readonly recordTime = h('span', { className: 'record-time' });
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly meter = h('div', { className: 'meter-fill' });
  private idleTimer: number | null = null;
  private pinned = false;

  constructor(parent: HTMLElement, actions: AppActions) {
    this.muteButton = this.button('toolbar.mute', Icons.volume, () => actions.toggleMute());
    this.volumeSlider = h('input', {
      type: 'range',
      min: 0,
      max: 200,
      step: 1,
      className: 'volume-slider',
      oninput: () => actions.setVolume(Number(this.volumeSlider.value) / 100),
    });
    this.recordButton = this.button('toolbar.record', Icons.record, () => actions.toggleRecording());
    this.recordButton.classList.add('record-button');
    this.fullscreenButton = this.button('toolbar.fullscreen', Icons.fullscreen, () =>
      actions.toggleFullscreen(),
    );

    this.root.append(
      h(
        'div',
        { className: 'bar-group' },
        this.muteButton,
        this.volumeSlider,
        h('div', { className: 'meter' }, this.meter),
      ),
      h(
        'div',
        { className: 'bar-group' },
        this.button('toolbar.screenshot', Icons.camera, () => actions.screenshot()),
        this.button('toolbar.replay', Icons.replay, () => actions.saveReplay()),
        this.recordButton,
        this.recordTime,
      ),
      h(
        'div',
        { className: 'bar-group' },
        this.button('toolbar.mini', Icons.mini, () => actions.toggleMiniPlayer()),
        this.button('toolbar.settings', Icons.settings, () => actions.toggleSettings()),
        this.fullscreenButton,
      ),
    );
    parent.appendChild(this.root);

    this.root.addEventListener('pointerenter', () => (this.pinned = true));
    this.root.addEventListener('pointerleave', () => {
      this.pinned = false;
      this.wake();
    });
    window.addEventListener('pointermove', () => this.wake());
    this.wake();
  }

  wake(): void {
    document.body.classList.remove('idle');
    this.root.classList.add('visible');
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (this.pinned || document.body.classList.contains('settings-open')) return;
      this.root.classList.remove('visible');
      document.body.classList.add('idle');
    }, IDLE_MS);
  }

  update(settings: Settings): void {
    const muted = settings.audio.muted || settings.audio.volume === 0;
    this.muteButton.querySelector('.icon')!.innerHTML = muted ? Icons.muted : Icons.volume;
    if (document.activeElement !== this.volumeSlider) {
      this.volumeSlider.value = String(Math.round(settings.audio.volume * 100));
    }
    this.volumeSlider.style.setProperty('--fill', `${(settings.audio.volume / 2) * 100}%`);
  }

  updateWindow(state: WindowState): void {
    this.fullscreenButton.querySelector('.icon')!.innerHTML = state.fullscreen
      ? Icons.exitFullscreen
      : Icons.fullscreen;
    document.body.classList.toggle('mini-player', state.miniPlayer);
  }

  updateRecording(recording: boolean, elapsedMs: number): void {
    this.recordButton.classList.toggle('active', recording);
    this.recordButton.querySelector('.icon')!.innerHTML = recording ? Icons.stop : Icons.record;
    this.recordTime.textContent = recording ? formatDuration(elapsedMs) : '';
  }

  updateLevel(level: number): void {
    this.meter.style.transform = `scaleY(${Math.min(1, level)})`;
  }

  relabel(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-label]')) {
      const label = t(button.dataset.label as TranslationKey);
      button.title = label;
      button.setAttribute('aria-label', label);
    }
  }

  private button(label: TranslationKey, svg: string, run: () => void): HTMLButtonElement {
    const button = h('button', { className: 'bar-button', 'data-label': label, onclick: run }, icon(svg));
    button.title = t(label);
    button.setAttribute('aria-label', t(label));
    return button;
  }
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
