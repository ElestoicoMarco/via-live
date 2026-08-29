export const $ = <T extends HTMLElement = HTMLElement>(s: string, c: Document | HTMLElement = document) => c.querySelector(s) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(s: string, c: Document | HTMLElement = document) => Array.from(c.querySelectorAll(s)) as T[];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const minAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
export const escapeHTML = (str: string) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

export const formatDistance = (km?: number) => (km == null) ? '—' : (km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km');
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
export function timeAgo(iso: string) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `hace ${m} min` : `hace ${(m / 60).toFixed(1)} h`;
}
export const fmtLat = (v: number) => Math.abs(v).toFixed(4) + '°S';
export const fmtLng = (v: number) => Math.abs(v).toFixed(4) + '°O';

export function triggerHaptic(type: 'tap' | 'success' | 'warning' | 'danger') {
  if (!('vibrate' in navigator)) return;
  try {
    if (type === 'tap') navigator.vibrate(25);
    else if (type === 'success') navigator.vibrate([30, 30, 70]);
    else if (type === 'warning') navigator.vibrate([40, 60, 40]);
    else if (type === 'danger') navigator.vibrate([100, 50, 100, 50, 150]);
  } catch (_) {}
}

export function toast(msg: string, kind: 'ok' | 'err' | 'warn' | 'info' = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  const ic = kind === 'ok' ? 'i-check' : kind === 'err' ? 'i-alert' : kind === 'warn' ? 'i-alert' : 'i-info';
  t.innerHTML = `<svg class="ic"><use href="#${ic}"/></svg><span>${escapeHTML(msg)}</span>`;
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 320); }, 2600);
}
