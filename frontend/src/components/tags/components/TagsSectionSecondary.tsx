import { Fragment } from 'react';
import type { Section, TagConfig, Translator } from '../tags-modal-constants';
import { PREDEFINED, SECTION_TITLES, SECTIONS } from '../tags-modal-constants';

interface TagsSectionSecondaryProps {
  loadingAll: boolean;
  loadingCfg: boolean;
  translators: Translator[];
  selId: string | null;
  selKind: 'profile' | 'external';
  cfg: TagConfig;
  editMappings: Record<string, { forum_channel_id: string }>;
  editExternals: Record<string, { forum_channel_id: string }>;
  generatingTagsLoading: boolean;
  syncFromDiscordLoading: boolean;
  onSelectTranslator: (id: string, kind: 'profile' | 'external') => void;
  setSlot: (section: Section, key: string, value: string) => void;
  addFree: () => void;
  setFree: (k: string, field: 'name' | 'discordTagId', value: string) => void;
  delFree: (k: string) => void;
  onGenerateTags: () => void;
  onSyncTagsFromDiscord: () => void;
}

export default function TagsSectionSecondary({
  loadingAll,
  loadingCfg,
  translators,
  selId,
  selKind,
  cfg,
  editMappings,
  editExternals,
  generatingTagsLoading,
  syncFromDiscordLoading,
  onSelectTranslator,
  setSlot,
  addFree,
  setFree,
  delFree,
  onGenerateTags,
  onSyncTagsFromDiscord,
}: TagsSectionSecondaryProps) {
  const forumChannelId = selId
    ? selKind === 'profile'
      ? editMappings[selId]?.forum_channel_id?.trim()
      : editExternals[selId]?.forum_channel_id?.trim()
    : '';
  const configCount =
    cfg.others.length +
    Object.values(cfg.translationType).filter((s) => s.discordTagId).length +
    Object.values(cfg.gameStatus).filter((s) => s.discordTagId).length +
    Object.values(cfg.sites).filter((s) => s.discordTagId).length;

  return (
    <div className="tags-modal-secondary-layout">
        <div className="tags-modal-secondary-sidebar styled-scrollbar">
          {loadingAll ? (
            <p className="tags-modal-muted" style={{ padding: '0 10px' }}>
              Chargement…
            </p>
          ) : (
            <>
              {translators.some((t) => t.kind === 'profile') && (
                <p className="tags-modal-secondary-sidebar-group">👤 Inscrits</p>
              )}
              {translators
                .filter((t) => t.kind === 'profile')
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTranslator(t.id, 'profile')}
                    className={`tags-modal-secondary-sidebar-btn ${selId === t.id ? 'tags-modal-secondary-sidebar-btn--active' : ''}`}
                  >
                    {t.name}
                  </button>
                ))}
              {translators.some((t) => t.kind === 'external') && (
                <p className="tags-modal-secondary-sidebar-group">🔧 Externes</p>
              )}
              {translators
                .filter((t) => t.kind === 'external')
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTranslator(t.id, 'external')}
                    className={`tags-modal-secondary-sidebar-btn ${selId === t.id ? 'tags-modal-secondary-sidebar-btn--active-external' : ''}`}
                  >
                    {t.name}
                  </button>
                ))}
              {translators.length === 0 && (
                <p className="tags-modal-muted tags-modal-muted--italic" style={{ padding: '0 10px' }}>
                  Aucun traducteur
                </p>
              )}
            </>
          )}
        </div>

        <div className="tags-modal-secondary-panel styled-scrollbar">
          {!selId ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--muted)',
                fontStyle: 'italic',
                fontSize: 14,
              }}
            >
              Sélectionnez un traducteur
            </div>
          ) : loadingCfg ? (
            <p className="tags-modal-muted">Chargement…</p>
          ) : (
            <>
              <div className="tags-modal-secondary-header">
                <div className="tags-modal-secondary-actions">
                  {forumChannelId && (
                    <>
                      <button
                        type="button"
                        onClick={onGenerateTags}
                        disabled={generatingTagsLoading}
                        className="tags-modal-secondary-btn-sync"
                        title="Créer les tags fixes sur le salon Discord puis récupérer les ID automatiquement"
                      >
                        {generatingTagsLoading ? '⏳…' : '📤 Générer les tags'}
                      </button>
                      <button
                        type="button"
                        onClick={onSyncTagsFromDiscord}
                        disabled={syncFromDiscordLoading || generatingTagsLoading}
                        className="tags-modal-secondary-btn-sync"
                        title="Récupérer les ID Discord (prédéfinis + tags libres par correspondance de nom)"
                      >
                        {syncFromDiscordLoading ? '⏳ Sync…' : '🔄 Récupérer les ID (tags libres)'}
                      </button>
                    </>
                  )}
                  <span className="tags-modal-secondary-badge">{configCount} tag(s) configuré(s)</span>
                </div>
              </div>

              {(SECTIONS as Section[]).map((s) => (
                <div key={s} className="tags-modal-predefined">
                  <h5 className="tags-modal-predefined-title">{SECTION_TITLES[s]}</h5>
                  <div className="tags-modal-predefined-grid">
                    <span className="tags-modal-col-hdr">Label</span>
                    <span className="tags-modal-col-hdr">ID Discord du tag</span>
                    {PREDEFINED[s].map(({ key, label }) => (
                      <Fragment key={key}>
                        <label className="tags-modal-predefined-label">
                          {label}
                          {cfg[s][key]?.discordTagId && <span className="tags-modal-predefined-dot" />}
                        </label>
                        <input
                          className="tags-modal-input"
                          value={cfg[s][key]?.discordTagId ?? ''}
                          onChange={(e) => setSlot(s, key, e.target.value)}
                          placeholder="ex: 1234567890123456789"
                        />
                      </Fragment>
                    ))}
                  </div>
                </div>
              ))}

              <div className="tags-modal-predefined">
                <div className="tags-modal-frees-header">
                  <h5 className="tags-modal-predefined-title">📦 Tags libres</h5>
                  <button type="button" onClick={addFree} className="tags-modal-frees-add">
                    ➕ Ajouter Tag Libre
                  </button>
                </div>
                {cfg.others.length === 0 ? (
                  <p className="tags-modal-muted tags-modal-muted--italic" style={{ margin: 0 }}>
                    Aucun tag libre. Cliquez sur « Ajouter ».
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="tags-modal-frees-grid">
                      <span className="tags-modal-col-hdr">Label</span>
                      <span className="tags-modal-col-hdr">ID Discord</span>
                      <span />
                    </div>
                    {cfg.others.map((o) => (
                      <div key={o._k} className="tags-modal-frees-row">
                        <input
                          className="tags-modal-input"
                          value={o.name}
                          onChange={(e) => setFree(o._k, 'name', e.target.value)}
                          placeholder="Ex: VF Complète…"
                        />
                        <input
                          className="tags-modal-input"
                          value={o.discordTagId}
                          onChange={(e) => setFree(o._k, 'discordTagId', e.target.value)}
                          placeholder="ID Discord du tag…"
                        />
                        <button type="button" onClick={() => delFree(o._k)} className="tags-modal-frees-del-btn">
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
  );
}
