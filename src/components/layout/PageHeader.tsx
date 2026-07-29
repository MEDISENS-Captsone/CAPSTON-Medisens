import type { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    meta?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, meta }: PageHeaderProps) {
    return (
        <section className="flex flex-col gap-3 border-b border-[var(--border)] bg-white px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5 xl:px-6">
            <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="truncate text-[length:var(--type-page-title-size)] font-bold leading-[var(--type-page-title-line)] tracking-[var(--tracking-normal)] text-[var(--text)]">{title}</h2>
                    {meta}
                </div>
                {subtitle && <p className="mt-1 text-[length:var(--type-supporting-size)] font-normal leading-[var(--type-supporting-line)] text-[var(--text-secondary)]">{subtitle}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </section>
    );
}
