import { Link } from 'react-router-dom';
import { useTitle } from '../components/ui';
import { useI18n } from '../i18n';

export default function NotFound() {
  const { d } = useI18n();
  useTitle(d.notFound.doc);
  return (
    <section className="section">
      <div className="container stack gap-16" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="display" style={{ fontSize: 120, lineHeight: 1, color: 'var(--accent)' }}>404</span>
        <h1 className="display h-md">{d.notFound.title}</h1>
        <p className="muted">{d.notFound.text}</p>
        <Link to="/explorar" className="btn btn-primary">{d.notFound.cta}</Link>
      </div>
    </section>
  );
}
