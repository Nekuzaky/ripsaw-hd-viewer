import type { HealthStats } from '../health/StreamHealth';
import { t } from '../i18n';
import { h } from './dom';

export class StatsOverlay {
  private readonly root = h('div', { className: 'stats-overlay hidden' });

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  update(stats: HealthStats, audioLatencyMs: number, limitedRange: boolean): void {
    if (this.root.classList.contains('hidden')) return;
    const fpsClass =
      stats.fps >= stats.targetFps * 0.95 ? 'good' : stats.fps >= stats.targetFps * 0.8 ? 'warn' : 'bad';
    const rows: [string, string, string?][] = [
      [t('stats.resolution'), `${stats.width}×${stats.height}`],
      [t('stats.fps'), `${stats.fps} / ${stats.targetFps}`, fpsClass],
      [t('stats.dropped'), String(stats.droppedFrames)],
      [
        t('stats.glitches'),
        `${Math.round(stats.corruptedRatio * 100)} %`,
        stats.corruptedRatio > 0.02 ? 'bad' : 'good',
      ],
      [t('stats.latency'), t('unit.ms', { value: audioLatencyMs })],
      [t('stats.range'), limitedRange ? '16-235' : '0-255'],
    ];
    this.root.replaceChildren(
      ...rows.map(([label, value, tone]) =>
        h('div', { className: 'stats-row' }, h('span', {}, label), h('b', { className: tone ?? '' }, value)),
      ),
    );
  }
}
