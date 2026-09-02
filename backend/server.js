import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cargar variables de entorno (Nunca viajan al navegador)
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Paso C: Consumirla desde tu función backend
app.get('/api/tomtom', async (req, res) => {
  const apiKey = process.env.TOMTOM_API_KEY;

  if (!apiKey || apiKey.includes('xxxxxxxx')) {
    return res.status(500).json({ 
      error: "Clave de TomTom inválida. Por favor, configura tu TOMTOM_API_KEY real en el archivo .env" 
    });
  }

  try {
    // Las coordenadas de tu mapa (Bounding Box de Jujuy)
    const bbox = '-65.45,-24.25,-65.15,-24.12';
    // Solicitamos campos específicos (fields) para asegurar que TomTom nos devuelva los nombres de las calles y descripciones de eventos en español
    const fields = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers}}}';
    const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}&fields=${encodeURIComponent(fields)}&language=es-ES&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TomTom API devolvió estado: ${response.status}`);
    }

    const data = await response.json();
    
    // Devolvemos la info al frontend (el frontend SOLO ve el resultado, nunca la KEY)
    res.json(data);
  } catch (error) {
    console.error("Error al sincronizar con TomTom:", error);
    res.status(500).json({ error: "Error interno procesando el tráfico" });
  }
});

// Endpoint avanzado de Navegación GIS (Routing API)
app.get('/api/route', async (req, res) => {
  const apiKey = process.env.TOMTOM_API_KEY;
  const { start, end } = req.query; // formato: lat,lng
  if (!start || !end) return res.status(400).json({ error: "Faltan coordenadas start/end" });

  try {
    // Agregamos sectionType=traffic para colorear la ruta
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${start}:${end}/json?key=${apiKey}&traffic=true&travelMode=car&instructionsType=text&sectionType=traffic&maxAlternatives=2`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TomTom Routing HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error GIS Routing:", error);
    res.status(500).json({ error: "Error calculando la ruta óptima" });
  }
});

// Endpoint de Búsqueda (Search API)
app.get('/api/search', async (req, res) => {
  const apiKey = process.env.TOMTOM_API_KEY;
  const { query, lat, lng } = req.query;
  if (!query) return res.status(400).json({ error: "Falta query de búsqueda" });

  try {
    // Priorizamos resultados cerca del usuario (Jujuy) si manda coordenadas, sino Jujuy genérico
    const bias = (lat && lng) ? `&lat=${lat}&lon=${lng}&radius=50000` : `&lat=-24.18&lon=-65.30&radius=50000`;
    const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${apiKey}${bias}&language=es-ES&limit=5`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TomTom Search HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error GIS Search:", error);
    res.status(500).json({ error: "Error en la búsqueda" });
  }
});

// Servir la PWA en Producción
app.use(express.static(path.join(__dirname, '../dist')));
// SPA Fallback - RUTA CORRECTA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`📡 Servidor Backend seguro escuchando en puerto ${PORT}`);
});
