import * as L from 'leaflet';
import { Incident, TYPE_META } from '../types/incident';
import { triggerHaptic } from '../utils/helpers';

export class GeoMapEngine {
  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup = L.layerGroup();
  private polylinesLayer: L.LayerGroup = L.layerGroup();
  private userMarker: L.CircleMarker | null = null;
  private onIncidentSelect: (id: string) => void;
  private onMapLongPress: (lat: number, lng: number) => void;

  constructor(containerId: string, onIncidentSelect: (id: string) => void, onMapLongPress: (lat: number, lng: number) => void) {
    this.onIncidentSelect = onIncidentSelect;
    this.onMapLongPress = onMapLongPress;
    this.initMap(containerId);
  }

  private initMap(containerId: string) {
    // Inicialización por defecto en Jujuy (-24.1858, -65.2995)
    this.map = L.map(containerId, {
      center: [-24.1858, -65.2995],
      zoom: 14,
      zoomControl: false, // Usamos los botones Glassmorphism propios
      attributionControl: false
    });

    // Tiles CartoDB Dark Matter (Renderizado oscuro de alta fidelidad)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(this.map);

    this.markersLayer.addTo(this.map);
    this.polylinesLayer.addTo(this.map);

    this.map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      this.onMapLongPress(e.latlng.lat, e.latlng.lng);
    });
  }

  public renderIncidents(incidents: Incident[]) {
    if (!this.map) return;
    this.markersLayer.clearLayers();
    this.polylinesLayer.clearLayers();

    incidents.forEach((inc) => {
      const meta = TYPE_META[inc.type] || TYPE_META.UNKNOWN;

      // 1. Crear Pin Personalizado con HTML/SVG
      const customIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: `
          <div class="pin-marker t-${inc.type} ${inc.severity >= 4 ? 'critical' : ''}" style="--pin-color: ${meta.color}">
            <span class="pin-inner">
              <svg class="ic"><use href="#${meta.icon}"/></svg>
            </span>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      });

      const marker = L.marker([inc.location.lat, inc.location.lng], { icon: customIcon });
      marker.on('click', () => {
        triggerHaptic('tap');
        this.onIncidentSelect(inc.id);
      });
      this.markersLayer.addLayer(marker);

      // 2. Trazar línea de corte / congestión si existe polyline
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

  public updateUserLocation(lat: number, lng: number, accuracy: number) {
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
    }
  }

  public flyTo(lat: number, lng: number, zoom = 15) {
    this.map?.flyTo([lat, lng], zoom, { duration: 1.2 });
  }

  public zoomIn() { this.map?.zoomIn(); }
  public zoomOut() { this.map?.zoomOut(); }
  public invalidateSize() { this.map?.invalidateSize(); }
}
