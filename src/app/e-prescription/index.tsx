import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import SignatureCanvas from 'react-signature-canvas';
import { useToast } from '../../components/feedback/Toast';
import { requireRole } from '../../lib/auth/roles';
import { createPrescription } from '../../features/consultation/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { Skeleton } from '../../components/ui/Skeleton';

interface Medication { name: string; dosage: string; frequency: string; duration: string; quantity: string; }

interface PrescriptionData {
  patientId: string; date: string; name: string; age: string; sex: string; address: string;
  medications: Medication[]; licNo: string; ptrNo: string; signatureUrl: string;
}

function EPrescription() {
  const [role, setRole] = useState<string | null>(null);
  const [formData, setFormData] = useState<PrescriptionData>({
    patientId: '', date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), name: '', age: '', sex: '', address: '',
    medications: [{ name: '', dosage: '', frequency: '', duration: '', quantity: '' }],
    licNo: '', ptrNo: '', signatureUrl: ''
  });
  const sigCanvas = useRef<SignatureCanvas | null>(null);
  const { showToast, ToastComponent } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // RBAC Guard
  useEffect(() => {
    requireRole('doctor').then(profile => setRole(profile.role)).catch(() => undefined);
  }, []);

  const handleAddMed = () => setFormData(f => ({ ...f, medications: [...f.medications, { name: '', dosage: '', frequency: '', duration: '', quantity: '' }] }));
  
  const handleMedChange = (index: number, field: keyof Medication, value: string) => {
    const newMeds = [...formData.medications];
    newMeds[index][field] = value;
    setFormData(f => ({ ...f, medications: newMeds }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'doctor' && sigCanvas.current?.isEmpty()) {
       showToast('Doctor signature is required.', true);
       return;
    }
    
    const sigUrl = sigCanvas.current?.getCanvas().toDataURL('image/png') || '';
    const patientId = new URLSearchParams(window.location.search).get('id');
    
    setIsSubmitting(true);
    try {
      await createPrescription({
        patient_id: patientId || null,
        prescription_date: formData.date || null,
        rx_content: JSON.stringify(formData.medications), 
        license_no: formData.licNo ? Number(formData.licNo) : null,
        ptr_no: formData.ptrNo || null,
        signature_url: sigUrl,
        status: 'Pending'
      });
      showToast('E-prescription authorized and sent to pharmacy.', false);
      sigCanvas.current?.clear();
    } catch (err) {
      logError('Failed to save prescription', err);
      showToast(healthcareErrorMessage("save the prescription"), true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!role) return (
    <div className="w-full rounded-lg border-t-8 border-[var(--brand-active)] bg-white p-4 shadow-sm md:p-6" role="status" aria-live="polite" aria-busy="true">
      <div className="mb-8 border-b-2 border-[var(--border)] pb-4">
        <Skeleton className="mx-auto h-5 w-64" />
        <Skeleton className="mx-auto mt-3 h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
      </div>
    </div>
  );

  const inputStyle = "w-full border-b border-[var(--border-strong)] focus:border-[var(--focus-color)] outline-none bg-transparent py-1 px-2 text-sm";

  return (
    <>
    <ToastComponent />
    <div className="w-full p-4 md:p-6 bg-white shadow-sm rounded-lg mt-4 md:mt-6 border-t-8 border-[var(--brand-active)]">
      <div className="flex justify-between items-center mb-8 border-b-2 border-[var(--text)] pb-4">
        <div className="text-center w-full">
          <h2 className="text-xl font-bold uppercase">Republic of the Philippines</h2>
          <h3 className="text-lg">Province of Batangas | Municipality of Malvar</h3>
          <h4 className="text-md font-bold">OFFICE OF THE MUNICIPAL HEALTH</h4>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div><label className="font-bold text-sm">DATE:</label><input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className={inputStyle} /></div>
          <div></div>
          <div><label className="font-bold text-sm">NAME:</label><input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputStyle} /></div>
          <div><label className="font-bold text-sm">AGE:</label><input type="text" value={formData.age} onChange={e => setFormData({ ...formData, age: e.target.value })} className={inputStyle} /></div>
          <div><label className="font-bold text-sm">ADDRESS:</label><input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className={inputStyle} /></div>
          <div><label className="font-bold text-sm">SEX:</label><input type="text" value={formData.sex} onChange={e => setFormData({ ...formData, sex: e.target.value })} className={inputStyle} /></div>
        </div>

        <div className="text-6xl font-serif mt-10 mb-4">℞</div>

        <div className="space-y-4">
          {formData.medications.map((med, i) => (
            <div key={i} className="grid grid-cols-5 gap-4 items-end bg-[var(--surface-subtle)] p-4 rounded border border-[var(--border)]">
              <div className="col-span-2"><label className="text-xs text-[var(--text-secondary)]">Medication</label><input type="text" placeholder="e.g. Amoxicillin 500mg" value={med.name} onChange={e => handleMedChange(i, 'name', e.target.value)} className={inputStyle} /></div>
              <div><label className="text-xs text-[var(--text-secondary)]">Sig (Freq)</label><input type="text" placeholder="e.g. 1x a day" value={med.frequency} onChange={e => handleMedChange(i, 'frequency', e.target.value)} className={inputStyle} /></div>
              <div><label className="text-xs text-[var(--text-secondary)]">Duration</label><input type="text" placeholder="e.g. 7 days" value={med.duration} onChange={e => handleMedChange(i, 'duration', e.target.value)} className={inputStyle} /></div>
              <div><label className="text-xs text-[var(--text-secondary)]">Qty</label><input type="text" placeholder="#21" value={med.quantity} onChange={e => handleMedChange(i, 'quantity', e.target.value)} className={inputStyle} /></div>
            </div>
          ))}
          {role === 'doctor' && <button type="button" onClick={handleAddMed} className="text-[var(--text-2)] text-sm font-bold">+ Add Another Medication</button>}
        </div>

        <div className="flex justify-end mt-16">
          <div className="w-72">
            <div className="border border-[var(--border)] bg-[var(--surface-subtle)] rounded-lg overflow-hidden relative">
              {role === 'doctor' && <div className="absolute top-2 left-2 text-xs text-[var(--text-muted)] pointer-events-none">Sign Here</div>}
              <SignatureCanvas ref={sigCanvas} penColor="black" canvasProps={{ className: 'w-full h-32' }} />
            </div>
            {role === 'doctor' && <button type="button" onClick={() => sigCanvas.current?.clear()} className="text-xs text-[var(--text-secondary)] mt-1">Clear Signature</button>}
            
            <div className="mt-4 space-y-2">
              <div className="flex"><label className="text-sm w-16">Lic. No:</label><input type="text" value={formData.licNo} onChange={e => setFormData({...formData, licNo: e.target.value})} className={inputStyle} /></div>
              <div className="flex"><label className="text-sm w-16">PTR. No:</label><input type="text" value={formData.ptrNo} onChange={e => setFormData({...formData, ptrNo: e.target.value})} className={inputStyle} /></div>
            </div>
          </div>
        </div>

        {role === 'doctor' && <button type="submit" disabled={isSubmitting} className="w-full bg-[var(--brand-active)] text-white font-bold py-3 rounded hover:bg-[var(--brand-active-hover)] disabled:opacity-60">{isSubmitting ? 'Authorizing Prescription...' : 'Authorize E-Prescription'}</button>}
      </form>
    </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><EPrescription /></React.StrictMode>);
