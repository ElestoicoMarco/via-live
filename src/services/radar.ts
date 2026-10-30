import { state } from '../store/state';
import { TYPE_META } from '../types/incident';
import { getDistanceKm, triggerHaptic, toast } from '../utils/helpers';
import { playTTS } from './navigation';
import { playSFX } from '../utils/audio'; // Nuevo motor SFX

const notifiedIncidents = new Map<string, number>();
const COOLDOWN_MS = 1000 * 30; // 30 segundos (solo pruebas) // 30 minutes
export const DEFAULT_RADAR_RADIUS_METERS = 1200;

export function getRadarRadiusMeters(): number {
  try {
    const saved = localStorage.getItem('via_live_radar_radius');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 200 && parsed <= 5000) {
        return parsed;
      }
    }
  } catch (_) {}
  return DEFAULT_RADAR_RADIUS_METERS;
}

export function setRadarRadiusMeters(meters: number): void {
  try {
    localStorage.setItem('via_live_radar_radius', meters.toString());
  } catch (_) {}
}

export function runProximityRadar(userLat: number, userLng: number) {
  const now = Date.now();
  const radiusKm = getRadarRadiusMeters() / 1000;
  
  const nearby = state.incidents.filter(inc => {
    const lastNotified = notifiedIncidents.get(inc.id);
    if (lastNotified && now - lastNotified < COOLDOWN_MS) return false;
    if (!inc.location) return false;
    const dist = getDistanceKm(userLat, userLng, inc.location.lat, inc.location.lng);
    return dist <= radiusKm;
  });

  if (nearby.length > 0) {
    nearby.sort((a,b) => getDistanceKm(userLat, userLng, a.location.lat, a.location.lng) - getDistanceKm(userLat, userLng, b.location.lat, b.location.lng));
    const inc = nearby[0];
    notifiedIncidents.set(inc.id, now);
    
    const dist = getDistanceKm(userLat, userLng, inc.location.lat, inc.location.lng);
    let distMeters = Math.round(dist * 1000);
    distMeters = Math.round(distMeters / 50) * 50; 
    
    const m = TYPE_META[inc.type] || TYPE_META.UNKNOWN;
    const msg = `Precaución. ${m.label} a ${distMeters} metros, por ${inc.roadName || 'la vía'}.`;
    
    const isDanger = inc.severity >= 3 || inc.type === 'ROAD_CLOSED';
    
    // Coreografía Multisensorial (Sonido -> Vibración -> Voz)
    playSFX(isDanger ? 'danger' : 'warning');
    triggerHaptic(isDanger ? 'danger' : 'warning');
    
    // Diferir la voz 800ms para que no se superponga con el "Bip" de alarma
    setTimeout(() => {
      playTTS(msg);
    }, 800);
    
    toast(`Radar: ${m.label} en ${inc.roadName || 'la vía'} a ${distMeters}m`, 'warn');
  }
}
