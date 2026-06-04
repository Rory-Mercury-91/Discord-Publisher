import type { ConfirmOptions } from '../../../hooks/useConfirm';
import { useWebtoonView } from '../../../state/webtoonViewContext';
import PublicationEditorToolbar from './PublicationEditorToolbar';

interface EditorHeaderProps {
  editingPostId: string | null;
  translatorOptions: Array<{ id: string; name: string; kind: 'profile' | 'external' }>;
  selectedTranslatorId: string;
  onTranslatorChange: (id: string) => void;
  onImportData: () => void;
  onResetForm: () => void;
  onExitEditMode: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export default function EditorHeader({
  editingPostId,
  translatorOptions,
  selectedTranslatorId,
  onTranslatorChange,
  onImportData,
  onResetForm,
  onExitEditMode,
  confirm,
}: EditorHeaderProps) {
  const { calendarViewAvailable, isWebtoonViewActive, setWebtoonViewActive } = useWebtoonView();

  return (
    <PublicationEditorToolbar
      editingPostId={editingPostId}
      onResetForm={onResetForm}
      confirm={confirm}
      onExitEditMode={onExitEditMode}
      showImport
      onImportData={onImportData}
      showWebtoonViewToggle={calendarViewAvailable}
      webtoonViewActive={isWebtoonViewActive}
      onWebtoonViewChange={setWebtoonViewActive}
      publishForMode="translator"
      translatorOptions={translatorOptions}
      selectedTranslatorId={selectedTranslatorId}
      onTranslatorChange={onTranslatorChange}
    />
  );
}
