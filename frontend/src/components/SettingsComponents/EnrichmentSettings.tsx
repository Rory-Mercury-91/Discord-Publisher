// frontend\src\components\SettingsComponents\EnrichmentSettings.tsx
import { useEffect, useRef, useState } from 'react';

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 20,
  background: 'rgba(255,255,255,0.02)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  boxSizing: 'border-box',
};

const fullWidthStyle: React.CSSProperties = { gridColumn: '1 / -1' };

export default function EnrichmentSettings() {
  const [isEnriching, setIsEnriching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll logs
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <section style={{ ...sectionStyle, ...fullWidthStyle }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🤖 Enrichissement automatique</h4>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
          Récupère et traduit automatiquement les synopsis depuis F95Zone pour tous les jeux sans <code>synopsis_fr</code>
        </p>
      </section>

      {/* Contrôles */}
      <section style={{ ...sectionStyle, ...fullWidthStyle }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!isEnriching ? (
            <button
              onClick={handleStartEnrichment}
              style={{
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                color: 'white',
                borderRadius: 10,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 15,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 4px 15px rgba(102,126,234,0.4)',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(102,126,234,0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(102,126,234,0.4)';
              }}
            >
              <span style={{ fontSize: 18 }}>▶️</span>
              Lancer l'enrichissement
            </button>
          ) : (
            <button
              onClick={handleStopEnrichment}
              style={{
                padding: '14px 28px',
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#ef4444',
                borderRadius: 10,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 15,
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <span>⏹️</span>
              Arrêter
            </button>
          )}

          {progress.total > 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                flex: 1,
                height: 12,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 6,
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                  transition: 'width 0.3s',
                  borderRadius: 6
                }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: 'right' }}>
                {progress.current} / {progress.total} ({progressPercent}%)
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Logs */}
      <section style={{ ...sectionStyle, ...fullWidthStyle }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>📜 Logs en temps réel</h4>
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 16,
          maxHeight: 400,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 1.6
        }}
          className="styled-scrollbar"
        >
          {logs.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
              Aucune activité pour le moment
            </div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  padding: '4px 0',
                  color: log.startsWith('✅') ? '#10b981'
                    : log.startsWith('❌') ? '#ef4444'
                      : log.startsWith('⏭️') ? '#f59e0b'
                        : 'var(--text)'
                }}
              >
                {log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </section>

      {/* Footer infos */}
      <section style={{ ...sectionStyle, ...fullWidthStyle }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>ℹ️ Fonctionnement</h4>
        <div style={{
          padding: 16,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          fontSize: 12,
          color: 'var(--muted)',
          lineHeight: 1.8
        }}>
          <strong style={{ display: 'block', marginBottom: 8, color: 'var(--text)' }}>Étapes :</strong>
          1. Récupération des jeux sans <code>synopsis_fr</code> depuis Supabase<br />
          2. Scraping du synopsis EN depuis F95Zone (<code>.bbWrapper</code>)<br />
          3. Traduction EN → FR via Google Translate API non-officielle<br />
          4. Sauvegarde dans Supabase (<code>synopsis_en</code> + <code>synopsis_fr</code>)
        </div>
      </section>
    </div>
  );
}
