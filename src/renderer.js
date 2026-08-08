'use strict';

// ============================================================
//  Constants & schema
// ============================================================
// Defaults come from the main process via preload (single source of truth in
// defaults.js). The inline fallback only applies if this file is ever opened
// outside Electron, which does not happen in the shipped app.
const DEFAULTS = window.DEFAULTS || {
  theme: 'modern', workMin: 25, shortMin: 5, longMin: 15, longInterval: 4,
  autoStartBreaks: true, autoStartPomodoros: false, soundOn: true,
};

// PHASE_META describes each phase structurally; its colors come from the active
// theme (THEMES below). Add a phase here and nothing else needs to change.
const PHASE_META = {
  work:  { label: 'Focus',       minKey: 'workMin',  kind: 'focus' },
  short: { label: 'Short Break', minKey: 'shortMin', kind: 'break' },
  long:  { label: 'Long Break',  minKey: 'longMin',  kind: 'break' },
};

// Each theme holds the base UI tokens (CSS variables) plus the three phase
// accent colors. Switching a theme restyles everything at once.
const THEMES = {
  modern: {
    name: 'Modern',
    base: {
      '--bg': '#f7f7f8', '--card': '#ffffff', '--text': '#2b2d31',
      '--text-dim': '#8a8f98', '--border': '#ececef', '--hover': '#f1f1f3',
      '--thumb': '#d8d8de', '--shadow': '0 4px 24px rgba(0,0,0,0.06)',
    },
    phases: {
      work:  { accent: '#e76f51', accentSoft: 'rgba(231,111,81,0.12)' },
      short: { accent: '#2a9d8f', accentSoft: 'rgba(42,157,143,0.12)' },
      long:  { accent: '#457b9d', accentSoft: 'rgba(69,123,157,0.12)' },
    },
  },
  dark: {
    name: 'Dark',
    base: {
      '--bg': '#1e1f22', '--card': '#2b2d31', '--text': '#e6e6ea',
      '--text-dim': '#9a9da6', '--border': '#3a3d42', '--hover': '#353739',
      '--thumb': '#45484e', '--shadow': '0 4px 24px rgba(0,0,0,0.35)',
    },
    phases: {
      work:  { accent: '#ff8a65', accentSoft: 'rgba(255,138,101,0.18)' },
      short: { accent: '#4dd0c1', accentSoft: 'rgba(77,208,193,0.18)' },
      long:  { accent: '#7aa7d7', accentSoft: 'rgba(122,167,215,0.18)' },
    },
  },
  warm: {
    name: 'Warm sunset',
    base: {
      '--bg': '#fdf6f0', '--card': '#ffffff', '--text': '#4a3f37',
      '--text-dim': '#9a8a7c', '--border': '#f0e4d8', '--hover': '#f7eee4',
      '--thumb': '#e6d5c4', '--shadow': '0 4px 24px rgba(160,90,40,0.08)',
    },
    phases: {
      work:  { accent: '#f4a261', accentSoft: 'rgba(244,162,97,0.15)' },
      short: { accent: '#e76f51', accentSoft: 'rgba(231,111,81,0.15)' },
      long:  { accent: '#c1666b', accentSoft: 'rgba(193,102,107,0.15)' },
    },
  },
  cool: {
    name: 'Cool ocean',
    base: {
      '--bg': '#f4f7fa', '--card': '#ffffff', '--text': '#2c3e50',
      '--text-dim': '#8a9aab', '--border': '#e2e8ee', '--hover': '#eaf0f5',
      '--thumb': '#cdd8e3', '--shadow': '0 4px 24px rgba(40,80,120,0.08)',
    },
    phases: {
      work:  { accent: '#4cc9f0', accentSoft: 'rgba(76,201,240,0.16)' },
      short: { accent: '#2a9d8f', accentSoft: 'rgba(42,157,143,0.16)' },
      long:  { accent: '#5a7cbf', accentSoft: 'rgba(90,124,191,0.16)' },
    },
  },
};

const NUMERIC_KEYS = ['workMin', 'shortMin', 'longMin', 'longInterval'];
const CHECK_KEYS = ['autoStartBreaks', 'autoStartPomodoros', 'soundOn'];
const RUNTIME_KEYS = ['phase', 'remainingMs', 'completedInRound', 'currentTaskId'];
const TOGGLE_LABEL = { idle: 'Start', running: 'Pause', paused: 'Resume' };

// ============================================================
//  State
// ============================================================
const state = {
  phase: 'work',
  status: 'idle',
  durationMs: DEFAULTS.workMin * 60000,
  remainingMs: DEFAULTS.workMin * 60000,
  endTime: null,
  completedInRound: 0,
  totalPomodoros: 0,
  settings: null,
  tasks: [],
  currentTaskId: null,
  tickHandle: null,
};

// ============================================================
//  DOM
// ============================================================
const el = {
  phaseLabel: document.getElementById('phaseLabel'),
  ringProgress: document.getElementById('ringProgress'),
  timeDisplay: document.getElementById('timeDisplay'),
  toggleBtn: document.getElementById('toggleBtn'),
  resetBtn: document.getElementById('resetBtn'),
  sessionDots: document.getElementById('sessionDots'),
  taskInput: document.getElementById('taskInput'),
  addTaskBtn: document.getElementById('addTaskBtn'),
  taskList: document.getElementById('taskList'),
  themeSelect: document.getElementById('themeSelect'),
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),
};
NUMERIC_KEYS.concat(CHECK_KEYS).forEach((k) => { el[k] = document.getElementById(k); });

const RADIUS = 100;
const CIRC = 2 * Math.PI * RADIUS;
// stroke-dasharray is constant — set it once; only the offset animates per tick.
el.ringProgress.setAttribute('stroke-dasharray', CIRC);

// ============================================================
//  Helpers
// ============================================================
const msForPhase = (phase) => state.settings[PHASE_META[phase].minKey] * 60000;
const getTask = (id) => state.tasks.find((t) => t.id === id);
const phaseColor = (phase) => (THEMES[state.settings.theme] || THEMES.modern).phases[phase];

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Re-establish the "current task" invariant: an undone task, else null.
function repickCurrent() {
  const t = state.tasks.find((x) => !x.done);
  state.currentTaskId = t ? t.id : null;
}

function stopTick() {
  clearInterval(state.tickHandle);
  state.tickHandle = null;
}

// ============================================================
//  Theming
// ============================================================
// Apply a theme's base UI tokens. Phase accents are applied separately by
// setPhaseColors() so they track the current phase.
function applyTheme(themeId) {
  const theme = THEMES[themeId] || THEMES.modern;
  Object.entries(theme.base).forEach(([k, v]) => {
    document.documentElement.style.setProperty(k, v);
  });
}

function setPhaseColors(phase) {
  const c = phaseColor(phase);
  document.documentElement.style.setProperty('--accent', c.accent);
  document.documentElement.style.setProperty('--accent-soft', c.accentSoft);
  el.phaseLabel.textContent = PHASE_META[phase].label;
  el.ringProgress.setAttribute('stroke', c.accent);
}

// ============================================================
//  Rendering
// ============================================================
function renderRing() {
  const progress = state.durationMs > 0 ? state.remainingMs / state.durationMs : 0;
  el.ringProgress.setAttribute('stroke-dashoffset', CIRC * (1 - progress));
}

function renderTime() {
  el.timeDisplay.textContent = fmt(state.remainingMs);
}

function renderClock() {
  renderTime();
  renderRing();
}

function renderToggle() {
  el.toggleBtn.textContent = TOGGLE_LABEL[state.status];
}

function renderDots() {
  const total = state.settings.longInterval;
  el.sessionDots.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < state.completedInRound ? ' done' : '');
    el.sessionDots.appendChild(d);
  }
}

function renderTasks() {
  el.taskList.innerHTML = '';
  if (state.tasks.length === 0) {
    const hint = document.createElement('li');
    hint.className = 'empty-hint';
    hint.textContent = '暂无任务，先添加一个吧。';
    el.taskList.appendChild(hint);
    return;
  }
  state.tasks.forEach((t) => {
    const li = document.createElement('li');
    li.className =
      'task-item' +
      (t.done ? ' done' : '') +
      (t.id === state.currentTaskId && !t.done ? ' current' : '');
    li.dataset.id = t.id;
    // Structure via innerHTML (static markup, no user data); values via
    // textContent so user-entered text can never inject HTML.
    li.innerHTML =
      '<div class="task-check" data-action="toggle"></div>' +
      '<span class="task-text" data-action="set"></span>' +
      '<span class="task-pomo"></span>' +
      '<button class="task-del" data-action="delete" type="button">✕</button>';
    li.querySelector('.task-check').textContent = t.done ? '✓' : '';
    li.querySelector('.task-text').textContent = t.text;
    li.querySelector('.task-pomo').textContent = '🍅 ' + (t.pomodoros || 0);
    el.taskList.appendChild(li);
  });
}

// ============================================================
//  Timer engine (timestamp-based to avoid drift)
// ============================================================
let lastPersist = 0;

function tick() {
  state.remainingMs = Math.max(0, state.endTime - Date.now());
  renderClock();
  if (state.remainingMs === 0) {
    completePhase();
    return;
  }
  const now = Date.now();
  if (now - lastPersist > 5000) {
    lastPersist = now;
    persist();
  }
}

function startTimer() {
  state.status = 'running';
  state.endTime = Date.now() + state.remainingMs;
  stopTick();
  state.tickHandle = setInterval(tick, 250);
  lastPersist = Date.now();
  renderToggle();
  persist();
}

function pauseTimer() {
  state.status = 'paused';
  state.remainingMs = Math.max(0, state.endTime - Date.now());
  stopTick();
  renderToggle();
  persist();
}

function resetTimer() {
  stopTick();
  state.status = 'idle';
  state.remainingMs = state.durationMs;
  renderClock();
  renderToggle();
  persist();
}

function completePhase() {
  stopTick();
  state.remainingMs = 0;

  const meta = PHASE_META[state.phase];
  if (state.settings.soundOn) playChime();
  notify('时间到！', '刚完成了「' + meta.label + '」');

  let nextPhase;
  if (meta.kind === 'focus') {
    state.completedInRound += 1;
    state.totalPomodoros += 1;
    const t = getTask(state.currentTaskId);
    if (t) t.pomodoros = (t.pomodoros || 0) + 1;
    nextPhase = state.completedInRound >= state.settings.longInterval ? 'long' : 'short';
    if (nextPhase === 'long') state.completedInRound = 0;
  } else {
    nextPhase = 'work';
  }

  renderTasks();
  setPhase(nextPhase); // also re-renders dots

  const nextIsFocus = PHASE_META[nextPhase].kind === 'focus';
  const autoStart = nextIsFocus ? state.settings.autoStartPomodoros : state.settings.autoStartBreaks;
  if (autoStart) {
    startTimer(); // startTimer already persists
  } else {
    state.status = 'idle';
    renderToggle();
    persist();
  }
}

function setPhase(phase) {
  state.phase = phase;
  state.durationMs = msForPhase(phase);
  state.remainingMs = state.durationMs;
  setPhaseColors(phase);
  renderClock();
  renderDots();
}

// ============================================================
//  Sound — Web Audio synthesized chime (no asset needed)
// ============================================================
let audioCtx = null;

function primeAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (_e) {
    /* audio unavailable */
  }
}

function playChime() {
  try {
    primeAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const notes = [880, 1175]; // A5 then D6 — a pleasant two-note bell
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = now + i * 0.16;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.65);
    });
  } catch (_e) {
    /* ignore */
  }
}

// ============================================================
//  Tasks
// ============================================================
function addTask() {
  const text = el.taskInput.value.trim();
  if (!text) return;
  const task = { id: uid(), text: text, done: false, pomodoros: 0 };
  state.tasks.push(task);
  const cur = getTask(state.currentTaskId);
  if (!cur || cur.done) state.currentTaskId = task.id;
  el.taskInput.value = '';
  renderTasks();
  persist();
}

function toggleTask(id) {
  const t = getTask(id);
  if (!t) return;
  t.done = !t.done;
  if (t.done && state.currentTaskId === id) repickCurrent();
  renderTasks();
  persist();
}

function setCurrent(id) {
  const t = getTask(id);
  if (!t || t.done) return;
  state.currentTaskId = id;
  renderTasks();
  persist();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((x) => x.id !== id);
  if (state.currentTaskId === id) repickCurrent();
  renderTasks();
  persist();
}

// ============================================================
//  Settings
// ============================================================
function applySettingsToInputs() {
  const s = state.settings;
  el.themeSelect.value = s.theme;
  NUMERIC_KEYS.forEach((k) => { el[k].value = s[k]; });
  CHECK_KEYS.forEach((k) => { el[k].checked = s[k]; });
}

function bindSettings() {
  NUMERIC_KEYS.forEach((key) => {
    el[key].addEventListener('change', () => {
      let v = parseInt(el[key].value, 10);
      if (isNaN(v)) v = DEFAULTS[key];
      v = Math.max(parseInt(el[key].min, 10), Math.min(parseInt(el[key].max, 10), v));
      el[key].value = v;
      state.settings[key] = v;
      if (state.status === 'idle') {
        state.durationMs = msForPhase(state.phase);
        state.remainingMs = state.durationMs;
        renderClock();
        renderDots();
      }
      persist();
    });
  });
  CHECK_KEYS.forEach((key) => {
    el[key].addEventListener('change', () => {
      state.settings[key] = el[key].checked;
      persist();
    });
  });
}

// Theme switching: apply base tokens immediately, then re-apply the current
// phase's accent so the ring/labels track the new palette.
function bindTheme() {
  el.themeSelect.addEventListener('change', () => {
    state.settings.theme = el.themeSelect.value;
    applyTheme(state.settings.theme);
    setPhaseColors(state.phase);
    persist();
  });
}

// ============================================================
//  Tabs (generic: any tab shows the panel whose data-panel matches)
// ============================================================
function bindTabs() {
  el.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      el.tabs.forEach((t) => t.classList.toggle('active', t === tab));
      el.panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== target));
    });
  });
}

// One delegated listener replaces a per-row listener on every task element.
function bindTaskList() {
  el.taskList.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const actionEl = e.target.closest('[data-action]');
    const action = actionEl && actionEl.dataset.action;
    if (action === 'toggle') toggleTask(row.dataset.id);
    else if (action === 'delete') deleteTask(row.dataset.id);
    else if (action === 'set') setCurrent(row.dataset.id);
  });
}

// ============================================================
//  Persistence
// ============================================================
function notify(title, body) {
  if (window.api && window.api.showNotification) window.api.showNotification(title, body);
}

function persist() {
  if (!window.api) return;
  const runtime = {};
  RUNTIME_KEYS.forEach((k) => { runtime[k] = state[k]; });
  window.api.saveConfig({
    settings: state.settings,
    tasks: state.tasks,
    stats: { totalPomodoros: state.totalPomodoros || 0 },
    runtime: runtime,
  });
}

async function load() {
  let cfg = null;
  if (window.api) cfg = await window.api.loadConfig();
  cfg = cfg || {};

  state.settings = Object.assign({}, DEFAULTS, cfg.settings || {});
  state.tasks = Array.isArray(cfg.tasks) ? cfg.tasks : [];
  state.totalPomodoros = (cfg.stats && cfg.stats.totalPomodoros) || 0;

  const rt = cfg.runtime || {};
  state.phase = rt.phase && PHASE_META[rt.phase] ? rt.phase : 'work';
  state.completedInRound = rt.completedInRound || 0;
  state.status = 'idle';
  state.durationMs = msForPhase(state.phase);

  const restored = typeof rt.remainingMs === 'number';
  state.remainingMs = restored && rt.remainingMs > 0 && rt.remainingMs <= state.durationMs
    ? rt.remainingMs
    : state.durationMs;

  state.currentTaskId = rt.currentTaskId || null;
  const cur = getTask(state.currentTaskId);
  if (!cur || cur.done) repickCurrent();

  applyTheme(state.settings.theme);
  setPhaseColors(state.phase);
  applySettingsToInputs();
  renderClock();
  renderDots();
  renderToggle();
  renderTasks();
}

// ============================================================
//  Wire up
// ============================================================
el.toggleBtn.addEventListener('click', () => {
  primeAudio(); // unlock audio on the first user gesture
  if (state.status === 'running') pauseTimer();
  else startTimer();
});
el.resetBtn.addEventListener('click', resetTimer);
el.addTaskBtn.addEventListener('click', addTask);
el.taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

bindTabs();
bindSettings();
bindTheme();
bindTaskList();
load();
