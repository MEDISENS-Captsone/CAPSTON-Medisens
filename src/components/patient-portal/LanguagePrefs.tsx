import { Icon } from '../shared/Icon';
import { useT, PATIENT_LANGUAGES, type PatientLanguage } from '../../lib/i18n/patientPortal';

interface LanguagePrefsProps {
    language: PatientLanguage;
    onSelectLanguage: (language: PatientLanguage) => void;
    onBack: () => void;
}

/** Patient Portal language preference (Phase 9C) -- same radio-row
 * pattern as DisplayPrefs' text size choice. Changes only the Patient
 * Portal's own interface copy (via the localization dictionary in
 * lib/i18n/patientPortal.tsx) -- names, MediSens IDs, and clinical data
 * are never translated regardless of this setting. */
export function LanguagePrefs({ language, onSelectLanguage, onBack }: LanguagePrefsProps) {
    const { t } = useT();

    return (
        <div>
            <button type="button" onClick={onBack} className="portal-back-link">
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                <span>{t('more.back')}</span>
            </button>

            <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                <h2 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">{t('language.title')}</h2>
                <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{t('language.description')}</p>

                <div role="radiogroup" aria-label={t('language.title')} className="mt-3 space-y-2">
                    {PATIENT_LANGUAGES.map((option) => (
                        <label
                            key={option.value}
                            className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] px-3"
                        >
                            <span className="text-[var(--text)]">{option.label}</span>
                            <input
                                type="radio"
                                name="portal-language"
                                checked={language === option.value}
                                onChange={() => language !== option.value && onSelectLanguage(option.value)}
                                aria-label={option.label}
                            />
                        </label>
                    ))}
                </div>

                <p className="mt-4 border-t border-[var(--border-soft)] pt-4 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">
                    {t('language.note')}
                </p>
            </div>
        </div>
    );
}
