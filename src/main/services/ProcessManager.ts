import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

export interface ProcessResult { code: number | null; stdout: string; stderr: string; stopped: boolean; }
export interface RunningProcess { result: Promise<ProcessResult>; stop(): void; }

export interface RunOptions {
  onStdoutLine?: (line: string) => void;
  /** Rå bytes fra stdout, for eksempel lydsampler. Da tolkes ikke stdout som tekst. */
  onStdoutData?: (chunk: Buffer) => void;
  onStderrLine?: (line: string) => void;
  keepOutput?: boolean;
  timeoutMs?: number;
}

const active = new Set<ChildProcess>();
const STDERR_LIMIT = 16_000;

/** Stopper hele prosesstreet. yt-dlp.exe og ffmpeg kan ha barneprosesser. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    if (r.status !== 0) child.kill();
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* allerede borte */ }
    }
  }, 3000).unref();
}

function lineSplitter(onLine?: (line: string) => void) {
  let rest = '';
  return {
    push(text: string) {
      if (!onLine) return;
      const parts = (rest + text).split(/\r\n|\r|\n/);
      rest = parts.pop() ?? '';
      for (const part of parts) if (part) onLine(part);
    },
    flush() { if (onLine && rest) onLine(rest); rest = ''; },
  };
}

export function runProcess(command: string, args: string[], options: RunOptions = {}): RunningProcess {
  // Argumenter sendes som liste uten shell, så URL-er og filnavn tolkes aldri av et skall.
  const child = spawn(command, args, {
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  active.add(child);
  let stopped = false;
  const stop = () => { stopped = true; killTree(child); };
  const timer = options.timeoutMs ? setTimeout(stop, options.timeoutMs) : null;

  const result = new Promise<ProcessResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const out = lineSplitter(options.onStdoutLine);
    const err = lineSplitter(options.onStderrLine);
    if (options.onStdoutData) child.stdout!.on('data', options.onStdoutData);
    else child.stdout!.setEncoding('utf8').on('data', (t: string) => { if (options.keepOutput) stdout += t; out.push(t); });
    child.stderr!.setEncoding('utf8').on('data', (t: string) => {
      stderr = (stderr + t).slice(-STDERR_LIMIT);
      err.push(t);
    });
    child.on('error', (e) => { active.delete(child); if (timer) clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      active.delete(child);
      if (timer) clearTimeout(timer);
      out.flush(); err.flush();
      resolve({ code, stdout, stderr, stopped });
    });
  });
  return { result, stop };
}

export function stopAllProcesses(): void {
  for (const child of active) killTree(child);
}
