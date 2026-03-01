export default function ListFormPlaceholder() {
  return (
    <div className="list-form-placeholder">
      <span className="list-form-placeholder__icon">📋</span>
      <p className="list-form-placeholder__text">
        Aucune URL de formulaire renseignée. Demandez à l&apos;administrateur de
        la configurer dans <strong>Configuration → Administration</strong>,
        section « Configuration globale ».
      </p>
    </div>
  );
}
