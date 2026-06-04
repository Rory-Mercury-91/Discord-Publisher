import { useCallback, useEffect, useState } from 'react';
import Toggle from '../../shared/Toggle';
import { useAuth } from '../../../state/authContext';
import { useForumChannels } from '../../../state/hooks/useForumChannels';
import { useUserPreferences } from '../../../state/hooks/useUserPreferences';
import { useWebtoonSiteLabelPicker } from '../../../state/hooks/useWebtoonSiteLabelPicker';

type CalendarTemplateSettingsProps = {
  /** Sauvegarde du salon manuel à la fermeture de la modale Configuration */
  registerFlush?: (fn: (() => Promise<void>) | null) => void;
};

/** Section 3 des préférences : vue Webtoon (gauche) + salon publication (droite, admin). */
export default function CalendarTemplateSettings({ registerFlush }: CalendarTemplateSettingsProps) {
  const { profile } = useAuth();
  const isAdmin = profile?.is_master_admin === true;
  const {
    showCalendarTemplate: calendarViewAvailable,
    setShowCalendarTemplate: setCalendarViewAvailable,
    calendarForumChannelId,
    setCalendarForumChannelId,
    loading: prefsLoading,
  } = useUserPreferences();
  const { forums, loading: forumsLoading } = useForumChannels();
  const { pickerEnabled, setPickerEnabled } = useWebtoonSiteLabelPicker();
  const [customForumId, setCustomForumId] = useState(calendarForumChannelId || '');
  const [forumSelectValue, setForumSelectValue] = useState(calendarForumChannelId || '');
  const [savingForum, setSavingForum] = useState(false);

  useEffect(() => {
    setCustomForumId(calendarForumChannelId || '');
    setForumSelectValue(calendarForumChannelId || '');
  }, [calendarForumChannelId]);

  const showManualForumInput = forums.length === 0 || !forumSelectValue.trim();

  const flushPendingForumSave = useCallback(async () => {
    if (!isAdmin || !showManualForumInput) return;
    const trimmed = customForumId.trim();
    if (trimmed === (calendarForumChannelId || '').trim()) return;
    setSavingForum(true);
    try {
      await setCalendarForumChannelId(trimmed);
      setForumSelectValue(trimmed);
    } finally {
      setSavingForum(false);
    }
  }, [
    isAdmin,
    showManualForumInput,
    customForumId,
    calendarForumChannelId,
    setCalendarForumChannelId,
  ]);

  useEffect(() => {
    if (!registerFlush) return;
    return registerFlush(isAdmin ? flushPendingForumSave : null);
  }, [registerFlush, isAdmin, flushPendingForumSave]);

  const handleForumSelectChange = async (value: string) => {
    setForumSelectValue(value);
    setSavingForum(true);
    try {
      await setCalendarForumChannelId(value);
      if (value.trim()) {
        setCustomForumId(value.trim());
      }
    } finally {
      setSavingForum(false);
    }
  };

  const forumSelectDisabled = forumsLoading || prefsLoading || savingForum;

  return (
    <section className="settings-section settings-grid--full settings-section--webtoon-prefs">
      <div className={`settings-prefs-split${isAdmin ? '' : ' settings-prefs-split--single'}`}>
        <div className="settings-prefs-split__col">
          <h4 className="settings-section__title">📅 Vue Webtoon</h4>
          <div className="form-field">
            <Toggle
              checked={calendarViewAvailable}
              onChange={v => void setCalendarViewAvailable(v)}
              label="Vue Webtoon disponible"
              disabled={prefsLoading}
              title="Autorise le toggle « Vue Webtoon » dans l’éditeur de publication pour tous les utilisateurs"
            />
            <p className="settings-log-description" style={{ marginTop: 8 }}>
              Si activé, chaque utilisateur peut basculer entre publication traduction et publication
              calendrier via le toggle dans l’en-tête du formulaire. Les changements sont enregistrés
              automatiquement.
            </p>
          </div>
          <div className="form-field" style={{ marginTop: 12 }}>
            <Toggle
              checked={pickerEnabled}
              onChange={setPickerEnabled}
              label="Suggérer les derniers sites renseignés"
              title="Affiche une liste des derniers noms de site saisis dans les champs « Site » (vue Webtoon)"
            />
            <p className="settings-log-description" style={{ marginTop: 8 }}>
              Mémorise localement les derniers libellés (Webtoon, Tapas, etc.) après chaque publication
              réussie. Bouton « Récents » et liste au focus sur les champs Site.
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="settings-prefs-split__col">
            <h4 className="settings-section__title">📅 Salon publication</h4>
            <div className="form-field">
              <label className="form-label">Salon par défaut (posts calendrier)</label>
              {forums.length > 0 ? (
                <select
                  value={forumSelectValue}
                  disabled={forumSelectDisabled}
                  onChange={e => void handleForumSelectChange(e.target.value)}
                  className="form-input settings-select-pointer"
                >
                  <option value="">— Choisir un salon —</option>
                  {forums.map(f => (
                    <option key={f.forum_channel_id} value={String(f.forum_channel_id)}>
                      {f.label || f.forum_channel_id}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="settings-log-description">
                  Liste des salons indisponible (API / clé). Saisissez l&apos;ID ci-dessous puis fermez
                  cette fenêtre pour enregistrer.
                </p>
              )}
              {savingForum && (
                <p className="settings-log-description" style={{ marginTop: 6 }}>
                  Enregistrement…
                </p>
              )}
            </div>
            {showManualForumInput && (
              <div className="form-field">
                <label className="form-label">ID salon manuel</label>
                <input
                  type="text"
                  value={customForumId}
                  onChange={e => setCustomForumId(e.target.value)}
                  placeholder="ID du channel forum Discord"
                  className="form-input"
                  disabled={savingForum}
                />
                <p className="settings-log-description" style={{ marginTop: 6 }}>
                  Enregistré automatiquement à la fermeture de la configuration.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
