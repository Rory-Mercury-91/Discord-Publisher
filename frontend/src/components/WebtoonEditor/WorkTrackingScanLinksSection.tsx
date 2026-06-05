import { tauriAPI } from '../../lib/tauri-api';
import type { AdditionalTranslationLink } from '../../state/types';

type WorkTrackingScanLinksSectionProps = {
  inputs: Record<string, string>;
  setInput: (name: string, value: string) => void;
  additionalScanLinks: AdditionalTranslationLink[];
  onAdd: () => void;
  onUpdate: (index: number, link: AdditionalTranslationLink) => void;
  onDelete: (index: number) => void;
};

function ScanLinkRow({
  labelValue,
  linkValue,
  onLabelChange,
  onLinkChange,
  onOpen,
  onDelete,
  labelPlaceholder,
}: {
  labelValue: string;
  linkValue: string;
  onLabelChange: (v: string) => void;
  onLinkChange: (v: string) => void;
  onOpen: () => void;
  onDelete: () => void;
  labelPlaceholder: string;
}) {
  return (
    <div className="links-block__row webtoon-editor__link-row">
      <input
        type="text"
        value={labelValue}
        onChange={e => onLabelChange(e.target.value)}
        placeholder={labelPlaceholder}
        className="form-input"
      />
      <input
        type="text"
        value={linkValue}
        onChange={e => onLinkChange(e.target.value)}
        placeholder="https://..."
        className="form-input"
      />
      <button type="button" onClick={onOpen} className="form-btn form-btn--icon" title="Ouvrir le lien">
        🔗
      </button>
      <button type="button" onClick={onDelete} className="form-btn form-btn--icon form-btn--icon-danger">
        🗑️
      </button>
    </div>
  );
}

/** Sites scan : lien principal + liens additionnels (même UX que Mod / Traductions). */
export default function WorkTrackingScanLinksSection({
  inputs,
  setInput,
  additionalScanLinks,
  onAdd,
  onUpdate,
  onDelete,
}: WorkTrackingScanLinksSectionProps) {
  const mainUrl = (inputs.Scan_Site_Link || '').trim();

  const clearMainIfPromotingFirstExtra = () => {
    if (additionalScanLinks.length > 0) {
      setInput('Scan_Site_Label', additionalScanLinks[0].label);
      setInput('Scan_Site_Link', additionalScanLinks[0].link);
      onDelete(0);
    } else {
      setInput('Scan_Site_Label', '');
      setInput('Scan_Site_Link', '');
    }
  };

  return (
    <div className="webtoon-editor__links-col">
      <div className="links-block">
        <div className="links-block__toolbar webtoon-editor__links-toolbar">
          <h5 className="webtoon-editor__links-title">Sites scan / alternatifs</h5>
          <button type="button" onClick={onAdd} className="links-block__add-btn">
            ➕ Ajouter un lien additionnel
          </button>
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
            value={inputs.Scan_Site_Label || ''}
            onChange={e => setInput('Scan_Site_Label', e.target.value)}
            placeholder="Scan VF, Flame…"
            className="form-input"
          />
          <input
            type="text"
            value={inputs.Scan_Site_Link || ''}
            onChange={e => setInput('Scan_Site_Link', e.target.value)}
            placeholder="https://..."
            className="form-input"
          />
          <button
            type="button"
            onClick={() => { if (mainUrl) void tauriAPI.openUrl(mainUrl); }}
            className="form-btn form-btn--icon"
            title="Ouvrir le lien"
            disabled={!mainUrl}
          >
            🔗
          </button>
          <button
            type="button"
            onClick={clearMainIfPromotingFirstExtra}
            disabled={additionalScanLinks.length === 0 && !mainUrl}
            className="form-btn form-btn--icon form-btn--icon-danger"
          >
            🗑️
          </button>
        </div>

        {additionalScanLinks.map((link, index) => (
          <ScanLinkRow
            key={index}
            labelValue={link.label}
            linkValue={link.link}
            labelPlaceholder="Scan VF, Flame…"
            onLabelChange={v => onUpdate(index, { ...link, label: v })}
            onLinkChange={v => onUpdate(index, { ...link, link: v })}
            onOpen={() => {
              const url = link.link.trim();
              if (url) void tauriAPI.openUrl(url);
            }}
            onDelete={() => onDelete(index)}
          />
        ))}
      </div>
    </div>
  );
}
