import { Card, CardHeader, CardTitle, CardBody, Badge } from 'crud-feature';

export const PatientSummary = () => (
  <Card style={{ maxWidth: 420 }}>
    <CardHeader>
      <CardTitle>Dela Cruz, Maria L.</CardTitle>
    </CardHeader>
    <CardBody>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
        34 / Female &middot; Barangay Poblacion, Malvar &middot; Blood type O+
      </p>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <Badge tone="green">Consent signed</Badge>
        <Badge tone="amber">Follow-up due</Badge>
      </div>
    </CardBody>
  </Card>
);

export const Sections = () => (
  <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
    <Card>
      <CardHeader><CardTitle>Waiting patients</CardTitle></CardHeader>
      <CardBody><p style={{ margin: 0, fontSize: 13 }}>6 ready for consultation</p></CardBody>
    </Card>
    <Card>
      <CardHeader><CardTitle>Follow-ups due</CardTitle></CardHeader>
      <CardBody><p style={{ margin: 0, fontSize: 13 }}>3 scheduled returns today</p></CardBody>
    </Card>
  </div>
);
