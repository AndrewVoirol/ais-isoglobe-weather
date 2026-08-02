export enum WeatherCondition {
  Clear = 'Clear',
  Clouds = 'Clouds',
  Rain = 'Rain',
  Snow = 'Snow',
  Thunderstorm = 'Thunderstorm',
  Drizzle = 'Drizzle',
  Mist = 'Mist'
}

export interface SceneTheme {
  buildingColors: string[];
  groundColor: string;
  skyColor: string; // Used for fog/ambient light
  glassTint: string;
}

export interface GridCell {
  x: number;
  z: number;
  height: number;
  type: 'building' | 'park' | 'water' | 'road';
}

export interface WeatherParams {
  condition: WeatherCondition;
  temperature: number;
  description: string;
  windSpeed: number;
  isDay: boolean;
  precipitationIntensity: number; // 0 to 1
}

export interface GlobeData {
  locationName: string;
  weather: WeatherParams;
  layout: GridCell[];
  theme: SceneTheme;
  timestamp: string;
  sources?: { title: string; uri: string }[];
}