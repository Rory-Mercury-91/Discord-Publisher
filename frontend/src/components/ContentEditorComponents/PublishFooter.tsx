// frontend/src/components/ContentEditorComponents/PublishFooter.tsx
import { useState } from 'react';
import DiscordIcon from '../../assets/discord-icon.svg';
import type { ConfirmOptions } from '../../hooks/useConfirm';
import Toggle from '../Toggle';

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
    <div style={{
      marginTop: 8,
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      paddingTop: 12,
      borderTop: '1px solid var(--border)'
    }}>
      {rateLimitCooldown !== null && (
        <div style={{ color: 'var(--error)', fontSize: 13, fontWeight: 700 }}>
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
        style={{ position: 'relative' }}
        onMouseEnter={() => (isDisabled && publishTooltipText) && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {showTooltip && publishTooltipText && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 100,
            pointerEvents: 'none',
          }}>
            ⚠️ {publishTooltipText}
          </div>
        )}

        <button
          disabled={isDisabled}
          onClick={handleClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '12px 32px',
            fontSize: 15,
            fontWeight: 700,
            background: isDisabled
              ? 'rgba(148,163,184,0.4)'
              : editingPostId
                ? '#f59e0b'
                : '#5865F2',
            color: 'white',
            minWidth: '220px',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            border: 'none',
            borderRadius: 6,
            transition: 'opacity 0.15s',
          }}
        >
          {publishInProgress ? (
            <span>⏳ Publication en cours...</span>
          ) : editingPostId ? (
            <>
              <img
                src={DiscordIcon}
                alt="Discord"
                style={{
                  width: 20,
                  height: 20,
                  filter: 'brightness(0) invert(1)'
                }}
              />
              <span>Mettre à jour le post</span>
            </>
          ) : (
            <>
              <img
                src={DiscordIcon}
                alt="Discord"
                style={{
                  width: 20,
                  height: 20,
                  filter: 'brightness(0) invert(1)'
                }}
              />
              <span>Publier sur Discord</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
