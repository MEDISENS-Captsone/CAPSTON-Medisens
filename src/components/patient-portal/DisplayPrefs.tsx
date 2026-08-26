import { Icon } from '../shared/Icon';
import { useT } from '../../lib/i18n/patientPortal';

interface DisplayPrefsProps {
    textSize: 'comfortable' | 'large';
    onToggleTextSize: () => void;
    highContrast: boolean;
    onToggleHighContrast: () => void;
    onBack: () => void;
}

/** Text size & display (§9.5) -- "Comfortable" and "Larger Text", never
 * "Senior Mode". Both options change only the portal's own type tokens
 * ([data-portal] in patient-portal.css) -- staff styling is untouched. */
export function DisplayPrefs({ textSize, onToggleTextSize, highContrast, onToggleHighContrast, onBack }: DisplayPrefsProps) {
    const { t } = useT();
    return (
        <div>
            <button type="button" onClick={onBack} className="portal-back-link">
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                <span>{t('more.back')}</span>
            </button>

            <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                <h2 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">{t('display.title')}</h2>

                <div role="radiogroup" aria-label={t('display.title')} className="mt-3 space-y-2">
                    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] px-3">
                        <span className="text-[var(--text)]">{t('display.comfortable')}</span>
                        <input
                            type="radio"
                            name="portal-text-size"
                            checked={textSize === 'comfortable'}
                            onChange={() => textSize !== 'comfortable' && onToggleTextSize()}
                            aria-label={t('display.comfortable')}
                        />
                    </label>
                    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] px-3">
                        <span className="text-[var(--text)]">{t('display.larger')}</span>
                        <input
                            type="radio"
                            name="portal-text-size"
                            checked={textSize === 'large'}
                            onChange={() => textSize !== 'large' && onToggleTextSize()}
                            aria-label={t('display.larger')}
                        />
                    </label>
                </div>

                <label className="mt-4 flex min-h-[44px] items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-4">
                    <span className="text-[var(--text)]">{t('display.higherContrast')}</span>
                    <input
                        type="checkbox"
                        checked={highContrast}
                        onChange={onToggleHighContrast}
                        className="h-6 w-11 shrink-0 cursor-pointer accent-[var(--brand-active)]"
                        aria-label={t('display.higherContrast')}
                    />
                </label>
            </div>
        </div>
    );
}
