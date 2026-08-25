interface PatientMotionErrorProps {
    message: string | null;
    className?: string;
}

/** Mount-only entrance; removal uses natural layout reflow with no height animation. */
export function PatientMotionError({ message, className = '' }: PatientMotionErrorProps) {
    if (!message) return null;

    return (
        <div className={`patient-motion-error ${className}`.trim()}>
            <p
                role="alert"
                className="rounded-[var(--radius-control)] border border-[var(--coral-border)] bg-[var(--coral-tint)] px-3 py-2 text-[length:var(--type-supporting-size)] text-[var(--coral)]"
            >
                {message}
            </p>
        </div>
    );
}
