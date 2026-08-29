const fs = require('fs');
const path = require('path');
const root = __dirname;

function unescapeFile(f) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) return;
  let t = fs.readFileSync(p, 'utf8');
  // Reemplazar los acentos graves y signos de dólar escapados por los literales
  t = t.replace(/\\`/g, '`');
  t = t.replace(/\\\$/g, '$');
  fs.writeFileSync(p, t);
}

unescapeFile('src/core/mapEngine.ts');
unescapeFile('src/ui/components.ts');
unescapeFile('src/services/firestoreSim.ts');
unescapeFile('src/utils/helpers.ts');
console.log("Archivos corregidos correctamente.");
