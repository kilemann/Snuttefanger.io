export function formatTime(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms % 1000, 3)}`;
}

export function parseTime(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^(\d+:){0,2}\d+(\.\d+)?$/.test(t)) return null;
  return t.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
}

export function formatBytes(n: number | null): string {
  if (n == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString('nb-NO', { maximumFractionDigits: i > 1 ? 1 : 0 })} ${units[i]}`;
}

export function formatEta(s: number | null): string {
  if (s == null) return '';
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${Math.round(s % 60)} s igjen` : `${Math.round(s)} s igjen`;
}
