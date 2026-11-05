export const metrics = {
  temperature: {
    label: "Temperature",
    unit: "°C",
    series: [
      ["Outdoor", "sensor.ambient_weather_temperature"],
      ["Cabinet", "sensor.ambient_weather_inside_temperature"],
    ],
    measurement: "°C",
  },
  humidity: {
    label: "Humidity",
    unit: "%",
    series: [
      ["Outdoor", "sensor.ambient_weather_humidity"],
      ["Cabinet", "sensor.ambient_weather_humidity_indoor"],
    ],
    measurement: "%",
  },
  wind: {
    label: "Wind",
    unit: "km/h",
    series: [
      ["Speed", "sensor.ambient_weather_wind_speed"],
      ["Gust", "sensor.ambient_weather_wind_gust"],
    ],
    measurement: "km/h",
  },
  direction: {
    label: "Wind direction",
    unit: "°",
    series: [["Direction", "sensor.ambient_weather_wind_direction"]],
    measurement: "°",
    scatter: true,
  },
  pressure: {
    label: "Pressure",
    unit: "hPa",
    series: [["Pressure", "sensor.ambient_weather_relative_pressure"]],
    measurement: "hPa",
  },
  solar: {
    label: "Solar irradiance",
    unit: "W/m²",
    series: [["Irradiance", "sensor.ambient_weather_irradiance"]],
    measurement: "W/m²",
  },
  uv: {
    label: "UV index",
    unit: "",
    series: [["UV index", "sensor.ambient_weather_uv_index"]],
    measurement: "Index",
  },
  rain: {
    label: "Rain rate",
    unit: "mm/h",
    series: [["Rain rate", "sensor.ambient_weather_precipitation_intensity"]],
    measurement: "mm/h",
    bars: true,
  },
  aqi: {
    label: "Air quality",
    unit: "US AQI",
    series: [["US AQI", "sensor.u_s_air_quality_index"]],
    measurement: "sensor.u_s_air_quality_index",
  },
};
export const cameras = [
  { id: "trees", entity: "camera.tree_fluent", name: "Mango & Lemon Trees" },
  { id: "garden", entity: "camera.camera2_fluent", name: "Ghaf & Sidr Trees" },
];
export const extraEntities = [
  "sensor.ambient_weather_feels_like",
  "sensor.ambient_weather_dew_point",
  "sensor.ambient_weather_wind_direction_average_10_minutes",
  "sensor.ambient_weather_max_gust",
  "sensor.ambient_weather_illuminance",
  "sensor.ambient_weather_daily_rain",
  "sensor.ambient_weather_event_rain",
  "sensor.ambient_weather_weekly_rain",
  "sensor.ambient_weather_monthly_rain",
  "sensor.u_s_air_pollution_level",
  "sensor.u_s_main_pollutant",
  "weather.forecast_home",
  "sun.sun",
  "sensor.sun_next_rising",
  "sensor.sun_next_setting",
];
export const allowedEntities = new Set([
  ...Object.values(metrics).flatMap((m) => m.series.map((s) => s[1])),
  ...extraEntities,
]);

export const sensorReadings = [
  [
    "Outdoor temperature",
    "ambient_weather_temperature",
    "°C",
    "temperature",
    "amber",
  ],
  [
    "Cabinet temperature",
    "ambient_weather_inside_temperature",
    "°C",
    "temperature",
    "coral",
  ],
  ["Feels like", "ambient_weather_feels_like", "°C", "temperature", "amber"],
  ["Dew point", "ambient_weather_dew_point", "°C", "temperature", "blue"],
  ["Outdoor humidity", "ambient_weather_humidity", "%", "humidity", "blue"],
  [
    "Cabinet humidity",
    "ambient_weather_humidity_indoor",
    "%",
    "humidity",
    "blue",
  ],
  ["Wind speed", "ambient_weather_wind_speed", "km/h", "wind", "teal"],
  ["Wind gust", "ambient_weather_wind_gust", "km/h", "wind", "teal"],
  ["Maximum gust today", "ambient_weather_max_gust", "km/h", "wind", "teal"],
  [
    "Wind direction",
    "ambient_weather_wind_direction",
    "°",
    "direction",
    "teal",
  ],
  [
    "Average direction · 10 min",
    "ambient_weather_wind_direction_average_10_minutes",
    "°",
    "direction",
    "teal",
  ],
  [
    "Barometric pressure",
    "ambient_weather_relative_pressure",
    "hPa",
    "pressure",
    "violet",
  ],
  ["UV index", "ambient_weather_uv_index", "", "uv", "amber"],
  ["Solar irradiance", "ambient_weather_irradiance", "W/m²", "solar", "amber"],
  ["Illuminance", "ambient_weather_illuminance", "lx", "solar", "amber"],
  [
    "Rain rate",
    "ambient_weather_precipitation_intensity",
    "mm/h",
    "rain",
    "blue",
  ],
  ["Daily rainfall", "ambient_weather_daily_rain", "mm", "rain", "blue"],
  ["Rain event", "ambient_weather_event_rain", "mm", "rain", "blue"],
  ["Weekly rainfall", "ambient_weather_weekly_rain", "mm", "rain", "blue"],
  ["Monthly rainfall", "ambient_weather_monthly_rain", "mm", "rain", "blue"],
  ["US air quality index", "u_s_air_quality_index", "US AQI", "aqi", "violet"],
  [
    "Air quality category",
    "u_s_air_pollution_level",
    "",
    "aqi",
    "violet",
    true,
  ],
  ["Main pollutant", "u_s_main_pollutant", "", "aqi", "violet", true],
].map(([label, key, unit, group, tone, categorical]) => {
  const entity = `sensor.${key}`;
  metrics[key] = {
    label,
    unit,
    series: [[label, entity]],
    measurement: key.startsWith("u_s_") ? entity : unit || entity,
    scatter: group === "direction",
    bars: group === "rain",
    categorical: !!categorical,
  };
  return { label, key, entity, unit, group, tone, categorical: !!categorical };
});
