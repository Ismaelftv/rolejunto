import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ActivityIcon, PageTitle, Stars, useTitle } from '../components/ui';
import { activityByKey } from '../data/activities';
import { usePartner } from '../lib/partners';
import { CONFIG } from '../lib/config';
import { useStore, type Booking } from '../lib/store';
import { useI18n } from '../i18n';

/** Etapa atual da reserva na linha do tempo (0 a 4). */
export function bookingStep(b: Booking) {
  if (b.status === 'concluida') return 4;
  if (b.status === 'em_andamento') return 3;
  if (b.paid) return 2;
  if (b.status === 'confirmada') return 1;
  return 0;
}

export default function BookingDetail() {
  const { id } = useParams();
  const { d, f, money, weekday, locale, hour } = useI18n();
  useTitle(d.bdetail.title);
  const { bookings, bookingsLoaded, bookingAction, toast, user, fail } = useStore();
  const b = bookings.find((x) => x.id === id);
  const asClient = b?.mine === 'client';
  const { p: partner } = usePartner(asClient ? b?.partnerId : undefined);

  if (!b && !bookingsLoaded) return <div className="container" style={{ maxWidth: 760, padding: '48px 20px' }} aria-busy="true"><div className="skeleton" style={{ height: 240 }} /></div>;
  if (!b) {
    return (
      <div className="container" style={{ maxWidth: 760 }}>
        <PageTitle title={d.bdetail.title} back="/reservas" />
        <div className="empty"><strong>{d.bdetail.notFound}</strong><Link to="/reservas" className="btn btn-primary btn-sq">{d.nav.bookings}</Link></div>
      </div>
    );
  }

  const p = b.other;
  const act = async (action: 'check-in' | 'complete' | 'accept' | 'decline', ok: string, warn = false) => {
    try { await bookingAction(b.id, action); toast(ok, warn ? 'warn' : 'ok'); if (action === 'check-in' && b.privateVenue) shareTrip(); } catch (e) { fail(e); }
  };
  const step = bookingStep(b);
  const cancelled = b.status === 'cancelada' || b.status === 'recusada';
  const dayNum = new Date(`${b.date}T12:00:00`).getDate();
  const shareTrip = () => {
    const c = user?.trustedContact;
    toast(c?.name ? f(d.bookings.sentTo, { name: c.name }) : d.bookings.addContact, c?.name ? 'ok' : 'warn');
  };

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <PageTitle title={d.bdetail.title} sub={f(d.bdetail.id, { id: b.id.toUpperCase() })} back="/reservas" />
      <div className="stack gap-16" style={{ paddingBottom: 32 }}>
        <Link to={asClient ? `/parceiro/${p.id}` : `/mensagens?com=${p.id}`} className="card card-pad row gap-16" style={{ textDecoration: 'none' }}>
          <OtherAvatar b={b} size={64} asLink={false} />
          <span className="stack grow">
            <strong style={{ fontSize: 20 }}>{p.name}{partner ? `, ${partner.age}` : ''}</strong>
            <span className="small muted">{partner ? `${f(d.common.approxKm, { n: partner.distanceKm })} · ${partner.neighborhood}` : asClient ? '' : d.live.clientBadge}</span>
            <span className="badge" style={{ alignSelf: 'flex-start', marginTop: 6, background: cancelled ? 'var(--danger-soft)' : 'var(--teal-soft)', color: cancelled ? 'var(--danger)' : 'var(--teal)' }}>{d.bookings.status[b.status]}</span>
          </span>
          <Icon name="next" stroke="var(--muted)" />
        </Link>

        {!cancelled && (
          <div className="card card-pad stack gap-12">
            <h2 className="h-sm">{d.bdetail.timeline}</h2>
            <ol className="timeline">
              {d.bdetail.steps.map((s, i) => (
                <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
                  <span className="tl-dot">{i < step ? <Icon name="check" size={14} width={3} /> : i + 1}</span>
                  <span className="small bold">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {asClient && b.status === 'confirmada' && !b.paid && (
          <div className="notice notice-warn" style={{ alignItems: 'center' }}>
            <Icon name="wallet" />
            <span className="grow">{f(d.notif.acceptedText, { d: `${weekday(b.date)} ${dayNum}` })}</span>
            <Link to={`/reservas/${b.id}/pagar`} className="btn btn-primary btn-sm">{d.pay.payNow}</Link>
          </div>
        )}

        {b.status === 'em_andamento' && (
          <div className="sos-panel">
            <span className="row gap-8 bold small" style={{ color: 'var(--teal)' }}><span className="dot" /> {d.bookings.checkedIn}{b.checkInAt ? f(d.bookings.at, { t: new Date(b.checkInAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) }) : ''}</span>
            <div className="row wrap gap-8">
              <SosButton id={b.id} />
              <button className="btn btn-light btn-sq" onClick={shareTrip}><Icon name="send" size={18} /> {d.bookings.notify}</button>
              <button className="btn btn-dark btn-sq" onClick={() => act('complete', d.bookings.finished)}>{d.bookings.finish}</button>
            </div>
          </div>
        )}

        <div className="card card-pad stack gap-12">
          <h2 className="h-sm">{d.bdetail.details}</h2>
          <div className="row gap-12"><ActivityIcon k={b.activity} size={40} icon={20} /><div className="stack"><span className="xs muted bold">{d.bdetail.program}</span><strong>{d.act[b.activity].label}</strong></div></div>
          <div className="grid-2">
            <div className="tile stack"><span className="xs muted bold">{d.bdetail.when}</span><strong>{weekday(b.date)} {dayNum} · {hour(b.time)}</strong></div>
            <div className="tile stack"><span className="xs muted bold">{d.bdetail.duration}</span><strong>{f(d.common.hoursLong, { n: b.hours })}</strong></div>
          </div>
          <div className="tile stack"><span className="xs muted bold">{d.bdetail.place}</span><strong className="row gap-4"><Icon name={b.privateVenue ? 'lock' : 'pin'} size={14} /> {b.place}</strong></div>
          {b.privateVenue && <div className="notice notice-teal small"><Icon name="shield" size={18} /> {d.bookings.privateCheckin}</div>}
          {b.note && <div className="tile stack"><span className="xs muted bold">{d.bdetail.note}</span><span className="small">{b.note}</span></div>}
        </div>

        <div className="card card-pad stack gap-8 small">
          <h2 className="h-sm" style={{ marginBottom: 4 }}>{d.bdetail.values}</h2>
          <div className="row between"><span className="muted">{f(d.checkout.line, { p: money(b.subtotal / b.hours), n: b.hours })}</span><span>{money(b.subtotal)}</span></div>
          <div className="row between"><span className="muted">{f(d.checkout.fee, { n: Math.round(CONFIG.serviceFeeRate * 100) })}</span><span>{money(b.fee)}</span></div>
          {b.discount > 0 && <div className="row between" style={{ color: 'var(--teal)' }}><span className="bold">{d.g.coupon.label}</span><span className="bold">−{money(b.discount)}</span></div>}
          <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, fontSize: 18 }}><strong>{d.checkout.total}</strong><strong>{money(b.total)}</strong></div>
          {b.paid && <span className="badge badge-teal" style={{ alignSelf: 'flex-start' }}><Icon name="lock" size={12} /> {d.pay.statusHeld}</span>}
          {b.paid && asClient && <Link to={`/reservas/${b.id}/pagar`} className="small bold">{d.pay.receipt} →</Link>}
        </div>

        {b.rating && <div className="card card-pad row gap-8 small">{d.bookings.yourRating} <Stars value={b.rating} /></div>}

        <div className="row wrap gap-8">
          {['aguardando', 'confirmada', 'em_andamento'].includes(b.status) && <Link to={`/mensagens?com=${p.id}`} className="btn btn-light btn-sq"><Icon name="chat" size={18} /> {d.bookings.message}</Link>}
          {!asClient && b.status === 'aguardando' && (
            <>
              <button className="btn btn-primary btn-sq" onClick={() => act('accept', d.partner.acceptedToast)}><Icon name="check" size={18} /> {d.partner.accept}</button>
              <button className="btn btn-light btn-sq" onClick={() => act('decline', d.partner.declinedToast, true)}>{d.partner.decline}</button>
            </>
          )}
          {b.status === 'confirmada' && b.paid && (
            <button className="btn btn-primary btn-sq" onClick={() => act('check-in', d.bookings.checkinToast)}><Icon name="check" size={18} /> {d.bookings.checkin}</button>
          )}
          {['aguardando', 'confirmada'].includes(b.status) && <CancelButton id={b.id} />}
        </div>

        <div className="tile row between gap-12 small">
          <span>{d.bdetail.help}</span>
          <Link to={`/ajuda?reserva=${b.id}`} className="bold">{d.g.adm2.mine.bookingCta}</Link> · <Link to="/ajuda" className="bold">{d.bdetail.helpCta}</Link>
        </div>
      </div>
    </div>
  );
}

/** Foto (ou inicial) da outra pessoa da reserva. */
export function OtherAvatar({ b, size, asLink = true }: { b: Booking; size: number; asLink?: boolean }) {
  const { d, f } = useI18n();
  const a = activityByKey(b.activity);
  const style = { background: b.other.avatar ? `center / cover no-repeat url("${b.other.avatar}")` : a.color, width: size, height: size, borderRadius: 18, fontSize: size * 0.4, textDecoration: 'none' };
  const content = b.other.avatar ? '' : b.other.name.charAt(0).toUpperCase();
  if (asLink && b.mine === 'client') return <Link to={`/parceiro/${b.partnerId}`} className="avatar" style={style} aria-label={f(d.bookings.profileOf, { name: b.other.name })}>{content}</Link>;
  return <span className="avatar" style={style}>{content}</span>;
}

/** Botão de emergência: liga para o 190 e avisa a equipe e o contato de confiança. */
export function SosButton({ id }: { id: string }) {
  const { d, f } = useI18n();
  const { sos, toast } = useStore();
  return (
    <a href={`tel:${CONFIG.emergencyPhone}`} className="btn btn-danger btn-sq" onClick={() => { sos(id).then(() => toast(d.live.sosSent, 'warn')).catch(() => {}); }}>
      <Icon name="sos" /> {f(d.bookings.sos, { n: CONFIG.emergencyPhone })}
    </a>
  );
}

/** Cancelamento com confirmação dentro da própria tela (sem janela do navegador). */
export function CancelButton({ id }: { id: string }) {
  const { d } = useI18n();
  const { bookingAction, toast, fail } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <details className="confirm-inline">
      <summary className="btn btn-ghost btn-sq">{d.bookings.cancel}</summary>
      <div className="row wrap gap-8" style={{ marginTop: 8 }}>
        <span className="small bold">{d.bookings.cancelConfirm}</span>
        <button className="btn btn-danger btn-sm" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await bookingAction(id, 'cancel'); toast(d.bookings.cancelled, 'warn'); } catch (e) { fail(e); } finally { setBusy(false); }
        }}>{d.common.continue}</button>
      </div>
    </details>
  );
}
