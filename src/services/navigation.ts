import { mapEngine } from '../main';
import { toast, triggerHaptic, $ } from '../utils/helpers';
import { Incident } from '../types/incident';

let TTS_ENABLED = false;

// Estado de Navegación
export let isNavigating = false;
let activeRouteGeoJSON: any = null;
let currentDestination: { lat: number, lng: number } | null = null;
let originalETA_Mins = 0;
let lastHazardCheckTime = 0;

// Turn-by-Turn state
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
    if (!isRecalculation) {
      toast('Calculando ruta óptima...', 'info');
    }
    const res = await fetch(`/api/route?start=${startLat},${startLng}&end=${endLat},${endLng}`);
    if (!res.ok) throw new Error('API Routing falló');
    
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
      toast('Ruta no viable', 'warn'); return;
    }

    const route = data.routes[0];
    const travelTimeSec = route.summary.travelTimeInSeconds;
    const mins = Math.round(travelTimeSec / 60);

    const pts = route.legs[0].points;
    const polylinePts = pts.map((p: any) => [p.latitude, p.longitude] as [number, number]);
    
    const turf = (window as any).turf;
    activeRouteGeoJSON = turf.lineString(pts.map((p: any) => [p.longitude, p.latitude]));
    currentDestination = { lat: endLat, lng: endLng };
    originalETA_Mins = mins;

    // Parsear instrucciones de giro
    const guidance = route.guidance?.instructions || [];
    turnInstructions = guidance.map((inst: any) => ({
      point: turf.point([inst.point.longitude, inst.point.latitude]),
      message: inst.message,
      spoken: false
    }));
    // Ignorar la primera si es "Sal de tu ubicación"
    nextTurnIndex = turnInstructions.length > 0 ? 1 : 0;

    mapEngine.renderActiveRoute(polylinePts);
    startNavigationMode();
    updateNavigationProgress(startLat, startLng);

    if (!isRecalculation) {
      triggerMultimediaAlert({
        priority: 'HIGH',
        hardware_payload: {
          haptics: { pattern: [100, 50, 100] },
          tts: { text: `Ruta lista. Tiempo estimado: ${mins} minutos.` }
        }
      });
    }

    return mins;
  } catch (err) {
    console.error('Routing error:', err);
    if (!isRecalculation) toast('Fallo al trazar ruta', 'err');
  }
}

function startNavigationMode() {
  isNavigating = true;
  document.getElementById('navHud')?.classList.add('show');
  document.getElementById('btnEndNav')?.addEventListener('click', stopNavigation, { once: true });
}

export function stopNavigation() {
  isNavigating = false;
  activeRouteGeoJSON = null;
  currentDestination = null;
  turnInstructions = [];
  document.getElementById('navHud')?.classList.remove('show');
  mapEngine.renderActiveRoute([]);
  triggerHaptic('tap');
}

export function updateNavigationProgress(lat: number, lng: number) {
  if (!isNavigating || !activeRouteGeoJSON) return;
  const turf = (window as any).turf;
  if (!turf) return;

  const currentPt = turf.point([lng, lat]);
  const snapped = turf.nearestPointOnLine(activeRouteGeoJSON, currentPt, { units: 'kilometers' });
  const distToLine = turf.distance(currentPt, snapped, { units: 'kilometers' });
  
  if (distToLine > 0.1) {
    if (currentDestination) {
      calculateRoute(lat, lng, currentDestination.lat, currentDestination.lng, true).then(() => {
         playTTS("Recalculando ruta.");
      });
    }
    return;
  }

  // Turn-by-turn check
  if (nextTurnIndex < turnInstructions.length) {
    const nextTurn = turnInstructions[nextTurnIndex];
    const distToTurn = turf.distance(currentPt, nextTurn.point, { units: 'kilometers' });
    
    // Si estamos a menos de 150 metros del giro y no se anunció
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

  $('#navEta').textContent = `${remainingMins} min`;
  $('#navTime').textContent = `${remainingMins} min`;
  $('#navDist').textContent = `${distKm < 1 ? Math.round(distKm*1000) + ' m' : distKm.toFixed(1) + ' km'}`;
  $('#navEtaAbs').textContent = timeStr;
}

export function checkRouteHazards(incidents: Incident[], currentLat: number, currentLng: number) {
  if (!isNavigating || !activeRouteGeoJSON || !currentDestination) return;
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
     fetch(`/api/route?start=${currentLat},${currentLng}&end=${currentDestination.lat},${currentDestination.lng}`)
       .then(res => res.json())
       .then(data => {
          if (!data.routes) return;
          const route = data.routes[0];
          const pts = route.legs[0].points;
          const newRouteGeoJSON = turf.lineString(pts.map((p: any) => [p.longitude, p.latitude]));
          const diff = Math.abs(turf.length(newRouteGeoJSON) - turf.length(activeRouteGeoJSON));
          
          if (diff > 0.5) {
             activeRouteGeoJSON = newRouteGeoJSON;
             const polylinePts = pts.map((p: any) => [p.latitude, p.longitude] as [number, number]);
             
             // Actualizar maniobras
             const guidance = route.guidance?.instructions || [];
             turnInstructions = guidance.map((inst: any) => ({
               point: turf.point([inst.point.longitude, inst.point.latitude]),
               message: inst.message,
               spoken: false
             }));
             nextTurnIndex = turnInstructions.length > 0 ? 1 : 0;

             mapEngine.renderActiveRoute(polylinePts);
             triggerMultimediaAlert({
               hardware_payload: {
                 haptics: { pattern: [200, 100, 200, 100, 500] },
                 tts: { text: `Atención. Incidente detectado adelante. Calculando desvío óptimo.` }
               }
             });
          }
       });
  }
}
