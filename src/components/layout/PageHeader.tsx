import type { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    meta?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, meta }: PageHeaderProps) {
    return (
        <section className="app-page-header border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5 lg:px-6">
            <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h2 className="truncate text-[length:var(--type-page-title-size)] font-bold leading-[var(--type-page-title-line)] tracking-[var(--tracking-normal)] text-[var(--text)]">{title}</h2>
                        {meta}
                    </div>
                    {subtitle && <p className="mt-1.5 max-w-3xl text-[length:var(--type-supporting-size)] font-normal leading-[var(--type-supporting-line)] text-[var(--text-secondary)]">{subtitle}</p>}
                </div>
                {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </section>
    );
}
