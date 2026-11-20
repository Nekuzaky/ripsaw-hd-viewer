import { t } from '../i18n';
import type { CaptureStatus } from '../capture/CaptureSource';
import { h, icon } from './dom';
import { Icons } from './icons';

export type ScreenState = CaptureStatus | { kind: 'no-signal' };

export class StatusScreen {
  private readonly root = h('div', { className: 'status-screen' });
  private state: ScreenState = { kind: 'searching' };

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);
    this.render();
  }

  set(state: ScreenState): void {
    this.state = state;
    this.render();
  }

  render(): void {
    const state = this.state;
    if (state.kind === 'live') {
      this.root.classList.add('hidden');
      return;
    }
    this.root.classList.remove('hidden');
    const view = this.describe(state);
    this.root.replaceChildren(
      h(
        'div',
        { className: 'status-card' },
        h('div', { className: `status-icon ${view.spin ? 'spin' : ''}` }, icon(view.icon)),
        h('h1', {}, view.title),
        h('p', {}, view.hint),
      ),
    );
  }

  private describe(state: ScreenState): { icon: string; title: string; hint: string; spin?: boolean } {
    switch (state.kind) {
      case 'searching':
        return {
          icon: Icons.replay,
          title: t('status.searching.title'),
          hint: t('status.searching.hint'),
          spin: true,
        };
      case 'not-found':
        return { icon: Icons.plug, title: t('status.notFound.title'), hint: t('status.notFound.hint') };
      case 'busy':
        return { icon: Icons.busy, title: t('status.busy.title'), hint: t('status.busy.hint') };
      case 'permission-denied':
        return { icon: Icons.busy, title: t('status.denied.title'), hint: t('status.denied.hint') };
      case 'no-signal':
        return { icon: Icons.signal, title: t('status.noSignal.title'), hint: t('status.noSignal.hint') };
      case 'error':
        return { icon: Icons.busy, title: t('status.error.title'), hint: state.message };
      default:
        return { icon: Icons.signal, title: '', hint: '' };
    }
  }
}
