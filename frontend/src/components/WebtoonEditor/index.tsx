// Vue dédiée publication calendrier (Webtoon / plateformes)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useConfirm } from '../../hooks/useConfirm';

import { useApp } from '../../state/appContext';

import {

  CALENDAR_TEMPLATE_ID,

  computeNextChapter,

  getWebtoonWorkStatusFromTags,

} from '../../state/calendarTemplate';

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

import DateInputWithDayOffset from '../shared/DateInputWithDayOffset';

import TagSelectorModalWebtoon from './TagSelectorModalWebtoon';

import WebtoonSiteLabelField from './WebtoonSiteLabelField';

import { useWebtoonSiteLabelPicker } from '../../state/hooks/useWebtoonSiteLabelPicker';



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

  } = useApp();



  const { showToast } = useToast();

  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const { calendarViewAvailable, isWebtoonViewActive, setWebtoonViewActive } = useWebtoonView();

  const { calendarForumChannelId } = useUserPreferences();

  const { pickerEnabled, recentLabels, recordSiteLabels } = useWebtoonSiteLabelPicker();



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

  const workStatus = useMemo(() => {
    const fromSaved = getWebtoonWorkStatusFromTags(selectedTagIds, savedTags);
    const fromDisplay = getWebtoonWorkStatusFromTags(selectedTagIds, displayTags);
    if (fromSaved !== 'ongoing') return fromSaved;
    return fromDisplay;
  }, [selectedTagIds, savedTags, displayTags]);

  const isFinalWorkStatus = workStatus !== 'ongoing';



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

    if (isFinalWorkStatus && !(inputs['Chapitre_Fin'] || '').trim()) {
      return workStatus === 'abandoned'
        ? 'Renseignez le dernier chapitre (tag Abandonné)'
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



  const handleResetForm = () => {

    resetAllFields();

    setInput('Official_Site_Label', '');

    setInput('Official_Site_Link', '');

    setInput('Scan_Site_Label', '');

    setInput('Scan_Site_Link', '');

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

    const res = await publishPost(undefined, undefined, {

      silentUpdate: true,

      skipVersionControl: true,

    });

    if (res?.ok) {

      recordSiteLabels([

        (inputs['Official_Site_Label'] || '').trim(),

        (inputs['Scan_Site_Label'] || '').trim(),

      ]);

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
          <div className="webtoon-editor__links-col">
            <h5 className="webtoon-editor__links-title">Site officiel</h5>
            <WebtoonSiteLabelField
              value={inputs['Official_Site_Label'] || ''}
              onChange={v => setInput('Official_Site_Label', v)}
              placeholder="Webtoon, Tapas, Kakao…"
              pickerEnabled={pickerEnabled}
              recentLabels={recentLabels}
            />
            <div className="form-field">
              <label className="form-label">Lien</label>
              <input
                value={inputs['Official_Site_Link'] || ''}
                onChange={e => setInput('Official_Site_Link', e.target.value)}
                className="form-input"
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="webtoon-editor__links-col">
            <h5 className="webtoon-editor__links-title">Site scan</h5>
            <WebtoonSiteLabelField
              value={inputs['Scan_Site_Label'] || ''}
              onChange={v => setInput('Scan_Site_Label', v)}
              placeholder="Scan VF, Flame…"
              pickerEnabled={pickerEnabled}
              recentLabels={recentLabels}
            />
            <div className="form-field">
              <label className="form-label">Lien</label>
              <input
                value={inputs['Scan_Site_Link'] || ''}
                onChange={e => setInput('Scan_Site_Link', e.target.value)}
                className="form-input"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        <h4 className="webtoon-editor__block-title">Calendrier des chapitres</h4>

          {isFinalWorkStatus && (
            <p className="webtoon-editor__planning-hint">
              {workStatus === 'abandoned'
                ? 'Tag « Abandonné » actif : indiquez le dernier chapitre de la série. La date de fin est optionnelle.'
                : 'Tag « Terminé » actif : indiquez le dernier chapitre de la série. La date de fin est optionnelle.'}
            </p>
          )}

          <div className="webtoon-editor__planning">

            {!isFinalWorkStatus && (

              <div className="webtoon-editor__planning-section webtoon-editor__planning-section--next">

                <div className="webtoon-editor__plan-field webtoon-editor__plan-field--ch">

                  <label className="form-label" htmlFor="webtoon-ch-actuel" title="Chapitre actuel">

                    Ch. actuel

                  </label>

                  <input

                    id="webtoon-ch-actuel"

                    value={inputs['Chapitre_Actuel'] || ''}

                    onChange={e => handleChapitreActuelChange(e.target.value)}

                    className="form-input"

                    placeholder="52"

                    inputMode="numeric"

                  />

                </div>

                <div className="webtoon-editor__plan-field webtoon-editor__plan-field--ch">

                  <label className="form-label" htmlFor="webtoon-ch-suivant" title="Prochain chapitre">

                    Proch. ch.

                  </label>

                  <input

                    id="webtoon-ch-suivant"

                    value={inputs['Chapitre_Suivant'] || ''}

                    onChange={e => setInput('Chapitre_Suivant', e.target.value)}

                    className="form-input"

                    placeholder="+1"

                    inputMode="numeric"

                  />

                </div>

                <div className="webtoon-editor__plan-field webtoon-editor__plan-field--dates">

                  <label className="form-label" htmlFor="webtoon-date-suivant" title="Date prochaine dispo.">

                    Date proch.

                  </label>

                  <DateInputWithDayOffset

                    layout="planning"

                    id="webtoon-date-suivant"

                    label="Date (prochain)"

                    labelTitle="Date prochaine dispo."

                    value={inputs['Date_Suivant'] || ''}

                    onChange={v => setInput('Date_Suivant', v)}

                  />

                </div>

              </div>

            )}

            <div

              className={`webtoon-editor__planning-section webtoon-editor__planning-section--end${isFinalWorkStatus ? ' webtoon-editor__planning-section--terminated-only' : ''}`}

            >

              <div className="webtoon-editor__plan-field webtoon-editor__plan-field--ch">

                <label className="form-label" htmlFor="webtoon-ch-fin" title="Dernier chapitre">

                  {isFinalWorkStatus ? 'Dernier chapitre' : 'Dern. ch.'}

                </label>

                <input

                  id="webtoon-ch-fin"

                  value={inputs['Chapitre_Fin'] || ''}

                  onChange={e => setInput('Chapitre_Fin', e.target.value)}

                  className="form-input"

                  placeholder="120"

                  inputMode="numeric"

                />

              </div>

              <div className="webtoon-editor__plan-field webtoon-editor__plan-field--dates">

                <label className="form-label" htmlFor="webtoon-date-fin" title="Date fin de série">

                  Date fin{isFinalWorkStatus ? ' (optionnel)' : ''}

                </label>

                <DateInputWithDayOffset

                  layout="planning"

                  id="webtoon-date-fin"

                  label="Date (fin de série)"

                  labelTitle="Date fin de série"

                  value={inputs['Date_Fin'] || ''}

                  onChange={v => setInput('Date_Fin', v)}

                />

              </div>

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


