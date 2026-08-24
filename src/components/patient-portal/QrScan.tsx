import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Icon } from '../shared/Icon';
import { extractMedisensIdFromScan } from '../../lib/utils/qr';

interface QrScanProps {
    /** Called with an already-validated MediSens ID. Scanning never signs
     * anyone in by itself -- the caller still requires a PIN afterward. */
    onDetected: (medisensId: string) => void;
    onManualEntry: () => void;
}

type ScanStatus =
    | 'idle'
    | 'requesting'
    | 'scanning'
    | 'invalid-qr'
    | 'permission-denied'
    | 'no-camera'
    | 'unsupported'
    | 'error';

/** QR foundation for the Patient Portal (§17 Phase 9B Step 2). Camera
 * access is requested only after the patient taps "Start scanning" here
 * -- never on mount, never automatically. Prefers the native
 * BarcodeDetector; falls back to a lazily-imported jsQR only if the
 * native API is unavailable, and only once scanning actually starts. A
 * manual-entry escape is always visible, in every state. Scanned text is
 * never logged, never persisted, and never used to navigate -- only
 * extractMedisensIdFromScan()'s validated output is ever handed back to
 * the caller. */
export function QrScan({ onDetected, onManualEntry }: QrScanProps) {
    const [status, setStatus] = useState<ScanStatus>('idle');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const jsQrRef = useRef<typeof import('jsqr').default | null>(null);
    const stoppedRef = useRef(false);

    const stopCamera = useCallback(() => {
        stoppedRef.current = true;
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (streamRef.current) {
            // Explicit per-track stop -- releases the camera indicator
            // immediately rather than waiting on garbage collection, and
            // guarantees no frame continues to be captured after
            // cancel/unmount/success (no infinite scan loop).
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    useEffect(() => stopCamera, [stopCamera]);

    const decodeLoop = useCallback(async () => {
        if (stoppedRef.current) return;
        const video = videoRef.current;
        if (!video || video.readyState < video.HAVE_ENOUGH_DATA) {
            rafRef.current = requestAnimationFrame(() => void decodeLoop());
            return;
        }

        if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        let rawText: string | null = null;

        // Native BarcodeDetector first -- zero extra bytes, hardware-
        // accelerated where available.
        const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: new (options?: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
        if (BarcodeDetectorCtor) {
            try {
                const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
                const results = await detector.detect(video);
                if (results.length > 0) rawText = results[0].rawValue;
            } catch {
                // Falls through to jsQR below.
            }
        } else if (ctx) {
            // Lazy jsQR fallback -- imported once, only when scanning has
            // actually started and native detection isn't available.
            // Never part of the eager Patient Portal bundle.
            if (!jsQrRef.current) {
                const mod = await import('jsqr');
                jsQrRef.current = mod.default;
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQrRef.current(imageData.data, imageData.width, imageData.height);
            rawText = result?.data ?? null;
        }

        if (stoppedRef.current) return;

        if (rawText) {
            const medisensId = extractMedisensIdFromScan(rawText);
            if (medisensId) {
                stopCamera();
                onDetected(medisensId);
                return;
            }
            // A QR code was read, but it isn't a MediSens Patient Portal
            // code -- never log its contents, just tell the patient.
            setStatus('invalid-qr');
            stopCamera();
            return;
        }

        rafRef.current = requestAnimationFrame(() => void decodeLoop());
    }, [onDetected, stopCamera]);

    const startScanning = useCallback(async () => {
        setStatus('requesting');
        stoppedRef.current = false;

        if (!navigator.mediaDevices?.getUserMedia) {
            setStatus('unsupported');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false,
            });
            if (stoppedRef.current) {
                // Cancelled while the permission prompt was open.
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setStatus('scanning');
            rafRef.current = requestAnimationFrame(() => void decodeLoop());
        } catch (err) {
            const name = err instanceof DOMException ? err.name : '';
            if (name === 'NotAllowedError' || name === 'SecurityError') {
                setStatus('permission-denied');
            } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
                setStatus('no-camera');
            } else {
                setStatus('error');
            }
        }
    }, [decodeLoop]);

    const handleRetry = () => {
        setStatus('idle');
    };

    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            {status === 'idle' && (
                <div className="text-center">
                    <p className="mb-3 text-[var(--text-secondary)]">Scan the QR code on your MediSens Patient Card.</p>
                    <Button className="w-full" onClick={() => void startScanning()}>Start scanning</Button>
                </div>
            )}

            {(status === 'requesting' || status === 'scanning') && (
                <div>
                    <div className="relative overflow-hidden rounded-[var(--radius-control)] bg-black">
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
                    </div>
                    <p className="mt-3 text-center text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">
                        {status === 'requesting' ? 'Starting camera…' : 'Point your camera at the QR code.'}
                    </p>
                </div>
            )}

            {status === 'invalid-qr' && (
                <div className="text-center">
                    <Icon name="alert-triangle" className="mx-auto mb-2 h-6 w-6 text-[var(--amber-text)]" />
                    <p className="mb-3 text-[var(--text)]">That QR code isn't a MediSens Patient Card.</p>
                    <Button className="w-full" variant="outline" onClick={handleRetry}>Try again</Button>
                </div>
            )}

            {status === 'permission-denied' && (
                <div className="text-center">
                    <Icon name="alert-triangle" className="mx-auto mb-2 h-6 w-6 text-[var(--amber-text)]" />
                    <p className="mb-1 text-[var(--text)]">Camera access was not allowed.</p>
                    <p className="mb-3 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">You can still sign in without the camera.</p>
                </div>
            )}

            {status === 'no-camera' && (
                <div className="text-center">
                    <Icon name="alert-triangle" className="mx-auto mb-2 h-6 w-6 text-[var(--amber-text)]" />
                    <p className="mb-3 text-[var(--text)]">No camera was found on this device.</p>
                </div>
            )}

            {status === 'unsupported' && (
                <div className="text-center">
                    <Icon name="alert-triangle" className="mx-auto mb-2 h-6 w-6 text-[var(--amber-text)]" />
                    <p className="mb-3 text-[var(--text)]">Scanning isn't available on this browser.</p>
                </div>
            )}

            {status === 'error' && (
                <div className="text-center">
                    <Icon name="alert-triangle" className="mx-auto mb-2 h-6 w-6 text-[var(--amber-text)]" />
                    <p className="mb-3 text-[var(--text)]">We couldn't start the camera. Please try again.</p>
                </div>
            )}

            {/* Always-available manual escape, in every state (§17 Phase 9B). */}
            <button
                type="button"
                onClick={() => {
                    stopCamera();
                    onManualEntry();
                }}
                className="mt-4 min-h-[44px] w-full text-center font-semibold text-[var(--brand-active)] underline"
            >
                Can't scan? Enter your MediSens ID instead.
            </button>
        </div>
    );
}
