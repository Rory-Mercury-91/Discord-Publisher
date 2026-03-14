import Toggle from '../../shared/Toggle';
import { USER_SOURCES, ADMIN_SOURCES, ADMIN_FILTERS } from '../constants';

interface LogsFiltersProps {
  activeCategories: Set<string>;
  onToggle: (id: string, active: boolean) => void;
  isAdmin: boolean;
  onExport: () => void;
  hasLogs: boolean;
  onActivateAll: () => void;
  onDeactivateAll: () => void;
  onResetDefaults: () => void;
}

const USER_TITLES: Record<string, string> = {
  publisher:  'Logs du bot Publisher (publications, MAJ, suppressions)',
  api:        'Logs des requetes REST entrantes (/api/forum-post, /api/history...)',
  scheduler:  'Logs des taches planifiees (version check, cleanup, sync jeux)',
  f95:        'Logs du controle des versions F95 (differences detectees, mises a jour)',
  scraper:    'Logs du scraper F95Zone/LewdCorner (synopsis, donnees jeux — enrichissement collection)',
  translator: 'Logs des traductions EN→FR via Google Translate (synopsis)',
};

const ADMIN_SOURCE_TITLES: Record<string, string> = {
  frelon:      'Logs du bot Frelon (rappels F95fr)',
  orchestrator:"Logs de l'orchestrateur (demarrage, supervision des bots)",
};

const ADMIN_FILTER_TITLES: Record<string, string> = {
  security:            "Tentatives d'authentification echouees",
  'publisher-requests':'Requetes GET internes repetitives (auto-refresh logs, health checks)',
  'discord-api':       "Appels REST vers l'API Discord — logger [discord] + discord.py (rate limit inclus)",
  'supabase-api':      'Requetes vers Supabase (lectures/ecritures BDD)',
  auth:                'Details validation cles API (succes inclus)',
  debug:               'Requetes HTTP/HTTPS suspectes (hors /api/, erreurs 4xx/5xx, aiohttp)',
};

export default function LogsFilters({
  activeCategories,
  onToggle,
  isAdmin,
  onExport,
  hasLogs,
  onActivateAll,
  onDeactivateAll,
  onResetDefaults,
}: LogsFiltersProps) {
  return (
    <div className="logs-filters">
      {USER_SOURCES.map((s) => (
        <Toggle
          key={s.id}
          checked={activeCategories.has(s.id)}
          onChange={(active) => onToggle(s.id, active)}
          label={s.label}
          title={USER_TITLES[s.id]}
        />
      ))}
      {isAdmin &&
        ADMIN_SOURCES.map((s) => (
          <Toggle
            key={s.id}
            checked={activeCategories.has(s.id)}
            onChange={(active) => onToggle(s.id, active)}
            label={s.label}
            title={ADMIN_SOURCE_TITLES[s.id]}
          />
        ))}
      {isAdmin &&
        ADMIN_FILTERS.map((f) => (
          <Toggle
            key={f.id}
            checked={activeCategories.has(f.id)}
            onChange={(active) => onToggle(f.id, active)}
            label={f.label}
            title={ADMIN_FILTER_TITLES[f.id]}
          />
        ))}
      {isAdmin && (() => {
        const allIds = [
          ...USER_SOURCES.map((s) => s.id),
          ...ADMIN_SOURCES.map((s) => s.id),
          ...ADMIN_FILTERS.map((f) => f.id),
        ];
        const defaultIds = USER_SOURCES.filter((s) => s.default).map((s) => s.id);

        const allActive  = allIds.every((id) => activeCategories.has(id));
        const noneActive = activeCategories.size === 0;
        const isDefault  =
          defaultIds.every((id) => activeCategories.has(id)) &&
          activeCategories.size === defaultIds.length;

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, width: '100%', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <Toggle
              checked={isDefault}
              onChange={() => onResetDefaults()}
              label="Par défaut"
              title="Revenir aux sources activées par défaut (Publisher, API REST, Planificateur, Versions F95)"
            />
            <Toggle
              checked={allActive}
              onChange={() => onActivateAll()}
              label="Tout activer"
              title="Activer toutes les sources et tous les filtres"
            />
            <Toggle
              checked={noneActive}
              onChange={() => onDeactivateAll()}
              label="Tout désactiver"
              title="Masquer tous les logs"
            />
          </div>
        );
      })()}
      <div style={{ marginLeft: 'auto' }}>
        <button
          type="button"
          onClick={onExport}
          disabled={!hasLogs}
          className="form-btn form-btn--ghost"
          style={{
            padding: '7px 14px',
            opacity: hasLogs ? 1 : 0.5,
            cursor: hasLogs ? 'pointer' : 'not-allowed',
          }}
          title="Telecharger les logs filtres"
        >
          📥 Exporter
        </button>
      </div>
    </div>
  );
}