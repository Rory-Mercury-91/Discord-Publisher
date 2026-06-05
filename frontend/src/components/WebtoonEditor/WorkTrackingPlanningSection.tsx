import type { ReactNode } from 'react';
import type { ProgressUnit, WorkStatus } from '../../state/workTracking/types';
import { PROGRESS_UNIT_OPTIONS } from '../../state/workTracking/registry';
import DateInputWithDayOffset from '../shared/DateInputWithDayOffset';
import Toggle from '../shared/Toggle';
import ReleaseWeekdaysPicker from './ReleaseWeekdaysPicker';

type Props = {
  workStatus: WorkStatus;
  progressUnit: ProgressUnit;
  inputs: Record<string, string>;
  setInput: (name: string, value: string) => void;
  onChapitreActuelChange: (value: string) => void;
};

function PlanCell({
  label,
  htmlFor,
  variant = 'default',
  children,
}: {
  label: string;
  htmlFor?: string;
  variant?: 'days' | 'ch' | 'ch-wide' | 'date' | 'date-wide' | 'toggle' | 'default';
  children: ReactNode;
}) {
  return (
    <div className={`webtoon-editor__plan-cell webtoon-editor__plan-cell--${variant}`}>
      <label className="form-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

type PlanRowLayout =
  | 'schedule-top'
  | 'schedule-ongoing'
  | 'schedule-paid'
  | 'pause'
  | 'final';

function PlanRow({
  visible,
  layout,
  children,
}: {
  visible: boolean;
  layout: PlanRowLayout;
  children: ReactNode;
}) {
  if (!visible) return null;
  return (
    <div className={`webtoon-editor__plan-row webtoon-editor__plan-row--${layout}`}>{children}</div>
  );
}

function unitMeta(progressUnit: ProgressUnit) {
  const normalized = progressUnit === 'hybrid' ? 'chapter' : progressUnit;
  return PROGRESS_UNIT_OPTIONS.find(o => o.value === normalized) ?? PROGRESS_UNIT_OPTIONS[0];
}

export default function WorkTrackingPlanningSection({
  workStatus,
  progressUnit,
  inputs,
  setInput,
  onChapitreActuelChange,
}: Props) {
  const isOngoing = workStatus === 'ongoing';
  const isPaid = workStatus === 'ongoing_paid';
  const isSchedule = isOngoing || isPaid;
  const isFinal = workStatus === 'completed' || workStatus === 'abandoned';
  const isPause = workStatus === 'season_pause';

  const unit = unitMeta(progressUnit);
  const unitLower = unit.singular.toLowerCase();
  const monthlyEnabled = inputs.Release_Monthly === 'true';
  const shortInputClass = 'form-input webtoon-editor__plan-cell-input';

  const blockTitle = isFinal
    ? 'Fin de série'
    : isPause
      ? 'Pause de saison'
      : 'Calendrier';

  return (
    <div className="webtoon-editor__planning">
      <div className="webtoon-editor__planning-block">
        <span className="webtoon-editor__planning-block-title">{blockTitle}</span>

        <div className="webtoon-editor__plan-compact">
          <PlanRow visible={isSchedule} layout="schedule-top">
            <div className="webtoon-editor__plan-cell webtoon-editor__plan-cell--days-line">
              <span className="form-label">Jours de sortie</span>
              <div className="webtoon-editor__days-monthly-row">
                <ReleaseWeekdaysPicker
                  value={inputs.Release_Weekdays || ''}
                  onChange={v => setInput('Release_Weekdays', v)}
                />
                <span className="webtoon-editor__days-monthly-sep" aria-hidden />
                <div className="webtoon-editor__monthly-pill">
                  <span className="webtoon-editor__monthly-pill-label">Mensuel</span>
                  <Toggle
                    size="sm"
                    label="Mensuel"
                    checked={monthlyEnabled}
                    onChange={checked =>
                      setInput('Release_Monthly', checked ? 'true' : 'false')
                    }
                    className="webtoon-editor__plan-monthly-toggle"
                  />
                </div>
              </div>
            </div>
          </PlanRow>

          <PlanRow visible={isOngoing} layout="schedule-ongoing">
            <PlanCell label="Chapitre actuel" htmlFor="webtoon-ch-actuel-ongoing" variant="ch">
              <input
                id="webtoon-ch-actuel-ongoing"
                value={inputs.Progress_Current || inputs.Chapitre_Actuel || ''}
                onChange={e => {
                  setInput('Progress_Current', e.target.value);
                  onChapitreActuelChange(e.target.value);
                }}
                className={shortInputClass}
                placeholder="52"
                inputMode="numeric"
              />
            </PlanCell>
            <PlanCell label={`Prochain ${unitLower}`} htmlFor="webtoon-ch-suivant-ongoing" variant="ch">
              <input
                id="webtoon-ch-suivant-ongoing"
                value={inputs.Chapitre_Suivant || ''}
                onChange={e => setInput('Chapitre_Suivant', e.target.value)}
                className={shortInputClass}
                placeholder="+1"
                inputMode="numeric"
              />
            </PlanCell>
            <PlanCell label="Date prochaine sortie" htmlFor="webtoon-date-suivant-ongoing" variant="date">
              <DateInputWithDayOffset
                layout="planning"
                id="webtoon-date-suivant-ongoing"
                label=""
                value={inputs.Date_Suivant || ''}
                onChange={v => setInput('Date_Suivant', v)}
              />
            </PlanCell>
            <PlanCell label="Total connu (opt.)" htmlFor="webtoon-prog-total-ongoing" variant="ch">
              <input
                id="webtoon-prog-total-ongoing"
                value={inputs.Progress_Total || ''}
                onChange={e => setInput('Progress_Total', e.target.value)}
                className={shortInputClass}
                placeholder="120"
                inputMode="numeric"
              />
            </PlanCell>
          </PlanRow>

          <PlanRow visible={isPaid} layout="schedule-paid">
            <PlanCell label="Chapitre actuel" htmlFor="webtoon-ch-actuel-paid" variant="ch">
              <input
                id="webtoon-ch-actuel-paid"
                value={inputs.Progress_Current || inputs.Chapitre_Actuel || ''}
                onChange={e => {
                  setInput('Progress_Current', e.target.value);
                  onChapitreActuelChange(e.target.value);
                }}
                className={shortInputClass}
                placeholder="78"
                inputMode="numeric"
              />
            </PlanCell>
            <PlanCell label="Prochain chapitre" htmlFor="webtoon-ch-suivant-paid" variant="ch">
              <input
                id="webtoon-ch-suivant-paid"
                value={inputs.Chapitre_Suivant || ''}
                onChange={e => setInput('Chapitre_Suivant', e.target.value)}
                className={shortInputClass}
                placeholder="+1"
                inputMode="numeric"
              />
            </PlanCell>
            <PlanCell label="Date prochaine sortie" htmlFor="webtoon-date-suivant-paid" variant="date">
              <DateInputWithDayOffset
                layout="planning"
                id="webtoon-date-suivant-paid"
                label=""
                value={inputs.Date_Suivant || ''}
                onChange={v => setInput('Date_Suivant', v)}
              />
            </PlanCell>
            <PlanCell
              label="Fin de publication (opt.)"
              htmlFor="webtoon-fin-publication"
              variant="ch-wide"
            >
              <input
                id="webtoon-fin-publication"
                value={inputs.Progress_Total || ''}
                onChange={e => setInput('Progress_Total', e.target.value)}
                className={shortInputClass}
                placeholder="95"
                inputMode="numeric"
              />
            </PlanCell>
            <PlanCell
              label="Date de fin de publication (opt.)"
              htmlFor="webtoon-date-fin-publication"
              variant="date-wide"
            >
              <DateInputWithDayOffset
                layout="planning"
                id="webtoon-date-fin-publication"
                label=""
                value={inputs.Date_Fin || ''}
                onChange={v => setInput('Date_Fin', v)}
              />
            </PlanCell>
          </PlanRow>

          <PlanRow visible={isPause} layout="pause">
            <PlanCell label={`Dernier ${unitLower}`} htmlFor="webtoon-ch-pause" variant="ch">
              <input
                id="webtoon-ch-pause"
                value={inputs.Progress_Current || inputs.Chapitre_Actuel || ''}
                onChange={e => {
                  setInput('Progress_Current', e.target.value);
                  onChapitreActuelChange(e.target.value);
                }}
                className={shortInputClass}
                inputMode="numeric"
              />
            </PlanCell>
            <PlanCell label="Saison" htmlFor="webtoon-season" variant="ch">
              <input
                id="webtoon-season"
                value={inputs.Season_Number || ''}
                onChange={e => setInput('Season_Number', e.target.value)}
                className={shortInputClass}
                placeholder="2"
                inputMode="numeric"
              />
            </PlanCell>
            <PlanCell label="Date fin de saison (opt.)" htmlFor="webtoon-date-pause" variant="date">
              <DateInputWithDayOffset
                layout="planning"
                id="webtoon-date-pause"
                label=""
                value={inputs.Date_Pause_Fin || ''}
                onChange={v => setInput('Date_Pause_Fin', v)}
              />
            </PlanCell>
          </PlanRow>

          <PlanRow visible={isFinal} layout="final">
            <PlanCell label={`Dernier ${unitLower}`} htmlFor="webtoon-ch-fin" variant="ch">
              <input
                id="webtoon-ch-fin"
                value={inputs.Chapitre_Fin || ''}
                onChange={e => setInput('Chapitre_Fin', e.target.value)}
                className={shortInputClass}
                placeholder="120"
                inputMode="numeric"
              />
            </PlanCell>
            <PlanCell label="Date fin (opt.)" htmlFor="webtoon-date-fin" variant="date">
              <DateInputWithDayOffset
                layout="planning"
                id="webtoon-date-fin"
                label=""
                value={inputs.Date_Fin || ''}
                onChange={v => setInput('Date_Fin', v)}
              />
            </PlanCell>
          </PlanRow>
        </div>
      </div>
    </div>
  );
}
