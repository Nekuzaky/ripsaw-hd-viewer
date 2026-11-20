import { mergeSettings, type DeepPartial, type Settings } from '@shared/settings';
import { Emitter } from './Emitter';

interface SettingsEvents {
  change: { settings: Settings; patch: DeepPartial<Settings> };
}

export class SettingsService extends Emitter<SettingsEvents> {
  private constructor(private current: Settings) {
    super();
  }

  static async load(): Promise<SettingsService> {
    return new SettingsService(await window.ripview.settings.get());
  }

  get value(): Settings {
    return this.current;
  }

  update(patch: DeepPartial<Settings>): void {
    this.current = mergeSettings(this.current, patch);
    this.emit('change', { settings: this.current, patch });
    void window.ripview.settings.set(patch);
  }
}
