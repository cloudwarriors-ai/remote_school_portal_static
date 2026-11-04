import { api, clearLeft, currentStudentId, el, formatCountdown, formatTime, leftSlots, markLeft, NotSignedIn, serverNow, signIn, signOut, syncClock } from './common.js';

const $ = (id) => document.getElementById(id);
const POLL_MS = 10_000;

let state = null; // latest "now"
let todayItems = [];

function goToClass(item) {
  clearLeft(item.slotKey);
  location.assign(`meeting.html?section=${encodeURIComponent(item.sectionId)}`);
}

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}

function renderSchedule() {
  const list = $('schedule');
  list.replaceChildren();
  const activeKey = state?.active?.slotKey;
  for (const item of todayItems) {
    const now = serverNow();
    const done = item.endsAt <= now && item.slotKey !== activeKey;
    const classes = ['row', item.kind, done ? 'done' : '', item.slotKey && item.slotKey === activeKey ? 'current' : ''];
    const label = item.kind === 'class' ? item.title : 'Free period';
    const detail = item.kind === 'class' ? item.teacher : '';
    list.append(el('li', { class: classes.join(' ') },
      el('span', { class: 'time' }, `${formatTime(item.startsAt)} – ${formatTime(item.endsAt)}`),
      el('span', { class: 'title' }, label),
      el('span', { class: 'muted' }, detail)));
  }
  if (!todayItems.length) list.append(el('li', { class: 'row muted' }, 'No classes today.'));
}

function renderStatus() {
  const box = $('status');
  box.replaceChildren();
  if (!state) return;
  const now = serverNow();
  const { active, next } = state;

  if (active && leftSlots().includes(active.slotKey)) {
    const rejoin = el('button', { class: 'button primary' }, `Rejoin ${active.title}`);
    rejoin.addEventListener('click', () => goToClass(active));
    box.append(el('p', { class: 'label' }, 'You left class'), el('h1', {}, active.title), rejoin);
  } else if (active) {
    box.append(el('p', { class: 'label' }, 'Joining now'), el('h1', {}, active.title));
  } else if (next) {
    box.append(
      el('p', { class: 'label' }, 'Next class'),
      el('h1', {}, next.title),
      el('p', { class: 'muted' }, `${next.teacher} · starts ${formatTime(next.startsAt)}`),
      el('p', { class: 'countdown' }, formatCountdown(next.startsAt - now)),
    );
  } else {
    box.append(el('p', { class: 'label' }, 'All done'), el('h1', {}, 'No more classes today'));
  }
  if (active && next) {
    box.append(el('p', { class: 'muted small' }, `After this: ${next.title} at ${formatTime(next.startsAt)}`));
  }
}

async function refresh() {
  try {
    state = await api('now');
    syncClock(state.serverTime);
    const keys = new Set(todayItems.map((i) => i.slotKey));
    if ([state.active, state.next].some((i) => i && !keys.has(i.slotKey))) {
      todayItems = (await api('today')).items;
    }
    showError('');
  } catch (err) {
    if (err instanceof NotSignedIn) return showLogin();
    showError('Connection problem. Retrying…');
    return;
  }
  // The server decides which class is in session; follow it unless the student chose to leave.
  if (state.active && !leftSlots().includes(state.active.slotKey)) return goToClass(state.active);
  renderStatus();
  renderSchedule();
}

async function showLogin() {
  const config = await api('config');
  $('login').hidden = false;
  $('dev-student').replaceChildren(...config.devStudents.map((s) => el('option', { value: s.id }, s.name)));
  $('dev-login').addEventListener('submit', (e) => {
    e.preventDefault();
    signIn($('dev-student').value);
    location.replace('index.html');
  });
}

async function main() {
  const params = new URLSearchParams(location.search);
  if (params.get('left')) markLeft(params.get('left'));
  if (params.size) history.replaceState(null, '', location.pathname);

  if (!currentStudentId()) {
    try {
      return await showLogin();
    } catch {
      return showError('Could not reach the n8n API.');
    }
  }

  let me;
  try {
    me = await api('me');
  } catch (err) {
    if (err instanceof NotSignedIn) {
      signOut();
      return showLogin();
    }
    return showError('Could not reach the n8n API.');
  }

  $('who').textContent = me.name;
  $('who').hidden = false;
  $('logout').hidden = false;
  $('logout').addEventListener('click', () => {
    signOut();
    location.replace('index.html');
  });
  $('today').hidden = false;

  const config = await api('config');
  $('mode').textContent = `Backend: n8n · Schedule: ${config.scheduleMode}`;

  todayItems = (await api('today')).items;
  await refresh();
  setInterval(refresh, POLL_MS);
  setInterval(() => {
    // Start the next class on time even between polls.
    if (state?.next && !state.active && serverNow() >= state.next.startsAt - 1000) refresh();
    else renderStatus();
  }, 1000);
}

main();
