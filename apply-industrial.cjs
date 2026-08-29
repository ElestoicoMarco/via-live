const fs = require('fs');
const path = require('path');
const root = __dirname;

// 1. Types
fs.writeFileSync(path.join(root, 'src/types/incident.ts'), `
export type IncidentType = 'ACCIDENT' | 'ROAD_CLOSED' | 'ROAD_WORKS' | 'JAM' | 'UNKNOWN';
export interface Location { lat: number; lng: number; }
export interface Incident {
  id: string;
  type: IncidentType;
  severity: number;
  roadName: string;
  description: string;
  startTime: string;
  endTime?: string | null;
  location: Location;
  polyline?: [number, number][];
  distanceUserKm?: number;
}
export const TYPE_META: Record<IncidentType, { icon: string; color: string; label: string }> = {
  ROAD_CLOSED: { icon: 'i-ban', color: '#da3633', label: 'Corte de Ruta' },
  ACCIDENT: { icon: 'i-car', color: '#f85149', label: 'Accidente' },
  ROAD_WORKS: { icon: 'i-cone', color: '#58a6ff', label: 'Obras en Vía' },
  JAM: { icon: 'i-alert', color: '#e3b341', label: 'Congestión' },
  UNKNOWN: { icon: 'i-info', color: '#8b949e', label: 'Información' }
};
export const SEV_LABELS = ['Nula', 'Baja', 'Media', 'Alta', 'Crítica'];
`);

// 2. geoMap.ts
fs.writeFileSync(path.join(root, 'src/core/geoMap.ts'), `
import * as L from 'leaflet';
import { Incident, TYPE_META } from '../types/incident';
import { triggerHaptic } from '../utils/helpers';

export class GeoMapEngine {
  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup = L.layerGroup();
  private polylinesLayer: L.LayerGroup = L.layerGroup();
  private userMarker: L.CircleMarker | null = null;
  private onIncidentSelect: (id: string) => void;
  private onMapLongPress: (lat: number, lng: number) => void;

  constructor(containerId: string, onIncidentSelect: (id: string) => void, onMapLongPress: (lat: number, lng: number) => void) {
    this.onIncidentSelect = onIncidentSelect;
    this.onMapLongPress = onMapLongPress;
    this.initMap(containerId);
  }

  private initMap(containerId: string) {
    this.map = L.map(containerId, {
      center: [-24.1858, -65.2995],
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(this.map);

    this.markersLayer.addTo(this.map);
    this.polylinesLayer.addTo(this.map);

    this.map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      this.onMapLongPress(e.latlng.lat, e.latlng.lng);
    });
  }

  public renderIncidents(incidents: Incident[]) {
    if (!this.map) return;
    this.markersLayer.clearLayers();
    this.polylinesLayer.clearLayers();

    incidents.forEach((inc) => {
      const meta = TYPE_META[inc.type] || TYPE_META.UNKNOWN;
      const customIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: \`
          <div class="pin-marker t-\${inc.type} \${inc.severity >= 4 ? 'critical' : ''}" style="--pin-color: \${meta.color}">
            <span class="pin-inner">
              <svg class="ic"><use href="#\${meta.icon}"/></svg>
            </span>
          </div>
        \`,
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      });

      const marker = L.marker([inc.location.lat, inc.location.lng], { icon: customIcon });
      marker.on('click', () => {
        triggerHaptic('tap');
        this.onIncidentSelect(inc.id);
      });
      this.markersLayer.addLayer(marker);

      if (inc.polyline && inc.polyline.length > 1) {
        const polyline = L.polyline(inc.polyline, {
          color: meta.color,
          weight: 5,
          opacity: 0.85,
          dashArray: inc.type === 'JAM' ? '6, 8' : undefined
        });
        this.polylinesLayer.addLayer(polyline);
      }
    });
  }

  public updateUserLocation(lat: number, lng: number, accuracy: number) {
    if (!this.map) return;
    if (!this.userMarker) {
      this.userMarker = L.circleMarker([lat, lng], {
        radius: 8, fillColor: '#58a6ff', color: '#ffffff', weight: 2.5, opacity: 1, fillOpacity: 0.95
      }).addTo(this.map);
      this.map.flyTo([lat, lng], 15, { duration: 1.2 });
    } else {
      this.userMarker.setLatLng([lat, lng]);
    }
  }

  public flyTo(lat: number, lng: number, zoom = 15) { this.map?.flyTo([lat, lng], zoom, { duration: 1.2 }); }
  public zoomIn() { this.map?.zoomIn(); }
  public zoomOut() { this.map?.zoomOut(); }
}
`);

// 3. gps.ts
fs.writeFileSync(path.join(root, 'src/services/gps.ts'), `
export interface UserPosition { lat: number; lng: number; accuracy: number; }
export class GPSService {
  private static userPos: UserPosition = { lat: -24.1858, lng: -65.2995, accuracy: 15 };
  private static watchId: number | null = null;
  public static startWatching(onUpdate: (pos: UserPosition) => void) {
    if (!('geolocation' in navigator)) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
        onUpdate(this.userPos);
      },
      (err) => console.warn('GPS Error / Permiso denegado:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }
  public static getUserPosition(): UserPosition { return this.userPos; }
}
`);

// 4. firestoreSim.ts
fs.writeFileSync(path.join(root, 'src/services/firestoreSim.ts'), `
import { Incident, IncidentType } from '../types/incident';
import { GPSService } from './gps';
import { getDistanceKm } from '../utils/helpers';
import { state } from '../store/state';

type Subscriber = (incidents: Incident[]) => void;
let subscribers: Subscriber[] = [];

export function subscribeToIncidents(callback: Subscriber) {
  subscribers.push(callback);
  startPolling();
}

function notify() {
  const pos = GPSService.getUserPosition();
  state.incidents.forEach(i => {
    i.distanceUserKm = getDistanceKm(pos.lat, pos.lng, i.location.lat, i.location.lng);
  });
  state.incidents.sort((a, b) => (a.distanceUserKm ?? 9999) - (b.distanceUserKm ?? 9999));
  subscribers.forEach(cb => cb(state.incidents));
}

export function addIncident(inc: Incident) {
  state.incidents.push(inc);
  notify();
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

function startPolling() {
  const syncWithTomTom = async () => {
    if (state.simOffline) return;
    try {
      const res = await fetch('http://localhost:3001/api/tomtom');
      if (!res.ok) throw new Error('Error de conexión');
      const data = await res.json();
      
      const newIncidents: Incident[] = (data.incidents || []).map((f: any) => {
        const cat = f.properties.iconCategory;
        const info = parseTomTomCategory(cat);
        const coords = f.geometry.coordinates;
        const firstPt = coords[0];
        const polyline = coords.map((pt: number[]) => [pt[1], pt[0]] as [number, number]);

        return {
          id: f.properties.id,
          type: info.type,
          severity: info.severity,
          location: { lat: firstPt[1], lng: firstPt[0] },
          polyline,
          roadName: info.title,
          description: f.properties.events?.[0]?.description || 'Satélite',
          startTime: f.properties.startTime || new Date().toISOString()
        };
      });

      const manual = state.incidents.filter(i => i.id.startsWith('MANUAL-'));
      state.incidents = [...newIncidents, ...manual];
      notify();
    } catch (e) { console.error('Fallo Sync', e); }
  };
  syncWithTomTom();
  setInterval(syncWithTomTom, 30000);
}
`);

// 5. state.ts
fs.writeFileSync(path.join(root, 'src/store/state.ts'), `
import { Incident } from '../types/incident';
export const USER = { lat: 0, lng: 0, accuracy: 0 };
export const state = {
  incidents: [] as Incident[],
  simOffline: false,
  currentFilter: 'ALL'
};
`);

// 6. main.ts
fs.writeFileSync(path.join(root, 'src/main.ts'), `
import './styles/main.css';
import 'leaflet/dist/leaflet.css';
import { GeoMapEngine } from './core/geoMap';
import { GPSService } from './services/gps';
import { subscribeToIncidents } from './services/firestoreSim';
import { openSheet, renderList, openAdminModal, initUI } from './ui/components';
import { $, triggerHaptic } from './utils/helpers';
import { state } from './store/state';

export let mapEngine: GeoMapEngine;

function initApp() {
  initUI(); // Inicia los listeners de los modales y pestañas

  mapEngine = new GeoMapEngine(
    'mapContainer', 
    (id) => openSheet(id),
    (lat, lng) => openAdminModal(lat, lng)
  );

  GPSService.startWatching((pos) => {
    mapEngine.updateUserLocation(pos.lat, pos.lng, pos.accuracy);
    const ro = $('#readout');
    if(ro) ro.innerHTML = \`\${Math.abs(pos.lat).toFixed(4)}°S · \${Math.abs(pos.lng).toFixed(4)}°O<br>GPS ±\${pos.accuracy} m · EN VIVO\`;
  });

  $('#btnLocate')?.addEventListener('click', () => {
    triggerHaptic('tap');
    const pos = GPSService.getUserPosition();
    mapEngine.flyTo(pos.lat, pos.lng, 16);
  });
  $('#btnZoomIn')?.addEventListener('click', () => { triggerHaptic('tap'); mapEngine.zoomIn(); });
  $('#btnZoomOut')?.addEventListener('click', () => { triggerHaptic('tap'); mapEngine.zoomOut(); });

  subscribeToIncidents((incidents) => {
    const filtered = state.currentFilter === 'ALL' ? incidents : incidents.filter(i => i.type === state.currentFilter);
    mapEngine.renderIncidents(filtered);
    renderList(incidents); // component.ts renderList usa state.incidents internamente
    const lc = $('#liveCount'); if(lc) lc.textContent = incidents.length.toString();
  });
}

document.addEventListener('DOMContentLoaded', initApp);
`);

// 7. ui/components.ts
let comp = fs.readFileSync(path.join(root, 'src/ui/components.ts'), 'utf8');
comp = "import { mapEngine } from '../main';\n" + comp;
comp = comp.replace(/import { centerOn.*?from '\.\.\/core\/mapEngine';/, '');
comp = comp.replace(/import { map, makePin, pinEls } from '\.\.\/core\/mapEngine';/, '');
comp = comp.replace(/setTimeout\(\(\) => centerOn\(sheetIncident!\.mx, sheetIncident!\.my, 1\.5\), 60\);/g, "setTimeout(() => { if(sheetIncident?.location) mapEngine.flyTo(sheetIncident.location.lat, sheetIncident.location.lng, 16) }, 60);");
comp = comp.replace(/\$\('#btnLocate'\)\?\.addEventListener[^;]+;/g, '');
comp = comp.replace(/\$\('#btnZoomIn'\)\?\.addEventListener[^;]+;/g, '');
comp = comp.replace(/\$\('#btnZoomOut'\)\?\.addEventListener[^;]+;/g, '');
comp = comp.replace(/openAdminModal\(mx: number, my: number\)/g, 'openAdminModal(lat: number, lng: number)');
comp = comp.replace(/pendingManualCoords = { mx, my };/g, 'pendingManualCoords = { lat, lng };');
comp = comp.replace(/mx: pendingManualCoords\.mx, my: pendingManualCoords\.my,/g, 'location: { lat: pendingManualCoords.lat, lng: pendingManualCoords.lng },');
comp = comp.replace(/pendingManualCoords: {mx:number, my:number}/g, 'pendingManualCoords: {lat:number, lng:number}');
// Remover import makePin si quedó por ahí, y arreglar errores TS menores
comp = comp.replace(/import { centerOn.*?from '\.\.\/core\/mapEngine';\r?\n?/g, '');
fs.writeFileSync(path.join(root, 'src/ui/components.ts'), comp);

// 8. index.html
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const newViewMap = \`
  <section id="view-map" class="view active">
    <div id="mapContainer"></div>
    <div class="map-topbar">
      <div class="chip glass" id="liveChip">
        <span class="live-dot"></span> EN VIVO · <b id="liveCount">0</b> incidentes
      </div>
      <div class="chip glass mono" id="clock">--:--:--</div>
    </div>
    <div class="map-toolbar glass">
      <button id="btnLocate" aria-label="Centrar"><svg class="ic"><use href="#i-cross"/></svg></button>
      <button id="btnZoomIn" aria-label="Acercar"><svg class="ic"><use href="#i-plus"/></svg></button>
      <button id="btnZoomOut" aria-label="Alejar"><svg class="ic"><use href="#i-minus"/></svg></button>
    </div>
    <div class="map-legend glass">
      <span class="lg"><i style="background:#f85149"></i>Accid.</span>
      <span class="lg"><i style="background:#da3633"></i>Corte</span>
      <span class="lg"><i style="background:#58a6ff"></i>Obras</span>
      <span class="lg"><i style="background:#e3b341"></i>Cong.</span>
    </div>
    <div class="map-readout glass mono" id="readout">—</div>
  </section>
\`;
html = html.replace(/<section id="view-map"[\\s\\S]*?<\\/section>/, newViewMap);
fs.writeFileSync(path.join(root, 'index.html'), html);

// 9. CSS
let css = fs.readFileSync(path.join(root, 'src/styles/main.css'), 'utf8');
css += \`
#mapContainer { position: absolute; inset: 0; width: 100%; height: 100%; background: #0d1117; z-index: 1; }
.leaflet-control-container { display: none !important; }
.custom-leaflet-pin { background: transparent; border: none; }
.pin-marker { width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: var(--pin-color, #8b949e); border: 2px solid rgba(240, 246, 252, 0.95); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6); cursor: pointer; transition: transform 0.15s ease; }
.pin-marker:active { transform: rotate(-45deg) scale(1.2); }
.pin-marker .pin-inner { transform: rotate(45deg); display: flex; align-items: center; justify-content: center; }
.pin-marker .pin-inner .ic { width: 15px; height: 15px; color: #ffffff; }
.pin-marker.critical { animation: leafletPinPulse 1.6s infinite; }
@keyframes leafletPinPulse { 0% { box-shadow: 0 0 0 0 rgba(248, 81, 73, 0.7); } 70% { box-shadow: 0 0 0 14px rgba(248, 81, 73, 0); } 100% { box-shadow: 0 0 0 0 rgba(248, 81, 73, 0); } }
\`;
fs.writeFileSync(path.join(root, 'src/styles/main.css'), css);

console.log('INDUSTRIAL_UPGRADE_COMPLETE');
