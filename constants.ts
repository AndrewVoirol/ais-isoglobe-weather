import { GlobeData, WeatherCondition } from "./types";

export const DEFAULT_GLOBE_DATA: GlobeData = {
  locationName: "Paris, France",
  timestamp: "",
  weather: {
    condition: WeatherCondition.Clear,
    temperature: 15,
    description: "Clear sky",
    windSpeed: 5,
    isDay: true,
    precipitationIntensity: 0
  },
  theme: {
    buildingColors: ["#e8e8e8", "#dcdcdc", "#f5f5f5"],
    groundColor: "#4a6fa5",
    skyColor: "#87CEEB",
    glassTint: "#ffffff"
  },
  layout: [
     // Simple default cross layout
     { x: 5, z: 5, height: 4, type: 'building' },
     { x: 6, z: 5, height: 5, type: 'building' },
     { x: 5, z: 6, height: 3, type: 'building' },
     { x: 6, z: 6, height: 6, type: 'building' },
     { x: 2, z: 2, height: 0, type: 'park' },
     { x: 9, z: 9, height: 0, type: 'water' },
  ]
};
