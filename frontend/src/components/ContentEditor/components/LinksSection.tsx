// frontend/src/components/ContentEditor/components/LinksSection.tsx
import React from 'react';
import { tauriAPI } from '../../../lib/tauri-api';
import Toggle from '../../shared/Toggle';

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

// Champ lien principal (select source + input URL ou input seul)
function LinkField({
  linkName,
  placeholder,
  disabled = false,
  inputOnly = false,
  linkConfigs,
  setLinkConfig,
  buildFinalLink,
}: {
  linkName: 'Game_link' | 'Translate_link' | 'Mod_link';
  placeholder: string;
  disabled?: boolean;
  inputOnly?: boolean;
  linkConfigs: LinksSectionProps['linkConfigs'];
  setLinkConfig: LinksSectionProps['setLinkConfig'];
  buildFinalLink: LinksSectionProps['buildFinalLink'];
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
  const inputValue = finalUrl === '...' ? '' : finalUrl;

  if (inputOnly) {
    return (
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`form-input ${disabled ? 'form-input--disabled' : ''}`}
      />
    );
  }

  return (
    <div className="form-field link-field">
      <div className="link-field__header-row">
        <label className="form-label form-label--inline">Lien</label>
        {finalUrl && !finalUrl.includes('...') ? (
          <button
            type="button"
            onClick={() => tauriAPI.openUrl(finalUrl)}
            className="link-preview"
            title="Cliquer pour ouvrir"
          >
            🔗 {finalUrl}
          </button>
        ) : (
          <span className="link-preview link-preview--static">🔗 {finalUrl}</span>
        )}
      </div>
      <div className="link-field__grid">
        <select
          value={config.source}
          onChange={(e) => setLinkConfig(linkName, e.target.value as 'F95' | 'Lewd' | 'Autre', config.value)}
          disabled={disabled}
          className="form-input app-select"
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
          className={`form-input ${disabled ? 'form-input--disabled' : ''}`}
        />
      </div>
    </div>
  );
}

// Une ligne "label + lien + ouvrir + supprimer" (réutilisable pour main et additionnels)
function LinkRow({
  labelValue,
  linkValue,
  labelPlaceholder,
  linkPlaceholder,
  onLabelChange,
  onLinkChange,
  onOpen,
  onDelete,
  openDisabled,
  deleteDisabled,
}: {
  labelValue: string;
  linkValue: string;
  labelPlaceholder: string;
  linkPlaceholder: string;
  onLabelChange: (v: string) => void;
  onLinkChange: (v: string) => void;
  onOpen: () => void;
  onDelete: () => void;
  openDisabled?: boolean;
  deleteDisabled?: boolean;
}) {
  return (
    <div className="links-block__row">
      <input
        type="text"
        value={labelValue}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder={labelPlaceholder}
        className="form-input"
      />
      <input
        type="text"
        value={linkValue}
        onChange={(e) => onLinkChange(e.target.value)}
        placeholder={linkPlaceholder}
        className="form-input"
      />
      <button type="button" onClick={onOpen} disabled={openDisabled} className="form-btn form-btn--icon" title="Ouvrir le lien">
        🔗
      </button>
      <button type="button" onClick={onDelete} disabled={deleteDisabled} className="form-btn form-btn--icon form-btn--icon-danger">
        🗑️
      </button>
    </div>
  );
}

// Bloc réutilisable : une colonne "Traductions" ou "Mod" (même structure, handlers différents)
function AdditionalLinksBlock({
  title,
  headerExtra,
  links,
  onAdd,
  onUpdate,
  onDelete,
  mainLabelKey,
  mainLinkName,
  placeholderLabel,
  linkConfigs,
  setLinkConfig,
  buildFinalLink,
  setInput,
  varsUsedInTemplate,
  inputs,
}: {
  title: string;
  headerExtra?: React.ReactNode;
  links: AdditionalLink[];
  onAdd: () => void;
  onUpdate: (index: number, link: AdditionalLink) => void;
  onDelete: (index: number) => void;
  mainLabelKey: 'main_translation_label' | 'main_mod_label';
  mainLinkName: 'Translate_link' | 'Mod_link';
  placeholderLabel: string;
  linkConfigs: LinksSectionProps['linkConfigs'];
  setLinkConfig: LinksSectionProps['setLinkConfig'];
  buildFinalLink: LinksSectionProps['buildFinalLink'];
  setInput: (name: string, value: string) => void;
  varsUsedInTemplate: Set<string>;
  inputs: Record<string, string>;
}) {
  const mainDisabled = !varsUsedInTemplate.has(mainLinkName);
  const config = linkConfigs[mainLinkName];

  const handleDeleteMain = () => {
    if (links.length > 0) {
      setInput(mainLabelKey, links[0].label);
      setLinkConfig(mainLinkName, 'Autre', links[0].link);
      onDelete(0);
    } else {
      setInput(mainLabelKey, '');
      setLinkConfig(mainLinkName, 'Autre', '');
    }
  };

  return (
    <div className="links-block">
      <div className="links-block__header">
        <div className="links-block__header-left">
          <label className="form-label form-label--inline" style={{ marginBottom: 0 }}>{title}</label>
          {headerExtra}
        </div>
        <button type="button" onClick={onAdd} className="links-block__add-btn">
          ➕ Ajouter un lien additionnel
        </button>
      </div>

      <div className="links-block__row links-block__row-headers">
        <label className="form-label form-label--inline">Label</label>
        <label className="form-label form-label--inline">Lien</label>
        <span className="links-block__spacer" />
        <span className="links-block__spacer" />
      </div>

      {/* Ligne principale */}
      <div className="links-block__row">
        <input
          type="text"
          value={inputs[mainLabelKey] ?? ''}
          onChange={(e) => setInput(mainLabelKey, e.target.value)}
          placeholder={placeholderLabel}
          disabled={mainDisabled}
          className={`form-input ${mainDisabled ? 'form-input--disabled' : ''}`}
        />
        <LinkField
          linkName={mainLinkName}
          placeholder="https://..."
          disabled={mainDisabled}
          linkConfigs={linkConfigs}
          setLinkConfig={setLinkConfig}
          buildFinalLink={buildFinalLink}
          inputOnly
        />
        <button
          type="button"
          onClick={() => { const url = buildFinalLink(config); if (url && !url.includes('...')) tauriAPI.openUrl(url); }}
          className="form-btn form-btn--icon"
          title="Ouvrir le lien"
        >
          🔗
        </button>
        <button
          type="button"
          onClick={handleDeleteMain}
          disabled={links.length === 0}
          className="form-btn form-btn--icon form-btn--icon-danger"
        >
          🗑️
        </button>
      </div>

      {/* Lignes additionnelles */}
      {links.map((link, index) => (
        <LinkRow
          key={index}
          labelValue={link.label}
          linkValue={link.link}
          labelPlaceholder={placeholderLabel}
          linkPlaceholder="https://..."
          onLabelChange={(v) => onUpdate(index, { ...link, label: v })}
          onLinkChange={(v) => onUpdate(index, { ...link, link: v })}
          onOpen={() => { const url = link.link.trim(); if (url) tauriAPI.openUrl(url); }}
          onDelete={() => onDelete(index)}
        />
      ))}
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
    <div className="form-grid form-grid--2col form-grid--start">
      <AdditionalLinksBlock
        title="Traductions"
        links={additionalTranslationLinks}
        onAdd={addAdditionalTranslationLink}
        onUpdate={updateAdditionalTranslationLink}
        onDelete={deleteAdditionalTranslationLink}
        mainLabelKey="main_translation_label"
        mainLinkName="Translate_link"
        placeholderLabel="Traduction"
        linkConfigs={linkConfigs}
        setLinkConfig={setLinkConfig}
        buildFinalLink={buildFinalLink}
        setInput={setInput}
        varsUsedInTemplate={varsUsedInTemplate}
        inputs={inputs}
      />

      <AdditionalLinksBlock
        title="Mod"
        headerExtra={
          <Toggle
            checked={inputs['is_modded_game'] === 'true'}
            onChange={(v) => setInput('is_modded_game', v ? 'true' : 'false')}
            label="Mod compatible"
            disabled={!varsUsedInTemplate.has('is_modded_game')}
          />
        }
        links={additionalModLinks}
        onAdd={addAdditionalModLink}
        onUpdate={updateAdditionalModLink}
        onDelete={deleteAdditionalModLink}
        mainLabelKey="main_mod_label"
        mainLinkName="Mod_link"
        placeholderLabel="Mod"
        linkConfigs={linkConfigs}
        setLinkConfig={setLinkConfig}
        buildFinalLink={buildFinalLink}
        setInput={setInput}
        varsUsedInTemplate={varsUsedInTemplate}
        inputs={inputs}
      />
    </div>
  );
}
