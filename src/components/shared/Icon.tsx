import type { ReactNode } from 'react';

export type IconName =
    | 'home'
    | 'users'
    | 'user-plus'
    | 'clipboard'
    | 'chart'
    | 'flask'
    | 'pill'
    | 'file-text'
    | 'logout'
    | 'close'
    | 'inbox'
    | 'wifi'
    | 'wifi-off'
    | 'search'
    | 'plus'
    | 'check'
    | 'save'
    | 'printer'
    | 'edit'
    | 'trash'
    | 'alert-triangle'
    | 'lock'
    | 'id-card'
    | 'stethoscope'
    | 'clock'
    | 'user'
    | 'map-pin'
    | 'droplet'
    | 'calendar'
    | 'building'
    | 'baby'
    | 'heart-pulse'
    | 'smile'
    | 'shield-plus'
    | 'menu'
    | 'chevron-right'
    | 'globe';

interface IconProps {
    name: IconName | string;
    className?: string;
    label?: string;
}

const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    'user-plus': <><path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 9h6M9 13h6M9 17h4"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.75 3h10.5A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 15h9"/></>,
    pill: <><path d="m10.5 20.5-7-7a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z"/><path d="m7 17 7-7"/></>,
    'file-text': <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M21 3v18h-6"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    inbox: <><path d="M4 4h16v16H4zM4 14h4l2 3h4l2-3h4"/></>,
    wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></>,
    'wifi-off': <><path d="m3 3 18 18M8.5 16a5 5 0 0 1 5.2-1.15M5 12.5a10 10 0 0 1 4.2-2.4M15 10.1a10 10 0 0 1 4 2.4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    save: <><path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7"/></>,
    printer: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    trash: <><path d="M3 6h18M8 6V3h8v3M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></>,
    'alert-triangle': <><path d="M10.3 3.6 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    'id-card': <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5.5 16a3 3 0 0 1 5 0M13 10h5M13 14h5"/></>,
    stethoscope: <><path d="M6 3v5a4 4 0 0 0 8 0V3M4 3h4M12 3h4M10 16a4 4 0 1 0 8 0v-1"/><circle cx="18" cy="12" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    'map-pin': <><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></>,
    droplet: <><path d="M12 2.5S5.5 9.5 5.5 14a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2.5 12 2.5Z"/></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></>,
    building: <><path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16"/><path d="M9 21v-5h3v5M8 7h1M12 7h1M8 11h1M12 11h1M17 9h1a2 2 0 0 1 2 2v10"/></>,
    baby: <><circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9.5 15a4 4 0 0 0 5 0M10 3.2c.5 1.8 2.7 2.2 4 1"/></>,
    'heart-pulse': <><path d="M20.8 8.6a5.5 5.5 0 0 0-9.8-3.3L12 6.4l1-1.1a5.5 5.5 0 0 1 8.2 7.3L12 21l-9.2-8.4a5.5 5.5 0 0 1 8.2-7.3L12 6.4"/><path d="M3 12h4l2-3 3 6 2-3h7"/></>,
    smile: <><circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8.5 14.5a5 5 0 0 0 7 0"/></>,
    'shield-plus': <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v6M9 11h6"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    'chevron-right': <><path d="m9 18 6-6-6-6"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
};

function resolveIcon(name: string): IconName {
    return name in paths ? name as IconName : 'file-text';
}

export function Icon({ name, className = 'h-5 w-5', label }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden={label ? undefined : true}
            role={label ? 'img' : undefined}
            aria-label={label}
        >
            {paths[resolveIcon(name)]}
        </svg>
    );
}
