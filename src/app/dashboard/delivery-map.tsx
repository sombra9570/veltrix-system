'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { ui } from '../site-header';

/* Mapa con OpenStreetMap + Leaflet (gratis). Leaflet se carga bajo demanda desde un CDN, sin dependencias nuevas. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
let loading: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS}"]`)) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CSS; document.head.appendChild(l);
    }
    const s = document.createElement('script'); s.src = JS; s.async = true;
    s.onload = () => resolve((window as any).L);
    s.onerror = () => { loading = null; reject(new Error('leaflet')); };
    document.head.appendChild(s);
  });
  return loading;
}

export type MapPoint = { lat: number; lng: number; label: string; icon: string };

/** Enlace "Cómo llegar": abre Google Maps (en el celular ofrece Waze u otras apps de mapas). */
export const directionsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

/** Mapa del repartidor: su posición en vivo y los puntos de recogida/entrega. */
export function DeliveryMap({ points, height = 260, names = false }: { points: MapPoint[]; height?: number; names?: boolean }) {
  const { t } = useT();
  const tr = useRef(t); tr.current = t;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const me = useRef<any>(null);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !box.current || map.current) return;
      map.current = L.map(box.current, { zoomControl: true }).setView([-17.78, -63.18], 13);
      // Con una clave de MapTiler (NEXT_PUBLIC_MAPTILER_KEY) se usa su servicio comercial para las calles.
      // Sin clave se usa OpenStreetMap (sirve para pruebas y poco uso; con muchos usuarios conviene la clave).
      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      const streets = key
        ? L.tileLayer(`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`, { maxZoom: 20, tileSize: 512, zoomOffset: -1, attribution: '© MapTiler © OpenStreetMap' })
        : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
      streets.addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setReady(true);
    }).catch(() => setError(true));
    return () => { dead = true; if (map.current) { map.current.remove(); map.current = null; } };
  }, []);

  // Posición propia en vivo
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { /* sin permiso: el mapa funciona igual */ },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const key = points.map((p) => `${p.lat},${p.lng},${p.label}`).join('|');
  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !map.current) return;
    layer.current.clearLayers();
    const mk = (p: MapPoint) => L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: '', html: `<div style="font-size:26px;line-height:26px;filter:drop-shadow(0 1px 2px #0006)">${p.icon}</div>`, iconSize: [26, 26], iconAnchor: [13, 24] }),
    }).bindPopup(`<b>${p.label.replace(/[<>&]/g, '')}</b><br><a href="${directionsUrl(p.lat, p.lng)}" target="_blank" rel="noreferrer">${t('dl.how')}</a>`);
    points.forEach((p) => {
      const m = mk(p);
      if (names) m.bindTooltip(p.label.replace(/[<>&]/g, ''), { permanent: true, direction: 'bottom', offset: [0, -2], className: 'vx-map-name' });
      m.addTo(layer.current);
    });
    if (pos) {
      if (me.current) me.current.setLatLng([pos.lat, pos.lng]);
      else me.current = L.circleMarker([pos.lat, pos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).bindPopup(t('dl.myPos')).addTo(map.current);
    }
    if (!fitted.current) {
      const all: [number, number][] = points.map((p) => [p.lat, p.lng]);
      if (pos) all.push([pos.lat, pos.lng]);
      if (all.length) { map.current.fitBounds(all, { padding: [30, 30], maxZoom: 16 }); fitted.current = true; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, pos, t]);

  if (error) return <p className={`text-xs ${ui.muted}`}>{t('err.generic')}</p>;
  return (
    <div className="space-y-1">
      <div ref={box} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" />
      {pos && (
        <button type="button" onClick={() => map.current?.setView([pos.lat, pos.lng], 16)} className={`${ui.btnGhost} !px-3 !py-1 text-xs`}>📍 {t('dl.myPos')}</button>
      )}
    </div>
  );
}
