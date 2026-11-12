const SYNODIC_DAYS = 29.530588853;
const DAY_MS = 86_400_000;
// The new moon of 2000-01-06 18:14 UTC, from which mean lunations are counted.
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/** 0 is new moon, 0.25 first quarter, 0.5 full moon, 0.75 last quarter. */
export function moonPhase(date: Date): number {
  const cycles = (date.getTime() - NEW_MOON) / (SYNODIC_DAYS * DAY_MS);
  return cycles - Math.floor(cycles);
}

export function illumination(phase: number): number {
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

/** Outline of the lit part as seen from the northern hemisphere. */
export function moonPath(phase: number, cx: number, cy: number, r: number): string {
  const waxing = phase < 0.5;
  const k = Math.cos(2 * Math.PI * phase);
  const crescent = k > 0;
  const limb = waxing ? 1 : 0;
  const terminator = waxing === crescent ? 0 : 1;
  const rx = (Math.abs(k) * r).toFixed(2);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${limb} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${terminator} ${cx} ${cy - r} Z`;
}
