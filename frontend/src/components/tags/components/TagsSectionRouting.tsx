import type { EditRow } from '../tags-modal-constants';
import type { ExternalTranslator } from '../tags-modal-constants';
import type { MappingRow } from '../tags-modal-constants';
import MappingRowItem from './MappingRowItem';

const ROUTING_HEADERS = ['Traducteur', 'Tag', 'Salon Discord (ID)', 'Concordance Formulaire', 'Action', ''];

interface TagsSectionRoutingProps {
  loadingAll: boolean;
  allProfiles: { id: string; pseudo: string }[];
  externals: ExternalTranslator[];
  mappings: MappingRow[];
  editMappings: Record<string, EditRow>;
  editExternals: Record<string, EditRow>;
  translatorTags: { id: string; name: string }[];
  f95TraducteurOptions: string[];
  newExtName: string;
  addingExternal: boolean;
  setNewExtName: (v: string) => void;
  setAddingExternal: (v: boolean | ((prev: boolean) => boolean)) => void;
  onEditMapping: (profileId: string, field: 'tag_id' | 'forum_channel_id' | 'list_form_traducteur', val: string) => void;
  onEditExternal: (extId: string, field: 'tag_id' | 'forum_channel_id' | 'list_form_traducteur', val: string) => void;
  saveMapping: (profileId: string) => void;
  deleteMapping: (profileId: string) => void;
  saveExternal: (extId: string) => void;
  deleteExternal: (extId: string) => void;
  handleAddExternal: () => void;
}

const emptyEdit: EditRow = { tag_id: '', forum_channel_id: '', list_form_traducteur: '' };

export default function TagsSectionRouting({
  loadingAll,
  allProfiles,
  externals,
  mappings,
  editMappings,
  editExternals,
  translatorTags,
  f95TraducteurOptions,
  newExtName,
  addingExternal,
  setNewExtName,
  setAddingExternal,
  onEditMapping,
  onEditExternal,
  saveMapping,
  deleteMapping,
  saveExternal,
  deleteExternal,
  handleAddExternal,
}: TagsSectionRoutingProps) {
  const tagsForSelect = translatorTags.map((t) => ({ id: t.id, name: t.name }));

  if (loadingAll) {
    return (
      <div className="tags-modal-section__content">
        <p className="tags-modal-muted">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="tags-modal-routing-content tags-modal-section__content">
        <div className="tags-modal-routing-headers">
          {ROUTING_HEADERS.map((h) => (
            <span key={h} className="tags-modal-col-hdr">
              {h}
            </span>
          ))}
        </div>

        {allProfiles.length > 0 && (
          <>
            <div className="tags-modal-routing-subtitle">👤 Utilisateurs inscrits</div>
            {allProfiles.map((p) => (
              <MappingRowItem
                key={p.id}
                label={p.pseudo || '—'}
                hasMapping={mappings.some((m) => m.profile_id === p.id)}
                edit={editMappings[p.id] ?? emptyEdit}
                tags={tagsForSelect}
                traducteurOptions={f95TraducteurOptions}
                onEditChange={(field, val) => onEditMapping(p.id, field, val)}
                onSave={() => saveMapping(p.id)}
                onDelete={() => deleteMapping(p.id)}
              />
            ))}
          </>
        )}
        {allProfiles.length === 0 && (
          <div className="tags-modal-muted tags-modal-muted--italic" style={{ padding: '8px 14px' }}>
            Aucun utilisateur inscrit.
          </div>
        )}

        <div className="tags-modal-routing-externals-bar">
          <span className="tags-modal-col-hdr">🔧 Traducteurs externes</span>
          <button
            type="button"
            onClick={() => setAddingExternal((v) => !v)}
            className="tags-modal-routing-add-ext"
          >
            {addingExternal ? '✕ Annuler' : '＋ Ajouter'}
          </button>
        </div>

        {addingExternal && (
          <div className="tags-modal-routing-add-form">
            <input
              type="text"
              value={newExtName}
              onChange={(e) => setNewExtName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddExternal()}
              placeholder="Nom du traducteur (ex: JohnDoe)"
              className="tags-modal-input"
              style={{ flex: 1 }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddExternal}
              disabled={!newExtName.trim()}
              className="tags-modal-routing-create-btn"
            >
              Créer
            </button>
          </div>
        )}

        {externals.length === 0 && !addingExternal && (
          <div className="tags-modal-muted tags-modal-muted--italic" style={{ padding: '4px 14px 8px' }}>
            Aucun traducteur externe. Cliquez sur « Ajouter » pour en créer un.
          </div>
        )}

        {externals.map((ext) => (
          <MappingRowItem
            key={ext.id}
            label={ext.name}
            hasMapping={!!editExternals[ext.id]?.forum_channel_id?.trim()}
            edit={editExternals[ext.id] ?? emptyEdit}
            tags={tagsForSelect}
            traducteurOptions={f95TraducteurOptions}
            onEditChange={(field, val) => onEditExternal(ext.id, field, val)}
            onSave={() => saveExternal(ext.id)}
            onDelete={() => deleteExternal(ext.id)}
            isExternal
          />
        ))}
    </div>
  );
}
