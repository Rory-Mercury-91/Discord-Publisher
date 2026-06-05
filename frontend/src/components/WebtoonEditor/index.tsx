// Vue dédiée publication calendrier (Webtoon / plateformes)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useConfirm } from '../../hooks/useConfirm';

import { useApp } from '../../state/appContext';

import {

  CALENDAR_TEMPLATE_ID,

  computeNextChapter,

} from '../../state/calendarTemplate';

import { PROGRESS_UNIT_OPTIONS } from '../../state/workTracking/registry';
import { resolveWorkTrackingFromTags } from '../../state/workTracking/resolveFromTags';
import type { ProgressUnit } from '../../state/workTracking/types';
import WorkTrackingPlanningSection from './WorkTrackingPlanningSection';

import { useUserPreferences } from '../../state/hooks/useUserPreferences';

import { useForumChannelTagsForEditor } from '../../state/hooks/useForumChannelTags';

import { useWebtoonView } from '../../state/webtoonViewContext';

import ConfirmModal from '../Modals/ConfirmModal';

import WebtoonIdentitySection from './WebtoonIdentitySection';


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

import WorkTrackingOfficialLinkSection from './WorkTrackingOfficialLinkSection';
import WorkTrackingScanLinksSection from './WorkTrackingScanLinksSection';

import { applyWorkImportAsync, isWorkImportPayload } from '../../state/workTracking/applyWorkImport';
import { resolveWorkImagePreview } from '../../state/workTracking/resolveWorkImage';



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

    setPreviewOverride,

    rateLimitCooldown,

    resetAllFields,

    uploadedImages,

    addImageFromUrl,

    removeImage,

    savedTags,

    additionalScanLinks,

    addAdditionalScanLink,

    updateAdditionalScanLink,

    deleteAdditionalScanLink,

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

  const resolvedWork = useMemo(
    () => resolveWorkTrackingFromTags(selectedTagIds, savedTags),
    [selectedTagIds, savedTags]
  );

  const workStatus = resolvedWork.status;
  const isFinalWorkStatus = workStatus === 'completed' || workStatus === 'abandoned';
  const chapterControlAvailable = workStatus === 'ongoing';

  const progressUnit = ((inputs.Progress_Unit as ProgressUnit) || 'chapter') as ProgressUnit;

  const chapterControlEnabled =
    chapterControlAvailable && inputs.Chapter_Control_Enabled !== 'false';

  useEffect(() => {
    setInput('Chapter_Control_Enabled', chapterControlAvailable ? 'true' : 'false');
  }, [workStatus, chapterControlAvailable, setInput]);



  const [showTagSelector, setShowTagSelector] = useState(false);

  const [tagSelectorPosition, setTagSelectorPosition] = useState<

    { top: number; left: number; width: number } | undefined

  >();

  const [imageUrlInput, setImageUrlInput] = useState('');



  const overviewRef = useRef<HTMLTextAreaElement>(null);

  const currentTemplate = templates[currentTemplateIdx];

  const isWorkTemplate =
    currentTemplate?.id === CALENDAR_TEMPLATE_ID ||
    currentTemplate?.type === 'calendar' ||
    currentTemplate?.type === 'work_tracking';

  const canPublish = isWorkTemplate && rateLimitCooldown === null;



  const publishTooltipText = (() => {

    if (publishInProgress) return 'Publication en cours…';

    if (!isWorkTemplate) return 'Template suivi d\'œuvres requis';

    if (rateLimitCooldown !== null) {

      return `Rate limit : patientez ${Math.ceil((rateLimitCooldown - Date.now()) / 1000)}s`;

    }

    if (!(inputs['Nom_Oeuvre'] || '').trim()) return "Renseignez le nom de l'œuvre";

    if (isFinalWorkStatus && !(inputs.Chapitre_Fin || '').trim()) {
      return workStatus === 'abandoned'
        ? 'Renseignez le dernier chapitre (tag Abandonnée)'
        : 'Renseignez le dernier chapitre (tag Terminé)';
    }

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



  const handlePasteImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return showToast('Presse-papier vide', 'error');

      const data = JSON.parse(text);
      if (!isWorkImportPayload(data)) {
        return showToast('Format JSON non reconnu (export Nautiljon ou WEBTOON attendu)', 'error');
      }

      const { imageOk } = await applyWorkImportAsync(data, { setInput, addImageFromUrl });
      showToast(
        imageOk ? 'Données importées avec succès !' : 'Données importées (couverture non chargée)',
        imageOk ? 'success' : 'warning',
      );
    } catch {
      showToast('Format JSON invalide', 'error');
    }
  };

  const handleResetForm = () => {

    resetAllFields();

    setInput('Official_Site_Label', '');

    setInput('Official_Site_Link', '');

    setPostTags('');

    showToast('Formulaire vidé', 'success');

  };



  const handleAddImage = async () => {
    const url = imageUrlInput.trim();
    if (!url) return;

    const resolved = await resolveWorkImagePreview(url);
    if (resolved) {
      addImageFromUrl(resolved.sourceUrl, { previewUrl: resolved.previewUrl });
    } else {
      addImageFromUrl(url);
    }
    setImageUrlInput('');
  };



  const onPublish = async () => {

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

        showImport

        onImportData={handlePasteImport}

        onResetForm={handleResetForm}

        onExitEditMode={() => {

          setEditingPostId(null);

          setEditingPostData(null);

          setPreviewOverride(null);

        }}

        confirm={confirm}

        showWebtoonViewToggle={calendarViewAvailable}

        webtoonViewActive={isWebtoonViewActive}

        onWebtoonViewChange={setWebtoonViewActive}

        publishForMode="webtoon"

      />



      <div className="editor-content-grid webtoon-editor__grid">
        <WebtoonIdentitySection
          postTitle={postTitle}
          gameName={inputs['Nom_Oeuvre'] || ''}
          onGameNameChange={v => setInput('Nom_Oeuvre', v)}
          imageUrlInput={imageUrlInput}
          onImageUrlInputChange={setImageUrlInput}
          onAddImage={handleAddImage}
          selectedTagIds={selectedTagIds}
          savedTags={displayTags}
          onOpenTagSelector={handleOpenTagSelector}
          onRemoveTag={handleRemoveTag}
          uploadedImages={uploadedImages}
          removeImage={removeImage}
        />

        <h4 className="webtoon-editor__block-title">Liens de publication</h4>
        <div className="webtoon-editor__links-row">
          <WorkTrackingOfficialLinkSection inputs={inputs} setInput={setInput} />
          <WorkTrackingScanLinksSection
            inputs={inputs}
            setInput={setInput}
            additionalScanLinks={additionalScanLinks}
            onAdd={addAdditionalScanLink}
            onUpdate={updateAdditionalScanLink}
            onDelete={deleteAdditionalScanLink}
          />
        </div>

        <div className="webtoon-editor__meta-row">
          <div className="form-field">
            <label className="form-label" htmlFor="webtoon-genres">
              Genres / Thèmes
            </label>
            <input
              id="webtoon-genres"
              value={inputs.Genres_Themes || ''}
              onChange={e => setInput('Genres_Themes', e.target.value)}
              className="form-input"
              placeholder="Action - Fantastique - Romance"
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="webtoon-progress-unit">
              Unité de progression
            </label>
            <select
              id="webtoon-progress-unit"
              className="form-input"
              value={progressUnit}
              onChange={e => setInput('Progress_Unit', e.target.value)}
            >
              {PROGRESS_UNIT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <h4 className="webtoon-editor__block-title">Rythme de publication</h4>

        <WorkTrackingPlanningSection
          workStatus={workStatus}
          progressUnit={progressUnit}
          inputs={inputs}
          setInput={setInput}
          onChapitreActuelChange={handleChapitreActuelChange}
        />

        <SynopsisSection
          ref={overviewRef}
          value={inputs['Synopsis_Oeuvre'] || ''}
          onChange={v => setInput('Synopsis_Oeuvre', v)}
          disabled={false}
          label="Synopsis"
        />

        <PublishFooter

          canPublish={

            canPublish &&

            !!(inputs['Nom_Oeuvre'] || '').trim() &&

            (!isFinalWorkStatus || !!(inputs['Chapitre_Fin'] || '').trim())

          }

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
          showChapterControlToggle
          chapterControlAvailable={chapterControlAvailable}
          chapterControlMode={chapterControlEnabled}
          setChapterControlMode={v => setInput('Chapter_Control_Enabled', v ? 'true' : 'false')}
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


