// ==UserScript==
// @name         Discord Publisher Data Extractor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Récupère uniquement Nom, Développeur, Version, Lien et ID sur F95/LC
// @author       Rory Mercury 91
// @match        https://f95zone.to/threads/*
// @match        https://lewdcorner.com/threads/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  function extractData() {
    const url = window.location.href;
    const isF95 = window.location.hostname.includes('f95zone');

    // 1. Extraction de l'ID (slug.ID ou threads/ID/ ou threads/ID#post-XXXXX)
    const idMatchSlug = url.match(/\.(\d+)(?:\/|#|$)/);
    const idMatchNumeric = url.match(/\/threads\/(\d+)(?:\/|#|$)/);
    const id = (idMatchSlug && idMatchSlug[1]) || (idMatchNumeric && idMatchNumeric[1]) || "N/A";

    // 2. Récupération du titre brut
    const titleElement = document.querySelector('.p-title-value');
    let rawTitle = titleElement ?
      Array.from(titleElement.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim()).join(' ')
      : document.title;

    // 3. Parsing du Nom, Version et Développeur (Regex optimisée)
    // Format standard: Nom du Jeu [Version] [Développeur]
    const structuredMatch = rawTitle.match(/(.*?)\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*$/);

    let name = rawTitle;
    let version = "N/A";
    let developer = "N/A";

    if (structuredMatch) {
      name = structuredMatch[1].trim();
      version = structuredMatch[2].trim();
      developer = structuredMatch[3].trim();
    } else {
      // Fallback si format différent
      const brackets = [...rawTitle.matchAll(/\[([^\]]+)\]/g)];
      if (brackets.length >= 1) version = brackets[0][1];
      if (brackets.length >= 2) developer = brackets[brackets.length - 1][1];
      name = rawTitle.replace(/\[[^\]]+\]/g, '').trim();
    }

    // Nettoyage final du nom (virer les préfixes comme Ren'Py -)
    name = name.replace(/^(Ren'Py|Unity|RPGM|Unreal Engine|HTML|Flash)\s+-\s+/i, '');

    return {
      id: id,
      name: name,
      version: version,
      developer: developer,
      link: url.split('?')[0] // Lien propre sans paramètres
    };
  }

  // Ajout d'un petit bouton discret en bas à gauche
  const btn = document.createElement('button');
  btn.innerHTML = '📋 Copier données';
  btn.style =
    "position:fixed;bottom:10px;left:10px;z-index:9999;padding:8px;background:#6366f1;color:white;border:none;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;";

  btn.onclick = () => {
    const data = extractData();
    GM_setClipboard(JSON.stringify(data, null, 2));
    btn.innerHTML = '✅ Copié !';
    console.log("Extracted:", data);
    setTimeout(() => btn.innerHTML = '📋 Copier données', 2000);
  };

  document.body.appendChild(btn);
})();
