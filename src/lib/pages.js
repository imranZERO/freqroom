// Per-page titles and descriptions. The build's prerender step
// (scripts/prerender.js) writes them into each page's static HTML, and App
// sets the title when the route changes in the browser.
export const SITE_URL = 'https://freqroom.pages.dev';

export const PAGES = {
  '/': {
    title: 'FreqRoom | EQ Ear Training',
    description: 'Train your ears to identify EQ frequencies. Interactive ear training for producers, engineers, and audiophiles — with adaptive difficulty and real-time frequency response graphs.',
  },
  '/technical-details': {
    title: 'Technical Details | FreqRoom',
    description: 'How FreqRoom works: the training modes, band placement, peaking, shelf, and pass filters, Sweep scoring, adaptive difficulty, and the Web Audio signal chain.',
  },
};

export const NOT_FOUND = {
  title: 'Page not found | FreqRoom',
  description: 'This page doesn\'t exist. Head back to FreqRoom for EQ ear training.',
};

export const pageFor = path => PAGES[path] ?? NOT_FOUND;
