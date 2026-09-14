/**
 * Weather via Open-Meteo — free, keyless, and it takes no identifying data:
 * just a rounded latitude/longitude. Results are cached per day in local state
 * so the history used by the insights engine works offline.
 */
import { dateKey, todayKey } from './util.js';
import { getState, cacheWeather, mutate } from './store.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

/* WMO weather interpretation codes → a label, an emoji, and a coarse group
   that the correlation engine can count. */
const CODES = {
  0:  ['Clear sky', '☀️', 'clear'],
  1:  ['Mainly clear', '🌤️', 'clear'],
  2:  ['Partly cloudy', '⛅', 'cloudy'],
  3:  ['Overcast', '☁️', 'cloudy'],
  45: ['Fog', '🌫️', 'fog'],
  48: ['Freezing fog', '🌫️', 'fog'],
  51: ['Light drizzle', '🌦️', 'rain'],
  53: ['Drizzle', '🌦️', 'rain'],
  55: ['Heavy drizzle', '🌧️', 'rain'],
  56: ['Freezing drizzle', '🌧️', 'rain'],
  57: ['Freezing drizzle', '🌧️', 'rain'],
  61: ['Light rain', '🌦️', 'rain'],
  63: ['Rain', '🌧️', 'rain'],
  65: ['Heavy rain', '🌧️', 'rain'],
  66: ['Freezing rain', '🌧️', 'rain'],
  67: ['Freezing rain', '🌧️', 'rain'],
  71: ['Light snow', '🌨️', 'snow'],
  73: ['Snow', '🌨️', 'snow'],
  75: ['Heavy snow', '❄️', 'snow'],
  77: ['Snow grains', '🌨️', 'snow'],
  80: ['Light showers', '🌦️', 'rain'],
  81: ['Showers', '🌧️', 'rain'],
  82: ['Heavy showers', '⛈️', 'rain'],
  85: ['Snow showers', '🌨️', 'snow'],
  86: ['Snow showers', '❄️', 'snow'],
  95: ['Thunderstorm', '⛈️', 'storm'],
  96: ['Thunderstorm, hail', '⛈️', 'storm'],
  99: ['Thunderstorm, hail', '⛈️', 'storm'],
};
export function describeCode(code) {
  const [label, emoji, group] = CODES[code] || ['—', '🌡️', 'unknown'];
  return { label, emoji, group, code };
}
export const GROUP_LABEL = {
  clear: 'Clear / sunny', cloudy: 'Cloudy', fog: 'Fog', rain: 'Rain', snow: 'Snow',
  storm: 'Storms', unknown: 'Unknown',
};

export function unitsFor(state) {
  const imperial = state.settings.units === 'imperial';
  return {
    temperature_unit: imperial ? 'fahrenheit' : 'celsius',
    wind_speed_unit: imperial ? 'mph' : 'kmh',
    precipitation_unit: imperial ? 'inch' : 'mm',
    tempSuffix: imperial ? '°F' : '°C',
    rainSuffix: imperial ? 'in' : 'mm',
  };
}
export const fmtTemp = (v, state) => (v == null ? '—' : `${Math.round(v)}${unitsFor(state).tempSuffix}`);

/* ------------------------------ location ------------------------------- */

export function getCurrentPosition({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser has no location support.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        // Rounded to ~1km: precise enough for weather, vague enough to be polite.
        lat: Math.round(pos.coords.latitude * 100) / 100,
        lon: Math.round(pos.coords.longitude * 100) / 100,
        label: 'Current location',
      }),
      (err) => reject(new Error(
        err.code === 1 ? 'Location permission was denied.' : 'Could not get your location.'
      )),
      { timeout, maximumAge: 30 * 60 * 1000, enableHighAccuracy: false },
    );
  });
}

export async function searchPlaces(name) {
  const url = `${GEOCODE}?name=${encodeURIComponent(name)}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Place search failed.');
  const json = await res.json();
  return (json.results || []).map((r) => ({
    lat: Math.round(r.latitude * 100) / 100,
    lon: Math.round(r.longitude * 100) / 100,
    label: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
  }));
}

/* -------------------------------- fetch -------------------------------- */

const DAILY_VARS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'apparent_temperature_max',
  'precipitation_sum', 'sunshine_duration', 'wind_speed_10m_max',
].join(',');
const CURRENT_VARS = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
  'precipitation', 'weather_code', 'wind_speed_10m', 'is_day',
].join(',');

/**
 * Pull the current conditions plus up to 92 days of history in one request,
 * and fold the daily rows into the local cache.
 */
export async function sync({ pastDays = 92, force = false } = {}) {
  const s = getState();
  const loc = s.settings.location;
  if (!s.settings.weatherEnabled || !loc) return null;
  const fresh = Date.now() - (s.meta.lastWeatherSync || 0) < 20 * 60 * 1000;
  if (fresh && !force) return s.weather[todayKey()] || null;

  const u = unitsFor(s);
  const url = `${FORECAST}?latitude=${loc.lat}&longitude=${loc.lon}`
    + `&current=${CURRENT_VARS}&daily=${DAILY_VARS}`
    + `&timezone=auto&past_days=${Math.min(92, pastDays)}&forecast_days=1`
    + `&temperature_unit=${u.temperature_unit}&wind_speed_unit=${u.wind_speed_unit}`
    + `&precipitation_unit=${u.precipitation_unit}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
  const json = await res.json();

  const daily = json.daily || {};
  const times = daily.time || [];
  mutate((st) => {
    for (let i = 0; i < times.length; i++) {
      const key = times[i];
      st.weather[key] = {
        code: daily.weather_code?.[i] ?? null,
        tmax: daily.temperature_2m_max?.[i] ?? null,
        tmin: daily.temperature_2m_min?.[i] ?? null,
        feelsMax: daily.apparent_temperature_max?.[i] ?? null,
        precip: daily.precipitation_sum?.[i] ?? null,
        sunshineHours: daily.sunshine_duration?.[i] != null
          ? Math.round((daily.sunshine_duration[i] / 3600) * 10) / 10 : null,
        windMax: daily.wind_speed_10m_max?.[i] ?? null,
        units: s.settings.units,
      };
    }
    if (json.current) {
      st.weather[dateKey()] = {
        ...(st.weather[dateKey()] || {}),
        now: {
          temp: json.current.temperature_2m,
          feels: json.current.apparent_temperature,
          humidity: json.current.relative_humidity_2m,
          precip: json.current.precipitation,
          code: json.current.weather_code,
          wind: json.current.wind_speed_10m,
          isDay: json.current.is_day === 1,
          at: new Date().toISOString(),
        },
      };
    }
    st.meta.lastWeatherSync = Date.now();
  });
  return getState().weather[todayKey()] || null;
}

/** Snapshot to attach to a journal entry or a slip record. */
export function snapshotFor(dateKeyStr = todayKey()) {
  const w = getState().weather[dateKeyStr];
  if (!w) return null;
  const code = w.now?.code ?? w.code;
  return code == null ? null : { code, tmax: w.tmax, tmin: w.tmin, precip: w.precip, group: describeCode(code).group };
}

export { cacheWeather };
