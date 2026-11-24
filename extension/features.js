// What declutter does, said the same way everywhere (#27): the settings page, the store scripts, the site, the welcome
// page, the Safari apps and store/LISTING.md use these words; test/unit.test.mjs checks the copies.
export const FEATURE_LINE = 'Hides YouTube Shorts, posts in feeds and Playables, and answers cookie banners the way you choose.';
// The same line in the apps' lowercase voice (#68).
export const FEATURE_LINE_LOWER = FEATURE_LINE[0].toLowerCase() + FEATURE_LINE.slice(1);
// Consent-O-Matic's categories, same letters and meaning: [letter, name, what it covers].
export const CATEGORIES = [
  ['A', 'preferences and functionality', 'remember your choices (language, region, login) and enhanced personal features; not used to track you on other sites.'],
  ['B', 'performance and analytics', 'count visits and traffic sources, and see how visitors move around the site.'],
  ['D', 'information storage and access', 'store or read identifiers on your device (cookies, advertising and device ids).'],
  ['E', 'content selection, delivery, and reporting', 'personalise content from a profile of your interests, and measure it.'],
  ['F', 'ad selection, delivery, and reporting', 'personalise ads from a profile of your interests, and measure them. includes Google.'],
  ['X', 'other purposes', 'anything the site does not describe clearly or that fits no other category.'],
];
