import { useState } from 'react';
import { tauriAPI } from '../../lib/tauri-api';
import { useApp } from '../../state/appContext';
import {
  getInitialTryIframeGoogle,
  isGoogleUrl,
  LISTFORM_GOOGLE_KEY,
} from './constants';
import ListFormActionBar from './components/ListFormActionBar';
import ListFormGoogleSteps from './components/ListFormGoogleSteps';
import ListFormIframe from './components/ListFormIframe';
import ListFormPlaceholder from './components/ListFormPlaceholder';

export default function ListFormView() {
  const { listFormUrl } = useApp();
  const url = (listFormUrl ?? '').trim();
  const [tryIframeForGoogle, setTryIframeForGoogle] = useState(
    getInitialTryIframeGoogle
  );
  const [barExpanded, setBarExpanded] = useState(true);

  const openInBrowser = () => {
    if (url) tauriAPI.openUrl(url);
  };

  const openInAppWindow = async () => {
    if (!url) return;
    const res = await tauriAPI.openListFormInAppWindow(url);
    if (!res.ok) tauriAPI.openUrl(url);
  };

  const showIframeAndMarkConnected = () => {
    try {
      localStorage.setItem(LISTFORM_GOOGLE_KEY, 'true');
    } catch {
      // ignore
    }
    setTryIframeForGoogle(true);
  };

  const isGoogle = isGoogleUrl(url);

  if (!url) {
    return (
      <main className="list-form-view">
        <ListFormPlaceholder />
      </main>
    );
  }

  return (
    <main className="list-form-view">
      {barExpanded ? (
        <ListFormActionBar
          onCollapse={() => setBarExpanded(false)}
          isGoogle={isGoogle}
          tryIframeForGoogle={tryIframeForGoogle}
          onConnectWindow={openInAppWindow}
          onToggleIframe={() => setTryIframeForGoogle((v) => !v)}
          onOpenInAppWindow={openInAppWindow}
          onOpenInBrowser={openInBrowser}
        />
      ) : (
        <button
          type="button"
          className="list-form-bar-reopen"
          onClick={() => setBarExpanded(true)}
          title="Afficher la barre d'outils"
        >
          ▲ Afficher la barre d'outils
        </button>
      )}
      {isGoogle && !tryIframeForGoogle ? (
        <ListFormGoogleSteps
          onOpenConnectWindow={openInAppWindow}
          onOpenInBrowser={openInBrowser}
          onShowIframe={showIframeAndMarkConnected}
        />
      ) : (
        <ListFormIframe src={url} />
      )}
    </main>
  );
}
