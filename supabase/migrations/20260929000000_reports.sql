-- Sites users send from "not handled right". Insert-only for the public key: nobody can read, change or
-- delete rows through the API; read them with the service role (scripts/reports.mjs).
create table public.reports (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  url text not null check (char_length(url) <= 500 and url ~ '^https?://' and position('?' in url) = 0),
  consent text check (char_length(consent) <= 20),
  cmp text check (char_length(cmp) <= 60),
  version text check (char_length(version) <= 20),
  browser text check (char_length(browser) <= 20)
);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant insert (url, consent, cmp, version, browser) on public.reports to anon;
create policy "anyone can send a report" on public.reports for insert to anon with check (true);
