import { Icon } from '../shared/Icon';
import { useT } from '../../lib/i18n/patientPortal';

interface HelpSupportProps {
    onBack: () => void;
}

type FaqKey =
    | 'help.faq1.q' | 'help.faq1.a'
    | 'help.faq2.q' | 'help.faq2.a'
    | 'help.faq3.q' | 'help.faq3.a'
    | 'help.faq4.q' | 'help.faq4.a';

const FAQ_KEYS: { question: FaqKey; answer: FaqKey }[] = [
    { question: 'help.faq1.q', answer: 'help.faq1.a' },
    { question: 'help.faq2.q', answer: 'help.faq2.a' },
    { question: 'help.faq3.q', answer: 'help.faq3.a' },
    { question: 'help.faq4.q', answer: 'help.faq4.a' },
];

/** Help & Support (§9.5) -- static, RHU-focused content only. No
 * ticketing, chat, or external contact channel is implied or invented
 * here; the repository has no canonical RHU phone number or street
 * address to display, so this screen intentionally does not fabricate
 * one -- it points patients to the RHU in person instead. All copy comes
 * from the shared localization dictionary (Phase 9C). */
export function HelpSupport({ onBack }: HelpSupportProps) {
    const { t } = useT();
    return (
        <div>
            <button type="button" onClick={onBack} className="portal-back-link">
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                <span>{t('more.back')}</span>
            </button>

            <div className="mt-4 space-y-4">
                <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                    <h2 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">{t('help.rhuTitle')}</h2>
                    <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">
                        {t('help.rhuDescription')}
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('help.commonQuestions')}</h2>
                    <div className="space-y-3">
                        {FAQ_KEYS.map((item) => (
                            <div key={item.question} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
                                <p className="font-semibold text-[var(--text)]">{t(item.question)}</p>
                                <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{t(item.answer)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
