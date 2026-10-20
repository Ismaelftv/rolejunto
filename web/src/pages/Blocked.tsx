import { Icon } from '../components/Icon';
import { PageTitle, useTitle } from '../components/ui';
import { useEffect } from 'react';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';

export default function Blocked() {
  const { d, f } = useI18n();
  useTitle(d.blocked.title);
  const { blocked, unblock, toast, fail, refreshBlocked } = useStore();
  useEffect(() => { void refreshBlocked().catch(() => {}); }, [refreshBlocked]);
  const people = blocked;

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <PageTitle title={d.blocked.title} sub={d.blocked.sub} back="/conta" />
      <div className="stack gap-8" style={{ paddingBottom: 32 }}>
        {people.length === 0 && (
          <div className="empty">
            <span className="icon-box" style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--soft)', color: 'var(--muted)' }}><Icon name="ban" size={26} /></span>
            <strong>{d.blocked.empty}</strong>
          </div>
        )}
        {people.map((p) => (
          <div key={p.id} className="card card-pad row between gap-12">
            <div className="row gap-12"><span className="avatar" style={{ background: 'var(--muted-2)' }}>{p.name.charAt(0).toUpperCase()}</span><strong>{p.name}</strong></div>
            <button className="btn btn-light btn-sm" onClick={() => { unblock(p.id).then(() => toast(f(d.blocked.unblocked, { name: p.name }))).catch(fail); }}>{d.blocked.unblock}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
