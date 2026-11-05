import type { TextKey } from '../../shared/i18n';
import type { Job } from '../../shared/types';
import { formatBytes, formatEta } from '../format';
import { t, tm } from '../i18n';

const api = window.snutt;
const STATUS: Record<Job['status'], TextKey> = {
  queued: 'q.queued', running: 'q.running', paused: 'q.paused', done: 'q.done', failed: 'q.failed', canceled: 'q.canceled',
};

function detail(job: Job): string {
  const p = job.progress;
  const parts = [
    p.percent != null ? `${Math.floor(p.percent)} %` : null,
    p.totalBytes ? formatBytes(p.totalBytes) : null,
    p.speedBps ? `${formatBytes(p.speedBps)}/s` : null,
    formatEta(p.etaSeconds) || null,
  ];
  return parts.filter(Boolean).join(', ');
}

export function QueueView({ jobs, onOpen }: { jobs: Job[]; onOpen(path: string): void }) {
  return (
    <div className="narrow">
      <h1>{t('q.title')}</h1>
      {jobs.length === 0 && <p className="muted">{t('q.empty')}</p>}
      {jobs.map((job) => (
        <div className="job" key={job.id} data-status={job.status}>
          <div className="job-head">
            <div className="job-title">{tm(job.title)}</div>
            <div className={job.status === 'failed' ? 'error' : job.status === 'done' ? 'ok' : 'muted'}>{t(STATUS[job.status])}</div>
          </div>
          {(job.status === 'running' || job.status === 'paused') && (
            <>
              <div className={`meter ${job.progress.percent == null ? 'unknown' : ''}`}>
                <div style={job.progress.percent != null ? { width: `${job.progress.percent}%` } : undefined} />
              </div>
              <div className="muted small num">{detail(job)}</div>
            </>
          )}
          {job.error && <p className="error small" style={{ marginTop: 6 }}>{tm(job.error)}</p>}
          {job.note && <p className="muted small" style={{ marginTop: 6 }}>{tm(job.note)}</p>}
          <div className="job-actions">
            {job.status === 'done' && job.outputPath && (
              <>
                <button className="btn" onClick={() => onOpen(job.outputPath!)}>{t('q.open')}</button>
                <button className="btn" onClick={() => api.showInFolder(job.outputPath!)}>{t('q.show')}</button>
              </>
            )}
            {job.kind === 'download' && (job.status === 'running' || job.status === 'queued') && <button className="btn" onClick={() => api.pauseJob(job.id)}>{t('q.pause')}</button>}
            {job.status === 'paused' && <button className="btn" onClick={() => api.resumeJob(job.id)}>{t('q.resume')}</button>}
            {(job.status === 'failed' || job.status === 'canceled') && <button className="btn" onClick={() => api.retryJob(job.id)}>{t('q.retry')}</button>}
            {['running', 'queued', 'paused'].includes(job.status) && <button className="btn" onClick={() => api.cancelJob(job.id)}>{t('q.cancel')}</button>}
            {!['running', 'queued'].includes(job.status) && <button className="btn" onClick={() => api.removeJob(job.id)}>{t('q.remove')}</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
