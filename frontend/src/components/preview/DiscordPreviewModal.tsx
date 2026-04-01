import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { useApp } from '../../state/appContext';

import DiscordPreviewHeader from './components/DiscordPreviewHeader';
import DiscordPreviewMessage from './components/DiscordPreviewMessage';
import { replaceEmojis } from './constants/discordEmojis';

type UploadedImage = { id: string; url?: string; name: string; isMain: boolean };

interface DiscordPreviewModalProps {
  preview: string;
  onClose: () => void;
  onCopy: () => void;
  mainImagePath?: string;
}

export default function DiscordPreviewModal({
  preview,
  onClose,
  onCopy,
  mainImagePath,
}: DiscordPreviewModalProps) {
  useEscapeKey(() => onClose(), true);
  useModalScrollLock();

  const { uploadedImages } = useApp();
  const mainImage = mainImagePath
    ? uploadedImages.find((img: UploadedImage) => img.url === mainImagePath)
    : uploadedImages.find((img: UploadedImage) => img.isMain);

  const imagePathToDisplay = mainImage?.url;
  const processedPreview = replaceEmojis(preview);
  const characterCount = preview.length;
  const isOverLimit = characterCount > 2000;

  return (
    <div className="modal" style={{ zIndex: 1000 }} onClick={onClose}>
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#36393f',
          border: '1px solid #202225',
        }}
      >
        <DiscordPreviewHeader
          characterCount={characterCount}
          isOverLimit={isOverLimit}
          onCopy={onCopy}
          onClose={onClose}
        />

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            background: '#36393f',
            padding: '20px 0',
          }}
          className="styled-scrollbar"
        >
          <DiscordPreviewMessage
            processedPreview={processedPreview}
            imagePathToDisplay={imagePathToDisplay}
          />
        </div>
      </div>
    </div>
  );
}
