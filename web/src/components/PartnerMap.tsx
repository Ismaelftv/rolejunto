// Mapa de verdade (OpenStreetMap + Leaflet) com a região APROXIMADA de cada parceiro.
// Nunca mostra o endereço: cada pessoa aparece como um círculo de ~600 m em volta de um ponto já arredondado pela API.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from './Icon';
import { activityByKey, type ActivityKey } from '../data/activities';
import type { Partner } from '../lib/partners';
import { useI18n } from '../i18n';

// Servidor de mapas configurável (ex.: MapTiler, Stadia, Carto). O padrão é o do OpenStreetMap.
const TILES = import.meta.env.VITE_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILES_ATTR = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

interface Props {
  people: Partner[];
  focus: ActivityKey | null;
  center: { lat: number; lng: number } | null;
  me: { lat: number; lng: number } | null;
}

export default function PartnerMap({ people, focus, center, me }: Props) {
  const { d, f, money, lang } = useI18n();
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [sel, setSel] = useState<Partner | null>(null);
  const [tileErr, setTileErr] = useState(false);

  // Cria o mapa uma vez
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true, minZoom: 4, maxZoom: 17 });
    let errors = 0;
    L.tileLayer(TILES, { attribution: TILES_ATTR, maxZoom: 19, crossOrigin: true })
      .on('tileerror', () => { errors++; if (errors > 6) setTileErr(true); })
      .on('tileload', () => setTileErr(false))
      .addTo(m);
    m.attributionControl.setPrefix('');
    m.setView([center?.lat ?? -23.55, center?.lng ?? -46.63], 13);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', () => setSel(null));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza os marcadores quando a lista muda
  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    if (me) {
      L.circleMarker([me.lat, me.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#1D4ED8', fillOpacity: 1 })
        .bindTooltip(d.g.map.you, { direction: 'top' }).addTo(g);
      pts.push([me.lat, me.lng]);
    }
    for (const p of people) {
      if (!p.area) continue;
      const c = activityByKey(focus && p.tags.includes(focus) ? focus : p.tags[0]).color;
      const ll: L.LatLngExpression = [p.area.lat, p.area.lng];
      L.circle(ll, { radius: p.area.radiusM, color: c, weight: 1.5, opacity: 0.6, fillColor: c, fillOpacity: 0.14, interactive: false }).addTo(g);
      const photo = p.hasPhotos ? p.photos[0].match(/url\("(.+)"\)/)?.[1] : undefined;
      const html = `<span class="mp-av" style="background:${c}${photo ? `;background-image:url('${esc(photo)}')` : ''}">${photo ? '' : esc(p.initial)}</span><span class="mp-nm">${esc(p.name)} · ${esc(money(p.pricePerHour))}</span>`;
      L.marker(ll, { icon: L.divIcon({ className: 'mp', html, iconSize: [48, 48], iconAnchor: [24, 24] }), keyboard: true, title: p.name, alt: p.name })
        .on('click', (e) => { L.DomEvent.stopPropagation(e); setSel(p); m.panTo(ll, { animate: true }); })
        .on('keypress', (e) => { if ((e.originalEvent as KeyboardEvent).key === 'Enter') nav(`/parceiro/${p.id}`); })
        .addTo(g);
      pts.push(ll);
    }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 14 });
    else if (pts.length === 1) m.setView(pts[0], 14);
    else if (center) m.setView([center.lat, center.lng], 12);
    setSel((s) => (s && people.some((p) => p.id === s.id) ? s : null));
  }, [people, focus, me?.lat, me?.lng, center?.lat, center?.lng, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="map-wrap real-map" role="region" aria-label={d.explore.mapAria}>
      <div ref={box} className="map-canvas" />
      {tileErr && <div className="map-err small"><Icon name="alert" size={16} /> {d.g.map.fail}</div>}
      {sel ? (
        <div className="map-card card">
          <span className="avatar" style={{ background: sel.hasPhotos ? sel.photos[0] : activityByKey(sel.tags[0]).color, width: 56, height: 56 }}>{sel.hasPhotos ? '' : sel.initial}</span>
          <div className="stack grow" style={{ minWidth: 0 }}>
            <strong>{sel.name}, {sel.age}</strong>
            <span className="small muted">{f(d.common.approxKm, { n: sel.distanceKm })} · {sel.rating ? `★ ${sel.rating.toFixed(1)}` : d.common.newHere} · {money(sel.pricePerHour)}{d.common.perHour}</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => nav(`/parceiro/${sel.id}${focus && sel.tags.includes(focus) ? `?a=${focus}` : ''}`)}>{d.g.map.open}</button>
        </div>
      ) : (
        <div className="map-note">
          <Icon name="shield" stroke="var(--teal)" />
          <span className="small muted"><strong style={{ color: 'var(--ink)' }}>{d.explore.mapNoteA}</strong> {d.explore.mapNoteB}</span>
        </div>
      )}
    </div>
  );
}
