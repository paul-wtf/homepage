import { test, expect } from '@playwright/test';
import { sceneFor } from '../../src/scripts/wallpaper/scene';

const at = (code: number, is_day = true) => sceneFor({ code, is_day });

test.describe('sceneFor', () => {
  test('no weather, no scene', () => {
    expect(sceneFor(null)).toBeNull();
  });

  test('sky follows is_day', () => {
    expect(at(0, true)).toEqual({ sky: 'day', weather: 'clear', intensity: 0, dim: false });
    expect(at(0, false)).toEqual({ sky: 'night', weather: 'clear', intensity: 0, dim: false });
  });

  test('clouds dim the sun or moon from overcast on', () => {
    expect(at(1)?.dim).toBe(false);
    expect(at(2)?.dim).toBe(false);
    expect(at(3)).toEqual({ sky: 'day', weather: 'clear', intensity: 0, dim: true });
  });

  test('fog', () => {
    for (const code of [45, 48]) expect(at(code)).toEqual({ sky: 'day', weather: 'fog', intensity: 0, dim: true });
  });

  test('rain in three strengths', () => {
    for (const code of [51, 53, 56]) expect(at(code), String(code)).toMatchObject({ weather: 'rain', intensity: 1 });
    for (const code of [55, 57, 61, 63, 66, 80, 81, 95]) {
      expect(at(code), String(code)).toMatchObject({ weather: 'rain', intensity: 2 });
    }
    for (const code of [65, 67, 82, 96, 99]) expect(at(code), String(code)).toMatchObject({ weather: 'rain', intensity: 3 });
  });

  test('snow in three strengths', () => {
    for (const code of [71, 77]) expect(at(code), String(code)).toMatchObject({ weather: 'snow', intensity: 1 });
    for (const code of [73, 85]) expect(at(code), String(code)).toMatchObject({ weather: 'snow', intensity: 2 });
    for (const code of [75, 86]) expect(at(code), String(code)).toMatchObject({ weather: 'snow', intensity: 3 });
  });

  test('an unknown code is clear weather', () => {
    expect(at(42, false)).toEqual({ sky: 'night', weather: 'clear', intensity: 0, dim: true });
  });
});
