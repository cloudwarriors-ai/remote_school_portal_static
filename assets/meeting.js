import { api, el, formatCountdown, formatTime, NotSignedIn, serverNow, syncClock } from './common.js';
import { ZOOM_CDN, ZOOM_SDK_VERSION } from '../config.js';

const $ = (id) => document.getElementById(id);
const POLL_MS = 20_000;
const ZOOM_SCRIPTS = [
  `${ZOOM_CDN}/lib/vendor/react.min.js`,
  `${ZOOM_CDN}/lib/vendor/react-dom.min.js`,
  `${ZOOM_CDN}/lib/vendor/redux.min.js`,
  `${ZOOM_CDN}/lib/vendor/redux-thunk.min.js`,
  `${ZOOM_CDN}/lib/vendor/lodash.min.js`,
  `https://source.zoom.us/zoom-meeting-${ZOOM_SDK_VERSION}.min.js`,
];

let join = null; // the "join" response
let leaving = false;

const leaveUrl = () => new URL(`index.html?left=${encodeURIComponent(join.slotKey)}`, location.href).href;

function backToPortal() {
  location.replace(leaveUrl());
}

function leave(reason) {
  if (leaving) return;
  leaving = true;
  if (reason === 'next' && join.next) {
    $('move-notice').textContent = `Moving you to ${join.next.title}…`;
    $('move-notice').hidden = false;
  }
  if (join.mode !== 'zoom') return backToPortal();
  // Zoom redirects to leaveUrl itself; the timeout covers a leave that never completes.
  setTimeout(backToPortal, 4000);
  window.ZoomMtg.leaveMeeting({ success: backToPortal, error: backToPortal });
}

// The API stays in charge: if it says a different class is now in session, move.
async function poll() {
  try {
    const state = await api('now');
    syncClock(state.serverTime);
    if (state.active && state.active.slotKey !== join.slotKey) leave('next');
  } catch (err) {
    if (err instanceof NotSignedIn) leave('signed_out');
    // Network errors: stay in class and try again next poll.
  }
}

function scheduleMove() {
  if (join.autoLeaveAt) setTimeout(() => leave('next'), Math.max(0, join.autoLeaveAt - serverNow()));
  setInterval(poll, POLL_MS);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
}

async function startZoom() {
  for (const src of ZOOM_SCRIPTS) await loadScript(src);
  const { ZoomMtg } = window;
  ZoomMtg.setZoomJSLib(`${ZOOM_CDN}/lib`, '/av');
  ZoomMtg.preLoadWasm();
  ZoomMtg.prepareWebSDK();

  const z = join.zoom;
  await new Promise((resolve, reject) => {
    ZoomMtg.init({
      leaveUrl: leaveUrl(),
      patchJsMedia: true,
      leaveOnPageUnload: true,
      // Skip Zoom's preview screen so the move between classes needs no click.
      disablePreview: true,
      disableInvite: true,
      disableCallOut: true,
      disableRecord: true,
      meetingInfo: ['topic', 'host'],
      success: () => {
        ZoomMtg.join({
          signature: z.signature,
          meetingNumber: z.meetingNumber,
          passWord: z.passWord,
          userName: z.userName,
          userEmail: z.userEmail,
          success: resolve,
          error: reject,
        });
      },
      error: reject,
    });
  });
  $('joining').hidden = true;
  ZoomMtg.inMeetingServiceListener('onMeetingStatus', (data) => {
    // 3 = disconnected (teacher ended the meeting or the student was removed).
    if ((data?.meetingStatus ?? data?.status) === 3) leave('ended');
  });
}

function startMock() {
  $('mock-title').textContent = join.title;
  $('mock-teacher').textContent = join.teacher;
  const names = [join.teacher, 'You', 'Classmate', 'Classmate', 'Classmate', 'Classmate'];
  $('tiles').replaceChildren(...names.map((n) => el('div', { class: 'tile' }, n)));
  $('mock-leave').addEventListener('click', () => leave('student'));
  $('mock-end').addEventListener('click', () => leave('ended'));
  const tick = () => {
    $('mock-countdown').textContent = join.autoLeaveAt && join.next
      ? `Moving to ${join.next.title} at ${formatTime(join.next.startsAt)} (in ${formatCountdown(join.autoLeaveAt - serverNow())})`
      : 'Stays open until your teacher ends class';
  };
  tick();
  setInterval(tick, 1000);
  $('joining').hidden = true;
  $('mock').hidden = false;
}

async function main() {
  const sectionId = new URLSearchParams(location.search).get('section');
  try {
    join = await api('join', { sectionId });
  } catch (err) {
    if (err instanceof NotSignedIn || err.code === 'not_in_session') return location.replace('index.html');
    $('joining-text').textContent = 'Could not join class. Go back to your schedule and try again.';
    $('joining').append(el('a', { href: 'index.html', class: 'button' }, 'Back to schedule'));
    return;
  }
  syncClock(join.serverTime);
  document.title = `${join.title} · In Class`;
  scheduleMove();
  if (join.mode === 'zoom') {
    startZoom().catch((err) => {
      console.error('Zoom join failed', err);
      $('joining').hidden = false;
      $('joining-text').textContent = 'Zoom could not start. Check camera and microphone permissions, then go back and rejoin.';
      $('joining').append(el('a', { href: leaveUrl(), class: 'button' }, 'Back to schedule'));
    });
  } else {
    startMock();
  }
}

main();
