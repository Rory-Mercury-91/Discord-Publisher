// frontend/src/components/ContentEditorComponents/LinksSection.tsx
import React from 'react';
import { tauriAPI } from '../../lib/tauri-api';
import Toggle from '../Toggle';

interface LinkConfig {
  source: 'F95' | 'Lewd' | 'Autre';
  value: string;
}

interface AdditionalLink {
  label: string;
  link: string;
}

interface LinksSectionProps {
  linkConfigs: {
    Game_link: LinkConfig;
    Translate_link: LinkConfig;
    Mod_link: LinkConfig;
  };
  setLinkConfig: (
    linkName: 'Game_link' | 'Translate_link' | 'Mod_link',
    source: 'F95' | 'Lewd' | 'Autre',
    value: string
  ) => void;
  buildFinalLink: (config: LinkConfig) => string;

  additionalTranslationLinks: AdditionalLink[];
  addAdditionalTranslationLink: () => void;
  updateAdditionalTranslationLink: (index: number, link: AdditionalLink) => void;
  deleteAdditionalTranslationLink: (index: number) => void;

  additionalModLinks: AdditionalLink[];
  addAdditionalModLink: () => void;
  updateAdditionalModLink: (index: number, link: AdditionalLink) => void;
  deleteAdditionalModLink: (index: number) => void;

  varsUsedInTemplate: Set<string>;
  inputs: Record<string, string>;
  setInput: (name: string, value: string) => void;
}

// Composant LinkField réutilisable (extrait du code original)
function LinkField({
  label,
  linkName,
  placeholder,
  disabled = false,
  showLabel = true,
  inputOnly = false,
  linkConfigs,
  setLinkConfig,
  buildFinalLink,
}: {
  label: string;
  linkName: 'Game_link' | 'Translate_link' | 'Mod_link';
  placeholder: string;
  disabled?: boolean;
  showLabel?: boolean;
  inputOnly?: boolean;
  linkConfigs: any;
  setLinkConfig: any;
  buildFinalLink: any;
}) {
  const config = linkConfigs[linkName];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.trim();
    let detectedSource: 'F95' | 'Lewd' | 'Autre' = config.source;

    const lower = val.toLowerCase();
    if (lower.includes('f95zone.to')) detectedSource = 'F95';
    else if (lower.includes('lewdcorner.com')) detectedSource = 'Lewd';
    else if (lower.includes('http')) detectedSource = 'Autre';

    setLinkConfig(linkName, detectedSource, val);
  };

  const finalUrl = buildFinalLink(config) || '...';

  const previewNode = finalUrl && !finalUrl.includes('...') ? (
    <div
      onClick={() => tauriAPI.openUrl(finalUrl)}
      style={{
        fontSize: 11,
        color: '#5865F2',
        fontFamily: 'monospace',
        padding: '2px 8px',
        background: 'rgba(88, 101, 242, 0.1)',
        borderRadius: 4,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        cursor: 'pointer'
      }}
      title="Cliquer pour ouvrir"
    >
      🔗 {finalUrl}
    </div>
  ) : (
    <div style={{ fontSize: 11, color: '#5865F2', fontFamily: 'monospace' }}>
      🔗 {finalUrl}
    </div>
  );

  if (inputOnly) {
    const inputValue = finalUrl === '...' ? '' : finalUrl;
    return (
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          height: '40px',
          boxSizing: 'border-box',
          borderRadius: 6,
          padding: '0 12px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          width: '100%'
        }}
      />
    );
  }

  return (
    <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', width: '100%' }}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            {label}
          </label>
          {previewNode}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
        <select
          value={config.source}
          onChange={(e) => setLinkConfig(linkName, e.target.value as any, config.value)}
          disabled={disabled}
          style={{
            height: '40px',
            borderRadius: 6,
            padding: '0 8px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 13
          }}
        >
          <option value="F95">F95</option>
          <option value="Lewd">Lewd</option>
          <option value="Autre">Autre</option>
        </select>

        <input
          type="text"
          value={config.value}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            height: '40px',
            borderRadius: 6,
            padding: '0 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            color: 'var(--text)'
          }}
        />
      </div>
    </div>
  );
}

export default function LinksSection({
  linkConfigs,
  setLinkConfig,
  buildFinalLink,
  additionalTranslationLinks,
  addAdditionalTranslationLink,
  updateAdditionalTranslationLink,
  deleteAdditionalTranslationLink,
  additionalModLinks,
  addAdditionalModLink,
  updateAdditionalModLink,
  deleteAdditionalModLink,
  varsUsedInTemplate,
  inputs,
  setInput,
}: LinksSectionProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>

      {/* === COLONNE TRADUCTION === */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            Traductions
          </label>
          <button
            type="button"
            onClick={addAdditionalTranslationLink}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--text)',
              fontWeight: 600,
            }}
          >
            ➕ Ajouter un lien additionnel
          </button>
        </div>

        {/* En-têtes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Label</label>
          <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Lien</label>
          <span style={{ width: 40 }} />
          <span style={{ width: 40 }} />
        </div>

        {/* Lien principal Traduction */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={inputs['main_translation_label'] ?? ''}
            onChange={(e) => setInput('main_translation_label', e.target.value)}
            placeholder="Traduction"
            disabled={!varsUsedInTemplate.has('Translate_link')}
            style={{
              height: '40px',
              borderRadius: 6,
              padding: '0 12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          />
          <LinkField
            label="Lien"
            linkName="Translate_link"
            placeholder="https://..."
            disabled={!varsUsedInTemplate.has('Translate_link')}
            linkConfigs={linkConfigs}
            setLinkConfig={setLinkConfig}
            buildFinalLink={buildFinalLink}
            inputOnly
          />
          <button
            type="button"
            onClick={() => {
              const url = buildFinalLink(linkConfigs.Translate_link);
              if (url && !url.includes('...')) tauriAPI.openUrl(url);
            }}
            style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 18 }}
            title="Ouvrir le lien"
          >
            🔗
          </button>
          <button
            type="button"
            onClick={() => {
              if (additionalTranslationLinks.length > 0) {
                setInput('main_translation_label', additionalTranslationLinks[0].label);
                setLinkConfig('Translate_link', 'Autre', additionalTranslationLinks[0].link);
                deleteAdditionalTranslationLink(0);
              } else {
                setInput('main_translation_label', '');
                setLinkConfig('Translate_link', 'Autre', '');
              }
            }}
            disabled={additionalTranslationLinks.length === 0}
            style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--error)', cursor: additionalTranslationLinks.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            🗑️
          </button>
        </div>

        {/* Liens additionnels Traduction */}
        {additionalTranslationLinks.map((link, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={link.label}
              onChange={(e) => updateAdditionalTranslationLink(index, { ...link, label: e.target.value })}
              placeholder="Saison 1"
              style={{ height: '40px', borderRadius: 6, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <input
              type="text"
              value={link.link}
              onChange={(e) => updateAdditionalTranslationLink(index, { ...link, link: e.target.value })}
              placeholder="https://..."
              style={{ height: '40px', borderRadius: 6, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <button
              type="button"
              onClick={() => {
                const url = link.link.trim();
                if (url) tauriAPI.openUrl(url);
              }}
              style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 18 }}
              title="Ouvrir le lien"
            >
              🔗
            </button>
            <button
              type="button"
              onClick={() => deleteAdditionalTranslationLink(index)}
              style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--error)', cursor: 'pointer' }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      {/* === COLONNE MOD === */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Toggle
            checked={inputs['is_modded_game'] === 'true'}
            onChange={(v) => setInput('is_modded_game', v ? 'true' : 'false')}
            label="Mod compatible"
            disabled={!varsUsedInTemplate.has('is_modded_game')}
          />
          <button
            type="button"
            onClick={addAdditionalModLink}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--text)',
              fontWeight: 600,
            }}
          >
            ➕ Ajouter un lien additionnel
          </button>
        </div>

        {/* En-têtes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Label</label>
          <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Lien</label>
          <span style={{ width: 40 }} />
          <span style={{ width: 40 }} />
        </div>

        {/* Lien principal Mod */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={inputs['main_mod_label'] ?? ''}
            onChange={(e) => setInput('main_mod_label', e.target.value)}
            placeholder="Mod"
            disabled={!varsUsedInTemplate.has('Mod_link')}
            style={{
              height: '40px',
              borderRadius: 6,
              padding: '0 12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          />
          <LinkField
            label="Lien"
            linkName="Mod_link"
            placeholder="https://..."
            disabled={!varsUsedInTemplate.has('Mod_link')}
            linkConfigs={linkConfigs}
            setLinkConfig={setLinkConfig}
            buildFinalLink={buildFinalLink}
            inputOnly
          />
          <button
            type="button"
            onClick={() => {
              const url = buildFinalLink(linkConfigs.Mod_link);
              if (url && !url.includes('...')) tauriAPI.openUrl(url);
            }}
            style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 18 }}
            title="Ouvrir le lien"
          >
            🔗
          </button>
          <button
            type="button"
            onClick={() => {
              if (additionalModLinks.length > 0) {
                setInput('main_mod_label', additionalModLinks[0].label);
                setLinkConfig('Mod_link', 'Autre', additionalModLinks[0].link);
                deleteAdditionalModLink(0);
              } else {
                setInput('main_mod_label', '');
                setLinkConfig('Mod_link', 'Autre', '');
              }
            }}
            disabled={additionalModLinks.length === 0}
            style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--error)', cursor: additionalModLinks.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            🗑️
          </button>
        </div>

        {/* Liens additionnels Mod */}
        {additionalModLinks.map((link, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={link.label}
              onChange={(e) => updateAdditionalModLink(index, { ...link, label: e.target.value })}
              placeholder="Walkthrough Mod"
              style={{ height: '40px', borderRadius: 6, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <input
              type="text"
              value={link.link}
              onChange={(e) => updateAdditionalModLink(index, { ...link, link: e.target.value })}
              placeholder="https://..."
              style={{ height: '40px', borderRadius: 6, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <button
              type="button"
              onClick={() => {
                const url = link.link.trim();
                if (url) tauriAPI.openUrl(url);
              }}
              style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 18 }}
              title="Ouvrir le lien"
            >
              🔗
            </button>
            <button
              type="button"
              onClick={() => deleteAdditionalModLink(index)}
              style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--error)', cursor: 'pointer' }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
