// frontend/src/components/Settings/components/EnrichmentSettings.tsx
import { useEffect, useRef, useState } from 'react';

export default function EnrichmentSettings() {
  const [isEnriching, setIsEnriching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleStartEnrichment = async () => {
    setIsEnriching(true);
    setProgress({ current: 0, total: 0 });
    setLogs(['🚀 Démarrage de l\'enrichissement...']);

    const apiBase = localStorage.getItem('apiBase') || 'http://138.2.182.125:8080';
    const apiKey = localStorage.getItem('apiKey') || '';

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${apiBase}/api/scrape/enrich`, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Pas de stream disponible');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);

            if (data.progress) {
              setProgress(data.progress);
            }

            if (data.log) {
              setLogs(prev => [...prev, data.log]);
            }

            if (data.status === 'completed') {
              setLogs(prev => [...prev, '✅ Enrichissement terminé avec succès']);
            }

            if (data.error) {
              setLogs(prev => [...prev, `❌ Erreur: ${data.error}`]);
            }
          } catch (e) {
            console.warn('Ligne SSE invalide:', line);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setLogs(prev => [...prev, '⏸️ Enrichissement annulé']);
      } else {
        setLogs(prev => [...prev, `❌ Erreur réseau: ${err.message}`]);
      }
    } finally {
      setIsEnriching(false);
    }
  };

  const handleStopEnrichment = () => {
    abortControllerRef.current?.abort();
    setIsEnriching(false);
  };

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const logLineClass = (line: string) =>
    line.startsWith('✅') ? 'settings-enrichment-log-line--success'
      : line.startsWith('❌') ? 'settings-enrichment-log-line--error'
        : line.startsWith('⏭️') ? 'settings-enrichment-log-line--skip'
          : '';

  return (
    <div className="settings-enrichment-root">
      {/* Logs + bouton sur une ligne, puis barre de progression et zone logs */}
      <section className="settings-section">
        <div className="settings-log-header">
          <h4 className="settings-section__title">📜 Logs en temps réel</h4>
          {!isEnriching ? (
            <button
              type="button"
              onClick={handleStartEnrichment}
              className="form-btn form-btn--primary"
            >
              <span className="settings-enrichment-btn-icon">▶️</span>
              Lancer l'enrichissement
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopEnrichment}
              className="form-btn form-btn--danger"
            >
              <span className="settings-enrichment-btn-icon">⏹️</span>
              Arrêter
            </button>
          )}
        </div>

        {progress.total > 0 && (
          <div className="settings-enrichment-progress-row">
            <div className="settings-enrichment-progress-track">
              <div
                className="settings-enrichment-progress-fill"
                style={{ ['--progress-pct' as string]: `${progressPercent}%` }}
              />
            </div>
            <span className="settings-enrichment-progress-label">
              {progress.current} / {progress.total} ({progressPercent}%)
            </span>
          </div>
        )}

        <div className="settings-logs-box styled-scrollbar">
          {logs.length === 0 ? (
            <div className="settings-enrichment-empty">
              Aucune activité pour le moment
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className={`settings-enrichment-log-line ${logLineClass(log)}`}>
                {log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </section>

      {/* Fonctionnement : un seul conteneur avec titre + étapes */}
      <section className="settings-section">
        <h4 className="settings-section__title">ℹ️ Fonctionnement</h4>
        <div className="settings-fonctionnement">
          <strong>Étapes :</strong>
          1. Récupération des jeux sans <code>synopsis_fr</code> depuis Supabase<br />
          2. Scraping du synopsis EN depuis F95Zone (<code>.bbWrapper</code>)<br />
          3. Traduction EN → FR via Google Translate API non-officielle<br />
          4. Sauvegarde dans Supabase (<code>synopsis_en</code> + <code>synopsis_fr</code>)
        </div>
      </section>
    </div>
  );
}
