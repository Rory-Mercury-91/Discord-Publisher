// Vue plein écran : formulaire liste.
// Pour Google : flux 1ère utilisation (Étape 1 connexion, Étape 2 iframe) ; 2e utilisation = iframe par défaut.
import { useState } from 'react';
import { useApp } from '../state/appContext';
import { tauriAPI } from '../lib/tauri-api';

const LISTFORM_GOOGLE_KEY = 'listform_google_connected_once';

const isTauri = typeof window !== 'undefined' && !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;

const isGoogleUrl = (u: string) => {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host.includes('google.com') || host.includes('script.google') || host.includes('docs.google') || host.includes('forms.google');
  } catch {
    return false;
  }
};

function getInitialTryIframeGoogle(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LISTFORM_GOOGLE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function ListFormView() {
  const { listFormUrl } = useApp();
  const url = (listFormUrl ?? '').trim();
  const [tryIframeForGoogle, setTryIframeForGoogle] = useState(getInitialTryIframeGoogle);
  const [helpBarExpanded, setHelpBarExpanded] = useState(true);
  const openInBrowser = () => {
    if (url) tauriAPI.openUrl(url);
  };
  const openInAppWindow = async () => {
    if (!url || !isTauri) return;
    const res = await tauriAPI.openListFormInAppWindow(url);
    if (!res.ok) {
      tauriAPI.openUrl(url);
    }
  };
  const openConnectWindow = () => {
    openInAppWindow();
  };
  const showIframeAndMarkConnected = () => {
    try {
      localStorage.setItem(LISTFORM_GOOGLE_KEY, 'true');
    } catch {}
    setTryIframeForGoogle(true);
  };

  return (
    <main
      style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        boxSizing: 'border-box',
      }}
    >
      {url ? (
        <>
          {/* Barre : connexion Google, affichage iframe, fenêtre de l'app, navigateur */}
          <div
            style={{
              flexShrink: 0,
              padding: '12px 16px',
              background: isGoogleUrl(url) ? 'rgba(251, 191, 36, 0.12)' : 'var(--bg-elevated)',
              borderBottom: `1px solid ${isGoogleUrl(url) ? 'rgba(251, 191, 36, 0.3)' : 'var(--border)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              {(helpBarExpanded || !(isGoogleUrl(url) && tryIframeForGoogle)) && (
                <span style={{ fontSize: 13, color: 'var(--text)' }}>
                  {isGoogleUrl(url)
                    ? (tryIframeForGoogle
                      ? "Si vous voyez une erreur 403, cliquez sur « Connectez-vous (si nécessaire) » ou « Ouvrir dans une fenêtre de l'app » pour ouvrir la page de connexion Google."
                      : "Étape 1 : connectez-vous dans une fenêtre, puis Étape 2 : affichez le formulaire dans la page. Vous pouvez aussi ouvrir dans une fenêtre ou le navigateur.")
                    : "Si la page ne s'affiche pas correctement, ouvrez le formulaire dans votre navigateur."}
                </span>
              )}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {isGoogleUrl(url) && tryIframeForGoogle && isTauri && (
                <button
                  type="button"
                  onClick={openConnectWindow}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🔐 Connectez-vous (si nécessaire)
                </button>
              )}
              {isGoogleUrl(url) && (
                <button
                  type="button"
                  onClick={() => setTryIframeForGoogle((v) => !v)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: tryIframeForGoogle ? 'var(--bg-elevated)' : 'transparent',
                    color: 'var(--text)',
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tryIframeForGoogle ? "↩ Masquer l'iframe" : "📄 Afficher dans la page (iframe)"}
                </button>
              )}
              {isTauri && (
                <button
                  type="button"
                  onClick={openInAppWindow}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📋 Ouvrir dans une fenêtre de l'app
                </button>
              )}
              <button
                type="button"
                onClick={openInBrowser}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--accent)',
                  background: 'rgba(74, 158, 255, 0.15)',
                  color: 'var(--accent)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                🔗 Ouvrir dans le navigateur
              </button>
            </div>
            </div>
            {isGoogleUrl(url) && tryIframeForGoogle && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setHelpBarExpanded((v) => !v)}
                  style={{
                    padding: '2px 12px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                  title={helpBarExpanded ? 'Réduire l\'aide' : 'Afficher l\'aide'}
                >
                  {helpBarExpanded ? '▼' : '▲'}
                </button>
              </div>
            )}
          </div>
          {isGoogleUrl(url) && !tryIframeForGoogle ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 32,
                padding: 32,
                color: 'var(--text)',
                textAlign: 'center',
                maxWidth: 480,
                margin: '0 auto',
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                Première utilisation (formulaire Google)
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', textAlign: 'left' }}>
                <section style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600 }}>Étape 1 — Connectez-vous !</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
                    Ouvrez la page de connexion Google dans une fenêtre de l'app pour vous connecter et récupérer les cookies. Une fois connecté, revenez ici et passez à l'étape 2.
                  </p>
                  {isTauri && (
                    <button
                      type="button"
                      onClick={openConnectWindow}
                      style={{
                        marginTop: 12,
                        padding: '10px 18px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--accent)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      Ouvrir la page de connexion Google
                    </button>
                  )}
                  {!isTauri && (
                    <button
                      type="button"
                      onClick={openInBrowser}
                      style={{
                        marginTop: 12,
                        padding: '10px 18px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--accent)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      Ouvrir dans le navigateur (connexion)
                    </button>
                  )}
                </section>
                <section style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600 }}>Étape 2 — Ouvrir le formulaire en iframe</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
                    Une fois connecté, affichez le formulaire dans cette page. Vous pourrez aussi utiliser la barre ci-dessus pour l'ouvrir dans une fenêtre ou dans le navigateur.
                  </p>
                  <button
                    type="button"
                    onClick={showIframeAndMarkConnected}
                    style={{
                      marginTop: 12,
                      padding: '10px 18px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Afficher le formulaire dans la page
                  </button>
                </section>
              </div>
            </div>
          ) : (
            <iframe
              title="Formulaire liste"
              src={url}
              style={{
                flex: 1,
                width: '100%',
                minHeight: 0,
                border: 'none',
                background: '#fff',
              }}
            />
          )}
        </>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 16,
            padding: 24,
            color: 'var(--muted)',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 48 }}>📋</span>
          <p style={{ margin: 0, fontSize: 16, maxWidth: 400 }}>
            Aucune URL de formulaire renseignée. Demandez à l&apos;administrateur de la configurer dans <strong>Configuration → Administration</strong>, section « Configuration globale ».
          </p>
        </div>
      )}
    </main>
  );
}
