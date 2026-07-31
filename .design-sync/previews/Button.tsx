import { Button } from 'crud-feature';

export const Variants = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
    <Button variant="primary">Save consultation</Button>
    <Button variant="secondary">Add vital signs</Button>
    <Button variant="outline">View chart</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="danger">Archive patient</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Button isLoading>Authorizing…</Button>
    <Button disabled>Unavailable offline</Button>
  </div>
);
