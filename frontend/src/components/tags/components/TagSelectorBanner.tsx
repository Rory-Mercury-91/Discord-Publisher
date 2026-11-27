interface TagSelectorBannerProps {
  isControlled: boolean;
  requiredCount: number;
  optionalCount: number;
}

const REQUIRED_MAX = 3;
const OPTIONAL_MAX = 2;

export default function TagSelectorBanner({
  isControlled,
  requiredCount,
  optionalCount,
}: TagSelectorBannerProps) {
  return (
    <>
      {isControlled && (
        <div className="tag-selector__banner tag-selector__banner--info">
          <span className="tag-selector__banner-icon">🔒</span>
          <span>
            Tags secondaires. Le tag Site est déduit automatiquement du lien du jeu (il n’apparaît pas ici).
            Le type de traduction peut être ajusté ici ou via le formulaire. Le tag Statut du jeu est unique mais peut être changé. Les tags libres sont limités à {OPTIONAL_MAX}.
          </span>
        </div>
      )}
      <div className="tag-selector__banner tag-selector__banner--limit">
        <span>⚠️</span>
        <span>
          <span className={requiredCount >= REQUIRED_MAX ? 'tag-selector__limit-count--max' : ''}>
            Tags obligatoire : {requiredCount}/{REQUIRED_MAX}
          </span>
          {' | '}
          <span className={optionalCount >= OPTIONAL_MAX ? 'tag-selector__limit-count--max' : ''}>
            Tags optionnel : {optionalCount}/{OPTIONAL_MAX}
          </span>
        </span>
      </div>
    </>
  );
}
