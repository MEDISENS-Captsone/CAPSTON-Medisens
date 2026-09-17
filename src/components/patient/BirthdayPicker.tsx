import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../shared/Icon';
import { Button } from '../ui/Button';
import { useDialogFocus } from '../ui/useDialogFocus';

interface BirthdayPickerProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    className: string;
    hasError?: boolean;
    required?: boolean;
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const pad = (value: number) => String(value).padStart(2, '0');
const toIsoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

function parseIsoDate(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatBirthday(value: string) {
    const parsed = parseIsoDate(value);
    return parsed ? `${pad(parsed.month)}/${pad(parsed.day)}/${parsed.year}` : '';
}

function daysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate();
}

export function BirthdayPicker({ id, value, onChange, className, hasError = false, required = false }: BirthdayPickerProps) {
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const today = parseIsoDate(todayIso)!;
    const selected = parseIsoDate(value);
    const [isOpen, setIsOpen] = useState(false);
    const [isTouch, setIsTouch] = useState(false);
    const [draftYear, setDraftYear] = useState(selected?.year ?? today.year);
    const [draftMonth, setDraftMonth] = useState(selected?.month ?? today.month);
    const [draftDay, setDraftDay] = useState<number | null>(selected?.day ?? null);
    const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const monthRef = useRef<HTMLSelectElement>(null);

    const close = useCallback(() => setIsOpen(false), []);
    useDialogFocus({ isOpen, dialogRef, initialFocusRef: monthRef, onClose: close });

    useEffect(() => {
        const media = window.matchMedia('(max-width: 767px), (pointer: coarse)');
        const update = () => setIsTouch(media.matches);
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);

    useEffect(() => {
        if (!isOpen || isTouch) return;
        const position = () => {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const width = Math.min(352, window.innerWidth - 16);
            const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
            const below = rect.bottom + 8;
            const estimatedHeight = 430;
            const top = below + estimatedHeight <= window.innerHeight ? below : Math.max(8, rect.top - estimatedHeight - 8);
            setPopoverStyle({ width, left, top });
        };
        position();
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        return () => {
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
        };
    }, [isOpen, isTouch]);

    const years = useMemo(() => Array.from({ length: today.year - 1899 }, (_, index) => today.year - index), [today.year]);
    const availableDays = daysInMonth(draftYear, draftMonth);
    const firstWeekday = new Date(draftYear, draftMonth - 1, 1).getDay();
    const selectedIso = draftDay ? toIsoDate(draftYear, draftMonth, draftDay) : '';

    const open = () => {
        const current = parseIsoDate(value);
        setDraftYear(current?.year ?? today.year);
        setDraftMonth(current?.month ?? today.month);
        setDraftDay(current?.day ?? null);
        setIsOpen(true);
    };

    const updateMonth = (month: number) => {
        setDraftMonth(month);
        setDraftDay(day => day === null ? null : Math.min(day, daysInMonth(draftYear, month)));
    };

    const updateYear = (year: number) => {
        setDraftYear(year);
        setDraftDay(day => day === null ? null : Math.min(day, daysInMonth(year, draftMonth)));
    };

    const selectDesktopDay = (day: number) => {
        const next = toIsoDate(draftYear, draftMonth, day);
        if (next > todayIso) return;
        onChange(next);
        close();
    };

    const applyTouchDate = () => {
        if (!draftDay || !selectedIso || selectedIso > todayIso) return;
        onChange(selectedIso);
        close();
    };

    const selectorClasses = 'min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]';

    const picker = isOpen ? createPortal(
        <>
            <button type="button" aria-label="Close birthday picker" className={`fixed inset-0 z-[9998] ${isTouch ? 'bg-slate-950/40' : 'bg-transparent'}`} onClick={close} />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal={isTouch ? 'true' : undefined}
                aria-labelledby={`${id}-picker-title`}
                tabIndex={-1}
                style={isTouch ? undefined : popoverStyle}
                className={isTouch
                    ? 'clinical-dialog fixed inset-x-2 bottom-2 z-[9999] mx-auto max-h-[calc(100dvh-1rem)] max-w-lg overflow-y-auto rounded-[var(--radius-card)] bg-[var(--surface)] shadow-2xl'
                    : 'clinical-dialog fixed z-[9999] overflow-y-auto rounded-[var(--radius-card)] bg-[var(--surface)] shadow-xl'}
            >
                <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-4 sm:px-5">
                    <div><h2 id={`${id}-picker-title`} className="font-semibold text-[var(--text)]">Select birthday</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Choose the month, year, and day.</p></div>
                    <button type="button" onClick={close} aria-label="Close birthday picker" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-color)]"><Icon name="x" className="h-5 w-5" /></button>
                </div>

                <div className="p-4 sm:p-5">
                    {isTouch ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <label className="grid gap-1.5 text-sm font-semibold text-[var(--text)]">Month<select ref={monthRef} value={draftMonth} onChange={event => updateMonth(Number(event.target.value))} className={selectorClasses}>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
                            <label className="grid gap-1.5 text-sm font-semibold text-[var(--text)]">Day<select value={draftDay ?? ''} onChange={event => setDraftDay(event.target.value ? Number(event.target.value) : null)} className={selectorClasses}><option value="">Select day</option>{Array.from({ length: availableDays }, (_, index) => index + 1).map(day => <option key={day} value={day} disabled={toIsoDate(draftYear, draftMonth, day) > todayIso}>{day}</option>)}</select></label>
                            <label className="grid gap-1.5 text-sm font-semibold text-[var(--text)]">Year<select value={draftYear} onChange={event => updateYear(Number(event.target.value))} className={selectorClasses}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">Month<select ref={monthRef} value={draftMonth} onChange={event => updateMonth(Number(event.target.value))} className={selectorClasses}>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
                                <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">Year<select value={draftYear} onChange={event => updateYear(Number(event.target.value))} className={selectorClasses}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
                            </div>
                            <div className="mt-4 grid grid-cols-7 gap-1 text-center" aria-label={`${MONTHS[draftMonth - 1]} ${draftYear}`}>
                                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day} className="py-1 text-xs font-semibold text-[var(--text-secondary)]" aria-hidden="true">{day}</span>)}
                                {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
                                {Array.from({ length: availableDays }, (_, index) => index + 1).map(day => {
                                    const iso = toIsoDate(draftYear, draftMonth, day);
                                    const disabled = iso > todayIso;
                                    const active = iso === value;
                                    return <button key={day} type="button" disabled={disabled} aria-label={`${MONTHS[draftMonth - 1]} ${day}, ${draftYear}`} aria-pressed={active} onClick={() => selectDesktopDay(day)} className={`min-h-10 rounded-[var(--radius-control)] text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-color)] ${active ? 'bg-[var(--brand-active)] text-white' : 'text-[var(--text)] hover:bg-[var(--brand-soft-surface)]'} disabled:cursor-not-allowed disabled:text-[var(--disabled-text)] disabled:hover:bg-transparent`}>{day}</button>;
                                })}
                            </div>
                        </>
                    )}
                </div>

                {isTouch && <div className="flex justify-end gap-3 border-t border-[var(--border)] px-4 py-4 sm:px-5"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={applyTouchDate} disabled={!draftDay || selectedIso > todayIso}>Apply birthday</Button></div>}
            </div>
        </>,
        document.body,
    ) : null;

    return (
        <>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-required={required || undefined}
                aria-invalid={hasError || undefined}
                onClick={open}
                className={`${className} flex items-center justify-between gap-3 text-left`}
            >
                <span className={value ? 'text-[var(--text)]' : 'text-[var(--text-3)]'}>{formatBirthday(value) || 'MM/DD/YYYY'}</span>
                <Icon name="calendar" className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" />
            </button>
            {picker}
        </>
    );
}
