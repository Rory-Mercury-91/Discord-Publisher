import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useApp } from '../state/appContext';
import PreviewImage from './PreviewImage';

interface DiscordPreviewModalProps {
  preview: string;
  onClose: () => void;
  onCopy: () => void;
  mainImagePath?: string;
}

// Map des émojis Discord courants (format :nom: → Unicode)
const discordEmojis: Record<string, string> = {
  'computer': '💻',
  'point_down': '👇',
  'sparkling_heart': '💖',
  'flag_fr': '🇫🇷',
  'smile': '😄', 'grinning': '😀', 'smiley': '😃', 'grin': '😁', 'laughing': '😆', 'satisfied': '😆',
  'joy': '😂', 'rofl': '🤣', 'relaxed': '☺️', 'blush': '😊', 'innocent': '😇', 'wink': '😉',
  'heart_eyes': '😍', 'kissing_heart': '😘', 'kissing': '😗', 'yum': '😋', 'stuck_out_tongue': '😛',
  'stuck_out_tongue_winking_eye': '😜', 'stuck_out_tongue_closed_eyes': '😝', 'thinking': '🤔',
  'neutral_face': '😐', 'expressionless': '😑', 'no_mouth': '😶', 'smirk': '😏', 'unamused': '😒',
  'roll_eyes': '🙄', 'grimacing': '😬', 'lying_face': '🤥', 'relieved': '😌', 'pensive': '😔',
  'sleepy': '😪', 'sleeping': '😴', 'mask': '😷', 'thermometer_face': '🤒', 'head_bandage': '🤕',
  'nauseated_face': '🤢', 'sneezing_face': '🤧', 'hot_face': '🥵', 'cold_face': '🥶', 'woozy_face': '🥴',
  'dizzy_face': '😵', 'exploding_head': '🤯', 'cowboy': '🤠', 'partying_face': '🥳', 'monocle': '🧐',
  'nerd': '🤓', 'sunglasses': '😎', 'clown': '🤡', 'shushing': '🤫', 'face_with_hand_over_mouth': '🤭',
  'face_with_raised_eyebrow': '🤨', 'star_struck': '🤩', 'partying': '🥳',
  'tada': '🎉', 'rocket': '🚀', 'fire': '🔥', 'sparkles': '✨', 'star': '⭐', 'check': '✅', 'white_check_mark': '✅', 'x': '❌',
  'warning': '⚠️', 'error': '🚫', 'info': 'ℹ️', 'question': '❓', 'exclamation': '❗',
  'desktop': '🖥️', 'keyboard': '⌨️', 'mouse': '🖱️', 'joystick': '🕹️', 'video_game': '🎮',
  'gear': '⚙️', 'tools': '🛠️', 'wrench': '🔧', 'hammer': '🔨', 'package': '📦',
  'link': '🔗', 'attachment': '📎', 'floppy_disk': '💾', 'cd': '💿', 'arrow_right': '➡️',
  'arrow_down': '⬇️', 'arrow_up': '⬆️', 'double_arrow_right': '⏩', 'cool': '🆒', 'new': '🆕',
  'thumbsup': '👍', 'thumbsdown': '👎', 'ok_hand': '👌', 'raised_hands': '🙌', 'clap': '👏',
  'pray': '🙏', 'handshake': '🤝', 'muscle': '💪', 'point_up': '👆', 'point_left': '👈',
  'point_right': '👉', 'wave': '👋', 'v': '✌️', 'fingers_crossed': '🤞',
  'heart': '❤️', 'blue_heart': '💙', 'green_heart': '💚', 'yellow_heart': '💛', 'purple_heart': '💜',
  'black_heart': '🖤', 'orange_heart': '🧡', 'white_heart': '🤍', 'brown_heart': '🤎',
  'broken_heart': '💔', 'heartbeat': '💓', 'heartpulse': '💗', 'cupid': '💘', 'revolving_hearts': '💞',
  'flag_us': '🇺🇸', 'flag_gb': '🇬🇧', 'flag_jp': '🇯🇵', 'flag_de': '🇩🇪', 'flag_es': '🇪🇸',
  'flag_it': '🇮🇹', 'flag_ru': '🇷🇺', 'flag_cn': '🇨🇳', 'flag_kr': '🇰🇷', 'flag_br': '🇧🇷',
  'bulb': '💡', 'moneybag': '💰', 'gift': '🎁', 'bell': '🔔', 'megaphone': '📣',
  'loudspeaker': '📢', 'eye': '👁️', 'eyes': '👀', 'speech_balloon': '💬', 'thought_balloon': '💭'
};

// Fonction pour remplacer les émojis dans le texte
function replaceEmojis(text: string): string {
  return text.replace(/:([a-z0-9_]+):/g, (match, p1) => {
    return discordEmojis[p1] || match;
  });
}

export default function DiscordPreviewModal({ preview, onClose, onCopy, mainImagePath }: DiscordPreviewModalProps) {
  useEscapeKey(() => onClose(), true);
  useModalScrollLock();

  const { uploadedImages } = useApp();
  const mainImage = mainImagePath
    ? uploadedImages.find(img => img.url === mainImagePath)
    : uploadedImages.find(img => img.isMain);

  const imagePathToDisplay = mainImage?.url;
  const contentRef = useRef<HTMLDivElement>(null);

  // Pré-traiter le texte pour remplacer les émojis
  let processedPreview = replaceEmojis(preview);

  // Ne pas traiter les placeholders ici - ils seront stylés après le rendu markdown
  // pour éviter d'afficher le code HTML brut quand la variable est vide

  // Post-traiter le DOM pour styler les placeholders [Variable]
  useEffect(() => {
    if (!contentRef.current) return;

    // Trouver tous les nœuds texte qui contiennent des placeholders
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent && /\[[A-Za-z_][A-Za-z0-9_]*\]/.test(node.textContent)) {
        textNodes.push(node as Text);
      }
    }

    // Remplacer les nœuds texte contenant des placeholders
    textNodes.forEach(textNode => {
      const parent = textNode.parentElement;
      if (!parent) return;

      const text = textNode.textContent || '';
      const parts = text.split(/(\[[A-Za-z_][A-Za-z0-9_]*\])/g);

      if (parts.length === 1) return; // Pas de placeholder

      // Créer des fragments avec les placeholders stylés
      const fragment = document.createDocumentFragment();
      parts.forEach((part) => {
        if (part.match(/^\[[A-Za-z_][A-Za-z0-9_]*\]$/)) {
          // C'est un placeholder, créer un span stylé
          const span = document.createElement('span');
          span.style.color = 'rgba(255,255,255,0.2)';
          span.style.fontStyle = 'italic';
          span.textContent = part;
          fragment.appendChild(span);
        } else if (part) {
          // Texte normal
          fragment.appendChild(document.createTextNode(part));
        }
      });

      // Remplacer le nœud texte par le fragment
      parent.replaceChild(fragment, textNode);
    });
  }, [processedPreview]);

  const characterCount = preview.length;
  const isOverLimit = characterCount > 2000;

  return (
    <div className="modal" style={{ zIndex: 1000 }}>
      <div className="panel" onClick={e => e.stopPropagation()} style={{
        maxWidth: '90vw',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#36393f',
        border: '1px solid #202225'
      }}>
        {/* Header Discord-like */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #202225',
          background: '#2f3136'
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f2f3f5' }}>
            🎨 Aperçu Discord
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Compteur de caractères */}
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: isOverLimit ? '#f23f42' : '#b9bbbe',
              padding: '4px 10px',
              background: isOverLimit ? 'rgba(242, 63, 66, 0.1)' : 'rgba(114, 137, 218, 0.1)',
              borderRadius: 4,
              border: `1px solid ${isOverLimit ? '#f23f42' : 'rgba(114, 137, 218, 0.3)'}`
            }}>
              {characterCount} / 2000
              {isOverLimit && (
                <span style={{ marginLeft: 6, fontSize: 11 }}>
                  ⚠️ +{characterCount - 2000}
                </span>
              )}
            </div>
            <button
              onClick={onCopy}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                height: 32,
                border: '1px solid #4f545c',
                borderRadius: 4,
                cursor: 'pointer',
                background: '#5865f2',
                color: 'white',
                fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#4752c4';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#5865f2';
              }}
            >
              📋 Copier
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                height: 32,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                background: 'transparent',
                color: '#b9bbbe',
                fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(79, 84, 92, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Contenu Discord-like scrollable */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          background: '#36393f',
          padding: '20px 0'
        }} className="styled-scrollbar">
          {/* Message Discord simulé */}
          <div style={{
            display: 'flex',
            gap: 16,
            padding: '0 20px',
            fontFamily: "'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
            position: 'relative'
          }}>
            {/* Avatar factice */}
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #5865f2 0%, #3b3c42 100%)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 600,
              color: 'white',
              position: 'relative',
              cursor: 'pointer'
            }}>
              <span style={{ fontFamily: 'Noto Color Emoji, Segoe UI Emoji' }}>🤖</span>
            </div>

            {/* Contenu du message */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* En-tête du message (nom + badge APP + timestamp) */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 4
              }}>
                <span style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#ffffff'
                }}>
                  Système de Publication
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  background: '#5865f2',
                  color: 'white',
                  borderRadius: 3,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  lineHeight: '14px'
                }}>
                  APP
                </span>
                <span style={{
                  fontSize: 12,
                  color: '#72767d',
                  marginLeft: 4
                }}>
                  Aujourd'hui à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Contenu markdown avec style Discord fidèle */}
              <div
                ref={contentRef}
                style={{
                  fontSize: 16, // Taille de base pour les paragraphes
                  lineHeight: '1.375rem',
                  color: '#dcddde',
                  wordWrap: 'break-word',
                  fontFamily: "'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontFeatureSettings: '"liga" 1, "kern" 1'
                }}
                className="discord-markdown-content"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    // H2 (##) - Plus gros et en gras
                    h2: ({ children }) => (
                      <h2 style={{
                        fontSize: '1.375rem', // 22px - PLUS GROS que le texte normal
                        fontWeight: 700,
                        margin: '14px 0 6px 0',
                        color: '#ffffff',
                        lineHeight: '1.375rem'
                      }}>{children}</h2>
                    ),
                    // H3 (###) - Même taille que le texte normal mais en gras
                    h3: ({ children }) => (
                      <h3 style={{
                        fontSize: '1rem', // 16px - MÊME TAILLE que le texte normal
                        fontWeight: 700,
                        margin: '12px 0 4px 0',
                        color: '#ffffff',
                        lineHeight: '1.375rem'
                      }}>{children}</h3>
                    ),
                    // Paragraphes
                    p: ({ children }) => (
                      <p style={{
                        margin: 0,
                        lineHeight: '1.375rem',
                        marginBottom: '8px',
                        fontSize: '1rem' // 16px - taille normale
                      }}>{children}</p>
                    ),
                    // Listes à puces (*)
                    // Le CSS dans index.css gère automatiquement les listes imbriquées
                    // ReactMarkdown crée des <ul> imbriqués pour les retraits (4 espaces)
                    ul: ({ children }) => (
                      <ul style={{
                        margin: '4px 0 8px 0',
                        paddingLeft: '24px',
                        color: '#dcddde',
                        listStyleType: 'disc',
                        listStylePosition: 'outside'
                      }}>{children}</ul>
                    ),
                    // Éléments de liste
                    li: ({ children }) => (
                      <li style={{
                        marginBottom: '4px',
                        lineHeight: '1.375rem',
                        display: 'list-item',
                        paddingLeft: '4px'
                      }}>{children}</li>
                    ),
                    // Texte en gras (**mot**)
                    strong: ({ children }) => (
                      <strong style={{
                        fontWeight: 700,
                        color: '#ffffff'
                      }}>{children}</strong>
                    ),
                    // Code inline - doit rester sur la même ligne
                    code: (props: any) => {
                      const { children, className } = props;
                      // Vérifier si c'est du code inline (pas de className ou className ne contient pas 'language-')
                      const isInline = !className || !className.startsWith('language-');

                      if (isInline) {
                        // Code inline - reste sur la même ligne
                        return (
                          <code style={{
                            background: '#2f3136',
                            color: '#e3e4e6',
                            padding: '2px 4px',
                            borderRadius: 3,
                            fontFamily: "'Consolas', 'Courier New', monospace",
                            fontSize: '0.875em',
                            border: '1px solid #202225',
                            display: 'inline',
                            whiteSpace: 'nowrap'
                          }}>{children}</code>
                        );
                      }
                      // Code block : pas de bordure/fond sur code pour éviter double conteneur (le <pre> parent fournit le seul cadre)
                      return (
                        <code style={{
                          display: 'block',
                          background: 'transparent',
                          color: '#e3e4e6',
                          padding: 0,
                          fontFamily: "'Consolas', 'Courier New', monospace",
                          fontSize: '0.875em',
                          overflowX: 'auto',
                          whiteSpace: 'pre'
                        }}>{children}</code>
                      );
                    },
                    // Blockquote
                    blockquote: ({ children }) => (
                      <blockquote style={{
                        margin: '4px 0',
                        paddingLeft: '16px',
                        borderLeft: '4px solid #4f545c',
                        color: '#dcddde'
                      }}>{children}</blockquote>
                    ),
                    // Liens
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        style={{
                          color: '#00aff4',
                          textDecoration: 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = 'underline';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = 'none';
                        }}
                      >
                        {children}
                      </a>
                    )
                  }}
                >
                  {processedPreview}
                </ReactMarkdown>
              </div>

              {/* Image principale si présente */}
              {imagePathToDisplay && (
                <div style={{ marginTop: 16 }}>
                  <PreviewImage imagePath={imagePathToDisplay} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
