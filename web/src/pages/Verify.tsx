import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { PageTitle, useTitle } from '../components/ui';
import { useStore } from '../lib/store';
import { request } from '../lib/api';
import { useI18n } from '../i18n';

// As imagens vão para a API, que repassa ao provedor de verificação e não guarda os documentos.
// Para usar o SDK do provedor (Unico, idwall, CAF), troque o envio em finish().

function Upload({ id, icon, title, hint, file, onFile, capture }: {
  id: string; icon: IconName; title: string; hint: string; file: File | null; onFile: (f: File | null) => void; capture?: 'user' | 'environment';
}) {
  const { d } = useI18n();
  return (
    <label htmlFor={id} className="upload-box" style={file ? { borderColor: 'var(--teal)', borderStyle: 'solid', background: 'var(--teal-soft)' } : undefined}>
      <span className="icon-box" style={{ width: 52, height: 52, borderRadius: 16, background: file ? 'var(--teal)' : 'var(--soft)', color: file ? '#fff' : 'var(--ink)' }}>
        <Icon name={file ? 'check' : icon} size={24} />
      </span>
      <strong>{file ? d.verify.ready : title}</strong>
      <span className="small muted">{file ? file.name : hint}</span>
      <input id={id} type="file" accept="image/*" capture={capture} className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </label>
  );
}

export default function Verify() {
  const { d, f } = useI18n();
  useTitle(d.verify.title);
  const { user, refreshUser, toast, fail } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(user?.verification === 'verificado' || user?.verification === 'em_analise' ? 3 : 0);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const next = params.get('next') || (user?.role === 'parceiro' ? '/painel' : '/explorar');

  const finish = async () => {
    if (!front || !back || !selfie) return;
    setChecking(true);
    try {
      const form = new FormData();
      form.append('front', front); form.append('back', back); form.append('selfie', selfie);
      const r = await request<{ status: string }>('POST', '/verification', form);
      await refreshUser();
      setStep(3);
      if (r.status === 'verified') toast(d.verify.toast);
    } catch (e) {
      fail(e);
    } finally {
      setChecking(false);
    }
  };
  const inReview = user?.verification === 'em_analise';

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <PageTitle title={d.verify.title} sub={d.verify.sub} />
      <div className="progress" aria-label={f(d.verify.step, { n: Math.min(step + 1, 3) })} style={{ marginBottom: 20 }}>
        {[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}
      </div>

      {step === 0 && (
        <div className="card card-pad stack gap-16">
          <h2 className="h-sm">{d.verify.s1Title}</h2>
          <p className="small muted">{d.verify.s1Text}</p>
          <div className="grid-2">
            <Upload id="frente" icon="id" title={d.verify.front} hint={d.verify.tap} file={front} onFile={setFront} capture="environment" />
            <Upload id="verso" icon="id" title={d.verify.backSide} hint={d.verify.tap} file={back} onFile={setBack} capture="environment" />
          </div>
          <button className="btn btn-primary btn-sq btn-block" disabled={!front || !back} onClick={() => setStep(1)}>{d.common.continue}</button>
        </div>
      )}

      {step === 1 && (
        <div className="card card-pad stack gap-16">
          <h2 className="h-sm">{d.verify.s2Title}</h2>
          <p className="small muted">{d.verify.s2Text}</p>
          <Upload id="selfie" icon="camera" title={d.verify.selfie} hint={d.verify.selfieHint} file={selfie} onFile={setSelfie} capture="user" />
          <div className="row gap-8">
            <button className="btn btn-light btn-sq" onClick={() => setStep(0)}>{d.common.back}</button>
            <button className="btn btn-primary btn-sq grow" disabled={!selfie} onClick={() => setStep(2)}>{d.common.continue}</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card card-pad stack gap-16">
          <h2 className="h-sm">{d.verify.s3Title}</h2>
          <div className="stack gap-8 small">
            <span className="row gap-8"><Icon name="check" stroke="var(--teal)" size={18} /> {d.verify.docOk}</span>
            <span className="row gap-8"><Icon name="check" stroke="var(--teal)" size={18} /> {d.verify.selfieOk}</span>
          </div>
          <div className="notice notice-teal"><Icon name="lock" /> {d.verify.encrypted}</div>
          <div className="row gap-8">
            <button className="btn btn-light btn-sq" onClick={() => setStep(1)} disabled={checking}>{d.common.back}</button>
            <button className="btn btn-primary btn-sq grow" onClick={finish} disabled={checking} data-testid="verify-send">{checking ? d.verify.checking : d.verify.sendCta}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card card-pad stack gap-16" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="icon-box" style={{ width: 64, height: 64, borderRadius: 20, background: inReview ? 'var(--amber)' : 'var(--teal)', color: '#fff' }}><Icon name={inReview ? 'clock' : 'shield'} size={30} /></span>
          <h2 className="display h-md">{inReview ? d.live.inReviewTitle : f(d.verify.doneTitle, { name: user?.name ?? '' })}</h2>
          <p className="muted">{inReview ? d.live.inReviewText : d.verify.doneText}</p>
          <button className="btn btn-primary btn-sq btn-lg" onClick={() => nav(next)}>{d.common.continue}</button>
        </div>
      )}
    </div>
  );
}
