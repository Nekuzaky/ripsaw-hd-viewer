import { app, shell } from 'electron';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MediaKind, SavedMedia } from '@shared/ipc';
import type { SettingsStore } from './SettingsStore';

const SAFE_EXTENSIONS = new Set(['png', 'mp4', 'webm']);
const PREFIXES: Record<MediaKind, string> = {
  screenshot: 'Screenshot',
  clip: 'Replay',
  recording: 'Recording',
};

interface OpenRecording {
  stream: WriteStream;
  path: string;
}

export class MediaStorage {
  private readonly recordings = new Map<string, OpenRecording>();

  constructor(private readonly settings: SettingsStore) {}

  async saveScreenshot(data: ArrayBuffer): Promise<SavedMedia> {
    const path = this.createPath('screenshot', 'png');
    await writeFile(path, Buffer.from(data));
    return { path, kind: 'screenshot' };
  }

  async saveClip(data: ArrayBuffer, extension: string): Promise<SavedMedia> {
    const path = this.createPath('clip', this.sanitize(extension));
    await writeFile(path, Buffer.from(data));
    return { path, kind: 'clip' };
  }

  openRecording(extension: string): string {
    const id = randomUUID();
    const path = this.createPath('recording', this.sanitize(extension));
    this.recordings.set(id, { stream: createWriteStream(path), path });
    return id;
  }

  writeRecording(id: string, chunk: ArrayBuffer): Promise<void> {
    const recording = this.recordings.get(id);
    if (!recording) return Promise.reject(new Error(`Unknown recording ${id}`));
    return new Promise((done, fail) => {
      recording.stream.write(Buffer.from(chunk), (error) => (error ? fail(error) : done()));
    });
  }

  closeRecording(id: string): Promise<SavedMedia> {
    const recording = this.recordings.get(id);
    if (!recording) return Promise.reject(new Error(`Unknown recording ${id}`));
    this.recordings.delete(id);
    return new Promise((done) => {
      recording.stream.end(() => done({ path: recording.path, kind: 'recording' }));
    });
  }

  closeAll(): void {
    for (const recording of this.recordings.values()) recording.stream.end();
    this.recordings.clear();
  }

  async openFolder(): Promise<void> {
    await shell.openPath(this.ensureDirectory());
  }

  showItem(path: string): void {
    const directory = resolve(this.ensureDirectory()) + sep;
    if (resolve(path).startsWith(directory)) shell.showItemInFolder(path);
  }

  private ensureDirectory(): string {
    const custom = this.settings.get().recording.directory;
    const directory = custom ?? join(app.getPath('videos'), 'RipView');
    mkdirSync(directory, { recursive: true });
    return directory;
  }

  private createPath(kind: MediaKind, extension: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    return join(this.ensureDirectory(), `RipView_${PREFIXES[kind]}_${stamp}.${extension}`);
  }

  private sanitize(extension: string): string {
    const clean = extension.replace(/^\./, '').toLowerCase();
    if (!SAFE_EXTENSIONS.has(clean)) throw new Error(`Unsupported extension ${extension}`);
    return clean;
  }
}
