// ==UserScript==
// @name         Discord Publisher Data Extractor (Enriched)
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Nettoyage précis du Nom (sans labels), Synopsis, Tags F95 et Statut/Type (Completed, On hold, etc.)
// @author       Rory Mercury 91
// @match        https://f95zone.to/threads/*
// @match        https://lewdcorner.com/threads/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  /** Tags : tous les .tagItem (dl.tagList / .js-tagList sur F95/LewdCorner) */
  function extractTags() {
    const items = document.querySelectorAll('.tagItem');
    return Array.from(items).map(el => (el.textContent || '').trim()).filter(Boolean);
  }

  /** Statut et type depuis les labels du titre (.p-title-value .label) — type = moteur du jeu (RenPy, Unity, etc.) */
  function extractStatusAndType() {
    const labels = document.querySelectorAll('.p-title-value .label');
    let status = '';
    let type = '';
    const statusMap = {
      'Completed': 'TERMINÉ',
      'Complete': 'TERMINÉ',
      'Abandoned': 'ABANDONNÉ',
      'On hold': 'En pause',
      'On Hold': 'En pause'
    };
    const typeMap = {
      'Others': 'Autre',
      'Other': 'Autre',
      "Ren'Py": 'RenPy',
      'RenPy': 'RenPy',
      'RPGM': 'RPGM',
      'Unity': 'Unity',
      'Unreal Engine': 'Unreal',
      'Flash': 'Flash',
      'HTML': 'HTML',
      'QSP': 'QSP'
    };
    function normalizeLabel(s) {
      return (s || '').replace(/[\u2018\u2019\u0027]/g, "'").trim();
    }
    labels.forEach(el => {
      const raw = (el.textContent || '').trim();
      const text = normalizeLabel(raw);
      if (!text) return;
      if (statusMap[text] !== undefined) status = statusMap[text];
      else if (typeMap[text] !== undefined) type = typeMap[text];
      else if (!status && /Completed|Abandoned|On hold/i.test(text)) status = /Complete/i.test(text) ? 'TERMINÉ' : text === 'Abandoned' ? 'ABANDONNÉ' : 'En pause';
      // Ne pas utiliser les labels genre (VN, etc.) pour type : on garde uniquement les moteurs (typeMap)
    });
    if (!type && typeof document.title === 'string') {
      const t = document.title;
      if (/Ren['']Py/i.test(t)) type = 'RenPy';
      else if (/\bRPGM\b/i.test(t)) type = 'RPGM';
      else if (/\bUnity\b/i.test(t)) type = 'Unity';
      else if (/Unreal Engine/i.test(t)) type = 'Unreal';
      else if (/\bFlash\b/i.test(t)) type = 'Flash';
      else if (/\bHTML\b/i.test(t)) type = 'HTML';
      else if (/\bQSP\b/i.test(t)) type = 'QSP';
      else if (/\bOther(s)?\b/i.test(t)) type = 'Autre';
    }
    if (!status) status = 'EN COURS';
    return { status, type };
  }

  function extractData() {
    const url = window.location.href;

    // 1. ID (numérique pour le format formulaire liste)
    const idMatch = url.match(/\.(\d+)(?:\/|#|$)/) || url.match(/\/threads\/(?:[^/]*\.)?(\d+)/);
    const idRaw = idMatch ? idMatch[1] : null;
    const id = idRaw ? parseInt(idRaw, 10) : null;

    // 2. NOM & VERSION (version avec crochets [v1.0e])
    const titleElement = document.querySelector('.p-title-value');
    let name = "N/A", version = "N/A";

    if (titleElement) {
      const nodes = Array.from(titleElement.childNodes);
      const textParts = nodes
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .filter(text => text.length > 0);

      let fullTitleText = textParts.join(' ');

      const versionMatch = fullTitleText.match(/(.*?)\s*\[([^\]]+)\]/);
      if (versionMatch) {
        name = versionMatch[1].trim();
        const v = versionMatch[2].trim();
        version = v.startsWith('[') ? v : '[' + v + ']';
      } else {
        name = fullTitleText.trim();
      }
    }

    const bbWrapper = document.querySelector('.message-threadStarterPost .bbWrapper');

    // 3. IMAGE (preview.f95zone.to au lieu de attachments.)
    let image = "";
    if (bbWrapper) {
      const img = bbWrapper.querySelector('img.bbImage');
      let src = img ? (img.getAttribute('data-src') || img.src) : "";
      if (src && src.includes('attachments.f95zone.to')) src = src.replace('attachments.f95zone.to', 'preview.f95zone.to');
      if (src && src.includes('attachments.lewdcorner.com')) src = src.replace('attachments.lewdcorner.com', 'preview.lewdcorner.com');
      image = src;
    }

    // 4. SYNOPSIS (Nettoyage complet)
    let synopsis = "";
    if (bbWrapper) {
      let content = bbWrapper.innerHTML;
      const startRegex = /(?:Overview|Synopsis)\s*:?\s*(?:<\/?[^>]+>)*\s*/i;
      const startIndex = content.search(startRegex);

      if (startIndex !== -1) {
        let part = content.substring(startIndex);
        const matchStart = part.match(startRegex);
        let afterStart = part.substring(matchStart[0].length);

        const endRegex = /(?:Thread Updated|Installation|Changelog|<b>Update|<div class="bbCodeSpoiler|Synopsis\s*:)/i;
        const endIndex = afterStart.search(endRegex);

        if (endIndex !== -1) {
          afterStart = afterStart.substring(0, endIndex);
        }

        synopsis = afterStart
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>|<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n\n')
          .replace(/^[:\s\n]+/, '')
          .replace(/[:\s\n]+$/, '');
      }
    }

    // 5. TAGS (liste complète séparée par des virgules, format formulaire liste)
    const tagsArray = extractTags();
    const tags = tagsArray.join(', ');

    // 6. STATUT & TYPE (labels du titre)
    const { status, type } = extractStatusAndType();

    const baseUrl = url.includes('lewdcorner.com') ? 'https://lewdcorner.com' : 'https://f95zone.to';
    const linkShort = id !== null ? baseUrl + '/threads/' + id : url.split('?')[0];

    return {
      id: id !== null ? id : 0,
      domain: url.includes('lewdcorner.com') ? 'LewdCorner' : 'F95z',
      name,
      version,
      status,
      tags,
      type: type || '',
      ac: false,
      link: linkShort,
      image,
      synopsis
    };
  }

  // UI
  const btn = document.createElement('button');
  btn.innerHTML = '📋 Copier données jeu';
  btn.style = "position:fixed;bottom:10px;left:10px;z-index:9999;padding:10px 16px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);";
  btn.onclick = () => {
    const data = extractData();
    GM_setClipboard(JSON.stringify(data));
    btn.innerHTML = '✅ Copié !';
    setTimeout(() => btn.innerHTML = '📋 Copier données jeu', 2000);
  };
  document.body.appendChild(btn);
})();
