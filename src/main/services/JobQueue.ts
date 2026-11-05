import { randomUUID } from 'node:crypto';
import type { Job, JobKind, JobProgress } from '../../shared/types';

export interface JobHandle {
  /** Løses med resultat, eller avvises med en feil som kan vises til brukeren. */
  done: Promise<{ outputPath?: string; note?: string }>;
  stop(): void;
}

export interface JobRunner<P> {
  start(payload: P, job: Readonly<Job>, onProgress: (p: JobProgress) => void): JobHandle;
  /** Rydder delfiler etter avbrutt jobb. Kalles ikke ved pause. */
  cleanup?(job: Readonly<Job>): Promise<void>;
}

const EMPTY: JobProgress = { percent: null, speedBps: null, etaSeconds: null, totalBytes: null };

interface Entry { job: Job; kind: JobKind; payload: unknown; handle?: JobHandle; intent?: 'pause' | 'cancel'; }

export class JobQueue {
  private entries = new Map<string, Entry>();
  private runners: Partial<Record<JobKind, JobRunner<any>>> = {};
  private limits: Record<JobKind, number> = { download: 3, export: 1, join: 1 };

  constructor(private readonly onChange: (jobs: Job[]) => void) {}

  register<P>(kind: JobKind, runner: JobRunner<P>): void { this.runners[kind] = runner; }

  setLimit(kind: JobKind, limit: number): void {
    this.limits[kind] = Math.max(1, Math.floor(limit));
    this.pump();
  }

  list(): Job[] { return [...this.entries.values()].map((e) => ({ ...e.job })).reverse(); }

  enqueue<P>(kind: JobKind, title: string, payload: P): string {
    const id = randomUUID();
    const job: Job = { id, kind, title, status: 'queued', progress: { ...EMPTY }, createdAt: Date.now() };
    this.entries.set(id, { job, kind, payload });
    this.changed();
    this.pump();
    return id;
  }

  pause(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.job.status === 'queued') { e.job.status = 'paused'; this.changed(); return; }
    if (e.job.status === 'running' && e.kind === 'download') { e.intent = 'pause'; e.handle?.stop(); }
  }

  resume(id: string): void {
    const e = this.entries.get(id);
    if (e?.job.status !== 'paused') return;
    e.job.status = 'queued';
    this.changed();
    this.pump();
  }

  cancel(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.job.status === 'running') { e.intent = 'cancel'; e.handle?.stop(); return; }
    if (e.job.status === 'queued' || e.job.status === 'paused') {
      e.job.status = 'canceled';
      this.changed();
      void this.runners[e.kind]?.cleanup?.(e.job);
    }
  }

  retry(id: string): void {
    const e = this.entries.get(id);
    if (e?.job.status !== 'failed' && e?.job.status !== 'canceled') return;
    Object.assign(e.job, { status: 'queued', progress: { ...EMPTY }, error: undefined, note: undefined });
    this.changed();
    this.pump();
  }

  remove(id: string): void {
    const e = this.entries.get(id);
    if (!e || e.job.status === 'running' || e.job.status === 'queued') return;
    this.entries.delete(id);
    if (e.job.status === 'paused' || e.job.status === 'failed') void this.runners[e.kind]?.cleanup?.(e.job);
    this.changed();
  }

  stopAll(): void { for (const e of this.entries.values()) e.handle?.stop(); }

  private changed(): void { this.onChange(this.list()); }

  private pump(): void {
    for (const e of this.entries.values()) {
      if (e.job.status !== 'queued') continue;
      const running = [...this.entries.values()].filter((o) => o.kind === e.kind && o.job.status === 'running').length;
      if (running < this.limits[e.kind]) this.run(e);
    }
  }

  private run(e: Entry): void {
    const runner = this.runners[e.kind];
    if (!runner) throw new Error(`No runner for ${e.kind}`);
    e.job.status = 'running';
    e.intent = undefined;
    this.changed();
    let last = 0;
    let handle: JobHandle;
    try {
      handle = runner.start(e.payload, e.job, (progress) => {
        e.job.progress = progress;
        const now = Date.now();
        if (now - last > 200) { last = now; this.changed(); }
      });
    } catch (err) {
      this.finishFailed(e, err);
      return;
    }
    e.handle = handle;
    handle.done.then((result) => {
      if (e.intent) return this.finishStopped(e);
      e.job.status = 'done';
      e.job.outputPath = result.outputPath;
      e.job.note = result.note;
      e.job.progress = { ...EMPTY, percent: 100, totalBytes: e.job.progress.totalBytes };
      e.handle = undefined;
      this.changed();
      this.pump();
    }, (err) => {
      if (e.intent) return this.finishStopped(e);
      this.finishFailed(e, err);
    });
  }

  private finishStopped(e: Entry): void {
    e.handle = undefined;
    e.job.status = e.intent === 'pause' ? 'paused' : 'canceled';
    e.job.progress = { ...e.job.progress, speedBps: null, etaSeconds: null };
    if (e.intent === 'cancel') e.job.progress = { ...EMPTY };
    const wasCancel = e.intent === 'cancel';
    e.intent = undefined;
    this.changed();
    if (wasCancel) void this.runners[e.kind]?.cleanup?.(e.job);
    this.pump();
  }

  private finishFailed(e: Entry, err: unknown): void {
    e.handle = undefined;
    e.job.status = 'failed';
    e.job.error = err instanceof Error ? err.message : String(err);
    e.job.progress = { ...e.job.progress, speedBps: null, etaSeconds: null };
    this.changed();
    this.pump();
  }
}
