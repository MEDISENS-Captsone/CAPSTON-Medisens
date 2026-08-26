import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

// Patient Account Phase 9C -- a small, maintainable localization layer for
// Patient Portal *interface* copy only (navigation, headings, buttons,
// instructional text, empty/error states, account/access wording,
// Help & Support, activation/recovery screens). This dictionary must
// never be reached for for: patient/guardian/caregiver names, MediSens
// IDs, medication names, laboratory test names, diagnoses, or any other
// clinician-authored/free-text clinical data -- those are rendered
// verbatim from the database regardless of the selected language, in
// every component that already does so today. Adding a language here
// changes only how MediSens *talks*, never what it *shows*.
//
// Usage: wrap the authenticated + front-door portal tree in
// <PatientLanguageProvider language={...}>, then call useT() inside any
// Patient Portal component to get a `t(key)` function. Keys are plain
// strings (not deeply nested) so the dictionary stays a flat, greppable
// list -- add a new UI string by adding one entry here, never by
// scattering an inline ternary in a component.

export type PatientLanguage = 'en' | 'fil';

export const PATIENT_LANGUAGES: { value: PatientLanguage; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'fil', label: 'Filipino' },
];

type DictionaryKey = keyof typeof DICTIONARY;

// Natural, everyday Filipino as spoken at an RHU counter -- not formal
// "deep Tagalog". Where a health term is already commonly understood in
// English at the barangay level (e.g. "PIN", "MediSens ID", "OTP"), it is
// kept as-is rather than forced into an unfamiliar Filipino equivalent.
const DICTIONARY = {
    // Navigation / bottom tabs
    'nav.home': { en: 'Home', fil: 'Home' },
    'nav.health': { en: 'My Health', fil: 'Aking Kalusugan' },
    'nav.medicines': { en: 'Medicines', fil: 'Gamot' },
    'nav.labs': { en: 'Labs', fil: 'Lab Results' },
    'nav.more': { en: 'More', fil: 'Iba Pa' },

    // Record context / person switcher
    'context.viewing': { en: 'Viewing', fil: 'Tinitingnan' },
    'context.switchPerson': { en: 'Switch person', fil: 'Palitan ang Tinitingnan' },
    'context.chooseRecord': { en: 'Choose a health record', fil: 'Pumili ng Health Record' },
    'context.switchRecord': { en: 'Switch record', fil: 'Palitan ang Record' },
    'record.noneSelected': { en: 'No health record selected', fil: 'Walang napiling health record' },
    'record.ownRecord': { en: 'Your own health record', fil: 'Ang sarili mong health record' },
    'record.helpManage': { en: 'A health record you help manage', fil: 'Health record na tinutulungan mong pangasiwaan' },
    'record.guardianAccess': { en: 'Guardian access', fil: 'Access bilang Guardian' },
    'record.caregiverAccess': { en: 'Caregiver access · Read-only', fil: 'Access bilang Caregiver · Basa Lang' },
    'switcher.youArePatient': { en: 'You are the patient', fil: 'Ikaw ang pasyente' },
    'switcher.youAreGuardian': { en: 'You are the guardian', fil: 'Ikaw ang guardian' },
    'switcher.youAreCaregiver': { en: 'You are an authorized caregiver', fil: 'Ikaw ang awtorisadong caregiver' },

    // More menu
    'more.signedInAs': { en: 'Signed in as', fil: 'Naka-sign in bilang' },
    'more.medisensId': { en: 'MediSens ID', fil: 'MediSens ID' },
    'more.myProfile': { en: 'My Profile', fil: 'Aking Profile' },
    'more.caregiverAccess': { en: 'Caregiver / Guardian Access', fil: 'Access ng Caregiver / Guardian' },
    'more.privacySecurity': { en: 'Privacy & Security', fil: 'Privacy at Seguridad' },
    'more.notifications': { en: 'Notifications', fil: 'Mga Abiso' },
    'more.textSizeComfortable': { en: 'Text size: Comfortable', fil: 'Laki ng Teksto: Normal' },
    'more.textSizeLarge': { en: 'Text size: Larger Text', fil: 'Laki ng Teksto: Mas Malaki' },
    'more.language': { en: 'Language: English', fil: 'Wika: Filipino' },
    'more.helpSupport': { en: 'Help & Support', fil: 'Tulong at Suporta' },
    'more.signOut': { en: 'Sign out', fil: 'Mag-sign Out' },
    'more.back': { en: 'Back', fil: 'Bumalik' },
    'more.backToMore': { en: 'Back to More', fil: 'Bumalik sa Iba Pa' },

    // Language preference page
    'language.title': { en: 'Language', fil: 'Wika' },
    'language.description': {
        en: 'Choose the language used for menus, buttons, and instructions in the Patient Portal.',
        fil: 'Piliin ang wikang gagamitin sa mga menu, buton, at panuto sa Patient Portal.',
    },
    'language.note': {
        en: 'Your name, MediSens ID, and medical records always appear exactly as recorded and are never translated.',
        fil: 'Ang iyong pangalan, MediSens ID, at mga medical record ay palaging ipapakita nang eksakto ayon sa nakarehistro at hindi isasalin.',
    },

    // Sign-out confirmation
    'signOut.title': { en: 'Sign out of Patient Portal?', fil: 'Mag-sign Out sa Patient Portal?' },
    'signOut.body': {
        en: "You'll need your MediSens ID and PIN to sign in again.",
        fil: 'Kakailanganin mo ang iyong MediSens ID at PIN para makapag-sign in muli.',
    },
    'signOut.cancel': { en: 'Cancel', fil: 'Kanselahin' },
    'signOut.confirm': { en: 'Sign out', fil: 'Mag-sign Out' },

    // Common section/empty/error states
    'common.loading': { en: 'Loading…', fil: 'Naglo-load…' },
    'common.retry': { en: 'Try again', fil: 'Subukan Muli' },
    'common.loadError': { en: 'We could not load this right now.', fil: 'Hindi namin ma-load ito ngayon.' },
    'common.somethingWrong': { en: 'Something went wrong. Please try again.', fil: 'May nagkamali. Pakisubukan muli.' },
    'common.noData': { en: 'Nothing to show here yet.', fil: 'Wala pang laman dito.' },

    // Front door / sign in
    'signin.title': { en: 'Sign in to Patient Portal', fil: 'Mag-sign in sa Patient Portal' },
    'signin.medisensId': { en: 'MediSens ID', fil: 'MediSens ID' },
    'signin.pin': { en: 'PIN', fil: 'PIN' },
    'signin.submit': { en: 'Sign in', fil: 'Mag-sign In' },
    'signin.scanCard': { en: 'Scan my Patient Card', fil: 'I-scan ang Aking Patient Card' },
    'signin.forgotPin': { en: 'Forgot PIN?', fil: 'Nakalimutan ang PIN?' },
    'signin.setupAccount': { en: 'Set up my account', fil: 'I-set Up ang Aking Account' },

    // Recovery
    'recover.title': { en: 'Forgot PIN?', fil: 'Nakalimutan ang PIN?' },
    'recover.enterId': {
        en: "Enter your MediSens ID. If a phone number is on file with Malvar RHU, we'll send a verification code to it.",
        fil: 'Ilagay ang iyong MediSens ID. Kung may nakarehistrong numero sa Malvar RHU, magpapadala kami ng verification code dito.',
    },
    'recover.enterCode': { en: 'Enter your code', fil: 'Ilagay ang Iyong Code' },
    'recover.smsCode': { en: 'SMS code', fil: 'SMS Code' },
    'recover.newPin': { en: 'New 6-digit PIN', fil: 'Bagong 6-Digit na PIN' },
    'recover.confirmPin': { en: 'Confirm new PIN', fil: 'Kumpirmahin ang Bagong PIN' },
    'recover.pinHint': {
        en: 'Choose a PIN you can remember but other people cannot easily guess. RHU staff will never ask you for your PIN.',
        fil: 'Pumili ng PIN na madali mong maalala pero hindi madaling mahulaan ng iba. Hinding-hindi hihingin ng RHU staff ang iyong PIN.',
    },
    'recover.updatePin': { en: 'Update PIN', fil: 'I-update ang PIN' },
    'recover.done': { en: 'Your PIN has been updated.', fil: 'Na-update na ang iyong PIN.' },
    'recover.canSignIn': { en: 'You can now sign in with your MediSens ID and your new PIN.', fil: 'Maaari ka nang mag-sign in gamit ang iyong MediSens ID at bagong PIN.' },
    'recover.goToSignIn': { en: 'Go to sign in', fil: 'Pumunta sa Sign In' },
    'recover.back': { en: 'Back', fil: 'Bumalik' },
    'recover.continue': { en: 'Continue', fil: 'Magpatuloy' },
    'recover.backToSignIn': { en: 'Back to sign in', fil: 'Bumalik sa Sign In' },
    'recover.ackMessage': {
        en: 'If that MediSens ID has a phone number on file, a verification code was sent to it.',
        fil: 'Kung may nakarehistrong numero ang MediSens ID na iyan, may naipadala nang verification code dito.',
    },
    'recover.invalidId': { en: 'Please enter a valid MediSens ID, e.g. MS-AB23-CD45.', fil: 'Maglagay ng tamang MediSens ID, hal. MS-AB23-CD45.' },
    'recover.invalidOtp': { en: 'Please enter the 6-digit code sent to your phone.', fil: 'Ilagay ang 6-digit na code na ipinadala sa iyong telepono.' },
    'recover.invalidNewPin': { en: 'Your new PIN must be exactly 6 digits.', fil: 'Ang bagong PIN mo ay dapat eksaktong 6 na numero.' },
    'recover.pinMismatch': { en: 'The two PINs do not match.', fil: 'Hindi magkatugma ang dalawang PIN.' },

    // Activation
    'activation.title': { en: 'Set up my account', fil: 'I-set Up ang Aking Account' },
    'activation.useCode': { en: 'Use the activation code given to you by Malvar RHU.', fil: 'Gamitin ang activation code na ibinigay sa iyo ng Malvar RHU.' },
    'activation.code': { en: 'Activation code', fil: 'Activation Code' },
    'activation.ready': { en: 'Your MediSens Patient Account is ready.', fil: 'Handa na ang iyong MediSens Patient Account.' },
    'activation.invalidCode': { en: 'Please enter the 8-character activation code exactly as given to you.', fil: 'Ilagay ang 8-character na activation code eksakto sa ibinigay sa iyo.' },
    'activation.invalidOtp': { en: 'Please enter the 6-digit code sent to your phone.', fil: 'Ilagay ang 6-digit na code na ipinadala sa iyong telepono.' },
    'activation.invalidPin': { en: 'Your PIN must be exactly 6 digits.', fil: 'Ang iyong PIN ay dapat eksaktong 6 na numero.' },
    'activation.pinMismatch': { en: 'The two PINs do not match.', fil: 'Hindi magkatugma ang dalawang PIN.' },
    'activation.confirmPhone': { en: 'Confirm your phone', fil: 'Kumpirmahin ang Iyong Telepono' },
    'activation.otpSentDescription': { en: 'We sent a 6-digit code by SMS. Enter it below to continue.', fil: 'Nagpadala kami ng 6-digit na code sa pamamagitan ng SMS. Ilagay ito sa ibaba para magpatuloy.' },
    'activation.smsCode': { en: 'SMS code', fil: 'SMS Code' },
    'activation.back': { en: 'Back', fil: 'Bumalik' },
    'activation.createPin': { en: 'Create your PIN', fil: 'Gumawa ng Iyong PIN' },
    'activation.accountFor': { en: 'Account for', fil: 'Account para kay' },
    'activation.you': { en: 'You', fil: 'Ikaw' },
    'activation.accessTo': { en: 'Access to', fil: 'May Access sa' },
    'activation.healthRecordOf': { en: "{name}'s health record", fil: 'Health record ni {name}' },
    'activation.pinLabel': { en: '6-digit PIN', fil: '6-Digit na PIN' },
    'activation.confirmPinLabel': { en: 'Confirm PIN', fil: 'Kumpirmahin ang PIN' },
    'activation.pinHint': {
        en: 'Choose a PIN you can remember but other people cannot easily guess. RHU staff will never ask you for your PIN.',
        fil: 'Pumili ng PIN na madali mong maalala pero hindi madaling mahulaan ng iba. Hinding-hindi hihingin ng RHU staff ang iyong PIN.',
    },
    'activation.createAccount': { en: 'Create account', fil: 'Gumawa ng Account' },
    'activation.canSignInWithPrefix': { en: 'You can now sign in with your MediSens ID ', fil: 'Maaari ka nang mag-sign in gamit ang iyong MediSens ID ' },
    'activation.canSignInWithSuffix': { en: ' and the PIN you just created.', fil: ' at ang PIN na ginawa mo lang.' },
    'activation.relationshipSelf': { en: 'Patient', fil: 'Pasyente' },
    'activation.relationshipGuardian': { en: 'Parent / legal guardian', fil: 'Magulang / legal na guardian' },
    'activation.relationshipCaregiver': { en: 'Authorized caregiver', fil: 'Awtorisadong caregiver' },
    'common.connectionError': { en: 'Something went wrong. Please check your connection and try again.', fil: 'May nagkamali. Pakisuri ang iyong koneksyon at subukan muli.' },
    'more.comingSoon': { en: 'Coming soon', fil: 'Malapit Na' },

    // Front-door shell / sign-in screen (index.tsx PatientFrontDoor)
    'frontdoor.title': { en: 'MediSens Patient Portal', fil: 'MediSens Patient Portal' },
    'frontdoor.subtitle': { en: 'Access your health information from Malvar RHU.', fil: 'I-access ang iyong impormasyong pangkalusugan mula sa Malvar RHU.' },
    'frontdoor.scanCard': { en: 'Scan Patient Card', fil: 'I-scan ang Patient Card' },
    'frontdoor.pinLabel': { en: '6-digit PIN', fil: '6-Digit na PIN' },
    'frontdoor.pinPlaceholder': { en: 'Enter your PIN', fil: 'Ilagay ang iyong PIN' },
    'frontdoor.rememberId': { en: 'Remember my MediSens ID on this device', fil: 'Tandaan ang aking MediSens ID sa device na ito' },
    'frontdoor.signIn': { en: 'Sign in', fil: 'Mag-sign In' },
    'frontdoor.setupAccountHint': { en: 'Use the activation code given to you by Malvar RHU.', fil: 'Gamitin ang activation code na ibinigay sa iyo ng Malvar RHU.' },
    'frontdoor.invalidId': { en: 'Please enter a valid MediSens ID, e.g. MS-AB23-CD45.', fil: 'Maglagay ng tamang MediSens ID, hal. MS-AB23-CD45.' },
    'frontdoor.invalidPin': { en: 'Your PIN is 6 digits.', fil: 'Ang iyong PIN ay 6 na numero.' },
    'frontdoor.backToStaffLogin': { en: 'Back to Staff Login', fil: 'Bumalik sa Staff Login' },
    'frontdoor.loadingAccount': { en: 'Loading your account…', fil: 'Nilo-load ang iyong account…' },
    'frontdoor.couldNotLoadAccount': { en: "We couldn't load your account", fil: 'Hindi namin ma-load ang iyong account' },
    'frontdoor.loadAccountError': { en: 'Something went wrong loading your account. Please try again.', fil: 'May nagkamali sa pag-load ng iyong account. Pakisubukan muli.' },
    'frontdoor.signInFailed': { en: 'Something went wrong signing you in. Please try again.', fil: 'May nagkamali sa pag-sign in. Pakisubukan muli.' },
    'frontdoor.genericSignInError': { en: 'The MediSens ID or PIN was not recognized. Please try again.', fil: 'Hindi kilala ang MediSens ID o PIN na ito. Pakisubukan muli.' },
    'frontdoor.noAccessTitle': { en: 'You do not currently have access to any health record', fil: 'Wala ka pang access sa anumang health record' },
    'frontdoor.noAccessDescription': { en: 'If you believe this is a mistake, please visit the Rural Health Unit.', fil: 'Kung sa tingin mo ay may pagkakamali, bumisita sa Rural Health Unit.' },

    // QR scanner
    'qr.instruction': { en: 'Scan the QR code on your MediSens Patient Card.', fil: 'I-scan ang QR code sa iyong MediSens Patient Card.' },
    'qr.startScanning': { en: 'Start scanning', fil: 'Simulan ang Pag-scan' },
    'qr.startingCamera': { en: 'Starting camera…', fil: 'Sinisimulan ang camera…' },
    'qr.pointCamera': { en: 'Point your camera at the QR code.', fil: 'Itutok ang camera sa QR code.' },
    'qr.invalidQr': { en: "That QR code isn't a MediSens Patient Card.", fil: 'Ang QR code na iyan ay hindi isang MediSens Patient Card.' },
    'qr.tryAgain': { en: 'Try again', fil: 'Subukan Muli' },
    'qr.permissionDenied': { en: 'Camera access was not allowed.', fil: 'Hindi pinayagan ang access sa camera.' },
    'qr.canStillSignIn': { en: 'You can still sign in without the camera.', fil: 'Maaari ka pa ring mag-sign in nang walang camera.' },
    'qr.noCamera': { en: 'No camera was found on this device.', fil: 'Walang nahanap na camera sa device na ito.' },
    'qr.unsupported': { en: "Scanning isn't available on this browser.", fil: 'Hindi available ang pag-scan sa browser na ito.' },
    'qr.error': { en: "We couldn't start the camera. Please try again.", fil: 'Hindi namin masimulan ang camera. Pakisubukan muli.' },
    'qr.manualEntry': { en: "Can't scan? Enter your MediSens ID instead.", fil: 'Hindi ma-scan? Ilagay na lang ang iyong MediSens ID.' },

    // Home
    'home.loadError': { en: 'We could not load this Home summary right now.', fil: 'Hindi namin ma-load ang buod na ito ngayon.' },
    'home.nothingAttention': { en: 'Nothing needs your attention right now', fil: 'Walang kailangang pansinin sa ngayon' },
    'home.nothingAttentionDescription': { en: 'Visits, medicines, and lab results for this health record will appear here.', fil: 'Lalabas dito ang mga pagbisita, gamot, at resulta sa laboratoryo para sa health record na ito.' },
    'home.recommendedReturn': { en: 'Recommended return date: {date}', fil: 'Inirerekomendang petsa ng pagbalik: {date}' },
    'home.newLabResult': { en: 'A new lab result is available', fil: 'May bagong resulta sa laboratoryo' },
    'home.released': { en: 'Released {date}', fil: 'Inilabas noong {date}' },
    'home.newPrescription': { en: 'A new prescription is available', fil: 'May bagong reseta' },
    'home.prescribedOn': { en: 'Prescribed {date}', fil: 'Ineresetahan noong {date}' },
    'home.lastVisit': { en: 'Last visit: {date}', fil: 'Huling pagbisita: {date}' },
    'home.nothingElseAttention': { en: 'Nothing else needs your attention right now.', fil: 'Wala nang iba pang kailangang pansinin sa ngayon.' },

    // My Health tabs
    'health.tabsLabel': { en: 'My Health sections', fil: 'Mga seksyon ng Aking Kalusugan' },
    'health.visits': { en: 'Visits', fil: 'Mga Pagbisita' },
    'health.vaccinations': { en: 'Vaccinations', fil: 'Mga Bakuna' },
    'health.followups': { en: 'Follow-ups', fil: 'Mga Follow-up' },

    // Visits
    'visits.loadError': { en: 'We could not load these visits right now.', fil: 'Hindi namin ma-load ang mga pagbisitang ito ngayon.' },
    'visits.noneTitle': { en: 'No visits yet', fil: 'Wala pang pagbisita' },
    'visits.noneDescription': { en: 'Visits to the Rural Health Unit will appear here.', fil: 'Lalabas dito ang mga pagbisita sa Rural Health Unit.' },
    'visits.showMore': { en: 'Show more visits', fil: 'Ipakita pa ang mga pagbisita' },
    'visits.fallbackLabel': { en: 'Visit', fil: 'Pagbisita' },
    'visits.medicineCount': { en: '{count} medicine{plural}', fil: '{count} gamot' },
    'visits.labCount': { en: '{count} lab result{plural}', fil: '{count} resulta sa lab' },
    'visits.followUpChip': { en: 'Follow-up {date}', fil: 'Follow-up {date}' },
    'visits.backToVisits': { en: 'Back to visits', fil: 'Bumalik sa mga pagbisita' },
    'visits.loadDetailError': { en: 'We could not load this visit right now.', fil: 'Hindi namin ma-load ang pagbisitang ito ngayon.' },
    'visits.reasonForVisit': { en: 'Reason for visit', fil: 'Dahilan ng pagbisita' },
    'visits.diagnosis': { en: 'Diagnosis', fil: 'Diagnosis' },
    'visits.recommendation': { en: 'Healthcare provider recommendation', fil: 'Rekomendasyon ng healthcare provider' },
    'visits.medicinesPrescribed': { en: 'Medicines prescribed', fil: 'Mga naresetang gamot' },
    'visits.laboratory': { en: 'Laboratory', fil: 'Laboratoryo' },
    'visits.resultsAvailable': { en: '{count} result{plural} available', fil: '{count} resulta ang available' },
    'visits.followUp': { en: 'Follow-up', fil: 'Follow-up' },
    'visits.noFurtherDetails': { en: 'No further details were recorded for this visit.', fil: 'Walang karagdagang detalye na naitala para sa pagbisitang ito.' },
    'visits.facilityName': { en: 'Malvar Rural Health Unit', fil: 'Malvar Rural Health Unit' },

    // Vaccinations
    'vaccinations.loadError': { en: 'We could not load vaccinations right now.', fil: 'Hindi namin ma-load ang mga bakuna ngayon.' },
    'vaccinations.noneTitle': { en: 'No vaccination records yet', fil: 'Wala pang naitalang bakuna' },
    'vaccinations.noneDescription': { en: 'Vaccinations recorded at the Rural Health Unit will appear here.', fil: 'Lalabas dito ang mga bakunang naitala sa Rural Health Unit.' },
    'vaccinations.given': { en: 'Given {date}', fil: 'Binigay noong {date}' },
    'vaccinations.nextDose': { en: 'Next dose: {date}', fil: 'Susunod na dose: {date}' },

    // Follow-ups
    'followups.loadError': { en: 'We could not load follow-ups right now.', fil: 'Hindi namin ma-load ang mga follow-up ngayon.' },
    'followups.noneTitle': { en: 'No follow-ups recorded', fil: 'Walang naitalang follow-up' },
    'followups.noneDescription': { en: 'Recommended return dates from the healthcare provider will appear here.', fil: 'Lalabas dito ang mga inirerekomendang petsa ng pagbalik mula sa healthcare provider.' },
    'followups.disambiguation': {
        en: 'This is a recommended return date from the healthcare provider. It is not a booked appointment — you may visit the RHU on or near this date.',
        fil: 'Ito ay inirerekomendang petsa ng pagbalik mula sa healthcare provider. Hindi ito nakatakdang appointment — maaari kang bumisita sa RHU sa o malapit sa petsang ito.',
    },
    'followups.upcoming': { en: 'Upcoming', fil: 'Paparating' },
    'followups.past': { en: 'Past', fil: 'Nakaraan' },
    'followups.completed': { en: 'Completed', fil: 'Tapos na' },
    'followups.pastDue': { en: 'This return date has passed. Please visit the RHU.', fil: 'Lumipas na ang petsa ng pagbalik na ito. Bumisita sa RHU.' },

    // Medicines
    'medicines.loadError': { en: 'We could not load medicines right now.', fil: 'Hindi namin ma-load ang mga gamot ngayon.' },
    'medicines.noneTitle': { en: 'No prescriptions yet', fil: 'Wala pang reseta' },
    'medicines.noneDescription': { en: 'Medicines prescribed at the Rural Health Unit will appear here.', fil: 'Lalabas dito ang mga gamot na inireseta sa Rural Health Unit.' },
    'medicines.recent': { en: 'Recent', fil: 'Kamakailan' },
    'medicines.previous': { en: 'Previous', fil: 'Nakaraan' },
    'medicines.malformed': { en: 'This prescription could not be displayed. Please ask the RHU pharmacy for a printed copy.', fil: 'Hindi maipakita ang resetang ito. Humingi ng printed copy sa RHU pharmacy.' },
    'medicines.take': { en: 'Take', fil: 'Inumin/Gamitin' },
    'medicines.frequency': { en: 'Frequency', fil: 'Dalas' },
    'medicines.duration': { en: 'Duration', fil: 'Tagal' },
    'medicines.prescribedBy': { en: 'Prescribed by {name}', fil: 'Inereseta ni {name}' },
    'medicines.prescribed': { en: 'Prescribed', fil: 'Ineresetahan' },

    // Lab results
    'labs.loadError': { en: 'We could not load lab results right now.', fil: 'Hindi namin ma-load ang mga resulta sa laboratoryo ngayon.' },
    'labs.noneTitle': { en: 'No lab results yet', fil: 'Wala pang resulta sa laboratoryo' },
    'labs.noneDescription': { en: 'Laboratory results released by the Rural Health Unit will appear here.', fil: 'Lalabas dito ang mga resulta sa laboratoryo na inilabas ng Rural Health Unit.' },
    'labs.testDescriptorFallback': { en: 'A test', fil: 'Isang eksamin' },
    'labs.pendingWithDate': { en: '{descriptor} requested on {date} is not yet available.', fil: 'Ang {descriptor} na hiniling noong {date} ay hindi pa available.' },
    'labs.pendingNoDate': { en: '{descriptor} is not yet available.', fil: 'Ang {descriptor} ay hindi pa available.' },
    'labs.viewResult': { en: 'View result', fil: 'Tingnan ang Resulta' },
    'labs.backToResults': { en: 'Back to lab results', fil: 'Bumalik sa mga resulta sa laboratoryo' },
    'labs.loadDetailError': { en: 'We could not load this result right now.', fil: 'Hindi namin ma-load ang resultang ito ngayon.' },
    'labs.resultAvailableAskRhu': { en: 'Result available — please ask the RHU for a copy.', fil: 'May resulta na — humingi ng kopya sa RHU.' },
    'labs.referenceRange': { en: 'Reference range {range}', fil: 'Reference range {range}' },
    'labs.explainAtNextVisit': { en: 'The healthcare provider can explain what this result means during the next visit.', fil: 'Maipapaliwanag ng healthcare provider ang ibig sabihin ng resultang ito sa susunod na pagbisita.' },

    // Profile
    'profile.loadError': { en: 'We could not load this profile right now.', fil: 'Hindi namin ma-load ang profile na ito ngayon.' },
    'profile.askRhuToCorrect': { en: 'Ask the RHU to correct these', fil: 'Hilingin sa RHU na iwasto ang mga ito' },
    'profile.keptByRhu': {
        en: 'These details are kept by the Rural Health Unit. If something is wrong, request a correction below.',
        fil: 'Ang mga detalyeng ito ay hawak ng Rural Health Unit. Kung may mali, humiling ng pagwawasto sa ibaba.',
    },
    'profile.name': { en: 'Name', fil: 'Pangalan' },
    'profile.birthdate': { en: 'Birthdate', fil: 'Kaarawan' },
    'profile.age': { en: 'Age', fil: 'Edad' },
    'profile.sex': { en: 'Sex', fil: 'Kasarian' },
    'profile.civilStatus': { en: 'Civil status', fil: 'Katayuang Sibil' },
    'profile.address': { en: 'Address', fil: 'Address' },
    'profile.contactNumber': { en: 'Contact number', fil: 'Numero ng Contact' },
    'profile.philhealthNo': { en: 'PhilHealth number', fil: 'Numero ng PhilHealth' },
    'profile.philhealthStatus': { en: 'PhilHealth status', fil: 'Katayuan sa PhilHealth' },
    'profile.requestCorrection': { en: 'Request a correction', fil: 'Humiling ng Pagwawasto' },
    'profile.onlyPatientOrGuardian': { en: 'Only the patient or their guardian can request a correction to this record.', fil: 'Ang pasyente lamang o ang kanyang guardian ang maaaring humiling ng pagwawasto sa record na ito.' },
    'profile.recordedByRhu': { en: 'Recorded by the RHU', fil: 'Naitala ng RHU' },
    'profile.bloodType': { en: 'Blood type', fil: 'Uri ng Dugo' },
    'profile.keptByRhuShort': { en: 'This information is kept by the Rural Health Unit.', fil: 'Ang impormasyong ito ay hawak ng Rural Health Unit.' },

    // Correction request
    'correction.backToProfile': { en: 'Back to profile', fil: 'Bumalik sa Profile' },
    'correction.title': { en: 'Request a correction', fil: 'Humiling ng Pagwawasto' },
    'correction.description': {
        en: 'This sends a request to Rural Health Unit staff for review. Nothing on the health record changes until staff review and update it.',
        fil: "Ipapadala nito ang kahilingan sa Rural Health Unit staff para suriin. Walang magbabago sa health record hangga't hindi ito nasusuri at na-update ng staff.",
    },
    'correction.whatToCorrect': { en: 'What needs to be corrected?', fil: 'Ano ang kailangang iwasto?' },
    'correction.whatShouldItSay': { en: 'What should it say?', fil: 'Ano ang dapat nakalagay?' },
    'correction.correctValuePlaceholder': { en: 'The correct value', fil: 'Ang tamang value' },
    'correction.noteForStaff': { en: 'Note for RHU staff (optional)', fil: 'Tala para sa RHU staff (opsyonal)' },
    'correction.submit': { en: 'Submit request', fil: 'Isumite ang Kahilingan' },
    'correction.submitError': { en: 'We could not submit this request. Please try again.', fil: 'Hindi namin naisumite ang kahilingang ito. Pakisubukan muli.' },
    'correction.yourRequests': { en: 'Your requests', fil: 'Ang Iyong mga Kahilingan' },
    'correction.loadPastError': { en: 'We could not load past requests right now.', fil: 'Hindi namin ma-load ang mga nakaraang kahilingan ngayon.' },
    'correction.noneTitle': { en: 'No correction requests yet', fil: 'Wala pang kahilingan sa pagwawasto' },
    'correction.submittedOn': { en: 'Submitted {date}', fil: 'Isinumite noong {date}' },

    // Recent access
    'recentAccess.title': { en: 'Recent access to this record', fil: 'Kamakailang Access sa Record na Ito' },
    'recentAccess.loadError': { en: 'We could not load recent access right now.', fil: 'Hindi namin ma-load ang kamakailang access ngayon.' },
    'recentAccess.noneTitle': { en: 'No recent access recorded', fil: 'Walang naitalang kamakailang access' },
    'recentAccess.noneDescription': { en: 'Views of this health record through the Patient Portal will appear here.', fil: 'Lalabas dito ang mga panonood sa health record na ito sa pamamagitan ng Patient Portal.' },
    'recentAccess.showMore': { en: 'Show more', fil: 'Ipakita Pa' },

    // Access list
    'access.loadError': { en: 'We could not load this list right now.', fil: 'Hindi namin ma-load ang listahang ito ngayon.' },
    'access.noneTitle': { en: 'No one else has access to this health record', fil: 'Walang ibang may access sa health record na ito' },
    'access.onlyRhuCanAdd': { en: 'Only the Rural Health Unit can add someone here. Ask at the RHU counter.', fil: 'Ang Rural Health Unit lamang ang makakapagdagdag ng tao dito. Magtanong sa RHU counter.' },
    'access.removeError': { en: 'We could not remove this access right now. Please try again.', fil: 'Hindi namin maalis ang access na ito ngayon. Pakisubukan muli.' },
    'access.canView': { en: 'Can view this health record', fil: 'Maaaring tingnan ang health record na ito' },
    'access.grantedOn': { en: 'Access granted {date}', fil: 'Binigyan ng access noong {date}' },
    'access.guardianManagedByRhu': {
        en: 'Guardian access is set up and changed by the Rural Health Unit. Ask at the RHU counter to update this.',
        fil: 'Ang guardian access ay inaayos at binabago ng Rural Health Unit. Magtanong sa RHU counter para i-update ito.',
    },
    'access.removeAccess': { en: 'Remove access', fil: 'Alisin ang Access' },
    'access.confirmRemove': { en: "Remove this caregiver's access to this health record?", fil: 'Alisin ang access ng caregiver na ito sa health record na ito?' },
    'access.cancel': { en: 'Cancel', fil: 'Kanselahin' },

    // Privacy & Security
    'privacy.recentAccessHeading': { en: 'Recent access to this record', fil: 'Kamakailang Access sa Record na Ito' },
    'privacy.keepsInfoPrivate': {
        en: 'MediSens keeps your health information private and only shows it to accounts the Rural Health Unit has approved.',
        fil: 'Pinapanatili ng MediSens na pribado ang iyong impormasyong pangkalusugan at ipinapakita lang ito sa mga account na aprubado ng Rural Health Unit.',
    },
    'privacy.readFullPolicy': { en: 'Read the full privacy policy', fil: 'Basahin ang Buong Privacy Policy' },
    'privacy.changePin': { en: 'Change PIN', fil: 'Palitan ang PIN' },
    'privacy.currentPin': { en: 'Current PIN', fil: 'Kasalukuyang PIN' },
    'privacy.newPin': { en: 'New PIN (6+ digits)', fil: 'Bagong PIN (6+ na numero)' },
    'privacy.confirmNewPin': { en: 'Confirm new PIN', fil: 'Kumpirmahin ang Bagong PIN' },
    'privacy.pinMismatch': { en: 'The new PIN entries do not match.', fil: 'Hindi magkatugma ang bagong PIN na inilagay.' },
    'privacy.pinChangeGenericError': { en: 'We could not change your PIN right now.', fil: 'Hindi namin mapalitan ang iyong PIN ngayon.' },
    'privacy.pinChanged': { en: 'Your PIN has been changed.', fil: 'Napalitan na ang iyong PIN.' },

    // Notifications
    'notifications.title': { en: 'Notifications', fil: 'Mga Abiso' },
    'notifications.loadError': { en: 'We could not load this preference right now.', fil: 'Hindi namin ma-load ang preference na ito ngayon.' },
    'notifications.unavailable': { en: 'Notification preferences are not available for this account. Please visit the RHU if you have questions.', fil: 'Hindi available ang mga notification preference para sa account na ito. Bumisita sa RHU kung may tanong ka.' },
    'notifications.smsReminders': { en: 'SMS follow-up reminders', fil: 'SMS na Paalala sa Follow-up' },
    'notifications.smsRemindersDescription': { en: 'When on, the RHU may text a reminder ahead of a recommended follow-up date.', fil: 'Kapag naka-on, maaaring magpadala ang RHU ng paalala bago dumating ang inirerekomendang petsa ng follow-up.' },
    'notifications.saveError': { en: 'We could not save this preference. Please try again.', fil: 'Hindi namin nai-save ang preference na ito. Pakisubukan muli.' },

    // Text size & display
    'display.title': { en: 'Text size & display', fil: 'Laki ng Teksto at Display' },
    'display.comfortable': { en: 'Comfortable', fil: 'Normal' },
    'display.larger': { en: 'Larger Text', fil: 'Mas Malaking Teksto' },
    'display.higherContrast': { en: 'Higher contrast', fil: 'Mas Mataas na Contrast' },

    // Help & Support
    'help.rhuTitle': { en: 'Malvar Rural Health Unit', fil: 'Malvar Rural Health Unit' },
    'help.rhuDescription': {
        en: 'For anything the Patient Portal cannot help with -- activation, access changes, lost devices, or a PIN reset with no phone on file -- visit the RHU in person during regular clinic hours.',
        fil: 'Para sa anumang hindi kayang tulungan ng Patient Portal -- activation, pagbabago ng access, nawalang device, o pag-reset ng PIN na walang nakarehistrong numero -- bumisita sa RHU nang personal sa regular na oras ng klinika.',
    },
    'help.commonQuestions': { en: 'Common questions', fil: 'Mga Karaniwang Tanong' },
    'help.faq1.q': { en: 'How do I get access to a health record?', fil: 'Paano ako makaka-access sa isang health record?' },
    'help.faq1.a': {
        en: 'Only the Rural Health Unit can activate a Patient Portal account or add a guardian/caregiver to a health record. Visit the RHU counter to get started.',
        fil: 'Ang Rural Health Unit lang ang makaka-activate ng Patient Portal account o makakapagdagdag ng guardian/caregiver sa isang health record. Bumisita sa RHU counter para magsimula.',
    },
    'help.faq2.q': { en: 'I forgot my PIN. What do I do?', fil: 'Nakalimutan ko ang aking PIN. Ano ang gagawin ko?' },
    'help.faq2.a': {
        en: 'Sign out and choose "Forgot PIN" on the sign-in screen if you still have your registered phone number. If not, visit the RHU in person to reset it.',
        fil: 'Mag-sign out at piliin ang "Nakalimutan ang PIN" sa sign-in screen kung nasa iyo pa ang nakarehistrong numero mo. Kung wala, bumisita sa RHU nang personal para i-reset ito.',
    },
    'help.faq3.q': { en: 'Why can’t I see some information for this record?', fil: 'Bakit hindi ko makita ang ilang impormasyon para sa record na ito?' },
    'help.faq3.a': {
        en: 'Some caregiver and guardian accounts see a more limited view of a health record, by RHU policy. This is expected and does not mean information is missing.',
        fil: 'Ang ilang caregiver at guardian account ay may mas limitadong view ng health record, ayon sa patakaran ng RHU. Normal lang ito at hindi ibig sabihin ay may nawawalang impormasyon.',
    },
    'help.faq4.q': { en: 'How do I ask for a correction to my information?', fil: 'Paano ako hihiling ng pagwawasto sa aking impormasyon?' },
    'help.faq4.a': {
        en: 'Go to My Profile and choose "Request a correction." RHU staff review every request before anything on the health record changes.',
        fil: 'Pumunta sa Aking Profile at piliin ang "Humiling ng Pagwawasto." Sinusuri ng RHU staff ang bawat kahilingan bago magbago ang anumang bagay sa health record.',
    },
} satisfies Record<string, { en: string; fil: string }>;

type TranslateVars = Record<string, string | number>;

/** `{placeholder}` substitution only -- no pluralization/ICU engine, kept
 * deliberately simple since every interpolated value here is already a
 * formatted, patient-safe string (a date, a name, a count) rather than
 * something needing grammatical inflection. */
function interpolate(template: string, vars?: TranslateVars): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function translate(key: DictionaryKey, language: PatientLanguage, vars?: TranslateVars): string {
    const entry = DICTIONARY[key];
    if (!entry) return key;
    return interpolate(entry[language] ?? entry.en, vars);
}

interface PatientLanguageContextValue {
    language: PatientLanguage;
    t: (key: DictionaryKey, vars?: TranslateVars) => string;
}

const PatientLanguageContext = createContext<PatientLanguageContextValue>({
    language: 'en',
    t: (key, vars) => translate(key, 'en', vars),
});

export function PatientLanguageProvider({ language, children }: { language: PatientLanguage; children: ReactNode }) {
    const value = useMemo<PatientLanguageContextValue>(
        () => ({ language, t: (key, vars) => translate(key, language, vars) }),
        [language],
    );
    return <PatientLanguageContext.Provider value={value}>{children}</PatientLanguageContext.Provider>;
}

/** Returns { t, language } for any Patient Portal component. `t(key)`
 * looks up interface copy only -- never call it with a patient name,
 * MediSens ID, medication, lab test, or diagnosis string. Pass `vars` for
 * a string with `{placeholder}` tokens, e.g. `t('home.released', { date })`. */
export function useT() {
    return useContext(PatientLanguageContext);
}
