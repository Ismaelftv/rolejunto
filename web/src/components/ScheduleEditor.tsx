// Agenda do parceiro: horários exatos de início por dia da semana + folgas e férias.
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { del, get, post, put } from '../lib/api';
import { brDate, useStore } from '../lib/store';
import { useI18n } from '../i18n';

type Slot = { weekday: number; start: string };
interface Off { id: string; startDate: string; endDate: string; note: string }

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]; // colunas Seg…Dom → dia da semana da API (0 = domingo)
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const today = () => brDate(new Date().toISOString()).slice(0, 10);

export function ScheduleEditor({ initial, onSaved }: { initial: Slot[]; onSaved: () => void }) {
  const { d, f, hour, locale } = useI18n();
  const { toast, fail } = useStore();
  const [byDay, setByDay] = useState<Record<number, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const [offs, setOffs] = useState<Off[]>([]);
  const [range, setRange] = useState({ from: today(), to: today(), note: '' });
  const s = d.g.schedule;

  useEffect(() => {
    const m: Record<number, string[]> = {};
    for (const wd of WEEKDAYS) m[wd] = initial.filter((x) => x.weekday === wd).map((x) => x.start).sort();
    setByDay(m); setDirty(false);
  }, [initial]);

  const loadOff = useCallback(() => get<{ items: Off[] }>('/partner/time-off').then((r) => setOffs(r.items)), []);
  useEffect(() => { void loadOff().catch(() => {}); }, [loadOff]);

  const change = (wd: number, list: string[]) => { setByDay((m) => ({ ...m, [wd]: [...new Set(list)].sort() })); setDirty(true); };

  const save = async () => {
    const slots = WEEKDAYS.flatMap((wd) => (byDay[wd] ?? []).map((start) => ({ weekday: wd, start })));
    try { await put('/partner/availability', { slots }); setDirty(false); toast(d.partner.availSaved); onSaved(); } catch (e) { fail(e); }
  };

  const addOff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await post<{ conflicts: number }>('/partner/time-off', { startDate: range.from, endDate: range.to < range.from ? range.from : range.to, note: range.note.trim() });
      toast(r.conflicts ? f(s.offConflicts, { n: r.conflicts }) : s.offSaved, r.conflicts ? 'warn' : 'ok');
      setRange({ from: today(), to: today(), note: '' });
      await loadOff(); onSaved();
    } catch (ex) { fail(ex); }
  };
  const removeOff = async (id: string) => {
    try { await del(`/partner/time-off/${id}`); toast(s.offRemoved); await loadOff(); onSaved(); } catch (ex) { fail(ex); }
  };
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });

  return (
    <div className="stack gap-16">
      <div className="card card-pad stack gap-12">
        <div className="stack"><h2 className="h-sm">{s.title}</h2><span className="small muted">{s.text}</span></div>
        <div>
          {WEEKDAYS.map((wd, di) => {
            const list = byDay[wd] ?? [];
            const dayName = d.partner.days[di];
            const prev = WEEKDAYS[(di + 6) % 7];
            return (
              <div key={wd} className="sched-day" data-weekday={wd}>
                <span className="dname">{dayName}</span>
                <div className="sched-times">
                  {list.length === 0 && <span className="small muted" style={{ marginRight: 4 }}>{s.none}</span>}
                  {list.map((t) => (
                    <span key={t} className="time-chip">{hour(t)}
                      <button type="button" aria-label={f(s.removeAria, { t: hour(t) })} onClick={() => change(wd, list.filter((x) => x !== t))}><Icon name="x" size={14} width={2.6} /></button>
                    </span>
                  ))}
                  <label className="sched-add">
                    <span className="sr-only">{f(s.addAria, { day: dayName })}</span>
                    <select value="" onChange={(e) => { if (e.target.value) change(wd, [...list, e.target.value]); }} aria-label={f(s.addAria, { day: dayName })}>
                      <option value="">+ {s.add}</option>
                      {TIMES.filter((t) => !list.includes(t)).map((t) => <option key={t} value={t}>{hour(t)}</option>)}
                    </select>
                  </label>
                  {di > 0 && (byDay[prev] ?? []).length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => change(wd, [...list, ...(byDay[prev] ?? [])])}>{s.copyPrev}</button>}
                  {list.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => change(wd, [])}>{s.clear}</button>}
                </div>
              </div>
            );
          })}
        </div>
        <button className="btn btn-primary btn-sq" style={{ alignSelf: 'flex-start' }} disabled={!dirty} onClick={() => void save()}>{s.save}</button>
      </div>

      <div className="card card-pad stack gap-12">
        <div className="stack"><h2 className="h-sm">{s.offTitle}</h2><span className="small muted">{s.offText}</span></div>
        <form className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12, alignItems: 'end' }} onSubmit={addOff}>
          <div className="field"><label htmlFor="off-from">{s.from}</label><input id="off-from" type="date" className="input" min={today()} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value, to: range.to < e.target.value ? e.target.value : range.to })} required /></div>
          <div className="field"><label htmlFor="off-to">{s.to}</label><input id="off-to" type="date" className="input" min={range.from} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} required /></div>
          <div className="field"><label htmlFor="off-note">{s.note}</label><input id="off-note" className="input" maxLength={120} placeholder={s.notePh} value={range.note} onChange={(e) => setRange({ ...range, note: e.target.value })} /></div>
          <button className="btn btn-dark btn-sq"><Icon name="ban" size={18} /> {s.addOff}</button>
        </form>
        {offs.length === 0 ? <div className="tile small muted">{s.offEmpty}</div> : (
          <div className="stack gap-8">
            {offs.map((o) => (
              <div key={o.id} className="off-item">
                <span className="stack"><strong className="small">{o.startDate === o.endDate ? fmt(o.startDate) : `${fmt(o.startDate)} → ${fmt(o.endDate)}`}</strong>{o.note && <span className="xs muted">{o.note}</span>}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => void removeOff(o.id)}>{s.remove}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
