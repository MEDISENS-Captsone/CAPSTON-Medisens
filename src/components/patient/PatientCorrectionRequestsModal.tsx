import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { StaffCorrectionRequest, StaffCorrectionStatus } from '../../features/patients/correctionRequests';
import { Icon } from '../shared/Icon';
import { Modal } from '../ui/Modal';
import { SkeletonList } from '../ui/Skeleton';
import type { Patient } from './PatientDetailModal';

interface PatientCorrectionRequestsModalProps {
    patient: Patient;
    requests: StaffCorrectionRequest[];
    isLoading: boolean;
    loadError: boolean;
    reviewingRequestId: string | null;
    onClose: () => void;
    onRetry: () => void;
    onEditPatient: () => void;
    onReview: (request: StaffCorrectionRequest, outcome: Exclude<StaffCorrectionStatus, 'submitted'>) => Promise<void>;
}

const FIELD_LABELS: Record<StaffCorrectionRequest['fieldGroup'], string> = {
    name: 'Name',
    birthdate: 'Birthdate',
    address: 'Address',
    contact: 'Contact number',
    philhealth: 'PhilHealth number',
    other: 'Other information',
};

const formatCurrentValue = (patient: Patient, fieldGroup: StaffCorrectionRequest['fieldGroup']) => {
    switch (fieldGroup) {
        case 'name':
            return [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ') || 'Not provided';
        case 'birthdate':
            return patient.birthday || 'Not provided';
        case 'address':
            return patient.address || 'Not provided';
        case 'contact':
            return patient.contactNumber || 'Not provided';
        case 'philhealth':
            return patient.philhealthNo || 'Not provided';
        default:
            return 'Not available for comparison';
    }
};

const formatSubmittedAt = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
};

const statusLabel = (status: StaffCorrectionStatus) => {
    if (status === 'declined') return 'Rejected';
    if (status === 'resolved') return 'Resolved';
    return 'Submitted';
};

export function PatientCorrectionRequestsModal({
    patient,
    requests,
    isLoading,
    loadError,
    reviewingRequestId,
    onClose,
    onRetry,
    onEditPatient,
    onReview,
}: PatientCorrectionRequestsModalProps) {
    const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="patient-corrections-layer">
            <div className="patient-corrections-backdrop" onClick={onClose} aria-hidden="true" />
            <div className="patient-corrections-positioner">
                <Modal
                    labelledBy="patient-correction-requests-title"
                    onClose={onClose}
                    className="patient-corrections-modal"
                >
                    <header className="patient-corrections-header">
                        <div className="min-w-0">
                            <h2 id="patient-correction-requests-title">Patient Correction Requests</h2>
                            <p>{[patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')}</p>
                        </div>
                        <button type="button" onClick={onClose} className="patient-corrections-close" aria-label="Close correction requests">
                            <Icon name="close" className="h-5 w-5" />
                        </button>
                    </header>

                    <div className="patient-corrections-body">
                        {isLoading ? (
                            <div role="status" aria-label="Loading correction requests"><SkeletonList rows={3} /></div>
                        ) : loadError ? (
                            <div className="patient-corrections-state" role="alert">
                                <Icon name="alert-triangle" className="h-6 w-6" />
                                <strong>Unable to load correction requests.</strong>
                                <span>Please check the connection and try again.</span>
                                <button type="button" onClick={onRetry}>Try again</button>
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="patient-corrections-state">
                                <Icon name="inbox" className="h-6 w-6" />
                                <strong>No correction requests for this patient.</strong>
                            </div>
                        ) : (
                            <div className="patient-corrections-list">
                                {requests.map(request => {
                                    const isPending = request.status === 'submitted';
                                    const isReviewing = reviewingRequestId === request.id;
                                    const confirmingReject = confirmRejectId === request.id;

                                    return (
                                        <article key={request.id} className={`patient-correction-card ${isPending ? 'is-pending' : 'is-history'}`}>
                                            <div className="patient-correction-card-heading">
                                                <h3>{FIELD_LABELS[request.fieldGroup]}</h3>
                                                <span className={`patient-correction-status is-${request.status}`}>{statusLabel(request.status)}</span>
                                            </div>
                                            <dl className="patient-correction-values">
                                                <div>
                                                    <dt>Current</dt>
                                                    <dd>{formatCurrentValue(patient, request.fieldGroup)}</dd>
                                                </div>
                                                <div>
                                                    <dt>Requested</dt>
                                                    <dd>{request.requestedValue}</dd>
                                                </div>
                                                {request.patientNote && (
                                                    <div className="patient-correction-note">
                                                        <dt>Patient/guardian note</dt>
                                                        <dd>{request.patientNote}</dd>
                                                    </div>
                                                )}
                                            </dl>
                                            <p className="patient-correction-submitted">
                                                Submitted {formatSubmittedAt(request.submittedAt)}
                                            </p>

                                            {isPending && (
                                                <div className="patient-correction-actions">
                                                    <button type="button" onClick={onEditPatient} disabled={Boolean(reviewingRequestId)} className="is-edit">
                                                        <Icon name="edit" className="h-4 w-4" /> Edit Patient Record
                                                    </button>
                                                    {!confirmingReject ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => void onReview(request, 'resolved')}
                                                                disabled={Boolean(reviewingRequestId)}
                                                                className="is-resolve"
                                                            >
                                                                <Icon name="check" className="h-4 w-4" /> {isReviewing ? 'Updating...' : 'Mark as Resolved'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmRejectId(request.id)}
                                                                disabled={Boolean(reviewingRequestId)}
                                                                className="is-reject"
                                                            >
                                                                Reject
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div className="patient-correction-reject-confirm" role="group" aria-label="Confirm rejection">
                                                            <span>Reject this request?</span>
                                                            <button type="button" onClick={() => setConfirmRejectId(null)} disabled={isReviewing}>Cancel</button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void onReview(request, 'declined').then(() => setConfirmRejectId(null))}
                                                                disabled={isReviewing}
                                                                className="is-reject"
                                                            >
                                                                {isReviewing ? 'Rejecting...' : 'Reject request'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Modal>
            </div>
        </div>,
        document.body,
    );
}
