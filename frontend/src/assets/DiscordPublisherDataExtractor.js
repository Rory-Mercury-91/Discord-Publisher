// ==UserScript==
// @name         Discord Publisher — Import rapide
// @namespace    http://tampermonkey.net/
// @version      4.7
// @description  Importe F95/LewdCorner, fiche Nautiljon (métadonnées) ou WEBTOON (lien officiel) dans Discord Publisher.
// @author       Rory Mercury 91
// @match        https://f95zone.to/threads/*
// @match        https://*.f95zone.to/threads/*
// @match        https://lewdcorner.com/threads/*
// @match        https://*.lewdcorner.com/threads/*
// @match        https://www.nautiljon.com/mangas/*
// @match        https://www.nautiljon.com/animes/*
// @match        https://www.nautiljon.com/light_novels/*
// @match        https://www.nautiljon.com/manwhas/*
// @match        https://www.webtoons.com/*/list*
// @match        https://www.webtoons.com/*/*/list*
// @match        https://www.webtoons.com/*/*/*/list*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      127.0.0.1
// @connect      localhost
// @connect      www.nautiljon.com
// ==/UserScript==

(function () {
  'use strict';

  // Port du serveur local Tauri — doit correspondre à celui défini dans lib.rs
  const LOCAL_PORT = GM_getValue('dp_port', 7832);

  const isF95Zone    = window.location.hostname.includes('f95zone');
  const isLewdCorner = window.location.hostname.includes('lewdcorner');
  const isNautiljon  = window.location.hostname.includes('nautiljon.com');
  const isWebtoon    = window.location.hostname.includes('webtoons.com');
  const isWorkImport = isNautiljon || isWebtoon;
  const NAUTILJON_ORIGIN = 'https://www.nautiljon.com';

  function decodeHtmlEntities(text) {
    if (!text) return '';
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return el.value.trim();
  }

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
      'on hold'   : 'EN PAUSE',
      'onhold'    : 'EN PAUSE',
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

    // Correction : preview → attachments (pleine taille, cohérent avec le backend)
    if (src.includes('preview.f95zone.to'))
      src = src.replace('preview.f95zone.to', 'attachments.f95zone.to');
    if (src.includes('preview.lewdcorner.com'))
      src = src.replace('preview.lewdcorner.com', 'attachments.lewdcorner.com');

    return src || '';
  }

  function extractThreadId() {
    const url     = window.location.href;
    const idMatch = url.match(/\.(\d+)(?:\/|#|$)/) || url.match(/\/threads\/(?:[^/]*\.)?(\d+)/);
    return idMatch ? parseInt(idMatch[1], 10) : 0;
  }

  /**
   * Extrait la date "Thread Updated" depuis le premier post.
   * Retourne une chaîne YYYY-MM-DD ou '' si non trouvée.
   */
  function extractF95DateMaj() {
    const bbWrapper = document.querySelector('.message-threadStarterPost .bbWrapper');
    if (!bbWrapper) return '';

    const text = bbWrapper.innerText || bbWrapper.textContent || '';

    // Cherche "Thread Updated: ..." ou "Thread Update: ..."
    const match = text.match(/Thread\s+Updated?\s*[:\-]\s*([^\n]{4,30})/i);
    if (!match) return '';

    const raw = match[1].trim().split(/[|(]/)[0].trim();
    if (!raw || raw.length < 6) return '';

    // Format YYYY-MM-DD ou YYYY/MM/DD ou YYYY.MM.DD
    let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) {
      const [, y, mo, d] = m;
      if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31)
        return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }

    // Format DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
    m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      const [, p1, p2, y] = m;
      if (+p1 > 12 && +p2 <= 12)
        return `${y}-${p2.padStart(2,'0')}-${p1.padStart(2,'0')}`;
      if (+p2 <= 12 && +p1 <= 31)
        return `${y}-${p2.padStart(2,'0')}-${p1.padStart(2,'0')}`;
    }

    // Format "March 14, 2026" ou "Aug 7, 2018"
    const MONTHS = {
      january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
      july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
      jan:'01', feb:'02', mar:'03', apr:'04', jun:'06', jul:'07',
      aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
    };
    m = raw.match(/^(\w+)\s+(\d{1,2})[,\s\-]+(\d{4})$/);
    if (m) {
      const mo = MONTHS[m[1].toLowerCase()];
      if (mo) return `${m[3]}-${mo}-${m[2].padStart(2,'0')}`;
    }

    // Format "16 May 2018" ou "02 December, 2016"
    m = raw.match(/^(\d{1,2})\s+(\w+)[,\s]+(\d{4})$/);
    if (m) {
      const mo = MONTHS[m[2].toLowerCase()];
      if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
    }

    return '';
  }

  // ─── Nautiljon ─────────────────────────────────────────────────────────────

  function normalizeNautiljonLabel(text) {
    return (text || '').trim().replace(/:\s*$/, '').toLowerCase();
  }

  function findNautiljonInfoLi(labelVariants) {
    const variants = Array.isArray(labelVariants) ? labelVariants : [labelVariants];
    const wanted = variants.map(v => v.toLowerCase());
    const items = document.querySelectorAll('.liste_infos li, ul.mb10 li, .infosFicheTop li');
    for (const li of items) {
      const bold = li.querySelector('.bold');
      if (!bold) continue;
      const boldNorm = normalizeNautiljonLabel(bold.textContent);
      if (wanted.some(v => boldNorm === v || boldNorm.startsWith(v))) return li;
    }
    return null;
  }

  function extractNautiljonLinkTexts(li) {
    if (!li) return [];
    return Array.from(li.querySelectorAll('a'))
      .map(a => (a.textContent || '').trim())
      .filter(Boolean);
  }

  /** Texte libre après le libellé (ex. « Action- Aventure » sans liens, ou « École » seul). */
  function extractNautiljonPlainTexts(li) {
    if (!li) return [];
    const clone = li.cloneNode(true);
    clone.querySelectorAll('.bold').forEach(el => el.remove());
    const text = (clone.textContent || '').trim().replace(/^:\s*/, '');
    if (!text) return [];
    return text
      .split(/\s*-\s*/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function extractNautiljonValuesFromLi(li) {
    if (!li) return [];
    const fromSchema = Array.from(li.querySelectorAll('[itemprop="genre"]'))
      .map(el => (el.textContent || '').trim())
      .filter(Boolean);
    if (fromSchema.length) return fromSchema;
    const fromLinks = extractNautiljonLinkTexts(li);
    if (fromLinks.length) return fromLinks;
    return extractNautiljonPlainTexts(li);
  }

  function extractNautiljonGenres() {
    return extractNautiljonValuesFromLi(findNautiljonInfoLi(['Genres', 'Genre']));
  }

  function extractNautiljonThemes() {
    return extractNautiljonValuesFromLi(findNautiljonInfoLi(['Thèmes', 'Thème']));
  }

  function extractNautiljonTitle() {
    const img = document.querySelector('.image_fiche img[itemprop="image"]');
    const fromAlt = decodeHtmlEntities(img?.getAttribute('alt') || '');
    if (fromAlt) return fromAlt;
    const h1 = document.querySelector('.infosFicheTop h1, #content h1, h1');
    const fromH1 = (h1?.textContent || '').trim();
    if (fromH1 && !/nautiljon/i.test(fromH1)) return fromH1;
    const docTitle = (document.title || '').replace(/\s*-\s*Nautiljon.*$/i, '').trim();
    return docTitle || 'N/A';
  }

  function toAbsoluteNautiljonUrl(href) {
    if (!href) return '';
    if (href.startsWith('http://') || href.startsWith('https://')) return href.split('?')[0];
    return NAUTILJON_ORIGIN + (href.startsWith('/') ? href : '/' + href);
  }

  function toNautiljonMiniImageUrl(url) {
    if (!url || !url.includes('nautiljon.com') || url.includes('/mini/')) return url;
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const fileName = segments.pop();
      if (!fileName || segments[segments.length - 1] === 'mini') return url;
      segments.push('mini', fileName);
      parsed.pathname = '/' + segments.join('/');
      return parsed.toString();
    } catch (e) {
      return url.replace(/(\/images\/[^/]+\/\d+\/\d+\/)(?!mini\/)/, '$1mini/');
    }
  }

  function extractNautiljonCover() {
    const img = document.querySelector('.image_fiche img[itemprop="image"]');
    if (img) {
      const src = img.getAttribute('src') || img.src || '';
      if (src) return toAbsoluteNautiljonUrl(src);
    }
    const link = document.querySelector('.image_fiche a.cboxImage');
    if (link) {
      const href = link.getAttribute('href') || link.href || '';
      return toNautiljonMiniImageUrl(toAbsoluteNautiljonUrl(href));
    }
    return '';
  }

  function extractNautiljonSynopsis() {
    const desc = document.querySelector('.top_bloc .description, .top_bloc h2 + .bas_bloc .description');
    if (!desc) return '';
    const clone = desc.cloneNode(true);
    clone.querySelectorAll('.fader, .showmore, .bio_infos').forEach(el => el.remove());
    return (clone.innerText || clone.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Type d'œuvre : Manhua / Manhwa / WebComic (webcomic Oui) / Manga / LN… */
  function extractNautiljonWorkType() {
    const path = (window.location.pathname || '').toLowerCase();

    const webcomicLi = findNautiljonInfoLi(['Webcomic']);
    if (webcomicLi) {
      const webcomicValues = extractNautiljonValuesFromLi(webcomicLi);
      if (webcomicValues.some(v => /^oui$/i.test(v))) return 'webtoon';
    }

    if (path.includes('/manwhas/')) return 'manhwa';

    const typeLi = findNautiljonInfoLi(['Type', 'Types', 'Catégorie', 'Categorie']);
    const typeText = extractNautiljonValuesFromLi(typeLi).join(' ').toLowerCase();
    if (typeText.includes('manhua')) return 'manhua';
    if (typeText.includes('manhwa')) return 'manhwa';
    if (typeText.includes('webcomic') || typeText.includes('webtoon')) return 'webtoon';
    if (typeText.includes('light novel') || typeText.includes('light_novel')) return 'light_novel';
    if (typeText.includes('roman') && !typeText.includes('graphique')) return 'novel';

    if (path.includes('/light_novels/')) return 'light_novel';
    if (path.includes('/mangas/')) return 'manga';
    return null;
  }

  function extractNautiljonData() {
    const genres = extractNautiljonGenres();
    const themes = extractNautiljonThemes();
    const combined = [...genres, ...themes].filter(Boolean).join(' - ');
    const workType = extractNautiljonWorkType();
    return {
      domain        : 'Nautiljon',
      kind          : 'work_tracking',
      name          : extractNautiljonTitle(),
      genres_themes : combined,
      image         : extractNautiljonCover(),
      synopsis      : extractNautiljonSynopsis(),
      ...(workType ? { work_type: workType } : {}),
    };
  }

  // ─── WEBTOON (plateforme officielle : titre, synopsis, lien) ───────────────

  function extractWebtoonListUrl() {
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (canonical) return canonical.split('#')[0];

    const state = window.__episodeListState__;
    const episodePath = state?.episodeListParam?.episodePath;
    const titleNo = state?.episodeListParam?.titleNo
      || state?.logParam?.titleNo
      || state?.title?.titleNo;
    if (episodePath && titleNo) {
      return `${episodePath}/list?title_no=${titleNo}`;
    }

    const url = window.location.href.split('#')[0];
    if (/\/list(\?|$)/i.test(url)) return url;
    return url;
  }

  function extractWebtoonTitle() {
    const state = window.__episodeListState__;
    const fromState = state?.shareParam?.title || state?.logParam?.title;
    if (fromState) return decodeHtmlEntities(fromState);

    const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
    if (ogTitle) return decodeHtmlEntities(ogTitle).replace(/\s*\|\s*WEBTOON.*$/i, '').trim();

    const pageTitle = document.title.replace(/\s*\|\s*WEBTOON.*$/i, '').trim();
    if (pageTitle) return decodeHtmlEntities(pageTitle);

    const h1 = document.querySelector('.subj_info h1, #_episodeList .subj_info h1, h1');
    return (h1?.textContent || '').trim() || 'N/A';
  }

  function extractWebtoonSynopsis() {
    const state = window.__episodeListState__;
    const fromState = state?.shareParam?.synopsis;
    if (fromState) return fromState.replace(/\\'/g, "'").trim();

    const summary = document.querySelector('.summary, .detail_summary, p.summary, .work_summary p');
    if (summary) return (summary.textContent || '').trim();

    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
    if (metaDesc) {
      const marker = metaDesc.match(/(?:MARDI|LUNDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE)\.\s+(.+?)(?:,\s*disponibles|$)/i);
      if (marker?.[1]) return marker[1].trim();
    }
    return '';
  }

  const FRENCH_MONTHS = {
    janv: '01', janvier: '01', 'févr': '02', fevr: '02', fevrier: '02', 'février': '02',
    mars: '03', avr: '04', avril: '04', mai: '05', juin: '06',
    juil: '07', juillet: '07', 'août': '08', aout: '08', 'ao\u00fbt': '08',
    sept: '09', septembre: '09', oct: '10', octobre: '10',
    nov: '11', novembre: '11', 'déc': '12', dec: '12', 'd\u00e9c': '12', decembre: '12', 'd\u00e9cembre': '12',
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function isoFromParts(day, month, year) {
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    if (!month || !d || !y || d < 1 || d > 31) return '';
    return `${y}-${month}-${pad2(d)}`;
  }

  /** Parse « 6 juin 2026 », « 25 avr. 2026 », etc. → YYYY-MM-DD */
  function parseFrenchWebtoonDate(raw) {
    const text = (raw || '').trim().replace(/\u00a0/g, ' ').replace(/\./g, '').toLowerCase();
    if (!text) return '';

    let m = text.match(/^(\d{1,2})\s+([a-z\u00e0-\u017f]+)\s+(\d{4})$/i);
    if (m) {
      const month = FRENCH_MONTHS[m[2]];
      return isoFromParts(m[1], month, m[3]);
    }

    m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

    return '';
  }

  function addDaysIso(iso, days) {
    if (!iso || !days) return '';
    const parts = iso.split('-').map(Number);
    if (parts.length !== 3) return '';
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  /** Dernier chapitre publié (premier de la liste) + date prochaine sortie estimée. */
  function extractWebtoonLatestEpisode() {
    const items = document.querySelectorAll('li._episodeItem');
    if (!items.length) return null;

    const latest = items[0];
    const episodeNo = (
      latest.getAttribute('data-episode-no')
      || latest.querySelector('.tx')?.textContent
      || latest.querySelector('.subj span')?.textContent
      || ''
    ).replace(/[^\d]/g, '').trim();
    if (!episodeNo) return null;

    const latestDateIso = parseFrenchWebtoonDate(latest.querySelector('span.date')?.textContent);

    let intervalDays = 7;
    if (items.length >= 2) {
      const prevDateIso = parseFrenchWebtoonDate(items[1].querySelector('span.date')?.textContent);
      if (latestDateIso && prevDateIso) {
        const d1 = new Date(latestDateIso);
        const d2 = new Date(prevDateIso);
        const diff = Math.round((d1 - d2) / 86400000);
        if (diff > 0 && diff <= 31) intervalDays = diff;
      }
    }

    const nextChapter = String(parseInt(episodeNo, 10) + 1);
    const nextDateIso = latestDateIso ? addDaysIso(latestDateIso, intervalDays) : '';

    return {
      progress_current      : episodeNo,
      chapter_next_release  : nextChapter,
      date_next_release     : nextDateIso,
    };
  }

  function extractWebtoonData() {
    const episode = extractWebtoonLatestEpisode();
    return {
      domain              : 'WEBTOON',
      kind                : 'work_tracking',
      name                : extractWebtoonTitle(),
      synopsis            : extractWebtoonSynopsis(),
      link                : extractWebtoonListUrl(),
      official_site_label : 'WEBTOON',
      ...(episode || {}),
    };
  }

  function extractF95Data() {
    const url         = window.location.href;
    const domain      = isLewdCorner ? 'LewdCorner' : 'F95z';
    const id          = extractThreadId();
    const { name, version }  = extractTitleAndVersion();
    const { status, type }   = extractStatusAndType();
    const tags        = extractTags();
    const image       = extractImage();
    const synopsis    = extractSynopsis();
    const f95_date_maj = isF95Zone ? extractF95DateMaj() : '';
    const baseUrl     = isLewdCorner ? 'https://lewdcorner.com' : 'https://f95zone.to';
    const link        = id ? `${baseUrl}/threads/${id}` : url.split('?')[0];

    return { domain, id, name, version, status, type, tags, image, synopsis, link, f95_date_maj };
  }

  function extractData() {
    if (isNautiljon) return extractNautiljonData();
    if (isWebtoon) return extractWebtoonData();
    return extractF95Data();
  }

  // Télécharge la couverture Nautiljon en data URL (anti-hotlink dans l'app Tauri).
  function fetchImageAsDataUrl(imageUrl) {
    return new Promise((resolve) => {
      if (!imageUrl || (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://'))) {
        resolve('');
        return;
      }
      GM_xmlhttpRequest({
        method      : 'GET',
        url         : imageUrl,
        responseType: 'arraybuffer',
        headers     : isNautiljon ? { Referer: 'https://www.nautiljon.com/' } : {},
        onload(resp) {
          if (resp.status < 200 || resp.status >= 300) {
            resolve('');
            return;
          }
          try {
            const bytes = new Uint8Array(resp.response);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            const b64 = btoa(binary);
            const hdr = (resp.responseHeaders || '').toLowerCase();
            const match = hdr.match(/content-type:\s*([^\r\n;]+)/);
            const mime = match ? match[1].trim() : 'image/webp';
            resolve(`data:${mime};base64,${b64}`);
          } catch (e) {
            resolve('');
          }
        },
        onerror: () => resolve(''),
      });
    });
  }

  async function prepareWorkImportData(data) {
    if (!isNautiljon || !data.image) return data;
    const miniImage = toNautiljonMiniImageUrl(data.image);
    const image_data = await fetchImageAsDataUrl(miniImage);
    return { ...data, image: miniImage, ...(image_data ? { image_data } : {}) };
  }

  // ========================================
  // COMMUNICATION AVEC DISCORD PUBLISHER (localhost)
  // ========================================

  function sendToPublisher(gameData) {
    return new Promise((resolve, reject) => {
      const payload = isWorkImport
        ? {
            domain               : gameData.domain,
            kind                 : 'work_tracking',
            name                 : gameData.name,
            genres_themes        : gameData.genres_themes || null,
            image                : gameData.image || null,
            image_data           : gameData.image_data || null,
            synopsis             : gameData.synopsis || null,
            link                 : gameData.link || null,
            official_site_label  : gameData.official_site_label || null,
            work_type            : gameData.work_type || null,
            progress_current     : gameData.progress_current || null,
            chapter_next_release : gameData.chapter_next_release || null,
            date_next_release    : gameData.date_next_release || null,
          }
        : {
            domain      : gameData.domain,
            id          : gameData.id,
            name        : gameData.name,
            version     : gameData.version,
            status      : gameData.status,
            type        : gameData.type,
            tags        : gameData.tags,
            link        : gameData.link,
            image       : gameData.image,
            synopsis    : gameData.synopsis,
            f95_date_maj: gameData.f95_date_maj || null,
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
      bottom: 210px;
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
      bottom: 210px;
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
    const importLabel = isWorkImport
      ? '📥 Importer dans Publisher (Suivi d\'œuvres)'
      : '📥 Importer dans Publisher';

    const importBtn = createMenuBtn(importLabel, '', async () => {
      hideMenu();
      const titlePreview = isWorkImport
        ? (isWebtoon ? extractWebtoonTitle() : extractNautiljonTitle())
        : (document.querySelector('.p-title-value')?.childNodes[0]?.textContent?.trim() || '…');
      const overlay = createOverlay(`Import de « ${titlePreview} »`);
      try {
        const data   = await prepareWorkImportData(extractData());
        const result = await sendToPublisher(data);

        if (result.action === 'work_imported') {
          const hint = isWebtoon
            ? 'Lien WEBTOON, synopsis, titre et dernier chapitre importés.'
            : 'Genres, couverture, type et métadonnées importés.';
          showNotification(`✅ Données importées !\n${data.name}\n${hint}`, 'success');
        } else if (result.action === 'already_in_collection') {
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
      bottom: 130px;
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
    btn.innerHTML = isWorkImport
      ? (isWebtoon ? '<span>🌐</span><span>Publisher</span>' : '<span>📚</span><span>Publisher</span>')
      : '<span>🎮</span><span>Publisher</span>';

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

    const siteLabel = isNautiljon ? 'Nautiljon' : (isWebtoon ? 'WEBTOON' : (isF95Zone ? 'F95Zone' : 'LewdCorner'));
    console.info(
      '%c[Discord Publisher v4.7]',
      'color:#6366f1;font-weight:bold;font-size:13px;',
      `✅ Prêt — connexion via http://127.0.0.1:${LOCAL_PORT}`,
      `| ${siteLabel}`
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();