import type { ReactElement } from 'react';
import type { LogCategory } from '../constants';

export { type LogCategory } from '../constants';

export function getLineCategory(line: string): LogCategory {
  const l = line.toLowerCase();

  // ── Détections prioritaires (contenu du message) ─────────────────────────
  if (l.includes('rate limit proche') || l.includes('requests remaining')) return 'discord-api';

  // Requêtes GET internes répétitives (auto-refresh logs, health checks…)
  if (/\[REQUEST\]\s+.*(?:GET|POST)\s+\/api\/(?:logs|publisher\/[^\s]+)/i.test(line)) return 'publisher-requests';

  // Erreurs HTTP et requêtes suspectes (chemin hors /api/, clé absente…)
  const isSuspicious =
    l.includes('[http_error]') ||
    (l.includes('nokey') && !l.includes('/api/')) ||
    (l.includes('status=404') && !l.includes('/api/')) ||
    (l.includes('get /') && !l.includes('/api/'));
  if (isSuspicious) return 'debug';

  // ── Loggers nommés (format : [%(name)s] dans le pattern de logging) ──────
  if (/\[auth\]/i.test(line)) {
    if (l.includes('echec') || l.includes('refuse') || l.includes('invalide')) return 'security';
    return 'auth';
  }

  if (/\[f95\]/i.test(line))         return 'f95';
  if (/\[scheduler\]/i.test(line))   return 'scheduler';
  if (/\[api\]/i.test(line))         return 'api';
  if (/\[supabase\]/i.test(line))    return 'supabase-api';
  if (/\[frelon\]/i.test(line))      return 'frelon';
  if (/\[orchestrator\]/i.test(line)) return 'orchestrator';
  if (/\[publisher\]/i.test(line))   return 'publisher';

  // Nouveaux loggers : scraper.py et translator.py
  if (/\[scraper\]/i.test(line))     return 'scraper';
  if (/\[translator\]/i.test(line))  return 'translator';

  // ── Fallbacks bibliothèques tierces ──────────────────────────────────────
  // [discord] (discord_api.py) + [discord.client] / [discord.gateway] (discord.py)
  if (/\[discord(?:\.[a-z.]+)?\]/i.test(line)) return 'discord-api';

  if (/\[AUTH\]/i.test(line))                    return 'security';
  if (/\[httpx\].*supabase\.co/i.test(line))     return 'supabase-api';
  if (/\[(?:aiohttp\.|httpx)\]/i.test(line))     return 'debug';

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
  publisher:           '#a78bfa',  // violet
  api:                 '#f97316',  // orange
  scheduler:           '#38bdf8',  // sky
  f95:                 '#e879f9',  // fuchsia
  frelon:              '#10b981',  // emerald
  orchestrator:        '#3b82f6',  // blue
  scraper:             '#6366f1',  // indigo  ← nouveau
  translator:          '#14b8a6',  // teal    ← nouveau
  security:            '#f59e0b',  // amber
  'publisher-requests':'#c084fc',  // purple-400
  'discord-api':       '#5865f2',  // discord blurple
  'supabase-api':      '#34d399',  // mint
  auth:                '#fbbf24',  // yellow
  debug:               '#6b7280',  // gray
};

export function colorizeLogLine(line: string): ReactElement {
  const cat = getLineCategory(line);
  let color = 'var(--text)';

  if (/\[ERROR\]/i.test(line))   color = 'var(--error)';
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