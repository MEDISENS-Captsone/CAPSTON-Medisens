/// <reference types="vite/client" />

import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useToast } from '../../components/feedback/Toast';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input } from '../../components/ui';
import { Icon } from '../../components/shared/Icon';
import { colors } from '../../design-system';
import { savePatientConsent } from '../../features/patients/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';

interface ConsentProps {
    patientId: string;
    patientName: string;
    rhuPersonnel?: string;
    onConsentSaved: () => void;
}

interface SigPadProps {
    label: string;
    sigRef: React.RefObject<SignatureCanvas | null>;
    penColor?: string;
    onClear: () => void;
}

function SectionIcon({ name }: { name: string }) {
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-white shadow-sm">
            <Icon name={name} className="h-5 w-5" />
        </span>
    );
}

function SigPad({ label, sigRef, penColor = colors.neutral[900], onClear }: SigPadProps) {
    const [active, setActive] = useState(false);
    const [hasContent, setHasContent] = useState(false);

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
            <div
                className={`relative overflow-hidden rounded-xl border-2 border-dashed bg-slate-50 transition-colors ${
                    active ? 'border-slate-500 bg-slate-50/70' : 'border-slate-300'
                }`}
            >
                {!hasContent && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-xs font-semibold text-slate-400">
                        <Icon name="edit" className="h-5 w-5" />
                        <span>Sign here</span>
                    </div>
                )}
                <SignatureCanvas
                    ref={sigRef}
                    penColor={penColor}
                    onBegin={() => {
                        setActive(true);
                        setHasContent(true);
                    }}
                    onEnd={() => setActive(false)}
                    canvasProps={{
                        width: 380,
                        height: 160,
                        className: 'block h-40 w-full',
                        'aria-label': `${label} signature pad`,
                    }}
                />
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                leadingIcon={<Icon name="close" className="h-3.5 w-3.5" />}
                onClick={() => {
                    onClear();
                    setHasContent(false);
                }}
            >
                Clear
            </Button>
        </div>
    );
}

export default function PatientConsent({ patientId, patientName, rhuPersonnel: initialPersonnel = '', onConsentSaved }: ConsentProps) {
    const [rhuPersonnel] = useState(initialPersonnel);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast, ToastComponent } = useToast();

    const patientSigCanvas = useRef<SignatureCanvas | null>(null);
    const personnelSigCanvas = useRef<SignatureCanvas | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (patientSigCanvas.current?.isEmpty()) {
            showToast("Please provide the patient's signature.", true);
            return;
        }
        if (personnelSigCanvas.current?.isEmpty()) {
            showToast("Please provide the RHU Personnel's signature.", true);
            return;
        }

        setIsSubmitting(true);

        try {
            const patientSignatureDataUrl = patientSigCanvas.current?.getCanvas().toDataURL('image/png');
            const personnelSignatureDataUrl = personnelSigCanvas.current?.getCanvas().toDataURL('image/png');

            await savePatientConsent({
                patient_id: patientId,
                consent_signer: true,
                consent_signature: patientSignatureDataUrl,
                consent_personnel: rhuPersonnel,
                consent_personnel_signature: personnelSignatureDataUrl,
                consent_date: new Date().toISOString(),
            });

            showToast('Patient consent saved successfully.', false);
            onConsentSaved();
        } catch (err) {
            logError('Failed to save patient consent', err);
            showToast(healthcareErrorMessage("save the patient's consent"), true);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <ToastComponent />
            <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
                <Card>
                    <CardHeader className="flex flex-wrap items-center gap-3 bg-slate-50">
                        <SectionIcon name="clipboard" />
                        <CardTitle className="text-sm text-slate-700">IV. Patient Consent &amp; Data Privacy</CardTitle>
                        <Badge tone="blue" className="ml-auto gap-1.5">
                            <Icon name="lock" className="h-3.5 w-3.5" /> RA 10173
                        </Badge>
                    </CardHeader>
                    <CardBody>
                        <p className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium leading-7 text-slate-600">
                            I hereby give my consent to the <span className="font-bold text-slate-900">Malvar Rural Health Unit</span> to collect,
                            process, and store my personal and medical information for the purpose of healthcare delivery, diagnosis, treatment,
                            and referral. I understand that my records will be kept confidential in accordance with the{' '}
                            <span className="font-bold text-slate-900">Data Privacy Act of 2012 (RA 10173)</span>. I certify that the information
                            provided is true and correct to the best of my knowledge.
                        </p>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader className="flex items-center gap-3 bg-slate-50">
                        <SectionIcon name="lock" />
                        <CardTitle className="text-sm text-slate-800">Privacy Notice</CardTitle>
                    </CardHeader>
                    <CardBody>
                        <p className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium leading-7 text-slate-900">
                            MEDISENS handles personal and health information in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173). Patient information is collected, stored, accessed, and processed only for authorized healthcare services of the Rural Health Unit.
                        </p>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader className="flex items-center gap-3 bg-slate-50">
                        <SectionIcon name="edit" />
                        <CardTitle className="text-sm text-slate-700">Signatures</CardTitle>
                    </CardHeader>
                    <CardBody>
                        <div className="grid gap-6 md:grid-cols-2">
                            <SigPad
                                label="Patient Signature"
                                sigRef={patientSigCanvas}
                                penColor={colors.neutral[900]}
                                onClear={() => patientSigCanvas.current?.clear()}
                            />
                            <SigPad
                                label="RHU Personnel Signature"
                                sigRef={personnelSigCanvas}
                                penColor={colors.brand.primaryHover}
                                onClear={() => personnelSigCanvas.current?.clear()}
                            />
                        </div>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader className="flex items-center gap-3 bg-slate-50">
                        <SectionIcon name="id-card" />
                        <CardTitle className="text-sm text-slate-700">Printed Names</CardTitle>
                    </CardHeader>
                    <CardBody>
                        <div className="grid gap-5 md:grid-cols-2">
                            <Input label="Patient Name" type="text" value={patientName} disabled />
                            <Input label="RHU Personnel (Printed Name)" type="text" value={rhuPersonnel} disabled />
                        </div>
                    </CardBody>
                </Card>

                <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    isLoading={isSubmitting}
                    leadingIcon={<Icon name="check" className="h-4 w-4" />}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Saving Consent...' : 'Confirm & Save Consent'}
                </Button>
            </form>
        </>
    );
}
