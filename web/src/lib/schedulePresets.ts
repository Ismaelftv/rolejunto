// Atalhos de agenda: preenchem a semana de uma vez. A API usa 0 = domingo … 6 = sábado.
export type PresetKey = 'evenings' | 'weekends' | 'weekdayNights' | 'allDay';
export type Slot = { weekday: number; start: string };

export const PRESET_KEYS: PresetKey[] = ['evenings', 'weekends', 'weekdayNights', 'allDay'];

const NIGHT = ['18:00', '19:00', '20:00', '21:00', '22:00'];
const DAY = ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
const ALL = [0, 1, 2, 3, 4, 5, 6];

const PRESETS: Record<PresetKey, Slot[]> = {
  evenings: ALL.flatMap((weekday) => NIGHT.map((start) => ({ weekday, start }))),
  weekends: [5, 6, 0].flatMap((weekday) => (weekday === 5 ? NIGHT : ['14:00', '16:00', ...NIGHT]).map((start) => ({ weekday, start }))),
  weekdayNights: [1, 2, 3, 4, 5].flatMap((weekday) => ['18:00', '19:00', '20:00', '21:00'].map((start) => ({ weekday, start }))),
  allDay: ALL.flatMap((weekday) => DAY.map((start) => ({ weekday, start }))),
};

/** Junta os atalhos escolhidos, sem horários repetidos. */
export function presetSlots(keys: PresetKey[]): Slot[] {
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const k of keys) for (const s of PRESETS[k]) { const id = `${s.weekday}-${s.start}`; if (!seen.has(id)) { seen.add(id); out.push(s); } }
  return out;
}
