export const IMPORT_COLUMNS = [
  'firstName', 'lastName', 'birthday', 'sex', 'address', 'middleName', 'suffix',
  'nationality', 'bloodType', 'religion', 'birthPlace', 'contactNumber', 'civilStatus',
  'educationalAttain', 'employmentStatus', 'philhealthNo', 'philhealthStatus',
  'category', 'categoryOthers', 'relativeName', 'relativeRelation', 'relativeAddress', 'relativeContact',
] as const;
export const REQUIRED_COLUMNS = IMPORT_COLUMNS.slice(0, 5);
export const MAX_IMPORT_ROWS = 500;
export type ImportPatient = Record<(typeof IMPORT_COLUMNS)[number], string>;
export interface ImportResult { row: number; status: 'ready' | 'imported' | 'duplicate' | 'invalid'; message: string }

// RFC 4180 quoting, escaped quotes, CRLF and UTF-8 BOM; reject malformed files.
export function parsePatientCsv(text: string): ImportPatient[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const source = text.replace(/^\uFEFF/, '');
  const finishField = () => { row.push(field); field = ''; closed = false; };
  const finishRow = () => {
    finishField();
    if (row.some(value => value.trim())) rows.push(row);
    row = [];
    if (rows.length > MAX_IMPORT_ROWS + 1) throw new Error('Maximum 500 patients per CSV.');
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',') finishField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      finishRow();
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error('Malformed CSV quoting.');
      field += char;
    }
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.');
  if (field || row.length || closed) finishRow();
  const headers = rows.shift()?.map(value => value.trim()) ?? [];
  if (!headers.length || new Set(headers).size !== headers.length) throw new Error('CSV headers must be present and unique.');
  for (const name of REQUIRED_COLUMNS) if (!headers.includes(name)) throw new Error(`Missing required column: ${name}.`);
  if (headers.some(name => !IMPORT_COLUMNS.includes(name as typeof IMPORT_COLUMNS[number]))) {
    throw new Error('Unknown CSV column. Please use the downloadable template.');
  }
  if (!rows.length) throw new Error('The CSV has no patient rows.');
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Data row ${index + 1} has the wrong number of columns.`);
    return Object.fromEntries(IMPORT_COLUMNS.map(name => [name, values[headers.indexOf(name)]?.trim() ?? ''])) as ImportPatient;
  });
}

export function validateImportPatient(input: unknown, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })): { patient: ImportPatient; errors: string[]; age: number } {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const errors: string[] = [];
  if (Object.keys(data).some(key => !IMPORT_COLUMNS.includes(key as typeof IMPORT_COLUMNS[number]))) errors.push('Unknown patient field.');
  const patient = Object.fromEntries(IMPORT_COLUMNS.map(name => [name, typeof data[name] === 'string' ? data[name].trim() : ''])) as ImportPatient;
  for (const name of REQUIRED_COLUMNS) if (!patient[name as keyof ImportPatient]) errors.push(`${name} is required.`);
  if (Object.values(data).some(value => typeof value !== 'string')) errors.push('Patient fields must be text.');
  if (Object.values(patient).some(value => value.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))) errors.push('A field is too long or contains invalid characters.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(patient.birthday) ? new Date(`${patient.birthday}T00:00:00Z`) : new Date(NaN);
  const validDate = Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === patient.birthday;
  const age = validDate ? Number(today.slice(0, 4)) - date.getUTCFullYear() - (today.slice(5) < patient.birthday.slice(5) ? 1 : 0) : -1;
  if (!validDate || patient.birthday > today || age < 0 || age > 150) errors.push('birthday must be a real date in YYYY-MM-DD format within the last 150 years.');
  patient.sex = patient.sex.toLowerCase() === 'male' ? 'Male' : patient.sex.toLowerCase() === 'female' ? 'Female' : patient.sex;
  if (!['Male', 'Female'].includes(patient.sex)) errors.push('sex must be Male or Female.');
  for (const key of ['contactNumber', 'relativeContact'] as const) {
    if (patient[key] && !/^\d{11}$/.test(patient[key])) errors.push(`${key} must contain exactly 11 digits.`);
  }
  if (patient.philhealthNo && !/^(?:\d{12}|\d{2}-\d{9}-\d)$/.test(patient.philhealthNo)) errors.push('philhealthNo must be 12 digits or XX-XXXXXXXXX-X.');
  if (patient.category === 'Other/s' && !patient.categoryOthers) errors.push('categoryOthers is required for Other/s.');
  if (patient.bloodType && !['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown'].includes(patient.bloodType)) errors.push('bloodType is not supported.');
  return { patient, errors, age };
}

export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Spreadsheet apps can evaluate formulas even in quoted CSV cells.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function importTemplate(): string {
  return '\uFEFF' + IMPORT_COLUMNS.join(',') + '\r\n';
}

export function importReport(results: ImportResult[]): string {
  return '\uFEFFrow,status,message\r\n' + results.map(row => [row.row, row.status, row.message].map(csvCell).join(',')).join('\r\n');
}
