export let audioCtx: AudioContext | null = null;

export function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

export function playSFX(type: 'warning' | 'danger') {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'danger') {
    // Alarma Urgente: Doble beep agudo y rápido (Onda Cuadrada para más estridencia)
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1108, now + 0.15); // C#6
    
    // Primer Beep
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gainNode.gain.setValueAtTime(0.2, now + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.15);
    
    // Segundo Beep
    gainNode.gain.setValueAtTime(0, now + 0.15);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.17);
    gainNode.gain.setValueAtTime(0.2, now + 0.25);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.35);
  } else {
    // Advertencia Leve: Timbre suave tipo campana de aviso (Onda Senoidal)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
    
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.start(now);
    osc.stop(now + 0.5);
  }
}
