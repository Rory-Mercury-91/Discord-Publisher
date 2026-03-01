import { tauriAPI } from '../../../lib/tauri-api';
import { trackTranslationClick } from '../../../lib/api-helpers';
import type { GameF95 } from '../library-types';
import { SYNC_META, typeMajStyle, formatDateFr, getStatutData, getTradTypeData, getTypeMajData } from '../library-constants';

interface GameRowProps {
  game: GameF95;
  post: any;
  onEdit: (p: any) => void;
  onOpenDetail?: () => void;
}

export default function GameRow({ game, post, onEdit, onOpenDetail }: GameRowProps) {
  const sync = SYNC_META[game._sync!];
  const tmStyle = typeMajStyle(game.type_maj);

  return (
    <tr
      className={`library-table-row ${onOpenDetail ? 'library-table-row--clickable' : ''}`}
      role={onOpenDetail ? 'button' : undefined}
      tabIndex={onOpenDetail ? 0 : undefined}
      onClick={onOpenDetail ?? undefined}
      onKeyDown={onOpenDetail ? (e) => e.key === 'Enter' && onOpenDetail() : undefined}
    >
      <td className="library-table-td library-table-td--title">
        <div className="library-table-cell-title library-table-cell-title--with-type">{game.nom_du_jeu}</div>
        {game.type && <div className="library-version-muted">{game.type}</div>}
      </td>
      <td className="library-table-td library-table-td--version"><code>{game.version || '—'}</code></td>
      <td className={`library-table-td library-table-td--trad-${game._sync ?? 'unknown'}`}><code>{game.trad_ver || '—'}</code></td>
      <td className="library-table-td library-table-td--center">
        <span className="library-table-badge" data-sync={game._sync ?? undefined}>{sync.label}</span>
      </td>
      <td className="library-table-td library-table-td--center">
        <span className="library-table-badge" data-statut={getStatutData(game.statut || '')}>{game.statut || '—'}</span>
      </td>
      <td className={`library-table-td library-table-td--trad-type-${getTradTypeData(game.type_de_traduction || '')}`}>{game.type_de_traduction || '—'}</td>
      <td className="library-table-td library-table-td--traducteur">{game.traducteur || '—'}</td>
      <td className="library-table-td library-table-td--date library-version-muted">{formatDateFr(game.date_maj) || '—'}</td>
      <td className="library-table-td library-table-td--center">
        {game.type_maj ? (
          <span className="library-table-badge" data-type-maj={getTypeMajData(game.type_maj)}>{tmStyle.icon} {game.type_maj}</span>
        ) : '—'}
      </td>
      <td className="library-table-td library-table-td--center" onClick={(e) => e.stopPropagation()}>
        <div className="library-row-actions">
          {game.nom_url && (
            <button type="button" className="library-row-btn" onClick={() => tauriAPI.openUrl(game.nom_url)} title="Ouvrir la page du jeu">🔗</button>
          )}
          {game.lien_trad && (
            <button
              type="button"
              className="library-row-btn library-row-btn--trad library-row-btn-emoji"
              onClick={async () => {
                if (game.nom_url) {
                  await trackTranslationClick({ f95Url: game.nom_url, translationUrl: game.lien_trad, source: 'library_list' });
                }
                tauriAPI.openUrl(game.lien_trad);
              }}
              title="Ouvrir la page de traduction"
            >
              🇫🇷
            </button>
          )}
          {post ? (
            <button type="button" className="library-row-btn library-row-btn--edit" onClick={() => onEdit(post)} title="Modifier le post Discord">✏️</button>
          ) : (
            <span title="Aucun post Discord publié pour ce jeu" className="library-row-btn library-row-btn--empty">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
