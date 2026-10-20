import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageTitle, useTitle } from '../components/ui';
import { ACTIVITIES, type ActivityKey } from '../data/activities';
import { errorText, useStore } from '../lib/store';
import { del, post, request, type ApiUser } from '../lib/api';
import { useI18n } from '../i18n';

/** Reduz a foto para 512 px (JPEG) antes de enviar. */
function shrink(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const s = 512;
        const c = document.createElement('canvas');
        c.width = s; c.height = s;
        const ctx = c.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, s, s);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.85);
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  });
}

export default function EditProfile() {
  const { d } = useI18n();
  useTitle(d.edit.title);
  const { user, updateUser, setUser, toast, fail } = useStore();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fm, setFm] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', city: user?.city ?? '' });
  const [interests, setInterests] = useState<ActivityKey[]>(user?.interests ?? []);
  const avatar = user?.avatar;
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pw, setPw] = useState({ cur: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState('');
  if (!user) return null;

  const upload = async (file: File) => {
    try {
      const form = new FormData();
      form.append('file', await shrink(file), 'avatar.jpg');
      const r = await request<{ user: ApiUser }>('POST', '/me/avatar', form);
      setUser(r.user);
      toast(d.edit.saved);
    } catch (e) { fail(e); }
  };
  const removeAvatar = async () => {
    try { const r = await del<{ user: ApiUser }>('/me/avatar'); setUser(r.user); } catch (e) { fail(e); }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (fm.name.trim().length < 2) er.name = d.edit.errName;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fm.email)) er.email = d.edit.errEmail;
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const emailChanged = fm.email.trim().toLowerCase() !== user.email.toLowerCase();
      await updateUser({ name: fm.name.trim(), email: fm.email.trim(), phone: fm.phone.trim() || null, city: fm.city.trim() || null, interests });
      toast(d.edit.saved);
      if (emailChanged) nav(`/confirmar-email?next=${encodeURIComponent('/conta')}`);
    } catch (ex) { setErrs({ email: errorText(d, ex) }); } finally { setBusy(false); }
  };
  const changePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.cur) return setPwErr(d.live.errors.wrong_password);
    if (pw.next.length < 8) return setPwErr(d.edit.errPass);
    if (pw.next !== pw.confirm) return setPwErr(d.edit.errMatch);
    try {
      await post('/me/password', { current: pw.cur, next: pw.next });
      setPwErr(''); setPw({ cur: '', next: '', confirm: '' }); toast(d.edit.passSaved);
    } catch (ex) { setPwErr(errorText(d, ex)); }
  };

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <PageTitle title={d.edit.title} back="/conta" />
      <div className="stack gap-16" style={{ paddingBottom: 32 }}>
        <form className="card card-pad stack gap-16" onSubmit={save} noValidate>
          <div className="row gap-16 wrap">
            {avatar ? <img src={avatar} alt="" className="avatar-lg" /> : <span className="avatar-lg">{(fm.name || '?').charAt(0).toUpperCase()}</span>}
            <div className="stack gap-8" style={{ flex: '1 1 200px' }}>
              <strong>{d.edit.photo}</strong>
              <span className="xs muted">{d.edit.photoHint}</span>
              <div className="row gap-8">
                <button type="button" className="btn btn-light btn-sm" onClick={() => fileRef.current?.click()}><Icon name="camera" size={16} /> {d.edit.change}</button>
                {avatar && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void removeAvatar()}>{d.edit.remove}</button>}
              </div>
              <input ref={fileRef} id="avatar" type="file" accept="image/*" className="sr-only" aria-label={d.edit.change}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
            </div>
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
            <div className="field"><label htmlFor="en">{d.edit.name}</label><input id="en" className="input" autoComplete="given-name" value={fm.name} onChange={(e) => setFm({ ...fm, name: e.target.value })} />{errs.name && <span className="error">{errs.name}</span>}</div>
            <div className="field"><label htmlFor="ee">{d.edit.email}</label><input id="ee" type="email" className="input" autoComplete="email" value={fm.email} onChange={(e) => setFm({ ...fm, email: e.target.value })} />{errs.email && <span className="error">{errs.email}</span>}</div>
            <div className="field"><label htmlFor="ep">{d.edit.phone}</label><input id="ep" className="input" inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" value={fm.phone} onChange={(e) => setFm({ ...fm, phone: e.target.value })} /></div>
            <div className="field"><label htmlFor="ec">{d.edit.city}</label><input id="ec" className="input" autoComplete="address-level2" value={fm.city} onChange={(e) => setFm({ ...fm, city: e.target.value })} /></div>
          </div>
          <div className="stack gap-8">
            <span className="label">{d.edit.interests}</span>
            <span className="hint">{d.edit.interestsHint}</span>
            <div className="row wrap gap-8">
              {ACTIVITIES.map((a) => {
                const on = interests.includes(a.key);
                return (
                  <button type="button" key={a.key} className="chip" aria-pressed={on} style={on ? { background: a.color, color: '#fff' } : { background: a.soft, color: a.color }}
                    onClick={() => setInterests(on ? interests.filter((k) => k !== a.key) : [...interests, a.key])}>
                    <Icon d={a.icon} size={16} /> {d.act[a.key].label}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="btn btn-primary btn-sq" style={{ alignSelf: 'flex-start' }} disabled={busy}>{d.edit.save}</button>
        </form>

        <form className="card card-pad stack gap-12" onSubmit={changePass} noValidate>
          <h2 className="h-sm">{d.edit.passTitle}</h2>
          <div className="field"><label htmlFor="pc">{d.edit.current}</label><input id="pc" type="password" autoComplete="current-password" className="input" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></div>
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
            <div className="field"><label htmlFor="pn">{d.edit.newPass}</label><input id="pn" type="password" autoComplete="new-password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
            <div className="field"><label htmlFor="pc2">{d.edit.confirm}</label><input id="pc2" type="password" autoComplete="new-password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div>
          </div>
          {pwErr && <span className="error" role="alert">{pwErr}</span>}
          <button className="btn btn-dark btn-sq" style={{ alignSelf: 'flex-start' }}>{d.edit.passSave}</button>
        </form>
      </div>
    </div>
  );
}
