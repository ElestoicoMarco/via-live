const fs = require('fs');
const path = require('path');
const root = __dirname;

// 1. ui/components.ts
let comp = fs.readFileSync(path.join(root, 'src/ui/components.ts'), 'utf8');
comp = "import { mapEngine } from '../main';\n" + comp;
comp = comp.replace(/import { centerOn.*?from '\.\.\/core\/mapEngine';\r?\n?/g, '');
comp = comp.replace(/import { makePin.*?from '\.\.\/core\/mapEngine';\r?\n?/g, '');
comp = comp.replace(/import { stage.*?from '\.\.\/core\/mapEngine';\r?\n?/g, '');
comp = comp.replace(/setTimeout\(\(\) => centerOn\(sheetIncident!\.mx, sheetIncident!\.my, 1\.5\), 60\);/g, "setTimeout(() => { if(sheetIncident?.location) mapEngine.flyTo(sheetIncident.location.lat, sheetIncident.location.lng, 16) }, 60);");
comp = comp.replace(/\$\('#btnLocate'\)\?\.addEventListener[^;]+;/g, '');
comp = comp.replace(/\$\('#btnZoomIn'\)\?\.addEventListener[^;]+;/g, '');
comp = comp.replace(/\$\('#btnZoomOut'\)\?\.addEventListener[^;]+;/g, '');
comp = comp.replace(/openAdminModal\(mx: number, my: number\)/g, 'openAdminModal(lat: number, lng: number)');
comp = comp.replace(/pendingManualCoords = { mx, my };/g, 'pendingManualCoords = { lat, lng };');
comp = comp.replace(/mx: pendingManualCoords\.mx, my: pendingManualCoords\.my,/g, 'location: { lat: pendingManualCoords.lat, lng: pendingManualCoords.lng },');
comp = comp.replace(/pendingManualCoords: {mx:number, my:number}/g, 'pendingManualCoords: {lat:number, lng:number}');
fs.writeFileSync(path.join(root, 'src/ui/components.ts'), comp);

// 2. index.html
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const newViewMap = \`
  <section id="view-map" class="view active">
    <div id="mapContainer"></div>
    <div class="map-topbar">
      <div class="chip glass" id="liveChip">
        <span class="live-dot"></span> EN VIVO · <b id="liveCount">0</b> incidentes
      </div>
      <div class="chip glass mono" id="clock">--:--:--</div>
    </div>
    <div class="map-toolbar glass">
      <button id="btnLocate" aria-label="Centrar"><svg class="ic"><use href="#i-cross"/></svg></button>
      <button id="btnZoomIn" aria-label="Acercar"><svg class="ic"><use href="#i-plus"/></svg></button>
      <button id="btnZoomOut" aria-label="Alejar"><svg class="ic"><use href="#i-minus"/></svg></button>
    </div>
    <div class="map-legend glass">
      <span class="lg"><i style="background:#f85149"></i>Accid.</span>
      <span class="lg"><i style="background:#da3633"></i>Corte</span>
      <span class="lg"><i style="background:#58a6ff"></i>Obras</span>
      <span class="lg"><i style="background:#e3b341"></i>Cong.</span>
    </div>
    <div class="map-readout glass mono" id="readout">—</div>
  </section>
\`;
html = html.replace(/<section id="view-map"[\\s\\S]*?<\\/section>/, newViewMap);
fs.writeFileSync(path.join(root, 'index.html'), html);

// 3. CSS
let css = fs.readFileSync(path.join(root, 'src/styles/main.css'), 'utf8');
css += \`
#mapContainer { position: absolute; inset: 0; width: 100%; height: 100%; background: #0d1117; z-index: 1; }
.leaflet-control-container { display: none !important; }
.custom-leaflet-pin { background: transparent; border: none; }
.pin-marker { width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: var(--pin-color, #8b949e); border: 2px solid rgba(240, 246, 252, 0.95); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6); cursor: pointer; transition: transform 0.15s ease; }
.pin-marker:active { transform: rotate(-45deg) scale(1.2); }
.pin-marker .pin-inner { transform: rotate(45deg); display: flex; align-items: center; justify-content: center; }
.pin-marker .pin-inner .ic { width: 15px; height: 15px; color: #ffffff; }
.pin-marker.critical { animation: leafletPinPulse 1.6s infinite; }
@keyframes leafletPinPulse { 0% { box-shadow: 0 0 0 0 rgba(248, 81, 73, 0.7); } 70% { box-shadow: 0 0 0 14px rgba(248, 81, 73, 0); } 100% { box-shadow: 0 0 0 0 rgba(248, 81, 73, 0); } }
\`;
fs.writeFileSync(path.join(root, 'src/styles/main.css'), css);

console.log('PATCH_FINAL_OK');
