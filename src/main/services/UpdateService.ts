import type { UpdateInfo } from '../../shared/types';
import { compareVersions } from '../../shared/versions';

export const RELEASES_API = 'https://api.github.com/repos/kilemann/Snuttefanger.io/releases/latest';
export const DOWNLOAD_PAGE = 'https://kilemann.github.io/Snuttefanger.io/';

export async function checkForUpdate(current: string, url = process.env.SNUTT_UPDATE_URL || RELEASES_API): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Snuttefanger-update-check' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const rel = await res.json() as { tag_name?: unknown; html_url?: unknown };
    if (typeof rel.tag_name !== 'string') return null;
    const latest = rel.tag_name.replace(/^v/, '');
    return { latest, newer: compareVersions(latest, current) > 0 };
  } catch {
    // Ingen nett, eller GitHub svarer ikke: da sier vi bare ingenting.
    return null;
  }
}
