const fs = require('fs');
const path = require('path');
const root = __dirname;

// 1. LIMPIAR INDEX.HTML (Quitar el canvas viejo y preparar el contenedor)
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<div id="mapContainer">[\s\S]*?<\/div>/, '<div id="mapContainer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></div>');
fs.writeFileSync(path.join(root, 'index.html'), html);

// 2. REESCRIBIR MAP ENGINE COMPLETO CON LEAFLET
fs.writeFileSync(path.join(root, 'src/core/mapEngine.ts'), `
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { state } from '../store/state';
import { TYPE_META } from '../types/incident';

export let map: L.Map;
let userMarker: L.Marker | null = null;
let incidentLayers: L.LayerGroup;

export function initMap() {
  // Inicializa Leaflet centrado en San Salvador de Jujuy
  map = L.map('mapContainer', { zoomControl: false, attributionControl: false }).setView([-24.185, -65.297], 13);
  
  // Conectar OpenStreetMap con estilo Dark Matter de CartoDB (Nivel Industrial)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);
  
  incidentLayers = L.layerGroup().addTo(map);

  // Clic derecho en PC (o presionar en el celular) dispara el Admin Modal con Lat/Lng reales
  map.on('contextmenu', (e) => {
    import('../ui/components').then(m => m.openAdminModal(e.latlng.lat, e.latlng.lng));
  });
}

export function updateUserMarker(lat: number, lng: number, accuracy: number) {
  if (!map) return;
  if (!userMarker) {
    const icon = L.divIcon({
      className: 'user-marker-leaflet',
      html: \`<div style="width:20px;height:20px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 15px rgba(59,130,246,0.8);"></div>\`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    userMarker = L.marker([lat, lng], { icon }).addTo(map);
    map.flyTo([lat, lng], 15, { animate: true, duration: 1.5 });
  } else {
    userMarker.setLatLng([lat, lng]);
  }
}

export function rebuildPins() {
  if (!incidentLayers) return;
  incidentLayers.clearLayers();
  
  state.incidents.forEach(inc => {
    const meta = TYPE_META[inc.type];
    
    // Dibujar polilíneas reales (calles cortadas)
    if (inc.polyline && inc.polyline.length > 0) {
       L.polyline(inc.polyline as [number, number][], {
         color: meta.color, weight: 6, opacity: 0.8
       }).addTo(incidentLayers);
    }
    
    // Dibujar marcadores reales
    if (inc.location) {
      const icon = L.divIcon({
        className: 'custom-pin',
        html: \`<div style="background:\${meta.color};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.2);"><svg width="14" height="14" fill="white"><use href="#\${meta.icon}"/></svg></div>\`,
        iconSize: [24, 24], iconAnchor: [12, 12]
      });
      const marker = L.marker([inc.location.lat, inc.location.lng], { icon }).addTo(incidentLayers);
      marker.bindPopup(\`<b>\${inc.roadName}</b><br/>\${inc.description}\`);
    }
  });
}

// Funciones vacías para mantener compatibilidad con el resto del sistema
export function positionOverlays() {}
export function makePin() { rebuildPins(); }
export const pinEls = new Map();
`);

// 3. ACTUALIZAR GPS (Para que controle Leaflet)
fs.writeFileSync(path.join(root, 'src/services/gps.ts'), `
import { state, USER, BBOX } from '../store/state';
import { toast, getDistanceKm } from '../utils/helpers';
import { updateUserMarker } from '../core/mapEngine';
import { renderList, updateReadout } from '../ui/components';

export function initGPS() {
  if (!navigator.geolocation) {
    toast('GPS no soportado', 'err');
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      USER.lat = latitude;
      USER.lng = longitude;
      USER.accuracy = Math.round(accuracy);
      
      // Leaflet ahora se encarga de mover el mapa hacia ti!
      updateUserMarker(latitude, longitude, accuracy);

      state.incidents.forEach(i => {
        if (i.location) i.distanceUserKm = getDistanceKm(USER.lat, USER.lng, i.location.lat, i.location.lng);
      });
      state.incidents.sort((a, b) => (a.distanceUserKm ?? 9999) - (b.distanceUserKm ?? 9999));

      renderList(); updateReadout();
    },
    (err) => {
      toast('GPS inactivo o denegado', 'warn');
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}
`);

// 4. ACTUALIZAR FIRESTORE (Para inyectar lat/lng directamente en lugar de mx/my ficticios)
let fsim = fs.readFileSync(path.join(root, 'src/services/firestoreSim.ts'), 'utf8');
fsim = fsim.replace(/function toMxMy[\s\S]*?}/, '');
fsim = fsim.replace(/const ll = toLatLng\(i\.mx, i\.my\);\s*i\.location = ll;/g, '');
fsim = fsim.replace(/const firstPt = coords\[0\];[\s\S]*?my \}, polyline,/g, `
    const firstPt = coords[0];
    const lat = firstPt[1]; const lng = firstPt[0];
    const polyline = coords.map((pt: number[]) => [pt[1], pt[0]]);
    
    const cause = f.properties.events?.[0]?.description || 'Incidencia detectada por satélite';

    return {
      id: f.properties.id,
      type: info.type,
      severity: info.severity,
      mx:0, my:0,
      location: { lat, lng },
      polyline,
`);
fs.writeFileSync(path.join(root, 'src/services/firestoreSim.ts'), fsim);

// 5. ACTUALIZAR COMPONENTES UI (Modal)
let comp = fs.readFileSync(path.join(root, 'src/ui/components.ts'), 'utf8');
comp = comp.replace(/pendingManualCoords: {mx:number, my:number}/g, 'pendingManualCoords: {lat:number, lng:number}');
comp = comp.replace(/openAdminModal\(mx: number, my: number\)/g, 'openAdminModal(lat: number, lng: number)');
comp = comp.replace(/pendingManualCoords = { mx, my };/g, 'pendingManualCoords = { lat, lng };');
comp = comp.replace(/mx: pendingManualCoords\.mx,\s*my: pendingManualCoords\.my,/g, 'location: { lat: pendingManualCoords.lat, lng: pendingManualCoords.lng }, mx:0, my:0,');
fs.writeFileSync(path.join(root, 'src/ui/components.ts'), comp);

// 6. CSS OVERRIDES (Para acoplar Leaflet a nuestra interfaz glassmorphism)
let css = fs.readFileSync(path.join(root, 'src/styles/main.css'), 'utf8');
css += '\\n\\n/* LEAFLET OVERRIDES */\\n.leaflet-container { font-family: inherit; z-index: 1 !important; background: #0d1117 !important; }\\n.leaflet-control-container { display: none; }\\n#bottomNav, #alertBanner, #toasts, .modal-overlay, #sideSheet { z-index: 2000; }\\n.leaflet-popup-content-wrapper, .leaflet-popup-tip { background: var(--surface-2); color: var(--text-main); border: 1px solid var(--border); }\\n';
fs.writeFileSync(path.join(root, 'src/styles/main.css'), css);

console.log("LEAFLET_PATCH_SUCCESS");
