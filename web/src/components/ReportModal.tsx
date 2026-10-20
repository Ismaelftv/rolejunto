import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './ui';
import { useStore } from '../lib/store';
import { post } from '../lib/api';

// Mesma ordem de d.report.reasons
const REASONS = ['sexual', 'abuse', 'fake', 'minor', 'off_platform_payment', 'other'] as const;
import { useI18n } from '../i18n';

export function ReportModal({ name, partnerId, onClose }: { name: string; partnerId: string; onClose: () => void }) {
  const { toast, fail, refreshBlocked } = useStore();
  const [busy, setBusy] = useState(false);
  const { d, f } = useI18n();
  const nav = useNavigate();
  const [reason, setReason] = useState(-1);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);

  const submit = async () => {
    setBusy(true);
    try {
      await post('/reports', { targetId: partnerId, reason: REASONS[reason] ?? 'other', details: details.trim(), block: alsoBlock });
      toast(d.report.sent);
      onClose();
      if (alsoBlock) { void refreshBlocked().catch(() => {}); nav('/explorar'); }
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Modal title={f(d.report.title, { name })} onClose={onClose}>
      <p className="muted small">{d.report.anon}</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack gap-8">
        <legend className="label" style={{ marginBottom: 8 }}>{d.report.what}</legend>
        {d.report.reasons.map((r, i) => (
          <label key={r} className={`radio-card ${reason === i ? 'on' : ''}`}>
            <input type="radio" name="reason" checked={reason === i} onChange={() => setReason(i)} />
            <span className="small bold">{r}</span>
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="rep-det">{d.report.details}</label>
        <textarea id="rep-det" className="textarea" value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
      <label className="check"><input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} /> {f(d.report.alsoBlock, { name })}</label>
      <button className="btn btn-danger btn-sq btn-block" disabled={reason < 0 || busy} onClick={submit}>{d.report.submit}</button>
    </Modal>
  );
}
