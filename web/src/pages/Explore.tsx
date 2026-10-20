import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PersonCard, PersonCardSkeleton } from '../components/PersonCard';
import { useTitle } from '../components/ui';
import { ACTIVITIES, activityByKey, type ActivityKey } from '../data/activities';
import { usePartnerSearch, type WhenKey } from '../lib/partners';
import { useStore } from '../lib/store';
import { LangSelect, useI18n } from '../i18n';

const PartnerMap = lazy(() => import('../components/PartnerMap'));
const WHENS: WhenKey[] = ['hoje', 'amanha', 'fds'];
let lastGeo: { lat: number; lng: number } | null = null;

export default function Explore() {
  const { d, f, money } = useI18n();
  useTitle(d.nav.explore);
  const { user } = useStore();
  const nav = useNavigate();
  const pending = useStore().unread;
  const [params, setParams] = useSearchParams();
  const act = (params.get('a') as ActivityKey | null) ?? null;
  const [when, setWhen] = useState<WhenKey | null>(null);
  const [view, setView] = useState<'lista' | 'mapa'>('lista');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [maxDist, setMaxDist] = useState(25);
  const [maxPrice, setMaxPrice] = useState(150);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [sort, setSort] = useState<'dist' | 'preco' | 'nota'>('dist');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(lastGeo);
  const place = params.get('onde') || d.explore.defaultPlace;

  // Usa a localização do aparelho, se a pessoa permitir (senão, o centro de São Paulo)
  useEffect(() => {
    if (lastGeo || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { lastGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setGeo(lastGeo); },
      () => { /* sem permissão: usa o padrão */ },
      { maximumAge: 10 * 60_000, timeout: 8000 },
    );
  }, []);

  const setAct = (k: ActivityKey | null) => {
    const next = new URLSearchParams(params);
    if (k) next.set('a', k); else next.delete('a');
    setParams(next, { replace: true });
  };

  const cur = act ? activityByKey(act) : null;
  const color = cur?.color ?? 'var(--accent)';

  const { items: people, center, loading, error } = usePartnerSearch({
    activity: act, when, q, radiusKm: maxDist, maxPrice: maxPrice < 150 ? maxPrice : undefined, online: onlineOnly, sort, ...(geo ?? {}), city: geo ? undefined : user?.city,
  });

  const activeFilters = (maxDist < 25 ? 1 : 0) + (maxPrice < 150 ? 1 : 0) + (onlineOnly ? 1 : 0);
  const reset = () => { setWhen(null); setQ(''); setMaxDist(25); setMaxPrice(150); setOnlineOnly(false); setAct(null); };

  return (
    <>
      <div className="explore-head">
        <div className="container">
          <div className="greet-row">
            <div className="stack" style={{ minWidth: 0 }}>
              <span className="small muted bold">{user ? f(d.explore.greetName, { name: user.name }) : d.explore.greet}</span>
              <button className="loc-btn" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-label={`${place}. ${d.explore.changePlace}`}>
                <Icon name="pin" size={16} stroke={color} width={2.4} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place}</span>
                <Icon name="down" size={14} stroke="var(--muted)" width={2.6} />
              </button>
            </div>
            <div className="row gap-8 only-mobile">
              <LangSelect compact />
              <button className="icon-btn" aria-label={d.nav.notifications} onClick={() => nav('/notificacoes')}>
                <Icon name="bell" />
                {pending > 0 && <span className="bell-dot" />}
              </button>
            </div>
          </div>
          <h1 className="display h-md">{d.explore.titleA} <span style={{ color, transition: 'color .3s' }}>{d.explore.titleB}</span></h1>

          <div className="act-scroller" role="radiogroup" aria-label={d.explore.actLabel}>
            <button role="radio" aria-checked={!act} className="act-tile" onClick={() => setAct(null)}
              style={!act ? { background: 'var(--soft)', borderColor: 'var(--ink)' } : undefined}>
              <span className="ib" style={{ background: !act ? 'var(--ink)' : 'var(--soft)', color: !act ? 'var(--white)' : 'var(--ink)' }}><Icon name="grid" size={22} /></span>
              {d.explore.all}
            </button>
            {ACTIVITIES.map((a) => {
              const on = act === a.key;
              return (
                <button key={a.key} role="radio" aria-checked={on} className="act-tile" onClick={() => setAct(a.key)}
                  style={on ? { background: a.soft, borderColor: a.color } : undefined}>
                  <span className="ib" style={{ background: on ? a.color : a.soft, color: on ? '#fff' : a.ink, position: 'relative' }}>
                    <Icon d={a.icon} size={22} width={2.1} />
                    {a.privateVenue && <span style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 6, background: 'var(--ink)', color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="lock" size={10} width={2.6} /></span>}
                  </span>
                  <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.act[a.key].label}</span>
                </button>
              );
            })}
          </div>

          {cur?.privateVenue && (
            <div className="notice notice-teal"><Icon name="shield" /> {d.privateRule.short}</div>
          )}

          <div className="filters-row">
            <div className="search-inline only-desktop">
              <Icon name="search" size={18} stroke="var(--muted)" />
              <label htmlFor="busca" className="sr-only">{d.explore.searchLabel}</label>
              <input id="busca" placeholder={d.explore.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="seg" style={{ flex: '1 1 280px' }} role="group" aria-label={d.explore.whenLabel}>
              {WHENS.map((w) => (
                <button key={w} className={when === w ? 'on' : ''} aria-pressed={when === w} onClick={() => setWhen(when === w ? null : w)}>
                  {w === 'fds' ? <><span className="only-desktop">{d.explore.when.fds}</span><span className="only-mobile">{d.explore.fdsShort}</span></> : d.explore.when[w]}
                </button>
              ))}
            </div>
            <button className="btn btn-light btn-sq only-desktop" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
              <Icon name="sliders" size={18} /> {d.explore.filters}{activeFilters ? ` (${activeFilters})` : ''}
            </button>
            <button className="btn btn-dark btn-sq" onClick={() => setView(view === 'lista' ? 'mapa' : 'lista')}>
              <Icon name={view === 'lista' ? 'map' : 'list'} size={18} /> {view === 'lista' ? d.explore.map : d.explore.list}
            </button>
          </div>

          {showFilters && (
            <div className="filter-panel">
              <div className="field only-mobile">
                <label htmlFor="busca-m">{d.explore.searchLabel}</label>
                <input id="busca-m" className="input" placeholder={d.explore.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="dist">{f(d.explore.maxDist, { n: maxDist })}</label>
                <input id="dist" type="range" min={1} max={50} value={maxDist} onChange={(e) => setMaxDist(+e.target.value)} className="range" />
              </div>
              <div className="field">
                <label htmlFor="preco">{f(d.explore.maxPrice, { p: money(maxPrice) })}</label>
                <input id="preco" type="range" min={40} max={150} step={10} value={maxPrice} onChange={(e) => setMaxPrice(+e.target.value)} className="range" />
              </div>
              <div className="field">
                <label htmlFor="ord">{d.explore.sortBy}</label>
                <select id="ord" className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="dist">{d.explore.sort.dist}</option>
                  <option value="preco">{d.explore.sort.preco}</option>
                  <option value="nota">{d.explore.sort.nota}</option>
                </select>
              </div>
              <div className="stack gap-8" style={{ justifyContent: 'flex-end' }}>
                <label className="check"><input type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} /> {d.explore.onlineOnly}</label>
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={reset}>{d.common.clearAll}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="container" style={{ paddingTop: 20 }}>
        <div className="row between gap-12" style={{ marginBottom: 12 }}>
          <span className="bold">{loading ? d.common.loading : f(people.length === 1 ? d.explore.count1 : d.explore.countN, { n: people.length })}</span>
          <span className="small muted bold">{d.explore.sortFirst[sort]}</span>
        </div>

        {loading ? (
          <div className="person-grid" aria-busy="true">{[0, 1, 2].map((i) => <PersonCardSkeleton key={i} />)}</div>
        ) : error && people.length === 0 ? (
          <div className="empty">
            <span className="icon-box" style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--soft)', color: 'var(--muted)' }}><Icon name="alert" size={26} /></span>
            <strong style={{ fontSize: 18 }}>{d.live.loadError}</strong>
            <button className="btn btn-dark btn-sq" onClick={() => nav(0)}>{d.live.retry}</button>
          </div>
        ) : people.length === 0 ? (
          <div className="empty">
            <span className="icon-box" style={{ width: 56, height: 56, borderRadius: 18, background: cur?.soft ?? 'var(--accent-soft)', color }}><Icon name="clock" size={26} /></span>
            <strong style={{ fontSize: 18 }}>{d.explore.emptyTitle}</strong>
            <span className="muted small" style={{ maxWidth: 360 }}>{d.explore.emptyText}</span>
            <button className="btn btn-sq" style={{ background: color, color: '#fff' }} onClick={reset}>{d.explore.clearFilters}</button>
          </div>
        ) : view === 'lista' ? (
          <div className="person-grid">{people.map((p) => <PersonCard key={p.id} p={p} focus={act} />)}</div>
        ) : (
          <Suspense fallback={<div className="map-wrap skeleton" aria-busy="true"><span className="sr-only">{d.g.map.loading}</span></div>}>
            <PartnerMap people={people} focus={act} center={center} me={geo} />
          </Suspense>
        )}
      </div>
    </>
  );
}
