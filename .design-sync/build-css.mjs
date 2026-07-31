// Regenerates the sync's CSS entry. MediSens loads Tailwind from the CDN at runtime,
// so the utilities exist in no stylesheet; this emits them statically for the bundle.
// Order matches the app's cascade: font @import first (CSS requires it), then Tailwind
// preflight+utilities, then dashboard.css tokens (which win ties, as in the app).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cache = path.join(root, '.design-sync/.cache');
fs.mkdirSync(cache, { recursive: true });

execSync(
  'npx tailwindcss -c tailwind.sync.config.cjs -i tailwind.input.css ' +
  `-o ${JSON.stringify(path.join(cache, 'tailwind-static.css'))} --minify`,
  { cwd: path.join(root, '.ds-sync'), stdio: 'inherit' },
);

const tw = fs.readFileSync(path.join(cache, 'tailwind-static.css'), 'utf8');
const dash = fs.readFileSync(path.join(root, 'src/styles/dashboard.css'), 'utf8');

// Line-based, NOT regex-to-semicolon: the Google Fonts @import contains semicolons
// inside its URL (wght@300;400;…), so a [^;]+; match truncates it and the resulting
// invalid at-rule invalidates the whole stylesheet (0 rules parsed).
const imports = [];
const bodyLines = [];
let inHead = true;
for (const line of dash.split(/\r?\n/)) {
  if (inHead && /^\s*@import\b/.test(line)) {
    if (!/;\s*$/.test(line)) throw new Error(`multi-line @import unsupported: ${line}`);
    imports.push(line.trim());
    continue;
  }
  if (inHead && line.trim() !== '') inHead = false;
  bodyLines.push(line);
}
const dashBody = bodyLines.join('\n');

fs.writeFileSync(
  path.join(cache, 'medisens-ds.css'),
  `${imports.join('\n')}\n\n/* --- Tailwind (static build of the CDN utilities) --- */\n${tw}\n\n/* --- MediSens tokens & clinical classes --- */\n${dashBody}`,
);
console.log('wrote .design-sync/.cache/medisens-ds.css');
