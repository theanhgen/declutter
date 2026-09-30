-- Reports carry the site only (scheme + host + port) from here on; the extension no longer sends a path.
-- Tighten what the public key can insert so the table can't be filled with free text. NOT VALID: rows sent
-- before this keep their paths (delete them by hand if wanted).
alter table public.reports
  add constraint reports_url_site_only check (url ~ '^https?://[^/?#@[:space:]]+$') not valid,
  add constraint reports_consent_word check (consent ~ '^[A-Za-z]{1,20}$') not valid,
  add constraint reports_version_number check (version ~ '^[0-9.]{1,20}$') not valid,
  add constraint reports_browser_known check (browser in ('chrome', 'firefox', 'safari')) not valid;
