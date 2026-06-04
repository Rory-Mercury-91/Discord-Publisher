/**
 * Conteneur éditeur : les deux vues restent montées (display none) pour éviter le scintillement au toggle.
 */
import { useWebtoonView } from '../../state/webtoonViewContext';
import WebtoonEditor from '../WebtoonEditor';
import ContentEditor from './index';

export default function PublicationEditorPane() {
  const { calendarViewAvailable, isWebtoonViewActive } = useWebtoonView();

  if (!calendarViewAvailable) {
    return <ContentEditor isActive />;
  }

  return (
    <div className="publication-editor-pane">
      <div className="publication-editor-pane__layer" hidden={!isWebtoonViewActive}>
        <WebtoonEditor />
      </div>
      <div className="publication-editor-pane__layer" hidden={isWebtoonViewActive}>
        <ContentEditor isActive={!isWebtoonViewActive} />
      </div>
    </div>
  );
}
