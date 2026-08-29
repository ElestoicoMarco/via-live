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
    const bbox = '-65.38,-24.25,-65.22,-24.12';
    const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}&key=${apiKey}`;

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

// Servir la PWA en Producción
app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`📡 Servidor Backend seguro escuchando en puerto ${PORT}`);
});
