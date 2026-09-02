import { $, $$, escapeHTML, formatDistance, timeAgo, triggerHaptic, fmtTime, fmtLat, fmtLng, toast } from '../utils/helpers';
import { state } from '../store/state';
import { TYPE_META, SEV_LABELS, Incident } from '../types/incident';
import { GPSService } from '../services/gps';


export const sheetOverlay = $('#sheetOverlay');
export let sheetIncident: Incident | null = null;


export let pendingManualCoords: {lat:number, lng:number} | null = null;
export function openAdminModal(lat: number, lng: number) {
  pendingManualCoords = { lat, lng };
  const desc = document.getElementById('admDesc') as HTMLInputElement;
  if(desc) desc.value = '';
  document.getElementById('adminModal')?.classList.add('open');
}
export function openSheet(id: string) {
  try {
    // TomTom usa IDs numéricos, pero el DOM (dataset) o la llamada los convierte a string. 
    // Usamos String() para asegurar una comparación sin fallos de tipo.
    const inc = state.incidents.find(i => String(i.id) === String(id)); 
    if (!inc) {
      toast('Incidente no encontrado', 'err');
      return;
    }
    sheetIncident = inc;
    const m = TYPE_META[inc.type] || TYPE_META.UNKNOWN;
    
    const badge = document.getElementById('shBadge');
    if (badge) {
      badge.className = `badge t-${inc.type}`;
      badge.innerHTML = `<svg class="ic"><use href="#${m.icon}"/></svg><span>${m.label.toUpperCase()}</span>`;
    }
    
    const elTitle = document.getElementById('shTitle');
    if (elTitle) elTitle.textContent = inc.roadName || 'Sin Nombre';
    
    const elDesc = document.getElementById('shDesc');
    if (elDesc) elDesc.textContent = inc.description || 'Sin descripción';
    
    const elDist = document.getElementById('shDist');
    if (elDist) {
      elDist.textContent = inc.distanceUserKm != null
        ? `${formatDistance(inc.distanceUserKm)} de tu posición` : '--';
    }
    
    const sev = document.getElementById('shSev');
    const sevLevel = inc.severity || 1;
    if (sev) {
      sev.className = 'sev-meter lv' + sevLevel; 
      sev.innerHTML = '';
      for (let k = 0; k < 4; k++) { 
        const s = document.createElement('i'); 
        if (k < sevLevel) s.classList.add('on'); 
        sev.appendChild(s); 
      }
    }
    
    const elSevTxt = document.getElementById('shSevTxt');
    if (elSevTxt) elSevTxt.textContent = `${sevLevel}/4 · ${SEV_LABELS[sevLevel] || 'Desconocida'}`;
    
    const elStart = document.getElementById('shStart');
    if (elStart) elStart.textContent = inc.startTime ? `${fmtTime(inc.startTime)} (${timeAgo(inc.startTime)})` : '--';
    
    const shEnd = document.getElementById('shEnd');
    if (shEnd) shEnd.textContent = inc.endTime ? fmtTime(inc.endTime) : 'Sin estimación';
    
    const shCoords = document.getElementById('shCoords');
    if (shCoords && inc.location) shCoords.textContent = `${fmtLat(inc.location.lat)} · ${fmtLng(inc.location.lng)}`;

    if (inc.type === 'ROAD_CLOSED' || sevLevel >= 3) triggerHaptic('danger');
    else if (sevLevel >= 2) triggerHaptic('warning');
    else triggerHaptic('tap');
    
    const overlay = document.getElementById('sheetOverlay');
    if (overlay) overlay.classList.add('open');
    else console.error('No se encontró #sheetOverlay en el DOM');
    
  } catch (err) {
    console.error('Error abriendo sheet:', err);
    toast('Error abriendo información', 'err');
  }
}

export function closeSheet() {
  document.getElementById('sheetOverlay')?.classList.remove('open');
  sheetIncident = null;
}

export function switchView(name: string) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'map') setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  if (name === 'list') renderList();
  if (name === 'reports') updateReportStats();
}

export function renderList() {
  const wrap = $('#listWrap');
  const filtered = state.incidents.filter(i => state.currentFilter === 'ALL' || i.type === state.currentFilter);
  $('#listCount').textContent = String(filtered.length);
  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state">
      <svg class="ic"><use href="#i-check"/></svg>
      <h3>Sin alertas en esta categoría</h3>
      <p>No hay incidentes activos que coincidan con el filtro seleccionado.</p></div>`;
    return;
  }
  wrap.innerHTML = '<div class="incident-list">' + filtered.map(i => {
    const m = TYPE_META[i.type];
    return `<button class="incident-card glass" data-id="${i.id}">
      <span class="card-type-badge t-${i.type}" style="background:${m.color}">
        <svg class="ic"><use href="#${m.icon}"/></svg>${m.label}
      </span>
      <div class="card-title">${escapeHTML(i.roadName)}</div>
      <p class="card-desc">${escapeHTML(i.description)}</p>
      <div class="card-footer">
        <span class="distance-chip"><svg class="ic"><use href="#i-nav"/></svg>${formatDistance(i.distanceUserKm)}</span>
        <span>${timeAgo(i.startTime)} · Sev. ${i.severity}/4</span>
      </div>
    </button>`;
  }).join('') + '</div>';
  $$('.incident-card', wrap).forEach(c => c.addEventListener('click', () => openSheet(c.dataset.id!)));
}

export function updateBadges() {
  $('#liveCount').textContent = String(state.incidents.length);
  const badge = $('#navBadge');
  badge.textContent = String(state.incidents.length);
  badge.hidden = state.incidents.length === 0;
}

export function updateReportStats() {
  $('#stTotal').textContent = String(state.incidents.length);
  $('#stClosed').textContent = String(state.incidents.filter(i => i.type === 'ROAD_CLOSED').length);
  $('#stAcc').textContent = String(state.incidents.filter(i => i.type === 'ACCIDENT').length);
  const avg = state.incidents.length ? (state.incidents.reduce((s, i) => s + i.severity, 0) / state.incidents.length).toFixed(1) : '0';
  $('#stSev').textContent = String(avg);
}

export function updateReadout() {
  const pos = GPSService.getUserPosition();
  $('#readout').innerHTML = `${fmtLat(pos.lat)} · ${fmtLng(pos.lng)}<br>GPS ±${pos.accuracy} m · DEMO`;
  $('#setGPS').textContent = `${fmtLat(pos.lat)} · ${fmtLng(pos.lng)}`;
  $('#setAcc').textContent = `±${pos.accuracy} m`;
}

export function flashSync() {
  const chip = $('#liveChip');
  chip.classList.remove('flash'); void chip.offsetWidth; chip.classList.add('flash');
  $('#setSync').textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function applyConn() {
  const online = navigator.onLine && !state.simOffline;
  $('#offlineBanner').hidden = online;
  const c = $('#setConn');
  c.textContent = online ? 'En línea' : 'Sin conexión';
  c.className = 'status-text ' + (online ? 'ok' : 'bad');
}

export function buildPDF(list: Incident[], subtitle: string) {
  if (!(window as any).jspdf) { toast('Motor PDF no disponible', 'err'); return; }
  triggerHaptic('tap');
  const btn = $('#btnGenPDF') as HTMLButtonElement; const wasList = btn && !btn.disabled;
  if (wasList) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Generando…'; }
  setTimeout(() => {
    try {
      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const now = new Date();
      doc.setFillColor(13, 17, 23); doc.rect(0, 0, 210, 30, 'F');
      doc.setFillColor(248, 81, 73); doc.rect(0, 30, 210, 1.6, 'F');
      doc.setTextColor(240, 246, 252); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text('PARTE OFICIAL DE TRANSITABILIDAD VIAL', 14, 13);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(139, 148, 158);
      doc.text('TransitoPWA · Sistema de Monitoreo Industrial · bbox Salta (RN9 / Av. Bolivia)', 14, 19);
      doc.text(`Emisión: ${now.toLocaleString('es-AR')}   ${subtitle ? '·  ' + subtitle : ''}`, 14, 24.5);
      doc.autoTable({
        startY: 38,
        head: [['ID', 'Tipo', 'Tramo', 'Descripción', 'Coordenadas', 'Dist.']],
        body: list.map(i => [
          i.id, TYPE_META[i.type].label, i.roadName,
          i.description.length > 70 ? i.description.slice(0, 70) + '…' : i.description,
          `${i.location?.lat.toFixed(4)}, ${i.location?.lng.toFixed(4)}`,
          i.distanceUserKm != null ? formatDistance(i.distanceUserKm) : '—'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [22, 27, 34], textColor: [240, 246, 252], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.4, textColor: [28, 33, 43] },
        alternateRowStyles: { fillColor: [243, 245, 248] },
        columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 22 }, 2: { cellWidth: 34 }, 3: { cellWidth: 62 }, 4: { cellWidth: 32 }, 5: { cellWidth: 15 } },
        margin: { left: 14, right: 14 }
      });
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p); doc.setFontSize(7.2); doc.setTextColor(120, 126, 135);
        doc.text(`Página ${p}/${pages} · Generado client-side (sin servidores) · ${now.toLocaleDateString('es-AR')}`, 14, 290);
      }
      doc.save(`parte_transito_${now.toISOString().slice(0, 10)}.pdf`);
      toast('Parte PDF generado', 'ok'); triggerHaptic('success');
    } catch (err) {
      console.error(err); toast('Error al generar el PDF', 'err');
    } finally {
      if (wasList) {
        btn.disabled = false;
        btn.innerHTML = '<svg class="ic" style="width:18px;height:18px"><use href="#i-down"/></svg> Generar Parte del Día';
      }
    }
  }, 120);
}

export function initUI() {
  document.getElementById('admCancel')?.addEventListener('click', () => document.getElementById('adminModal')?.classList.remove('open'));
  
  document.getElementById('admNav')?.addEventListener('click', () => {
    if (!pendingManualCoords) return;
    const { lat: dLat, lng: dLng } = pendingManualCoords;
    const pos = GPSService.getUserPosition();
    document.getElementById('adminModal')?.classList.remove('open');
    
    import('../services/navigation').then(nav => {
      nav.unlockTTS(); // Habilita audio
      nav.calculateRoute(pos.lat, pos.lng, dLat, dLng);
    });
  });

  // == INICIO: FLUJO DE BÚSQUEDA Y NAVEGACIÓN ==
  
  // 1. Buscador con Debounce
  let searchTimeout: any;
  const searchInput = document.getElementById('searchInput') as HTMLInputElement;
  const searchResults = document.getElementById('searchResults');
  
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = (e.target as HTMLInputElement).value;
    if (query.length < 3) {
      if(searchResults) searchResults.hidden = true;
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const pos = GPSService.getUserPosition();
        const res = await fetch(`/api/search?query=${encodeURIComponent(query)}&lat=${pos.lat}&lng=${pos.lng}`);
        const data = await res.json();
        if (data.results && searchResults) {
          searchResults.innerHTML = '';
          data.results.forEach((item: any) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.textContent = `${item.address.freeformAddress}`;
            div.onclick = () => {
              searchResults.hidden = true;
              searchInput.value = item.address.freeformAddress;
              import('../services/navigation').then(nav => {
                nav.unlockTTS();
                nav.calculateRoute(pos.lat, pos.lng, item.position.lat, item.position.lon);
              });
            };
            searchResults.appendChild(div);
          });
          searchResults.hidden = false;
        }
      } catch (e) { console.error(e); }
    }, 500);
  });

  // 2. Ocultar resultados si tocan afuera
  document.addEventListener('click', (e) => {
    if (searchResults && !searchResults.contains(e.target as Node) && e.target !== searchInput) {
      searchResults.hidden = true;
    }
  });

  // 3. Botones Pre-Navegación
  document.getElementById('btnStartNav')?.addEventListener('click', () => {
    import('../services/navigation').then(nav => {
      const pos = GPSService.getUserPosition();
      nav.startActiveNavigation(pos.lat, pos.lng);
    });
  });

  document.getElementById('btnCancelNav')?.addEventListener('click', () => {
    import('../services/navigation').then(nav => nav.stopNavigation());
    searchInput.value = '';
    document.getElementById('searchBar')?.classList.remove('hidden');
  });

  document.getElementById('btnEndNav')?.addEventListener('click', () => {
    import('../services/navigation').then(nav => nav.stopNavigation());
    searchInput.value = '';
    document.getElementById('searchBar')?.classList.remove('hidden');
  });

  // 4. FAB Reporte Rápido
  document.getElementById('btnQuickReport')?.addEventListener('click', () => {
    const pos = GPSService.getUserPosition();
    openAdminModal(pos.lat, pos.lng); // Abre modal para reportar en ubicación actual
  });

  // == FIN: FLUJO NAVEGACIÓN ==

  document.getElementById('admSave')?.addEventListener('click', () => {
     if (!pendingManualCoords) return;
     const type = (document.getElementById('admType') as HTMLSelectElement).value;
     const desc = (document.getElementById('admDesc') as HTMLInputElement).value || 'Corte reportado manualmente por operario';
     
     import('../services/firestoreSim').then(module => {
       const inc: any = {
          id: 'MANUAL-' + Date.now(),
          type: type,
          severity: type === 'ROAD_CLOSED' ? 4 : 3,
          location: { lat: pendingManualCoords.lat, lng: pendingManualCoords.lng },
          roadName: '🚧 Reporte Manual Local',
          description: desc,
          startTime: new Date().toISOString(),
          endTime: null
       };
       module.addIncident(inc);
       document.getElementById('adminModal')?.classList.remove('open');
       import('../utils/helpers').then(h => {
         h.toast('Incidente inyectado en la red', 'ok');
         h.triggerHaptic('success');
       });
     });
  });

  $('#shClose').addEventListener('click', () => { triggerHaptic('tap'); closeSheet(); });
  sheetOverlay.addEventListener('click', e => { if (e.target === sheetOverlay) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  $('#shShare').addEventListener('click', async () => {
    if (!sheetIncident) return;
    triggerHaptic('tap');
    const m = TYPE_META[sheetIncident.type];
    const data = {
      title: `Alerta Vial: ${m.label}`,
      text: `⚠ ${m.label} en ${sheetIncident.roadName}. ${sheetIncident.description}`,
      url: location.href
    };
    try {
      if (navigator.share) { await navigator.share(data); toast('Alerta compartida', 'ok'); triggerHaptic('success'); }
      else { await navigator.clipboard.writeText(`${data.title} — ${data.text}`); toast('Copiado al portapapeles', 'ok'); }
    } catch (_) { toast('Compartir cancelado', 'warn'); }
  });

  const btnLocate = $('#shLocate');
  if (btnLocate) {
    btnLocate.addEventListener('click', () => {
      if (!sheetIncident) return;
      triggerHaptic('tap'); 
      const loc = sheetIncident.location;
      closeSheet(); 
      switchView('map');
      setTimeout(() => { 
        import('../main').then(m => m.mapEngine.flyTo(loc.lat, loc.lng, 17));
      }, 60);
    });
  }

  const btnPdf = $('#shPdf');
  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      if (!sheetIncident) return;
      triggerHaptic('tap');
      const inc = sheetIncident;
      buildPDF([inc], `Reporte de Incidente - ${TYPE_META[inc.type].label}`);
    });
  }

  $('#filters').addEventListener('click', e => {
    const chip = (e.target as HTMLElement).closest('.fchip') as HTMLElement; if (!chip) return;
    triggerHaptic('tap'); state.currentFilter = chip.dataset.f!;
    $$('.fchip').forEach(c => c.classList.toggle('active', c === chip));
    renderList();
  });

  $('#btnRefresh').addEventListener('click', () => {
    const b = $('#btnRefresh'); b.classList.add('spinning');
    triggerHaptic('tap');
    setTimeout(() => {
      b.classList.remove('spinning');
      flashSync(); toast('Snapshot sincronizado', 'ok'); triggerHaptic('success');
    }, 900);
  });

  $('#btnGenPDF').addEventListener('click', () => {
    if (state.incidents.length === 0) { toast('No hay incidentes activos', 'warn'); return; }
    buildPDF(state.incidents, `${state.incidents.length} incidentes activos`);
  });

  $$('.nav-btn').forEach(b => b.addEventListener('click', () => {
    triggerHaptic('tap'); switchView(b.dataset.view!);
  }));

  $('#offlineSwitch').addEventListener('change', (e: any) => {
    state.simOffline = e.target.checked; triggerHaptic('tap'); applyConn();
    toast(state.simOffline ? 'Modo offline simulado' : 'Conexión restablecida', state.simOffline ? 'warn' : 'ok');
  });

  

  const themeSw = $('#themeSwitch') as HTMLInputElement;
  if (themeSw) {
    themeSw.addEventListener('change', (e: any) => {
      triggerHaptic('tap');
      if (e.target.checked) {
        document.documentElement.classList.add('light-theme');
        toast('Modo Día activado', 'ok');
      } else {
        document.documentElement.classList.remove('light-theme');
        toast('Modo Noche activado', 'ok');
      }
    });
  }
  window.addEventListener('offline', applyConn);

  $$('.hbtn').forEach(b => b.addEventListener('click', () => {
    triggerHaptic(b.dataset.h as any);
    toast(`Háptica ${b.dataset.h === 'tap' ? 'leve' : b.dataset.h === 'warning' ? 'media' : 'crítica'} enviada`, 'info');
  }));

  // Botones de zoom ahora en main.ts

  $('#abClose').addEventListener('click', e => {
    e.stopPropagation(); triggerHaptic('tap');
    $('#alertBanner').classList.remove('show');
  });

  setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('es-AR', { hour12: false }); }, 1000);
  $('#clock').textContent = new Date().toLocaleTimeString('es-AR', { hour12: false });

  renderList();
  updateBadges();
  updateReportStats();
  updateReadout();
}
