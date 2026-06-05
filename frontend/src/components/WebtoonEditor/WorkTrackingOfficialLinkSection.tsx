import { tauriAPI } from '../../lib/tauri-api';

type WorkTrackingOfficialLinkSectionProps = {
  inputs: Record<string, string>;
  setInput: (name: string, value: string) => void;
};

/** Site officiel : même grille que les liens scan pour aligner les colonnes. */
export default function WorkTrackingOfficialLinkSection({
  inputs,
  setInput,
}: WorkTrackingOfficialLinkSectionProps) {
  const mainUrl = (inputs.Official_Site_Link || '').trim();

  const clearOfficial = () => {
    setInput('Official_Site_Label', '');
    setInput('Official_Site_Link', '');
  };

  return (
    <div className="webtoon-editor__links-col">
      <div className="links-block">
        <div className="links-block__toolbar webtoon-editor__links-toolbar">
          <h5 className="webtoon-editor__links-title">Site officiel</h5>
          <span className="links-block__add-btn webtoon-editor__links-toolbar-spacer" aria-hidden>
            ➕ Ajouter un lien additionnel
          </span>
        </div>

        <div className="links-block__row links-block__row-headers webtoon-editor__link-row">
          <label className="form-label form-label--inline">Site</label>
          <label className="form-label form-label--inline">Lien</label>
          <span className="links-block__spacer" />
          <span className="links-block__spacer" />
        </div>

        <div className="links-block__row webtoon-editor__link-row">
          <input
            type="text"
            value={inputs.Official_Site_Label || ''}
            onChange={e => setInput('Official_Site_Label', e.target.value)}
            placeholder="Webtoon, Tapas, Kakao…"
            className="form-input"
          />
          <input
            type="text"
            value={inputs.Official_Site_Link || ''}
            onChange={e => setInput('Official_Site_Link', e.target.value)}
            placeholder="https://..."
            className="form-input"
          />
          <button
            type="button"
            onClick={() => {
              if (mainUrl) void tauriAPI.openUrl(mainUrl);
            }}
            className="form-btn form-btn--icon"
            title="Ouvrir le lien"
            disabled={!mainUrl}
          >
            🔗
          </button>
          <button
            type="button"
            onClick={clearOfficial}
            disabled={!mainUrl && !(inputs.Official_Site_Label || '').trim()}
            className="form-btn form-btn--icon form-btn--icon-danger"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}
