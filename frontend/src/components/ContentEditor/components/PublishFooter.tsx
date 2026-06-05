// frontend/src/components/ContentEditorComponents/PublishFooter.tsx
import { useState } from 'react';
import DiscordIcon from '../../../assets/discord-icon.svg';
import type { ConfirmOptions } from '../../../hooks/useConfirm';
import Toggle from '../../shared/Toggle';

interface PublishFooterProps {
  canPublish: boolean;
  publishInProgress: boolean;
  editingPostId: string | null;
  silentUpdateMode: boolean;
  setSilentUpdateMode: (value: boolean) => void;
  skipVersionControlMode: boolean;
  setSkipVersionControlMode: (value: boolean) => void;
  rateLimitCooldown: number | null;
  publishTooltipText: string;
  onPublish: (silentUpdate?: boolean, skipVersionControl?: boolean) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Vue Webtoon : publication silencieuse + sans contrôle de version F95. */
  webtoonMode?: boolean;
  /** Suivi d'œuvres : contrôle auto chapitres (bot 00h00). */
  chapterControlMode?: boolean;
  setChapterControlMode?: (value: boolean) => void;
  showChapterControlToggle?: boolean;
  /** false = toggle visible mais désactivé (ex. tag Incomplet, En pause…) */
  chapterControlAvailable?: boolean;
}

export default function PublishFooter({
  canPublish,
  publishInProgress,
  editingPostId,
  silentUpdateMode,
  setSilentUpdateMode,
  skipVersionControlMode,
  setSkipVersionControlMode,
  rateLimitCooldown,
  publishTooltipText,
  onPublish,
  confirm,
  webtoonMode = false,
  chapterControlMode = true,
  setChapterControlMode,
  showChapterControlToggle = false,
  chapterControlAvailable = true,
}: PublishFooterProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const rateLimitRemaining = rateLimitCooldown
    ? Math.ceil((rateLimitCooldown - Date.now()) / 1000)
    : 0;

  const handleClick = async () => {
    const isUpdate = !!editingPostId;
    const title = isUpdate ? 'Mettre à jour le post' : 'Publier sur Discord';
    const message = isUpdate
      ? 'Modifier ce post sur Discord ?'
      : 'Envoyer ce nouveau post sur Discord ?';

    const ok = await confirm({
      title,
      message,
      confirmText: isUpdate ? 'Mettre à jour' : 'Publier',
      cancelText: 'Annuler',
      type: 'info',
    });

    if (!ok) return;

    if (webtoonMode) {
      await onPublish(true, true);
    } else {
      const silent = isUpdate ? silentUpdateMode : false;
      await onPublish(silent, skipVersionControlMode);
    }
  };

  const isDisabled = publishInProgress || !canPublish;
  const showToggles =
    !webtoonMode || (webtoonMode && showChapterControlToggle && !!setChapterControlMode);

  return (
    <div className="publish-footer">
      {rateLimitCooldown !== null && (
        <div className="publish-footer__rate-limit">
          ⏳ Rate limit : {rateLimitRemaining}s
        </div>
      )}

      {showToggles && (
      <div className="publish-footer__toggles">
        {!webtoonMode && (
          <>
            {editingPostId && (
              <Toggle
                checked={silentUpdateMode}
                onChange={setSilentUpdateMode}
                label="Mise à jour silencieuse"
                title="Ne pas envoyer de notification de mise à jour"
              />
            )}
            <Toggle
              checked={skipVersionControlMode}
              onChange={setSkipVersionControlMode}
              label="Ne pas appliquer le contrôle de version"
              title="Exclure ce post du contrôle des versions F95 (le script ne le vérifiera pas)"
            />
          </>
        )}
        {webtoonMode && showChapterControlToggle && setChapterControlMode && (
          <Toggle
            checked={chapterControlMode}
            onChange={setChapterControlMode}
            disabled={!chapterControlAvailable}
            label="Contrôle automatique des chapitres"
            title="Le bot avance chapitres et dates chaque nuit à 00h00 (si la date de sortie est dépassée)"
          />
        )}
      </div>
      )}

      <div
        className="relative"
        onMouseEnter={() => (isDisabled && publishTooltipText) && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {showTooltip && publishTooltipText && (
          <div className="publish-footer__tooltip">
            ⚠️ {publishTooltipText}
          </div>
        )}

        <button
          disabled={isDisabled}
          onClick={handleClick}
          className={`form-btn form-btn--publish ${editingPostId ? 'form-btn--publish-update' : ''}`}
        >
          {publishInProgress ? (
            <span>⏳ Publication en cours...</span>
          ) : editingPostId ? (
            <>
              <img src={DiscordIcon} alt="Discord" className="icon-discord" />
              <span>Mettre à jour le post</span>
            </>
          ) : (
            <>
              <img src={DiscordIcon} alt="Discord" className="icon-discord" />
              <span>Publier sur Discord</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
