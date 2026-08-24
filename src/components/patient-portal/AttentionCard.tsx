import type { ReactNode } from 'react';
import { Icon, type IconName } from '../shared/Icon';

interface AttentionCardProps {
    icon: IconName;
    title: string;
    description?: string;
    onClick?: () => void;
    trailing?: ReactNode;
}

/** One Home "what needs my attention" card (§9.1). Stacked, one idea per
 * card, no KPI strip, no charts, no counters. `onClick` is only passed
 * when the target screen actually exists yet (Visits, in this phase) --
 * cards for sections not built until Phase 7 render as plain information. */
export function AttentionCard({ icon, title, description, onClick, trailing }: AttentionCardProps) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`portal-attention-card${onClick ? ' is-interactive' : ''}`}
        >
            <span className="portal-attention-icon">
                <Icon name={icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 text-left">
                <span className="block font-semibold text-[var(--text)]">{title}</span>
                {description && <span className="mt-0.5 block text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{description}</span>}
            </span>
            {trailing ?? (onClick && <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />)}
        </Tag>
    );
}
