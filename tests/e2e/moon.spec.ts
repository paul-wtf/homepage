import { test, expect } from '@playwright/test';
import { illumination, moonPath, moonPhase } from '../../src/scripts/wallpaper/moon';

const phaseAt = (iso: string) => moonPhase(new Date(iso));
const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

test.describe('moonPhase', () => {
  test('new moons, taken from solar eclipses', () => {
    for (const iso of ['2017-08-21T18:30:00Z', '2024-04-08T18:21:00Z', '2026-08-12T17:37:00Z']) {
      expect(distance(phaseAt(iso), 0), iso).toBeLessThan(0.03);
    }
  });

  test('full moons, taken from lunar eclipses', () => {
    for (const iso of ['2022-11-08T11:02:00Z', '2025-03-14T06:55:00Z', '2025-09-07T18:09:00Z']) {
      expect(distance(phaseAt(iso), 0.5), iso).toBeLessThan(0.03);
    }
  });

  test('quarters', () => {
    expect(distance(phaseAt('2024-04-15T19:13:00Z'), 0.25)).toBeLessThan(0.03);
    expect(distance(phaseAt('2024-05-01T11:27:00Z'), 0.75)).toBeLessThan(0.03);
  });

  test('stays within 0 and 1, also before the reference new moon', () => {
    for (const iso of ['1969-07-20T20:17:00Z', '2000-01-06T18:14:00Z', '2099-12-31T23:59:00Z']) {
      const p = phaseAt(iso);
      expect(p, iso).toBeGreaterThanOrEqual(0);
      expect(p, iso).toBeLessThan(1);
    }
    expect(phaseAt('2000-01-06T18:14:00Z')).toBeCloseTo(0, 5);
  });
});

test('illumination runs from dark to full and back', () => {
  expect(illumination(0)).toBeCloseTo(0, 5);
  expect(illumination(0.25)).toBeCloseTo(0.5, 5);
  expect(illumination(0.5)).toBeCloseTo(1, 5);
  expect(illumination(0.75)).toBeCloseTo(0.5, 5);
});

test.describe('moonPath', () => {
  const arcs = (d: string) => [...d.matchAll(/A ([\d.]+) ([\d.]+) 0 0 ([01]) ([\d.]+) ([\d.]+)/g)].map((m) => m.slice(1).map(Number));

  test('starts at the top and closes', () => {
    const d = moonPath(0.3, 100, 200, 50);
    expect(d.startsWith('M 100 150 ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(arcs(d)).toHaveLength(2);
  });

  test('a waxing moon is lit on the right, a waning one on the left', () => {
    const [waxing] = arcs(moonPath(0.2, 100, 200, 50));
    expect(waxing).toEqual([50, 50, 1, 100, 250]);
    const [waning] = arcs(moonPath(0.8, 100, 200, 50));
    expect(waning).toEqual([50, 50, 0, 100, 250]);
  });

  test('the terminator is a line at the quarters and the limb at full moon', () => {
    expect(arcs(moonPath(0.25, 100, 200, 50))[1][0]).toBeCloseTo(0, 5);
    expect(arcs(moonPath(0.75, 100, 200, 50))[1][0]).toBeCloseTo(0, 5);
    expect(arcs(moonPath(0.5, 100, 200, 50))[1][0]).toBeCloseTo(50, 5);
  });

  test('crescent and gibbous bend the terminator to opposite sides', () => {
    const sweep = (phase: number) => arcs(moonPath(phase, 100, 200, 50))[1][2];
    expect(sweep(0.1)).toBe(0);
    expect(sweep(0.4)).toBe(1);
    expect(sweep(0.6)).toBe(0);
    expect(sweep(0.9)).toBe(1);
  });
});
