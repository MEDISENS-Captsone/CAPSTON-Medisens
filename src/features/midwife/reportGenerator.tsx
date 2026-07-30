import React, { useState, useMemo, useRef } from 'react';
import { useToast } from '../../components/feedback/Toast';
import { logAuditEvent } from '../audit/services';

interface Props {
    records: any[];
    isLoading?: boolean;
}

const MALVAR_BARANGAYS = [
    'Bagong Pook', 'Bilucao', 'Bulihan', 'Luta del Norte', 'Luta del Sur', 
    'Poblacion', 'San Andres', 'San Fernando', 'San Gregorio', 'San Isidro East', 
    'San Juan', 'San Pedro I', 'San Pedro II', 'San Pioquinto', 'Santiago', 'TOTAL'
];

const ReportGenerator = ({ records, isLoading = false }: Props) => {
    const [selectedReport, setSelectedReport] = useState('maternal');
    const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7));
    const [isExporting, setIsExporting] = useState(false);
    const { showToast, ToastComponent } = useToast();
    
    const reportRef = useRef<HTMLDivElement>(null);

    const monthlyLogs = useMemo(() => {
        return records.filter(r => r.report_month === reportMonth);
    }, [records, reportMonth]);

    // ─── AGGREGATION HELPERS ────────────────────────────────────────────────
    
    const getMaternalData = (barangay: string) => {
        const brgyLogs = barangay === 'TOTAL' 
            ? monthlyLogs.filter(r => r.category === 'maternal')
            : monthlyLogs.filter(r => r.category === 'maternal' && r.address?.includes(barangay));
            
        const countByAge = (logs: any[], min: number, max: number) => logs.filter(l => Number(l.data_fields.patient_age) >= min && Number(l.data_fields.patient_age) <= max).length;
        const fourVisits = brgyLogs.filter(r => r.data_fields.prenatal_visit === '3rd Trimester - Visit 2');
        const firstTriNormal = brgyLogs.filter(r => r.data_fields.prenatal_visit === '1st Trimester' && r.data_fields.bmi_status === 'Normal');

        return {
            four_10_14: countByAge(fourVisits, 10, 14), four_15_19: countByAge(fourVisits, 15, 19), four_20_49: countByAge(fourVisits, 20, 49), four_total: fourVisits.length,
            norm_10_14: countByAge(firstTriNormal, 10, 14), norm_15_19: countByAge(firstTriNormal, 15, 19), norm_20_49: countByAge(firstTriNormal, 20, 49), norm_total: firstTriNormal.length
        };
    };

    const getChildData = (barangay: string) => {
        const brgyLogs = barangay === 'TOTAL'
            ? monthlyLogs.filter(r => r.category === 'child')
            : monthlyLogs.filter(r => r.category === 'child' && r.address?.includes(barangay));
            
        const getSexCount = (logs: any[], sexFilter: 'Male' | 'Female') => logs.filter(l => l.data_fields.patient_sex === sexFilter).length;
        const cpabLogs = brgyLogs.filter(r => r.data_fields.cpab === 'Yes');
        const bcg0_28 = brgyLogs.filter(r => r.data_fields.bcg_age_category === '0 to 28 days old');
        const bcg29_1yr = brgyLogs.filter(r => r.data_fields.bcg_age_category === '29 days to 1 year old');

        return {
            cpab_m: getSexCount(cpabLogs, 'Male'), cpab_f: getSexCount(cpabLogs, 'Female'), cpab_t: cpabLogs.length,
            bcg0_m: getSexCount(bcg0_28, 'Male'), bcg0_f: getSexCount(bcg0_28, 'Female'), bcg0_t: bcg0_28.length,
            bcg29_m: getSexCount(bcg29_1yr, 'Male'), bcg29_f: getSexCount(bcg29_1yr, 'Female'), bcg29_t: bcg29_1yr.length,
        };
    };

    const getDentalData = (barangay: string) => {
        const brgyLogs = barangay === 'TOTAL'
            ? monthlyLogs.filter(r => r.category === 'dental' && r.data_fields.received_bohc)
            : monthlyLogs.filter(r => r.category === 'dental' && r.address?.includes(barangay) && r.data_fields.received_bohc);
            
        const getCount = (bracket: string, sex: string) => brgyLogs.filter(l => l.data_fields.dental_age_bracket === bracket && l.data_fields.patient_sex === sex).length;

        return {
            a10_m: getCount('10-14', 'Male'), a10_f: getCount('10-14', 'Female'), a10_t: getCount('10-14', 'Male') + getCount('10-14', 'Female'),
            a15_m: getCount('15-19', 'Male'), a15_f: getCount('15-19', 'Female'), a15_t: getCount('15-19', 'Male') + getCount('15-19', 'Female'),
            a20_m: getCount('20-59', 'Male'), a20_f: getCount('20-59', 'Female'), a20_t: getCount('20-59', 'Male') + getCount('20-59', 'Female'),
        };
    };

    const getFPData = (barangay: string) => {
        const brgyLogs = barangay === 'TOTAL'
            ? monthlyLogs.filter(r => r.category === 'family_planning')
            : monthlyLogs.filter(r => r.category === 'family_planning' && r.address?.includes(barangay));

        const getCounts = (method: string) => {
            const mLogs = brgyLogs.filter(l => l.data_fields.fp_method === method);
            return {
                a10: mLogs.filter(l => l.data_fields.fp_age_bracket === '10-14').length,
                a15: mLogs.filter(l => l.data_fields.fp_age_bracket === '15-19').length,
                a20: mLogs.filter(l => l.data_fields.fp_age_bracket === '20-49').length,
                t: mLogs.length
            };
        };

        return {
            total: brgyLogs.length,
            btl: getCounts('BTL'), nsv: getCounts('NSV'), condom: getCounts('Condom'),
            pills: getCounts('Pills'), iud: getCounts('IUD'), inject: getCounts('Injectables'), implant: getCounts('Implant')
        };
    };

    const getNCDData = (barangay: string) => {
        const brgyLogs = barangay === 'TOTAL'
            ? monthlyLogs.filter(r => r.category === 'ncd')
            : monthlyLogs.filter(r => r.category === 'ncd' && r.address?.includes(barangay));
            
        const getCount = (field: string, condition: any, sex: string) => brgyLogs.filter(l => l.data_fields[field] === condition && l.data_fields.patient_sex === sex).length;

        return {
            phil_m: getCount('philpen', true, 'Male'), phil_f: getCount('philpen', true, 'Female'), phil_t: getCount('philpen', true, 'Male') + getCount('philpen', true, 'Female'),
            vis_m: getCount('visual_acuity', true, 'Male'), vis_f: getCount('visual_acuity', true, 'Female'), vis_t: getCount('visual_acuity', true, 'Male') + getCount('visual_acuity', true, 'Female'),
            eye_m: getCount('eye_disease', 'Yes', 'Male'), eye_f: getCount('eye_disease', 'Yes', 'Female'), eye_t: getCount('eye_disease', 'Yes', 'Male') + getCount('eye_disease', 'Yes', 'Female'),
            ppv_m: getCount('ppv', true, 'Male'), ppv_f: getCount('ppv', true, 'Female'), ppv_t: getCount('ppv', true, 'Male') + getCount('ppv', true, 'Female'),
            flu_m: getCount('influenza', true, 'Male'), flu_f: getCount('influenza', true, 'Female'), flu_t: getCount('influenza', true, 'Male') + getCount('influenza', true, 'Female'),
        };
    };

    const getLRData = (barangay: string) => {
        const brgyLogs = barangay === 'TOTAL'
            ? monthlyLogs.filter(r => r.category === 'rabies_leprosy')
            : monthlyLogs.filter(r => r.category === 'rabies_leprosy' && r.address?.includes(barangay));
            
        const getCount = (filterFn: (l:any) => boolean, sex: string) => brgyLogs.filter(l => filterFn(l) && l.data_fields.patient_sex === sex).length;

        return {
            tx_m: getCount(l => l.data_fields.leprosy_status === 'On Treatment', 'Male'), tx_f: getCount(l => l.data_fields.leprosy_status === 'On Treatment', 'Female'), tx_t: getCount(l => l.data_fields.leprosy_status === 'On Treatment', 'Male') + getCount(l => l.data_fields.leprosy_status === 'On Treatment', 'Female'),
            new_m: getCount(l => l.data_fields.leprosy_status === 'Newly Detected Case', 'Male'), new_f: getCount(l => l.data_fields.leprosy_status === 'Newly Detected Case', 'Female'), new_t: getCount(l => l.data_fields.leprosy_status === 'Newly Detected Case', 'Male') + getCount(l => l.data_fields.leprosy_status === 'Newly Detected Case', 'Female'),
            bite_m: getCount(l => l.data_fields.animal_bite === true, 'Male'), bite_f: getCount(l => l.data_fields.animal_bite === true, 'Female'), bite_t: getCount(l => l.data_fields.animal_bite === true, 'Male') + getCount(l => l.data_fields.animal_bite === true, 'Female'),
            death_m: getCount(l => l.data_fields.rabies_outcome === 'Death due to Rabies', 'Male'), death_f: getCount(l => l.data_fields.rabies_outcome === 'Death due to Rabies', 'Female'), death_t: getCount(l => l.data_fields.rabies_outcome === 'Death due to Rabies', 'Male') + getCount(l => l.data_fields.rabies_outcome === 'Death due to Rabies', 'Female'),
        };
    };

    // ─── PDF EXPORT LOGIC ───────────────────────────────────────────────────
    const handleExportPDF = async () => {
        if (isLoading) {
            showToast('Reports are still loading. Please wait before exporting.', true);
            return;
        }
        if (!reportRef.current) return;
        setIsExporting(true);

        try {
            const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                import('html2canvas'),
                import('jspdf'),
            ]);
            const canvas = await html2canvas(reportRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('l', 'in', [8.5, 13]);
            const pdfWidth = 13; 
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`FHSIS_${selectedReport.toUpperCase()}_${reportMonth}.pdf`);
            void logAuditEvent({
                action: 'generate',
                module: 'Reports',
                recordId: `${selectedReport}-${reportMonth}`,
                recordType: 'report',
                description: 'Generated FHSIS report PDF.',
                metadata: {
                    category: selectedReport,
                    count: monthlyLogs.length,
                },
            });
        } catch (error) {
            console.error("Error generating PDF:", error);
            showToast('Unable to generate the FHSIS PDF. Please try again.', true);
        } finally {
            setIsExporting(false);
        }
    };

    const getReportTitle = () => {
        const map: any = {
            'maternal': 'Maternal Care Program', 'child': 'Child Care Program', 'dental': 'Dental Health Program',
            'fp': 'Family Planning', 'ncd': 'Non-Communicable Disease Prevention and Control Services', 'rabies_leprosy': 'Leprosy and Rabies Prevention and Control Program'
        };
        return map[selectedReport];
    };

    return (
        <div className="w-full mx-auto  pb-10 px-4">
            <ToastComponent />
            {/* CONTROLS */}
            <div className="flex flex-col gap-4 mb-6 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm print:hidden md:flex-row md:items-end">
                <div className="flex-1">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">FHSIS Report Type</label>
                    <select value={selectedReport} onChange={(e) => setSelectedReport(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--focus-color)] focus:ring-2 focus:ring-[var(--focus-ring)]">
                        <option value="maternal">Maternal Care Program</option>
                        <option value="child">Child Care Program</option>
                        <option value="dental">Dental Health Program</option>
                        <option value="fp">Family Planning</option>
                        <option value="ncd">NCD & Seniors</option>
                        <option value="rabies_leprosy">Leprosy & Rabies</option>
                    </select>
                </div>
                <div className="w-full md:w-48">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">Reporting Month</label>
                    <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--focus-color)] focus:ring-2 focus:ring-[var(--focus-ring)]"/>
                </div>
                <div className="flex">
                    <button type="button" onClick={handleExportPDF} disabled={isExporting || isLoading} className="w-full rounded-lg bg-[var(--brand-active)] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--brand-active-hover)] disabled:opacity-70">
                        {isExporting ? 'Preparing PDF...' : isLoading ? 'Loading FHSIS records...' : 'Export FHSIS PDF'}
                    </button>
                </div>
            </div>

            {isLoading && (
                <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm font-semibold text-[var(--text-2)] print:hidden">
                    Loading FHSIS records...
                </div>
            )}

            {/* DOH DOCUMENT RENDER AREA */}
                <div className="flex flex-col items-start overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3 print:border-0 print:bg-white print:p-0 md:p-6">
            {/* Added w-max and h-fit so the paper strictly hugs the table dimensions */}
                <div ref={reportRef} className={`bg-white p-10 shadow-sm font-sans text-black w-max h-fit print:shadow-none ${selectedReport === 'fp' ? 'min-w-[1550px] pl-20 ml-0' : 'min-w-[1100px] mx-auto'}`}>
                    
                    {/* DOH Header */}
                    <div className="text-center mb-6">
                        <h1 className="text-[11px] font-bold uppercase tracking-widest">Republic of the Philippines</h1>
                        <h2 className="text-sm font-black uppercase tracking-widest">Department of Health</h2>
                        <h3 className="text-lg font-black uppercase mt-1">{getReportTitle()}</h3>
                        <p className="text-[11px] font-bold mt-1 uppercase">MALVAR, BATANGAS</p>
                        <p className="text-[11px] uppercase">Reporting Period: {new Date(reportMonth + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
                    </div>

                    {/* MATERNAL CARE */}
                    {selectedReport === 'maternal' && (
                        <table className="w-full text-[10px] border-collapse border-2 border-black text-center">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th rowSpan={2} className="border border-black p-1 text-left uppercase w-32">Area</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-16">Total No. of Deliveries</th>
                                    <th colSpan={5} className="border border-black p-1 uppercase">Pregnant women with at least 4 Prenatal check-ups</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-16">Eligible Population Under 1 yr</th>
                                    <th colSpan={5} className="border border-black p-1 uppercase">Pregnant women seen in 1st trimester who have normal BMI</th>
                                </tr>
                                <tr className="bg-slate-50">
                                    <th className="border border-black p-1">10-14</th><th className="border border-black p-1">15-19</th><th className="border border-black p-1">20-49</th><th className="border border-black p-1">T</th><th className="border border-black p-1">%</th>
                                    <th className="border border-black p-1">10-14</th><th className="border border-black p-1">15-19</th><th className="border border-black p-1">20-49</th><th className="border border-black p-1">T</th><th className="border border-black p-1">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {MALVAR_BARANGAYS.map((brgy, idx) => {
                                    const d = getMaternalData(brgy);
                                    const isTotal = brgy === 'TOTAL';
                                    return (
                                        <tr key={idx} className={isTotal ? 'font-bold bg-slate-100' : ''}>
                                            <td className="border border-black p-1 text-left">{brgy}</td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.four_10_14||'0'}</td><td className="border border-black p-1">{d.four_15_19||'0'}</td><td className="border border-black p-1">{d.four_20_49||'0'}</td><td className="border border-black p-1 font-bold">{d.four_total||'0'}</td><td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.norm_10_14||'0'}</td><td className="border border-black p-1">{d.norm_15_19||'0'}</td><td className="border border-black p-1">{d.norm_20_49||'0'}</td><td className="border border-black p-1 font-bold">{d.norm_total||'0'}</td><td className="border border-black p-1"></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* CHILD CARE */}
                    {selectedReport === 'child' && (
                        <table className="w-full text-[10px] border-collapse border-2 border-black text-center">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th rowSpan={3} className="border border-black p-1 text-left uppercase w-32">Area</th>
                                    <th rowSpan={3} className="border border-black p-1 uppercase w-12">Elig. Pop. 0-11 mos</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Child Protected at Birth</th>
                                    <th rowSpan={3} className="border border-black p-1 uppercase w-12">Elig. Pop. 0-12 mos</th>
                                    <th colSpan={7} className="border border-black p-1 uppercase">No. of 0-12 months old infants who received BCG</th>
                                </tr>
                                <tr className="bg-slate-50">
                                    <th rowSpan={2} className="border border-black p-1">M</th><th rowSpan={2} className="border border-black p-1">F</th><th rowSpan={2} className="border border-black p-1">T</th><th rowSpan={2} className="border border-black p-1">%</th>
                                    <th colSpan={3} className="border border-black p-1 uppercase">0 to 28 days old</th>
                                    <th colSpan={3} className="border border-black p-1 uppercase">29 days to 1 year old</th>
                                    <th rowSpan={2} className="border border-black p-1">%</th>
                                </tr>
                                <tr className="bg-slate-50">
                                    <th className="border border-black p-1">M</th><th className="border border-black p-1">F</th><th className="border border-black p-1">T</th>
                                    <th className="border border-black p-1">M</th><th className="border border-black p-1">F</th><th className="border border-black p-1">T</th>
                                </tr>
                            </thead>
                            <tbody>
                                {MALVAR_BARANGAYS.map((brgy, idx) => {
                                    const d = getChildData(brgy);
                                    const isTotal = brgy === 'TOTAL';
                                    return (
                                        <tr key={idx} className={isTotal ? 'font-bold bg-slate-100' : ''}>
                                            <td className="border border-black p-1 text-left">{brgy}</td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.cpab_m||'0'}</td><td className="border border-black p-1">{d.cpab_f||'0'}</td><td className="border border-black p-1">{d.cpab_t||'0'}</td><td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.bcg0_m||'0'}</td><td className="border border-black p-1">{d.bcg0_f||'0'}</td><td className="border border-black p-1 font-bold">{d.bcg0_t||'0'}</td>
                                            <td className="border border-black p-1">{d.bcg29_m||'0'}</td><td className="border border-black p-1">{d.bcg29_f||'0'}</td><td className="border border-black p-1 font-bold">{d.bcg29_t||'0'}</td><td className="border border-black p-1"></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* DENTAL HEALTH */}
                    {selectedReport === 'dental' && (
                        <table className="w-full text-[10px] border-collapse border-2 border-black text-center">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th rowSpan={2} className="border border-black p-1 text-left uppercase w-32">Area</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-12">Elig. Pop.</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Adolescents 10-14 yrs old who received BOHC</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-12">Elig. Pop.</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Adolescents 15-19 yrs old who received BOHC</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-12">Elig. Pop.</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Adults 20-59 yrs old who received BOHC</th>
                                </tr>
                                <tr className="bg-slate-50">
                                    <th className="border border-black p-1 w-6">M</th><th className="border border-black p-1 w-6">F</th><th className="border border-black p-1 w-6">T</th><th className="border border-black p-1 w-6">%</th>
                                    <th className="border border-black p-1 w-6">M</th><th className="border border-black p-1 w-6">F</th><th className="border border-black p-1 w-6">T</th><th className="border border-black p-1 w-6">%</th>
                                    <th className="border border-black p-1 w-6">M</th><th className="border border-black p-1 w-6">F</th><th className="border border-black p-1 w-6">T</th><th className="border border-black p-1 w-6">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {MALVAR_BARANGAYS.map((brgy, idx) => {
                                    const d = getDentalData(brgy);
                                    const isTotal = brgy === 'TOTAL';
                                    return (
                                        <tr key={idx} className={isTotal ? 'font-bold bg-slate-100' : ''}>
                                            <td className="border border-black p-1 text-left">{brgy}</td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.a10_m||'0'}</td><td className="border border-black p-1">{d.a10_f||'0'}</td><td className="border border-black p-1 font-bold">{d.a10_t||'0'}</td><td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.a15_m||'0'}</td><td className="border border-black p-1">{d.a15_f||'0'}</td><td className="border border-black p-1 font-bold">{d.a15_t||'0'}</td><td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.a20_m||'0'}</td><td className="border border-black p-1">{d.a20_f||'0'}</td><td className="border border-black p-1 font-bold">{d.a20_t||'0'}</td><td className="border border-black p-1"></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* FAMILY PLANNING */}
                    {selectedReport === 'fp' && (
                        <table className="w-full text-[8px] border-collapse border-2 border-black text-center">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th rowSpan={2} className="border border-black p-1 text-left uppercase w-24">Area</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-8">Total est WRA</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-8">Total Current Users</th>
                                    <th colSpan={5} className="border border-black p-1 uppercase">BTL</th>
                                    <th colSpan={5} className="border border-black p-1 uppercase">NSV</th>
                                    <th colSpan={5} className="border border-black p-1 uppercase">Condom</th>
                                    <th colSpan={5} className="border border-black p-1 uppercase">Pills</th>
                                    <th colSpan={5} className="border border-black p-1 uppercase">IUD</th>
                                    <th colSpan={5} className="border border-black p-1 uppercase">Injectables</th>
                                    <th colSpan={5} className="border border-black p-1 uppercase">Implant</th>
                                </tr>
                                <tr className="bg-slate-50">
                                    {Array(7).fill(null).map((_, i) => (
                                        <React.Fragment key={i}>
                                            <th className="border border-black p-1 w-5">10-14</th><th className="border border-black p-1 w-5">15-19</th><th className="border border-black p-1 w-5">20-49</th><th className="border border-black p-1 w-5">T</th><th className="border border-black p-1 w-5">%</th>
                                        </React.Fragment>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {MALVAR_BARANGAYS.map((brgy, idx) => {
                                    const d = getFPData(brgy);
                                    const isTotal = brgy === 'TOTAL';
                                    return (
                                        <tr key={idx} className={isTotal ? 'font-bold bg-slate-100' : ''}>
                                            <td className="border border-black p-1 text-left font-bold">{brgy}</td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.total||'0'}</td>
                                            {/* BTL */} <td className="border border-black p-1">{d.btl.a10||'0'}</td><td className="border border-black p-1">{d.btl.a15||'0'}</td><td className="border border-black p-1">{d.btl.a20||'0'}</td><td className="border border-black p-1">{d.btl.t||'0'}</td><td className="border border-black p-1"></td>
                                            {/* NSV */} <td className="border border-black p-1">{d.nsv.a10||'0'}</td><td className="border border-black p-1">{d.nsv.a15||'0'}</td><td className="border border-black p-1">{d.nsv.a20||'0'}</td><td className="border border-black p-1">{d.nsv.t||'0'}</td><td className="border border-black p-1"></td>
                                            {/* Condom */} <td className="border border-black p-1">{d.condom.a10||'0'}</td><td className="border border-black p-1">{d.condom.a15||'0'}</td><td className="border border-black p-1">{d.condom.a20||'0'}</td><td className="border border-black p-1">{d.condom.t||'0'}</td><td className="border border-black p-1"></td>
                                            {/* Pills */} <td className="border border-black p-1">{d.pills.a10||'0'}</td><td className="border border-black p-1">{d.pills.a15||'0'}</td><td className="border border-black p-1">{d.pills.a20||'0'}</td><td className="border border-black p-1">{d.pills.t||'0'}</td><td className="border border-black p-1"></td>
                                            {/* IUD */} <td className="border border-black p-1">{d.iud.a10||'0'}</td><td className="border border-black p-1">{d.iud.a15||'0'}</td><td className="border border-black p-1">{d.iud.a20||'0'}</td><td className="border border-black p-1">{d.iud.t||'0'}</td><td className="border border-black p-1"></td>
                                            {/* Injectables */} <td className="border border-black p-1">{d.inject.a10||'0'}</td><td className="border border-black p-1">{d.inject.a15||'0'}</td><td className="border border-black p-1">{d.inject.a20||'0'}</td><td className="border border-black p-1">{d.inject.t||'0'}</td><td className="border border-black p-1"></td>
                                            {/* Implant */} <td className="border border-black p-1">{d.implant.a10||'0'}</td><td className="border border-black p-1">{d.implant.a15||'0'}</td><td className="border border-black p-1">{d.implant.a20||'0'}</td><td className="border border-black p-1">{d.implant.t||'0'}</td><td className="border border-black p-1"></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* NCD & SENIORS */}
                    {selectedReport === 'ncd' && (
                        <table className="w-full text-[10px] border-collapse border-2 border-black text-center">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th rowSpan={2} className="border border-black p-1 text-left uppercase w-32">Area</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Total adults risk-assessed using PhilPEN</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-12">Elig. Pop. 60+</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Seniors screened for visual acuity</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Seniors diagnosed with eye disease/s</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Seniors who received one (1) dose of PPV</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Seniors who received one (1) dose of influenza</th>
                                </tr>
                                <tr className="bg-slate-50">
                                    <th className="border border-black p-1 w-6">M</th><th className="border border-black p-1 w-6">F</th><th className="border border-black p-1 w-6">T</th><th className="border border-black p-1 w-6">%</th>
                                    <th className="border border-black p-1 w-6">M</th><th className="border border-black p-1 w-6">F</th><th className="border border-black p-1 w-6">T</th><th className="border border-black p-1 w-6">%</th>
                                    <th className="border border-black p-1 w-6">M</th><th className="border border-black p-1 w-6">F</th><th className="border border-black p-1 w-6">T</th><th className="border border-black p-1 w-6">%</th>
                                    <th className="border border-black p-1 w-6">M</th><th className="border border-black p-1 w-6">F</th><th className="border border-black p-1 w-6">T</th><th className="border border-black p-1 w-6">%</th>
                                    <th className="border border-black p-1 w-6">M</th><th className="border border-black p-1 w-6">F</th><th className="border border-black p-1 w-6">T</th><th className="border border-black p-1 w-6">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {MALVAR_BARANGAYS.map((brgy, idx) => {
                                    const d = getNCDData(brgy);
                                    const isTotal = brgy === 'TOTAL';
                                    return (
                                        <tr key={idx} className={isTotal ? 'font-bold bg-slate-100' : ''}>
                                            <td className="border border-black p-1 text-left">{brgy}</td>
                                            <td className="border border-black p-1">{d.phil_m||'0'}</td><td className="border border-black p-1">{d.phil_f||'0'}</td><td className="border border-black p-1">{d.phil_t||'0'}</td><td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.vis_m||'0'}</td><td className="border border-black p-1">{d.vis_f||'0'}</td><td className="border border-black p-1">{d.vis_t||'0'}</td><td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.eye_m||'0'}</td><td className="border border-black p-1">{d.eye_f||'0'}</td><td className="border border-black p-1">{d.eye_t||'0'}</td><td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.ppv_m||'0'}</td><td className="border border-black p-1">{d.ppv_f||'0'}</td><td className="border border-black p-1">{d.ppv_t||'0'}</td><td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.flu_m||'0'}</td><td className="border border-black p-1">{d.flu_f||'0'}</td><td className="border border-black p-1">{d.flu_t||'0'}</td><td className="border border-black p-1"></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* LEPROSY & RABIES */}
                    {selectedReport === 'rabies_leprosy' && (
                        <table className="w-full text-[10px] border-collapse border-2 border-black text-center">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th rowSpan={2} className="border border-black p-1 text-left uppercase w-32">Area</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-16">Population</th>
                                    <th colSpan={3} className="border border-black p-1 uppercase">Number of Leprosy cases on treatment</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-16">Leprosy Prev. Rate</th>
                                    <th colSpan={3} className="border border-black p-1 uppercase">Number of newly detected cases</th>
                                    <th rowSpan={2} className="border border-black p-1 uppercase w-16">Case Detection Rate</th>
                                    <th colSpan={3} className="border border-black p-1 uppercase">Number of animal bites</th>
                                    <th colSpan={4} className="border border-black p-1 uppercase">Number of deaths due to Rabies</th>
                                </tr>
                                <tr className="bg-slate-50">
                                    <th className="border border-black p-1 w-8">M</th><th className="border border-black p-1 w-8">F</th><th className="border border-black p-1 w-8 font-black bg-slate-100">T</th>
                                    <th className="border border-black p-1 w-8">M</th><th className="border border-black p-1 w-8">F</th><th className="border border-black p-1 w-8 font-black bg-slate-100">T</th>
                                    <th className="border border-black p-1 w-8">M</th><th className="border border-black p-1 w-8">F</th><th className="border border-black p-1 w-8 font-black bg-slate-100">T</th>
                                    <th className="border border-black p-1 w-8">M</th><th className="border border-black p-1 w-8">F</th><th className="border border-black p-1 w-8 font-black bg-slate-100">T</th><th className="border border-black p-1 w-12 text-[8px]">Proportion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {MALVAR_BARANGAYS.map((brgy, idx) => {
                                    const d = getLRData(brgy);
                                    const isTotal = brgy === 'TOTAL';
                                    return (
                                        <tr key={idx} className={isTotal ? 'font-bold bg-slate-100' : ''}>
                                            <td className="border border-black p-1 text-left">{brgy}</td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.tx_m||'0'}</td><td className="border border-black p-1">{d.tx_f||'0'}</td><td className="border border-black p-1">{d.tx_t||'0'}</td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.new_m||'0'}</td><td className="border border-black p-1">{d.new_f||'0'}</td><td className="border border-black p-1">{d.new_t||'0'}</td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1">{d.bite_m||'0'}</td><td className="border border-black p-1">{d.bite_f||'0'}</td><td className="border border-black p-1">{d.bite_t||'0'}</td>
                                            <td className="border border-black p-1">{d.death_m||'0'}</td><td className="border border-black p-1">{d.death_f||'0'}</td><td className="border border-black p-1">{d.death_t||'0'}</td><td className="border border-black p-1"></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* DOH Footer Requirements */}
                    <div className="mt-8 flex justify-between items-end">
                        <div className="text-left">
                            <p className="text-[10px] font-bold uppercase mb-8">Prepared By:</p>
                            <p className="text-[11px] font-bold border-b border-black pb-1 w-64 text-center"> </p>
                        </div>
                        <div className="text-right text-[8px] font-bold italic text-slate-500">
                            <p>Use 8.5" x 13" size Paper</p>
                            <p>Generated via MediSens Automated FHSIS</p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ReportGenerator;
