import { t } from '../i18n';

const api = window.snutt;

/**
 * Viser en mappe med Velg mappe-knapp. Med onReset kan mappen være tom, og da vises emptyText
 * (for eksempel «Samme mappe som originalfilen»).
 */
export function FolderRow({ label, value, onChange, emptyText, resetText }: {
  label: string; value: string; onChange(dir: string): void; emptyText?: string; resetText?: string;
}) {
  const choose = async () => { const d = await api.pickFolder(value); if (d) onChange(d); };
  return (
    <div className="folder-row row small">
      <span className="muted folder-label">{label}</span>
      <code className="grow folder-path" aria-label={label}>{value || emptyText}</code>
      <button className="btn" onClick={choose}>{t('dl.chooseFolder')}</button>
      {resetText && value && <button className="btn" onClick={() => onChange('')}>{resetText}</button>}
    </div>
  );
}
