import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import type { PublishedPost } from '../../../state/appContext';
import type { ProfilePublic, ExternalTranslatorPublic } from '../constants';
import { PREFIX_EXT, PREFIX_PROFILE } from '../constants';

export type TransferSelectionMode = 'all' | 'one' | 'several';

interface TransferOwnershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  submitting: boolean;
  profileId: string | undefined;
  profilePseudo: string | undefined;
  isMasterAdmin: boolean;
  allProfiles: ProfilePublic[];
  externalTranslators: ExternalTranslatorPublic[];
  sourceId: string;
  targetId: string;
  selectionMode: TransferSelectionMode;
  postIds: string[];
  postsBySourceAuthor: PublishedPost[];
  onSourceChange: (id: string) => void;
  onTargetChange: (id: string) => void;
  onSelectionModeChange: (mode: TransferSelectionMode) => void;
  onPostIdsChange: (ids: string[]) => void;
  onConfirm: () => void;
}

export default function TransferOwnershipModal({
  isOpen,
  onClose,
  submitting,
  profileId,
  profilePseudo,
  isMasterAdmin,
  allProfiles,
  externalTranslators,
  sourceId,
  targetId,
  selectionMode,
  postIds,
  postsBySourceAuthor,
  onSourceChange,
  onTargetChange,
  onSelectionModeChange,
  onPostIdsChange,
  onConfirm,
}: TransferOwnershipModalProps) {
  useEscapeKey(() => !submitting && onClose(), isOpen);
  useModalScrollLock(isOpen);

  if (!isOpen) return null;

  const sourceIsProfile = sourceId.startsWith(PREFIX_PROFILE);
  const sourceIsExt = sourceId.startsWith(PREFIX_EXT);
  const sourceProfileId = sourceIsProfile ? sourceId.slice(PREFIX_PROFILE.length) : '';
  const sourceExtId = sourceIsExt ? sourceId.slice(PREFIX_EXT.length) : '';
  const sourceDiscordId = sourceProfileId
    ? allProfiles.find((p) => p.id === sourceProfileId)?.discord_id ?? ''
    : '';
  const hasSourceSelected =
    (sourceIsProfile && sourceDiscordId) || (sourceIsExt && sourceExtId);
  const canConfirm =
    sourceId &&
    targetId &&
    (selectionMode === 'all' || postIds.length > 0);

  const handleSourceChange = (id: string) => {
    onSourceChange(id);
    onSelectionModeChange('all');
    onPostIdsChange([]);
  };

  return (
    <div className="history-transfer-backdrop">
      <div className="history-transfer-panel" onClick={(e) => e.stopPropagation()}>
        <h4 className="history-transfer-panel__title">
          🔄 Transférer la propriété des publications
        </h4>
        <p className="history-transfer-panel__desc">
          {isMasterAdmin
            ? "Choisissez l'auteur source (profil ou traducteur externe), éventuellement un post précis, puis l'auteur cible."
            : 'Transférez vos publications vers un autre auteur (profil ou traducteur externe).'}
        </p>
        <div className="history-transfer-panel__fields">
          <label className="history-transfer-panel__label">Auteur source</label>
          <select
            className="history-transfer-panel__select"
            value={sourceId}
            onChange={(e) => handleSourceChange(e.target.value)}
            disabled={!isMasterAdmin}
          >
            <option value="">— Choisir —</option>
            {isMasterAdmin ? (
              <>
                {allProfiles.map((p) => (
                  <option key={PREFIX_PROFILE + p.id} value={PREFIX_PROFILE + p.id}>
                    👤 {p.pseudo || p.discord_id || p.id}
                  </option>
                ))}
                {externalTranslators.map((ext) => (
                  <option key={PREFIX_EXT + ext.id} value={PREFIX_EXT + ext.id}>
                    🔧 {ext.name}
                  </option>
                ))}
              </>
            ) : (
              profileId && (
                <option value={PREFIX_PROFILE + profileId}>
                  👤 Moi ({profilePseudo || profileId})
                </option>
              )
            )}
          </select>

          {hasSourceSelected && (
            <>
              <label className="history-transfer-panel__label">
                Que transférer ? ({postsBySourceAuthor.length} publication
                {postsBySourceAuthor.length !== 1 ? 's' : ''})
              </label>
              <div className="history-transfer-panel__scope">
                <label className="history-transfer-panel__radio">
                  <input
                    type="radio"
                    name="transferScope"
                    checked={selectionMode === 'all'}
                    onChange={() => {
                      onSelectionModeChange('all');
                      onPostIdsChange([]);
                    }}
                  />
                  <span>Tous</span>
                </label>
                <label className="history-transfer-panel__radio">
                  <input
                    type="radio"
                    name="transferScope"
                    checked={selectionMode === 'one'}
                    onChange={() => {
                      onSelectionModeChange('one');
                      onPostIdsChange(postIds.length === 1 ? postIds : []);
                    }}
                  />
                  <span>Un seul</span>
                </label>
                <label className="history-transfer-panel__radio">
                  <input
                    type="radio"
                    name="transferScope"
                    checked={selectionMode === 'several'}
                    onChange={() => onSelectionModeChange('several')}
                  />
                  <span>Plusieurs</span>
                </label>
                {selectionMode === 'one' && (
                  <div className="history-transfer-panel__list">
                    {postsBySourceAuthor.map((post) => (
                      <label
                        key={post.id}
                        className="history-transfer-panel__option"
                      >
                        <input
                          type="radio"
                          name="transferOne"
                          checked={postIds[0] === post.id}
                          onChange={() => onPostIdsChange([post.id])}
                        />
                        <span className="history-transfer-panel__option-text">
                          {post.title || post.id}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {selectionMode === 'several' && (
                  <div className="history-transfer-panel__list">
                    {postsBySourceAuthor.map((post) => (
                      <label
                        key={post.id}
                        className="history-transfer-panel__option"
                      >
                        <input
                          type="checkbox"
                          checked={postIds.includes(post.id)}
                          onChange={(e) =>
                            onPostIdsChange(
                              e.target.checked
                                ? [...postIds, post.id]
                                : postIds.filter((id) => id !== post.id)
                            )
                          }
                        />
                        <span className="history-transfer-panel__option-text">
                          {post.title || post.id}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <label className="history-transfer-panel__label">Auteur cible</label>
          <select
            className="history-transfer-panel__select"
            value={targetId}
            onChange={(e) => onTargetChange(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {allProfiles
              .filter((p) => PREFIX_PROFILE + p.id !== sourceId)
              .map((p) => (
                <option key={PREFIX_PROFILE + p.id} value={PREFIX_PROFILE + p.id}>
                  👤 {p.pseudo || p.discord_id || p.id}
                </option>
              ))}
            {externalTranslators
              .filter((ext) => PREFIX_EXT + ext.id !== sourceId)
              .map((ext) => (
                <option key={PREFIX_EXT + ext.id} value={PREFIX_EXT + ext.id}>
                  🔧 {ext.name}
                </option>
              ))}
          </select>
        </div>
        <div className="history-transfer-panel__actions">
          <button
            type="button"
            className="history-transfer-panel__btn history-transfer-panel__btn--cancel"
            onClick={onClose}
            disabled={submitting}
          >
            Annuler
          </button>
          <button
            type="button"
            className="history-transfer-panel__btn history-transfer-panel__btn--confirm"
            onClick={onConfirm}
            disabled={submitting || !canConfirm}
          >
            {submitting ? '⏳ Transfert…' : 'Confirmer le transfert'}
          </button>
        </div>
      </div>
    </div>
  );
}
