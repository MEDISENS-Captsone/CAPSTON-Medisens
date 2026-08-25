import type { ReactNode } from 'react';
import { Icon } from '../shared/Icon';
import { useT } from '../../lib/i18n/patientPortal';
import medisensLogo from '../../assets/MEDISENS Logo.png';
import pageBackgroundPhoto from '../../assets/Login Page 3.png';

// Patient Account Phase 9B Step 6 -- the one shared unauthenticated shell
// (navy branded hero + white content sheet, "Back to Staff Login") reused
// by every pre-auth Patient Portal screen: sign in, QR scan,
// activation-code entry, activation verification/context, create-PIN, and
// activation success. Nothing here touches session/auth state -- it is
// pure layout chrome, so the same wrapper can be dropped around any of
// those screens without duplicating hero/background markup per screen.

// The staff login page's deterministic address -- both pages/patient.html
// and pages/login.html live directly under pages/, so this is a plain
// relative sibling link, not a browser-history dependency.
const STAFF_LOGIN_PATH = './login.html';

interface PatientFrontDoorShellProps {
    /** Only the main sign-in screen shows this -- activation setup keeps
     * its own distinct "Back to sign in" instead (no duplicate navigation). */
    showBackToStaffLogin?: boolean;
    children: ReactNode;
}

export function PatientFrontDoorShell({ showBackToStaffLogin = false, children }: PatientFrontDoorShellProps) {
    const { t } = useT();
    return (
        <div className="patient-frontdoor-page">
            {/* Login Page 3.png -- a light-blue RHU ward interior, the only
                one of the three Login Page assets whose palette actually
                sits inside the MediSens navy/blue system (the other two
                are warm terracotta/wood tones). This is the *page*
                background behind the whole Patient Portal container, not
                something embedded inside the hero or the card -- the
                container (panel) paints its own solid navy/white surfaces
                on top of it. A flat, non-gradient tint keeps the visible
                margin around the container calm rather than a loud photo. */}
            <div className="patient-frontdoor-page-photo" style={{ backgroundImage: `url(${pageBackgroundPhoto})` }} aria-hidden="true" />
            <div className="patient-frontdoor-page-tint" aria-hidden="true" />

            <div className="patient-frontdoor-panel">
                <div className="patient-frontdoor-hero">
                    {/* Purely decorative, MediSens-mark-derived fragments --
                        single flat fills (no gradients), cropped by the
                        hero's own overflow:hidden, never exposed to
                        assistive tech, never interactive. */}
                    <div className="patient-frontdoor-motif patient-frontdoor-motif-a" aria-hidden="true" />
                    <div className="patient-frontdoor-motif patient-frontdoor-motif-b" aria-hidden="true" />
                    <div className="patient-frontdoor-motif patient-frontdoor-motif-c" aria-hidden="true" />

                    {showBackToStaffLogin ? (
                        <a href={STAFF_LOGIN_PATH} className="patient-frontdoor-back-link">
                            <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                            <span>{t('frontdoor.backToStaffLogin')}</span>
                        </a>
                    ) : (
                        <span className="patient-frontdoor-back-link patient-frontdoor-back-link-placeholder" aria-hidden="true" />
                    )}

                    <div className="patient-frontdoor-hero-spacer" />

                    <div className="patient-frontdoor-hero-brand">
                        <img src={medisensLogo} alt="MediSens" />
                    </div>

                    {/* Desktop-only system identity (task §3) -- hidden on
                        phone/tablet, where the sheet's own heading right
                        below already states it. */}
                    <div className="patient-frontdoor-hero-identity">
                        <p className="brand-name">MediSens</p>
                        <p className="brand-tagline">Patient Portal &middot; Malvar Rural Health Unit</p>
                    </div>
                </div>

                <div className="patient-frontdoor-sheet">{children}</div>
            </div>
        </div>
    );
}
