import { Input, Icon } from 'crud-feature';

export const Labelled = () => (
  <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
    <Input label="Last name" defaultValue="Dela Cruz" />
    <Input label="Contact number" placeholder="09XX XXX XXXX" hint="Used for follow-up reminders." />
  </div>
);

export const WithIcon = () => (
  <div style={{ maxWidth: 360 }}>
    <Input
      label="Search patient records"
      placeholder="Search by name…"
      leadingIcon={<Icon name="search" className="h-4 w-4" />}
    />
  </div>
);

export const Invalid = () => (
  <div style={{ maxWidth: 360 }}>
    <Input label="Contact number" defaultValue="0912" error="Enter a complete 11-digit mobile number." />
  </div>
);
