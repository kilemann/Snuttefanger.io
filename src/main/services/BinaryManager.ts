import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { InstallState, Settings, ToolName, ToolStatus } from '../../shared/types';
import { runProcess } from './ProcessManager';

export interface Asset {
  url: string;
  /** Beregner forventet SHA-256 ut fra sjekksumfilen utgiveren publiserer. */
  checksumUrl: string;
  checksumEntry: string | null;
  archive: 'none' | 'zip' | 'tar';
  provides: ToolName[];
}

const YTDLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const FFMPEG = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest';
const DENO = 'https://github.com/denoland/deno/releases/latest/download';

export function assetsFor(platform: NodeJS.Platform): Asset[] {
  if (platform === 'win32') {
    return [
      { url: `${YTDLP}/yt-dlp.exe`, checksumUrl: `${YTDLP}/SHA2-256SUMS`, checksumEntry: 'yt-dlp.exe', archive: 'none', provides: ['ytDlp'] },
      { url: `${FFMPEG}/ffmpeg-master-latest-win64-gpl.zip`, checksumUrl: `${FFMPEG}/checksums.sha256`, checksumEntry: 'ffmpeg-master-latest-win64-gpl.zip', archive: 'zip', provides: ['ffmpeg', 'ffprobe'] },
      { url: `${DENO}/deno-x86_64-pc-windows-msvc.zip`, checksumUrl: `${DENO}/deno-x86_64-pc-windows-msvc.zip.sha256sum`, checksumEntry: null, archive: 'zip', provides: ['deno'] },
    ];
  }
  if (platform === 'linux') {
    return [
      { url: `${YTDLP}/yt-dlp_linux`, checksumUrl: `${YTDLP}/SHA2-256SUMS`, checksumEntry: 'yt-dlp_linux', archive: 'none', provides: ['ytDlp'] },
      { url: `${FFMPEG}/ffmpeg-master-latest-linux64-gpl.tar.xz`, checksumUrl: `${FFMPEG}/checksums.sha256`, checksumEntry: 'ffmpeg-master-latest-linux64-gpl.tar.xz', archive: 'tar', provides: ['ffmpeg', 'ffprobe'] },
      { url: `${DENO}/deno-x86_64-unknown-linux-gnu.zip`, checksumUrl: `${DENO}/deno-x86_64-unknown-linux-gnu.zip.sha256sum`, checksumEntry: null, archive: 'zip', provides: ['deno'] },
    ];
  }
  return [];
}

/** Støtter både `hash  filnavn`, `hash *filnavn` og PowerShell-formatet Deno bruker på Windows. */
export function parseChecksum(text: string, entry: string | null): string | null {
  if (entry) {
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
      if (m && m[2].trim() === entry) return m[1].toLowerCase();
    }
    return null;
  }
  return text.match(/\b([a-f0-9]{64})\b/i)?.[1].toLowerCase() ?? null;
}

const FILE_NAMES: Record<ToolName, string> = { ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', deno: 'deno' };
const VERSION_ARG: Record<ToolName, string> = { ytDlp: '--version', ffmpeg: '-version', ffprobe: '-version', deno: '--version' };

export class BinaryManager {
  private readonly exe: string;

  constructor(
    private readonly binDir: string,
    private readonly getSettings: () => Settings,
    private readonly onInstall: (state: InstallState) => void = () => {},
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.exe = platform === 'win32' ? '.exe' : '';
  }

  private customPath(name: ToolName): string {
    const s = this.getSettings();
    return { ytDlp: s.ytDlpPath, ffmpeg: s.ffmpegPath, ffprobe: s.ffprobePath, deno: s.denoPath }[name];
  }

  private managedPath(name: ToolName): string { return join(this.binDir, FILE_NAMES[name] + this.exe); }

  private systemPath(name: ToolName): string | null {
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
      if (!dir) continue;
      const p = join(dir, FILE_NAMES[name] + this.exe);
      if (existsSync(p)) return p;
    }
    return null;
  }

  locate(name: ToolName): { path: string | null; source: ToolStatus['source'] } {
    const custom = this.customPath(name);
    if (custom && existsSync(custom)) return { path: custom, source: 'custom' };
    const managed = this.managedPath(name);
    if (existsSync(managed)) return { path: managed, source: 'managed' };
    const system = this.systemPath(name);
    if (system) return { path: system, source: 'system' };
    return { path: null, source: 'missing' };
  }

  /** Gir stien til et verktøy, eller en feil som forteller hva brukeren skal gjøre. */
  require(name: ToolName): string {
    const { path } = this.locate(name);
    if (!path) throw new Error(`${FILE_NAMES[name]} mangler. Installer verktøyene under Innstillinger.`);
    return path;
  }

  async status(): Promise<ToolStatus[]> {
    const names: ToolName[] = ['ytDlp', 'ffmpeg', 'ffprobe', 'deno'];
    return Promise.all(names.map(async (name) => {
      const { path, source } = this.locate(name);
      if (!path) return { name, path, source, version: null };
      try {
        const r = await runProcess(path, [VERSION_ARG[name]], { keepOutput: true, timeoutMs: 20_000 }).result;
        const first = r.stdout.split(/\r?\n/)[0] ?? '';
        const m = first.match(/version\s+(\S+)/) ?? first.match(/^deno\s+(\S+)/);
        return { name, path, source, version: r.code === 0 ? (m?.[1] ?? first.trim()) : null };
      } catch {
        return { name, path, source, version: null };
      }
    }));
  }

  /** Laster bare ned det som mangler, med mindre `only` er satt. */
  async install(only?: ToolName[]): Promise<void> {
    const assets = assetsFor(this.platform);
    if (assets.length === 0) throw new Error('Automatisk installasjon støttes ikke på dette systemet.');
    const wanted = assets.filter((a) => only
      ? a.provides.some((n) => only.includes(n))
      : a.provides.some((n) => this.locate(n).source === 'missing'));
    try {
      await mkdir(this.binDir, { recursive: true });
      for (const asset of wanted) await this.installAsset(asset);
      this.onInstall({ active: false, message: 'Verktøyene er klare.', percent: 100, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onInstall({ active: false, message: 'Installasjonen stoppet.', percent: null, error: message });
      throw err;
    }
  }

  private async installAsset(asset: Asset): Promise<void> {
    const label = asset.provides.map((n) => FILE_NAMES[n]).join(' og ');
    const work = join(this.binDir, `.install-${asset.provides[0]}`);
    await rm(work, { recursive: true, force: true });
    await mkdir(work, { recursive: true });
    try {
      const expected = parseChecksum(await this.fetchText(asset.checksumUrl), asset.checksumEntry);
      if (!expected) throw new Error(`Fant ikke sjekksum for ${label}.`);
      const file = join(work, 'download');
      const actual = await this.download(asset.url, file, label);
      if (actual !== expected) throw new Error(`Sjekksummen for ${label} stemmer ikke. Filen er forkastet.`);
      this.onInstall({ active: true, message: `Pakker ut ${label}`, percent: null, error: null });
      if (asset.archive === 'none') {
        await this.place(file, asset.provides[0]);
        return;
      }
      const out = join(work, 'out');
      await mkdir(out);
      const [cmd, args] = extractCommand(asset.archive, file, out, this.platform);
      const r = await runProcess(cmd, args).result;
      if (r.code !== 0) throw new Error(`Utpakking av ${label} feilet: ${r.stderr}`);
      for (const name of asset.provides) {
        const found = await findFile(out, FILE_NAMES[name] + this.exe);
        if (!found) throw new Error(`Fant ikke ${FILE_NAMES[name]} i arkivet.`);
        await this.place(found, name);
      }
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  private async place(source: string, name: ToolName): Promise<void> {
    const target = this.managedPath(name);
    const tmp = `${target}.new`;
    await copyFile(source, tmp);
    if (this.platform !== 'win32') await chmod(tmp, 0o755);
    await rename(tmp, target);
  }

  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Kunne ikke hente ${url} (HTTP ${res.status}).`);
    return res.text();
  }

  private async download(url: string, file: string, label: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Kunne ikke laste ned ${label} (HTTP ${res.status}).`);
    const total = Number(res.headers.get('content-length')) || null;
    const hash = createHash('sha256');
    let received = 0;
    let lastReport = 0;
    const body = Readable.fromWeb(res.body as never);
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      received += chunk.length;
      const now = Date.now();
      if (now - lastReport > 200) {
        lastReport = now;
        this.onInstall({ active: true, message: `Laster ned ${label}`, percent: total ? (received / total) * 100 : null, error: null });
      }
    });
    await pipeline(body, createWriteStream(file));
    return hash.digest('hex');
  }
}

/** Windows 10 og 11 har tar.exe med ZIP-støtte. Full sti, så en annen tar på PATH ikke brukes. */
export function extractCommand(archive: Asset['archive'], file: string, out: string, platform: NodeJS.Platform): [string, string[]] {
  if (platform === 'win32') return [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', file, '-C', out]];
  if (archive === 'zip') return ['unzip', ['-q', file, '-d', out]];
  return ['tar', ['-xf', file, '-C', out]];
}

async function findFile(dir: string, fileName: string): Promise<string | null> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFile(p, fileName);
      if (nested) return nested;
    } else if (entry.name === fileName) return p;
  }
  return null;
}
