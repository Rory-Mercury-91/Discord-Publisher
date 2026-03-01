import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { MARKDOWN_DOCS_URL, MARKDOWN_EXAMPLES } from './constants';
import MarkdownHelpSection from './components/MarkdownHelpSection';

interface MarkdownHelpModalProps {
  onClose?: () => void;
}

export default function MarkdownHelpModal({ onClose }: MarkdownHelpModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  return (
    <div className="modal">
      <div className="panel md-help-panel" onClick={e => e.stopPropagation()}>
        <div className="md-help-header">
          <h3 className="md-help-header__title">❓ Aide Markdown</h3>
        </div>

        <div className="md-help-tip">
          <strong>💡 Astuce :</strong> Discord supporte une grande partie de la syntaxe Markdown.
          Vous pouvez utiliser ces balises pour formater vos publications.
        </div>

        <div className="md-help-body">
          <div className="md-help-sections">
            {MARKDOWN_EXAMPLES.map((section, idx) => (
              <MarkdownHelpSection key={idx} section={section} />
            ))}
          </div>
        </div>

        <div className="md-help-footer">
          <span>
            📚 Pour plus d&apos;infos :{' '}
            <a
              href={MARKDOWN_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="md-help-footer__link"
            >
              Documentation Discord
            </a>
          </span>
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost">
            ↩️ Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
