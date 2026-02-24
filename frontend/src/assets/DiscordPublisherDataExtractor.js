// ==UserScript==
// @name         Discord Publisher Data Extractor (Enriched)
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Nettoyage précis du Nom (sans labels) et du Synopsis
// @author       Rory Mercury 91
// @match        https://f95zone.to/threads/*
// @match        https://lewdcorner.com/threads/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  function extractData() {
    const url = window.location.href;

    // 1. ID
    const idMatch = url.match(/\.(\d+)(?:\/|#|$)/) || url.match(/\/threads\/(\d+)/);
    const id = idMatch ? idMatch[1] : "N/A";

    // 2. NOM & VERSION (Nettoyage des labels <span>)
    const titleElement = document.querySelector('.p-title-value');
    let name = "N/A", version = "N/A";

    if (titleElement) {
      // On ignore les spans (labels) et on ne prend que les nœuds de texte direct
      const nodes = Array.from(titleElement.childNodes);
      const textParts = nodes
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .filter(text => text.length > 0);

      let fullTitleText = textParts.join(' ');

      const versionMatch = fullTitleText.match(/(.*?)\s*\[([^\]]+)\]/);
      if (versionMatch) {
        name = versionMatch[1].trim();
        version = versionMatch[2].trim();
      } else {
        name = fullTitleText.trim();
      }
    }

    const bbWrapper = document.querySelector('.message-threadStarterPost .bbWrapper');

    // 3. IMAGE
    let image = "";
    if (bbWrapper) {
      const img = bbWrapper.querySelector('img.bbImage');
      image = img ? (img.getAttribute('data-src') || img.src) : "";
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

        // Arrêt avant les spoilers ou les sections techniques
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
          .replace(/^[:\s\n]+/, '') // Nettoyage début
          .replace(/[:\s\n]+$/, ''); // Nettoyage fin
      }
    }

    return { id, name, version, link: url.split('?')[0], synopsis, image };
  }

  // UI
  const btn = document.createElement('button');
  btn.innerHTML = '📋 Copier données jeu';
  btn.style = "position:fixed;bottom:10px;left:10px;z-index:9999;padding:10px 16px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);";
  btn.onclick = () => {
    const data = extractData();
    GM_setClipboard(JSON.stringify(data, null, 2));
    btn.innerHTML = '✅ Copié !';
    setTimeout(() => btn.innerHTML = '📋 Copier données jeu', 2000);
  };
  document.body.appendChild(btn);
})();
