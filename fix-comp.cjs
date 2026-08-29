const fs = require('fs');

let t = fs.readFileSync('src/ui/components.ts', 'utf8');

// 1. Quitar las importaciones rotas de mapEngine (centerOn, zoomAt, stage)
t = t.replace(/import\s+{([^}]*)}\s+from\s+'\.\.\/core\/mapEngine';/, "import { map, makePin } from '../core/mapEngine';");

// 2. Arreglar el botón de enfocar incidente desde la ficha
t = t.replace(
  /setTimeout\(\(\) => centerOn\(sheetIncident!\.mx,\s*sheetIncident!\.my,\s*1\.5\),\s*60\);/g,
  "setTimeout(() => { if(sheetIncident?.location) map?.flyTo([sheetIncident.location.lat, sheetIncident.location.lng], 16) }, 60);"
);

// 3. Arreglar botón de ubicar usuario
t = t.replace(
  /\$\('#btnLocate'\)\.addEventListener\('click',\s*\(\)\s*=>\s*{\s*triggerHaptic\('tap'\);\s*centerOn\(USER\.mx,\s*USER\.my\);\s*}\);/g,
  "$('#btnLocate')?.addEventListener('click', () => { triggerHaptic('tap'); map?.flyTo([USER.lat, USER.lng], 15); });"
);

// 4. Arreglar botón Zoom In
t = t.replace(
  /\$\('#btnZoomIn'\)\.addEventListener\('click',\s*\(\)\s*=>\s*{\s*triggerHaptic\('tap'\);\s*zoomAt\(stage\.clientWidth\s*\/\s*2,\s*stage\.clientHeight\s*\/\s*2,\s*1\.28\);\s*}\);/g,
  "$('#btnZoomIn')?.addEventListener('click', () => { triggerHaptic('tap'); map?.zoomIn(); });"
);

// 5. Arreglar botón Zoom Out
t = t.replace(
  /\$\('#btnZoomOut'\)\.addEventListener\('click',\s*\(\)\s*=>\s*{\s*triggerHaptic\('tap'\);\s*zoomAt\(stage\.clientWidth\s*\/\s*2,\s*stage\.clientHeight\s*\/\s*2,\s*1\s*\/\s*1\.28\);\s*}\);/g,
  "$('#btnZoomOut')?.addEventListener('click', () => { triggerHaptic('tap'); map?.zoomOut(); });"
);

fs.writeFileSync('src/ui/components.ts', t);
console.log("COMPONENTS_FIXED");
