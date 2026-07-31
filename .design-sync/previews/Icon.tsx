import { Icon } from 'crud-feature';

const NAMES = [
  'home', 'users', 'clipboard', 'stethoscope', 'flask', 'pill',
  'heart-pulse', 'baby', 'shield-plus', 'calendar', 'chart', 'file-text',
  'search', 'check', 'alert-triangle', 'printer', 'wifi', 'wifi-off',
] as const;

export const ClinicalSet = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
    {NAMES.map(n => (
      <div key={n} style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
        <Icon name={n} className="h-5 w-5" />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{n}</span>
      </div>
    ))}
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <Icon name="stethoscope" className="h-4 w-4" />
    <Icon name="stethoscope" className="h-5 w-5" />
    <Icon name="stethoscope" className="h-6 w-6" />
  </div>
);
