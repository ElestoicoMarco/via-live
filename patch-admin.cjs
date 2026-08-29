const fs = require('fs');
const path = require('path');
const root = __dirname;

// 1. INYECTAR MODAL HTML
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('adminModal')) {
  html = html.replace('<div id="toasts"></div>', `
  <!-- MODAL ADMIN (CARGA MANUAL) -->
  <div id="adminModal" class="modal-overlay">
    <div class="modal-content glass">
      <h3>Reportar Incidente Manual</h3>
      <p class="modal-sub">Se anclará a la ubicación seleccionada</p>
      <div class="form-group">
        <label>Tipo de Incidencia</label>
        <select id="admType">
          <option value="ROAD_CLOSED">Corte de Ruta (Bloqueo Total)</option>
          <option value="ACCIDENT">Accidente</option>
          <option value="ROAD_WORKS">Obras en la Vía</option>
          <option value="JAM">Congestión Severa</option>
        </select>
      </div>
      <div class="form-group">
        <label>Descripción / Causa</label>
        <input type="text" id="admDesc" placeholder="Ej: Manifestación, choque..." autocomplete="off">
      </div>
      <div class="modal-actions">
        <button class="btn-outline" id="admCancel">Cancelar</button>
        <button class="btn-primary" id="admSave">Publicar Alerta</button>
      </div>
    </div>
  </div>
  <div id="toasts"></div>
  `);
  fs.writeFileSync(path.join(root, 'index.html'), html);
}

// 2. INYECTAR CSS DEL MODAL
let css = fs.readFileSync(path.join(root, 'src/styles/main.css'), 'utf8');
if (!css.includes('.modal-overlay')) {
  css += `\n/* ADMIN MODAL */
.modal-overlay { position:fixed; inset:0; z-index:2000; background:rgba(0,0,0,.7); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
.modal-overlay.open { opacity:1; pointer-events:auto; }
.modal-content { width:90%; max-width:400px; padding:20px; border-radius:var(--r-lg); display:flex; flex-direction:column; gap:14px; transform:scale(0.95); transition:transform .2s; }
.modal-overlay.open .modal-content { transform:scale(1); }
.modal-content h3 { font-size:1.1rem; }
.modal-sub { font-size:0.8rem; color:var(--text-sub); margin-top:-10px; margin-bottom:6px; }
.form-group { display:flex; flex-direction:column; gap:6px; }
.form-group label { font-size:0.75rem; font-weight:600; color:var(--text-sub); text-transform:uppercase; letter-spacing:0.02em; }
.form-group select, .form-group input { background:var(--surface-2); border:1px solid var(--border); color:var(--text-main); padding:12px; border-radius:var(--r-md); font-family:inherit; outline:none; }
.form-group select:focus, .form-group input:focus { border-color:var(--accent-info); }
.modal-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px; }
`;
  fs.writeFileSync(path.join(root, 'src/styles/main.css'), css);
}

// 3. INYECTAR LÓGICA DE INTERFAZ
let comp = fs.readFileSync(path.join(root, 'src/ui/components.ts'), 'utf8');
if (!comp.includes('openAdminModal')) {
  comp = comp.replace('export function openSheet', `
export let pendingManualCoords: {mx:number, my:number} | null = null;
export function openAdminModal(mx: number, my: number) {
  pendingManualCoords = { mx, my };
  const desc = document.getElementById('admDesc') as HTMLInputElement;
  if(desc) desc.value = '';
  document.getElementById('adminModal')?.classList.add('open');
}
export function openSheet`);
  
  comp = comp.replace('export function initUI() {', `export function initUI() {
  document.getElementById('admCancel')?.addEventListener('click', () => document.getElementById('adminModal')?.classList.remove('open'));
  document.getElementById('admSave')?.addEventListener('click', () => {
     if (!pendingManualCoords) return;
     const type = (document.getElementById('admType') as HTMLSelectElement).value;
     const desc = (document.getElementById('admDesc') as HTMLInputElement).value || 'Corte reportado manualmente por operario';
     
     import('../services/firestoreSim').then(module => {
       const inc: any = {
          id: 'MANUAL-' + Date.now(),
          type: type,
          severity: type === 'ROAD_CLOSED' ? 4 : 3,
          mx: pendingManualCoords.mx,
          my: pendingManualCoords.my,
          roadName: '⚠️ Reporte Manual Local',
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
`);
  fs.writeFileSync(path.join(root, 'src/ui/components.ts'), comp);
}

// 4. INYECTAR DETECCIÓN DE GESTOS EN EL CANVAS (Clic derecho y Pulsación Larga)
let mapEngine = fs.readFileSync(path.join(root, 'src/core/mapEngine.ts'), 'utf8');
if (!mapEngine.includes('unproject')) {
  mapEngine = mapEngine.replace('export function clampView', `
export const unproject = (cx: number, cy: number) => ({ mx: (cx - view.ox) / view.zoom, my: (cy - view.oy) / view.zoom });
export function clampView`);

  mapEngine = mapEngine.replace('let pinchStart: any = null;', `let pinchStart: any = null; let longPressTimer: any = null;`);

  mapEngine = mapEngine.replace("pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });", `
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      longPressTimer = setTimeout(() => {
        dragMoved = true;
        const r = stage.getBoundingClientRect();
        const p = unproject(e.clientX - r.left, e.clientY - r.top);
        triggerHaptic('warning');
        import('../ui/components').then(m => m.openAdminModal(p.mx, p.my));
      }, 700); // 700ms = pulsación larga en móvil
    }
`);
  mapEngine = mapEngine.replace('if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true;', `
    if (Math.abs(dx) + Math.abs(dy) > 4) { dragMoved = true; clearTimeout(longPressTimer); }
`);
  mapEngine = mapEngine.replace("pointers.delete(e.pointerId);", `
    clearTimeout(longPressTimer);
    pointers.delete(e.pointerId);
`);
  mapEngine = mapEngine.replace(`stage.addEventListener('wheel'`, `
  // Clic derecho en PC para crear marcador
  stage.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const p = unproject(e.clientX - r.left, e.clientY - r.top);
    import('../ui/components').then(m => m.openAdminModal(p.mx, p.my));
  });
  stage.addEventListener('wheel'`);
  fs.writeFileSync(path.join(root, 'src/core/mapEngine.ts'), mapEngine);
}

// 5. PROTEGER INCIDENTES MANUALES DE LA SINCRONIZACIÓN SATELITAL
let firestore = fs.readFileSync(path.join(root, 'src/services/firestoreSim.ts'), 'utf8');
if (!firestore.includes('manualIncidents')) {
  firestore = firestore.replace(`state.incidents = attachGeo(newIncidents);`, `
      // Proteger los incidentes creados a mano para que TomTom no los borre al sincronizar
      const manualIncidents = state.incidents.filter(i => i.id.startsWith('MANUAL-'));
      state.incidents = attachGeo([...newIncidents, ...manualIncidents]);
  `);
  fs.writeFileSync(path.join(root, 'src/services/firestoreSim.ts'), firestore);
}

console.log('Parche de Administración aplicado correctamente.');
