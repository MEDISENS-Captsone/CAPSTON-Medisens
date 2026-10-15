import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as XLSX from 'xlsx';
import { Badge, Button, Card, EmptyState, Input, LoadingState } from '../../components/ui';
import { Icon } from '../../components/shared/Icon';
import { supabase } from '../../lib/supabase/client';

const TEMPLATE_VERSION = 'MEDISENS-PATIENT-TRANSFER-V1';
const SOURCE_SYSTEM = 'MEDISENS-EXTERNAL';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PATIENTS = 100;
const SHEETS = ['Import Manifest','Patients','Initial Intake','Vitals','Consultations','Laboratory Requests','Laboratory Results','Prescriptions','Follow-Ups'] as const;
const PROFILE_FIELDS = ['firstName','middleName','lastName','suffix','age','sex','civilStatus','birthday','nationality','bloodType','religion','birthPlace','address','contactNumber','educationalAttain','employmentStatus','philhealthNo','philhealthStatus','category','categoryOthers','relativeName','relativeRelation','relativeAddress','relativeContact','source_created_at'] as const;
const PROFILE_UPDATE_FIELDS = PROFILE_FIELDS.filter((field)=>field!=='source_created_at');
const DOMAIN_CONFIG = [
    { sheet:'Initial Intake', table:'initial_consultation', ref:'source_intake_ref', fields:['consultation_date','consultation_time','mode_of_transaction','referred_by','mode_of_transfer','chief_complaint','diagnosis','visit_disposition'] },
    { sheet:'Vitals', table:'vital_sign', ref:'source_vitals_ref', fields:['initial_consultation_ref','bp','heart_rate','respiratory_rate','temperature','o2_saturation','weight','height','muac','nutritional_status','bmi','visual_acuity_left','visual_acuity_right','general_survey'] },
    { sheet:'Consultations', table:'consultation', ref:'source_consultation_ref', fields:['initial_consultation_ref','source_authority','family_history','smoking_status','smoking_sticks_per_day','smoking_years','drinking_status','drinking_frequency','drinking_years','immunization_history','menarche_age','sexual_onset_age','is_menopause','menopause_age','lmp','interval_cycle','period_duration','pads_per_day','birth_control_method','gravidity','parity','delivery_type','full_term_count','premature_count','abortion_count','living_children_count','pre_eclampsia','medication_treatment','past_med_surge_history','chief_complaints','diagnosis','hpi','assessment','plan','follow_up_date','follow_up_time','management_treatment','attending_provider','past_med_surg_history','history_present_illness','follow_up_status','status','completed_at'] },
    { sheet:'Laboratory Requests', table:'lab_request', ref:'source_lab_request_ref', fields:['consultation_ref','source_authority','request_date','lab_no','chief_complaint','is_cbc','is_cbc_platelet','is_hgb_hct','is_xray','is_ultrasound','is_rbs','is_fbs','is_uric_acid','is_cholesterol','is_urinalysis','is_fecalysis','is_sputum','others','requested_by','status','is_clinical_microscopy','is_blood_chemistry','is_pregnancy_test','is_hbsag_screening','is_hiv_screening','is_parasitology','is_dengue_rdt'] },
    { sheet:'Laboratory Results', table:'lab_result', ref:'source_lab_result_ref', fields:['lab_request_ref','consultation_ref','source_authority','date_performed','findings','performed_by','status'] },
    { sheet:'Prescriptions', table:'prescription', ref:'source_prescription_ref', fields:['consultation_ref','source_authority','prescription_date','rx_content','doctor_name','license_no','ptr_no','status','dispensed_at'] },
    { sheet:'Follow-Ups', table:'follow_up', ref:'source_follow_up_ref', fields:['consultation_ref','source_authority','visit_date','visit_time','mode_of_transaction','mode_of_transfer','chief_complaint','diagnosis','history_of_present_illness','bp','heart_rate','respiratory_rate','temperature','o2_saturation','weight','height','muac','nutritional_status','bmi','visual_acuity_left','visual_acuity_right','blood_type','general_survey','medication_treatment','lab_results','follow_up_status'] },
] as const;
const NUMERIC_FIELDS = new Set(['age','contactNumber','heart_rate','respiratory_rate','temperature','o2_saturation','weight','height','muac','bmi','smoking_sticks_per_day','smoking_years','menarche_age','sexual_onset_age','menopause_age','pads_per_day','gravidity','parity','full_term_count','premature_count','abortion_count','living_children_count','license_no']);
const BOOLEAN_FIELDS = new Set(['is_cbc','is_cbc_platelet','is_hgb_hct','is_xray','is_ultrasound','is_rbs','is_fbs','is_uric_acid','is_cholesterol','is_urinalysis','is_fecalysis','is_sputum','is_clinical_microscopy','is_blood_chemistry','is_pregnancy_test','is_hbsag_screening','is_hiv_screening','is_parasitology','is_dengue_rdt']);
const DATE_FIELDS = new Set(['birthday','consultation_date','request_date','date_performed','prescription_date','visit_date']);
function validIsoDate(value:unknown){const s=text(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(`${s}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
type DataRow = Record<string, unknown>;
type PatientPayload = { source_patient_ref:string; import_action:'CREATE'|'UPDATE'; update_fields:string[]; patient:DataRow; records:{table:string;source_record_ref:string;data:DataRow}[] };
type PatientResult = {id:number;firstName:string|null;middleName:string|null;lastName:string|null;suffix:string|null;birthday:string|null;archive_status:string};
type TransferOperation = {id:string;operation_type:'IMPORT'|'EXPORT';status:string;performed_by_name:string|null;created_at:string;finished_at:string|null;patient_count:number;record_count:number;duplicate_count:number;rejected_count:number;failure_count:number;updated_count:number};
type ParsedWorkbook = {patients:PatientPayload[]; errors:string[]; records:number; updates:number; sourceSystem:string};
const text = (v:unknown) => v == null ? '' : String(v).trim();
// Source record references sent to the import RPC must be consistently namespaced.
const LINKED_REFERENCES = [
    ['initial_consultation_ref', 'initial_consultation'],
    ['consultation_ref', 'consultation'],
    ['lab_request_ref', 'lab_request'],
] as const;
const canonicalReference = (value:unknown, table:string) => {
    const ref=text(value);
    return !ref || ref.startsWith(`${table}:`) ? ref : `${table}:${ref}`;
};
const rows = (sheet:XLSX.WorkSheet) => XLSX.utils.sheet_to_json<DataRow>(sheet,{defval:'',raw:false});
function fileRow<T extends readonly string[]>(row:DataRow, fields:T) { return Object.fromEntries(fields.map((field) => [field,row[field] ?? ''])); }
function templateBook() {
    const wb=XLSX.utils.book_new();
    const specs:Record<string,string[]>={
        'Import Manifest':['schema_version','source_system','exported_at'],
        Patients:['source_patient_ref','import_action','update_fields (semicolon-separated)',...PROFILE_FIELDS],
        'Initial Intake':['source_patient_ref','source_intake_ref','consultation_date','consultation_time','mode_of_transaction','referred_by','mode_of_transfer','chief_complaint','diagnosis','visit_disposition'],
        Vitals:['source_patient_ref','source_vitals_ref','initial_consultation_ref',...DOMAIN_CONFIG[1].fields.slice(1)],
        Consultations:['source_patient_ref','source_consultation_ref',...DOMAIN_CONFIG[2].fields],
        'Laboratory Requests':['source_patient_ref','source_lab_request_ref',...DOMAIN_CONFIG[3].fields],
        'Laboratory Results':['source_patient_ref','source_lab_result_ref',...DOMAIN_CONFIG[4].fields],
        Prescriptions:['source_patient_ref','source_prescription_ref',...DOMAIN_CONFIG[5].fields],
        'Follow-Ups':['source_patient_ref','source_follow_up_ref',...DOMAIN_CONFIG[6].fields],
    };
    for(const name of SHEETS) { const headers=specs[name]; XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers]),name); }
    XLSX.utils.sheet_add_aoa(wb.Sheets['Import Manifest'],[[TEMPLATE_VERSION,SOURCE_SYSTEM,new Date().toISOString()]],{origin:1});
    return wb;
}
function parseWorkbook(wb:XLSX.WorkBook):ParsedWorkbook {
    const errors:string[]=[];
    for(const name of wb.SheetNames) for(const [address,cell] of Object.entries(wb.Sheets[name]??{})) if(address[0]!=='!'&&typeof cell==='object'&&cell!==null&&'f' in cell) errors.push(`${name}: formulas are not accepted in transfer workbooks.`);
    if(wb.SheetNames.length!==SHEETS.length||SHEETS.some((name)=>!wb.SheetNames.includes(name))||wb.SheetNames.some((name)=>!SHEETS.includes(name as typeof SHEETS[number]))) errors.push('Workbook sheets are missing, extra, or unsupported. Download the current template.');
    const manifest=rows(wb.Sheets['Import Manifest']??XLSX.utils.aoa_to_sheet([]));
    if(manifest[0]?.schema_version!==TEMPLATE_VERSION) errors.push('Unsupported workbook version. Download the current template.');
    const manifestHeaders=(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Import Manifest']??XLSX.utils.aoa_to_sheet([]),{header:1,defval:''})[0]??[]).map(text);
    if(JSON.stringify(manifestHeaders)!==JSON.stringify(['schema_version','source_system','exported_at']))errors.push('Import Manifest columns do not match the current template.');
    const patientRows=rows(wb.Sheets.Patients??XLSX.utils.aoa_to_sheet([]));
    if(patientRows.length>MAX_PATIENTS) errors.push(`The workbook exceeds the ${MAX_PATIENTS}-patient limit.`);
    const patients=new Map<string,PatientPayload>(); let records=0; let updates=0; const sourceSystem=text(manifest[0]?.source_system)||SOURCE_SYSTEM;
    const patientHeaders=(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Patients??XLSX.utils.aoa_to_sheet([]),{header:1,defval:''})[0]??[]).map(text);
    if(JSON.stringify(patientHeaders)!==JSON.stringify(['source_patient_ref','import_action','update_fields (semicolon-separated)',...PROFILE_FIELDS]))errors.push('Patients: columns do not match the current template.');
    patientRows.forEach((row,index)=>{
        const ref=text(row.source_patient_ref);
        if(!ref) { errors.push(`Patients row ${index+2}: source_patient_ref is required.`); return; }
        if(patients.has(ref)) { errors.push(`Patients row ${index+2}: duplicate source_patient_ref.`); return; }
        const action=text(row.import_action)||'CREATE';
        if(action!=='CREATE'&&action!=='UPDATE')errors.push(`Patients row ${index+2}: import_action must be CREATE or UPDATE.`);
        const patient=fileRow(row,PROFILE_FIELDS);
        const updateFields=text(row['update_fields (semicolon-separated)']).split(';').map((field)=>field.trim()).filter(Boolean);
        if(action==='UPDATE'&&(!updateFields.length||new Set(updateFields).size!==updateFields.length||updateFields.some((field)=>!PROFILE_UPDATE_FIELDS.includes(field as typeof PROFILE_UPDATE_FIELDS[number])||!text(patient[field])))) errors.push(`Patients row ${index+2}: UPDATE requires an explicit list of present, non-empty profile fields.`);
        if(action==='CREATE'&&updateFields.length) errors.push(`Patients row ${index+2}: update_fields is only valid for UPDATE.`);
        if(!text(patient.firstName)||!text(patient.lastName)||!text(patient.birthday)) errors.push(`Patients row ${index+2}: firstName, lastName, and birthday are required.`);
        if(!validIsoDate(patient.birthday))errors.push(`Patients row ${index+2}: birthday must use a valid YYYY-MM-DD date.`);
        for(const key of NUMERIC_FIELDS)if(text(patient[key])&&!/^-?\d+(\.\d+)?$/.test(text(patient[key])))errors.push(`Patients row ${index+2}: ${key} must be numeric.`);
        patients.set(ref,{source_patient_ref:ref,import_action:action as 'CREATE'|'UPDATE',update_fields:updateFields,patient,records:[]});
        if(action==='UPDATE')updates++;
    });
    for(const domain of DOMAIN_CONFIG) {
        const sh=wb.Sheets[domain.sheet]; if(!sh) continue;
        const dataRows=rows(sh); const headers=(XLSX.utils.sheet_to_json<unknown[]>(sh,{header:1,defval:''})[0]??[]).map(text);
        const expected=domain.sheet==='Initial Intake'?['source_patient_ref',domain.ref,...domain.fields]:['source_patient_ref',domain.ref,...domain.fields];
        if(JSON.stringify(headers)!==JSON.stringify(expected)) errors.push(`${domain.sheet}: columns do not match the current template.`);
        const seen=new Set<string>();
        dataRows.forEach((row,index)=>{
            const patientRef=text(row.source_patient_ref), recordRef=text(row[domain.ref]);
            if(!patientRef||!recordRef) { errors.push(`${domain.sheet} row ${index+2}: patient and record references are required.`); return; }
            if(seen.has(recordRef)) errors.push(`${domain.sheet} row ${index+2}: repeated record reference.`); seen.add(recordRef);
            const patient=patients.get(patientRef); if(!patient) { errors.push(`${domain.sheet} row ${index+2}: patient reference does not exist in Patients.`); return; }
            const data=fileRow(row,domain.fields) as DataRow;
            if(domain.table==='initial_consultation'&&(!text(data.consultation_date)||!text(data.chief_complaint))) errors.push(`${domain.sheet} row ${index+2}: consultation_date and chief_complaint are required.`);
            const required:Record<string,string[]>={vital_sign:['initial_consultation_ref'],consultation:['initial_consultation_ref','attending_provider','source_authority'],lab_request:['consultation_ref','requested_by','source_authority'],lab_result:['lab_request_ref','date_performed','performed_by','source_authority'],prescription:['consultation_ref','prescription_date','doctor_name','source_authority'],follow_up:['consultation_ref','visit_date','source_authority']};
            for(const field of required[domain.table]??[])if(!text(data[field]))errors.push(`${domain.sheet} row ${index+2}: ${field} is required.`);
            for(const field of DATE_FIELDS)if(text(data[field])&&!validIsoDate(data[field]))errors.push(`${domain.sheet} row ${index+2}: ${field} must use a valid YYYY-MM-DD date.`);
            for(const field of NUMERIC_FIELDS)if(text(data[field])&&!/^-?\d+(\.\d+)?$/.test(text(data[field])))errors.push(`${domain.sheet} row ${index+2}: ${field} must be numeric.`);
            for(const field of BOOLEAN_FIELDS)if(text(data[field])&&!['true','false'].includes(text(data[field]).toLowerCase()))errors.push(`${domain.sheet} row ${index+2}: ${field} must be true or false.`);
            // Normalize links just as source_record_ref is normalized, so the
            // backend can resolve intake/consultation/laboratory relationships.
            for(const [field,table] of LINKED_REFERENCES) {
                if(field in data && text(data[field])) data[field]=canonicalReference(data[field],table);
            }
            const canonicalRecordRef=canonicalReference(recordRef,domain.table);
            patient.records.push({table:domain.table,source_record_ref:canonicalRecordRef,data}); records++;
        });
    }
    for(const patient of patients.values()) {
        const recordRefs=new Set(patient.records.map((record)=>record.source_record_ref));
        for(const item of patient.records) for(const [key,domain] of LINKED_REFERENCES) {
            const ref=text(item.data[key]); if(ref&&!recordRefs.has(canonicalReference(ref,domain))) errors.push(`${key} relationship is invalid for patient ${patient.source_patient_ref}.`);
        }
    }
    if(records>5000)errors.push('Workbook exceeds the 5,000 clinical-record limit.');
    for(const name of SHEETS) for(const [address,cell] of Object.entries(wb.Sheets[name]??{})) if(address[0]!=='!'&&typeof cell==='object'&&cell!==null&&'v' in cell&&typeof (cell as XLSX.CellObject).v==='string'&&/^[\s]*[=+@-]/.test((cell as XLSX.CellObject).v as string)) errors.push(`${name} cell ${address}: formula-like values are not accepted.`);
    return {patients:[...patients.values()],errors,records,updates,sourceSystem};
}

async function callTransfer(body:Record<string,unknown>):Promise<unknown>{const {data,error}=await supabase.functions.invoke('admin-patient-transfer',{body});if(error)throw error;const result=data as {data?:unknown}|null;return result?.data;}

export function AdminPatientTransferPage() {
    const [tab,setTab]=useState<'Import'|'Export'|'History'>('Import');
    const [parsed,setParsed]=useState<ParsedWorkbook|null>(null); const [results,setResults]=useState<DataRow|null>(null);
    const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [query,setQuery]=useState(''); const [archiveFilter,setArchiveFilter]=useState<'active'|'archived'|'all'>('active'); const [patients,setPatients]=useState<PatientResult[]>([]); const [selected,setSelected]=useState<number[]>([]); const [page,setPage]=useState(0); const [history,setHistory]=useState<TransferOperation[]>([]);
    const [confirm,setConfirm]=useState(false); const inFlight=useRef(false); const picker=useRef<HTMLInputElement>(null);
    const tabRefs=useRef<Record<'Import'|'Export'|'History',HTMLButtonElement|null>>({Import:null,Export:null,History:null});
    const matching=useMemo(()=>patients,[patients]);
    const loadPatients=async(nextPage=0)=>{setBusy(true);setError('');try{const data=await callTransfer({action:'search',query,archive_status:archiveFilter,limit:100,offset:nextPage*100});setPatients((data??[]) as PatientResult[]);setPage(nextPage);}catch{setError('Unable to load records authorized for export. Check your connection and Admin access.');setPatients([]);}finally{setBusy(false);}};
    const loadHistory=async()=>{setBusy(true);setError('');try{const data=await callTransfer({action:'history',limit:100});setHistory((data??[]) as TransferOperation[]);}catch{setError('Unable to load transfer history. Check your connection and Admin access.');}finally{setBusy(false);}};
    useEffect(()=>{if(tab==='Export') void loadPatients();if(tab==='History') void loadHistory();},[tab]);
    const handleFile=async(candidate:File|null)=>{setParsed(null);setResults(null);setError('');setConfirm(false);if(!candidate)return;if(!candidate.name.toLowerCase().endsWith('.xlsx')){setError('Choose an Excel .xlsx workbook.');return;}if(candidate.size>MAX_FILE_BYTES){setError('Workbook exceeds the 10 MB limit.');return;}try{const wb=XLSX.read(await candidate.arrayBuffer(),{type:'array',cellDates:false});setParsed(parseWorkbook(wb));}catch{setError('This workbook could not be read. Check the file and try again.');}};
    const doImport=async()=>{if(!parsed||parsed.errors.length||!confirm||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{const data=await callTransfer({action:'import',source_system:parsed.sourceSystem,patients:parsed.patients});setResults((data??{}) as DataRow);setTab('Import');setParsed(null);setConfirm(false);if(picker.current)picker.current.value='';}catch{setError('Import was not completed. No detailed database error was recorded. Review the workbook and Admin access, then retry.');}finally{setBusy(false);inFlight.current=false;}};
    const createExport=async(format:'xlsx'|'csv')=>{if(!selected.length||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');let operationId='';try{const response=await callTransfer({action:'export',patient_ids:selected,format}) as {operation_id:string;status?:string;message?:string;filename?:string;content_type?:string;base64?:string};operationId=response.operation_id;if(response.status!=='GENERATED'||!response.base64)throw new Error('Export could not be generated.');const binary=atob(response.base64);const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);const blob=new Blob([bytes],{type:response.content_type||'application/octet-stream'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=response.filename||'MediSens_Patient_Records';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);await callTransfer({action:'export_complete',operation_id:operationId});}catch{if(operationId)void callTransfer({action:'export_failed',operation_id:operationId}).catch(()=>undefined);setError('Export could not be completed or audited. Check the selected records and Admin access, then try again.');}finally{setBusy(false);inFlight.current=false;}};
    const downloadTemplate=()=>XLSX.writeFile(templateBook(),'MediSens_Patient_Transfer_V1_Template.xlsx');
    const toggle=(id:number)=>setSelected((old)=>old.includes(id)?old.filter((value)=>value!==id):[...old,id]);
    const onTabKeyDown=(event:KeyboardEvent<HTMLButtonElement>)=>{const current=['Import','Export','History'].indexOf(tab);const next=event.key==='ArrowRight'?(current+1)%3:event.key==='ArrowLeft'?(current+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;if(next<0)return;event.preventDefault();const nextTab=(['Import','Export','History'] as const)[next];setTab(nextTab);tabRefs.current[nextTab]?.focus();};

    return <div className="pwa-page-pad admin-transfer-page">
        <div className="import-export-tabs" role="tablist" aria-label="Patient transfer workspace">
            {(['Import','Export','History'] as const).map((value)=><button key={value} ref={(node)=>{tabRefs.current[value]=node;}} type="button" role="tab" id={`admin-transfer-tab-${value}`} aria-controls={`admin-transfer-panel-${value}`} aria-selected={tab===value} tabIndex={tab===value?0:-1} onClick={()=>{setTab(value);setError('');}} onKeyDown={onTabKeyDown}>{value}</button>)}
        </div>
        {error&&<p className="admin-transfer-message is-error" role="alert">{error}</p>}

        {tab==='Import'&&<div className="admin-transfer-content" role="tabpanel" id="admin-transfer-panel-Import" aria-labelledby="admin-transfer-tab-Import">
            <div className="import-export-category-heading"><div><h2>Import Patient Records</h2><p>Validate and preview a versioned workbook before patient-by-patient import.</p></div><Button variant="outline" onClick={downloadTemplate}>Download Excel template</Button></div>
            <Card className="admin-transfer-card">
                <label className="admin-transfer-upload">
                    <span className="admin-transfer-upload-label">Patient records workbook</span>
                    <span className="admin-transfer-upload-panel">
                        <span className="admin-transfer-upload-icon" aria-hidden="true"><Icon name="file-text"/></span>
                        <span className="admin-transfer-upload-copy"><strong>Choose an Excel workbook</strong><small>.xlsx format · Maximum 10 MB · Up to 100 patients</small></span>
                        <span className="admin-transfer-upload-button">Browse files</span>
                        <input ref={picker} type="file" accept=".xlsx" disabled={busy} onChange={(e)=>void handleFile(e.target.files?.[0]??null)}/>
                    </span>
                </label>
                {parsed&&<div className="admin-transfer-review">
                    <div className="admin-transfer-review-heading"><div><span className="admin-transfer-step-label">Workbook review</span><h3>Validation and preview</h3></div><Badge tone={parsed.errors.length?'red':'green'}>{parsed.errors.length?`${parsed.errors.length} validation ${parsed.errors.length===1?'issue':'issues'}`:'Ready to review'}</Badge></div>
                    <div className="admin-transfer-counts" aria-label="Workbook summary">
                        <div className="admin-transfer-stat"><strong>{parsed.patients.length}</strong><span>{parsed.patients.length===1?'patient':'patients'}</span></div>
                        <div className="admin-transfer-stat"><strong>{parsed.records}</strong><span>{parsed.records===1?'history record':'history records'}</span></div>
                        <div className="admin-transfer-stat"><strong>{parsed.updates}</strong><span>{parsed.updates===1?'profile update':'profile updates'}</span></div>
                    </div>
                    <p className="admin-transfer-review-note">Set <strong>import_action</strong> to UPDATE only after reviewing that patient’s profile changes. Clinical history is not overwritten; repeated clinical references are counted as duplicates. Consent is not imported or created.</p>
                    <div className="admin-transfer-preview-list" role="list" aria-label="Patient import preview">
                        {parsed.patients.map((patient)=><div className="admin-transfer-patient-preview" role="listitem" key={patient.source_patient_ref}>
                            <div className="admin-transfer-patient-name"><strong>{[patient.patient.lastName,patient.patient.firstName,patient.patient.middleName,patient.patient.suffix].map(text).filter(Boolean).join(', ')||'Patient name missing'}</strong><span>{patient.source_patient_ref}</span></div>
                            <div className="admin-transfer-patient-meta"><Badge tone={patient.import_action==='UPDATE'?'amber':'blue'}>{patient.import_action==='UPDATE'?'Profile update':'New profile'}</Badge><span>{patient.records.length} {patient.records.length===1?'linked record':'linked records'}</span></div>
                        </div>)}
                    </div>
                    {parsed.errors.length>0&&<ul className="admin-transfer-errors" role="alert" aria-label="Validation issues">{parsed.errors.slice(0,40).map((item,i)=><li key={i}>{item}</li>)}</ul>}
                    {!parsed.errors.length&&<div className="admin-transfer-confirm-row"><label className="admin-transfer-confirm"><input type="checkbox" checked={confirm} onChange={(e)=>setConfirm(e.target.checked)}/> I reviewed the patient and clinical history counts and approve this import.</label><Button disabled={!confirm||busy} onClick={()=>void doImport()}>{busy?'Importing…':'Confirm import'}</Button></div>}
                </div>}
            </Card>
            {results&&<Card className="admin-transfer-result" role="status">
                <div className="admin-transfer-result-heading"><span className="admin-transfer-result-mark" aria-hidden="true"><Icon name={Number(results.rejected_count??0)>0?'alert-triangle':'check'}/></span><div><span className="admin-transfer-step-label">{Number(results.rejected_count??0)>0?'Completed with rejections':'Transfer complete'}</span><h3>Import results</h3>{typeof results.message==='string'&&<p>{results.message}</p>}</div></div>
                <div className="admin-transfer-counts" aria-label="Import result counts">
                    <div className={`admin-transfer-stat ${Number(results.rejected_count??0)===0?'is-success':''}`}><strong>{String(results.patient_count??0)}</strong><span>{Number(results.patient_count??0)===1?'patient processed':'patients processed'}</span></div>
                    <div className={`admin-transfer-stat ${Number(results.rejected_count??0)===0?'is-success':''}`}><strong>{String(results.record_count??0)}</strong><span>{Number(results.record_count??0)===1?'record imported':'records imported'}</span></div>
                    <div className="admin-transfer-stat"><strong>{String(results.updated_count??0)}</strong><span>{Number(results.updated_count??0)===1?'profile updated':'profiles updated'}</span></div>
                    <div className="admin-transfer-stat"><strong>{String(results.duplicate_count??0)}</strong><span>{Number(results.duplicate_count??0)===1?'duplicate':'duplicates'}</span></div>
                    <div className={`admin-transfer-stat ${Number(results.rejected_count??0)>0?'is-rejected':''}`}><strong>{String(results.rejected_count??0)}</strong><span>{Number(results.rejected_count??0)===1?'rejection':'rejections'}</span></div>
                </div>
                {Array.isArray(results.results)&&<div className="admin-transfer-preview-list" role="list" aria-label="Per-patient import results">{(results.results as DataRow[]).map((result,index)=><div className="admin-transfer-patient-preview" role="listitem" key={`${text(result.source_patient_ref)}-${index}`}><div className="admin-transfer-patient-name"><strong>{text(result.source_patient_ref)||'Patient record'}</strong><span>{text(result.message)||'Patient and linked records processed.'}</span></div><Badge tone={result.status==='IMPORTED'?'green':result.status==='DUPLICATE'?'amber':'red'}>{text(result.status)}</Badge></div>)}</div>}
            </Card>}
        </div>}

        {tab==='Export'&&<div className="admin-transfer-content" role="tabpanel" id="admin-transfer-panel-Export" aria-labelledby="admin-transfer-tab-Export">
            <div className="import-export-category-heading"><div><h2>Export Patient Records</h2><p>Search and select authorized patient records for secure transfer.</p></div></div>
            <Card className="admin-transfer-card">
                <div className="admin-transfer-search">
                    <div className="admin-transfer-search-field"><label htmlFor="admin-transfer-search-input">Search patients</label><Input id="admin-transfer-search-input" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search by patient name or ID" aria-label="Search by patient name or ID" onKeyDown={(e)=>{if(e.key==='Enter')void loadPatients(0);}}/></div>
                    <label className="admin-transfer-filter">Record status<select value={archiveFilter} disabled={busy} onChange={(e)=>{setArchiveFilter(e.target.value as 'active'|'archived'|'all');setPage(0);}}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All records</option></select></label>
                    <Button variant="outline" disabled={busy} onClick={()=>void loadPatients(0)}>Search</Button>
                </div>
                {busy?<LoadingState label="Loading authorized patient records"/>:matching.length===0?<EmptyState icon={<Icon name="users"/>} title="No matching patients" description="Search by patient ID or name to begin selection."/>:<>
                    <div className="admin-transfer-selection-bar">
                        <label><input type="checkbox" checked={matching.length>0&&matching.every((p)=>selected.includes(p.id))} onChange={(e)=>setSelected((old)=>e.target.checked?Array.from(new Set([...old,...matching.map((p)=>p.id)])).slice(0,100):old.filter((id)=>!matching.some((p)=>p.id===id)))}/> Select all {matching.length} on this page</label>
                        <div className="admin-transfer-selection-summary"><strong>{selected.length}</strong><span>{selected.length===1?'patient selected':'patients selected'}</span><small>Maximum 100</small></div>
                    </div>
                    <div className="admin-transfer-table-wrap"><table className="admin-transfer-table"><thead><tr><th scope="col">Select</th><th scope="col">Patient</th><th scope="col">ID</th><th scope="col">Birth date</th><th scope="col">Status</th></tr></thead><tbody>{matching.map((p)=><tr key={p.id}><td data-label="Select"><input type="checkbox" aria-label={`Select patient ${p.id}`} checked={selected.includes(p.id)} disabled={!selected.includes(p.id)&&selected.length>=100} onChange={()=>toggle(p.id)}/></td><td data-label="Patient">{[p.lastName,p.firstName,p.middleName,p.suffix].map(text).filter(Boolean).join(', ')}</td><td data-label="ID">{p.id}</td><td data-label="Birth date">{p.birthday??'—'}</td><td data-label="Status"><Badge tone={p.archive_status==='archived'?'amber':'slate'}>{p.archive_status}</Badge></td></tr>)}</tbody></table></div>
                    <div className="admin-transfer-pager"><Button variant="outline" disabled={!page||busy} onClick={()=>void loadPatients(page-1)}>Previous</Button><span>Page {page+1}</span><Button variant="outline" disabled={busy||matching.length<100} onClick={()=>void loadPatients(page+1)}>Next</Button></div>
                    <div className="admin-transfer-export-actions"><div className="admin-transfer-export-copy"><strong>Export selected records</strong><span>Profiles and linked clinical history are included in the complete workbook. Attachments and private URLs are excluded.</span></div><div className="admin-transfer-format-actions"><div className="admin-transfer-format-option"><span>Patient profiles</span><Button variant="outline" disabled={!selected.length||busy} onClick={()=>void createExport('csv')}>Export CSV</Button></div><div className="admin-transfer-format-option is-primary"><span>Complete patient records</span><Button disabled={!selected.length||busy} onClick={()=>void createExport('xlsx')}>Export XLSX</Button></div></div></div>
                </>}
            </Card>
        </div>}

        {tab==='History'&&<div className="admin-transfer-content" role="tabpanel" id="admin-transfer-panel-History" aria-labelledby="admin-transfer-tab-History">
            <div className="import-export-category-heading"><div><h2>Transfer History</h2><p>Server-recorded Admin imports and exports.</p></div><Button variant="outline" disabled={busy} onClick={()=>void loadHistory()}>Refresh</Button></div>
            <Card className="admin-transfer-card admin-transfer-history-card">
                {busy?<LoadingState label="Loading transfer history"/>:history.length===0?<EmptyState icon={<Icon name="clock"/>} title="No transfer operations yet" description="Completed and partial Admin transfers will appear here."/>:<div className="admin-transfer-table-wrap admin-transfer-history-wrap"><table className="admin-transfer-table admin-transfer-history-table"><thead><tr><th scope="col">Operation</th><th scope="col">Date and time</th><th scope="col">Admin</th><th scope="col">Status</th><th scope="col">Patients</th><th scope="col">Records</th><th scope="col">Updated</th><th scope="col">Duplicates</th><th scope="col">Rejected</th></tr></thead><tbody>{history.map((op)=><tr key={op.id}><td data-label="Operation">{op.operation_type==='IMPORT'?'Import':'Export'}</td><td data-label="Date and time" className="admin-transfer-date">{new Date(op.created_at).toLocaleString('en-PH')}</td><td data-label="Admin">{op.performed_by_name||'Admin'}</td><td data-label="Status"><Badge tone={op.status==='COMPLETED'?'green':op.status==='PARTIAL'?'amber':op.status==='GENERATED'?'blue':'red'}>{op.status}</Badge></td><td data-label="Patients" className="admin-transfer-number">{op.patient_count}</td><td data-label="Records" className="admin-transfer-number">{op.record_count}</td><td data-label="Updated" className="admin-transfer-number">{op.updated_count}</td><td data-label="Duplicates" className="admin-transfer-number">{op.duplicate_count}</td><td data-label="Rejected" className="admin-transfer-number">{op.rejected_count}</td></tr>)}</tbody></table></div>}
            </Card>
        </div>}
    </div>;
}
