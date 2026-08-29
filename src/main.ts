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
  initUI(); // Inicia la UI

  mapEngine = new GeoMapEngine(
    'mapContainer', 
    (id) => openSheet(id),
    (lat, lng) => openAdminModal(lat, lng)
  );

  GPSService.startWatching((pos) => {
    mapEngine.updateUserLocation(pos.lat, pos.lng, pos.accuracy);
    const ro = $('#readout');
    if (ro) ro.innerHTML = `${Math.abs(pos.lat).toFixed(4)}°S · ${Math.abs(pos.lng).toFixed(4)}°O<br>GPS ±${pos.accuracy} m · EN VIVO`;
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
    renderList(); // Refresca la UI
    const lc = $('#liveCount'); if (lc) lc.textContent = incidents.length.toString();
  });
}

document.addEventListener('DOMContentLoaded', initApp);
