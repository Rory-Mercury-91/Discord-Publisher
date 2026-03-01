// Toast affiché après une mise à jour réussie (animation slide + fade out)
interface UpdateSuccessToastProps {
  updateVersion: string | null;
}

export default function UpdateSuccessToast({ updateVersion }: UpdateSuccessToastProps) {
  return (
    <div className="update-toast update-toast--success">
      <div className="update-toast__row update-toast__row--center">
        <div className="update-toast__icon-wrap update-toast__icon-wrap--success">
          ✅
        </div>
        <div className="update-toast__body">
          <div className="update-toast__title">Mise à jour réussie !</div>
          <div className="update-toast__muted">Version {updateVersion} installée</div>
        </div>
      </div>
    </div>
  );
}
