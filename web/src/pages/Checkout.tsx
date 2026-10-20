import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ActivityIcon, PageTitle, useTitle } from '../components/ui';
import { activityByKey, type ActivityKey } from '../data/activities';
import { usePartner } from '../lib/partners';
import { CONFIG } from '../lib/config';
import { errorText, useStore } from '../lib/store';
import { ApiError } from '../lib/api';
import { useI18n } from '../i18n';

export default function Checkout() {
  const { d, f, money, dayLabel, hour } = useI18n();
  useTitle(d.checkout.title);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user, createBooking, toast } = useStore();
  const { p, canBookPrivate, loading } = usePartner(params.get('p') ?? undefined);
  const dateIso = params.get('d') ?? '';
  const slot = params.get('s') ?? '';
  const hours = Number(params.get('h')) || 2;
  const actKey = (params.get('a') ?? 'balada') as ActivityKey;

  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState<'pix' | 'cartao'>('pix');
  const [agree, setAgree] = useState(false);
  const [share, setShare] = useState(false);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [apiErr, setApiErr] = useState('');

  if (!p && loading) return <div className="container" style={{ padding: '48px 20px' }} aria-busy="true"><div className="skeleton" style={{ height: 240 }} /></div>;
  const day = p?.agenda.find((x) => x.date === dateIso);
  if (!p || !day || !slot) return <Navigate to="/explorar" replace />;

  const act = activityByKey(actKey);
  const isPrivate = !!act.privateVenue;
  // Regra de segurança: casa/sítio só depois de um 1º encontro concluído em local público
  if (isPrivate && !canBookPrivate) return <Navigate to={`/parceiro/${p.id}`} replace />;
  const subtotal = p.pricePerHour * hours;
  const fee = Math.round(subtotal * CONFIG.serviceFeeRate * 100) / 100;
  const total = subtotal + fee;
  const verified = user?.verification === 'verificado' && !!user?.emailVerified;
  const needEmail = user?.verification === 'verificado' && !user?.emailVerified;
  const hasContact = !!user?.trustedContact?.phone;
  const placeOk = place.trim().length >= 4;
  const privateOk = !isPrivate || (share && hasContact);

  const confirm = async () => {
    setTried(true);
    setApiErr('');
    if (!verified || !placeOk || !agree || !privateOk) return;
    setSending(true);
    try {
      const b = await createBooking({
        partnerId: p.id, activity: actKey, startsAt: `${day.date}T${slot}:00-03:00`, hours,
        place: place.trim(), note: note.trim(), paymentMethod: payment === 'cartao' ? 'card' : 'pix',
        shareWithTrustedContact: isPrivate ? share : false, acceptRules: true,
      });
      toast(f(d.checkout.sentToast, { name: p.name }));
      nav(`/reservas/${b.id}`);
    } catch (e) {
      setApiErr(errorText(d, e));
      if (e instanceof ApiError && (e.code === 'slot_taken' || e.code === 'slot_unavailable')) window.setTimeout(() => nav(`/parceiro/${p.id}`), 2500);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container">
      <PageTitle title={d.checkout.title} sub={d.checkout.sub} back={`/parceiro/${p.id}`} />
      <div className="row wrap gap-32" style={{ alignItems: 'flex-start' }}>
        <div className="stack gap-24" style={{ flex: '999 1 520px', minWidth: 0 }}>
          {needEmail && (
            <div className="notice notice-warn">
              <Icon name="send" size={22} />
              <div className="stack gap-8">
                <span>{d.live.confirm.notice}</span>
                <Link to={`/confirmar-email?next=${encodeURIComponent(`/reserva?${params}`)}`} className="btn btn-dark btn-sm" style={{ alignSelf: 'flex-start' }}>{d.live.confirm.cta}</Link>
              </div>
            </div>
          )}
          {!verified && !needEmail && (
            <div className="notice notice-warn">
              <Icon name="id" size={22} />
              <div className="stack gap-8">
                <span><strong>{d.checkout.verifyA}</strong> {d.checkout.verifyB}</span>
                <Link to={`/verificacao?next=${encodeURIComponent(`/reserva?${params}`)}`} className="btn btn-dark btn-sm" style={{ alignSelf: 'flex-start' }}>{d.checkout.verifyNow}</Link>
              </div>
            </div>
          )}

          <div className="card card-pad stack gap-16">
            <h2 className="h-sm">{d.checkout.whereTitle}</h2>
            <div className="field">
              <label htmlFor="local">{isPrivate ? d.checkout.addrLabel : d.checkout.placeLabel}</label>
              <input id="local" className="input" placeholder={isPrivate ? d.checkout.addrPh : d.checkout.placePh} value={place} onChange={(e) => setPlace(e.target.value)} aria-invalid={tried && !placeOk} />
              {tried && !placeOk && <span className="error">{d.checkout.placeErr}</span>}
              <span className="hint">{isPrivate ? d.checkout.addrHint : d.checkout.placeHint}</span>
            </div>
            {isPrivate && (
              <div className="stack gap-8">
                {!hasContact ? (
                  <div className="notice notice-warn">
                    <Icon name="user" />
                    <div className="stack gap-8"><span>{d.checkout.needContact}</span><Link to="/conta" className="btn btn-dark btn-sm" style={{ alignSelf: 'flex-start' }}>{d.checkout.addContact}</Link></div>
                  </div>
                ) : (
                  <label className="check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> {d.checkout.shareAddr}</label>
                )}
                {tried && !privateOk && hasContact && <span className="error">{d.checkout.shareAddr}</span>}
              </div>
            )}
            <div className="field">
              <label htmlFor="obs">{f(d.checkout.noteLabel, { name: p.name })}</label>
              <textarea id="obs" className="textarea" placeholder={d.checkout.notePh} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="card card-pad stack gap-12">
            <h2 className="h-sm">{d.checkout.payTitle}</h2>
            <label className={`radio-card ${payment === 'pix' ? 'on' : ''}`}>
              <input type="radio" name="pay" checked={payment === 'pix'} onChange={() => setPayment('pix')} />
              <span className="stack"><strong>{d.checkout.pix}</strong><span className="small muted">{d.checkout.pixHint}</span></span>
            </label>
            <label className={`radio-card ${payment === 'cartao' ? 'on' : ''}`}>
              <input type="radio" name="pay" checked={payment === 'cartao'} onChange={() => setPayment('cartao')} />
              <span className="stack"><strong>{d.checkout.card}</strong><span className="small muted">{d.checkout.cardHint}</span></span>
            </label>
            <div className="notice notice-teal"><Icon name="lock" /> {d.checkout.escrow}</div>
          </div>

          <label className="check card card-pad">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{d.checkout.agreeA} <strong>{d.checkout.agreeB}</strong>{d.checkout.agreeC} <Link to="/termos">{d.checkout.terms}</Link> {d.checkout.and} <Link to="/diretrizes">{d.checkout.guidelines}</Link>.</span>
          </label>
          {tried && !agree && <span className="error">{d.checkout.agreeErr}</span>}
        </div>

        <aside style={{ flex: '1 1 340px', minWidth: 0, position: 'sticky', top: 92 }}>
          <div className="book-box">
            <div className="row gap-12">
              <span className="avatar" style={{ background: p.photos[0], width: 56, height: 56 }}>{p.hasPhotos ? '' : p.initial}</span>
              <div className="stack"><strong style={{ fontSize: 18 }}>{p.name}, {p.age}</strong><span className="small muted">{f(d.common.approxKm, { n: p.distanceKm })} · {p.neighborhood}</span></div>
            </div>
            <div className="row gap-12 tile">
              <ActivityIcon k={actKey} size={40} icon={20} />
              <div className="stack small"><strong>{d.act[actKey].label}</strong><span className="muted">{f(d.checkout.daySummary, { label: dayLabel(day.offset), d: day.day, t: hour(slot), n: hours })}</span></div>
            </div>
            {isPrivate && <div className="notice notice-teal small"><Icon name="shield" size={18} /> {d.bookings.privateCheckin}</div>}
            <div className="stack gap-8 small">
              <div className="row between"><span className="muted">{f(d.checkout.line, { p: money(p.pricePerHour), n: hours })}</span><span>{money(subtotal)}</span></div>
              <div className="row between"><span className="muted">{f(d.checkout.fee, { n: Math.round(CONFIG.serviceFeeRate * 100) })}</span><span>{money(fee)}</span></div>
              <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, fontSize: 18 }}><strong>{d.checkout.total}</strong><strong>{money(total)}</strong></div>
            </div>
            {apiErr && <span className="error" role="alert">{apiErr}</span>}
            <button className="btn btn-primary btn-sq btn-lg btn-block" onClick={confirm} disabled={!verified || sending}>
              {verified ? d.checkout.sendCta : needEmail ? d.live.confirm.cta : d.checkout.verifyCta}
            </button>
            <span className="xs muted" style={{ textAlign: 'center' }}>{d.checkout.freeCancel}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
