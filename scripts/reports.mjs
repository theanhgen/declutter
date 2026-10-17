// Reports users sent from the popup ("send to developer"), newest first. The secret key comes from Bitwarden.
//   node scripts/reports.mjs [days=30]
//   node scripts/reports.mjs --open [days=30]   -> only reports nobody has handled yet; exit 1 if there are any
// A report is handled when its host is in canary/sites.json (added with the fix) and the report is older than the
// commit that added it there, or when canary/reports-skip.json lists the host with the reason it needs no fix.
// archive.sh runs --open before every upload, so a build never goes out with unread reports.
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const open = process.argv.includes('--open');
const days = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 30);
const key = process.env.DECLUTTER_REPORTS_KEY ?? execSync(
  'export BW_SESSION="$(~/.agents/skills/custom/bitwarden-cli/scripts/bw-session.sh)" && bw get password declutter-reports-secret-key',
  { encoding: 'utf8', shell: '/bin/zsh' }).trim();
const since = new Date(Date.now() - days * 864e5).toISOString();
const res = await fetch(`https://wpsmgzihqgdmsrvzpcca.supabase.co/rest/v1/reports?select=*&at=gte.${since}&order=at.desc`,
  { headers: { apikey: key } });
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
let rows = await res.json();

if (open) {
  const { sites } = JSON.parse(fs.readFileSync(path.join(root, 'canary/sites.json'), 'utf8'));
  const skipFile = path.join(root, 'canary/reports-skip.json');
  const skip = fs.existsSync(skipFile) ? JSON.parse(fs.readFileSync(skipFile, 'utf8')) : {};
  const added = new Map();
  // When the host entered canary/sites.json (first commit that adds the line); a report after that is a regression.
  const addedAt = (host) => {
    if (!added.has(host)) {
      const out = execFileSync('git', ['log', '--reverse', '--format=%cI', '-S', `"host": "${host}"`, '--', 'canary/sites.json'],
        { cwd: root, encoding: 'utf8' }).trim().split('\n')[0];
      added.set(host, out ? new Date(out) : new Date()); // listed but not committed yet: counts as handled now
    }
    return added.get(host);
  };
  rows = rows.filter((r) => {
    const host = new URL(r.url).host;
    if (skip[host]) return false;
    if (!sites.some((s) => s.host === host)) return true;
    return new Date(r.at) > addedAt(host);
  });
}
for (const r of rows) console.log(`${r.at.slice(0, 16).replace('T', ' ')}  ${r.browser.padEnd(7)} ${r.version.padEnd(6)} ${r.consent.padEnd(8)} ${(r.cmp || '-').padEnd(20)} ${r.url}`);
console.log(`${rows.length} ${open ? 'open ' : ''}report(s) in the last ${days} days`);
if (open && rows.length) process.exit(1);
