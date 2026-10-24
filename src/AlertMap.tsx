import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Alert } from './api';
const colors = { novo: '#b57427', em_atendimento: '#237a97', resolvido: '#3e7452' };
export default function AlertMap({ alerts, onSelect }: { alerts: Alert[]; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  useEffect(() => {
    const map = L.map(container.current!, { scrollWheelZoom: false }).setView([-14.2, -51.9], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(container.current!);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const layer = L.layerGroup().addTo(map); const points: L.LatLngTuple[] = [];
    alerts.forEach(alert => {
      if (alert.latitude === null || alert.longitude === null) return;
      const point: L.LatLngTuple = [alert.latitude, alert.longitude]; points.push(point);
      const popup = document.createElement('div'); const title = document.createElement('strong'); title.textContent = alert.type;
      const location = document.createElement('p'); location.textContent = alert.location;
      const button = document.createElement('button'); button.className = 'text-button'; button.textContent = 'Ver detalhes'; button.addEventListener('click', () => onSelect(alert.id));
      popup.append(title, location, button);
      L.circleMarker(point, { radius: 9, color: '#fff', weight: 3, fillColor: colors[alert.status], fillOpacity: 1 }).bindPopup(popup).addTo(layer);
    });
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
    return () => { layer.remove(); };
  }, [alerts, onSelect]);
  return <div ref={container} className="map" aria-label="Mapa dos alertas com coordenadas da página atual"/>;
}
