import { GoogleGenAI, Type } from "@google/genai";
import { GlobeData, WeatherCondition } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to determine condition enum from text
const parseCondition = (text: string): WeatherCondition => {
  const t = text.toLowerCase();
  if (t.includes('snow') || t.includes('blizzard')) return WeatherCondition.Snow;
  if (t.includes('rain') || t.includes('drizzle') || t.includes('shower')) return WeatherCondition.Rain;
  if (t.includes('thunder') || t.includes('storm')) return WeatherCondition.Thunderstorm;
  if (t.includes('cloud') || t.includes('overcast')) return WeatherCondition.Clouds;
  if (t.includes('fog') || t.includes('mist') || t.includes('haze')) return WeatherCondition.Mist;
  return WeatherCondition.Clear;
};

export const fetchGlobeData = async (location: string): Promise<GlobeData> => {
  try {
    // Step 1: Get Real-time Weather via Google Search Grounding
    // We use a separate call because we can't force JSON easily with Grounding enabled in one go reliably.
    const searchModel = "gemini-2.5-flash";
    const searchResponse = await ai.models.generateContent({
      model: searchModel,
      contents: `What is the current weather in ${location}? Include temperature (Celsius), specific condition (sunny, rainy, snowy, etc), wind speed (km/h), and time of day (day/night). Be concise.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const weatherReport = searchResponse.text;
    console.log("Weather Report:", weatherReport);
    
    // Extract grounding chunks
    const sources: { title: string; uri: string }[] = [];
    if (searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      searchResponse.candidates[0].groundingMetadata.groundingChunks.forEach((chunk) => {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title ?? "",
            uri: chunk.web.uri ?? ""
          });
        }
      });
    }

    // Step 2: Generate Scene Data & Parse Weather into structured JSON
    // We feed the weather report back to Gemini to generate the creative scene.
    const genModel = "gemini-2.5-flash"; 
    
    // We use a structured prompt to ensure we get valid JSON for the scene layout
    const prompt = `
      Based on this weather report for ${location}: "${weatherReport}", create a JSON object for a 3D isometric snow globe scene.
      
      Requirements:
      1. Parse the weather data into the 'weather' field.
      2. Create a 12x12 grid layout representing a stylistic mini-map of the location.
         - 'height': 0 for ground, 1-6 for buildings.
         - 'type': 'building', 'park', 'water', 'road'.
      3. Set a color theme appropriate for the location's architecture and current time of day.
      
      The grid should be an array of objects with {x, z, height, type}. x and z from 0 to 11.
      Create a visually interesting layout with some height variation.
    `;

    const jsonResponse = await ai.models.generateContent({
      model: genModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            weather: {
              type: Type.OBJECT,
              properties: {
                temperature: { type: Type.NUMBER },
                conditionDescription: { type: Type.STRING },
                windSpeed: { type: Type.NUMBER },
                isDay: { type: Type.BOOLEAN },
              }
            },
            theme: {
              type: Type.OBJECT,
              properties: {
                buildingColors: { type: Type.ARRAY, items: { type: Type.STRING } },
                groundColor: { type: Type.STRING },
                skyColor: { type: Type.STRING },
                glassTint: { type: Type.STRING }
              }
            },
            layout: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.INTEGER },
                  z: { type: Type.INTEGER },
                  height: { type: Type.INTEGER },
                  type: { type: Type.STRING, enum: ['building', 'park', 'water', 'road'] }
                }
              }
            }
          }
        }
      }
    });

    let rawData;
    try {
      rawData = JSON.parse(jsonResponse.text);
    } catch (parseError) {
      console.error("Failed to parse Gemini response as JSON:", jsonResponse.text);
      throw new Error("Received invalid JSON from Gemini. Please try again.");
    }

    // Map raw data to our strong types
    const condition = parseCondition(rawData.weather.conditionDescription);
    
    // Calculate precipitation intensity based on condition
    let precipitationIntensity = 0;
    if (condition === WeatherCondition.Snow || condition === WeatherCondition.Rain) precipitationIntensity = 0.5;
    if (rawData.weather.conditionDescription.toLowerCase().includes('heavy')) precipitationIntensity = 1.0;
    if (rawData.weather.conditionDescription.toLowerCase().includes('light')) precipitationIntensity = 0.2;

    return {
      locationName: location,
      timestamp: new Date().toLocaleTimeString(),
      weather: {
        temperature: rawData.weather.temperature,
        description: rawData.weather.conditionDescription,
        windSpeed: rawData.weather.windSpeed,
        isDay: rawData.weather.isDay,
        condition,
        precipitationIntensity
      },
      theme: rawData.theme,
      layout: rawData.layout,
      sources
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};