// Reports users sent from the popup ("send to developer"), newest first. The secret key comes from Bitwarden.
//   node scripts/reports.mjs [days=30]
import { execSync } from 'node:child_process';

const days = Number(process.argv[2] ?? 30);
const key = process.env.DECLUTTER_REPORTS_KEY ?? execSync(
  'export BW_SESSION="$(~/.agents/skills/custom/bitwarden-cli/scripts/bw-session.sh)" && bw get password declutter-reports-secret-key',
  { encoding: 'utf8', shell: '/bin/zsh' }).trim();
const since = new Date(Date.now() - days * 864e5).toISOString();
const res = await fetch(`https://wpsmgzihqgdmsrvzpcca.supabase.co/rest/v1/reports?select=*&at=gte.${since}&order=at.desc`,
  { headers: { apikey: key } });
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const rows = await res.json();
for (const r of rows) console.log(`${r.at.slice(0, 16).replace('T', ' ')}  ${r.browser.padEnd(7)} ${r.version.padEnd(6)} ${r.consent.padEnd(8)} ${(r.cmp || '-').padEnd(20)} ${r.url}`);
console.log(`${rows.length} report(s) in the last ${days} days`);
