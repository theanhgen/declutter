// Pure decisions for canary/run.mjs: what to compare against and what to say. Unit-tested in test/unit.test.mjs.

const DAY_MS = 86400000;
// Telegram rejects messages over 4096 characters; keep well under it.
const MAX_CHARS = 3500;

// The run to compare with: the newest earlier day. Today's own file (a rerun) is never the baseline, or a rerun
// would diff against itself and hide what broke since yesterday.
export function previousFile(files, today) {
  return files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${today}.json`).sort().pop() ?? null;
}

// Days with no result between the previous run and today (0 when it ran yesterday).
export function missedDays(previous, today) {
  if (!previous) return 0;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(previous.slice(0, 10))) / DAY_MS) - 1);
}

// Most sites failing to load at all means the network (or this Mac) was down, not that every rule broke.
export function looksOffline(consent) {
  return consent.length >= 4 && consent.filter((r) => r.err).length > consent.length / 2;
}

// The message to send, or null when nothing changed and no day was missed.
export function alertText({ summary, failing, before, missed = 0 }) {
  const newlyFailing = failing.filter((f) => !(before ?? []).includes(f));
  const recovered = (before ?? []).filter((f) => !failing.includes(f));
  if (!newlyFailing.length && !recovered.length && !missed && !(before === null && failing.length)) return null;
  const lines = [`declutter canary: ${summary}`];
  if (missed) lines.push('', `No canary result for ${missed} day${missed > 1 ? 's' : ''} before today.`);
  if (newlyFailing.length) lines.push('', 'Broke:', ...newlyFailing.map((f) => `- ${f}`));
  if (recovered.length) lines.push('', 'Fixed:', ...recovered.map((f) => `- ${f}`));
  return truncate(lines);
}

export function truncate(lines) {
  const out = [];
  let size = 0;
  for (const [i, line] of lines.entries()) {
    if (size + line.length + 1 > MAX_CHARS) { out.push(`… and ${lines.length - i} more lines (canary/results)`); break; }
    out.push(line);
    size += line.length + 1;
  }
  return out.join('\n');
}
