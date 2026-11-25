// The one palette (#24): every colour declutter shows, by role. tokens.css says the same for the pages
// (test/unit.test.mjs checks they match and that no other file has its own hex).
export const PALETTE = {
  accent: '#c96575', // the app icon's rose: brand, focus and links that matter
  accentOnDark: '#e5899a', // the rose on the chip's dark pill
  accentPale: '#f1d3d9', // "handled" field in the popup, light
  accentDeep: '#5e2c37', // the same, dark
  ok: '#30a46c',
  wall: '#f76b15',
  bad: '#e5484d',
  neutral: '#8d8d8d',
  // The toolbar badge's background where it carries white text ("!", "Kč"): darker, for 4.5:1 or more.
  wallBadge: '#c2410c', // 5.2:1 with white
  badBadge: '#c62a2f', // 5.6:1 with white
  pill: '#1c1c1e', // the chip's background
  pillText: '#f2f2f2',
};
