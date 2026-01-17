import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { useApp } from '../state/appContext';
import PreviewImage from './PreviewImage';

interface PreviewProps {
  preview: string;
  previewMode: 'raw' | 'styled';
  setPreviewMode: (mode: 'raw' | 'styled') => void;
  onCopy: () => void;
  onReset: () => void;
  mainImagePath?: string;
}

// Map des émojis Discord courants (format :nom: → Unicode)
const discordEmojis: Record<string, string> = {
  // --- Tes manquants ---
  'computer': '💻',
  'point_down': '👇',
  'sparkling_heart': '💖',
  'flag_fr': '🇫🇷',

  // --- Smileys & Émotions ---
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

  // --- Symboles, Tech & Gaming (Très utiles pour tes posts) ---
  'tada': '🎉', 'rocket': '🚀', 'fire': '🔥', 'sparkles': '✨', 'star': '⭐', 'check': '✅', 'white_check_mark': '✅', 'x': '❌',
  'warning': '⚠️', 'error': '🚫', 'info': 'ℹ️', 'question': '❓', 'exclamation': '❗',
  'desktop': '🖥️', 'keyboard': '⌨️', 'mouse': '🖱️', 'joystick': '🕹️', 'video_game': '🎮',
  'gear': '⚙️', 'tools': '🛠️', 'wrench': '🔧', 'hammer': '🔨', 'package': '📦',
  'link': '🔗', 'attachment': '📎', 'floppy_disk': '💾', 'cd': '💿', 'arrow_right': '➡️',
  'arrow_down': '⬇️', 'arrow_up': '⬆️', 'double_arrow_right': '⏩', 'cool': '🆒', 'new': '🆕',

  // --- Mains & Gestes ---
  'thumbsup': '👍', 'thumbsdown': '👎', 'ok_hand': '👌', 'raised_hands': '🙌', 'clap': '👏',
  'pray': '🙏', 'handshake': '🤝', 'muscle': '💪', 'point_up': '👆', 'point_left': '👈',
  'point_right': '👉', 'wave': '👋', 'v': '✌️', 'fingers_crossed': '🤞',

  // --- Cœurs & Formes ---
  'heart': '❤️', 'blue_heart': '💙', 'green_heart': '💚', 'yellow_heart': '💛', 'purple_heart': '💜',
  'black_heart': '🖤', 'orange_heart': '🧡', 'white_heart': '🤍', 'brown_heart': '🤎',
  'broken_heart': '💔', 'heartbeat': '💓', 'heartpulse': '💗', 'cupid': '💘', 'revolving_hearts': '💞',

  // --- Drapeaux ---
  'flag_us': '🇺🇸', 'flag_gb': '🇬🇧', 'flag_jp': '🇯🇵', 'flag_de': '🇩🇪', 'flag_es': '🇪🇸',
  'flag_it': '🇮🇹', 'flag_ru': '🇷🇺', 'flag_cn': '🇨🇳', 'flag_kr': '🇰🇷', 'flag_br': '🇧🇷',

  // --- Divers ---
  'bulb': '💡', 'moneybag': '💰', 'gift': '🎁', 'bell': '🔔', 'megaphone': '📣',
  'loudspeaker': '📢', 'eye': '👁️', 'eyes': '👀', 'speech_balloon': '💬', 'thought_balloon': '💭'
};

// Fonction pour remplacer les émojis dans le texte
function replaceEmojis(text: string): string {
  return text.replace(/:([a-z0-9_]+):/g, (match, p1) => {
    return discordEmojis[p1] || match;
  });
}

export default function Preview({
  preview,
  previewMode,
  setPreviewMode,
  onCopy,
  onReset,
  mainImagePath
}: PreviewProps) {
  // Récupérer l'image principale depuis le contexte si mainImagePath n'est pas fourni
  const { uploadedImages, inputs } = useApp();
  const mainImage = mainImagePath
    ? uploadedImages.find(img => img.path === mainImagePath)
    : uploadedImages.find(img => img.isMain);

  const imagePathToDisplay = mainImage?.path;

  // Pré-traiter le texte pour remplacer les émojis et gérer les placeholders
  let processedPreview = replaceEmojis(preview);
  processedPreview = processedPreview.replace(
    /\[([A-Za-z_][A-Za-z0-9_]*)\]/g,
    (match, varName) => {
      return `<span style="color:rgba(255,255,255,0.2); font-style:italic;">[${varName}]</span>`;
    }
  );

  const characterCount = processedPreview.length;
  const isOverLimit = characterCount > 2000;
  // Si le preview est vide, afficher un message
  if (!preview || preview.trim() === '') {
    return (
      <div className="preview-section" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
        minHeight: 0,
        background: 'var(--bg)',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--muted)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👁️</div>
          <div style={{ fontSize: 16 }}>Aperçu</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Le preview apparaîtra ici</div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-section" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      height: '100%',
      minHeight: 0,
      background: 'var(--bg)'
    }}>
      {/* Compteur de caractères */}
      <div style={{
        padding: '8px 12px',
        background: isOverLimit ? 'rgba(239, 68, 68, 0.1)' : 'rgba(74, 158, 255, 0.1)',
        border: `1px solid ${isOverLimit ? 'var(--error)' : 'rgba(74, 158, 255, 0.3)'}`,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          Compteur de caractères
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: isOverLimit ? 'var(--error)' : 'var(--text)'
        }}>
          {characterCount} / 2000
          {isOverLimit && (
            <span style={{ marginLeft: 8, fontSize: 11 }}>
              ⚠️ Limite dépassée de {characterCount - 2000}
            </span>
          )}
        </div>
      </div>

      {/* Boutons de mode et actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 6, padding: 2 }}>
          <button
            onClick={() => setPreviewMode('styled')}
            style={{
              padding: '6px 12px',
              background: previewMode === 'styled' ? 'var(--accent)' : 'transparent',
              color: previewMode === 'styled' ? 'white' : 'var(--muted)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
              height: 32
            }}
          >
            🎨 Stylisé
          </button>
          <button
            onClick={() => setPreviewMode('raw')}
            style={{
              padding: '6px 12px',
              background: previewMode === 'raw' ? 'var(--accent)' : 'transparent',
              color: previewMode === 'raw' ? 'white' : 'var(--muted)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
              height: 32
            }}
          >
            📝 Brut
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCopy}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer',
              background: 'transparent',
              color: 'inherit'
            }}
          >
            📋 Copier
          </button>
          <button
            onClick={onReset}
            style={{
              background: 'var(--error)',
              color: 'white',
              padding: '6px 12px',
              fontSize: 13,
              height: 32,
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            🔄 Réinitialiser
          </button>
        </div>
      </div>

      <div className="preview-body styled-scrollbar" style={{ flex: 1, overflow: 'auto' }}>
        {previewMode === 'raw' ? (
          <textarea
            readOnly
            value={preview}
            style={{
              width: '100%',
              height: '100%',
              fontFamily: 'monospace',
              padding: 12,
              borderRadius: 6,
              background: '#2b2d31',
              color: '#dbdee1',
              border: '1px solid var(--border)',
              resize: 'none'
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              minHeight: '100%',
              padding: '16px 0',
              background: '#2f3136',
              borderRadius: 4,
              overflow: 'auto'
            }}
          >
            {/* Message Discord simulé */}
            <div style={{
              display: 'flex',
              gap: 16,
              padding: '0 16px',
              fontFamily: "'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif"
            }}>
              {/* Avatar factice */}
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #ED4245 0%, #3B3C42 100%)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 600,
                color: 'white',
                position: 'relative'
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
                    color: '#f2f3f5'
                  }}>
                    Système de Publication
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    background: '#3b82f6',
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
                    Hier à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Contenu markdown */}
                <div style={{
                  fontSize: 16,
                  lineHeight: '1.375rem',
                  color: '#dbdee1',
                  wordWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                  fontFamily: "'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                }}
                  className="discord-markdown-content styled-scrollbar"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      // Headers - marges réduites pour style Discord compact
                      h1: ({ children }) => (
                        <h1 style={{
                          fontSize: 20,
                          fontWeight: 700,
                          margin: '8px 0 4px 0',
                          color: '#dbdee1',
                          lineHeight: '1.375rem'
                        }}>{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 style={{
                          fontSize: 18,
                          fontWeight: 700,
                          margin: '8px 0 4px 0',
                          color: '#dbdee1',
                          lineHeight: '1.375rem'
                        }}>{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 style={{
                          fontSize: 16,
                          fontWeight: 700,
                          margin: '0px 0 0px 0',
                          color: '#dbdee1',
                          lineHeight: '1.375rem'
                        }}>{children}</h3>
                      ),
                      // Paragraphes - marges réduites pour style Discord compact
                      p: ({ children }) => (
                        <p style={{
                          margin: 0,
                          lineHeight: '1.375rem',
                          marginBottom: '8px'
                        }}>{children}</p>
                      ),
                      // Listes - compactées pour style Discord
                      ul: ({ children }) => (
                        <ul style={{
                          margin: '2px 0 8px 0',
                          paddingLeft: '20px',
                          listStyle: 'none'
                        }}>{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol style={{
                          margin: '2px 0 8px 0',
                          paddingLeft: '20px',
                          listStyle: 'decimal',
                          color: '#b9bbbe'
                        }}>{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li style={{
                          margin: 0,
                          paddingLeft: '4px',
                          lineHeight: '1.375rem',
                          marginTop: '2px',
                          marginBottom: 0,
                          color: '#dcddde',
                          listStylePosition: 'outside'
                        }}>
                          {children}
                        </li>
                      ),
                      // Gras
                      strong: ({ children }) => (
                        <strong style={{
                          fontWeight: 700,
                          color: '#dbdee1'
                        }}>{children}</strong>
                      ),
                      // Italique
                      em: ({ children }) => (
                        <em style={{
                          fontStyle: 'italic',
                          color: '#dbdee1'
                        }}>{children}</em>
                      ),
                      // Citations (blockquote) - style Discord précis
                      blockquote: ({ children }) => (
                        <div style={{
                          borderLeft: '4px solid #4e5058',
                          margin: '8px 0',
                          color: '#b9bbbe',
                          background: 'rgba(79, 84, 92, 0.1)',
                          padding: '8px 12px',
                          borderRadius: 4,
                          lineHeight: '1.375rem',
                          paddingLeft: '16px'
                        }}>{children}</div>
                      ),
                      // Liens
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#00aff4',
                            textDecoration: 'none',
                            cursor: 'pointer'
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
                      ),
                      // Code inline vs block
                      code: ({ className, children, ...props }) => {
                        // Si className existe et commence par "language-", c'est un bloc de code
                        const isBlock = className && className.startsWith('language-');

                        if (isBlock) {
                          return (
                            <code
                              className={className}
                              style={{
                                display: 'block',
                                background: '#2b2d31',
                                padding: '12px',
                                borderRadius: 4,
                                fontFamily: 'Consolas, "Courier New", monospace',
                                fontSize: '0.9em',
                                color: '#e3e4e6',
                                overflow: 'auto',
                                margin: '8px 0'
                              }}
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        }
                        // Code inline - style Discord badge arrondi
                        return (
                          <code
                            style={{
                              background: 'rgba(114, 118, 125, 0.3)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontFamily: 'Consolas, "Courier New", monospace',
                              fontSize: '0.875em',
                              color: '#e3e4e6',
                              border: 'none',
                              fontWeight: 400
                            }}
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      // Saut de ligne - pas d'espace supplémentaire
                      br: () => <br style={{ lineHeight: '1.375rem' }} />
                    }}
                  >
                    {processedPreview}
                  </ReactMarkdown>
                </div>

                {/* Image principale affichée comme pièce jointe Discord */}
                {imagePathToDisplay && (
                  <div style={{
                    marginTop: 16,
                    borderRadius: 4,
                    overflow: 'hidden',
                    maxWidth: '400px',
                    border: '1px solid rgba(79, 84, 92, 0.3)',
                    background: '#2b2d31'
                  }}>
                    <PreviewImage imagePath={imagePathToDisplay} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
