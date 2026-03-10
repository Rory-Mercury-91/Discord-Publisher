import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDraggableResizable } from '../../hooks/useDraggableResizable';
import { MARKDOWN_DOCS_URL, MARKDOWN_EXAMPLES } from './constants';
import MarkdownHelpSection from './components/MarkdownHelpSection';

interface MarkdownHelpModalProps {
  onClose?: () => void;
}

const DEFAULT_W = 960;
const DEFAULT_H = 660;

export default function MarkdownHelpModal({ onClose }: MarkdownHelpModalProps) {
  const { pos, setPos, size, handleDragMouseDown, handleResizeMouseDown } = useDraggableResizable({
    defaultSize: { w: DEFAULT_W, h: DEFAULT_H },
    minSize:     { w: 560,       h: 400 },
  });

  useEffect(() => {
    setPos({
      x: Math.max(0, Math.round((window.innerWidth  - DEFAULT_W) / 2)),
      y: Math.max(0, Math.round((window.innerHeight - DEFAULT_H) / 2 - 40)),
    });
  }, [setPos]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const panel = (
    <div
      className="help-float"
      style={pos
        ? { left: pos.x, top: pos.y, width: size.w, height: size.h }
        : { visibility: 'hidden' }
      }
      role="dialog"
      aria-labelledby="md-help-float-title"
    >
      {/* Barre de titre — zone de drag */}
      <div className="help-float__titlebar" onMouseDown={handleDragMouseDown}>
        <span id="md-help-float-title" className="help-float__title">❓ Aide Markdown</span>
        <button
          type="button"
          className="f95-help-float__close"
          onClick={onClose}
          title="Fermer"
        >
          ✕
        </button>
      </div>

      {/* Astuce */}
      <div className="md-help-tip md-help-tip--float">
        <strong>💡 Astuce :</strong> Discord supporte une grande partie de la syntaxe Markdown.
        Vous pouvez utiliser ces balises pour formater vos publications.
      </div>

      {/* Corps scrollable */}
      <div className="help-content styled-scrollbar md-help-float-body">
        <div className="md-help-sections">
          {MARKDOWN_EXAMPLES.map((section, idx) => (
            <MarkdownHelpSection key={idx} section={section} />
          ))}
        </div>
      </div>

      {/* Pied de page */}
      <div className="help-float__footer">
        <span className="md-help-footer__link-wrap">
          📚{' '}
          <a
            href={MARKDOWN_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="md-help-footer__link"
          >
            Documentation Discord
          </a>
        </span>
        <button type="button" onClick={onClose} className="form-btn form-btn--ghost form-btn--sm">
          ↩️ Fermer
        </button>
      </div>

      {/* Poignée de redimensionnement */}
      <div className="float-resize-handle" onMouseDown={handleResizeMouseDown} />
    </div>
  );

  return createPortal(panel, document.body);
}
