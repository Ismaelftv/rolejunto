import { Link } from 'react-router-dom';
import { useTitle } from '../components/ui';
import { CONFIG } from '../lib/config';
import { useI18n } from '../i18n';

type Block = { h?: string; p?: string; ul?: string[] };
type DocKey = 'safety' | 'guidelines' | 'terms' | 'privacy';

function Doc({ k }: { k: DocKey }) {
  const { d } = useI18n();
  const doc = d.legal[k];
  useTitle(doc.title);
  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="container prose">
        <h1 className="display h-lg">{doc.title}</h1>
        <p className="small muted">{d.legal.updated}</p>
        {CONFIG.companyName && k !== 'safety' && <p className="small muted">{CONFIG.companyName}{CONFIG.companyCnpj ? ` · CNPJ ${CONFIG.companyCnpj}` : ''}</p>}
        {(doc.blocks as Block[]).map((b, i) => (
          <div key={i} className="stack gap-8">
            {b.h && <h2>{b.h}</h2>}
            {b.p && <p>{b.p}</p>}
            {b.ul && <ul>{b.ul.map((li) => <li key={li}>{li}</li>)}</ul>}
          </div>
        ))}
        <p>{d.legal.contact}<a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a></p>
        {k === 'safety' && (
          <div className="row wrap gap-8">
            <Link to="/conta" className="btn btn-dark btn-sm">{d.account.contactTitle}</Link>
            <Link to="/diretrizes" className="btn btn-light btn-sm">{d.footer.guidelines}</Link>
          </div>
        )}
      </div>
    </section>
  );
}

export const Safety = () => <Doc k="safety" />;
export const Guidelines = () => <Doc k="guidelines" />;
export const Terms = () => <Doc k="terms" />;
export const Privacy = () => <Doc k="privacy" />;
