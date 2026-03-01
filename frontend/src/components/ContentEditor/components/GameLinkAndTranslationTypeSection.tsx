// Lien du jeu + Type de traduction (grille 2 colonnes).
import { tauriAPI } from '../../../lib/tauri-api';
import Toggle from '../../shared/Toggle';

interface LinkConfig {
  source: 'F95' | 'Lewd' | 'Autre';
  value: string;
}

interface GameLinkAndTranslationTypeSectionProps {
  gameLinkConfig: LinkConfig;
  setLinkConfig: (name: 'Game_link', source: 'F95' | 'Lewd' | 'Autre', value: string) => void;
  buildFinalLink: (config: LinkConfig) => string;
  gameLinkDisabled: boolean;
  translationType: string;
  setTranslationType: (v: string) => void;
  isIntegrated: boolean;
  setIsIntegrated: (v: boolean) => void;
}

export default function GameLinkAndTranslationTypeSection({
  gameLinkConfig,
  setLinkConfig,
  buildFinalLink,
  gameLinkDisabled,
  translationType,
  setTranslationType,
  isIntegrated,
  setIsIntegrated,
}: GameLinkAndTranslationTypeSectionProps) {
  return (
    <div className="form-grid form-grid--2col form-grid--align-rows">
      <div className="form-field">
        <div className="form-field__label-row">
          <label className="form-label form-label--inline">Lien du jeu</label>
        </div>
        <div className="form-field form-field--row form-field--row-h40">
          <input
            type="text"
            value={buildFinalLink(gameLinkConfig)}
            onChange={(e) => {
              let val = e.target.value.trim();
              let detectedSource: 'F95' | 'Lewd' | 'Autre' = gameLinkConfig.source;
              const lower = val.toLowerCase();
              if (lower.includes('f95zone.to')) detectedSource = 'F95';
              else if (lower.includes('lewdcorner.com')) detectedSource = 'Lewd';
              else if (lower.includes('http')) detectedSource = 'Autre';
              setLinkConfig('Game_link', detectedSource, val);
            }}
            placeholder="https://..."
            disabled={gameLinkDisabled}
            className={`form-input form-input--flex ${gameLinkDisabled ? 'form-input--disabled' : ''}`}
          />
          <button
            type="button"
            onClick={() => {
              const url = buildFinalLink(gameLinkConfig);
              if (url && !url.includes('...')) tauriAPI.openUrl(url);
            }}
            title="Ouvrir le lien"
            className="form-btn form-btn--icon"
          >
            🔗
          </button>
        </div>
      </div>

      <div className="form-field">
        <div className="form-field form-field--row form-field__label-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
          <label className="form-label form-label--inline">Type de traduction</label>
          <Toggle
            checked={isIntegrated}
            onChange={setIsIntegrated}
            label="Traduction intégrée au jeu"
          />
        </div>
        <div className="segmented" style={{ height: 40 }}>
          {(['Automatique', 'Semi-automatique', 'Manuelle'] as const).map((opt) => {
            const active = translationType === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setTranslationType(opt)}
                className={active ? 'segmented__option segmented__option--active' : 'segmented__option'}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
