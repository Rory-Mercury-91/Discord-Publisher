// Vue dédiée publication calendrier (Webtoon / plateformes)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { useApp } from '../../state/appContext';
import { CALENDAR_TEMPLATE_ID, computeNextChapter } from '../../state/calendarTemplate';
import { useUserPreferences } from '../../state/hooks/useUserPreferences';
import { useForumChannelTagsForEditor } from '../../state/hooks/useForumChannelTags';
import { useWebtoonView } from '../../state/webtoonViewContext';
import ConfirmModal from '../Modals/ConfirmModal';
import HeaderGridSection from '../ContentEditor/components/HeaderGridSection';
import PublicationEditorToolbar from '../ContentEditor/components/PublicationEditorToolbar';
import PublishFooter from '../ContentEditor/components/PublishFooter';
import SynopsisSection from '../ContentEditor/components/SynopsisSection';
import { useToast } from '../shared/ToastProvider';
import {
  computeTagSelectorPositionFromPreview,
  filterWebtoonSelectableTagIds,
  isAutoInjectedTagType,
  WEBTOON_TAGS_MAX,
} from '../tags/constants';
import TagSelectorModalWebtoon from './TagSelectorModalWebtoon';

export default function WebtoonEditor() {
  const {
    inputs,
    setInput,
    postTitle,
    postTags,
    setPostTags,
    publishPost,
    publishInProgress,
    templates,
    currentTemplateIdx,
    editingPostId,
    setEditingPostId,
    setEditingPostData,
    rateLimitCooldown,
    resetAllFields,
    uploadedImages,
    addImageFromUrl,
    removeImage,
    savedTags,
  } = useApp();

  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const { calendarViewAvailable, isWebtoonViewActive, setWebtoonViewActive } = useWebtoonView();
  const { calendarForumChannelId } = useUserPreferences();

  const selectedTagIds = useMemo(() => {
    const ids = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
    return filterWebtoonSelectableTagIds(ids, savedTags);
  }, [postTags, savedTags]);

  useEffect(() => {
    if (!isWebtoonViewActive) return;
    const ids = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
    const cleaned = filterWebtoonSelectableTagIds(ids, savedTags);
    if (cleaned.length !== ids.length) {
      setPostTags(cleaned.join(','));
    }
  }, [isWebtoonViewActive, postTags, savedTags, setPostTags]);

  const { displayTags } = useForumChannelTagsForEditor(
    calendarForumChannelId,
    selectedTagIds
  );

  const [showTagSelector, setShowTagSelector] = useState(false);
  const [tagSelectorPosition, setTagSelectorPosition] = useState<
    { top: number; left: number; width: number } | undefined
  >();
  const [imageUrlInput, setImageUrlInput] = useState('');

  const overviewRef = useRef<HTMLTextAreaElement>(null);
  const currentTemplate = templates[currentTemplateIdx];
  const isCalendarTemplate =
    currentTemplate?.id === CALENDAR_TEMPLATE_ID || currentTemplate?.type === 'calendar';

  const canPublish = isCalendarTemplate && rateLimitCooldown === null;

  const publishTooltipText = (() => {
    if (publishInProgress) return 'Publication en cours…';
    if (!isCalendarTemplate) return 'Template calendrier requis';
    if (rateLimitCooldown !== null) {
      return `Rate limit : patientez ${Math.ceil((rateLimitCooldown - Date.now()) / 1000)}s`;
    }
    if (!(inputs['Nom_Oeuvre'] || '').trim()) return "Renseignez le nom de l'œuvre";
    return '';
  })();

  const handleChapitreActuelChange = useCallback(
    (value: string) => {
      setInput('Chapitre_Actuel', value);
      const next = computeNextChapter(value);
      if (next) setInput('Chapitre_Suivant', next);
    },
    [setInput]
  );

  const handleOpenTagSelector = () => {
    setTagSelectorPosition(computeTagSelectorPositionFromPreview());
    setShowTagSelector(true);
  };

  const handleSelectTag = (tagId: string) => {
    const tag = savedTags.find(
      t => (t.id || t.name) === tagId || String(t.discordTagId ?? '') === tagId
    );
    if (!tag || isAutoInjectedTagType(tag.tagType)) return;

    const current = filterWebtoonSelectableTagIds(
      postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [],
      savedTags
    );

    if (!current.includes(tagId)) {
      if (current.length >= WEBTOON_TAGS_MAX) {
        showToast(`Maximum ${WEBTOON_TAGS_MAX} tags actifs`, 'warning');
        return;
      }
      setPostTags([...current, tagId].join(','));
    }
    setShowTagSelector(false);
  };

  const handleRemoveTag = (tagId: string) => {
    const curr = filterWebtoonSelectableTagIds(
      postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [],
      savedTags
    );
    setPostTags(curr.filter(id => id !== tagId).join(','));
  };

  const handleResetForm = () => {
    resetAllFields();
    setInput('Book_Platform', 'Webtoon');
    setPostTags('');
    showToast('Formulaire vidé', 'success');
  };

  const handleAddImage = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    addImageFromUrl(url);
    setImageUrlInput('');
  };

  const onPublish = async () => {
    // Auteur historique : traducteur externe du salon Webtoon (résolu dans publishPost)
    const res = await publishPost(undefined, undefined, {
      silentUpdate: true,
      skipVersionControl: true,
    });
    if (res?.ok) {
      showToast(editingPostId ? 'Post mis à jour !' : 'Post publié avec succès !', 'success');
      if (editingPostId) {
        setEditingPostId(null);
        setEditingPostData(null);
      }
    }
  };

  return (
    <div className="editor-main webtoon-editor">
      <PublicationEditorToolbar
        editingPostId={editingPostId}
        onResetForm={handleResetForm}
        confirm={confirm}
        showWebtoonViewToggle={calendarViewAvailable}
        webtoonViewActive={isWebtoonViewActive}
        onWebtoonViewChange={setWebtoonViewActive}
        publishForMode="webtoon"
      />

      <div className="editor-content-grid webtoon-editor__grid">
        <HeaderGridSection
          postTitle={postTitle}
          gameName={inputs['Nom_Oeuvre'] || ''}
          onGameNameChange={v => setInput('Nom_Oeuvre', v)}
          gameNameDisabled={false}
          gameNameLabel="Nom de l'œuvre"
          imageUrlInput={imageUrlInput}
          onImageUrlInputChange={setImageUrlInput}
          onAddImage={handleAddImage}
          selectedTagIds={selectedTagIds}
          savedTags={displayTags}
          onOpenTagSelector={handleOpenTagSelector}
          onRemoveTag={handleRemoveTag}
          uploadedImages={uploadedImages}
          removeImage={removeImage}
          tagsAllowRemoveAll
          tagButtonClassName="webtoon-editor__tags-btn"
        />

        <div className="form-grid webtoon-editor__chapters-row">
          <div className="form-field">
            <label className="form-label">Chapitre actuel</label>
            <input
              value={inputs['Chapitre_Actuel'] || ''}
              onChange={e => handleChapitreActuelChange(e.target.value)}
              className="form-input"
              placeholder="ex: 45"
            />
          </div>
          <div className="form-field">
            <label className="form-label">Prochain chapitre</label>
            <input
              value={inputs['Chapitre_Suivant'] || ''}
              onChange={e => setInput('Chapitre_Suivant', e.target.value)}
              className="form-input"
              placeholder="Calcul auto (+1)"
            />
          </div>
          <div className="form-field">
            <label className="form-label">Date prochaine dispo.</label>
            <input
              type="date"
              value={inputs['Date_Suivant'] || ''}
              onChange={e => setInput('Date_Suivant', e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label className="form-label">Dernier chapitre</label>
            <input
              value={inputs['Chapitre_Fin'] || ''}
              onChange={e => setInput('Chapitre_Fin', e.target.value)}
              className="form-input"
              placeholder="ex: 120"
            />
          </div>
          <div className="form-field">
            <label className="form-label">Date fin de série</label>
            <input
              type="date"
              value={inputs['Date_Fin'] || ''}
              onChange={e => setInput('Date_Fin', e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        <div className="form-grid form-grid--2col webtoon-editor__row">
          <div className="form-field">
            <label className="form-label">Site</label>
            <input
              value={inputs['Book_Platform'] || ''}
              onChange={e => setInput('Book_Platform', e.target.value)}
              className="form-input"
              placeholder="Webtoon, Tapas, Kakao…"
            />
          </div>
          <div className="form-field">
            <label className="form-label">Lien de l&apos;œuvre</label>
            <input
              value={inputs['Book_Link'] || ''}
              onChange={e => setInput('Book_Link', e.target.value)}
              className="form-input"
              placeholder="https://..."
            />
          </div>
        </div>

        <SynopsisSection
          ref={overviewRef}
          value={inputs['Synopsis_Oeuvre'] || ''}
          onChange={v => setInput('Synopsis_Oeuvre', v)}
          disabled={false}
          label="Synopsis"
        />

        <PublishFooter
          canPublish={canPublish && !!(inputs['Nom_Oeuvre'] || '').trim()}
          publishInProgress={publishInProgress}
          editingPostId={editingPostId}
          silentUpdateMode={false}
          setSilentUpdateMode={() => {}}
          skipVersionControlMode
          setSkipVersionControlMode={() => {}}
          rateLimitCooldown={rateLimitCooldown}
          publishTooltipText={publishTooltipText}
          onPublish={onPublish}
          confirm={confirm}
          webtoonMode
        />
      </div>

      <TagSelectorModalWebtoon
        isOpen={showTagSelector}
        onClose={() => setShowTagSelector(false)}
        onSelectTag={handleSelectTag}
        selectedTagIds={selectedTagIds}
        position={tagSelectorPosition}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
