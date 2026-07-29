import { Icon } from '../shared/Icon';

interface BreadcrumbItem {
    label: string;
    current?: boolean;
}

interface BreadcrumbsProps {
    items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
    if (items.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" className="hidden sm:block">
            <ol className="flex min-w-0 items-center gap-1 text-[length:var(--type-caption-size)] font-medium leading-[var(--type-caption-line)] text-[var(--text-secondary)]">
                {items.map((item, index) => (
                    <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
                        {index > 0 && <Icon name="chevron-right" className="h-3.5 w-3.5 shrink-0 text-[var(--border-strong)]" />}
                        <span className={item.current ? 'truncate text-[var(--text)]' : 'truncate'} aria-current={item.current ? 'page' : undefined}>
                            {item.label}
                        </span>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
