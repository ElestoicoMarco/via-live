export type IncidentType = 'ACCIDENT' | 'ROAD_CLOSED' | 'ROAD_WORKS' | 'JAM' | 'UNKNOWN';

export interface Location {
  lat: number;
  lng: number;
}

export interface Incident {
  id: string;
  type: IncidentType;
  severity: number; // 0 a 4
  roadName: string;
  description: string;
  startTime: string;
  endTime?: string | null;
  location: Location;
  polyline?: [number, number][]; // Array de [lat, lng]
  distanceUserKm?: number;
}

export const TYPE_META: Record<IncidentType, { icon: string; color: string; label: string }> = {
  ROAD_CLOSED: { icon: 'i-ban', color: '#da3633', label: 'Corte de Ruta' },
  ACCIDENT: { icon: 'i-car', color: '#f85149', label: 'Accidente' },
  ROAD_WORKS: { icon: 'i-cone', color: '#58a6ff', label: 'Obras en Vía' },
  JAM: { icon: 'i-alert', color: '#e3b341', label: 'Congestión' },
  UNKNOWN: { icon: 'i-info', color: '#8b949e', label: 'Información' }
};

export const SEV_LABELS = ['Nula', 'Baja', 'Media', 'Alta', 'Crítica'];
