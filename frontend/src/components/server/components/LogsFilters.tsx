import Toggle from '../../shared/Toggle';
import { USER_SOURCES, ADMIN_SOURCES, ADMIN_FILTERS } from '../constants';

interface LogsFiltersProps {
  activeCategories: Set<string>;
  onToggle: (id: string, active: boolean) => void;
  isAdmin: boolean;
  onExport: () => void;
  hasLogs: boolean;
}

const USER_TITLES: Record<string, string> = {
  publisher: 'Logs du bot Publisher (publications, MAJ, suppressions)',
  api: 'Logs des requetes REST entrantes (/api/forum-post, /api/history...)',
  scheduler: 'Logs des taches planifiees (version check, cleanup, sync jeux)',
  f95: 'Logs du controle des versions F95 (differences detectees, mises a jour)',
};

const ADMIN_SOURCE_TITLES: Record<string, string> = {
  frelon: "Logs du bot Frelon (rappels F95fr)",
  orchestrator: "Logs de l'orchestrateur (demarrage, supervision des bots)",
};

const ADMIN_FILTER_TITLES: Record<string, string> = {
  security: "Tentatives d'authentification echouees",
  'publisher-requests': 'Requetes OPTIONS/GET internes (CORS, health...)',
  'discord-api': "Appels REST vers l'API Discord (rate limit inclus)",
  'supabase-api': 'Requetes vers Supabase (lectures/ecritures BDD)',
  auth: 'Details validation cles API (succes inclus)',
  debug: 'Requetes HTTP/HTTPS brutes (aiohttp, debug)',
};

export default function LogsFilters({
  activeCategories,
  onToggle,
  isAdmin,
  onExport,
  hasLogs,
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
