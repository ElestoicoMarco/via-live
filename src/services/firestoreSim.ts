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
      const res = await fetch('/api/tomtom');
      if (!res.ok) throw new Error('Error proxy');
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
          description: f.properties.events?.[0]?.description || 'Incidencia detectada por satélite',
          startTime: f.properties.startTime || new Date().toISOString(), 
          endTime: null
        };
      });

      const manualIncidents = state.incidents.filter(i => i.id.startsWith('MANUAL-'));
      state.incidents = [...newIncidents, ...manualIncidents];
      notify();
    } catch (e) {
      console.error(e);
    }
  };
  syncWithTomTom(); setInterval(syncWithTomTom, 30000);
}
