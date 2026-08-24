import { Icon } from '../shared/Icon';

interface HelpSupportProps {
    onBack: () => void;
}

const FAQ: { question: string; answer: string }[] = [
    {
        question: 'How do I get access to a health record?',
        answer: 'Only the Rural Health Unit can activate a Patient Portal account or add a guardian/caregiver to a health record. Visit the RHU counter to get started.',
    },
    {
        question: 'I forgot my PIN. What do I do?',
        answer: 'Sign out and choose "Forgot PIN" on the sign-in screen if you still have your registered phone number. If not, visit the RHU in person to reset it.',
    },
    {
        question: 'Why can’t I see some information for this record?',
        answer: 'Some caregiver and guardian accounts see a more limited view of a health record, by RHU policy. This is expected and does not mean information is missing.',
    },
    {
        question: 'How do I ask for a correction to my information?',
        answer: 'Go to My Profile and choose "Request a correction." RHU staff review every request before anything on the health record changes.',
    },
];

/** Help & Support (§9.5) -- static, RHU-focused content only. No
 * ticketing, chat, or external contact channel is implied or invented
 * here; the repository has no canonical RHU phone number or street
 * address to display, so this screen intentionally does not fabricate
 * one -- it points patients to the RHU in person instead. */
export function HelpSupport({ onBack }: HelpSupportProps) {
    return (
        <div>
            <button type="button" onClick={onBack} className="portal-back-link">
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                <span>Back</span>
            </button>

            <div className="mt-4 space-y-4">
                <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                    <h2 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">Malvar Rural Health Unit</h2>
                    <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">
                        For anything the Patient Portal cannot help with -- activation, access changes, lost devices, or a PIN reset with no phone on file -- visit the RHU in person during regular clinic hours.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Common questions</h2>
                    <div className="space-y-3">
                        {FAQ.map((item) => (
                            <div key={item.question} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
                                <p className="font-semibold text-[var(--text)]">{item.question}</p>
                                <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{item.answer}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
