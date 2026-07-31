import { EmptyState, Icon } from 'crud-feature';

export const NoRecords = () => (
  <div style={{ maxWidth: 460 }}>
    <EmptyState
      icon={<Icon name="inbox" className="h-5 w-5" />}
      title="No patients are registered yet"
      description="Newly registered residents will appear here once the barangay health worker completes intake."
    />
  </div>
);

export const NoFilterMatch = () => (
  <div style={{ maxWidth: 460 }}>
    <EmptyState
      icon={<Icon name="search" className="h-5 w-5" />}
      title="No patients match the current filter"
      description="Try clearing the barangay filter or searching by a different name."
    />
  </div>
);

export const RequestFailed = () => (
  <div style={{ maxWidth: 460 }}>
    <EmptyState
      icon={<Icon name="alert-triangle" className="h-5 w-5" />}
      title="Laboratory results could not be loaded"
      description="The request failed. Other sections of this record are unaffected."
    />
  </div>
);
