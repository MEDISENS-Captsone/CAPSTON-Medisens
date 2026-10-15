import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase/client';
import { importReport, importTemplate, parsePatientCsv, type ImportPatient, type ImportResult } from './importCsv';

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PatientCsvImport({ onImported }: { onImported?: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportPatient[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [committed, setCommitted] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const [allowed, setAllowed] = useState(false);
  // Resolve permissions without changing existing route guards.
  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).single();
    setAllowed(Boolean(data?.is_active && ['doctor', 'nurse', 'BHW', 'midwives'].includes(data.role)));
  };
  useEffect(() => { void checkAccess(); }, []);
  const run = async (patients: ImportPatient[], commit: boolean) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!navigator.onLine) throw new Error('offline');
      const { data, error: requestError } = await supabase.functions.invoke('import-patients', { body: { rows: patients, commit } });
      if (requestError || !Array.isArray(data?.results)) throw new Error('request');
      setResults(data.results);
      setUncertain(false);
      if (commit) { setCommitted(true); onImported?.(); }
    } catch {
      setError(commit ? 'Import could not be confirmed. Preview this file again before retrying; duplicates will be checked again.' : 'Unable to preview the import. Check your connection and try again.');
      if (commit) setUncertain(true);
    } finally { lock.current = false; setBusy(false); }
  };
  return <span>
    {allowed && <Button variant="outline" onClick={() => setOpen(true)}>Import patients (CSV)</Button>}
    {open && <div className="fixed inset-0 z-[280] flex items-center justify-center bg-[var(--overlay)] p-4">
      <Modal labelledBy={`${id}-title`} onClose={busy ? undefined : () => setOpen(false)} className="max-h-[90dvh] !max-w-3xl overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={`${id}-title`} className="text-lg font-semibold">Import patients</h2><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Close</Button></div>
        <p className="my-3 text-sm text-[var(--text-secondary)]">Upload up to 500 patients in a UTF-8 CSV (maximum 2 MB). Required: firstName, lastName, birthday (YYYY-MM-DD), sex (Male/Female), address. Optional fields are included in the template. Keep phone numbers as text to preserve leading zeros.</p>
        <Button variant="outline" onClick={() => download('medisens-patient-template.csv', importTemplate())}>Download CSV template</Button>
        <label className="my-4 block space-y-2"><span className="font-semibold">Patient CSV file</span><input type="file" accept=".csv,text/csv" disabled={busy} className="block w-full text-base" onChange={async event => {
          const file = event.target.files?.[0];
          setRows([]); setResults([]); setCommitted(false); setUncertain(false); setError('');
          if (!file) return;
          try {
            if (!file.name.toLowerCase().endsWith('.csv') || file.size > 2 * 1024 * 1024) throw new Error('Choose a CSV file no larger than 2 MB.');
            const patients = parsePatientCsv(await file.text()); setRows(patients); await run(patients, false);
          } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to read this CSV.'); }
        }} /></label>
        {error && <p role="alert" className="my-3 text-[var(--coral)]">{error}</p>}
        {busy && <p role="status">{results.length ? 'Importing patients…' : 'Checking patient rows…'}</p>}
        {results.length > 0 && <>
          <p className="my-3" role="status">{results.filter(row => row.status === 'ready').length} ready · {results.filter(row => row.status === 'imported').length} imported · {results.filter(row => row.status === 'duplicate').length} duplicates · {results.filter(row => row.status === 'invalid').length} invalid</p>
          <div className="max-h-72 overflow-auto"><table className="clinical-table w-full"><caption className="text-left text-sm">Data rows (excluding the header)</caption><thead><tr><th>Row</th><th>Patient</th><th>Status / details</th></tr></thead><tbody>{results.map(result => <tr key={result.row}><td>{result.row}</td><td>{rows[result.row - 1]?.lastName}, {rows[result.row - 1]?.firstName}</td><td>{result.status}: {result.message}</td></tr>)}</tbody></table></div>
          <p className="my-3 text-sm text-[var(--text-secondary)]">Only valid, non-duplicate rows will be added. Existing records are never overwritten. Imported patients still need their usual patient consent.</p>
          <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => download('medisens-import-results.csv', importReport(results))}>Download results</Button><Button disabled={busy || committed || uncertain || !results.some(row => row.status === 'ready')} onClick={() => void run(rows, true)}>Import valid patients</Button></div>
        </>}
        {rows.length > 0 && !committed && <Button variant="ghost" disabled={busy} onClick={() => void run(rows, false)}>Preview again</Button>}
      </Modal>
    </div>}
  </span>;
}
