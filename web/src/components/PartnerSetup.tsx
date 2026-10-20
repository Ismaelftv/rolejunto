// Assistente de configuração do parceiro: 3 passos (você, onde e quanto, quando).
// Cada passo grava na hora (PUT /partner/setup), então dá para parar e continuar depois de onde parou.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { publicConfig } from './SocialLogin';
import { ACTIVITIES, type ActivityKey } from '../data/activities';
import { assetUrl, get, put, request } from '../lib/api';
import { shrinkMax } from '../lib/image';
import { PRESET_KEYS, presetSlots, type PresetKey } from '../lib/schedulePresets';
import { useStore } from '../lib/store';
import { CONFIG } from '../lib/config';
import { useI18n } from '../i18n';

export interface SetupProfile { about: string; bio: string; priceCents: number; minHours: number; languages: string[]; activities: string[]; neighborhood: string; city: string; approxLat: number | null }
export interface SetupPhoto { id: string; url: string; status: 'pending' | 'approved' | 'rejected' }
export interface SetupState {
  profile: SetupProfile | null;
  photos: SetupPhoto[];
  availabilityCount: number;
  checklist: { hasActivities: boolean; hasLocation: boolean; hasAvailability: boolean; hasPhoto: boolean; photoPending: boolean };
}

export const LANGS = ['PT', 'EN', 'ES', 'FR', 'IT', 'DE', 'ZH'];
const firstSentence = (t: string) => { const s = t.trim().split(/(?<=[.!?])\s/)[0] ?? ''; return s.length > 140 ? `${s.slice(0, 137)}…` : s; };

export function PartnerSetup({ state, onChanged }: { state: SetupState; onChanged: () => Promise<void> | void }) {
  const { d, f, money } = useI18n();
  const { toast, fail } = useStore();
  const s = d.g.setup;
  const ck = state.checklist;
  const p = state.profile;

  // Começa no primeiro passo que ainda está incompleto
  const firstOpen = !(ck.hasActivities && (ck.hasPhoto || ck.photoPending) && (p?.about.length ?? 0) >= 20) ? 0 : !ck.hasLocation ? 1 : 2;
  const [step, setStep] = useState(firstOpen);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [requirePhoto, setRequirePhoto] = useState(true);
  const [about, setAbout] = useState(p?.about || '');
  const [acts, setActs] = useState<ActivityKey[]>((p?.activities ?? []) as ActivityKey[]);
  const [city, setCity] = useState(p?.city || '');
  const [hood, setHood] = useState(p?.neighborhood || '');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [price, setPrice] = useState(p ? p.priceCents / 100 : 90);
  const [minHours, setMinHours] = useState(p?.minHours ?? 2);
  const [langs, setLangs] = useState<string[]>(p?.languages?.length ? p.languages : ['PT']);
  const [picked, setPicked] = useState<PresetKey[]>(['evenings']);
  const [cities, setCities] = useState<string[]>([]);
  const [photos, setPhotos] = useState(state.photos);
  const [upBusy, setUpBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void publicConfig().then((c) => setRequirePhoto(c.requirePartnerPhoto)); }, []);
  useEffect(() => { void get<{ items: string[] }>('/cities').then((r) => setCities(r.items)).catch(() => {}); }, []);
  useEffect(() => setPhotos(state.photos), [state.photos]);

  const shown = useMemo(() => photos.filter((x) => x.status !== 'rejected'), [photos]);
  const hasPhoto = shown.length > 0;
  const slotCount = useMemo(() => presetSlots(picked).length, [picked]);
  const cityKnown = cities.length === 0 || cities.some((c) => c.toLowerCase() === city.trim().toLowerCase());
  const hasLoc = !!gps || ck.hasLocation;

  const upload = async (file: File) => {
    setUpBusy(true);
    try {
      const form = new FormData();
      form.append('file', await shrinkMax(file), 'photo.jpg');
      const r = await request<{ photo: SetupPhoto }>('POST', '/partner/photos', form);
      setPhotos((x) => [...x, r.photo]);
      setErrs((e) => ({ ...e, photo: '' }));
      await onChanged();
    } catch (e) { fail(e); } finally { setUpBusy(false); }
  };

  const pickGps = () => {
    if (!navigator.geolocation) { toast(d.live.where.gpsFail, 'warn'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setErrs((e) => ({ ...e, city: '' })); toast(s.gpsOk); },
      () => toast(d.live.where.gpsFail, 'warn'),
      { timeout: 10000, maximumAge: 600_000 },
    );
  };

  const save = async (body: object) => {
    setBusy(true);
    try { await put('/partner/setup', body); await onChanged(); return true; }
    catch (e) { fail(e); return false; }
    finally { setBusy(false); }
  };

  const next = async () => {
    const er: Record<string, string> = {};
    if (step === 0) {
      if (requirePhoto && !hasPhoto) er.photo = s.photoRequired;
      if (about.trim().length < 20) er.about = s.aboutShort;
      if (acts.length === 0) er.acts = s.actsRequired;
      setErrs(er);
      if (Object.keys(er).length) return;
      if (await save({ profile: { about: about.trim(), bio: firstSentence(about), activities: acts } })) setStep(1);
    } else if (step === 1) {
      if (!hasLoc && !(city.trim() && cityKnown)) er.city = s.cityOrGps;
      if (!(price >= 30 && price <= 1000)) er.price = s.priceRange;
      setErrs(er);
      if (Object.keys(er).length) return;
      if (await save({ profile: { city: city.trim(), neighborhood: hood.trim(), priceCents: Math.round(price * 100), minHours, languages: langs.slice(0, 8), ...(gps ?? {}) } })) { setGps(null); setStep(2); }
    } else {
      if (picked.length === 0) { setErrs({ when: s.pickOne }); return; }
      if (await save({ slots: presetSlots(picked) })) toast(s.doneToast);
    }
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="card card-pad stack gap-16" style={{ borderColor: 'var(--accent)' }} data-setup-step={step + 1}>
      <div className="stack gap-4">
        <h2 className="h-sm">{s.title}</h2>
        <span className="small muted">{s.sub}</span>
      </div>
      <div className="stack gap-8">
        <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label={f(s.stepOf, { i: step + 1, n: 3 })}>
          {[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}
        </div>
        <span className="small bold">{f(s.stepOf, { i: step + 1, n: 3 })} · {s.steps[step]}</span>
      </div>

      {step === 0 && (
        <div className="stack gap-16">
          <div className="stack gap-8">
            <span className="label">{s.photoTitle}</span>
            <div className="row wrap gap-12" style={{ alignItems: 'center' }}>
              {shown.slice(0, 3).map((ph) => (
                <div key={ph.id} style={{ width: 84, height: 84, borderRadius: 16, background: `center / cover no-repeat url("${assetUrl(ph.url)}"), var(--soft)` }} aria-hidden />
              ))}
              <button type="button" className="btn btn-light btn-sm" disabled={upBusy} onClick={() => fileRef.current?.click()}>
                <Icon name="camera" size={16} /> {upBusy ? s.saving : hasPhoto ? s.photoChange : s.photoAdd}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={s.photoAdd}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} />
            </div>
            <span className="hint">{hasPhoto ? `${s.photoOk}${shown.every((x) => x.status === 'pending') ? ` · ${s.photoPending}` : ''}` : s.photoHint}</span>
            {errs.photo && <span className="error" role="alert">{errs.photo}</span>}
          </div>
          <div className="field">
            <label htmlFor="su-about">{s.about}</label>
            <textarea id="su-about" className="textarea" maxLength={500} placeholder={s.aboutPh} value={about} onChange={(e) => setAbout(e.target.value)} />
            <span className="hint">{f(d.partner.bioHint, { n: about.length })}</span>
            {errs.about && <span className="error" role="alert">{errs.about}</span>}
          </div>
          <div className="stack gap-8">
            <span className="label">{s.acts}</span>
            <div className="row wrap gap-8">
              {ACTIVITIES.map((a) => {
                const on = acts.includes(a.key);
                return (
                  <button type="button" key={a.key} className="chip" aria-pressed={on} style={on ? { background: a.color, color: '#fff' } : { background: a.soft, color: a.ink }} onClick={() => { setActs(toggle(acts, a.key)); setErrs((e) => ({ ...e, acts: '' })); }}>
                    <Icon d={a.icon} size={16} /> {d.act[a.key].label}{a.privateVenue && <Icon name="lock" size={13} width={2.6} />}
                  </button>
                );
              })}
            </div>
            {errs.acts && <span className="error" role="alert">{errs.acts}</span>}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="stack gap-16">
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
            <div className="field">
              <label htmlFor="su-city">{s.cityLabel}</label>
              <input id="su-city" className="input" list="su-cities" maxLength={80} autoComplete="address-level2" placeholder={s.cityPh} value={city} onChange={(e) => { setCity(e.target.value); setErrs((x) => ({ ...x, city: '' })); }} />
              <datalist id="su-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="field"><label htmlFor="su-hood">{s.hoodLabel}</label><input id="su-hood" className="input" maxLength={80} value={hood} onChange={(e) => setHood(e.target.value)} /></div>
          </div>
          <div className="row wrap gap-8" style={{ alignItems: 'center' }}>
            <button type="button" className="btn btn-light btn-sm" onClick={pickGps}><Icon name="pin" size={16} /> {s.gps}</button>
            {hasLoc && <span className="badge badge-teal">{s.gpsOk}</span>}
          </div>
          <span className="hint">{s.gpsHint}</span>
          {errs.city && <span className="error" role="alert">{errs.city}</span>}
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
            <div className="field">
              <label htmlFor="su-price">{s.priceLabel}</label>
              <input id="su-price" type="number" inputMode="numeric" min={30} max={1000} className="input" value={price} onChange={(e) => { setPrice(+e.target.value); setErrs((x) => ({ ...x, price: '' })); }} />
              <span className="hint">{f(d.partner.feeHint, { p: money(price || 0), n: Math.round(CONFIG.serviceFeeRate * 100) })}</span>
              {errs.price && <span className="error" role="alert">{errs.price}</span>}
            </div>
            <div className="field">
              <label htmlFor="su-min">{s.minLabel}</label>
              <select id="su-min" className="select" value={minHours} onChange={(e) => setMinHours(+e.target.value)}>{[1, 2, 3, 4].map((h) => <option key={h} value={h}>{f(d.common.hoursShort, { n: h })}</option>)}</select>
            </div>
          </div>
          <div className="stack gap-8">
            <span className="label">{s.langsLabel}</span>
            <div className="row wrap gap-8">
              {LANGS.map((l) => <button type="button" key={l} className="chip" aria-pressed={langs.includes(l)} style={langs.includes(l) ? { background: 'var(--ink)', color: '#fff' } : undefined} onClick={() => setLangs(toggle(langs, l))}>{s.langNames[l as keyof typeof s.langNames]}</button>)}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack gap-12">
          <div className="stack gap-4"><strong>{s.whenTitle}</strong><span className="small muted">{s.whenHint}</span></div>
          <div className="row wrap gap-8">
            {PRESET_KEYS.map((k) => <button type="button" key={k} className="chip" aria-pressed={picked.includes(k)} style={picked.includes(k) ? { background: 'var(--accent)', color: '#fff' } : undefined} onClick={() => { setPicked(toggle(picked, k)); setErrs({}); }}>{s.presets[k]}</button>)}
          </div>
          <span className="small muted">{picked.length ? f(s.picked, { n: slotCount }) : ''}</span>
          {errs.when && <span className="error" role="alert">{errs.when}</span>}
        </div>
      )}

      <div className="row between gap-12">
        {step > 0 ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStep(step - 1)}>{s.back}</button> : <span />}
        <button type="button" className="btn btn-primary" disabled={busy || upBusy} onClick={() => void next()}>{busy ? s.saving : step === 2 ? s.finish : s.next}</button>
      </div>
    </div>
  );
}
