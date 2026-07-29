import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { useToast } from '../../components/feedback/Toast';
import { requireRole } from '../../lib/auth/roles';
import { createLabRequest } from '../../features/consultation/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { Skeleton } from '../../components/ui/Skeleton';

interface LabRequestData {
  date: string; labNo: string; name: string; age: string; sex: string; address: string; cc: string;
  tests: Record<string, boolean>; fastingTests: Record<string, boolean>;
  others: string; requestedBy: string; status: 'Pending' | 'Completed'; labNotes: string;
}

function LabRequest() {
  const [role, setRole] = useState<string | null>(null);
  const [formData, setFormData] = useState<LabRequestData>({
    date: '', labNo: '', name: '', age: '', sex: '', address: '', cc: '',
    tests: { cbc: false, cbcPlatelet: false, hgbHct: false, chestXray: false, ultrasound: false, urinalysis: false, fecalysis: false, sputum: false },
    fastingTests: { rbs: false, uricAcid: false, fbs: false, cholesterol: false },
    others: '', requestedBy: '', status: 'Pending', labNotes: ''
  });
  const { showToast, ToastComponent } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // RBAC Guard
  useEffect(() => {
    requireRole('doctor').then(profile => setRole(profile.role)).catch(() => undefined);
  }, []);

  const handleTestCheck = (category: 'tests' | 'fastingTests', key: string) => {
    setFormData(prev => ({ ...prev, [category]: { ...prev[category], [key]: !prev[category][key] } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Placeholder patient_id (Needs to be passed as a prop from the URL just like the initial consultation)
    const patientId = new URLSearchParams(window.location.search).get('id');

    setIsSubmitting(true);
    try {
      await createLabRequest({
        patient_id: patientId || null,
        request_date: formData.date || null,
        lab_no: formData.labNo || null,
        chief_complaint: formData.cc || null,
        
        // Map boolean checkboxes directly to your columns
        is_cbc: formData.tests.cbc,
        is_cbc_platelet: formData.tests.cbcPlatelet,
        is_hgb_hct: formData.tests.hgbHct,
        is_xray: formData.tests.chestXray,
        is_ultrasound: formData.tests.ultrasound,
        is_urinalysis: formData.tests.urinalysis,
        is_fecalysis: formData.tests.fecalysis,
        is_sputum: formData.tests.sputum,
        is_rbs: formData.fastingTests.rbs,
        is_fbs: formData.fastingTests.fbs,
        is_uric_acid: formData.fastingTests.uricAcid,
        is_cholesterol: formData.fastingTests.cholesterol,
        
        others: formData.others || null,
        requested_by: formData.requestedBy || null,
        status: 'Pending'
      });
      showToast('Laboratory request sent to the work queue.', false);
    } catch (err) {
      logError('Failed to submit lab request', err);
      showToast(healthcareErrorMessage("submit the lab request"), true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!role) return (
    <div className="w-full rounded-lg border bg-white p-4 shadow md:p-6" role="status" aria-live="polite" aria-busy="true">
      <Skeleton className="mx-auto mb-6 h-6 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-8 w-full" />)}
      </div>
    </div>
  );

  const isLab = role === 'labaratory';
  const inputStyle = "border-b border-gray-400 focus:border-slate-700 outline-none bg-transparent px-2 text-sm w-full";

  return (
    <>
    <ToastComponent />
    <div className="w-full p-4 md:p-6 bg-white shadow border rounded-lg mt-4 md:mt-6">
      <h2 className="text-2xl font-bold text-center mb-6 border-b-2 pb-2">LABORATORY REQUEST</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="flex"><label className="w-16 font-bold text-sm">Date:</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className={inputStyle} disabled={isLab}/></div>
          <div className="flex"><label className="w-20 font-bold text-sm">Lab. No.:</label><input type="text" value={formData.labNo} onChange={e => setFormData({...formData, labNo: e.target.value})} className={inputStyle} disabled={!isLab}/></div>
        </div>

        <div className="flex"><label className="w-16 font-bold text-sm">Name:</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputStyle} disabled={isLab}/></div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="flex"><label className="w-16 font-bold text-sm">Age:</label><input type="text" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className={inputStyle} disabled={isLab}/></div>
          <div className="flex items-center gap-4"><label className="font-bold text-sm">Sex:</label>
            <label><input type="radio" name="sex" value="M" checked={formData.sex === 'M'} onChange={e => setFormData({...formData, sex: e.target.value})} disabled={isLab}/> M</label>
            <label><input type="radio" name="sex" value="F" checked={formData.sex === 'F'} onChange={e => setFormData({...formData, sex: e.target.value})} disabled={isLab}/> F</label>
          </div>
        </div>

        <div className="flex"><label className="w-20 font-bold text-sm">Address:</label><input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className={inputStyle} disabled={isLab}/></div>
        <div className="flex"><label className="w-12 font-bold text-sm">CC:</label><input type="text" value={formData.cc} onChange={e => setFormData({...formData, cc: e.target.value})} className={inputStyle} disabled={isLab}/></div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3 mt-6 p-4 border border-gray-200 rounded">
          <label className="flex items-center gap-2"><input type="checkbox" checked={formData.tests.cbc} onChange={() => handleTestCheck('tests', 'cbc')} disabled={isLab}/> Complete Blood Count (CBC)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={formData.tests.urinalysis} onChange={() => handleTestCheck('tests', 'urinalysis')} disabled={isLab}/> Urinalysis</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={formData.tests.cbcPlatelet} onChange={() => handleTestCheck('tests', 'cbcPlatelet')} disabled={isLab}/> CBC with Platelet Count</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={formData.tests.fecalysis} onChange={() => handleTestCheck('tests', 'fecalysis')} disabled={isLab}/> Fecalysis</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={formData.tests.hgbHct} onChange={() => handleTestCheck('tests', 'hgbHct')} disabled={isLab}/> Hemoglobin and Hematocrit</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={formData.tests.sputum} onChange={() => handleTestCheck('tests', 'sputum')} disabled={isLab}/> Sputum</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={formData.tests.chestXray} onChange={() => handleTestCheck('tests', 'chestXray')} disabled={isLab}/> Chest X-Ray (PA View)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={formData.tests.ultrasound} onChange={() => handleTestCheck('tests', 'ultrasound')} disabled={isLab}/> Ultrasound</label>
        </div>

        <div className="p-4 border border-gray-200 rounded bg-gray-50">
          <h4 className="font-bold text-sm mb-3">For fasting 8-10 hours</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={formData.fastingTests.rbs} onChange={() => handleTestCheck('fastingTests', 'rbs')} disabled={isLab}/> RBS</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={formData.fastingTests.fbs} onChange={() => handleTestCheck('fastingTests', 'fbs')} disabled={isLab}/> FBS</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={formData.fastingTests.uricAcid} onChange={() => handleTestCheck('fastingTests', 'uricAcid')} disabled={isLab}/> Uric Acid</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={formData.fastingTests.cholesterol} onChange={() => handleTestCheck('fastingTests', 'cholesterol')} disabled={isLab}/> Cholesterol</label>
          </div>
        </div>

        <div className="flex items-center gap-2"><label className="font-bold text-sm">Others:</label><input type="text" value={formData.others} onChange={e => setFormData({...formData, others: e.target.value})} className={inputStyle} disabled={isLab}/></div>
        <div className="flex items-center gap-2 mt-8"><label className="font-bold text-sm whitespace-nowrap">Requested By:</label><input type="text" value={formData.requestedBy} onChange={e => setFormData({...formData, requestedBy: e.target.value})} className={inputStyle} disabled={isLab}/></div>

        {/* Lab Department Section */}
        {isLab && (
          <div className="mt-8 p-6 bg-slate-50 border border-slate-200 rounded-lg">
            <h3 className="font-bold text-slate-800 mb-4">Laboratory Results Entry</h3>
            <textarea className="w-full p-3 border rounded mb-4 h-32" placeholder="Enter findings or append link to result file..." value={formData.labNotes} onChange={e => setFormData({...formData, labNotes: e.target.value})}></textarea>
            <label className="flex items-center gap-2 font-bold text-sm text-green-700">
              <input type="checkbox" checked={formData.status === 'Completed'} onChange={e => setFormData({...formData, status: e.target.checked ? 'Completed' : 'Pending'})} />
              Mark results as completed for doctor review
            </label>
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="w-full bg-slate-800 text-white font-bold py-3 rounded mt-4 disabled:opacity-60">{isSubmitting ? 'Recording...' : isLab ? 'Record Lab Results' : 'Send Lab Request'}</button>
      </form>
    </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><LabRequest /></React.StrictMode>);
