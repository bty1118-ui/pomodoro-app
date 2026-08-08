// Single source of truth for default settings.
// Required by the main process (main.js) and exposed to the renderer
// (preload.js → window.DEFAULTS) so the two sides never drift apart.
module.exports = Object.freeze({
  theme: 'modern',
  workMin: 25,
  shortMin: 5,
  longMin: 15,
  longInterval: 4,
  autoStartBreaks: true,
  autoStartPomodoros: false,
  soundOn: true,
});
