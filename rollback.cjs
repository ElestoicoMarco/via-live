const fs = require('fs');
const path = require('path');
const root = __dirname;

// 1. INDEX.HTML
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<div id="mapContainer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"><\/div>/, `<div id="mapContainer">\n    <canvas id="stage"></canvas>\n    <div id="overlays"></div>\n  </div>`);
fs.writeFileSync(path.join(root, 'index.html'), html);

// 2. CSS
let css = fs.readFileSync(path.join(root, 'src/styles/main.css'), 'utf8');
css = css.split('/* LEAFLET OVERRIDES */')[0];
fs.writeFileSync(path.join(root, 'src/styles/main.css'), css);

// 3. MAP ENGINE
const mapEngineCode = `
import { state, BBOX, toLatLng, W, H, USER } from '../store/state';
import { TYPE_META } from '../types/incident';
import { openAdminModal } from '../ui/components';

export const stage = document.getElementById('stage') as HTMLCanvasElement;
const ctx = stage?.getContext('2d');
export const overlays = document.getElementById('overlays') as HTMLElement;
export const pinEls = new Map<string, HTMLElement>();

let transform = { x: 0, y: 0, scale: 1 };
let isDragging = false, dragStart = { x: 0, y: 0 };

export function initMap() {
  if (!stage || !ctx) return;
  const resize = () => { stage.width = stage.clientWidth; stage.height = stage.clientHeight; renderMap(); };
  window.addEventListener('resize', resize); resize();

  stage.addEventListener('mousedown', e => { isDragging = true; dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y }; stage.style.cursor = 'grabbing'; });
  window.addEventListener('mousemove', e => { if (!isDragging) return; transform.x = e.clientX - dragStart.x; transform.y = e.clientY - dragStart.y; renderMap(); });
  window.addEventListener('mouseup', () => { isDragging = false; stage.style.cursor = 'grab'; });
  
  stage.addEventListener('contextmenu', e => {
    e.preventDefault();
    const mx = (e.clientX - transform.x) / transform.scale;
    const my = (e.clientY - transform.y) / transform.scale;
    const { lat, lng } = toLatLng(mx, my);
    openAdminModal(mx, my);
  });
  
  stage.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
       isDragging = true; dragStart = { x: e.touches[0].clientX - transform.x, y: e.touches[0].clientY - transform.y };
    }
  });
  stage.addEventListener('touchmove', e => {
    if (isDragging && e.touches.length === 1) {
       transform.x = e.touches[0].clientX - dragStart.x; transform.y = e.touches[0].clientY - dragStart.y; renderMap();
    }
  });
  stage.addEventListener('touchend', () => { isDragging = false; });
}

function unproject(mx: number, my: number) {
  return { x: mx * transform.scale + transform.x, y: my * transform.scale + transform.y };
}

export function positionOverlays() {
  state.incidents.forEach(inc => {
    const el = pinEls.get(inc.id);
    if (el) { const p = unproject(inc.mx, inc.my); el.style.transform = \`translate(\${p.x}px, \${p.y}px)\`; }
  });
  const up = document.getElementById('userPin');
  if (up && USER.lat !== 0) {
    const p = unproject(USER.mx, USER.my);
    up.style.transform = \`translate(\${p.x}px, \${p.y}px)\`;
    const acc = document.getElementById('userAcc');
    if (acc) {
      const r = USER.accuracy * transform.scale;
      acc.style.width = \`\${r * 2}px\`; acc.style.height = \`\${r * 2}px\`;
      acc.style.transform = \`translate(\${p.x - r}px, \${p.y - r}px)\`;
    }
  }
}

export function centerOn(mx: number, my: number, scale = 1) {
  transform.scale = scale;
  transform.x = (stage.clientWidth / 2) - (mx * scale);
  transform.y = (stage.clientHeight / 2) - (my * scale);
  renderMap();
}

export function zoomAt(cx: number, cy: number, factor: number) {
  const mx = (cx - transform.x) / transform.scale;
  const my = (cy - transform.y) / transform.scale;
  transform.scale = Math.max(0.2, Math.min(transform.scale * factor, 5));
  transform.x = cx - mx * transform.scale;
  transform.y = cy - my * transform.scale;
  renderMap();
}

export function makePin(inc: any) {
  if (pinEls.has(inc.id)) return;
  const m = TYPE_META[inc.type];
  const el = document.createElement('div'); el.className = 'pin';
  el.innerHTML = \`<div class="pin-icon" style="background:\${m.color}"><svg class="ic" fill="white"><use href="#\${m.icon}"/></svg></div><div class="pin-pulse" style="border-color:\${m.color}"></div>\`;
  el.onclick = () => import('../ui/components').then(m => m.openSheet(inc.id));
  overlays.appendChild(el); pinEls.set(inc.id, el);
}

export function renderMap() {
  if (!ctx) return;
  ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, stage.width, stage.height);
  ctx.save(); ctx.translate(transform.x, transform.y); ctx.scale(transform.scale, transform.scale);
  
  ctx.strokeStyle = '#1c212b'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const drawRoad = (pts: any[]) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for(let i=2; i<pts.length; i+=2) ctx.lineTo(pts[i], pts[i+1]); ctx.stroke(); };
  
  drawRoad([100,200, 1500,200]); drawRoad([100,500, 1500,500]); drawRoad([100,800, 1500,800]);
  drawRoad([400,100, 400,1500]); drawRoad([800,100, 800,1500]); drawRoad([1200,100, 1200,1500]);
  drawRoad([100,1000, 1500,100]); 

  ctx.fillStyle = '#161b22';
  for(let i=0; i<10; i++) { for(let j=0; j<10; j++) { ctx.fillRect(150 + i*300, 250 + j*300, 180, 180); } }

  ctx.fillStyle = '#0d442e'; ctx.fillRect(850, 550, 250, 200);

  const roadLabel = (txt: string, x: number, y: number, ang: number, size=18) => {
    ctx.save(); ctx.translate(x,y); ctx.rotate(ang); ctx.fillStyle='#30363d';
    ctx.font = \`600 \${size}px Inter, sans-serif\`; ctx.fillText(txt, 0, 0); ctx.restore();
  };
  roadLabel('AV. ÉXODO', 1000, 180, 0); roadLabel('AV. FASCIO', 420, 1200, -Math.PI/2);
  
  state.incidents.forEach(inc => {
    if (inc.polyline && inc.polyline.length > 0) {
      ctx.beginPath();
      const m = TYPE_META[inc.type];
      ctx.strokeStyle = m.color; ctx.lineWidth = 6;
      ctx.moveTo(inc.polyline[0][0], inc.polyline[0][1]);
      for (let i=1; i<inc.polyline.length; i++) ctx.lineTo(inc.polyline[i][0], inc.polyline[i][1]);
      ctx.stroke();
    }
  });
  ctx.restore();
  positionOverlays();
}
`;
fs.writeFileSync(path.join(root, 'src/core/mapEngine.ts'), mapEngineCode);

// 4. GPS
const gpsCode = `
import { state, USER, BBOX, W, H } from '../store/state';
import { toast, getDistanceKm } from '../utils/helpers';
import { positionOverlays } from '../core/mapEngine';
import { renderList, updateReadout } from '../ui/components';

function toMxMy(lat: number, lng: number) {
  const mx = ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * W;
  const my = ((BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)) * H;
  return { mx, my };
}

export function initGPS() {
  if (!navigator.geolocation) return toast('GPS no soportado', 'err');
  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      USER.lat = latitude; USER.lng = longitude; USER.accuracy = Math.round(accuracy);
      const coords = toMxMy(latitude, longitude);
      USER.mx = coords.mx; USER.my = coords.my;
      positionOverlays();
      state.incidents.forEach(i => {
        if (i.location) i.distanceUserKm = getDistanceKm(USER.lat, USER.lng, i.location.lat, i.location.lng);
      });
      state.incidents.sort((a, b) => (a.distanceUserKm ?? 9999) - (b.distanceUserKm ?? 9999));
      renderList(); updateReadout();
    },
    (err) => { toast('GPS inactivo o denegado', 'warn'); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}
`;
fs.writeFileSync(path.join(root, 'src/services/gps.ts'), gpsCode);

// 5. FIRESTORE
const fsCode = `
import { state, USER, BBOX, W, H, toLatLng } from '../store/state';
import { getDistanceKm, toast, triggerHaptic, escapeHTML, formatDistance, $ } from '../utils/helpers';
import { Incident, IncidentType } from '../types/incident';
import { makePin, pinEls } from '../core/mapEngine';
import { renderList, updateBadges, updateReportStats, flashSync, openSheet } from '../ui/components';

function toMxMy(lat: number, lng: number) {
  const mx = ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * W;
  const my = ((BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)) * H;
  return { mx, my };
}

export function attachGeo(list: Incident[]) {
  list.forEach(i => {
    const ll = toLatLng(i.mx, i.my); i.location = ll;
    i.distanceUserKm = getDistanceKm(USER.lat, USER.lng, ll.lat, ll.lng);
  });
  list.sort((a, b) => (a.distanceUserKm ?? 9999) - (b.distanceUserKm ?? 9999));
  return list;
}

function parseTomTomCategory(cat: number): { type: IncidentType; severity: number; title: string } {
  switch (cat) {
    case 1: return { type: 'ACCIDENT', severity: 3, title: 'Accidente' };
    case 6: return { type: 'JAM', severity: 2, title: 'Congestión' };
    case 7: return { type: 'ROAD_CLOSED', severity: 3, title: 'Carril cerrado' };
    case 8: return { type: 'ROAD_CLOSED', severity: 4, title: 'Corte de Ruta' };
    case 9: return { type: 'ROAD_WORKS', severity: 2, title: 'Obras en Vía' };
    default: return { type: 'UNKNOWN', severity: 1, title: 'Alerta vial' };
  }
}

export function addIncident(inc: Incident) {
  state.incidents.push(inc); attachGeo(state.incidents); makePin(inc);
  renderList(); updateBadges(); updateReportStats();
}

export function startDemoSimulation() {
  const syncWithTomTom = async () => {
    if (state.simOffline) return;
    try {
      const res = await fetch('http://localhost:3001/api/tomtom');
      if (!res.ok) throw new Error('Error proxy');
      const data = await res.json();
      
      const newIncidents: Incident[] = (data.incidents || []).map((f: any) => {
        const cat = f.properties.iconCategory;
        const info = parseTomTomCategory(cat);
        const coords = f.geometry.coordinates;
        
        const firstPt = coords[0];
        const { mx, my } = toMxMy(firstPt[1], firstPt[0]);
        const polyline = coords.map((pt: number[]) => { const p = toMxMy(pt[1], pt[0]); return [p.mx, p.my]; });

        return {
          id: f.properties.id, type: info.type, severity: info.severity, mx, my,
          polyline, roadName: info.title, description: f.properties.events?.[0]?.description || 'Incidencia detectada por satélite',
          startTime: f.properties.startTime || new Date().toISOString(), endTime: null
        };
      });

      const manualIncidents = state.incidents.filter(i => i.id.startsWith('MANUAL-'));
      state.incidents = attachGeo([...newIncidents, ...manualIncidents]);
      
      pinEls.forEach(el => el.remove()); pinEls.clear();
      state.incidents.forEach(makePin);
      
      renderList(); updateBadges(); updateReportStats(); flashSync();
    } catch (e) {
      console.error(e);
    }
  };
  syncWithTomTom(); setInterval(syncWithTomTom, 30000);
}
`;
fs.writeFileSync(path.join(root, 'src/services/firestoreSim.ts'), fsCode);

// 6. COMPONENTS UI (Fixing toMxMy logic)
let comp = fs.readFileSync(path.join(root, 'src/ui/components.ts'), 'utf8');
comp = comp.replace(/import { map, makePin, pinEls } from '\.\.\/core\/mapEngine';/, "import { centerOn, zoomAt, stage, makePin, pinEls } from '../core/mapEngine';");
comp = comp.replace(/pendingManualCoords: {lat:number, lng:number}/g, 'pendingManualCoords: {mx:number, my:number}');
comp = comp.replace(/openAdminModal\(lat: number, lng: number\)/g, 'openAdminModal(mx: number, my: number)');
comp = comp.replace(/pendingManualCoords = { lat, lng };/g, 'pendingManualCoords = { mx, my };');
comp = comp.replace(/location: { lat: pendingManualCoords\.lat, lng: pendingManualCoords\.lng }, mx:0, my:0,/g, 'mx: pendingManualCoords.mx, my: pendingManualCoords.my,');
comp = comp.replace(/setTimeout\(\(\) => { if\(sheetIncident\?\.location\) map\?\.flyTo\(\[sheetIncident\.location\.lat, sheetIncident\.location\.lng\], 16\) }, 60\);/g, "setTimeout(() => centerOn(sheetIncident!.mx, sheetIncident!.my, 1.5), 60);");
comp = comp.replace(/\$\('#btnLocate'\)\?\.addEventListener\('click', \(\) => { triggerHaptic\('tap'\); map\?\.flyTo\(\[USER\.lat, USER\.lng\], 15\); }\);/g, "$('#btnLocate')?.addEventListener('click', () => { triggerHaptic('tap'); centerOn(USER.mx, USER.my); });");
comp = comp.replace(/\$\('#btnZoomIn'\)\?\.addEventListener\('click', \(\) => { triggerHaptic\('tap'\); map\?\.zoomIn\(\); }\);/g, "$('#btnZoomIn')?.addEventListener('click', () => { triggerHaptic('tap'); zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.28); });");
comp = comp.replace(/\$\('#btnZoomOut'\)\?\.addEventListener\('click', \(\) => { triggerHaptic\('tap'\); map\?\.zoomOut\(\); }\);/g, "$('#btnZoomOut')?.addEventListener('click', () => { triggerHaptic('tap'); zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1 / 1.28); });");
fs.writeFileSync(path.join(root, 'src/ui/components.ts'), comp);

console.log("ROLLBACK_SUCCESS");
