import { DEFAULT_IMAGE, type DeepPartial, type Settings } from '@shared/settings';
import type { DeviceLists } from '../capture/CaptureSource';
import { FALLBACK_CHAIN } from '../capture/qualityProfiles';
import type { SettingsService } from '../core/SettingsService';
import { t, type TranslationKey } from '../i18n';
import { SHORTCUTS, displayKeys } from '../input/Shortcuts';
import { h, icon } from './dom';
import { Icons } from './icons';

type Tab = 'capture' | 'image' | 'audio' | 'recording' | 'interface' | 'about';

const TABS: Tab[] = ['capture', 'image', 'audio', 'recording', 'interface', 'about'];

interface SliderOptions {
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onInput: (value: number) => void;
}

export class SettingsPanel {
  private readonly root = h('aside', { className: 'settings-panel', 'aria-hidden': 'true' });
  private tab: Tab = 'capture';
  private open = false;
  private devices: DeviceLists = { video: [], audioInput: [], audioOutput: [] };
  private version = '';

  constructor(
    parent: HTMLElement,
    private readonly settings: SettingsService,
    private readonly onClose: () => void,
  ) {
    parent.appendChild(this.root);
    void window.ripview.app.info().then((info) => {
      this.version = info.version;
      if (this.open && this.tab === 'about') this.render();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.root.classList.toggle('open', this.open);
    this.root.setAttribute('aria-hidden', String(!this.open));
    document.body.classList.toggle('settings-open', this.open);
    if (this.open) this.render();
  }

  setDevices(devices: DeviceLists): void {
    this.devices = devices;
    if (this.open) this.render();
  }

  render(): void {
    const scroll = this.root.querySelector('.settings-body')?.scrollTop ?? 0;
    this.root.replaceChildren(
      h(
        'header',
        { className: 'settings-header' },
        h('h2', {}, t('settings.title')),
        h(
          'button',
          { className: 'bar-button', 'aria-label': 'Close', onclick: () => this.onClose() },
          icon(Icons.close),
        ),
      ),
      h(
        'nav',
        { className: 'settings-tabs' },
        ...TABS.map((tab) =>
          h(
            'button',
            {
              className: `settings-tab ${tab === this.tab ? 'active' : ''}`,
              onclick: () => {
                this.tab = tab;
                this.render();
              },
            },
            t(`settings.${tab}` as TranslationKey),
          ),
        ),
      ),
      h('div', { className: 'settings-body' }, ...this.renderTab(this.settings.value)),
    );
    const body = this.root.querySelector('.settings-body');
    if (body) body.scrollTop = scroll;
  }

  private renderTab(s: Settings): HTMLElement[] {
    switch (this.tab) {
      case 'capture':
        return [
          this.row(
            'settings.videoDevice',
            this.select(
              this.devices.video.map((d) => [d.deviceId, d.label || d.deviceId]),
              s.capture.videoDeviceId ??
                this.devices.video.find((d) => /ripsaw/i.test(d.label))?.deviceId ??
                '',
              (value) => this.patch({ capture: { videoDeviceId: value } }),
            ),
          ),
          this.row(
            'settings.quality',
            this.select(
              FALLBACK_CHAIN.map((id) => [id, id.replace('p', 'p · ') + ' fps']),
              s.capture.quality,
              (value) => this.patch({ capture: { quality: value as Settings['capture']['quality'] } }),
            ),
          ),
          this.toggleRow('settings.autoQuality', s.capture.autoQuality, (value) =>
            this.patch({ capture: { autoQuality: value } }),
          ),
        ];
      case 'image':
        return [
          this.row(
            'settings.scaleMode',
            this.select(
              (['fit', 'fill', 'stretch'] as const).map((id) => [id, t(`settings.scale.${id}`)]),
              s.image.scaleMode,
              (value) => this.patch({ image: { scaleMode: value as Settings['image']['scaleMode'] } }),
            ),
          ),
          this.row(
            'settings.colorRange',
            this.select(
              (['auto', 'full', 'limited'] as const).map((id) => [id, t(`settings.range.${id}`)]),
              s.image.colorRange,
              (value) => this.patch({ image: { colorRange: value as Settings['image']['colorRange'] } }),
            ),
          ),
          this.sliderRow('settings.sharpness', {
            min: 0,
            max: 1,
            step: 0.05,
            value: s.image.sharpness,
            format: percent,
            onInput: (value) => this.patch({ image: { sharpness: value } }),
          }),
          this.sliderRow('settings.brightness', {
            min: -0.3,
            max: 0.3,
            step: 0.01,
            value: s.image.brightness,
            format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`,
            onInput: (value) => this.patch({ image: { brightness: value } }),
          }),
          this.sliderRow('settings.contrast', {
            min: 0.5,
            max: 1.5,
            step: 0.01,
            value: s.image.contrast,
            format: percent,
            onInput: (value) => this.patch({ image: { contrast: value } }),
          }),
          this.sliderRow('settings.saturation', {
            min: 0,
            max: 2,
            step: 0.01,
            value: s.image.saturation,
            format: percent,
            onInput: (value) => this.patch({ image: { saturation: value } }),
          }),
          this.sliderRow('settings.gamma', {
            min: 0.6,
            max: 1.6,
            step: 0.01,
            value: s.image.gamma,
            format: (v) => v.toFixed(2),
            onInput: (value) => this.patch({ image: { gamma: value } }),
          }),
          h(
            'button',
            {
              className: 'secondary-button',
              onclick: () => {
                this.patch({ image: DEFAULT_IMAGE });
                this.render();
              },
            },
            t('settings.resetImage'),
          ),
        ];
      case 'audio':
        return [
          this.row(
            'settings.audioInput',
            this.select(
              this.devices.audioInput.map((d) => [d.deviceId, d.label || d.deviceId]),
              s.audio.inputDeviceId ??
                this.devices.audioInput.find((d) => /ripsaw/i.test(d.label))?.deviceId ??
                '',
              (value) => this.patch({ audio: { inputDeviceId: value } }),
            ),
          ),
          this.row(
            'settings.audioOutput',
            this.select(
              this.devices.audioOutput.map((d) => [
                d.deviceId,
                d.deviceId === 'default' ? t('settings.systemDefault') : d.label || d.deviceId,
              ]),
              s.audio.outputDeviceId ?? 'default',
              (value) => this.patch({ audio: { outputDeviceId: value } }),
            ),
          ),
          this.sliderRow('settings.volume', {
            min: 0,
            max: 2,
            step: 0.01,
            value: s.audio.volume,
            format: percent,
            onInput: (value) => this.patch({ audio: { volume: value, muted: false } }),
          }),
          this.toggleRow('settings.nightMode', s.audio.nightMode, (value) =>
            this.patch({ audio: { nightMode: value } }),
          ),
          this.sliderRow('settings.syncOffset', {
            min: 0,
            max: 500,
            step: 5,
            value: s.audio.syncOffsetMs,
            format: (v) => t('unit.ms', { value: v }),
            onInput: (value) => this.patch({ audio: { syncOffsetMs: value } }),
          }),
        ];
      case 'recording':
        return [
          this.sliderRow('settings.bitrate', {
            min: 4,
            max: 50,
            step: 1,
            value: s.recording.bitrateMbps,
            format: (v) => t('unit.mbps', { value: v }),
            onInput: (value) => this.patch({ recording: { bitrateMbps: value } }),
          }),
          this.toggleRow('settings.replayEnabled', s.recording.replayEnabled, (value) =>
            this.patch({ recording: { replayEnabled: value } }),
          ),
          this.sliderRow('settings.replaySeconds', {
            min: 10,
            max: 120,
            step: 5,
            value: s.recording.replaySeconds,
            format: (v) => t('unit.seconds', { value: v }),
            onInput: (value) => this.patch({ recording: { replaySeconds: value } }),
          }),
          h(
            'button',
            { className: 'secondary-button', onclick: () => void window.ripview.media.openFolder() },
            icon(Icons.folder),
            t('settings.openFolder'),
          ),
        ];
      case 'interface':
        return [
          this.row(
            'settings.language',
            this.select(
              [
                ['auto', t('settings.language.auto')],
                ['fr', 'Français'],
                ['en', 'English'],
              ],
              s.ui.locale,
              (value) => this.patch({ ui: { locale: value as Settings['ui']['locale'] } }),
            ),
          ),
          this.toggleRow('settings.showStats', s.ui.showStats, (value) =>
            this.patch({ ui: { showStats: value } }),
          ),
          this.toggleRow('settings.startFullscreen', s.ui.startFullscreen, (value) =>
            this.patch({ ui: { startFullscreen: value } }),
          ),
          this.toggleRow('settings.keepAwake', s.ui.keepAwake, (value) =>
            this.patch({ ui: { keepAwake: value } }),
          ),
        ];
      case 'about':
        return [
          h(
            'p',
            { className: 'about-title' },
            'RipView',
            h('span', {}, t('settings.version', { version: this.version })),
          ),
          h('h3', {}, t('settings.shortcuts')),
          h(
            'dl',
            { className: 'shortcut-list' },
            ...[...new Set(SHORTCUTS.map((shortcut) => shortcut.label))].flatMap((label) => [
              h('dt', {}, ...displayKeys(label).map((key) => h('kbd', {}, key))),
              h('dd', {}, t(label)),
            ]),
          ),
          h(
            'a',
            { className: 'link', href: 'https://github.com/Nekuzaky/ripsaw-hd-viewer', target: '_blank' },
            'github.com/Nekuzaky/ripsaw-hd-viewer',
          ),
        ];
    }
  }

  private patch(patch: DeepPartial<Settings>): void {
    this.settings.update(patch);
  }

  private row(label: TranslationKey, control: HTMLElement): HTMLElement {
    return h(
      'label',
      { className: 'setting-row' },
      h('span', { className: 'setting-label' }, t(label)),
      control,
    );
  }

  private toggleRow(
    label: TranslationKey,
    checked: boolean,
    onChange: (value: boolean) => void,
  ): HTMLElement {
    const input = h('input', { type: 'checkbox', className: 'switch', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return h(
      'label',
      { className: 'setting-row toggle' },
      h('span', { className: 'setting-label' }, t(label)),
      input,
    );
  }

  private sliderRow(label: TranslationKey, options: SliderOptions): HTMLElement {
    const output = h('output', {}, options.format(options.value));
    const input = h('input', {
      type: 'range',
      min: options.min,
      max: options.max,
      step: options.step,
      value: options.value,
    });
    input.addEventListener('input', () => {
      const value = Number(input.value);
      output.textContent = options.format(value);
      options.onInput(value);
    });
    return h(
      'label',
      { className: 'setting-row slider' },
      h('span', { className: 'setting-label' }, t(label), output),
      input,
    );
  }

  private select(
    options: [string, string][],
    value: string,
    onChange: (value: string) => void,
  ): HTMLSelectElement {
    const known = options.some(([id]) => id === value);
    const select = h(
      'select',
      {},
      known ? null : h('option', { value: '', selected: true, disabled: true }, '—'),
      ...options.map(([id, text]) => h('option', { value: id, selected: id === value }, text)),
    );
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }
}

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}
