export interface Scene {
  sky: 'day' | 'night';
  weather: 'clear' | 'fog' | 'rain' | 'snow';
  intensity: 0 | 1 | 2 | 3;
  dim: boolean;
}

const FOG = [45, 48];
const RAIN: number[][] = [[51, 53, 56], [55, 57, 61, 63, 66, 80, 81, 95], [65, 67, 82, 96, 99]];
const SNOW: number[][] = [[71, 77], [73, 85], [75, 86]];
const OVERCAST = 3;

const level = (groups: number[][], code: number) =>
  (groups.findIndex((codes) => codes.includes(code)) + 1) as Scene['intensity'];

export function sceneFor(weather: { code: number; is_day: boolean } | null): Scene | null {
  if (!weather) return null;
  const { code } = weather;
  const rain = level(RAIN, code);
  const snow = level(SNOW, code);
  return {
    sky: weather.is_day ? 'day' : 'night',
    weather: FOG.includes(code) ? 'fog' : rain ? 'rain' : snow ? 'snow' : 'clear',
    intensity: rain || snow,
    dim: code >= OVERCAST,
  };
}
