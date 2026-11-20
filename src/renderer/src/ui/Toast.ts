import { h } from './dom';

interface ToastAction {
  label: string;
  run: () => void;
}

export class Toast {
  private readonly root = h('div', { className: 'toasts', role: 'status', 'aria-live': 'polite' });

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);
  }

  show(
    message: string,
    options: { tone?: 'info' | 'success' | 'warning'; action?: ToastAction; ms?: number } = {},
  ): void {
    const action = options.action;
    const item = h(
      'div',
      { className: `toast toast-${options.tone ?? 'info'}` },
      h('span', {}, message),
      action ? h('button', { className: 'toast-action', onclick: () => action.run() }, action.label) : null,
    );
    this.root.appendChild(item);
    while (this.root.children.length > 3) this.root.firstElementChild?.remove();
    requestAnimationFrame(() => item.classList.add('visible'));
    window.setTimeout(
      () => {
        item.classList.remove('visible');
        window.setTimeout(() => item.remove(), 250);
      },
      options.ms ?? (action ? 4500 : 1800),
    );
  }
}
