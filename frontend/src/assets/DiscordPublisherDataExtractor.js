// ==UserScript==
// @name         Discord Publisher — Import rapide
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Importe un jeu F95Zone ou LewdCorner dans Discord Publisher en un clic. Aucune configuration requise.
// @author       Rory Mercury 91
// @match        https://f95zone.to/threads/*
// @match        https://*.f95zone.to/threads/*
// @match        https://lewdcorner.com/threads/*
// @match        https://*.lewdcorner.com/threads/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  // Port du serveur local Tauri — doit correspondre à celui défini dans lib.rs
  const LOCAL_PORT = GM_getValue('dp_port', 7832);

  const isF95Zone    = window.location.hostname.includes('f95zone');
  const isLewdCorner = window.location.hostname.includes('lewdcorner');

  // ========================================
  // EXTRACTION DE DONNÉES
  // ========================================

  function extractTags() {
    const items = document.querySelectorAll('.tagItem');
    return Array.from(items).map(el => (el.textContent || '').trim()).filter(Boolean).join(', ');
  }

  function extractStatusAndType() {
    const labels = document.querySelectorAll('.p-title-value .label, .p-title-value .labelLink span');
    let status = '';
    let type   = '';

    const statusMap = {
      'completed' : 'TERMINÉ',
      'complete'  : 'TERMINÉ',
      'abandoned' : 'ABANDONNÉ',
      'on hold'   : 'En pause',
      'onhold'    : 'En pause',
    };
    const typeMap = {
      "ren'py"       : 'RenPy',
      "ren`py"       : 'RenPy',
      'renpy'        : 'RenPy',
      'rpgm'         : 'RPGM',
      'unity'        : 'Unity',
      'unreal engine': 'Unreal',
      'flash'        : 'Flash',
      'html'         : 'HTML',
      'qsp'          : 'QSP',
      'others'       : 'Autre',
      'other'        : 'Autre',
      'wolf rpg'     : 'Wolf RPG',
      'webgl'        : 'WebGL',
      'java'         : 'Java',
      'adrift'       : 'ADRIFT',
    };

    labels.forEach(el => {
      const raw = (el.textContent || '').trim().toLowerCase().replace(/[\u2018\u2019']/g, "'");
      if (!raw) return;
      if (statusMap[raw] !== undefined) status = statusMap[raw];
      else if (typeMap[raw]  !== undefined) type   = typeMap[raw];
    });

    if (!status) status = 'EN COURS';
    return { status, type };
  }

  function extractTitleAndVersion() {
    const titleElement = document.querySelector('.p-title-value');
    let name    = 'N/A';
    let version = '';

    if (titleElement) {
      const rawText = Array.from(titleElement.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .filter(Boolean)
        .join(' ');

      const structuredMatch = rawText.match(/(.*?)\s*\[([^\]]+)\]\s*(?:\[([^\]]+)\])?\s*$/);
      if (structuredMatch) {
        name    = structuredMatch[1].trim();
        version = structuredMatch[2].trim();
      } else {
        const vMatch = rawText.match(/(.*?)\s*\[([^\]]+)\]/);
        if (vMatch) {
          name    = vMatch[1].trim();
          version = vMatch[2].trim();
        } else {
          name = rawText.trim();
        }
      }
    }

    return { name, version };
  }

  function extractSynopsis() {
    const bbWrapper = document.querySelector('.message-threadStarterPost .bbWrapper');
    if (!bbWrapper) return '';

    let content = bbWrapper.innerHTML;
    const startRegex = /(?:Overview|Synopsis)\s*:?\s*(?:<\/?[^>]+>)*\s*/i;
    const startIndex = content.search(startRegex);
    if (startIndex === -1) return '';

    let part = content.substring(startIndex);
    const matchStart = part.match(startRegex);
    let afterStart = part.substring(matchStart[0].length);

    const endRegex = /(?:Thread Updated|Installation|Changelog|<b>Update|<div class="bbCodeSpoiler|Synopsis\s*:)/i;
    const endIndex = afterStart.search(endRegex);
    if (endIndex !== -1) afterStart = afterStart.substring(0, endIndex);

    return afterStart
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>|<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n\n')
      .replace(/^[:\s\n]+/, '')
      .replace(/[:\s\n]+$/, '');
  }

  function extractImage() {
    const bbWrapper = document.querySelector('.message-threadStarterPost .bbWrapper');
    if (!bbWrapper) return '';

    const img = bbWrapper.querySelector('img.bbImage');
    let src = img ? (img.getAttribute('data-src') || img.src) : '';

    if (src.includes('attachments.f95zone.to'))    src = src.replace('attachments.f95zone.to', 'preview.f95zone.to');
    if (src.includes('attachments.lewdcorner.com')) src = src.replace('attachments.lewdcorner.com', 'preview.lewdcorner.com');
    return src || '';
  }

  function extractThreadId() {
    const url     = window.location.href;
    const idMatch = url.match(/\.(\d+)(?:\/|#|$)/) || url.match(/\/threads\/(?:[^/]*\.)?(\d+)/);
    return idMatch ? parseInt(idMatch[1], 10) : 0;
  }

  function extractData() {
    const url      = window.location.href;
    const domain   = isLewdCorner ? 'LewdCorner' : 'F95z';
    const id       = extractThreadId();
    const { name, version }  = extractTitleAndVersion();
    const { status, type }   = extractStatusAndType();
    const tags     = extractTags();
    const image    = extractImage();
    const synopsis = extractSynopsis();
    const baseUrl  = isLewdCorner ? 'https://lewdcorner.com' : 'https://f95zone.to';
    const link     = id ? `${baseUrl}/threads/${id}` : url.split('?')[0];

    return { domain, id, name, version, status, type, tags, image, synopsis, link };
  }

  // ========================================
  // COMMUNICATION AVEC DISCORD PUBLISHER (localhost)
  // ========================================

  function sendToPublisher(gameData) {
    return new Promise((resolve, reject) => {
      const payload = {
        domain  : gameData.domain,
        id      : gameData.id,
        name    : gameData.name,
        version : gameData.version,
        status  : gameData.status,
        type    : gameData.type,
        tags    : gameData.tags,
        link    : gameData.link,
        image   : gameData.image,
        synopsis: gameData.synopsis,
      };

      console.info('%c[Discord Publisher]', 'color:#6366f1;font-weight:bold;', 'Envoi :', payload);

      GM_xmlhttpRequest({
        method  : 'POST',
        url     : `http://127.0.0.1:${LOCAL_PORT}/quick-add`,
        headers : { 'Content-Type': 'application/json' },
        data    : JSON.stringify(payload),
        onload  : function (response) {
          try {
            const result = JSON.parse(response.responseText);
            console.info('%c[Discord Publisher]', 'color:#16a34a;font-weight:bold;', `Réponse (${response.status}) :`, result);
            if (result.ok) resolve(result);
            else reject(new Error(result.error || 'Erreur inconnue'));
          } catch (e) {
            reject(new Error('Réponse invalide du serveur'));
          }
        },
        onerror : function () {
          reject(new Error(
            'Impossible de joindre Discord Publisher.\n' +
            'Assurez-vous que l\'application est ouverte.'
          ));
        },
      });
    });
  }

  // ========================================
  // NOTIFICATIONS & UI HELPERS
  // ========================================

  function showNotification(message, type = 'success') {
    document.querySelectorAll('.dp-notification').forEach(n => n.remove());
  
    const el = document.createElement('div');
    el.className = 'dp-notification';
    el.textContent = message;
    el.style.cssText = `
      position: fixed;
      bottom: 210px;           /* ← était 180px */
      right: 20px;
      padding: 12px 18px;
      background: ${type === 'success' ? 'linear-gradient(135deg,#10b981,#059669)'
                 : type === 'warning'  ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                 :                       'linear-gradient(135deg,#ef4444,#dc2626)'};
      color: white;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      z-index: 9999999;
      max-width: 320px;
      white-space: pre-line;
      animation: dpSlideIn 0.3s ease;
    `;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'dpSlideOut 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 4500);
  }

  function createOverlay(message = 'Import en cours…') {
    const overlay = document.createElement('div');
    overlay.id = 'dp-import-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.8);
      backdrop-filter: blur(6px);
      z-index: 9999998;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background: rgba(30,30,40,0.98);
      border: 1px solid rgba(99,102,241,0.5);
      border-radius: 16px;
      padding: 32px 40px;
      text-align: center;
      max-width: 420px;
      color: #e2e8f0;
    `;
    box.innerHTML = `
      <div style="font-size:48px;margin-bottom:16px;">📥</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${message}</div>
      <div style="font-size:13px;color:#94a3b8;">Veuillez patienter…</div>
      <div style="width:48px;height:48px;border:4px solid rgba(99,102,241,0.3);border-top:4px solid #6366f1;border-radius:50%;margin:20px auto 0;animation:dpSpin 1s linear infinite;"></div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return overlay;
  }

  function removeOverlay() {
    document.getElementById('dp-import-overlay')?.remove();
  }

  // ========================================
  // MENU & BOUTON PRINCIPAL
  // ========================================

  let menuVisible = false;

  function buildMenu() {
    document.getElementById('dp-menu')?.remove();
  
    const menu = document.createElement('div');
    menu.id = 'dp-menu';
    menu.style.cssText = `
      position: fixed;
      bottom: 210px;           /* ← était 180px */
      right: 20px;
      background: #1e2022;
      border: 1px solid rgba(99,102,241,0.3);
      border-radius: 12px;
      padding: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      z-index: 9999998;
      display: none;
      flex-direction: column;
      gap: 6px;
      min-width: 220px;
    `;
  
    // Bouton import
    const importBtn = createMenuBtn('📥 Importer dans Publisher', '', async () => {
      hideMenu();
      const overlay = createOverlay(`Import de « ${document.querySelector('.p-title-value')?.childNodes[0]?.textContent?.trim() || '…'} »`);
      try {
        const data   = extractData();
        const result = await sendToPublisher(data);
  
        if (result.action === 'already_in_collection') {
          showNotification(`⚠️ Déjà dans votre collection !\n${data.name}`, 'warning');
        } else {
          showNotification(`✅ Ajouté avec succès !\n${data.name}${data.version ? ' ' + data.version : ''}`, 'success');
        }
      } catch (err) {
        showNotification(`❌ ${err.message}`, 'error');
      } finally {
        removeOverlay();
      }
    });
    menu.appendChild(importBtn);
  
    // Bouton copier JSON (debug)
    const copyBtn = createMenuBtn('📋 Copier JSON', '#94a3b8', () => {
      hideMenu();
      const data = extractData();
      navigator.clipboard.writeText(JSON.stringify(data, null, 2))
        .then(() => showNotification('📋 JSON copié dans le presse-papiers', 'success'))
        .catch(() => showNotification('❌ Erreur lors de la copie', 'error'));
    });
    menu.appendChild(copyBtn);
  
    // Bouton port
    const portBtn = createMenuBtn(`⚙️ Port : ${LOCAL_PORT}`, '#64748b', () => {
      hideMenu();
      const newPort = prompt(`Port du serveur Discord Publisher (défaut : 7832) :`, String(LOCAL_PORT));
      if (newPort && /^\d+$/.test(newPort)) {
        GM_setValue('dp_port', parseInt(newPort, 10));
        showNotification(`✅ Port mis à jour : ${newPort}\nRechargez la page pour appliquer.`, 'success');
      }
    });
    menu.appendChild(portBtn);
  
    document.body.appendChild(menu);
  }

  function createMenuBtn(text, color, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      background: #2a2c30;
      color: ${color || '#e2e8f0'};
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    `;
    btn.addEventListener('mouseover', () => { btn.style.background = '#3a3c42'; });
    btn.addEventListener('mouseout',  () => { btn.style.background = '#2a2c30'; });
    btn.addEventListener('click', onClick);
    return btn;
  }

  function toggleMenu() {
    const menu = document.getElementById('dp-menu');
    if (!menu) return;
    menuVisible = !menuVisible;
    menu.style.display = menuVisible ? 'flex' : 'none';
  }

  function hideMenu() {
    const menu = document.getElementById('dp-menu');
    if (menu) menu.style.display = 'none';
    menuVisible = false;
  }

  function createMainButton() {
    const btn = document.createElement('button');
    btn.id = 'dp-main-btn';
    btn.style.cssText = `
      position: fixed;
      bottom: 130px;           /* ← était 100px */
      right: 20px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      border: none;
      border-radius: 12px;
      padding: 13px 18px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(99,102,241,0.45);
      z-index: 9999997;
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    btn.innerHTML = '<span>🎮</span><span>Publisher</span>';
  
    btn.addEventListener('mouseover', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 6px 20px rgba(99,102,241,0.6)';
    });
    btn.addEventListener('mouseout', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 4px 14px rgba(99,102,241,0.45)';
    });
    btn.addEventListener('click', toggleMenu);
    document.body.appendChild(btn);
  }

  // ========================================
  // STYLES GLOBAUX
  // ========================================

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes dpSlideIn {
        from { transform: translateX(340px); opacity: 0; }
        to   { transform: translateX(0);     opacity: 1; }
      }
      @keyframes dpSlideOut {
        from { transform: translateX(0);     opacity: 1; }
        to   { transform: translateX(340px); opacity: 0; }
      }
      @keyframes dpSpin {
        from { transform: rotate(0deg);   }
        to   { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  // ========================================
  // FERMETURE DU MENU AU CLIC DEHORS
  // ========================================

  document.addEventListener('click', (e) => {
    const menu    = document.getElementById('dp-menu');
    const mainBtn = document.getElementById('dp-main-btn');
    if (menuVisible && menu && !menu.contains(e.target) && !mainBtn?.contains(e.target)) {
      hideMenu();
    }
  });

  // ========================================
  // INITIALISATION
  // ========================================

  function init() {
    addStyles();
    buildMenu();
    createMainButton();

    console.info(
      '%c[Discord Publisher v4.0]',
      'color:#6366f1;font-weight:bold;font-size:13px;',
      `✅ Prêt — connexion via http://127.0.0.1:${LOCAL_PORT}`,
      `| ${isF95Zone ? 'F95Zone' : 'LewdCorner'}`
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
