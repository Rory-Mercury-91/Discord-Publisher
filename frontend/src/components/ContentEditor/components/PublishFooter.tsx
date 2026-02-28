// frontend/src/components/ContentEditorComponents/PublishFooter.tsx
import { useState } from 'react';
import DiscordIcon from '../../../assets/discord-icon.svg';
import type { ConfirmOptions } from '../../../hooks/useConfirm';
import Toggle from '../../Toggle';

interface PublishFooterProps {
  canPublish: boolean;
  publishInProgress: boolean;
  editingPostId: string | null;
  silentUpdateMode: boolean;
  setSilentUpdateMode: (value: boolean) => void;
  rateLimitCooldown: number | null;
  publishTooltipText: string;
  onPublish: (silentUpdate?: boolean) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export default function PublishFooter({
  canPublish,
  publishInProgress,
  editingPostId,
  silentUpdateMode,
  setSilentUpdateMode,
  rateLimitCooldown,
  publishTooltipText,
  onPublish,
  confirm,
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

    const silent = isUpdate ? silentUpdateMode : false;
    await onPublish(silent);
  };

  const isDisabled = publishInProgress || !canPublish;

  return (
    <div className="publish-footer">
      {rateLimitCooldown !== null && (
        <div className="publish-footer__rate-limit">
          ⏳ Rate limit : {rateLimitRemaining}s
        </div>
      )}

      {editingPostId && (
        <Toggle
          checked={silentUpdateMode}
          onChange={setSilentUpdateMode}
          label="Mise à jour silencieuse"
          title="Ne pas envoyer de notification de mise à jour"
        />
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
