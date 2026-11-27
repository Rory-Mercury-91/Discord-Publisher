import type { ConfirmOptions } from '../../../hooks/useConfirm';
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
  return (
    <PublicationEditorToolbar
      editingPostId={editingPostId}
      onResetForm={onResetForm}
      confirm={confirm}
      onExitEditMode={onExitEditMode}
      showImport
      onImportData={onImportData}
      publishForMode="translator"
      translatorOptions={translatorOptions}
      selectedTranslatorId={selectedTranslatorId}
      onTranslatorChange={onTranslatorChange}
    />
  );
}
