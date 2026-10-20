import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ActivityIcon, Modal, PageTitle, Stars, useTitle } from '../components/ui';
import { useStore, type Booking, type BookingStatus } from '../lib/store';
import { useI18n } from '../i18n';
import { CancelButton, OtherAvatar, SosButton } from './BookingDetail';

const STATUS_CLS: Record<BookingStatus, string> = {
  aguardando: 'badge-warn', confirmada: 'badge-teal', em_andamento: 'badge-ink', concluida: 'badge-soft', cancelada: 'badge-danger', recusada: 'badge-danger',
};

function RateModal({ b, onClose }: { b: Booking; onClose: () => void }) {
  const { rateBooking, toast, fail } = useStore();
  const { d, f } = useI18n();
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await rateBooking(b.id, stars, text.trim()); toast(d.bookings.thanks); onClose(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={f(d.bookings.rateTitle, { name: b.other.name })} onClose={onClose}>
      <div className="row gap-8" role="radiogroup" aria-label={d.bookings.rating}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={stars === n} aria-label={f(d.bookings.stars, { n })} onClick={() => setStars(n)}
            style={{ border: 0, background: 'none', padding: 4, fontSize: 36, color: n <= stars ? 'var(--star)' : 'var(--line-2)' }}>★</button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="rv">{d.bookings.rateLabel}</label>
        <textarea id="rv" className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={d.bookings.ratePh} />
      </div>
      <button className="btn btn-primary btn-sq btn-block" disabled={busy} onClick={send}>{d.bookings.rateSend}</button>
    </Modal>
  );
}

function BookingCard({ b, onRate }: { b: Booking; onRate: () => void }) {
  const { bookingAction, toast, user, fail } = useStore();
  const { d, f, money, weekday, locale, hour } = useI18n();
  const p = b.other;
  const asClient = b.mine === 'client';
  const act = async (action: 'check-in' | 'complete' | 'accept' | 'decline', ok: string, warn = false) => {
    try { await bookingAction(b.id, action); toast(ok, warn ? 'warn' : 'ok'); if (action === 'check-in' && b.privateVenue) shareTrip(); } catch (e) { fail(e); }
  };
  const shareTrip = () => {
    const c = user?.trustedContact;
    toast(c?.name ? f(d.bookings.sentTo, { name: c.name }) : d.bookings.addContact, c?.name ? 'ok' : 'warn');
  };
  const dayNum = new Date(`${b.date}T12:00:00`).getDate();
  return (
    <article className="card" style={{ overflow: 'hidden' }}>
      <div className="row gap-16 card-pad" style={{ alignItems: 'flex-start' }}>
        <OtherAvatar b={b} size={64} />
        <div className="stack gap-4 grow">
          <div className="row wrap gap-8"><strong style={{ fontSize: 18 }}>{p.name}</strong>{!asClient && <span className="badge badge-soft">{d.live.clientBadge}</span>}<span className={`badge ${STATUS_CLS[b.status]}`}>{d.bookings.status[b.status]}</span></div>
          <span className="row gap-8 small"><ActivityIcon k={b.activity} size={22} icon={13} /> {f(d.bookings.line, { a: d.act[b.activity].label, d: weekday(b.date), day: dayNum, t: hour(b.time), n: b.hours })}</span>
          <span className="small muted row gap-4"><Icon name={b.privateVenue ? 'lock' : 'pin'} size={14} /> {b.place}</span>
          {b.privateVenue && ['confirmada', 'aguardando'].includes(b.status) && <span className="badge badge-teal" style={{ alignSelf: 'flex-start' }}><Icon name="shield" size={12} /> {d.bookings.privateCheckin}</span>}
          {b.paid && b.status !== 'concluida' && <span className="badge badge-teal" style={{ alignSelf: 'flex-start' }}><Icon name="lock" size={12} /> {d.pay.statusHeld}</span>}
          <span className="small bold">{money(b.total)} <span className="muted" style={{ fontWeight: 500 }}>· {b.payment === 'pix' ? 'Pix' : d.bookings.card}</span></span>
          {b.rating && <span className="small row gap-8">{d.bookings.yourRating} <Stars value={b.rating} /></span>}
        </div>
      </div>

      {b.status === 'em_andamento' && (
        <div className="sos-panel" style={{ margin: '0 20px 20px' }}>
          <span className="row gap-8 bold small" style={{ color: 'var(--teal)' }}><span className="dot" /> {d.bookings.checkedIn}{b.checkInAt ? f(d.bookings.at, { t: new Date(b.checkInAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) }) : ''}</span>
          <div className="row wrap gap-8">
            <SosButton id={b.id} />
            <button className="btn btn-light btn-sq" onClick={shareTrip}><Icon name="send" size={18} /> {d.bookings.notify}</button>
            <button className="btn btn-dark btn-sq" onClick={() => act('complete', d.bookings.finished)}>{d.bookings.finish}</button>
          </div>
        </div>
      )}

      <div className="row wrap gap-8" style={{ padding: '0 20px 20px' }}>
        {['aguardando', 'confirmada', 'em_andamento'].includes(b.status) && (
          <Link to={`/mensagens?com=${p.id}`} className="btn btn-light btn-sm"><Icon name="chat" size={16} /> {d.bookings.message}</Link>
        )}
        {!asClient && b.status === 'aguardando' && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => act('accept', d.partner.acceptedToast)}><Icon name="check" size={16} /> {d.partner.accept}</button>
            <button className="btn btn-light btn-sm" onClick={() => act('decline', d.partner.declinedToast, true)}>{d.partner.decline}</button>
          </>
        )}
        {asClient && b.status === 'confirmada' && !b.paid && (
          <Link to={`/reservas/${b.id}/pagar`} className="btn btn-primary btn-sm"><Icon name="wallet" size={16} /> {d.pay.payNow}</Link>
        )}
        {b.status === 'confirmada' && b.paid && (
          <button className="btn btn-primary btn-sm" onClick={() => act('check-in', d.bookings.checkinToast)}>
            <Icon name="check" size={16} /> {d.bookings.checkin}
          </button>
        )}
        <Link to={`/reservas/${b.id}`} className="btn btn-ghost btn-sm">{d.bdetail.view}</Link>
        {['aguardando', 'confirmada'].includes(b.status) && <CancelButton id={b.id} />}
        {b.status === 'concluida' && !b.rating && <button className="btn btn-primary btn-sm" onClick={onRate}><Icon name="star" size={16} /> {d.bookings.rate}</button>}
        {b.status === 'concluida' && asClient && <Link to={`/parceiro/${p.id}`} className="btn btn-light btn-sm">{d.bookings.again}</Link>}
      </div>
    </article>
  );
}

export default function Bookings() {
  const { d, f } = useI18n();
  useTitle(d.bookings.title);
  const { bookings, bookingsLoaded, refreshBookings } = useStore();
  useEffect(() => { void refreshBookings().catch(() => {}); }, [refreshBookings]);
  const [tab, setTab] = useState<'prox' | 'ant'>('prox');
  const [rating, setRating] = useState<Booking | null>(null);
  const upcoming = bookings.filter((b) => ['aguardando', 'confirmada', 'em_andamento'].includes(b.status));
  const past = bookings.filter((b) => !['aguardando', 'confirmada', 'em_andamento'].includes(b.status));
  const list = tab === 'prox' ? upcoming : past;

  return (
    <div className="container" style={{ maxWidth: 820 }}>
      <PageTitle title={d.bookings.title} />
      <div className="seg" style={{ marginBottom: 16 }} role="tablist">
        <button role="tab" aria-selected={tab === 'prox'} className={tab === 'prox' ? 'on' : ''} onClick={() => setTab('prox')}>{f(d.bookings.upcoming, { n: upcoming.length })}</button>
        <button role="tab" aria-selected={tab === 'ant'} className={tab === 'ant' ? 'on' : ''} onClick={() => setTab('ant')}>{f(d.bookings.past, { n: past.length })}</button>
      </div>
      <div className="stack gap-12">
        {!bookingsLoaded && <div className="person-card skeleton" style={{ height: 160 }} aria-busy="true" />}
        {bookingsLoaded && list.length === 0 && (
          <div className="empty">
            <span className="icon-box" style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="calendar" size={26} /></span>
            <strong style={{ fontSize: 18 }}>{tab === 'prox' ? d.bookings.emptyUp : d.bookings.emptyPast}</strong>
            <span className="muted small">{d.bookings.emptyText}</span>
            <Link to="/explorar" className="btn btn-primary btn-sq">{d.bookings.explore}</Link>
          </div>
        )}
        {list.map((b) => <BookingCard key={b.id} b={b} onRate={() => setRating(b)} />)}
      </div>
      {rating && <RateModal b={rating} onClose={() => setRating(null)} />}
    </div>
  );
}
