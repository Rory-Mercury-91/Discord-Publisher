import { APP_VERSION } from '../constants';

export default function HeaderBranding() {
  return (
    <div className="app-header-branding">
      <span className="app-header-branding__emoji">🇫🇷</span>
      <div className="app-header-branding__title-wrap">
        <span className="app-header-branding__title">Générateur de publication</span>
        <span className="app-header-branding__version">v{APP_VERSION}</span>
      </div>
    </div>
  );
}
