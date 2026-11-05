export const metrics = {
  temperature: { label: 'Temperature', unit: '°C', series: [['Outdoor', 'sensor.ambient_weather_temperature'], ['Cabinet', 'sensor.ambient_weather_inside_temperature']], measurement: '°C' },
  humidity: { label: 'Humidity', unit: '%', series: [['Outdoor', 'sensor.ambient_weather_humidity'], ['Cabinet', 'sensor.ambient_weather_humidity_indoor']], measurement: '%' },
  wind: { label: 'Wind', unit: 'km/h', series: [['Speed', 'sensor.ambient_weather_wind_speed'], ['Gust', 'sensor.ambient_weather_wind_gust']], measurement: 'km/h' },
  direction: { label: 'Wind direction', unit: '°', series: [['Direction', 'sensor.ambient_weather_wind_direction']], measurement: '°', scatter: true },
  pressure: { label: 'Pressure', unit: 'hPa', series: [['Pressure', 'sensor.ambient_weather_relative_pressure']], measurement: 'hPa' },
  solar: { label: 'Solar irradiance', unit: 'W/m²', series: [['Irradiance', 'sensor.ambient_weather_irradiance']], measurement: 'W/m²' },
  uv: { label: 'UV index', unit: '', series: [['UV index', 'sensor.ambient_weather_uv_index']], measurement: 'Index' },
  rain: { label: 'Rain rate', unit: 'mm/h', series: [['Rain rate', 'sensor.ambient_weather_precipitation_intensity']], measurement: 'mm/h', bars: true },
  aqi: { label: 'Air quality', unit: 'US AQI', series: [['US AQI', 'sensor.u_s_air_quality_index']], measurement: 'sensor.u_s_air_quality_index' },
};
export const cameras = [
  { id: 'trees', entity: 'camera.tree_fluent', name: 'Mango & Lemon Trees' },
  { id: 'garden', entity: 'camera.camera2_fluent', name: 'Ghaf & Sidr Trees' },
];
export const extraEntities = [
  'sensor.ambient_weather_feels_like', 'sensor.ambient_weather_dew_point',
  'sensor.ambient_weather_wind_direction_average_10_minutes', 'sensor.ambient_weather_max_gust',
  'sensor.ambient_weather_illuminance', 'sensor.ambient_weather_daily_rain',
  'sensor.ambient_weather_event_rain', 'sensor.ambient_weather_weekly_rain',
  'sensor.ambient_weather_monthly_rain', 'sensor.u_s_air_pollution_level',
  'sensor.u_s_main_pollutant', 'weather.forecast_home', 'sun.sun',
  'sensor.sun_next_rising', 'sensor.sun_next_setting',
];
export const allowedEntities = new Set([...Object.values(metrics).flatMap(m => m.series.map(s => s[1])), ...extraEntities]);
