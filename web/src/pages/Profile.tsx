import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon, VerifiedMark } from '../components/Icon';
import { ReportModal } from '../components/ReportModal';
import { ActivityIcon, Stars, useTitle } from '../components/ui';
import { activityByKey, type ActivityKey } from '../data/activities';
import { usePartner, type Partner } from '../lib/partners';
import { post } from '../lib/api';
import { CONFIG } from '../lib/config';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';
import NotFound from './NotFound';

interface Sel { day: number; slot: string; hours: number; activity: ActivityKey }

function BookingPanel({ p, sel, setSel, locked }: { p: Partner; sel: Sel; setSel: (s: Sel) => void; locked: boolean }) {
  const { d, f, dayLabel, hour } = useI18n();
  const day = sel.day >= 0 ? p.agenda[sel.day] : null;
  const act = activityByKey(sel.activity);
  return (
    <div className="stack gap-16">
      <div className="stack gap-8">
        <span className="label">{d.profile.step1}</span>
        <div className="row wrap gap-8">
          {p.tags.map((t) => {
            const a = activityByKey(t);
            const on = sel.activity === t;
            return (
              <button key={t} className="chip" style={{ minHeight: 40, fontSize: 14, ...(on ? { background: a.color, color: '#fff' } : { background: a.soft, color: a.ink }) }}
                aria-pressed={on} onClick={() => setSel({ ...sel, activity: t })}>
                <Icon d={a.icon} size={16} /> {d.act[t].label}
                {a.privateVenue && <Icon name="lock" size={13} width={2.6} />}
              </button>
            );
          })}
        </div>
        {act.privateVenue && (
          <div className={`notice ${locked ? 'notice-warn' : 'notice-teal'}`}>
            <Icon name={locked ? 'lock' : 'shield'} size={18} />
            <span>{locked ? f(d.privateRule.locked, { cat: d.act[act.key].label, name: p.name }) : d.privateRule.unlocked}</span>
          </div>
        )}
      </div>
      <div className="stack gap-8">
        <span className="label">{d.profile.step2}</span>
        <div className="row gap-8" style={{ overflowX: 'auto', paddingBottom: 4 }}>
          {p.agenda.map((dd, i) => {
            const free = dd.slots.length > 0;
            const label = dayLabel(dd.offset);
            return (
              <button key={i} className={`day-pill ${sel.day === i ? 'on' : ''} ${!free ? 'off' : ''}`} onClick={() => setSel({ ...sel, day: i, slot: '' })}
                aria-label={f(d.profile.dayAria, { label, d: dd.day }) + (free ? '' : d.profile.noSlotsAria)}>
                <span className="xs bold" style={{ maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                <span className={`n ${dd.off ? 'agenda-off' : ''}`}>{dd.day}</span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: free ? 'var(--green)' : 'transparent' }} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="stack gap-8">
        <span className="label">{d.profile.step3}</span>
        {!day && <span className="muted small">{d.profile.pickGreen}</span>}
        {day && day.slots.length === 0 && <div className="tile small muted">{day.off ? `${d.g.schedule.dayOff} · ` : ''}{f(d.profile.noSlots, { name: p.name })}</div>}
        {day && day.slots.length > 0 && (
          <div className="grid-3">
            {day.slots.map((s) => (
              <button key={s} className={`slot ${sel.slot === s ? 'on' : ''}`} aria-pressed={sel.slot === s} onClick={() => setSel({ ...sel, slot: s })}>{hour(s)}</button>
            ))}
          </div>
        )}
      </div>
      <div className="row between tile" style={{ padding: '10px 12px 10px 16px' }}>
        <div className="stack"><span className="bold">{d.profile.step4}</span><span className="xs muted">{f(d.profile.minNote, { n: p.minHours })}</span></div>
        <div className="stepper">
          <button aria-label={d.profile.dec} onClick={() => setSel({ ...sel, hours: Math.max(p.minHours, sel.hours - 1) })}>−</button>
          <strong style={{ minWidth: 36, textAlign: 'center', fontSize: 18 }}>{f(d.common.hoursShort, { n: sel.hours })}</strong>
          <button aria-label={d.profile.inc} onClick={() => setSel({ ...sel, hours: Math.min(8, sel.hours + 1) })}>+</button>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { id } = useParams();
  const { p, canBookPrivate, loading } = usePartner(id);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const fromAct = params.get('a') as ActivityKey | null;
  const matchAct = fromAct && p?.tags.includes(fromAct) ? fromAct : null;
  const { d, f, lang, money, dayLabel, hour } = useI18n();
  const { favorites, toggleFav, toast, user, fail } = useStore();
  const [opening, setOpening] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [tab, setTab] = useState<'sobre' | 'agenda' | 'aval'>('sobre');
  const [report, setReport] = useState(false);
  const [sel, setSel] = useState<Sel>({ day: -1, slot: '', hours: p?.minHours ?? 2, activity: matchAct ?? p?.tags[0] ?? 'balada' });
  useTitle(p ? `${p.name}, ${p.age}` : loading ? d.common.loading : d.notFound.doc);

  // Quando o perfil chega da API, ajusta a duração mínima e o programa inicial
  useEffect(() => {
    if (p) setSel((s) => ({ ...s, hours: Math.max(s.hours, p.minHours), activity: p.tags.includes(s.activity) ? s.activity : (matchAct ?? p.tags[0]) }));
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p && loading) {
    return (
      <div className="container profile-layout" aria-busy="true">
        <div className="profile-main stack gap-16" style={{ paddingTop: 16 }}>
          <div className="skeleton" style={{ height: 320, borderRadius: 24 }} />
          <div className="skeleton" style={{ height: 32, width: '50%' }} />
          <div className="skeleton" style={{ height: 18, width: '70%' }} />
        </div>
      </div>
    );
  }
  if (!p) return <NotFound />;

  const fav = favorites.includes(p.id);
  const locked = !!activityByKey(sel.activity).privateVenue && !canBookPrivate;
  const ready = sel.day >= 0 && !!sel.slot;
  const canBook = ready && !locked;
  const subtotal = p.pricePerHour * sel.hours;
  const reviews = p.reviews;

  const openChat = async () => {
    if (!user) { nav(`/entrar?next=${encodeURIComponent(`/parceiro/${p.id}`)}`); return; }
    setOpening(true);
    try {
      const r = await post<{ conversation: { id: string } }>('/conversations', { partnerId: p.id });
      nav(`/mensagens/${r.conversation.id}`);
    } catch (e) { fail(e); } finally { setOpening(false); }
  };

  const proceed = () => {
    if (locked) { setTab('agenda'); toast(f(d.privateRule.locked, { cat: d.act[sel.activity].label, name: p.name }), 'warn'); return; }
    if (!ready) { setTab('agenda'); toast(d.profile.pickFirst, 'warn'); return; }
    const q = new URLSearchParams({ p: p.id, d: p.agenda[sel.day].date, s: sel.slot, h: String(sel.hours), a: sel.activity });
    nav(`/reserva?${q}`);
  };

  const summary = ready
    ? f(d.profile.summary, { label: dayLabel(p.agenda[sel.day].offset), d: p.agenda[sel.day].day, t: hour(sel.slot), n: sel.hours })
    : f(d.profile.perHourMin, { p: money(p.pricePerHour), n: p.minHours });

  return (
    <>
      <div className="container profile-layout">
        <div className="profile-main">
          <div className="gallery" style={{ background: p.photos[photo] }}>
            {!p.hasPhotos && <span className="ini" aria-hidden>{p.initial}</span>}
            <span className="lbl">{f(d.profile.photoOf, { i: photo + 1, n: p.photos.length })}</span>
            <div className="tl"><button className="icon-btn" style={{ border: 0 }} onClick={() => nav(-1)} aria-label={d.common.back}><Icon name="back" /></button></div>
            <div className="tr">
              <button className="icon-btn" style={{ border: 0 }} aria-pressed={fav} aria-label={fav ? d.profile.unfav : d.profile.fav} onClick={() => { toggleFav(p.id); if (!fav && user) toast(f(d.g.fav.alert, { name: p.name })); }}>
                <Icon name="heart" fill={fav ? 'var(--accent)' : 'none'} stroke={fav ? 'var(--accent)' : 'var(--ink)'} />
              </button>
              <button className="icon-btn" style={{ border: 0 }} aria-label={d.profile.report} onClick={() => setReport(true)}><Icon name="flag" /></button>
            </div>
            <div className="dots">
              {p.photos.map((_, i) => (
                <button key={i} className={i === photo ? 'on' : ''} style={{ width: i === photo ? 24 : 8 }} aria-label={f(d.profile.photoOf, { i: i + 1, n: p.photos.length })} onClick={() => setPhoto(i)} />
              ))}
            </div>
          </div>

          <div className="profile-sheet">
          <div className="stack gap-8">
            <div className="row wrap gap-8">
              <h1 className="display h-md" style={{ fontSize: 32 }}>{p.name}, {p.age}</h1>
              <span className="badge badge-teal"><VerifiedMark size={14} label={d.common.verifiedAria} /> {d.common.verified}</span>
              {p.online && <span className="badge badge-soft"><span className="dot" /> {d.common.online}</span>}
            </div>
            <div className="row wrap gap-12 small muted bold">
              <span>{p.rating ? `★ ${p.rating.toFixed(1)} (${f(d.profile.reviewsLong, { n: p.reviewsCount })})` : d.common.newHere}</span>
              <span>{f(d.common.approxKm, { n: p.distanceKm })} · {p.neighborhood}</span>
              <span style={{ color: 'var(--teal)' }}>{f(d.profile.respondsIn, { t: p.responseTime })}</span>
            </div>
          </div>

          {matchAct && (
            <div className="match-box">
              <span className="icon-box" style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--accent)', color: '#fff' }}><Icon name="check" size={18} width={2.6} /></span>
              <span><strong>{d.profile.matchA}</strong> {d.act[matchAct].label}</span>
            </div>
          )}

          <div className="seg" role="tablist" aria-label={d.profile.sections}>
            <button role="tab" aria-selected={tab === 'sobre'} className={tab === 'sobre' ? 'on' : ''} onClick={() => setTab('sobre')}>{d.profile.tabs.about}</button>
            <button role="tab" aria-selected={tab === 'agenda'} className={`only-mobile ${tab === 'agenda' ? 'on' : ''}`} onClick={() => setTab('agenda')}>{d.profile.tabs.agenda}</button>
            <button role="tab" aria-selected={tab === 'aval'} className={tab === 'aval' ? 'on' : ''} onClick={() => setTab('aval')}>{f(d.profile.tabs.reviews, { n: reviews.length })}</button>
          </div>

          {tab === 'sobre' && (
            <div className="stack" style={{ gap: 20 }}>
              <p className="muted" style={{ fontSize: 16, lineHeight: 1.65 }}>{p.about[lang]}</p>
              <div className="stack gap-12">
                <h2 className="h-sm">{d.profile.upFor}</h2>
                <div className="grid-2">
                  {p.tags.map((t) => {
                    const a = activityByKey(t);
                    return (
                      <div key={t} className="row gap-12" style={{ background: a.soft, borderRadius: 16, padding: '10px 12px' }}>
                        <ActivityIcon k={t} size={36} icon={18} />
                        <span className="small bold grow">{d.act[t].label}</span>
                        {a.privateVenue && <Icon name="lock" size={14} stroke={a.color} />}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid-3">
                <div className="tile stack"><span className="xs muted bold">{d.profile.price}</span><strong>{money(p.pricePerHour)}{d.common.perHourShort}</strong></div>
                <div className="tile stack"><span className="xs muted bold">{d.profile.min}</span><strong>{f(d.common.hoursLong, { n: p.minHours })}</strong></div>
                <div className="tile stack"><span className="xs muted bold">{d.profile.langs}</span><strong>{p.languages.join(' · ')}</strong></div>
              </div>
              <div className="notice notice-dark">
                <Icon name="shield" stroke="var(--teal-light)" size={22} />
                <span><strong>{d.profile.protectedA}</strong> <span className="muted">{d.profile.protectedB}</span></span>
              </div>
            </div>
          )}

          {tab === 'agenda' && <BookingPanel p={p} sel={sel} setSel={setSel} locked={locked} />}

          {tab === 'aval' && (
            <div className="stack gap-12">
              {p.rating && (
                <div className="row gap-16 tile" style={{ padding: 18 }}>
                  <strong className="display" style={{ fontSize: 42, lineHeight: 1 }}>{p.rating.toFixed(1)}</strong>
                  <span className="stack small muted"><Stars value={p.rating} /> {f(d.profile.avgFrom, { n: p.reviewsCount })}</span>
                </div>
              )}
              {reviews.length === 0 && <div className="tile muted small">{d.profile.noReviews}</div>}
              {reviews.map((r, i) => (
                <div key={r.id ?? i} className="card card-pad stack gap-8">
                  <div className="row between small"><strong>{r.author}</strong><span className="muted">{d.act[r.activity].label} · {r.date}</span></div>
                  <Stars value={r.rating} />
                  {r.text && <p className="small muted">{r.text}</p>}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>

        <aside className="profile-side">
          <div className="book-box">
            <div className="row between gap-8">
              <strong className="display" style={{ fontSize: 24 }}>{money(p.pricePerHour)}<span className="small muted" style={{ fontFamily: 'var(--body)', fontWeight: 500 }}> {d.common.perHour}</span></strong>
              <span className="badge badge-teal"><Icon name="lock" size={14} /> {d.profile.protectedPay}</span>
            </div>
            <BookingPanel p={p} sel={sel} setSel={setSel} locked={locked} />
            <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <span className="small muted">{summary}</span>
              <strong>{ready ? money(subtotal) : ''}</strong>
            </div>
            <button className="btn btn-primary btn-sq btn-lg btn-block" disabled={!canBook} onClick={proceed}>{d.profile.requestCta}</button>
            <button className="btn btn-light btn-sq btn-block" onClick={openChat} disabled={opening}><Icon name="chat" size={18} /> {d.profile.message}</button>
            <span className="xs muted" style={{ textAlign: 'center' }}>{f(d.profile.payNote, { name: p.name, fee: Math.round(CONFIG.serviceFeeRate * 100) })}</span>
          </div>
        </aside>
      </div>

      <div className="mobile-book-bar">
        <div className="stack" style={{ minWidth: 0 }}>
          <span className="xs muted bold">{summary}</span>
          <strong style={{ fontSize: 18 }}>{ready ? money(subtotal) : d.profile.pickDayTime}</strong>
        </div>
        <button className="btn btn-sq" style={canBook ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--ink)', color: 'var(--white)' }} onClick={proceed}>
          {canBook ? d.profile.requestCta : d.profile.pickTimeCta}
        </button>
      </div>

      {report && <ReportModal name={p.name} partnerId={p.id} onClose={() => setReport(false)} />}
    </>
  );
}
