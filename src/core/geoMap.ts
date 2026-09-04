import * as L from 'leaflet';
import { Incident, TYPE_META } from '../types/incident';
import { triggerHaptic } from '../utils/helpers';

export class GeoMapEngine {
  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup = L.layerGroup();
  private polylinesLayer: L.LayerGroup = L.layerGroup();
  private activeRouteLayer: L.LayerGroup = L.layerGroup();
  private userMarker: L.CircleMarker | null = null;
  private onIncidentSelect: (id: string) => void;
  private onMapLongPress: (lat: number, lng: number) => void;
  private isAutoTracking = false;

  constructor(containerId: string, onIncidentSelect: (id: string) => void, onMapLongPress: (lat: number, lng: number) => void) {
    this.onIncidentSelect = onIncidentSelect;
    this.onMapLongPress = onMapLongPress;
    this.initMap(containerId);
  }

  public enableAutoTracking() {
    this.isAutoTracking = true;
    if (this.userMarker && this.map) {
      const pos = this.userMarker.getLatLng();
      this.map.flyTo(pos, 17, { duration: 1.0 }); // Zoom de conducción
    }
  }

  public disableAutoTracking() {
    this.isAutoTracking = false;
  }

  public fitBounds(pts: [number, number][]) {
    if (!this.map || pts.length === 0) return;
    this.map.fitBounds(L.polyline(pts).getBounds(), { padding: [50, 50], animate: true });
  }

  public renderActiveRoute(pts: [number, number][], trafficSegments: any[] = []) {
    this.activeRouteLayer.clearLayers();
    if (!pts || pts.length < 2) return;
    
    // Borde oscuro global para la ruta
    L.polyline(pts, { color: '#0d1117', weight: 8, opacity: 0.8 }).addTo(this.activeRouteLayer);
    
    if (trafficSegments && trafficSegments.length > 0) {
      // Dibujar por segmentos de colores
      trafficSegments.forEach((sec: any) => {
        const segPts = pts.slice(sec.startPointIndex, sec.endPointIndex + 1);
        let color = '#3b82f6'; // Free flow (blue)
        const delay = sec.delayInSeconds || 0;
        const speed = sec.effectiveSpeedInKmh || 50;

        if (delay > 0) {
          if (speed < 15) color = '#f85149'; // Rojo (Atasco)
          else if (speed < 35) color = '#d29922'; // Amarillo (Lento)
        }
        
        L.polyline(segPts, { color, weight: 5, opacity: 0.9 }).addTo(this.activeRouteLayer);
      });
    } else {
      // Ruta principal azul (fallback si no hay segmentos)
      L.polyline(pts, { color: '#3b82f6', weight: 5, opacity: 0.9 }).addTo(this.activeRouteLayer);
    }
    
    // Marcador destino
    const dest = pts[pts.length - 1];
    L.circleMarker(dest, { radius: 7, fillColor: '#10b981', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(this.activeRouteLayer);
  }

    private initMap(containerId: string) {
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 17 });
    const dark = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'dark-osm-layer' });

    this.map = L.map(containerId, {
      center: [-24.1858, -65.2995],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      layers: [document.documentElement.classList.contains('light-theme') ? osm : dark]
    });

    const baseMaps = {
      "🗺️ Mapa Estándar": osm,
      "🛰️ Satélite HD": sat,
      "🕶️ Táctico (Oscuro)": dark
    };
    L.control.layers(baseMaps, undefined, { position: 'topleft' }).addTo(this.map);

    this.markersLayer.addTo(this.map);
    this.polylinesLayer.addTo(this.map);
    this.activeRouteLayer.addTo(this.map);

    this.map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      this.onMapLongPress(e.latlng.lat, e.latlng.lng);
    });

    // Desactivar tracking si el usuario arrastra el mapa manualmente
    this.map.on('dragstart', () => {
      if (this.isAutoTracking) this.disableAutoTracking();
    });
  }

  public renderIncidents(incidents: Incident[]) {
    if (!this.map) return;
    this.markersLayer.clearLayers();
    this.polylinesLayer.clearLayers();

    incidents.forEach((inc) => {
      const meta = TYPE_META[inc.type] || TYPE_META.UNKNOWN;
      const customIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: `<div class="pin-marker t-${inc.type} ${inc.severity >= 4 ? 'critical' : ''}" style="--pin-color: ${meta.color}"><span class="pin-inner"><svg class="ic"><use href="#${meta.icon}"/></svg></span></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      });

      const marker = L.marker([inc.location.lat, inc.location.lng], { icon: customIcon });
      marker.on('click', () => {
        triggerHaptic('tap');
        this.onIncidentSelect(inc.id);
      });
      this.markersLayer.addLayer(marker);

      if (inc.polyline && inc.polyline.length > 1) {
        const polyline = L.polyline(inc.polyline, {
          color: meta.color,
          weight: 5,
          opacity: 0.85,
          dashArray: inc.type === 'JAM' ? '6, 8' : undefined
        });
        this.polylinesLayer.addLayer(polyline);
      }
    });
  }

  public updateUserLocation(lat: number, lng: number, accuracy: number, speedKmH: number = 0) {
    if (!this.map) return;

    if (!this.userMarker) {
      this.userMarker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#58a6ff',
        color: '#ffffff',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.95
      }).addTo(this.map);
      this.map.flyTo([lat, lng], 15, { duration: 1.2 });
    } else {
      this.userMarker.setLatLng([lat, lng]);
      if (this.isAutoTracking) {
         // ZOOM DIN?MICO POR TELEMETR?A (Velocidad)
         let targetZoom = 17; // Velocidad de ciudad / Lento
         if (speedKmH > 70) targetZoom = 14;      // Ruta / Visi?n extendida
         else if (speedKmH > 40) targetZoom = 15; // Avenida r?pida
         else if (speedKmH > 20) targetZoom = 16; // Conducci?n normal
         
         this.map.setView([lat, lng], targetZoom, { animate: true, duration: 1.0 });
      }
    }
  }

  public flyTo(lat: number, lng: number, zoom = 15) {
    this.map?.flyTo([lat, lng], zoom, { duration: 1.2 });
  }

  public zoomIn() { this.map?.zoomIn(); }
  public zoomOut() { this.map?.zoomOut(); }
  public invalidateSize() { this.map?.invalidateSize(); }
}
