import { mapEngine } from '../main';
import { toast, triggerHaptic, $ } from '../utils/helpers';
import { Incident } from '../types/incident';

let TTS_ENABLED = false;

type NavState = 'IDLE' | 'PREVIEW' | 'ACTIVE';
export let navigationState: NavState = 'IDLE';

let activeRouteGeoJSON: any = null;
export let currentDestination: { lat: number, lng: number } | null = null;
let originalETA_Mins = 0;
let lastHazardCheckTime = 0;

let turnInstructions: any[] = [];
let nextTurnIndex = 0;

export function unlockTTS() {
  TTS_ENABLED = true;
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export function playTTS(text: string) {
  if (!TTS_ENABLED) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-AR';
  utterance.rate = 1.05;
  const voices = synth.getVoices();
  const esVoice = voices.find(v => v.lang.startsWith('es-') && (v.name.includes('AR') || v.name.includes('MX') || v.name.includes('ES')));
  if (esVoice) utterance.voice = esVoice;
  synth.speak(utterance);
}

export function triggerMultimediaAlert(payload: any) {
  if ('vibrate' in navigator && payload.hardware_payload?.haptics?.pattern) {
    navigator.vibrate(payload.hardware_payload.haptics.pattern);
  } else {
    triggerHaptic('success');
  }
  if (payload.hardware_payload?.tts?.text) {
    playTTS(payload.hardware_payload.tts.text);
  }
  toast('Asistente: ' + payload.hardware_payload?.tts?.text.substring(0,40) + '...', 'info');
}

export async function calculateRoute(startLat: number, startLng: number, endLat: number, endLng: number, isRecalculation = false) {
  try {
    if (!isRecalculation) toast('Calculando ruta óptima...', 'info');
    
    const res = await fetch(`/api/route?start=${startLat},${startLng}&end=${endLat},${endLng}`);
    if (!res.ok) throw new Error('API Routing falló');
    const data = await res.json();
    
    if (!data.routes || data.routes.length === 0) {
      toast('Ruta no viable', 'warn'); return;
    }

    const route = data.routes[0];
    const travelTimeSec = route.summary.travelTimeInSeconds;
    const mins = Math.round(travelTimeSec / 60);
    const distKm = (route.summary.lengthInMeters / 1000).toFixed(1);

    const pts = route.legs[0].points;
    const polylinePts = pts.map((p: any) => [p.latitude, p.longitude] as [number, number]);
    
    const turf = (window as any).turf;
    activeRouteGeoJSON = turf.lineString(pts.map((p: any) => [p.longitude, p.latitude]));
    currentDestination = { lat: endLat, lng: endLng };
    originalETA_Mins = mins;

    const guidance = route.guidance?.instructions || [];
    turnInstructions = guidance.map((inst: any) => ({
      point: turf.point([inst.point.longitude, inst.point.latitude]),
      message: inst.message,
      spoken: false
    }));
    nextTurnIndex = turnInstructions.length > 0 ? 1 : 0;

    // Procesar tramos de tráfico para colorear la línea
    const trafficSegments = route.sections ? route.sections.filter((s:any) => s.sectionType === 'TRAFFIC') : [];
    mapEngine.renderActiveRoute(polylinePts, trafficSegments);

    if (isRecalculation) {
      triggerMultimediaAlert({
        hardware_payload: {
          haptics: { pattern: [200, 100, 200, 100, 500] },
          tts: { text: `Desvío calculado. Nuevo tiempo: ${mins} minutos.` }
        }
      });
      return mins;
    }

    // Si es ruta nueva, pasamos a PREVIEW
    navigationState = 'PREVIEW';
    const preCard = document.getElementById('preNavCard');
    const preMetrics = document.getElementById('preNavMetrics');
    if (preMetrics) preMetrics.textContent = `${mins} min • ${distKm} km`;
    if (preCard) {
       preCard.hidden = false;
       preCard.classList.add('show');
    }
    document.getElementById('searchBar')?.classList.add('hidden'); // Ocultar buscador si existe
    
    // Auto Zoom a la ruta entera
    mapEngine.fitBounds(polylinePts);
    
    return mins;
  } catch (err) {
    console.error('Routing error:', err);
    if (!isRecalculation) toast('Fallo al trazar ruta', 'err');
  }
}

export function startActiveNavigation(startLat: number, startLng: number) {
  navigationState = 'ACTIVE';
  
  // Ocultar Preview Card
  const preCard = document.getElementById('preNavCard');
  if (preCard) {
    preCard.classList.remove('show');
    setTimeout(() => preCard.hidden = true, 300);
  }
  
  // Mostrar HUD inferior
  document.getElementById('navHud')?.classList.add('show');
  
  // Mostrar FAB Reporte
  document.getElementById('btnQuickReport')?.classList.add('show');

  // Activar centrado automático
  mapEngine.enableAutoTracking();
  
  updateNavigationProgress(startLat, startLng);

  triggerMultimediaAlert({
    priority: 'HIGH',
    hardware_payload: {
      haptics: { pattern: [100, 50, 100] },
      tts: { text: `Navegación iniciada.` }
    }
  });
}

export function stopNavigation() {
  navigationState = 'IDLE';
  activeRouteGeoJSON = null;
  currentDestination = null;
  turnInstructions = [];
  
  document.getElementById('navHud')?.classList.remove('show');
  document.getElementById('btnQuickReport')?.classList.remove('show');
  
  const preCard = document.getElementById('preNavCard');
  if (preCard) preCard.classList.remove('show');

  mapEngine.disableAutoTracking();
  mapEngine.renderActiveRoute([]);
  triggerHaptic('tap');
}

export function updateNavigationProgress(lat: number, lng: number) {
  if (navigationState !== 'ACTIVE' || !activeRouteGeoJSON) return;
  const turf = (window as any).turf;
  if (!turf) return;

  const currentPt = turf.point([lng, lat]);
  const snapped = turf.nearestPointOnLine(activeRouteGeoJSON, currentPt, { units: 'kilometers' });
  const distToLine = turf.distance(currentPt, snapped, { units: 'kilometers' });
  
  if (distToLine > 0.1) {
    if (currentDestination) {
      calculateRoute(lat, lng, currentDestination.lat, currentDestination.lng, true);
    }
    return;
  }

  // Turn-by-turn check
  if (nextTurnIndex < turnInstructions.length) {
    const nextTurn = turnInstructions[nextTurnIndex];
    const distToTurn = turf.distance(currentPt, nextTurn.point, { units: 'kilometers' });
    if (distToTurn < 0.15 && !nextTurn.spoken) {
      playTTS(nextTurn.message);
      nextTurn.spoken = true;
      nextTurnIndex++;
    }
  }

  const destPt = turf.point([currentDestination!.lng, currentDestination!.lat]);
  const slicedLine = turf.lineSlice(snapped, destPt, activeRouteGeoJSON);
  const distKm = turf.length(slicedLine, { units: 'kilometers' });
  
  if (distKm < 0.05) {
    playTTS("Has llegado a tu destino.");
    stopNavigation();
    return;
  }

  const remainingMins = Math.max(1, Math.round(distKm * 1.7)); 
  const arrival = new Date(Date.now() + remainingMins * 60000);
  const timeStr = arrival.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const elEta = document.getElementById('navEta');
  if (elEta) elEta.textContent = `${remainingMins} min`;
  
  const elTime = document.getElementById('navTime');
  if (elTime) elTime.textContent = `${remainingMins} min`;
  
  const elDist = document.getElementById('navDist');
  if (elDist) elDist.textContent = `${distKm < 1 ? Math.round(distKm*1000) + ' m' : distKm.toFixed(1) + ' km'}`;
  
  const elAbs = document.getElementById('navEtaAbs');
  if (elAbs) elAbs.textContent = timeStr;
}

export function checkRouteHazards(incidents: Incident[], currentLat: number, currentLng: number) {
  if (navigationState !== 'ACTIVE' || !activeRouteGeoJSON || !currentDestination) return;
  const turf = (window as any).turf;
  if (!turf) return;

  const now = Date.now();
  if (now - lastHazardCheckTime < 35000) return;
  lastHazardCheckTime = now;

  let hazardDetected = false;
  const currentPt = turf.point([currentLng, currentLat]);

  for (const inc of incidents) {
    if (inc.type === 'UNKNOWN') continue;
    const incPt = turf.point([inc.location.lng, inc.location.lat]);
    const dist = turf.pointToLineDistance(incPt, activeRouteGeoJSON, { units: 'kilometers' });
    if (dist < 0.2) {
       const distUserToInc = turf.distance(currentPt, incPt, { units: 'kilometers' });
       if (distUserToInc > 0.1 && distUserToInc < 5.0) {
          hazardDetected = true;
          break;
       }
    }
  }

  if (hazardDetected) {
     calculateRoute(currentLat, currentLng, currentDestination.lat, currentDestination.lng, true);
  }
}
