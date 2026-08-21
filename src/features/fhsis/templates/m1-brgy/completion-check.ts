import { deriveDeclaredTotal } from './calculations';
import { M1_BRGY_V1, assertM1BrgyTemplate } from './v1';

function expect(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

/**
 * Executable Phase 1 gate: validates configuration integrity and representative
 * source layouts without importing a UI or legacy module.
 */
export function verifyM1BrgyPhaseOneCompletionGate(): void {
    assertM1BrgyTemplate();
    expect(M1_BRGY_V1.source.length === 7, 'All seven approved M1 BRGY source pages are required.');
    const layouts = new Map(M1_BRGY_V1.layouts.map(layout => [layout.key, layout]));
    expect(layouts.size === 5, 'Expected the five source-derived layouts.');
    expect(layouts.get('fp-method')?.columnGroups.length === 6, 'Family-planning columns must retain all six source groups.');
    expect(layouts.get('age-wra-total')?.columnGroups[0]?.dimensions.length === 4, 'Age-group rows must retain three bands and Total.');
    expect(layouts.get('sex-total')?.columnGroups[0]?.dimensions.length === 3, 'Sex rows must retain Male, Female, and Total.');
    expect(layouts.get('age-0-9-to-60-sex-total')?.columnGroups[0]?.dimensions.length === 9, 'Mental-health rows must retain every age-by-sex dimension.');
    expect(layouts.get('simple-total')?.columnGroups[0]?.dimensions.length === 1, 'Environmental/cancer rows must retain their simple total dimension.');
    expect(M1_BRGY_V1.sections.some(section => section.key === 'family-planning-services-for-women-of-reproductive-age'), 'Family-planning section is missing.');
    expect(M1_BRGY_V1.sections.some(section => section.key === 'non-communicable-diseases'), 'NCD section is missing.');

    const rule = M1_BRGY_V1.derivedTotalRules.find(item => item.key === 'intrapartum-delivery-type-total');
    expect(rule, 'Printed delivery-type relationship is missing.');
    const completed = deriveDeclaredTotal(rule, {
        'intrapartum-type-1': { total: 2 },
        'intrapartum-type-2': { total: 3 },
        'intrapartum-type-3': { total: 4 },
    });
    expect(completed.isComplete && completed.value === 9, 'Declared totals must sum only complete source values.');

    const incomplete = deriveDeclaredTotal(rule, {
        'intrapartum-type-1': { total: 0 },
        'intrapartum-type-2': { total: null },
        'intrapartum-type-3': { total: 4 },
    });
    expect(!incomplete.isComplete && incomplete.value === null, 'Blank and explicit zero must remain distinct.');
}

verifyM1BrgyPhaseOneCompletionGate();
