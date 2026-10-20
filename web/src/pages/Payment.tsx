import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageTitle, useTitle } from '../components/ui';
import { ApiError, get, post, type ApiPayment } from '../lib/api';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';

// Pagamento ligado à API:
// - Pix: a API cria a cobrança no provedor e devolve o QR Code e o código copia e cola;
// - Cartão: o cliente é levado ao ambiente seguro do provedor (Checkout Pro). Os dados do cartão nunca passam por aqui.

function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Desenho ilustrativo no formato de um QR Code (não é escaneável). */
function FakeQr({ seed }: { seed: string }) {
  const n = 25;
  const cells = useMemo(() => {
    let h = hash(seed);
    const out: [number, number][] = [];
    const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue;
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      if (h % 100 < 46) out.push([x, y]);
    }
    return out;
  }, [seed]);
  const Finder = ({ x, y }: { x: number; y: number }) => (
    <g><rect x={x} y={y} width="7" height="7" fill="#121826" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#121826" /></g>
  );
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width="220" height="220" role="img" aria-label="QR Code Pix" style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--line)' }}>
      {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#121826" />)}
      <Finder x={0} y={0} /><Finder x={n - 7} y={0} /><Finder x={0} y={n - 7} />
    </svg>
  );
}

export default function Payment() {
  const { id } = useParams();
  const { d, f, money, weekday, locale, hour } = useI18n();
  useTitle(d.pay.title);
  const { bookings, bookingsLoaded, refreshBookings, toast, fail } = useStore();
  const [params, setParams] = useSearchParams();
  const b = bookings.find((x) => x.id === id);
  const [method, setMethod] = useState<'pix' | 'cartao'>(b?.payment ?? 'pix');
  const [pay, setPay] = useState<ApiPayment | null>(null);
  const [now, setNow] = useState(Date.now());
  const [checking, setChecking] = useState(false);
  const ready = !!b && b.mine === 'client' && b.status === 'confirmada';

  // Cria (ou reaproveita) a cobrança na API sempre que a forma de pagamento muda
  useEffect(() => {
    if (!ready || b?.paid) return;
    let alive = true;
    setPay(null);
    post<{ payment: ApiPayment }>(`/bookings/${id}/payment`, { method: method === 'cartao' ? 'card' : 'pix' })
      .then((r) => { if (alive) setPay(r.payment); })
      .catch((e) => { if (alive) { fail(e); if (e instanceof ApiError && e.code === 'already_paid') void refreshBookings(); } });
    return () => { alive = false; };
  }, [ready, b?.paid, method, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Comprovante: dados do pagamento confirmado
  useEffect(() => {
    if (!b?.paid) return;
    get<{ payment: ApiPayment | null }>(`/bookings/${id}/payment`).then((r) => setPay(r.payment)).catch(() => {});
  }, [b?.paid, id]);

  // Volta do checkout de cartão (no ambiente de testes, confirma o pagamento simulado)
  useEffect(() => {
    const mock = params.get('mock_checkout');
    if (!mock) return;
    setChecking(true);
    post<{ payment: ApiPayment }>(`/payments/${mock}/simulate`).catch(() => get(`/payments/${mock}`))
      .then(() => refreshBookings())
      .catch(() => {})
      .finally(() => { setChecking(false); setParams({}, { replace: true }); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Enquanto espera o Pix, consulta a situação a cada 5 s
  useEffect(() => {
    if (b?.paid || !pay || pay.method !== 'pix') return;
    const t = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    const poll = window.setInterval(() => {
      get<{ payment: ApiPayment }>(`/payments/${pay.id}`).then((r) => { if (r.payment.status === 'paid') { setPay(r.payment); void refreshBookings(); } }).catch(() => {});
    }, 5000);
    return () => { window.clearInterval(t); window.clearInterval(poll); };
  }, [b?.paid, pay?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!b && !bookingsLoaded) return <div className="container" style={{ maxWidth: 640, padding: '48px 20px' }} aria-busy="true"><div className="skeleton" style={{ height: 320 }} /></div>;
  if (!b || b.mine !== 'client') return <Navigate to="/reservas" replace />;
  const p = b.other;
  if (b.status === 'aguardando') {
    return (
      <div className="container" style={{ maxWidth: 640 }}>
        <PageTitle title={d.pay.title} back={`/reservas/${b.id}`} />
        <div className="notice notice-warn"><Icon name="clock" /> {d.pay.notReady}</div>
      </div>
    );
  }

  const confirm = async () => {
    if (!pay) return;
    if (pay.method === 'card') {
      if (pay.checkoutUrl) { toast(d.live.payRedirect); window.location.href = pay.checkoutUrl; }
      return;
    }
    setChecking(true);
    try {
      let r = await get<{ payment: ApiPayment }>(`/payments/${pay.id}`);
      if (r.payment.status !== 'paid' && pay.test) r = await post<{ payment: ApiPayment }>(`/payments/${pay.id}/simulate`);
      if (r.payment.status === 'paid') { setPay(r.payment); await refreshBookings(); toast(d.pay.receiptTitle); }
      else toast(d.live.payPending, 'warn');
    } catch (e) { fail(e); } finally { setChecking(false); }
  };

  const pixCode = pay?.pixCode ?? '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(pixCode); toast(d.pay.copied); }
    catch { const el = document.getElementById('pix-code') as HTMLTextAreaElement | null; el?.select(); }
  };
  const left = pay?.expiresAt ? Math.max(0, Math.floor((new Date(pay.expiresAt).getTime() - now) / 1000)) : 15 * 60;

  const dayNum = new Date(`${b.date}T12:00:00`).getDate();

  if (b.paid) {
    return (
      <div className="container" style={{ maxWidth: 640 }}>
        <PageTitle title={d.pay.receipt} back={`/reservas/${b.id}`} />
        <div className="card card-pad stack gap-16" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="icon-box" style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--teal)', color: '#fff' }}><Icon name="check" size={30} width={2.8} /></span>
          <h2 className="display h-md">{d.pay.receiptTitle}</h2>
          <p className="muted">{f(d.pay.receiptText, { name: p.name })}</p>
          <div className="stack gap-8 small" style={{ width: '100%', textAlign: 'left' }}>
            {[
              [d.bdetail.program, `${d.act[b.activity].label} · ${p.name}`],
              [d.bdetail.when, `${weekday(b.date)} ${dayNum} · ${hour(b.time)} · ${f(d.common.hoursShort, { n: b.hours })}`],
              [d.checkout.total, money(b.total)],
              [d.checkout.payTitle, b.payment === 'pix' ? 'Pix' : d.checkout.card],
              [d.pay.code, (pay?.ref ?? pay?.id ?? b.id).toUpperCase().slice(0, 18)],
              [d.pay.date, pay?.paidAt ? new Date(pay.paidAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : '—'],
              [d.pay.status, d.pay.statusHeld],
            ].map(([k, v]) => (
              <div key={k} className="row between gap-12" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}><span className="muted">{k}</span><strong style={{ textAlign: 'right' }}>{v}</strong></div>
            ))}
          </div>
          <Link to={`/reservas/${b.id}`} className="btn btn-primary btn-sq btn-block">{d.pay.toBooking}</Link>
        </div>
      </div>
    );
  }

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <PageTitle title={d.pay.title} sub={d.pay.sub} back={`/reservas/${b.id}`} />
      <div className="stack gap-16" style={{ paddingBottom: 32 }}>
        <div className="card card-pad row between gap-12">
          <div className="stack"><strong>{d.act[b.activity].label} · {p.name}</strong><span className="small muted">{weekday(b.date)} {dayNum} · {hour(b.time)} · {f(d.common.hoursShort, { n: b.hours })}</span></div>
          <strong className="display" style={{ fontSize: 24 }}>{money(b.total)}</strong>
        </div>

        <div className="seg" role="tablist" aria-label={d.pay.method}>
          <button role="tab" aria-selected={method === 'pix'} className={method === 'pix' ? 'on' : ''} onClick={() => setMethod('pix')}>Pix</button>
          <button role="tab" aria-selected={method === 'cartao'} className={method === 'cartao' ? 'on' : ''} onClick={() => setMethod('cartao')}>{d.checkout.card}</button>
        </div>

        {method === 'pix' ? (
          <div className="card card-pad stack gap-16" style={{ alignItems: 'center', textAlign: 'center' }}>
            <h2 className="h-sm">{d.pay.pixTitle}</h2>
            <p className="small muted">{d.pay.pixText}</p>
            {pay?.pixQrBase64 ? <img src={`data:image/png;base64,${pay.pixQrBase64}`} width={220} height={220} alt="QR Code Pix" style={{ borderRadius: 16, border: '1px solid var(--line)' }} />
              : pay ? <FakeQr seed={pay.id} /> : <div className="skeleton" style={{ width: 220, height: 220, borderRadius: 16 }} />}
            <span className="badge badge-warn"><Icon name="clock" size={12} /> {f(d.pay.expires, { t: `${mm}:${ss}` })}</span>
            <label htmlFor="pix-code" className="sr-only">Pix</label>
            <textarea id="pix-code" readOnly className="textarea" value={pixCode} style={{ minHeight: 70, fontSize: 12, fontFamily: 'ui-monospace, monospace' }} />
            <button className="btn btn-light btn-sq btn-block" onClick={copy}><Icon name="list" size={18} /> {d.pay.copy}</button>
            <button className="btn btn-primary btn-sq btn-lg btn-block" disabled={!pay || checking || left === 0} onClick={confirm} data-testid="pay-confirm">{checking ? d.pay.checking : d.pay.paidBtn}</button>
          </div>
        ) : (
          <div className="card card-pad stack gap-16">
            <h2 className="h-sm">{d.pay.cardTitle}</h2>
            <div className="notice notice-teal"><Icon name="lock" /> {d.pay.cardText}</div>
            <div className="field">
              <label htmlFor="inst">{d.pay.installments}</label>
              <select id="inst" className="select" defaultValue="1">
                <option value="1">{d.pay.inst1} · {money(b.total)}</option>
                <option value="2">2× {money(Math.ceil((b.total / 2) * 100) / 100)}</option>
                <option value="3">3× {money(Math.ceil((b.total / 3) * 100) / 100)}</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sq btn-lg btn-block" disabled={!pay || checking} onClick={confirm} data-testid="pay-confirm">{checking ? d.pay.checking : f(d.pay.cardBtn, { v: money(b.total) })}</button>
          </div>
        )}
        {pay?.test && <span className="xs muted" style={{ textAlign: 'center' }}>{d.live.payTest}</span>}
      </div>
    </div>
  );
}
