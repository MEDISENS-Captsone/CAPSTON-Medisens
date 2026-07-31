import { Badge } from 'crud-feature';

export const Tones = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    <Badge tone="blue">Scheduled</Badge>
    <Badge tone="green">Completed</Badge>
    <Badge tone="amber">Pending</Badge>
    <Badge tone="red">Urgent</Badge>
    <Badge tone="slate">Archived</Badge>
    <Badge tone="teal">Dispensed</Badge>
    <Badge tone="indigo">Referred</Badge>
    <Badge tone="pink">Maternal</Badge>
  </div>
);

export const ClinicalStatuses = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    <Badge tone="amber">Awaiting consultation</Badge>
    <Badge tone="green">Consent signed</Badge>
    <Badge tone="red">Lab result critical</Badge>
  </div>
);
