/** Sammenligner versjoner som 0.7.0 og v0.10.2. Positivt tall betyr at a er nyere. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** yt-dlp har datoen som versjon, for eksempel 2026.10.26. Gir alder i dager, eller null om formatet er ukjent. */
export function ytDlpAgeDays(version: string | null, now = new Date()): number | null {
  const m = version?.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  const date = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor((now.getTime() - date) / 86_400_000);
}

