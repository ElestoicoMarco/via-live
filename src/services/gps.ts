export interface UserPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export class GPSService {
  private static userPos: UserPosition = { lat: -24.1858, lng: -65.2995, accuracy: 15 };
  private static watchId: number | null = null;

  public static startWatching(onUpdate: (pos: UserPosition) => void) {
    if (!('geolocation' in navigator)) return;
    
    // Llamada inmediata para inicializar la UI mientras se busca satélite
    onUpdate(this.userPos);

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.userPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        };
        onUpdate(this.userPos);
      },
      (err) => console.warn('GPS Error / Permiso denegado:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  public static getUserPosition(): UserPosition {
    return this.userPos;
  }
}
