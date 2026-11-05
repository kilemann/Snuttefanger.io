import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ClipProject } from '../../shared/types';

const MAX_PROJECTS = 300;

interface Stored extends ClipProject { size: number; mtimeMs: number; savedAt: number }

/** Husker klippene per fil. Endres filen (størrelse eller tid), brukes de ikke. */
export class ProjectStore {
  private readonly file: string;
  private data: Record<string, Stored> = {};

  constructor(dir: string) {
    this.file = join(dir, 'projects.json');
    try { this.data = JSON.parse(readFileSync(this.file, 'utf8')); } catch { this.data = {}; }
  }

  async load(path: string): Promise<ClipProject | null> {
    const p = this.data[path];
    if (!p) return null;
    try {
      const s = await stat(path);
      if (s.size !== p.size || Math.abs(s.mtimeMs - p.mtimeMs) > 1) return null;
    } catch { return null; }
    return { count: p.count, active: p.active, clips: p.clips };
  }

  async save(path: string, project: ClipProject): Promise<void> {
    const s = await stat(path);
    const clips = project.clips.slice(0, 10).filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end));
    this.data[path] = { ...project, clips, size: s.size, mtimeMs: s.mtimeMs, savedAt: Date.now() };
    const keys = Object.keys(this.data).sort((a, b) => this.data[b].savedAt - this.data[a].savedAt);
    for (const k of keys.slice(MAX_PROJECTS)) delete this.data[k];
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
    renameSync(`${this.file}.tmp`, this.file);
  }

  async forget(path: string): Promise<void> {
    if (!this.data[path]) return;
    delete this.data[path];
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
    renameSync(`${this.file}.tmp`, this.file);
  }
}
