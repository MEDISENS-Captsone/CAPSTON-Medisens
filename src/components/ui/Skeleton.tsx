import type { CSSProperties } from 'react';
import { cn } from './utils';

interface SkeletonProps {
    className?: string;
}

interface SkeletonTextProps extends SkeletonProps {
    lines?: number;
}

interface SkeletonTableProps extends SkeletonProps {
    rows?: number;
    columns?: number;
}

interface SkeletonKpiGridProps extends SkeletonProps {
    count?: number;
}

export function Skeleton({ className = '' }: SkeletonProps) {
    return <span className={cn('clinical-skeleton', className)} aria-hidden="true" />;
}

export function SkeletonText({ lines = 2, className = '' }: SkeletonTextProps) {
    return (
        <div className={cn('clinical-skeleton-stack', className)} aria-hidden="true">
            {Array.from({ length: lines }).map((_, index) => (
                <Skeleton key={index} className={index === lines - 1 ? 'clinical-skeleton-line is-short' : 'clinical-skeleton-line'} />
            ))}
        </div>
    );
}

export function SkeletonKpiGrid({ count = 4, className = '' }: SkeletonKpiGridProps) {
    return (
        <div className={cn('doctor-kpi-grid', className)} aria-hidden="true">
            {Array.from({ length: count }).map((_, index) => (
                <div className="ops-summary-card" key={index}>
                    <Skeleton className="clinical-skeleton-line w-24" />
                    <Skeleton className="clinical-skeleton-value mt-3 w-16" />
                    <Skeleton className="clinical-skeleton-line mt-3 w-32" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonTable({ rows = 5, columns = 4, className = '' }: SkeletonTableProps) {
    return (
        <div
            className={cn('clinical-skeleton-table', className)}
            style={{ '--skeleton-columns': columns } as CSSProperties}
            aria-hidden="true"
        >
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div className="clinical-skeleton-table-row" key={rowIndex}>
                    {Array.from({ length: columns }).map((__, columnIndex) => (
                        <Skeleton
                            key={columnIndex}
                            className={cn(
                                'clinical-skeleton-line',
                                columnIndex === 0 ? 'is-wide' : '',
                                columnIndex === columns - 1 ? 'is-action' : ''
                            )}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function SkeletonList({ rows = 4, className = '' }: { rows?: number; className?: string }) {
    return (
        <div className={cn('clinical-skeleton-list', className)} aria-hidden="true">
            {Array.from({ length: rows }).map((_, index) => (
                <div className="clinical-skeleton-list-row" key={index}>
                    <Skeleton className="clinical-skeleton-avatar" />
                    <div className="min-w-0 flex-1">
                        <Skeleton className="clinical-skeleton-line w-36" />
                        <Skeleton className="clinical-skeleton-line mt-2 w-24" />
                    </div>
                    <Skeleton className="clinical-skeleton-line is-action" />
                </div>
            ))}
        </div>
    );
}
