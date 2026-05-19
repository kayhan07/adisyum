type DownloadEvent = {
  fileName: string;
  version?: string;
  status: 'started' | 'failed' | 'completed';
  source?: string;
  userAgent?: string;
  createdAt: string;
};

const events: DownloadEvent[] = [];

export function recordDownloadEvent(event: Omit<DownloadEvent, 'createdAt'>) {
  events.unshift({ ...event, createdAt: new Date().toISOString() });
  if (events.length > 500) events.length = 500;
}

export function downloadObservabilitySummary() {
  return {
    downloadCount: events.filter((event) => event.status === 'started' || event.status === 'completed').length,
    failedDownloads: events.filter((event) => event.status === 'failed').length,
    versionAdoption: events.reduce<Record<string, number>>((summary, event) => {
      const version = event.version ?? 'unknown';
      summary[version] = (summary[version] ?? 0) + 1;
      return summary;
    }, {}),
    installerFailures: events.filter((event) => event.status === 'failed' && event.fileName.toLowerCase().endsWith('.exe')).length,
    recentEvents: events.slice(0, 25),
  };
}
