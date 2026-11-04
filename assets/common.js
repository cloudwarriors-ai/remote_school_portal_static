// Shared helpers for the portal and meeting pages (static-site version).
// Differences from public/assets/common.js: there is no cookie session and no same-origin
// server. The signed-in student id lives in sessionStorage and every call is one POST to the
// n8n API. Nothing is stored server side.
import { API_URL } from '../config.js';

let clockOffset = 0;

// Use the server's clock so every student moves at the same moment, whatever their laptop says.
export function syncClock(serverTime) {
  clockOffset = serverTime - Date.now();
}

export function serverNow() {
  return Date.now() + clockOffset;
}

export class NotSignedIn extends Error {}

const STUDENT_KEY = 'studentId';

export function currentStudentId() {
  try {
    return sessionStorage.getItem(STUDENT_KEY) || '';
  } catch {
    return '';
  }
}

export function signIn(studentId) {
  sessionStorage.setItem(STUDENT_KEY, studentId);
}

export function signOut() {
  try {
    sessionStorage.removeItem(STUDENT_KEY);
  } catch {
    // Nothing to clear.
  }
}

// action is one of: config, me, today, now, join. text/plain keeps this a "simple" cross-origin
// request, so the browser sends no CORS preflight.
export async function api(action, body = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action, studentId: currentStudentId(), ...body }),
  });
  if (res.status === 401) throw new NotSignedIn();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.code = data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

export function formatTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Slots the student chose to leave (or that the teacher ended), so the portal doesn't pull them straight back in.
const LEFT_KEY = 'leftSlots';

export function leftSlots() {
  try {
    return JSON.parse(sessionStorage.getItem(LEFT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLeft(list) {
  try {
    sessionStorage.setItem(LEFT_KEY, JSON.stringify(list.slice(-20)));
  } catch {
    // Storage blocked: the student will just be rejoined, which is the safe default.
  }
}

export function markLeft(slotKey) {
  if (!leftSlots().includes(slotKey)) saveLeft([...leftSlots(), slotKey]);
}

export function clearLeft(slotKey) {
  saveLeft(leftSlots().filter((k) => k !== slotKey));
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child);
  return node;
}
