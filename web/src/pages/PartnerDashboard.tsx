import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ActivityIcon, PageTitle, useTitle } from '../components/ui';
import { ACTIVITIES, type ActivityKey } from '../data/activities';
import { CONFIG } from '../lib/config';
import { brDate, useStore, type BookingStatus } from '../lib/store';
import { assetUrl, get, put, request } from '../lib/api';
import { useI18n } from '../i18n';
import { ScheduleEditor } from '../components/ScheduleEditor';

// Painel do parceiro ligado à API: pedidos, perfil, agenda semanal, fotos e ganhos.
interface ProfileRes {
  profile: { bio: string; about: string; priceCents: number; minHours: number; languages: string[]; activities: string[]; visible: boolean; ratingAvg: number | null; ratingCount: number; neighborhood: string; city: string; approxLat: number | null } | null;
  availability: { weekday: number; start: string }[];
  photos: { id: string; url: string; status: 'pending' | 'approved' | 'rejected' }[];
  checklist: Checklist;
}
interface Checklist { emailVerified: boolean; identityVerified: boolean; hasPhoto: boolean; photoPending: boolean; hasLocation: boolean; hasActivities: boolean; hasAvailability: boolean; visible: boolean; searchable: boolean }
interface Earnings { availableCents: number; pendingCents: number; monthCents: number; history: { bookingId: string; date: string; clientName: string; activity: string; hours: number; amountCents: number; paidOut: boolean }[] }

const firstSentence = (t: string) => { const s = t.trim().split(/(?<=[.!?])\s/)[0] ?? ''; return (s.length > 140 ? `${s.slice(0, 137)}…` : s); };

export default function PartnerDashboard() {
  const { d, f, money, dayLabel, hour } = useI18n();
  useTitle(d.nav.partnerPanel);
  const { user, toast, fail, bookings, bookingAction, refreshBookings } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState<'geral' | 'perfil' | 'agenda' | 'fotos' | 'ganhos'>('geral');
  const [profile, setProfile] = useState({ bio: '', price: 90, minHours: 2, languages: 'PT', tags: [] as ActivityKey[], active: false });
  const [rating, setRating] = useState<number | null>(null);
  const [slots, setSlots] = useState<{ weekday: number; start: string }[]>([]);
  const [photos, setPhotos] = useState<ProfileRes['photos']>([]);
  const [earn, setEarn] = useState<Earnings | null>(null);
  const [where, setWhere] = useState({ hood: '', city: '', hasLoc: false });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [check, setCheck] = useState<Checklist | null>(null);

  const load = useCallback(async () => {
    const r = await get<ProfileRes>('/partner/profile');
    if (r.profile) {
      setProfile({ bio: r.profile.about || r.profile.bio, price: r.profile.priceCents / 100, minHours: r.profile.minHours, languages: r.profile.languages.join(', '), tags: r.profile.activities as ActivityKey[], active: r.profile.visible });
      setRating(r.profile.ratingCount ? r.profile.ratingAvg : null);
      setWhere({ hood: r.profile.neighborhood, city: r.profile.city, hasLoc: r.profile.approxLat != null });
    }
    setCheck(r.checklist);
    setSlots(r.availability);
    setPhotos(r.photos);
  }, []);
  useEffect(() => {
    void load().catch(fail);
    void get<Earnings>('/partner/earnings').then(setEarn).catch(() => {});
    void refreshBookings().catch(() => {});
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = bookings.filter((b) => b.mine === 'partner');
  const pend = mine.filter((b) => b.status === 'aguardando');
  const accepted = mine.filter((b) => (['confirmada', 'em_andamento'] as BookingStatus[]).includes(b.status)).sort((a, b) => a.startsAt - b.startsAt);
  const bio = profile.bio;
  const offsetOf = (date: string) => Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${brDate(new Date().toISOString()).slice(0, 10)}T12:00:00`).getTime()) / 86400_000);
  const when = (b: { date: string; time: string }) => { const o = offsetOf(b.date); return `${o >= 0 && o < 7 ? dayLabel(o) : `${b.date.slice(8, 10)}/${b.date.slice(5, 7)}`}, ${hour(b.time)}`; };

  const decide = async (id: string, status: 'aceito' | 'recusado') => {
    try {
      await bookingAction(id, status === 'aceito' ? 'accept' : 'decline');
      toast(status === 'aceito' ? d.partner.acceptedToast : d.partner.declinedToast, status === 'aceito' ? 'ok' : 'warn');
    } catch (e) { fail(e); }
  };
  const setVisible = async (on: boolean) => {
    try {
      await put('/partner/profile', { visible: on });
      setProfile((p) => ({ ...p, active: on }));
      void load().catch(() => {});
      toast(on ? d.partner.visibleToast : d.partner.pausedToast, 'warn');
    } catch (e) { fail(e); }
  };
  const saveProfile = async () => {
    try {
      await put('/partner/profile', {
        about: profile.bio.trim(), bio: firstSentence(profile.bio), priceCents: Math.round(profile.price * 100), minHours: profile.minHours,
        languages: profile.languages.split(/[,;/]/).map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 8), activities: profile.tags,
        neighborhood: where.hood.trim(), city: where.city.trim(), ...(gps ?? {}),
      });
      toast(d.partner.savedToast);
      setGps(null);
      await load();
    } catch (e) { fail(e); }
  };
  const pickGps = () => {
    if (!navigator.geolocation) { toast(d.live.where.gpsFail, 'warn'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); toast(d.live.where.gpsOk); },
      () => toast(d.live.where.gpsFail, 'warn'),
      { timeout: 10000, maximumAge: 600_000 },
    );
  };

  const uploadPhoto = async (file: File) => {
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await request<{ photo: ProfileRes['photos'][number] }>('POST', '/partner/photos', form);
      setPhotos((p) => [...p, r.photo]);
      toast(d.partner.photoSent);
      void load().catch(() => {});
    } catch (e) { fail(e); }
  };

  const TABS = ['geral', 'perfil', 'agenda', 'fotos', 'ganhos'] as const;

  return (
    <div className="container">
      <PageTitle title={f(d.partner.title, { name: user?.name ?? '' })} sub={d.partner.sub} />
      <div className="row wrap between gap-12" style={{ marginBottom: 16 }}>
        <div className="seg" style={{ flex: '1 1 520px', overflowX: 'auto' }} role="tablist">
          {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{d.partner.tabs[k]}</button>)}
        </div>
        <label className="check card" style={{ padding: '10px 14px', alignItems: 'center' }}>
          <input type="checkbox" checked={profile.active} onChange={(e) => void setVisible(e.target.checked)} />
          <span className="bold">{profile.active ? d.partner.visible : d.partner.paused}</span>
        </label>
      </div>

      {tab === 'geral' && (
        <div className="stack gap-24">
          {check && !check.searchable && (
            <div className="card card-pad stack gap-12" style={{ borderColor: 'var(--accent)' }}>
              <h2 className="h-sm">{d.live.check.title}</h2>
              <ul className="stack gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {([
                  ['emailVerified', d.live.check.email, () => nav('/confirmar-email?next=%2Fpainel')],
                  ['identityVerified', user?.verification === 'em_analise' ? d.live.check.identityReview : d.live.check.identity, user?.verification === 'em_analise' ? null : () => nav('/verificacao?next=%2Fpainel')],
                  ['hasPhoto', !check.hasPhoto && check.photoPending ? d.g.photo.checkPending : d.g.photo.check, !check.hasPhoto && check.photoPending ? null : () => setTab('fotos')],
                  ['hasLocation', d.live.check.location, () => setTab('perfil')],
                  ['hasActivities', d.live.check.activities, () => setTab('perfil')],
                  ['hasAvailability', d.live.check.availability, () => setTab('agenda')],
                  ['visible', d.live.check.visible, () => void setVisible(true)],
                ] as const).map(([k, label, go]) => {
                  const ok = check[k];
                  return (
                    <li key={k} className="row between gap-12" data-check={k} data-ok={ok}>
                      <span className="row gap-8 small" style={{ fontWeight: ok ? 500 : 700, color: ok ? 'var(--muted)' : 'var(--ink)' }}>
                        <span className="icon-box" style={{ width: 24, height: 24, borderRadius: 8, background: ok ? 'var(--teal)' : 'var(--soft)', color: ok ? '#fff' : 'var(--muted)' }}>
                          {ok ? <Icon name="check" size={14} width={3} /> : <Icon name="clock" size={14} />}
                        </span>
                        {label}
                      </span>
                      {!ok && go && <button className="btn btn-light btn-sm" onClick={go}>{d.live.check.go}</button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {check?.searchable && <div className="notice notice-teal"><Icon name="check" /> {d.live.check.done}</div>}
          <div className="dash-grid">
            <div className="stat"><span className="small muted bold">{d.partner.stats.pending}</span><span className="v">{pend.length}</span></div>
            <div className="stat"><span className="small muted bold">{d.partner.stats.upcoming}</span><span className="v">{accepted.length}</span></div>
            <div className="stat"><span className="small muted bold">{d.partner.stats.month}</span><span className="v">{money((earn?.monthCents ?? 0) / 100)}</span></div>
            <div className="stat"><span className="small muted bold">{d.partner.stats.rating}</span><span className="v">{rating ? `${rating.toFixed(1)} ★` : '—'}</span></div>
          </div>
          <div className="stack gap-12">
            <h2 className="h-sm">{d.partner.waiting}</h2>
            {pend.length === 0 && <div className="tile small muted">{d.partner.noPending}</div>}
            {pend.map((r) => (
              <div key={r.id} className="card card-pad stack gap-12">
                <div className="row wrap between gap-12">
                  <div className="row gap-12">
                    <ActivityIcon k={r.activity} size={44} />
                    <div className="stack"><strong>{r.other.name} · {d.act[r.activity].label}</strong><span className="small muted">{when(r)} · {f(d.common.hoursShort, { n: r.hours })} · {r.place}</span></div>
                  </div>
                  <span className="badge badge-teal">{f(d.partner.youGet, { p: money(r.subtotal) })}</span>
                </div>
                {r.note && <p className="small tile">“{r.note}”</p>}
                <div className="row wrap gap-8">
                  <button className="btn btn-primary btn-sm" onClick={() => decide(r.id, 'aceito')}><Icon name="check" size={16} /> {d.partner.accept}</button>
                  <button className="btn btn-light btn-sm" onClick={() => decide(r.id, 'recusado')}>{d.partner.decline}</button>
                  <Link to={`/mensagens?com=${r.other.id}`} className="btn btn-ghost btn-sm"><Icon name="chat" size={16} /> {d.partner.chat}</Link>
                </div>
              </div>
            ))}
          </div>
          <div className="stack gap-12">
            <h2 className="h-sm">{d.partner.upcomingTitle}</h2>
            {accepted.length === 0 && <div className="tile small muted">{d.live.noUpcoming}</div>}
            {accepted.map((r) => (
              <Link key={r.id} to={`/reservas/${r.id}`} className="card card-pad row wrap between gap-12" style={{ textDecoration: 'none' }}>
                <div className="row gap-12"><ActivityIcon k={r.activity} size={40} icon={20} /><div className="stack"><strong>{r.other.name}</strong><span className="small muted">{when(r)} · {r.place}</span></div></div>
                <span className={`badge ${r.status === 'em_andamento' ? 'badge-ink' : 'badge-teal'}`}>{r.status === 'em_andamento' ? d.bookings.status.em_andamento : r.paid ? d.pay.statusHeld : d.partner.confirmed}</span>
              </Link>
            ))}
          </div>
          <div className="notice notice-dark"><Icon name="shield" stroke="var(--teal-light)" /><span>{d.partner.reminder}</span></div>
        </div>
      )}

      {tab === 'perfil' && (
        <form className="card card-pad stack gap-16" style={{ maxWidth: 760 }} onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
          <div className="field">
            <label htmlFor="bio">{d.partner.about}</label>
            <textarea id="bio" className="textarea" maxLength={500} value={bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
            <span className="hint">{f(d.partner.bioHint, { n: bio.length })}</span>
          </div>
          <div className="stack gap-8">
            <span className="label">{d.partner.acts}</span>
            <div className="row wrap gap-8">
              {ACTIVITIES.map((a) => {
                const on = profile.tags.includes(a.key);
                return (
                  <button type="button" key={a.key} className="chip" aria-pressed={on} style={on ? { background: a.color, color: '#fff' } : { background: a.soft, color: a.ink }}
                    onClick={() => setProfile({ ...profile, tags: on ? profile.tags.filter((t) => t !== a.key) : [...profile.tags, a.key] })}>
                    <Icon d={a.icon} size={16} /> {d.act[a.key].label}{a.privateVenue && <Icon name="lock" size={13} width={2.6} />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="stack gap-8">
            <span className="label">{d.live.where.title}</span>
            <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
              <div className="field"><label htmlFor="hood">{d.live.where.hood}</label><input id="hood" className="input" maxLength={80} value={where.hood} onChange={(e) => setWhere({ ...where, hood: e.target.value })} /></div>
              <div className="field"><label htmlFor="city">{d.live.where.city}</label><input id="city" className="input" maxLength={80} autoComplete="address-level2" value={where.city} onChange={(e) => setWhere({ ...where, city: e.target.value })} /></div>
            </div>
            <div className="row wrap gap-8">
              <button type="button" className="btn btn-light btn-sm" onClick={pickGps}><Icon name="pin" size={16} /> {d.live.where.useGps}</button>
              <span className="badge" style={{ alignSelf: 'center', background: gps || where.hasLoc ? 'var(--teal-soft)' : 'var(--accent-soft)', color: gps || where.hasLoc ? 'var(--teal)' : 'var(--accent)' }}>
                {gps || where.hasLoc ? d.live.where.set : d.live.where.missing}
              </span>
            </div>
            <span className="hint">{d.live.where.hint}</span>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
            <div className="field"><label htmlFor="pr">{d.partner.price}</label><input id="pr" type="number" min={30} max={1000} className="input" value={profile.price} onChange={(e) => setProfile({ ...profile, price: +e.target.value })} /></div>
            <div className="field"><label htmlFor="mh">{d.partner.minH}</label><select id="mh" className="select" value={profile.minHours} onChange={(e) => setProfile({ ...profile, minHours: +e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{f(d.common.hoursShort, { n })}</option>)}</select></div>
            <div className="field"><label htmlFor="lg">{d.partner.langs}</label><input id="lg" className="input" value={profile.languages} onChange={(e) => setProfile({ ...profile, languages: e.target.value })} /></div>
          </div>
          <span className="hint">{f(d.partner.feeHint, { p: money(profile.price), n: Math.round(CONFIG.serviceFeeRate * 100) })}</span>
          <button className="btn btn-primary btn-sq" style={{ alignSelf: 'flex-start' }}>{d.partner.saveProfile}</button>
        </form>
      )}

      {tab === 'agenda' && <ScheduleEditor initial={slots} onSaved={() => void load().catch(() => {})} />}

      {tab === 'fotos' && (
        <div className="stack gap-16" style={{ maxWidth: 760 }}>
          <div className="notice notice-warn"><Icon name="camera" /> {d.g.photo.rule}</div>
          <div className="notice notice-teal"><Icon name="eye" /> {d.partner.photosNote}</div>
          <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {photos.map((ph, i) => (
              <div key={ph.id} className="card stack" style={{ overflow: 'hidden' }}>
                <div style={{ height: 140, background: `center / cover no-repeat url("${assetUrl(ph.url)}"), ${['#7E22CE', '#9F1239', '#0369A1', '#C2410C'][i % 4]}` }} />
                <div className="stack gap-4" style={{ padding: 10 }}>
                  <span className={`badge ${ph.status === 'approved' ? 'badge-teal' : ph.status === 'rejected' ? 'badge-danger' : 'badge-warn'}`} style={{ alignSelf: 'flex-start' }}>{ph.status === 'approved' ? d.partner.approved : ph.status === 'rejected' ? d.live.removed : d.partner.inReview}</span>
                </div>
              </div>
            ))}
            <label htmlFor="newph" className="upload-box" style={{ minHeight: 200, justifyContent: 'center' }}>
              <Icon name="plus" size={28} />
              <strong className="small">{d.partner.addPhoto}</strong>
              <input id="newph" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
                e.target.value = '';
              }} />
            </label>
          </div>
        </div>
      )}

      {tab === 'ganhos' && (
        <div className="stack gap-16">
          <div className="dash-grid">
            <div className="stat"><span className="small muted bold">{d.partner.withdraw}</span><span className="v">{money((earn?.availableCents ?? 0) / 100)}</span><button className="btn btn-dark btn-sm" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => toast(d.partner.withdrawToast)}><Icon name="wallet" size={16} /> {d.partner.withdrawCta}</button></div>
            <div className="stat"><span className="small muted bold">{d.partner.pendingRelease}</span><span className="v">{money((earn?.pendingCents ?? 0) / 100)}</span></div>
            <div className="stat"><span className="small muted bold">{d.partner.monthTotal}</span><span className="v">{money((earn?.monthCents ?? 0) / 100)}</span></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{d.partner.th.date}</th><th>{d.partner.th.client}</th><th>{d.partner.th.program}</th><th>{d.partner.th.hours}</th><th>{d.partner.th.value}</th><th>{d.partner.th.status}</th></tr></thead>
              <tbody>
                {(earn?.history ?? []).length === 0 && <tr><td colSpan={6} className="muted">{d.live.noHistory}</td></tr>}
                {(earn?.history ?? []).map((h) => {
                  const local = brDate(h.date);
                  return (
                    <tr key={h.bookingId}><td>{`${local.slice(8, 10)}/${local.slice(5, 7)}`}</td><td>{h.clientName}</td><td>{d.act[h.activity as ActivityKey]?.label ?? h.activity}</td><td>{f(d.common.hoursShort, { n: h.hours })}</td><td>{money(h.amountCents / 100)}</td><td><span className={`badge ${h.paidOut ? 'badge-soft' : 'badge-teal'}`}>{h.paidOut ? d.live.paidOut : d.partner.released}</span></td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="hint">{d.live.payoutNote}</span>
        </div>
      )}
    </div>
  );
}
