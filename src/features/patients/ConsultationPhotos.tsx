import { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { Button } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { prepareClinicalPhoto } from './photoFiles';

const BUCKET = 'consultation-photos';
interface Photo { id: string; consultation_id: number; object_path: string; uploaded_by: string; created_at: string; ready: boolean }
interface Pending { id: string; file: File; url: string; consent: boolean }
interface Visit { consultation_id: number; updated_at: string; status: string }
interface Props { patientId: string | number; consultationId?: number | null; resolveConsultation?: () => Promise<number | null> }

function StoredPhoto({ photo, onView }: { photo: Photo; onView: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false; let objectUrl = '';
    setFailed(false); setUrl('');
    void supabase.storage.from(BUCKET).download(photo.object_path).then(({ data, error }) => {
      if (disposed) return;
      if (error || !data) { setFailed(true); return; }
      objectUrl = URL.createObjectURL(data); setUrl(objectUrl);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo.object_path, attempt]);
  return <div className="space-y-2">
    {url ? <button type="button" onClick={() => onView(url)} className="min-h-11 w-full rounded-lg border border-[var(--border)] p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-color)]" aria-label={`Enlarge photo for consultation ${photo.consultation_id}`}><img src={url} alt={`Clinical photo for consultation ${photo.consultation_id}`} className="h-40 w-full object-contain" loading="lazy" /></button> : failed ? <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry photo</Button> : <p role="status">Loading photo…</p>}
    <p className="text-sm text-[var(--text-secondary)]">Consultation #{photo.consultation_id} · {new Date(photo.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
  </div>;
}

export function ConsultationPhotos({ patientId, consultationId, resolveConsultation }: Props) {
  const id = useId();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [enlarged, setEnlarged] = useState('');
  const [remove, setRemove] = useState<Photo | null>(null);
  const [refresh, setRefresh] = useState(0);
  const lock = useRef(false);
  const pendingRef = useRef<Pending[]>([]);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach(photo => URL.revokeObjectURL(photo.url)), []);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setLoadError('');
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!disposed) setLoading(false); return; }
      const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).single();
      const permitted = Boolean(profile?.is_active && ['BHW','nurse','midwives','doctor'].includes(profile.role));
      if (disposed) return;
      setAllowed(permitted); setUserId(user.id);
      if (!permitted) { setLoading(false); return; }
      const [{ data: records, error: recordError }, { data: visitRows, error: visitError }] = await Promise.all([
        supabase.from('consultation_photos').select('id,consultation_id,object_path,uploaded_by,created_at,ready').eq('patient_id', patientId).order('created_at', { ascending: false }),
        supabase.from('consultation').select('consultation_id,updated_at,status').eq('patient_id', patientId).order('consultation_id', { ascending: false }),
      ]);
      if (recordError || visitError) throw new Error('load');
      if (!disposed) { setPhotos(records ?? []); setVisits(visitRows ?? []); }
    })().catch(() => { if (!disposed) setLoadError('Unable to load consultation photos. Check your connection and retry.'); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [patientId, refresh]);
  const discard = (photo: Pending) => { URL.revokeObjectURL(photo.url); setPending(current => current.filter(item => item.id !== photo.id)); };
  const upload = async () => {
    if (lock.current || !pending.length || pending.some(photo => !photo.consent)) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (!navigator.onLine) throw new Error('offline');
      const cid = consultationId ?? (resolveConsultation ? await resolveConsultation() : Number(selectedVisit));
      if (!cid) { setError('Choose an existing doctor consultation before uploading.'); return; }
      for (const photo of pending) {
        const { data: reserved, error: metadataError } = await supabase.from('consultation_photos').insert({ id: photo.id, patient_id: patientId, consultation_id: cid, consent_confirmed: true, mime_type: photo.file.type, size_bytes: photo.file.size }).select('object_path').single();
        if (metadataError || !reserved) throw new Error('metadata');
        const { error: storageError } = await supabase.storage.from(BUCKET).upload(reserved.object_path, photo.file, { contentType: photo.file.type, upsert: false, cacheControl: '0' });
        if (storageError) {
          // The server might have accepted an upload whose response was lost.
          // Keep the reservation available for cleanup/retry if storage is offline.
          const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([reserved.object_path]);
          if (!cleanupError) await supabase.from('consultation_photos').delete().eq('id', photo.id);
          throw new Error('storage');
        }
        const { data: completed, error: finishError } = await supabase.from('consultation_photos').update({ ready: true }).eq('id', photo.id).select('id').single();
        if (finishError || !completed) {
          // Retain consent metadata if cleanup fails, rather than orphan a file.
          const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([reserved.object_path]);
          if (!cleanupError) await supabase.from('consultation_photos').delete().eq('id', photo.id);
          throw new Error('finish');
        }
        discard(photo);
      }
      setMessage('Photos uploaded with photo consent recorded.');
    } catch { setError('Some photos could not be uploaded. Saved photos appear below; review the remaining photos and confirm consent again to retry.'); setPending(current => current.map(photo => ({ ...photo, id: crypto.randomUUID(), consent: false }))); }
    finally { setRefresh(value => value + 1); lock.current = false; setBusy(false); }
  };
  if (!allowed && !loading) return null;
  return <section aria-labelledby={`${id}-title`} className="my-4 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
    <h3 id={`${id}-title`} className="text-lg font-semibold">Consultation photos</h3>
    <p className="text-sm text-[var(--text-secondary)]">Patient #{patientId}. JPEG, PNG or WebP, up to 10 MB per photo. Photos are attached to a doctor consultation. Confirm the patient's or authorized representative's photo consent for each image.</p>
    {loading && <p role="status">Loading consultation photos…</p>}
    {(error || loadError) && <div role="alert"><p className="text-[var(--coral)]">{error || loadError}</p>{loadError && <Button variant="ghost" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Retry loading photos</Button>}</div>}
    {message && <p role="status">{message}</p>}
    {allowed && <>
      {!consultationId && !resolveConsultation && <div className="space-y-2"><label className="block font-semibold" htmlFor={`${id}-visit`}>Doctor consultation</label><select id={`${id}-visit`} className="block min-h-11 w-full rounded-lg border border-[var(--border)] p-2 text-base" value={selectedVisit} disabled={busy} onChange={event => setSelectedVisit(event.target.value)}><option value="">Choose consultation…</option>{visits.map(visit => <option key={visit.consultation_id} value={visit.consultation_id}>#{visit.consultation_id} · {new Date(visit.updated_at).toLocaleDateString('en-PH')} · {visit.status}</option>)}</select>{!loading && !visits.length && <p className="text-sm">A doctor must create the consultation before photos can be attached.</p>}</div>}
      {resolveConsultation && <p className="text-sm">Photos will attach to the current consultation; uploading may save its draft.</p>}
      <label className="block space-y-2"><span className="font-semibold">Choose injury photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || (!consultationId && !resolveConsultation && !selectedVisit)} className="block w-full text-base" onChange={async event => {
        const files = Array.from(event.target.files ?? []); event.target.value = '';
        if (lock.current) return;
        if (pending.length + files.length > 10) { setError('Choose up to 10 photos at a time.'); return; }
        lock.current = true; setBusy(true); setError('');
        try { for (const file of files) {
          const prepared = await prepareClinicalPhoto(file);
          setPending(current => [...current, { id: crypto.randomUUID(), file: prepared, url: URL.createObjectURL(prepared), consent: false }]);
        } } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to prepare the photo.'); }
        finally { lock.current = false; setBusy(false); }
      }} /></label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{pending.map((photo,index) => <div key={photo.id} className="space-y-2 rounded-lg border border-[var(--border)] p-3"><img src={photo.url} alt={`Selected injury photo ${index+1}`} className="h-40 w-full object-contain" /><p className="text-sm">Photo {index+1} · {(photo.file.size / 1024 / 1024).toFixed(2)} MB</p><label className="flex min-h-11 items-start gap-2"><input type="checkbox" checked={photo.consent} disabled={busy} onChange={event => setPending(current => current.map(item => item.id === photo.id ? { ...item, consent: event.target.checked } : item))} /><span>I confirm photo consent was obtained for this image.</span></label><Button variant="ghost" disabled={busy} onClick={() => discard(photo)}>Remove selected photo {index+1}</Button></div>)}</div>
      {pending.length > 0 && <Button disabled={busy || pending.some(photo => !photo.consent)} onClick={() => void upload()}>{busy ? 'Processing photos…' : 'Upload consented photos'}</Button>}
      {!loading && !photos.some(photo => (photo.ready || photo.uploaded_by === userId) && (!consultationId || photo.consultation_id === consultationId)) && <p>No photos have been uploaded for this consultation.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{photos.filter(photo => (photo.ready || photo.uploaded_by === userId) && (!consultationId || photo.consultation_id === consultationId)).map(photo => <div key={photo.id}>{photo.ready ? <StoredPhoto photo={photo} onView={setEnlarged} /> : <div className="space-y-2"><p>Incomplete upload · Consultation #{photo.consultation_id}</p><Button variant="outline" disabled={busy} onClick={async () => {
        if (lock.current) return; lock.current = true; setBusy(true); setError('');
        try {
          const { data, error: finishError } = await supabase.from('consultation_photos').update({ ready: true }).eq('id', photo.id).select('id').single();
          if (finishError || !data) throw new Error('finish');
          setMessage('Photo upload recovered.');
        } catch { setError('The stored photo is unavailable. Remove this incomplete upload and choose the photo again.'); }
        finally { lock.current = false; setBusy(false); setRefresh(value => value+1); }
      }}>Finish interrupted upload</Button></div>}{photo.uploaded_by === userId && <Button variant="ghost" disabled={busy} onClick={() => setRemove(photo)}>Remove uploaded photo</Button>}</div>)}</div>
    </>}
    {enlarged && <div className="fixed inset-0 z-[290] flex items-center justify-center bg-[var(--overlay)] p-4"><Modal labelledBy={`${id}-preview`} onClose={() => setEnlarged('')} className="max-h-[95dvh] max-w-5xl overflow-auto p-4"><h4 id={`${id}-preview`} className="font-semibold">Clinical photo · Patient #{patientId}</h4><Button variant="ghost" onClick={() => setEnlarged('')}>Close photo</Button><img src={enlarged} alt={`Enlarged clinical photo for patient ${patientId}`} className="max-h-[75dvh] w-full object-contain" /></Modal></div>}
    {remove && <div className="fixed inset-0 z-[290] flex items-center justify-center bg-[var(--overlay)] p-4"><Modal labelledBy={`${id}-remove`} onClose={busy ? undefined : () => setRemove(null)} className="max-w-lg space-y-4 p-4"><h4 id={`${id}-remove`} className="font-semibold">Remove this consultation photo?</h4><p>Patient #{patientId} · Consultation #{remove.consultation_id}. The stored photo will be deleted. The audit record will remain.</p><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => setRemove(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={async () => {
      if (lock.current) return; lock.current = true; setBusy(true); setError('');
      try {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([remove.object_path]); if (storageError) throw storageError;
        const { data, error: metadataError } = await supabase.from('consultation_photos').delete().eq('id', remove.id).select('id'); if (metadataError || !data?.length) throw new Error('remove');
        setRemove(null); setMessage('Photo removed.');
      } catch { setError('Unable to finish removing this photo. Please retry.'); }
      finally { lock.current = false; setBusy(false); setRefresh(value => value+1); }
    }}>Remove photo</Button></div></Modal></div>}
  </section>;
}
