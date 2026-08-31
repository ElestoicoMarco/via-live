import { mapEngine } from '../main';
import { toast, triggerHaptic } from '../utils/helpers';

let TTS_ENABLED = false;

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
  utterance.pitch = 1.0;
  
  const voices = synth.getVoices();
  const esVoice = voices.find(v => v.lang.startsWith('es-') && (v.name.includes('AR') || v.name.includes('MX') || v.name.includes('ES')));
  if (esVoice) utterance.voice = esVoice;

  synth.speak(utterance);
}

export async function calculateRoute(startLat: number, startLng: number, endLat: number, endLng: number) {
  try {
    toast('Calculando ruta óptima...', 'info');
    const res = await fetch(`/api/route?start=${startLat},${startLng}&end=${endLat},${endLng}`);
    if (!res.ok) throw new Error('Error al conectar con la API de Rutas');
    
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
      toast('No se encontró una ruta viable.', 'warn');
      return;
    }

    const route = data.routes[0];
    const pts = route.legs[0].points;
    const polylinePts = pts.map((p: any) => [p.latitude, p.longitude] as [number, number]);
    
    const travelTimeSec = route.summary.travelTimeInSeconds;
    const delaySec = route.summary.trafficDelayInSeconds;
    const mins = Math.round(travelTimeSec / 60);

    mapEngine.renderActiveRoute(polylinePts);

    triggerMultimediaAlert({
      alert_id: 'NAV-INIT',
      priority: 'HIGH',
      hardware_payload: {
        haptics: { pattern: [100, 50, 100] },
        tts: { text: `Ruta calculada. Tiempo estimado: ${mins} minutos. ${delaySec > 60 ? 'Hay demoras por tráfico en el trayecto.' : 'La ruta está despejada.'}` }
      }
    });

  } catch (err) {
    console.error('Routing error:', err);
    toast('Fallo al trazar la ruta', 'err');
  }
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
  
  toast('NAV: ' + payload.hardware_payload?.tts?.text.substring(0,30) + '...', 'info');
}
