import type { ReactElement } from 'react';
import type { LogCategory } from '../constants';

export { type LogCategory } from '../constants';

export function getLineCategory(line: string): LogCategory {
  const l = line.toLowerCase();

  if (l.includes('rate limit proche') || l.includes('requests remaining')) return 'discord-api';
  if (/\[REQUEST\].*(?:OPTIONS|GET|POST)\s+\/api\/(?:logs|publisher\/[^\s]+)/i.test(line)) return 'publisher-requests';

  const isSuspicious =
    l.includes('[http_error]') ||
    (l.includes('nokey') && !l.includes('/api/')) ||
    (l.includes('status=404') && !l.includes('/api/')) ||
    (l.includes('get /') && !l.includes('/api/'));
  if (isSuspicious) return 'debug';

  if (/\[auth\]/i.test(line)) {
    if (l.includes('echec') || l.includes('refuse') || l.includes('invalide')) return 'security';
    return 'auth';
  }

  if (/\[f95\]/i.test(line)) return 'f95';
  if (/\[scheduler\]/i.test(line)) return 'scheduler';
  if (/\[api\]/i.test(line)) return 'api';
  if (/\[supabase\]/i.test(line)) return 'supabase-api';
  if (/\[frelon\]/i.test(line)) return 'frelon';
  if (/\[orchestrator\]/i.test(line)) return 'orchestrator';
  if (/\[publisher\]/i.test(line)) return 'publisher';

  if (/\[discord\.(?:client|gateway)\]/i.test(line)) return 'discord-api';
  if (/\[AUTH\]/i.test(line)) return 'security';
  if (/\[httpx\].*supabase\.co/i.test(line)) return 'supabase-api';
  if (/\[(?:aiohttp\.|httpx)\]/i.test(line)) return 'debug';

  return null;
}

export function filterLogs(lines: string, activeCategories: Set<string>): string {
  if (activeCategories.size === 0) return '';

  const allLines = lines.split('\n');
  const result: string[] = [];
  let lastCategory: LogCategory = null;

  for (const line of allLines) {
    const cat = getLineCategory(line);

    if (cat !== null) {
      lastCategory = cat;
      if (activeCategories.has(cat)) result.push(line);
    } else {
      if (lastCategory && activeCategories.has(lastCategory)) {
        const isContinuation =
          line.trim() === '' ||
          line.startsWith('  ') ||
          line.startsWith('\t') ||
          /^Traceback/i.test(line) ||
          /^  File "/.test(line) ||
          /^    /.test(line) ||
          /^[a-z_]+\.[a-z_]+\./.test(line);
        if (isContinuation) result.push(line);
        else lastCategory = null;
      }
    }
  }

  return result.join('\n');
}

const CAT_COLORS: Record<string, string> = {
  publisher: '#a78bfa',
  api: '#f97316',
  scheduler: '#38bdf8',
  f95: '#e879f9',
  frelon: '#10b981',
  orchestrator: '#3b82f6',
  security: '#f59e0b',
  'publisher-requests': '#c084fc',
  'discord-api': '#5865f2',
  'supabase-api': '#34d399',
  auth: '#fbbf24',
  debug: '#6b7280',
};

export function colorizeLogLine(line: string): ReactElement {
  const cat = getLineCategory(line);
  let color = 'var(--text)';

  if (/\[ERROR\]/i.test(line)) color = 'var(--error)';
  else if (/\[WARNING\]/i.test(line)) color = 'var(--warning)';
  else if (cat) color = CAT_COLORS[cat] ?? 'var(--text)';

  return (
    <div style={{ color, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
      {line}
    </div>
  );
}

export function exportLogsAsTxt(content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
