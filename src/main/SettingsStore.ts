import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_SETTINGS, mergeSettings, type DeepPartial, type Settings } from '@shared/settings';

export class SettingsStore {
  private readonly file = join(app.getPath('userData'), 'settings.json');
  private current: Settings;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.current = this.load();
  }

  get(): Settings {
    return structuredClone(this.current);
  }

  update(patch: DeepPartial<Settings>): Settings {
    this.current = mergeSettings(this.current, patch);
    this.scheduleWrite();
    return this.get();
  }

  flush(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    this.write();
  }

  private load(): Settings {
    try {
      if (!existsSync(this.file)) return structuredClone(DEFAULT_SETTINGS);
      return mergeSettings(structuredClone(DEFAULT_SETTINGS), JSON.parse(readFileSync(this.file, 'utf8')));
    } catch (error) {
      console.error('Failed to read settings, using defaults', error);
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flush(), 300);
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.current, null, 2));
      renameSync(tmp, this.file);
    } catch (error) {
      console.error('Failed to write settings', error);
    }
  }
}
