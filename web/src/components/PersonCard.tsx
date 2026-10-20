import { Link } from 'react-router-dom';
import { Icon, VerifiedMark } from './Icon';
import { ActivityTag } from './ui';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';
import type { Partner } from '../lib/partners';
import { activityByKey, type ActivityKey } from '../data/activities';

export function PersonCard({ p, focus }: { p: Partner; focus?: ActivityKey | null }) {
  const { favorites, toggleFav, toast } = useStore();
  const { d, f, lang, money } = useI18n();
  const fav = favorites.includes(p.id);
  const main = activityByKey(focus && p.tags.includes(focus) ? focus : p.tags[0]);
  const tags = focus && p.tags.includes(focus) ? [focus, ...p.tags.filter((t) => t !== focus)] : p.tags;
  return (
    <article className="person-card">
      <Link to={`/parceiro/${p.id}${focus && p.tags.includes(focus) ? `?a=${focus}` : ''}`} className="pc-main">
        <div className="person-photo" style={{ background: p.hasPhotos ? p.photos[0] : main.color }}>
          {!p.hasPhotos && <span className="ini" aria-hidden>{p.initial}</span>}
          {p.online && <span className="badge badge-teal on" style={{ background: 'var(--white)' }}><span className="dot" /> {d.common.online}</span>}
        </div>
        <div className="stack gap-4 grow" style={{ paddingTop: 2 }}>
          <div className="row gap-8">
            <span className="bold" style={{ fontSize: 17 }}>{p.name}, {p.age}</span>
            <VerifiedMark label={d.common.verifiedAria} />
          </div>
          <span className="small muted bold">
            {f(d.common.approxKm, { n: p.distanceKm })} · {p.rating ? `★ ${p.rating.toFixed(1)} (${p.reviewsCount})` : d.common.newHere}
          </span>
          <span className="small">{p.bio[lang]}</span>
          <span className="bold" style={{ marginTop: 'auto' }}>
            {money(p.pricePerHour)}<span className="xs muted" style={{ fontWeight: 500 }}>{d.common.perHour}</span>
          </span>
        </div>
      </Link>
      <div className="row between gap-8" style={{ padding: '0 12px 12px' }}>
        <div className="row gap-4" style={{ overflow: 'hidden', flexWrap: 'wrap', maxHeight: 28 }}>
          {tags.slice(0, 3).map((t) => <ActivityTag key={t} k={t} />)}
        </div>
        <button
          className="icon-btn" style={{ width: 40, height: 40 }}
          aria-label={fav ? f(d.account.favRemove, { name: p.name }) : f(d.account.favAdd, { name: p.name })} aria-pressed={fav}
          onClick={() => { toggleFav(p.id); if (!fav) toast(f(d.g.fav.alert, { name: p.name })); }}
        >
          <Icon name="heart" fill={fav ? 'var(--accent)' : 'none'} stroke={fav ? 'var(--accent)' : 'var(--muted)'} />
        </button>
      </div>
    </article>
  );
}

export function PersonCardSkeleton() {
  return (
    <div className="person-card" aria-hidden>
      <div className="pc-main">
        <div className="skeleton" style={{ width: 96, height: 112, borderRadius: 16 }} />
        <div className="stack gap-8 grow" style={{ paddingTop: 4 }}>
          <div className="skeleton" style={{ height: 18, width: '60%' }} />
          <div className="skeleton" style={{ height: 14, width: '45%' }} />
          <div className="skeleton" style={{ height: 14, width: '85%' }} />
          <div className="skeleton" style={{ height: 16, width: '35%', marginTop: 'auto' }} />
        </div>
      </div>
      <div className="row gap-8" style={{ padding: '0 12px 12px' }}>
        <div className="skeleton" style={{ height: 24, width: 70 }} /><div className="skeleton" style={{ height: 24, width: 70 }} />
      </div>
    </div>
  );
}
