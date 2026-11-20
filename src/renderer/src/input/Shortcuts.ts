import type { AppActions } from '../app/actions';
import type { TranslationKey } from '../i18n';

export interface ShortcutDefinition {
  keys: string[];
  label: TranslationKey;
  run: (actions: AppActions) => void;
}

export const SHORTCUTS: ShortcutDefinition[] = [
  { keys: ['F', 'F11'], label: 'shortcut.fullscreen', run: (a) => a.toggleFullscreen() },
  { keys: ['Escape'], label: 'shortcut.exitFullscreen', run: (a) => a.exitFullscreen() },
  { keys: ['M'], label: 'shortcut.mute', run: (a) => a.toggleMute() },
  { keys: ['ArrowUp'], label: 'shortcut.volume', run: (a) => a.changeVolume(0.05) },
  { keys: ['ArrowDown'], label: 'shortcut.volume', run: (a) => a.changeVolume(-0.05) },
  { keys: ['S', 'F12'], label: 'shortcut.screenshot', run: (a) => a.screenshot() },
  { keys: ['B'], label: 'shortcut.replay', run: (a) => a.saveReplay() },
  { keys: ['R'], label: 'shortcut.record', run: (a) => a.toggleRecording() },
  { keys: ['P'], label: 'shortcut.mini', run: (a) => a.toggleMiniPlayer() },
  { keys: ['Z'], label: 'shortcut.scale', run: (a) => a.cycleScaleMode() },
  { keys: ['I'], label: 'shortcut.stats', run: (a) => a.toggleStats() },
  { keys: ['Tab'], label: 'shortcut.settings', run: (a) => a.toggleSettings() },
  { keys: ['F5'], label: 'shortcut.reconnect', run: (a) => a.reconnect() },
];

export function bindShortcuts(actions: AppActions): void {
  const map = new Map<string, ShortcutDefinition>();
  for (const shortcut of SHORTCUTS) for (const key of shortcut.keys) map.set(key.toLowerCase(), shortcut);

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    const typing =
      target instanceof Element &&
      target.matches('input:not([type=range]):not([type=checkbox]), select, textarea');
    if (typing && event.key !== 'Escape' && event.key !== 'Tab') return;
    const shortcut = map.get(event.key.toLowerCase());
    if (!shortcut) return;
    event.preventDefault();
    shortcut.run(actions);
  });
}

export function displayKeys(label: TranslationKey): string[] {
  return SHORTCUTS.filter((shortcut) => shortcut.label === label).flatMap((shortcut) =>
    shortcut.keys.map((key) => KEY_NAMES[key] ?? key),
  );
}

const KEY_NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
};
