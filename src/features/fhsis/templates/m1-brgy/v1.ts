import type {
    FhsisDerivedTotalRule,
    FhsisIndicator,
    FhsisLayout,
    FhsisSection,
    FhsisSubgroup,
    FhsisTemplate,
} from './types';

const manual = (key: string, label: string) => ({ key, label, inputMode: 'manual' as const });
const derived = (key: string, label: string) => ({ key, label, inputMode: 'derived' as const });

const layouts: readonly FhsisLayout[] = [
    {
        key: 'simple-total', label: 'Total and remarks', supportsRemarks: true,
        columnGroups: [{ label: '', dimensions: [manual('total', 'Total')] }],
    },
    {
        key: 'sex-total', label: 'Sex, total and remarks', supportsRemarks: true,
        columnGroups: [{ label: 'Sex', dimensions: [manual('male', 'Male'), manual('female', 'Female'), derived('total', 'Total')] }],
    },
    {
        key: 'age-wra-total', label: 'Age group, total and remarks', supportsRemarks: true,
        columnGroups: [{ label: 'Age Group', dimensions: [manual('age_10_14', '10-14'), manual('age_15_19', '15-19'), manual('age_20_49', '20-49'), derived('total', 'Total')] }],
    },
    {
        key: 'age-0-9-to-60-sex-total', label: 'Age groups by sex, total and remarks', supportsRemarks: true,
        columnGroups: [{ label: 'Age Groups (in years)', dimensions: [manual('age_0_9_male', '0-9 Male'), manual('age_0_9_female', '0-9 Female'), manual('age_10_19_male', '10-19 Male'), manual('age_10_19_female', '10-19 Female'), manual('age_20_59_male', '20-59 Male'), manual('age_20_59_female', '20-59 Female'), manual('age_60_plus_male', '60 and above Male'), manual('age_60_plus_female', '60 and above Female'), derived('total', 'Total')] }],
    },
    {
        key: 'fp-method', label: 'Family-planning method status by age group', supportsRemarks: false,
        columnGroups: [
            { label: 'Current Users (Beginning of the Month)', dimensions: [manual('begin_10_14', '10-14'), manual('begin_15_19', '15-19'), manual('begin_20_49', '20-49'), derived('begin_total', 'TOTAL')] },
            { label: 'New Acceptors (Present Month)', dimensions: [manual('new_10_14', '10-14'), manual('new_15_19', '15-19'), manual('new_20_49', '20-49'), derived('new_total', 'TOTAL')] },
            { label: 'Other Acceptors (Present Month)', dimensions: [manual('other_10_14', '10-14'), manual('other_15_19', '15-19'), manual('other_20_49', '20-49'), derived('other_total', 'TOTAL')] },
            { label: 'Drop-outs (Present Month)', dimensions: [manual('dropout_10_14', '10-14'), manual('dropout_15_19', '15-19'), manual('dropout_20_49', '20-49'), derived('dropout_total', 'TOTAL')] },
            { label: 'Current User (End of the Month)', dimensions: [manual('end_10_14', '10-14'), manual('end_15_19', '15-19'), manual('end_20_49', '20-49'), derived('end_total', 'TOTAL')] },
            { label: 'New Acceptors (Present Month)', dimensions: [manual('new_acceptor_10_14', '10-14'), manual('new_acceptor_15_19', '15-19'), manual('new_acceptor_20_49', '20-49'), derived('new_acceptor_total', 'TOTAL')] },
        ],
    },
];

const createRows = (sourcePage: number, layoutKey: string, labels: readonly string[], subgroup?: string): readonly FhsisIndicator[] =>
    labels.map((label, index) => ({
        key: `${subgroup ?? 'row'}-${String(index + 1).padStart(2, '0')}`,
        label,
        order: index + 1,
        layoutKey,
        sourcePage,
        subgroup,
        required: true,
        zeroIsExplicitValue: true,
    }));

const subgroup = (key: string, label: string, order: number, indicators: readonly FhsisIndicator[]): FhsisSubgroup => ({ key, label, order, indicators });

const familyPlanningMethods = createRows(1, 'fp-method', [
    '1. BTL', '2. NSV', '3. Condom', '4. Pills', 'a. Pills-POP', 'b. Pills-COC', '5. Injectables (DMPA)',
    '6. Implant', 'a. Implants-Interval', 'b. Implants-PP', '7. IUD', 'a. IUD-Interval', 'b. IUD-PP',
    '8. NFP-LAM', '9. NFP-BBT', '10. NFP-CMM', '11. NFP-STM', '12. NFP-SDM', 'Total Current Users',
], 'modern-fp-methods');

const maternalPrenatal = subgroup('prenatal-care-services', 'PRENATAL CARE SERVICES', 1, [
    { key: 'maternal-8anc', label: '1. 8ANC', order: 1, layoutKey: 'age-wra-total', sourcePage: 1, subgroup: 'prenatal-care-services', required: true, zeroIsExplicitValue: true },
    { key: 'maternal-8anc-delivered', label: '1a. No. of Women who delivered and completed at least 8ANC (=a1+a2)', order: 2, layoutKey: 'age-wra-total', sourcePage: 1, subgroup: 'prenatal-care-services', required: true, zeroIsExplicitValue: true, derivedTotalRuleKeys: ['maternal-8anc-delivered-total'] },
    { key: 'maternal-8anc-delivered-resident', label: 'a1. No. of women who delivered and provided 1st to 8th ANC on schedule (Resident)', order: 3, layoutKey: 'age-wra-total', sourcePage: 1, subgroup: 'prenatal-care-services', required: true, zeroIsExplicitValue: true },
    { key: 'maternal-8anc-delivered-trans-in', label: 'a2. No. of Women who delivered and completed at least 8ANC TRANS-IN from other LGUs', order: 4, layoutKey: 'age-wra-total', sourcePage: 1, subgroup: 'prenatal-care-services', required: true, zeroIsExplicitValue: true },
    { key: 'maternal-8anc-tracked', label: '1b. No. of Women who delivered and who were tracked during pregnancy (=b1+b2)', order: 5, layoutKey: 'age-wra-total', sourcePage: 1, subgroup: 'prenatal-care-services', required: true, zeroIsExplicitValue: true, derivedTotalRuleKeys: ['maternal-8anc-tracked-total'] },
    ...createRows(1, 'age-wra-total', ['b1. No. of women who delivered and who were tracked during pregnancy (Resident)', 'b2. No. of TRANS-IN from other LGUs', 'b3. No. of TRANS-OUT (with MOV) before completing 8ANC', '2. No. of pregnant women assessed for nutritional status during the first trimester', '2a. Normal BMI', '2b. Low BMI', '2c. High BMI'], 'prenatal-care-services').map((row, index) => ({ ...row, key: `maternal-prenatal-${index + 1}`, order: index + 6 })),
]);

const maternalSupport = subgroup('prenatal-support-and-screening', 'PRENATAL CARE SERVICES', 2, createRows(1, 'age-wra-total', [
    '4. Prenatal Supplementation', '4a. Number of pregnant women who completed the dose of Iron with Folic Acid supplementation', '4b. No. of pregnant women who completed the dose Multiple Micronutrient Supplementation', '4c. No. of pregnant women who completed the dose of Calcium carbonate', '5. Anemia Screening', '5a. No. of pregnant women screened for Anemia', '5b. No. of pregnant women diagnosed with Anemia', '6. Gestational Diabetes Mellitus', '6a. No. of pregnant women screened for Gestational Diabetes Mellitus', '6b. No. of pregnant women tested positive for Gestational Diabetes Mellitus', '7. Deworming', '5a. No. of pregnant women given one dose of deworming tablet', '3. Tetanus diphtheria (Td) Containing Vaccination Status', '3a. Number of women pregnant for the first time given at least 1 dose of Tetanus diphtheria (Td) vaccination (Td1)', '3b. Number of Pregnant Women for the 2nd or more times given at least 3 doses of Td vaccination (Td2 Plus)', '8. BP measurement', '8a. No. of pregnant women who had their BP measured during each of their antenatal care visit', '8b. No. of pregnant women identified with high BP or danger signs', '8b2. No. of pregnant women with high BP or danger signs who were referred to a higher-level facility',
], 'prenatal-support-and-screening'));

const intrapartum = subgroup('intrapartum-and-newborn-care', 'INTRAPARTUM AND NEWBORN CARE', 3, [
    ...createRows(2, 'age-wra-total', ['1. Total Deliveries'], 'intrapartum-and-newborn-care'),
    { key: 'intrapartum-skilled-deliveries', label: '2. No. of deliveries attended by Skilled Health Professionals (SHP) (=2a+2b+2c)', order: 2, layoutKey: 'age-wra-total', sourcePage: 2, subgroup: 'intrapartum-and-newborn-care', required: true, zeroIsExplicitValue: true, derivedTotalRuleKeys: ['intrapartum-skilled-deliveries-total'] },
    ...createRows(2, 'age-wra-total', ['2a. Physicians', '2b. Nurses', '2c. Midwives'], 'intrapartum-and-newborn-care').map((row, index) => ({ ...row, key: `intrapartum-skilled-${index + 1}`, order: index + 3 })),
    { key: 'intrapartum-facility-deliveries', label: '3. No. of Facility Based Deliveries (FBD) (=3a+3b)', order: 6, layoutKey: 'age-wra-total', sourcePage: 2, subgroup: 'intrapartum-and-newborn-care', required: true, zeroIsExplicitValue: true, derivedTotalRuleKeys: ['intrapartum-fbd-total'] },
    ...createRows(2, 'age-wra-total', ['3a. Public facility', '3b. Private facility'], 'intrapartum-and-newborn-care').map((row, index) => ({ ...row, key: `intrapartum-fbd-${index + 1}`, order: index + 7 })),
    { key: 'intrapartum-delivery-type', label: '4. Delivery by Type (=4a+4b+4c)', order: 9, layoutKey: 'age-wra-total', sourcePage: 2, subgroup: 'intrapartum-and-newborn-care', required: true, zeroIsExplicitValue: true, derivedTotalRuleKeys: ['intrapartum-delivery-type-total'] },
    ...createRows(2, 'age-wra-total', ['4a. No. of Vaginal deliveries', '4b. No. of Cesarean Section', '4c. No. of Combined Vaginal-Cesarean deliveries'], 'intrapartum-and-newborn-care').map((row, index) => ({ ...row, key: `intrapartum-type-${index + 1}`, order: index + 10 })),
    { key: 'intrapartum-delivery-outcome', label: '5. Delivery by Outcome (=5a+5b+5c)', order: 13, layoutKey: 'age-wra-total', sourcePage: 2, subgroup: 'intrapartum-and-newborn-care', required: true, zeroIsExplicitValue: true, derivedTotalRuleKeys: ['intrapartum-delivery-outcome-total'] },
    ...createRows(2, 'age-wra-total', ['5a. No. of Full-Term deliveries', '5b. No. of Pre-Term deliveries', '5c. No. of Fetal deaths', '5d. No. of abortion/miscarriage (counts only)'], 'intrapartum-and-newborn-care').map((row, index) => ({ ...row, key: `intrapartum-outcome-${index + 1}`, order: index + 14 })),
    { key: 'intrapartum-livebirths-weight', label: '6. No. of Livebirths by birth weight (=6a+6b+6c)', order: 18, layoutKey: 'sex-total', sourcePage: 2, subgroup: 'intrapartum-and-newborn-care', required: true, zeroIsExplicitValue: true, derivedTotalRuleKeys: ['intrapartum-livebirths-weight-total'] },
    ...createRows(2, 'sex-total', ['6a. Normal birth weight', '6b. Low birth weight', '6d. Unknown birth weight'], 'intrapartum-and-newborn-care').map((row, index) => ({ ...row, key: `intrapartum-weight-${index + 1}`, order: index + 19 })),
]);

const postpartum = subgroup('postpartum-care', 'POSTPARTUM CARE', 4, [
    { key: 'postpartum-4pnc', label: '1. 4PNC', order: 1, layoutKey: 'age-wra-total', sourcePage: 2, subgroup: 'postpartum-care', required: true, zeroIsExplicitValue: true },
    { key: 'postpartum-4pnc-completed', label: '1a. Total No. of women who delivered and completed at least 4PNC (=a1+a2)', order: 2, layoutKey: 'age-wra-total', sourcePage: 2, subgroup: 'postpartum-care', required: true, zeroIsExplicitValue: true, derivedTotalRuleKeys: ['postpartum-4pnc-completed-total'] },
    ...createRows(2, 'age-wra-total', ['a1. No. of women who delivered and provided 1st to 4th PNC on schedule (Resident)', 'a2. No. of women who delivered and completed at least 4PNC TRANS-IN from other LGUs'], 'postpartum-care').map((row, index) => ({ ...row, key: `postpartum-completed-${index + 1}`, order: index + 3 })),
    { key: 'postpartum-pnc-due', label: '1b. Total No. of women due for PNC (=b1+b2)', order: 5, layoutKey: 'age-wra-total', sourcePage: 2, subgroup: 'postpartum-care', required: true, zeroIsExplicitValue: true, derivedTotalRuleKeys: ['postpartum-pnc-due-total'] },
    ...createRows(2, 'age-wra-total', ['b1. No. of women due for PNC (Resident)', 'b2. No. of TRANS-IN from other LGUs due for PNC', 'b3. No. of TRANS-OUT (with MOV) before completing 4PNC', '2. Postpartum Supplementation', '2a. Number of postpartum women who completed the dose of Iron with Folic Acid supplementation', '2b. Number of postpartum women who completed the dose of Vitamin A supplementation', '2. BP measurement', '8a. No. of postpartum women who had their BP measured during each of their antenatal care visit', '8b. No. of postpartum women identified with high BP or danger signs who were referred to a higher-level facility'], 'postpartum-care').map((row, index) => ({ ...row, key: `postpartum-${index + 1}`, order: index + 6 })),
]);

const childImmunization = subgroup('immunization', 'IMMUNIZATION', 1, [
    ...createRows(2, 'sex-total', ['A.1. Immunization Services (0-11 months old current year)', '1. Children Protected at Birth (CPAB)', '2. BCG (within 24 hours)', '3. BCG (more than 24 hours to 11 months and 29 days)', '4. Hep B antigen within 24 hrs', '5. Hep B antigen more than 24 hrs up to 14 days', '6. DPT-Hib-HepB 1', '7. DPT-Hib-HepB 2', '8. DPT-Hib-HepB 3', '9. OPV 1', '10. OPV 2', '11. OPV 3', '12. IPV 1', '13. IPV 2', '14. PCV 1', '15. PCV 2', '16. PCV 3', '17. MMR 1'], 'immunization').map((row, index) => ({ ...row, key: `child-current-${index + 1}`, order: index + 1 })),
    ...createRows(2, 'sex-total', ['A.2. Immunization Services (0-11 months of previous year)', '1. DPT-Hib-HepB 1', '2. DPT-Hib-HepB 2', '3. DPT-Hib-HepB 3', '4. OPV 1', '5. OPV 2', '6. OPV 3', '7. IPV 1', '8. IPV 2', '9. PCV 1', '10. PCV 2', '11. PCV 3', '12. MMR 1', '13. MMR 2 (Given at 12months and 29days)', '14. MMR 2 (Given at 13-23months)', '15. FIC', '16. CIC'], 'immunization').map((row, index) => ({ ...row, key: `child-previous-${index + 1}`, order: index + 19 })),
    ...createRows(3, 'sex-total', ['A.3. School and Community-Based Immunization', '1. Grade 1 learners given Td', '2. Grade 1 learners given MR', '3. Grade 7 learners given Td', '4. Grade 7 learners given MR', '5. HPV 1 (SBI)', '6. HPV 1 (CBI)', '7. HPV 2 (CBI)'], 'immunization').map((row, index) => ({ ...row, key: `child-school-${index + 1}`, order: index + 36 })),
]);

const childNutrition = subgroup('nutrition', 'NUTRITION', 2, createRows(3, 'sex-total', [
    '1. Newborns who were initiated on breastfeeding within 1 hour after birth', '2. Infants born with low birth weight (LBW) given complete Iron supplementation', '3a. Infants aged 6-11 months old who received 1 dose of Vitamin A supplementation', '3b. Children aged 12-59 months old who completed 2 doses of Vitamin A Supplementation', '4a. Infants aged 6-11 months old who completed routine MNP supplementation', '4b. Children aged 12-23 months old who completed routine MNP supplementation', '5a. Infants aged 6-11 months old who completed routine LNS-SQ supplementation', '5b. Children aged 12-23 months old who completed routine LNS-SQ supplementation', '6. Children 0-59 months old SEEN during the reporting period at health facilities', '6a. Identified MAM', '6b. Identified SAM', '7. MAM enrolled to SFP', '7a. Cured', '7b. Non-cured', '7c. Defaulted', '7d. Died', '8. SAM without complication admitted to OTC', '8a. Cured', '8b. Non-cured', '8c. Defaulted', '8d. Died',
], 'nutrition'));

const childSick = subgroup('management-of-sick', 'MANAGEMENT OF SICK', 3, createRows(3, 'sex-total', [
    '1. Sick infants aged 6-11 months old seen', '1a. Sick infants aged 6-11 months old who received Vitamin A capsule aside from routine supplementation', '2. Sick infants aged 12-59 months old seen', '2a. Sick infants aged 12-59 months old who received Vitamin A capsule aside from routine supplementation', '3. Acute diarrhea cases 0-59 months old seen', '3a. 0-59 months old with acute diarrhea who received ORS only', '3b. 0-59 months old with acute diarrhea who received ORS and Zinc drops/syrup', '4. Pneumonia cases 0-59 months old seen', '4a. 0-59 months old with pneumonia who received antibiotic treatment', 'a. Amoxicillin drops suspension', 'b. Amoxicillin-clavulanate suspension', 'c. Cefuroxime suspension', 'd. Other antibiotics',
], 'management-of-sick'));

const oralHealth = subgroup('oral-health-care-services', 'FIRST VISIT TO AN ORAL HEALTH CARE PROFESSIONAL', 1, createRows(3, 'sex-total', [
    '1. Infants 0-11 months old who had their first dental visit', '1. Children 1-4 years old who had their 1st visit to an oral health care professional within a year', '1a. Children 1-4 years old who had their 1st visit to a facility-based oral health care professional within a year', '1b. Children 1-4 years old who had their 1st visit to a non-facility-based oral health care professional within a year', '2. Children 5-9 years old who had their 1st visit to an oral health care professional within a year', '2a. Children 5-9 years old who had their 1st visit to a facility-based oral health care professional within a year', '2b. Children 5-9 years old who had their 1st visit to a non-facility-based oral health care professional within a year', '3. Adolescents 10-19 years old who had their 1st visit to an oral health care professional within a year', '3a. Adolescents 10-19 years old who had their 1st visit to a facility-based oral health care professional within a year', '3b. Adolescents 10-19 years old who had their 1st visit to a non-facility-based oral health care professional within a year', '4. Adults 20-59 years old who had their 1st visit to an oral health care professional within a year', '4a. Adults 20-59 years old who had their 1st visit to a facility-based oral health care professional within a year', '4b. Adults 20-59 years old who had their 1st visit to a non-facility-based oral health care professional within a year', '5. Senior Citizens 60 years old and above who had their 1st visit to an oral health care professional within a year', '5a. Senior Citizens 60 years old and above who had their 1st visit to a facility-based oral health care professional within a year', '5b. Senior Citizens 60 years old and above who had their 1st visit to a non-facility-based oral health care professional within a year', '6. Pregnant Women who had their 1st visit to an oral health care professional within a year', '6a. Pregnant Women who had their 1st visit to a facility-based oral health care professional within a year', '6b. Pregnant Women who had their 1st visit to a non-facility-based oral health care professional within a year',
], 'oral-health-care-services'));

const oralHealthCompleted = subgroup('oral-health-completed-visits', 'COMPLETED VISITS TO AN ORAL HEALTH CARE PROFESSIONAL', 2, createRows(4, 'sex-total', [
    '1. Children 1-4 years old who completed 2 visits to an oral health care professional within a year', '1a. Children 1-4 years old who completed 2 visits to a facility-based oral health care professional within a year', '1b. Children 1-4 years old who completed 2 visits to a non-facility-based oral health care professional within a year', '2. Children 5-9 years old who completed 2 visits to an oral health care professional within a year', '2a. Children 5-9 years old who completed 2 visits to a facility-based oral health care professional within a year', '2b. Children 5-9 years old who completed 2 visits to a non-facility-based oral health care professional within a year', '3. Adolescents 10-19 years old who completed 2 visits to an oral health care professional within a year', '3a. Adolescents 10-19 years old who completed 2 visits to a facility-based oral health care professional within a year', '3b. Adolescents 10-19 years old who completed 2 visits to a non-facility-based oral health care professional within a year', '4. Adults 20-59 years old who completed 2 visits to an oral health care professional within a year', '4a. Adults 20-59 years old who completed 2 visits to a facility-based oral health care professional within a year', '4b. Adults 20-59 years old who completed 2 visits to a non-facility-based oral health care professional within a year', '5. Senior Citizens 60 years old and above who completed 2 visits to an oral health care professional within a year', '5a. Senior Citizens 60 years old and above who completed 2 visits to a facility-based oral health care professional within a year', '5b. Senior Citizens 60 years old and above who completed 2 visits to a non-facility-based oral health care professional within a year', '6. Pregnant Women who completed 2 visits to an oral health care professional within a year', '6a. Pregnant Women who completed 2 visits to a facility-based oral health care professional within a year', '6b. Pregnant Women who completed 2 visits to a non-facility-based oral health care professional within a year',
], 'oral-health-completed-visits'));

const ncdLifestyle = subgroup('lifestyle-related', 'E1. Lifestyle Related', 1, createRows(4, 'sex-total', [
    '1. Adults 20-59 years old who were risk assessed using the PhilPEN protocol', '1a. Current Smokers', 'a. Tobacco Products', 'b. Vaporized Nicotine Products', 'c. Both', '1b. Provided Brief Tobacco Intervention', '1c. Binge Drinker', '1d. Insufficient physical activities', '1e. Consumed unhealthy diet', '1f. Overweight', '1g. Obese', '2. Senior Citizens 60 years old and above who were risk assessed using the PhilPEN protocol', '2a. Current Smokers', 'a. Tobacco Products', 'b. Vaporized Nicotine Products', 'c. Both', '2b. Provided Brief Tobacco Intervention', '2c. Binge Drinker', '2d. Insufficient physical activities', '2e. Consumed unhealthy diet', '2f. Overweight', '2g. Obese',
], 'lifestyle-related'));

const ncdCardiovascular = subgroup('cardiovascular-disease-prevention-and-control', 'E2. Cardiovascular Disease Prevention and Control', 2, createRows(5, 'sex-total', [
    'The total number of identified adult (20-59 years old) hypertensives (Sum of January to Previous Month)', 'The total number of identified adult (20-59 years old) hypertensives in the current month', '1. Adults 20-59 years old who were identified as hypertensive using the PhilPEN protocol', '2. Hypertensives 20-59 years old provided with antihypertensive medications', '2a. Provided by facility (100%)', '2b. Out of pocket', '2c. Both', 'The total number of identified SCs (60 years old and above) hypertensives (Sum of January to Previous Month)', 'The total number of identified SCs (60 years old and above) hypertensives in the current month', '3. Senior Citizens 60 years old and above who were identified as hypertensive using the PhilPEN protocol', '4. Hypertensives 60 years old and above provided with antihypertensive medications', '4a. Provided by facility (100%)', '4b. Out of pocket', '4c. Both',
], 'cardiovascular-disease-prevention-and-control'));

const ncdDiabetes = subgroup('diabetes-mellitus-prevention-and-control', 'E3. Diabetes Mellitus Prevention and Control', 3, createRows(5, 'sex-total', [
    'The total number of identified adult (20-59 years old) with Type II Diabetes (Sum of January to Previous Month)', 'The total number of identified adult (20-59 years old) with Type II Diabetes in the current month', '1. Adults 20-59 years old who were identified with Type II Diabetes using the PhilPEN protocol', '2. Type II Diabetics 20-59 years old provided with antidiabetic medications', '2a. Provided by facility (100%)', '2b. Out of pocket', '2c. Both', 'The total number of identified SCs (60 years old and above) with Type II Diabetes (Sum of January to Previous Month)', 'The total number of identified SCs (60 years old and above) with Type II Diabetes in the current month', '3. Senior Citizens 60 years old and above who were identified with Type II Diabetes using the PhilPEN protocol', '4. Type II Diabetics 60 years old and above provided with antidiabetic medications', '4a. Provided by facility (100%)', '4b. Out of pocket', '4c. Both',
], 'diabetes-mellitus-prevention-and-control'));

const ncdBlindness = subgroup('blindness-prevention-program', 'E4. Blindness Prevention Program', 4, createRows(5, 'sex-total', [
    '1. Screened for eye disease/s', '1a. 0-9 years old screened for eye disease/s', '1b. 10-19 years old screened for eye disease/s', '1c. 20-59 years old screened for eye disease/s', '1d. 60 years old and above screened for eye disease/s', '2. Screened and identified with eye disease/s', '2a. 0-9 years old screened and identified with at least one eye ailment', '2a1. Changes in vision', '2a2. Changes in appearance', '2a3. Eye and orbital injury', '2a4. Routine eye exams', '2b. 10-19 years old screened and identified with at least one eye ailment', '2b1. Changes in vision', '2b2. Changes in appearance', '2b3. Eye and orbital injury', '2b4. Routine eye exams', '2c. 20-59 years old screened and identified with eye disease/s', '2c1. Identified with at least one eye ailment', '2c2. Changes in vision', '2c3. Changes in appearance', '2c4. Eye and orbital injury', '2c5. Routine eye exams', '2d1. Changes in vision', '2d2. Changes in appearance', '2d3. Eye and orbital injury', '2d4. Routine eye exams', '3. Identified with eye disease/s and referred to an eye health professional', '3a. 0-9 years old identified with eye disease/s and referred to an eye health professional', '3b. 10-19 years old identified with eye disease/s and referred to an eye health professional', '3c. 20-59 years old identified with eye disease/s and referred to an eye health professional', '3d. Senior Citizens identified with eye disease/s and referred to an eye health professional',
], 'blindness-prevention-program'));

const ncdSenior = subgroup('immunization-for-senior-citizens', 'E5. Immunization for Senior Citizens', 5, createRows(5, 'sex-total', [
    '1. Senior Citizens Seen who had not previously received PPV upon reaching 60 years old', '2. Senior citizens aged 60 years old and above who received one (1) dose of Pneumococcal Polysaccharide Vaccine', '3. Senior Citizens aged 60 years old and above who received one (1) dose of Influenza Vaccine', '4. Senior Citizens aged 60 years old and above who received one (1) dose of Influenza Vaccine',
], 'immunization-for-senior-citizens'));

const ncdGeriatric = subgroup('geriatric-screening', 'E6. Geriatric Screening', 6, createRows(5, 'sex-total', [
    'a. Senior Citizens screened using the geriatric screening tool', 'b. Senior Citizens with a positive geriatric screening result', 'b1. Memory',
], 'geriatric-screening'));

const ncdMentalHealth = subgroup('mental-health-gap', 'E7. Mental Health Gap Action Programme (mhGAP)', 7, createRows(6, 'age-0-9-to-60-sex-total', [
    '1. Individuals with mental health concern screened using the Mental Health Gap Action Programme (mhGAP)', 'b2. Depression', 'b3. Polypharmacy', 'b4. Urinary Incontinence', 'b5. Functional Capacity', 'b6. Fall (History and Screening Test)', 'b7. Malnutrition', 'b8. Hearing', 'b9. Vision', 'c. Referred to Appropriate Specialist or Service Providers',
], 'mental-health-gap'));

const cancerCervical = subgroup('cervical-cancer-prevention-and-control-services', 'E8. Cervical Cancer Prevention and Control Services', 8, createRows(6, 'simple-total', [
    '1. Women aged 30-65 years old screened or assessed for cervical cancer', '1a. VIA', '2a. PapSmear', '3a. HPV DNA', '4a. Assessed Only', '2. Women aged 30-65 years old found suspicious for cervical cancer', '3. Women aged 30-65 years old found suspicious for cervical cancer and linked to care', '3a. Treated', '3b. Referred', '4. Women aged 30-65 years old found positive for precancerous lesions', '5. Women aged 30-65 years old found positive for precancerous lesions and linked to care', '5a. Treated', '5b. Referred',
], 'cervical-cancer-prevention-and-control-services'));

const cancerBreast = subgroup('breast-cancer-prevention-and-control-services', 'E9. Breast Cancer Prevention and Control Services', 9, createRows(6, 'simple-total', [
    '1. Number of 30-69 years old women seen', '2. Number of high-risk or symptomatic women', '3. High-risk or symptomatic women aged 30-69 years old provided with Breast Cancer Early Detection Services', '3a. Clinical Breast Examination', '3b. Mammogram', '4. High-risk or symptomatic women aged 30-69 years old found with remarkable or significant results', '4a. Clinical Breast Examination', '4b. Mammogram', '5. High-risk or symptomatic women aged 30-69 years old found with remarkable results and linked to care', '5a. Clinical Breast Examination', '5b. Mammogram', '6. Asymptomatic women aged 50-69 years old screened for breast cancer', '6a. Clinical Breast Examination', '6b. Mammogram', '7. Asymptomatic women aged 50-69 years old screened for breast cancer and found with remarkable or significant results', '7a. Clinical Breast Examination', '7b. Mammogram', '8. Asymptomatic women aged 50-69 years old screened for breast cancer and found with remarkable or significant results and linked to care',
], 'breast-cancer-prevention-and-control-services'));

const environmentalWater = subgroup('water', 'G1. Water', 1, createRows(6, 'simple-total', ['1. Households (HHs) with access to improved water supply - Total', '1a. HH with Level I', '1b. HH with Level II', '1c. HH with Level III', '2. HH using safely managed drinking water service'], 'water'));
const environmentalSanitation = subgroup('sanitation', 'G1. Sanitation', 2, createRows(6, 'simple-total', ['1. HH with basic sanitation facility - Total', '1a. HH with pour/flush toilet connected to a septic tank', '1b. HHs with pour/flush toilet connected to community sewer/sewerage system or any other approved treatment system', '1c. HH with Ventilated Improved Pit (VIP) Latrine', '2. HH using safely managed sanitation service'], 'sanitation'));

const communicableDisease = subgroup('communicable-disease', 'COMMUNICABLE DISEASES', 1, createRows(7, 'sex-total', [
    '5. Confirmed STH Cases by age group', '5a. 1-4 years old', '5b. 5-14 years old', '5c. 15-19 years old', '5d. 20-59 years old', '5e. 60 years old and above', '11. 5-14 years old who were dewormed during July MDA', '11a. School-Based deworming services', '11b. Community Based services', '12. 15-19 yrs old who were dewormed during January/July MDA', '12a. No. of adolescents (15-19 yrs old) who were dewormed during January MDA', '12b. No. of adolescents (15-19 yrs old) who were dewormed during July MDA',
], 'communicable-disease'));

const leprosy = subgroup('leprosy', 'E. Leprosy', 2, createRows(7, 'sex-total', [
    '1. No. of Leprosy Cases on treatment', '1a. 0-14 years old', '1b. 15-18 years old', '1c. 19 years old and above', '2. No. of newly detected case', '2a. 0-14 years old', '2b. 15-18 years old', '2c. 19 years old and above', '3. Confirmed Leprosy Cases', '3a. 0-14 years old', '3b. 15-18 years old', '3c. 19 years old and above', '4. Completed fixed duration Multi-Drug Therapy (MDT)', '4a. 0-14 years old', '4b. 15-18 years old', '4c. 19 years old and above', '5. No. of confirmed leprosy cases treated', '5a. 0-14 years old', '5b. 15-18 years old', '5c. 19 years old and above', '6. Newly Detected Cases with Grade 2 Disabilities', '6a. 0-14 years old', '6b. 15-18 years old', '6c. 19 years old and above',
], 'leprosy'));

const hivAidsSti = subgroup('hiv-aids-sti', 'F. HIV-AIDS/STI', 3, createRows(7, 'sex-total', [
    '1. Pregnant women screened for syphilis - Total', '1a. 10-14 years old', '1b. 15-19 years old', '1c. 20-49 years old', '2. Pregnant women screened reactive for syphilis - Total', '2a. 10-14 years old', '2b. 15-19 years old', '2c. 20-49 years old', '3. Pregnant women treated for syphilis - Total', '3a. 10-14 years old', '3b. 15-19 years old', '3c. 20-49 years old', '4. Pregnant women screened for HIV - Total', '4a. 10-14 years old', '4b. 15-19 years old', '4c. 20-49 years old', '5. Pregnant women screened reactive for HIV - Total', '5a. 10-14 years old', '5b. 15-19 years old', '5c. 20-49 years old', '6. Pregnant women screened for Hepatitis B - Total', '6a. 10-14 years old', '6b. 15-19 years old', '6c. 20-49 years old', '7. Pregnant women screened reactive for Hepatitis B - Total', '7a. 10-14 years old', '7b. 15-19 years old', '7c. 20-49 years old',
], 'hiv-aids-sti'));

const vitalMortality = subgroup('mortality', 'Part I. Mortality', 1, createRows(7, 'age-wra-total', ['1. Maternal Mortality - Total', 'a. Direct', 'a1. Resident', 'a2. Non-Resident'], 'mortality'));
const vitalNatality = subgroup('natality', 'Part II. Natality', 2, createRows(7, 'sex-total', ['1. Live births (Total)', '1a. Resident', '1b. Non-resident', '2. Adolescent Birth'], 'natality'));

const derivedTotalRules: readonly FhsisDerivedTotalRule[] = [
    { key: 'maternal-8anc-delivered-total', formulaLabel: '=a1+a2', targetIndicatorKey: 'maternal-8anc-delivered', targetDimensionKey: 'total', sourceIndicatorKeys: ['maternal-prenatal-1', 'maternal-prenatal-2'], sourceDimensionKey: 'total' },
    { key: 'maternal-8anc-tracked-total', formulaLabel: '=b1+b2', targetIndicatorKey: 'maternal-8anc-tracked', targetDimensionKey: 'total', sourceIndicatorKeys: ['maternal-prenatal-3', 'maternal-prenatal-4'], sourceDimensionKey: 'total' },
    { key: 'intrapartum-skilled-deliveries-total', formulaLabel: '=2a+2b+2c', targetIndicatorKey: 'intrapartum-skilled-deliveries', targetDimensionKey: 'total', sourceIndicatorKeys: ['intrapartum-skilled-1', 'intrapartum-skilled-2', 'intrapartum-skilled-3'], sourceDimensionKey: 'total' },
    { key: 'intrapartum-fbd-total', formulaLabel: '=3a+3b', targetIndicatorKey: 'intrapartum-facility-deliveries', targetDimensionKey: 'total', sourceIndicatorKeys: ['intrapartum-fbd-1', 'intrapartum-fbd-2'], sourceDimensionKey: 'total' },
    { key: 'intrapartum-delivery-type-total', formulaLabel: '=4a+4b+4c', targetIndicatorKey: 'intrapartum-delivery-type', targetDimensionKey: 'total', sourceIndicatorKeys: ['intrapartum-type-1', 'intrapartum-type-2', 'intrapartum-type-3'], sourceDimensionKey: 'total' },
    { key: 'intrapartum-delivery-outcome-total', formulaLabel: '=5a+5b+5c', targetIndicatorKey: 'intrapartum-delivery-outcome', targetDimensionKey: 'total', sourceIndicatorKeys: ['intrapartum-outcome-1', 'intrapartum-outcome-2', 'intrapartum-outcome-3'], sourceDimensionKey: 'total' },
    { key: 'intrapartum-livebirths-weight-total', formulaLabel: '=6a+6b+6c', targetIndicatorKey: 'intrapartum-livebirths-weight', targetDimensionKey: 'total', sourceIndicatorKeys: ['intrapartum-weight-1', 'intrapartum-weight-2', 'intrapartum-weight-3'], sourceDimensionKey: 'total' },
    { key: 'postpartum-4pnc-completed-total', formulaLabel: '=a1+a2', targetIndicatorKey: 'postpartum-4pnc-completed', targetDimensionKey: 'total', sourceIndicatorKeys: ['postpartum-completed-1', 'postpartum-completed-2'], sourceDimensionKey: 'total' },
    { key: 'postpartum-pnc-due-total', formulaLabel: '=b1+b2', targetIndicatorKey: 'postpartum-pnc-due', targetDimensionKey: 'total', sourceIndicatorKeys: ['postpartum-1', 'postpartum-2'], sourceDimensionKey: 'total' },
];

const sections: readonly FhsisSection[] = [
    { key: 'family-planning-services-for-women-of-reproductive-age', label: 'SECTION A. FAMILY PLANNING SERVICES FOR WOMEN OF REPRODUCTIVE AGE', order: 1, subgroups: [
        subgroup('demand-satisfied', 'Demand Satisfied', 1, createRows(1, 'age-wra-total', ['1. No. of women of reproductive age (WRA) 15-49 years old who have demand for Family Planning (FP) and currently using, or whose partner is currently using, any modern FP methods'], 'demand-satisfied')),
        subgroup('modern-fp-methods', 'Modern FP Methods', 2, familyPlanningMethods),
    ] },
    { key: 'maternal-care-and-services', label: 'SECTION B. MATERNAL CARE AND SERVICES', order: 2, subgroups: [maternalPrenatal, maternalSupport, intrapartum, postpartum] },
    { key: 'child-care-and-services', label: 'SECTION C. CHILD CARE AND SERVICES', order: 3, subgroups: [childImmunization, childNutrition, childSick] },
    { key: 'oral-health-care-services', label: 'SECTION D. ORAL HEALTH CARE SERVICES', order: 4, subgroups: [oralHealth, oralHealthCompleted] },
    { key: 'non-communicable-diseases', label: 'SECTION E. NON-COMMUNICABLE DISEASES', order: 5, subgroups: [ncdLifestyle, ncdCardiovascular, ncdDiabetes, ncdBlindness, ncdSenior, ncdGeriatric, ncdMentalHealth, cancerCervical, cancerBreast] },
    { key: 'environmental-health-and-sanitation', label: 'SECTION F. ENVIRONMENTAL HEALTH AND SANITATION', order: 6, subgroups: [environmentalWater, environmentalSanitation] },
    { key: 'communicable-diseases-and-vital-statistics', label: 'COMMUNICABLE DISEASES AND VITAL STATISTICS', order: 7, subgroups: [communicableDisease, leprosy, hivAidsSti, vitalMortality, vitalNatality] },
];

export const M1_BRGY_V1: FhsisTemplate = {
    key: 'm1-brgy',
    version: 'v1',
    title: 'M1 BRGY',
    source: ['docs/FHSIS/IMG_9233.JPG', 'docs/FHSIS/IMG_9234.JPG', 'docs/FHSIS/IMG_9235.JPG', 'docs/FHSIS/IMG_9236.JPG', 'docs/FHSIS/IMG_9237.JPG', 'docs/FHSIS/IMG_9238.JPG', 'docs/FHSIS/IMG_9239.JPG'],
    reportMetadata: [
        { key: 'report_month', label: 'FHSIS REPORT for the Month', order: 1 }, { key: 'report_year', label: 'Year', order: 2 }, { key: 'barangay_name', label: 'Name of Barangay', order: 3 }, { key: 'bhs_name', label: 'Name of BHS', order: 4 }, { key: 'municipality_city_name', label: 'Name of Municipality/City', order: 5 }, { key: 'province_name', label: 'Name of Province', order: 6 }, { key: 'projected_population', label: 'Projected Population of the Year', order: 7 },
    ],
    layouts,
    sections,
    derivedTotalRules,
};

/** Throws when the static source transcription is internally inconsistent. */
export function assertM1BrgyTemplate(template: FhsisTemplate = M1_BRGY_V1): void {
    const layoutKeys = new Set(template.layouts.map(layout => layout.key));
    const indicatorKeys = new Set<string>();
    for (const section of template.sections) for (const group of section.subgroups) for (const indicator of group.indicators) {
        if (!layoutKeys.has(indicator.layoutKey)) throw new Error(`Unknown M1 BRGY layout: ${indicator.layoutKey}`);
        if (indicatorKeys.has(indicator.key)) throw new Error(`Duplicate M1 BRGY indicator key: ${indicator.key}`);
        indicatorKeys.add(indicator.key);
    }
    for (const rule of template.derivedTotalRules) {
        if (!indicatorKeys.has(rule.targetIndicatorKey) || rule.sourceIndicatorKeys.some(key => !indicatorKeys.has(key))) {
            throw new Error(`M1 BRGY formula references an unknown indicator: ${rule.key}`);
        }
    }
}

assertM1BrgyTemplate();
