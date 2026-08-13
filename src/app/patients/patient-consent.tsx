/// <reference types="vite/client" />

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useToast } from '../../components/feedback/Toast';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input } from '../../components/ui';
import { Icon } from '../../components/shared/Icon';
import { savePatientConsent } from '../../features/patients/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';

// Canvas drawing APIs need a concrete color rather than a CSS custom property.
function tokenColor(name: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

const PEN_INK = () => tokenColor('--text', '#14212A');
const PEN_INK_STAFF = () => tokenColor('--brand-primary-hover', '#173E54');

interface ConsentProps {
    patientId: string;
    patientName: string;
    rhuPersonnel?: string;
    onConsentSaved: (consentDate: string) => void;
}

interface SigPadProps {
    label: string;
    penColor?: string;
}

interface SignaturePadHandle {
    clear: () => void;
    isEmpty: () => boolean;
    toDataURL: () => string;
}

interface SignaturePoint {
    x: number;
    y: number;
}

type SignatureStroke = SignaturePoint[];

const SIGNATURE_WIDTH = 380;
const SIGNATURE_HEIGHT = 160;
const SIGNATURE_LINE_WIDTH = 2.25;

function SectionIcon({ name }: { name: string }) {
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-active)] text-white shadow-sm">
            <Icon name={name} className="h-5 w-5" />
        </span>
    );
}

const SigPad = forwardRef<SignaturePadHandle, SigPadProps>(function SigPad({ label, penColor = PEN_INK() }, ref) {
    const [active, setActive] = useState(false);
    const [hasContent, setHasContent] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokesRef = useRef<SignatureStroke[]>([]);
    const activeStrokeRef = useRef<SignatureStroke | null>(null);
    const activePointerIdRef = useRef<number | null>(null);

    const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): SignaturePoint | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const bounds = canvas.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return null;

        return {
            x: Math.max(0, Math.min(SIGNATURE_WIDTH, ((event.clientX - bounds.left) / bounds.width) * SIGNATURE_WIDTH)),
            y: Math.max(0, Math.min(SIGNATURE_HEIGHT, ((event.clientY - bounds.top) / bounds.height) * SIGNATURE_HEIGHT)),
        };
    };

    const drawStroke = (context: CanvasRenderingContext2D, stroke: SignatureStroke) => {
        if (stroke.length === 0) return;
        context.beginPath();
        context.moveTo(stroke[0].x, stroke[0].y);
        if (stroke.length === 1) {
            context.lineTo(stroke[0].x + 0.01, stroke[0].y + 0.01);
        } else {
            stroke.slice(1).forEach(point => context.lineTo(point.x, point.y));
        }
        context.stroke();
    };

    const render = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const bounds = canvas.getBoundingClientRect();
        const pixelRatio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(bounds.width * pixelRatio));
        const height = Math.max(1, Math.round(bounds.height * pixelRatio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        const context = canvas.getContext('2d');
        if (!context) return;
        context.setTransform(width / SIGNATURE_WIDTH, 0, 0, height / SIGNATURE_HEIGHT, 0, 0);
        context.clearRect(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
        context.strokeStyle = penColor;
        context.lineWidth = SIGNATURE_LINE_WIDTH;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        strokesRef.current.forEach(stroke => drawStroke(context, stroke));
    };

    useEffect(() => {
        render();
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const observer = new ResizeObserver(render);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [penColor]);

    const endStroke = (event: React.PointerEvent<HTMLCanvasElement>, releaseCapture: boolean) => {
        const canvas = canvasRef.current;
        if (activePointerIdRef.current !== event.pointerId) return;
        if (releaseCapture && canvas?.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
        activePointerIdRef.current = null;
        activeStrokeRef.current = null;
        setActive(false);
    };

    const clear = () => {
        strokesRef.current = [];
        activeStrokeRef.current = null;
        setHasContent(false);
        render();
    };

    useImperativeHandle(ref, () => ({
        clear,
        isEmpty: () => strokesRef.current.length === 0,
        toDataURL: () => {
            const output = document.createElement('canvas');
            output.width = SIGNATURE_WIDTH;
            output.height = SIGNATURE_HEIGHT;
            const context = output.getContext('2d');
            if (context) {
                context.strokeStyle = penColor;
                context.lineWidth = SIGNATURE_LINE_WIDTH;
                context.lineCap = 'round';
                context.lineJoin = 'round';
                strokesRef.current.forEach(stroke => drawStroke(context, stroke));
            }
            return output.toDataURL('image/png');
        },
    }), [penColor]);

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)]">{label}</div>
            <div
                className={`relative overflow-hidden rounded-xl border-2 border-dashed bg-[var(--bg)] transition-colors ${
                    active ? 'border-[var(--brand-primary)] bg-[var(--brand-soft-surface)] shadow-sm' : 'border-[var(--neutral-300)]'
                }`}
            >
                {!hasContent && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-xs font-semibold text-[var(--text-3)]">
                        <Icon name="edit" className="h-5 w-5" />
                        <span>Sign here</span>
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    className="block w-full touch-none select-none aspect-[19/8] min-h-40"
                    aria-label={`${label} signature pad`}
                    role="img"
                    onContextMenu={event => event.preventDefault()}
                    onDragStart={event => event.preventDefault()}
                    onPointerDown={event => {
                        if (activePointerIdRef.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
                        const point = getPoint(event);
                        if (!point) return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const stroke = [point];
                        strokesRef.current = [...strokesRef.current, stroke];
                        activeStrokeRef.current = stroke;
                        activePointerIdRef.current = event.pointerId;
                        setActive(true);
                        setHasContent(true);
                        render();
                    }}
                    onPointerMove={event => {
                        if (activePointerIdRef.current !== event.pointerId || !activeStrokeRef.current) return;
                        const point = getPoint(event);
                        if (!point) return;
                        event.preventDefault();
                        activeStrokeRef.current.push(point);
                        render();
                    }}
                    onPointerUp={event => endStroke(event, true)}
                    onPointerCancel={event => endStroke(event, false)}
                    onLostPointerCapture={event => endStroke(event, false)}
                />
            </div>
            <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="self-start" leadingIcon={<Icon name="close" className="h-3.5 w-3.5" />} onClick={clear}>
                    Clear Signature
                </Button>
            </div>
        </div>
    );
});

export default function PatientConsent({ patientId, patientName, rhuPersonnel: initialPersonnel = '', onConsentSaved }: ConsentProps) {
    const [rhuPersonnel] = useState(initialPersonnel);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // `disabled={isSubmitting}` only applies after React re-renders, and a state read in
    // the handler sees the value from the render the submit came from — so a same-frame
    // double submit would record the consent twice. The in-flight latch has to be a ref.
    const isSubmittingRef = useRef(false);
    const { showToast, ToastComponent } = useToast();

    const patientSigCanvas = useRef<SignaturePadHandle | null>(null);
    const personnelSigCanvas = useRef<SignaturePadHandle | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmittingRef.current) return;

        if (patientSigCanvas.current?.isEmpty()) {
            showToast("Please provide the patient's signature.", true);
            return;
        }
        if (personnelSigCanvas.current?.isEmpty()) {
            showToast("Please provide the RHU Personnel's signature.", true);
            return;
        }

        isSubmittingRef.current = true;
        setIsSubmitting(true);

        try {
            const patientSignatureDataUrl = patientSigCanvas.current?.toDataURL();
            const personnelSignatureDataUrl = personnelSigCanvas.current?.toDataURL();

            const consentDate = new Date().toISOString();
            await savePatientConsent({
                patient_id: patientId,
                consent_signer: true,
                consent_signature: patientSignatureDataUrl,
                consent_personnel: rhuPersonnel,
                consent_personnel_signature: personnelSignatureDataUrl,
                consent_date: consentDate,
            });

            showToast('Patient consent saved successfully.', false);
            onConsentSaved(consentDate);
        } catch (err) {
            logError('Failed to save patient consent', err);
            showToast(healthcareErrorMessage("save the patient's consent"), true);
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <ToastComponent />
            <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
                <Card>
                    <CardHeader className="flex flex-wrap items-center gap-3 bg-[var(--bg)]">
                        <SectionIcon name="clipboard" />
                        <CardTitle className="text-sm text-[var(--text-2)]">IV. Patient Consent &amp; Data Privacy</CardTitle>
                        <Badge tone="blue" className="ml-auto gap-1.5">
                            <Icon name="lock" className="h-3.5 w-3.5" /> RA 10173
                        </Badge>
                    </CardHeader>
                    <CardBody>
                        <p className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-5 py-4 text-sm font-medium leading-7 text-[var(--text-2)]">
                            I hereby give my consent to the <span className="font-bold text-[var(--text)]">Malvar Rural Health Unit</span> to collect,
                            process, and store my personal and medical information for the purpose of healthcare delivery, diagnosis, treatment,
                            and referral. I understand that my records will be kept confidential in accordance with the{' '}
                            <span className="font-bold text-[var(--text)]">Data Privacy Act of 2012 (RA 10173)</span>. I certify that the information
                            provided is true and correct to the best of my knowledge.
                        </p>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader className="flex items-center gap-3 bg-[var(--bg)]">
                        <SectionIcon name="lock" />
                        <CardTitle className="text-sm text-[var(--text)]">Privacy Notice</CardTitle>
                    </CardHeader>
                    <CardBody>
                        <p className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-5 py-4 text-sm font-medium leading-7 text-[var(--text)]">
                            MEDISENS handles personal and health information in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173). Patient information is collected, stored, accessed, and processed only for authorized healthcare services of the Rural Health Unit.
                        </p>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader className="flex items-center gap-3 bg-[var(--bg)]">
                        <SectionIcon name="edit" />
                        <CardTitle className="text-sm text-[var(--text-2)]">Signatures</CardTitle>
                    </CardHeader>
                    <CardBody>
                        <div className="grid gap-6 md:grid-cols-2">
                            <SigPad
                                label="Patient Signature"
                                ref={patientSigCanvas}
                                penColor={PEN_INK()}
                            />
                            <SigPad
                                label="RHU Personnel Signature"
                                ref={personnelSigCanvas}
                                penColor={PEN_INK_STAFF()}
                            />
                        </div>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader className="flex items-center gap-3 bg-[var(--bg)]">
                        <SectionIcon name="id-card" />
                        <CardTitle className="text-sm text-[var(--text-2)]">Printed Names</CardTitle>
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
