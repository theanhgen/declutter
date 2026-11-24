-- What went wrong, picked by the user after a report is sent (#18). The public key can only insert, so the reason
-- arrives as a second row for the same site, sent right after the first; scripts/reports.mjs joins them. Fixed words
-- only, never free text; a Shorts report names the page type, never the path. Nullable: 1.2.x clients don't send it.
alter table public.reports add column reason text
  constraint reports_reason_word check (reason ~ '^(banner|broken|other|shorts:(home|search|channel|watch|other))$');
grant insert (reason) on public.reports to anon;
