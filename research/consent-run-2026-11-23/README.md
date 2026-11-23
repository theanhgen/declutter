# Top 200 Czech websites: cookie banners (2026-11-23)

Build: main 28d0d24 (`node build.mjs chrome`), Playwright Chromium via `test/lib.mjs` (desktop UA, cs-CZ, walls **manual**), 3 workers, 15 s per site.
Each site ran twice: with the extension (`raw/ext.jsonl`) and without (`raw/none.jsonl`). Every result other than done/no banner/wall was rerun in a fresh browser (`raw/ext-rerun.jsonl`); results that still looked unexplained were then run alone (`raw/ext-solo-*.jsonl`). The banner buttons of each miss were dumped without the extension (`raw/probe.jsonl`, `probe.js`).

## The list
Source: [Tranco](https://tranco-list.eu) list **8PW6V** (downloaded 2026-11-23), `.cz` domains in rank order (`raw/tranco-cz-top400.csv`). Similarweb/Semrush CZ top lists need an account; Tranco is public and reproducible, but it is a global popularity rank (it includes DNS signals), so the order is only roughly Czech traffic.
Filtered out (`sites.json` → `excluded`): infrastructure, CDN and ad-tech domains (szn.cz, imedia.cz, cpex.cz…), hosting providers and registrars (their rank comes from nameserver lookups), adult sites, foreign piracy mirrors on .cz, and 5 dead domains. Hosts are where `https://www.<domain>/` redirects; duplicates after redirects were merged (ihned.cz→hn.cz, mapy.cz→mapy.com, webnode.cz→webnode.com, ministries→*.gov.cz). Non-.cz sites are in only through those redirects.

## Classes
| Class | Count | Meaning |
|---|---|---|
| done | 110 | banner refused (state `done`, nothing left visible; TCF sites show no consented purposes) |
| no-banner | 28 | no banner with or without the extension |
| wall | 21 | consent-or-pay wall recognised and left alone (correct, D9) |
| wall-unrecognised | 10 | a consent-or-pay wall left visible, but the extension does not tag it as a wall |
| miss | 31 | a banner still visible after rerunning |
| answered wrongly | 0 | no site accepted (all TCF strings had empty purpose consents), no reload loop caused by the extension (chmi.cz, skoda-auto.cz and oneplay.cz navigate as often without it) |
| failed to load | 0 | bistudio.cz, geology.cz and brnostavi.cz time out on `goto` but render; none of them showed a banner |

Batch-run artefacts: drbna.cz, akcniceny.cz, annonce.cz, emimino.cz and ppl.cz looked unanswered in the shared-profile batch run (the CPEx Didomi choice carries over between sites) and were refused when run alone. The first pass also degraded towards the end (several 90 s timeouts); all of those passed on rerun.

## Misses (by rank)
| # | Host | CMP | Refuse / settings button | Note |
|---|---|---|---|---|
| 6 | www.muni.cz | muni-cookies (MU library, cdn.muni.cz) | `.muniweb-bar-cookies__btn-wrap a.btn` with text "Jen nezbytné" | same library as jcu.cz: one rule covers both |
| 19 | www.allwyn.cz | custom dialog | `dialog.consent-dialog button[data-test="consent-bar-necessary"]` ("POUZE NEZBYTNÉ") |  |
| 22 | www.cvut.cz | ctu-cookie-manager (ČVUT) | `#ctu-cm button.negative` ("Zakázat nepotřebné") |  |
| 42 | www.upol.cz | TYPO3 ext "cookies" | no refuse on first layer: `#btn_xp_cookies` ("Více...") → `#tx_cookies_types_submit` ("Potvrdit výběr"); defaults not verified |  |
| 44 | www.webnode.com | Webnode custom (#cbar-root) | `.w-cookie-modal-footer a.w-button` with text "Accept necessary" | webnode.cz redirects here; English banner |
| 52 | www.vse.cz | custom cookieconsent.js (WP theme) | `#cookieconsent button.cookieconsent-accept-none` ("Odmítnout") |  |
| 68 | www.cssz.gov.cz | gov design system cookie bar (Liferay, not the #pvs-cookies-popup our cz-gov rule matches) | `.gov-cookie-bar button.gov-button--primary-outlined` ("ODMÍTNOUT VŠECHNY") | extend cz-gov |
| 73 | www.czu.cz | custom czu-cookies.js | `#webcore-widget-cookieOptIn .btn-bar button.btn-secondary` with text "Odmítnout vše" |  |
| 75 | mpsv.gov.cz | gov design system web components (gov-button) | `.mpsv__cookiebar-actions gov-button` with text "Odmítnout všechny" → inner `button.element` | extend cz-gov |
| 77 | www.mendelu.cz | custom | `#cookies-bar button.cookies-decline` ("Odmítnout vše") |  |
| 109 | www.nkp.cz | kookiecheck | `#kookiecheck__window button.kookiecheck__btn` with text "Pouze nezbytné" |  |
| 113 | www.zakonyprolidi.cz | custom (ASP.NET) | `#btnCPIntroNone` ("Nechci, nesouhlasím") |  |
| 114 | www.smarty.cz | custom | `#consent-banner-disagree` ("Odmítnout vše") |  |
| 115 | www.jcu.cz | muni-cookies (MU library) | as muni.cz | one rule with muni.cz |
| 119 | coi.gov.cz | custom (WP theme cookies.js) | `#cookie-reject` ("Odmítnout") | gov.cz host but not the gov3 popup |
| 122 | www.csas.cz | Commanders Act / TrustCommander | `#popin_tc_privacy_button_2` ("Použít jen nezbytné cookies") | autoconsent has no TrustCommander rule matching this |
| 127 | bandzone.cz | custom notice, no choice ("Využíváním … souhlasíte") | only close: `button[aria-label="Zavřít cookie lištu"]` | no refuse exists; a hide/close rule would not refuse anything |
| 130 | www.dpp.cz | praguebest cookies (cookies.praguebest.cz) | `button[data-cc-reject-all]` ("ODMÍTNOUT") | library likely used by other Praguebest client sites |
| 131 | www.vscht.cz | custom (#csc-app) | `.cookie-content__action button` with text "PŘIJMOUT POUZE NEZBYTNÉ" |  |
| 138 | www.chance.cz | custom React (styled-components) | `button[data-atid="consent-button-reject-all"]` ("Odmítnout vše") |  |
| 139 | favi.cz | custom cookie wall | `#cookie-wall a.settings` → `#frontend_cookie_settings_form_rejectAll` ("Odmítnout vše") |  |
| 140 | www.dek.cz | vue-cookies-bar | `a.v-coo-b__button.v-coo-b__button-white` ("Odmítnout nepovinné") |  |
| 142 | www.bike-forum.cz | custom (Stimulus) | `#cookie-consent-reject` ("Odmítnout vše") |  |
| 151 | www.fler.cz | custom | `#cookies_2022_content [data-action="confirm_minimum_panel"]` (link "zde" = only necessary) |  |
| 153 | www.benu.cz | custom | `button[name="rejectAll"]` ("Odmítnout vše") |  |
| 157 | www.jenprace.cz | custom | no refuse on first layer: `#cookie-bar-button-open` → `#cookie-bar-button-save-selected` ("Přijmout vybrané"); defaults not verified |  |
| 162 | www.slu.cz | custom (toastr) | `#allow-cookies-technical-button` ("Pouze nutné") |  |
| 171 | www.osu.cz | custom (cookies-js.php) | first layer has only a link "Více informací o cookies a jejich nastavení"; refuse not found | needs a manual look |
| 178 | www.aaaauto.cz | autoX cookiebar-v2 (img.autox.cz) | `button[data-cookie-save="decline"]` ("Pouze nezbytné cookies") |  |
| 182 | www.studentagency.cz | custom (Next.js, hashed class names) | button with text "Odmítnout vše" in the banner (classes like `cOXJIq_buttons` are build hashes; match by text) |  |
| 185 | www.postaonline.cz | custom (Liferay) | `#decline-optional-cookies-button` ("Odmítnout volitelné cookies") |  |

## Walls not recognised (by rank)
Left visible, so the behaviour is right, but the state is not `wall`. On the CPEx sites the extension first refuses the Didomi layer underneath; on kurzy.cz and parlamentnilisty.cz the refusal is what brings up the pay-or-consent wall.
| # | Host | Wall element | Extension state |
|---|---|---|---|
| 65 | www.kurzy.cz | div#alia_force_ad_div.fa_h | done/funding-choices |
| 89 | www.zbozi.cz | div#cwl-main.cwl-dialog | - |
| 103 | www.sauto.cz | div#cwl-main.cwl-dialog | - |
| 108 | www.parlamentnilisty.cz | div#.cookie-consent | done/consentmanager.net |
| 117 | www.sbazar.cz | div#cwl-main.cwl-dialog | - |
| 134 | www.penize.cz | div#cpexSubs_modalWrapper. | done/didomi |
| 143 | www.ahaonline.cz | div#cpexSubs_modalWrapper. | done/didomi |
| 164 | www.garaz.cz | div#cwl-main.cwl-dialog | - |
| 167 | www.auto.cz | div#cpexSubs_modalWrapper. | - |
| 183 | zdopravy.cz | div#cpexSubs_modalWrapper. | done/didomi |

## Compared with canary/sites.json
44 of the 200 are already in the canary. 128 sites that showed a banner or wall are new: www.livescore.cz, www.cuni.cz, www.muni.cz, tv.nova.cz, www.windguru.cz, www.allwyn.cz, www.cvut.cz, www.avcr.cz, www.vinted.cz, www.phoca.cz, www.firmy.cz, www.fio.cz, english.radio.cz, www.sportisimo.cz, www.vut.cz, www.upol.cz, www.lidl.cz, www.webnode.com, www.brnostavi.cz, www.zcu.cz, www.hokej.cz, www.stesti.cz, portal.rozhlas.cz, www.estranky.cz, www.vse.cz, msp.gov.cz, www.vsb.cz, www.tiscali.cz, www.lidovky.cz, aukro.cz, www.megaknihy.cz, www.kurzy.cz, www.skolaonline.cz, www.ceskyflorbal.cz, www.cssz.gov.cz, www.e15.cz, www.czu.cz, www.odkarla.cz, mpsv.gov.cz, www.chmi.cz, www.mendelu.cz, historie.cz, www.databazeknih.cz, www.zive.cz, www.utb.cz, www.ceskenoviny.cz, www.zbozi.cz, www.knihydobrovsky.cz, www.glami.cz, volny.centrum.cz, hn.cz, www.skoda-auto.cz, www.lovecpokladu.cz, mf.gov.cz, www.sauto.cz, www.karaoketexty.cz, www.shoptet.cz, denikn.cz, www.parlamentnilisty.cz, www.nkp.cz, www.cnb.cz, www.echo24.cz, www.cez.cz, www.zakonyprolidi.cz, www.smarty.cz, www.jcu.cz, www.sbazar.cz, coi.gov.cz, www.decathlon.cz, www.drmax.cz, www.csas.cz, www.martinus.cz, www.retrogames.cz, bandzone.cz, www.ujep.cz, www.ifortuna.cz, www.dpp.cz, www.vscht.cz, www.aboutyou.cz, www.meteocentrum.cz, www.penize.cz, www.in-pocasi.cz, www.drbna.cz, www.chance.cz, favi.cz, www.dek.cz, www.emimino.cz, www.bike-forum.cz, www.ahaonline.cz, www.ppl.cz, knihobot.cz, www.fler.cz, www.eurofotbal.cz, www.benu.cz, www.invia.cz, www.jenprace.cz, www.akcniceny.cz, www.avizo.cz, www.drevostavitel.cz, www.tenisportal.cz, www.slu.cz, www.garaz.cz, www.mimibazar.cz, www.tchibo.cz, www.auto.cz, www.reflex.cz, www.kaufland.cz, www.kinobox.cz, www.osu.cz, www.astratex.cz, www.edna.cz, www.upce.cz, www.aaaauto.cz, www.tul.cz, www.obi.cz, www.studentagency.cz, zdopravy.cz, www.postaonline.cz, www.expres.cz, www.prace.cz, www.rossmann.cz, www.annonce.cz, www.hornbach.cz, www.planeo.cz, gymbeam.cz, www.xchat.cz, www.altisport.cz, www.zalando-lounge.cz.

## Files
`sites.json` (the list), `results.json` (per site: class, state, rule, banner, baseline banner, TCF data), `raw/` (JSONL per run), `shots/` (one screenshot per miss / unrecognised wall, with the extension, after the rerun), `run.mjs` / `probe.mjs` (rerun: `node research/consent-run-2026-11-23/run.mjs ext|none [host…]`).
