import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Brand';
import { ActivityIcon, useTitle } from '../components/ui';
import { ACTIVITIES, FEATURED, OTHERS, activityByKey } from '../data/activities';
import { usePartnerSearch } from '../lib/partners';
import { useI18n } from '../i18n';
import { useInstall } from '../lib/pwa';
import { useStore } from '../lib/store';


export default function Home() {
  const { d, f, lang, money } = useI18n();
  useTitle(d.home.heroA + ' ' + d.home.heroB);
  const nav = useNavigate();
  const { hash } = useLocation();
  const { toast } = useStore();
  const install = useInstall();
  const [actKey, setActKey] = useState(FEATURED[0].key);
  const [showMore, setShowMore] = useState(false);
  const [step, setStep] = useState(0);
  const [where, setWhere] = useState('');
  const cur = activityByKey(actKey);
  const { items: PARTNERS } = usePartnerSearch({ radiusKm: 50 });
  const count = (k: string) => PARTNERS.filter((p) => p.tags.includes(k as never)).length;
  const sample = PARTNERS.find((p) => p.tags.includes(cur.key)) ?? PARTNERS[0];
  const chips = showMore ? ACTIVITIES : FEATURED;

  useEffect(() => {
    if (hash === '#como') window.setTimeout(() => document.getElementById('como')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [hash]);

  const go = () => nav(`/explorar?a=${cur.key}${where ? `&onde=${encodeURIComponent(where)}` : ''}`);
  const doInstall = async () => {
    if (install.canPrompt) await install.prompt();
    else toast(install.installed ? d.account.installDone : d.account.installIos, install.installed ? 'ok' : 'warn');
  };

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-left">
            <span className="badge badge-teal" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '8px 14px' }}>
              <Icon name="shield" size={16} /> {d.home.badge}
            </span>
            <h1 className="display h-xl">
              {d.home.heroA} <span style={{ color: cur.color, transition: 'color .3s' }}>{d.act[cur.key].word}</span> {d.home.heroB}
            </h1>
            <p className="muted" style={{ fontSize: 20, maxWidth: 540 }}>{d.home.heroSub}</p>

            <div className="stack gap-12">
              <span className="eyebrow">{d.home.q1}</span>
              <div className="row wrap gap-8" role="radiogroup" aria-label={d.explore.actLabel}>
                {chips.map((a) => {
                  const on = a.key === actKey;
                  return (
                    <button
                      key={a.key} role="radio" aria-checked={on} className="chip" onClick={() => setActKey(a.key)}
                      style={on ? { background: a.color, color: '#fff', borderColor: a.color } : { background: a.soft, color: a.ink }}
                    >
                      <Icon d={a.icon} size={18} /> {d.act[a.key].label}
                    </button>
                  );
                })}
                <button className="chip" style={{ background: 'var(--white)', borderColor: 'var(--line-2)', color: 'var(--ink)' }} onClick={() => setShowMore(!showMore)} aria-expanded={showMore}>
                  {showMore ? d.home.less : f(d.home.more, { n: OTHERS.length })}
                </button>
              </div>
            </div>

            <div className="stack gap-12">
              <span className="eyebrow">{d.home.q2}</span>
              <form className="search-bar" onSubmit={(e) => { e.preventDefault(); go(); }}>
                <div className="sb-field">
                  <label htmlFor="onde">{d.home.whereLabel}</label>
                  <input id="onde" placeholder={d.home.wherePh} value={where} onChange={(e) => setWhere(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-sq btn-lg" style={{ background: cur.color, color: '#fff' }}>
                  <Icon name="search" /> {d.home.cta}
                </button>
              </form>
            </div>
          </div>

          <div className="hero-right">
            <div className="preview-card" style={{ background: cur.soft }}>
              <div className="row between">
                <div className="row gap-8 bold" style={{ color: cur.color }}>
                  <ActivityIcon k={cur.key} size={40} icon={22} /> {d.act[cur.key].label}
                </div>
                <span className="badge badge-teal" style={{ background: 'var(--white)' }}><span className="dot" /> {f(d.home.available, { n: count(cur.key) })}</span>
              </div>
              {sample ? <Link to={`/parceiro/${sample.id}`} className="card" style={{ overflow: 'hidden', textDecoration: 'none', boxShadow: 'var(--shadow-lg)', borderRadius: 24 }}>
                <div style={{ height: 220, background: cur.color, display: 'flex', alignItems: 'flex-end', padding: 18, position: 'relative', transition: 'background .3s' }}>
                  <span className="badge" style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(0,0,0,.28)', color: '#fff' }}>{d.home.photo}</span>
                  {cur.privateVenue && <span className="lock-badge" style={{ position: 'absolute', top: 16, right: 16 }}><Icon name="lock" size={12} /> {d.privateRule.badge}</span>}
                  <span className="display" style={{ fontSize: 96, lineHeight: 0.8, color: 'rgba(255,255,255,.35)' }}>{sample.initial}</span>
                </div>
                <div className="stack gap-8" style={{ padding: '18px 20px 20px' }}>
                  <div className="row between">
                    <strong className="display" style={{ fontSize: 24 }}>{sample.name}, {sample.age}</strong>
                    <span className="small muted bold">{f(d.common.approxKm, { n: sample.distanceKm })}</span>
                  </div>
                  <span className="muted">{sample.bio[lang]}</span>
                  <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <span className="bold">{money(sample.pricePerHour)}<span className="small muted" style={{ fontWeight: 500 }}>{d.common.perHour}</span></span>
                    <span className="bold" style={{ color: cur.color }}>{d.home.viewProfile}</span>
                  </div>
                </div>
              </Link> : <div className="skeleton" style={{ height: 360, borderRadius: 24 }} />}
              <div className="notice notice-dark" style={{ alignItems: 'center' }}>
                <Icon name={cur.privateVenue ? 'shield' : 'lock'} stroke="var(--teal-light)" /> {cur.privateVenue ? d.privateRule.short : d.home.payNote}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-soft">
        <div className="container stack gap-32">
          <div className="row wrap between gap-24" style={{ alignItems: 'flex-end' }}>
            <div className="stack gap-12">
              <span className="eyebrow">{d.home.featuredEyebrow}</span>
              <h2 className="display h-lg" style={{ maxWidth: 620 }}>{d.home.rolesA} <span style={{ color: 'var(--accent)' }}>{d.home.rolesB}</span></h2>
            </div>
            <p className="muted" style={{ maxWidth: 400 }}>{d.home.rolesSub}</p>
          </div>
          <div className="featured-grid">
            {FEATURED.map((a) => (
              <Link key={a.key} to={`/explorar?a=${a.key}`} className="feat-tile" style={{ background: a.color }}>
                <Icon d={a.icon} size={150} width={1.6} className="glyph" />
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <span className="ib"><Icon d={a.icon} size={26} width={2.1} /></span>
                  {a.privateVenue && <span className="lock-badge"><Icon name="lock" size={12} /> {d.privateRule.badge}</span>}
                </div>
                <div className="stack gap-8">
                  <span className="nm"><span aria-hidden style={{ marginRight: 6 }}>{a.emoji}</span>{d.act[a.key].label}</span>
                  <span className="ds">{d.act[a.key].desc}</span>
                  <span className="pill" style={{ color: a.color }}>{f(d.home.nearYou, { n: count(a.key) })}</span>
                </div>
              </Link>
            ))}
          </div>
          <div className="stack gap-12">
            <h3 className="h-sm">{d.home.moreTitle}</h3>
            <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
              {OTHERS.map((a) => (
                <Link key={a.key} to={`/explorar?a=${a.key}`} className="mini-tile">
                  <ActivityIcon k={a.key} size={46} icon={22} />
                  <span className="stack grow" style={{ minWidth: 0 }}>
                    <strong>{d.act[a.key].label}</strong>
                    <span className="xs muted">{f(d.home.nearYou, { n: count(a.key) })}</span>
                  </span>
                  <Icon name="next" size={18} stroke="var(--muted)" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="como" className="section">
        <div className="container row wrap gap-48">
          <div className="stack gap-24" style={{ flex: '1 1 440px', minWidth: 0 }}>
            <h2 className="display h-lg">{d.home.stepsTitle}</h2>
            <div className="stack gap-8">
              {d.home.steps.map((s, i) => (
                <button key={s.title} className={`step-btn ${i === step ? 'on' : ''}`} onClick={() => setStep(i)} aria-pressed={i === step}>
                  <span className="step-num">{i + 1}</span>
                  <span className="stack"><strong style={{ fontSize: 19 }}>{s.title}</strong><span className="muted small">{s.text}</span></span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
            <div className="phone" aria-hidden>
              <div className="phone-screen">
                {step === 0 && (
                  <>
                    <strong className="display" style={{ fontSize: 22 }}>{d.home.mock.who}</strong>
                    <div className="row wrap gap-4">
                      <span className="badge" style={{ background: activityByKey('balada').color, color: '#fff', padding: '6px 12px' }}>{d.act.balada.label}</span>
                      <span className="badge" style={{ background: 'var(--white)', color: 'var(--ink)', padding: '6px 12px' }}>{d.common.today}</span>
                      <span className="badge" style={{ background: 'var(--white)', color: 'var(--ink)', padding: '6px 12px' }}>{d.home.mock.upTo}</span>
                    </div>
                    {PARTNERS.filter((p) => p.tags.includes('balada')).slice(0, 3).map((p) => (
                      <div key={p.id} className="row gap-12" style={{ background: 'var(--white)', borderRadius: 16, padding: 10 }}>
                        <span className="avatar" style={{ background: p.photos[0] }}>{p.hasPhotos ? '' : p.initial}</span>
                        <span className="stack small"><strong>{p.name}, {p.age}</strong><span className="muted">{f(d.common.approxKm, { n: p.distanceKm })} · {d.act.balada.label}</span></span>
                      </div>
                    ))}
                  </>
                )}
                {step === 1 && (
                  <>
                    <strong className="display" style={{ fontSize: 22 }}>{d.home.mock.pickTime}</strong>
                    <div className="grid-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                      {d.home.mock.days.map((dd, i) => (
                        <span key={dd} className="small bold" style={{ textAlign: 'center', padding: '8px 0', borderRadius: 12, background: i === 2 ? 'var(--ink)' : '#fff', color: i === 2 ? '#fff' : 'var(--ink)' }}>{dd}</span>
                      ))}
                    </div>
                    <div className="stack gap-4 small" style={{ background: 'var(--white)', borderRadius: 16, padding: 14 }}>
                      <span className="row between"><span>{d.home.mock.summary}</span><strong>{money(270)}</strong></span>
                      <span className="bold" style={{ color: 'var(--teal)' }}>{d.home.mock.retained}</span>
                    </div>
                    <span className="btn btn-primary btn-sq">{d.home.mock.request}</span>
                  </>
                )}
                {step === 2 && (
                  <>
                    <strong className="display" style={{ fontSize: 22 }}>{d.home.mock.ongoing}</strong>
                    <div className="stack gap-4 small" style={{ background: 'var(--white)', borderRadius: 16, padding: 14 }}>
                      <span className="row gap-8 bold" style={{ color: 'var(--teal)' }}><span className="dot" /> {d.home.mock.checkin}</span>
                      <span className="muted">{d.home.mock.shared}</span>
                    </div>
                    <span className="btn btn-danger btn-sq"><Icon name="sos" /> {d.home.mock.sos}</span>
                    <div className="stack gap-4 small" style={{ background: 'var(--white)', borderRadius: 16, padding: 14 }}>
                      <strong>{d.home.mock.howWas}</strong><span className="stars" style={{ fontSize: 20 }}>★★★★★</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="seguranca" className="section section-dark">
        <div className="container row wrap gap-48" style={{ alignItems: 'flex-start' }}>
          <div className="stack gap-16" style={{ flex: '1 1 360px', minWidth: 0 }}>
            <span className="eyebrow" style={{ color: 'var(--teal-light)' }}>{d.home.safetyEyebrow}</span>
            <h2 className="display h-lg">{d.home.safetyTitle}</h2>
            <p style={{ color: 'var(--brand-muted)' }}>{d.home.safetyText}</p>
            <Link to="/seguranca" className="btn btn-light" style={{ alignSelf: 'flex-start' }}>{d.home.safetyCta}</Link>
          </div>
          <div className="grid-auto" style={{ flex: '2 1 560px', minWidth: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))', gap: 16 }}>
            {d.home.safety.map(([t, dd]) => (
              <div key={t} className="safety-card"><strong style={{ fontSize: 18 }}>{t}</strong><span style={{ color: 'var(--brand-muted)', fontSize: 15 }}>{dd}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container stack gap-24">
          <div className="cta-band">
            <div className="stack gap-16" style={{ flex: '1 1 420px', minWidth: 0 }}>
              <h2 className="display h-lg" style={{ fontSize: 'clamp(32px, 4vw, 48px)' }}>{d.home.partnerTitle}</h2>
              <p style={{ fontSize: 19, maxWidth: 520 }}>{d.home.partnerText}</p>
            </div>
            <Link to="/seja-parceiro" className="btn btn-light btn-lg">{d.home.partnerCta}</Link>
          </div>
          <div className="app-band">
            <div className="row gap-16" style={{ flex: '1 1 420px', minWidth: 0 }}>
              <LogoMark size={72} variant="coral" />
              <div className="stack gap-8">
                <h2 className="display h-md">{d.home.appTitle}</h2>
                <p style={{ color: 'var(--brand-muted)', maxWidth: 520 }}>{d.home.appText}</p>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" onClick={doInstall}><Icon name="download" /> {d.home.appCta}</button>
          </div>
        </div>
      </section>
    </>
  );
}
