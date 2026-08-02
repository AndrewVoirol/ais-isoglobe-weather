import React, { useState, useEffect } from 'react';
import { SnowGlobe } from './components/SnowGlobe';
import { fetchGlobeData } from './services/geminiService';
import { GlobeData } from './types';
import { DEFAULT_GLOBE_DATA } from './constants';
import { Search, MapPin, RefreshCw, Wind, Cloud, Navigation, ExternalLink } from 'lucide-react';

export default function App() {
  const [data, setData] = useState<GlobeData | null>(null); // Start null to trigger initial load
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [shakeIntensity, setShakeIntensity] = useState(0);

  // Initial load
  useEffect(() => {
    handleSearch("Tokyo, Japan");
  }, []);

  // Decay shake intensity
  useEffect(() => {
    if (shakeIntensity > 0) {
      const interval = setInterval(() => {
        setShakeIntensity(prev => Math.max(0, prev - 0.05));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [shakeIntensity]);

  const handleSearch = async (term: string) => {
    if (!term.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const globeData = await fetchGlobeData(term);
      setData(globeData);
    } catch (err) {
      setError("Failed to fetch weather data. Please try again.");
      console.error(err);
      // If fails, maybe fall back to default but keep error
      if (!data) setData(DEFAULT_GLOBE_DATA);
    } finally {
      setLoading(false);
    }
  };

  const handleShake = () => {
    setShakeIntensity(1.0); // Max shake
  };

  const useCurrentLocation = () => {
    if ("geolocation" in navigator) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Reverse geocode via simple string passed to Gemini? 
          // Actually, we can just pass lat/long string to fetchGlobeData, Gemini understands coords.
          const coordString = `${latitude}, ${longitude}`;
          await handleSearch(coordString);
        } catch (e) {
          setError("Could not retrieve location info.");
          setLoading(false);
        }
      }, (err) => {
        setError("Location access denied.");
        setLoading(false);
      });
    }
  };

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden text-white font-sans">
      
      {/* 3D Scene Layer */}
      <div className="absolute inset-0 z-0">
        <SnowGlobe data={data} shakeIntensity={shakeIntensity} />
      </div>

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-8">
        
        {/* Header / Search */}
        <div className="pointer-events-auto flex flex-col md:flex-row gap-4 items-start md:items-center max-w-2xl">
          <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-1 pr-2 flex items-center border border-slate-700 shadow-xl">
             <div className="pl-3 text-slate-400">
               <Search size={20} />
             </div>
             <input 
               type="text" 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchTerm)}
               placeholder="Enter location..."
               className="bg-transparent border-none outline-none text-white px-3 py-2 w-48 md:w-64 placeholder-slate-400"
             />
             <button 
               onClick={() => handleSearch(searchTerm)}
               disabled={loading}
               className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
             >
               {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Go'}
             </button>
          </div>

          <button 
            onClick={useCurrentLocation}
            className="bg-slate-800/80 backdrop-blur-md p-3 rounded-2xl border border-slate-700 hover:bg-slate-700 text-slate-300 transition-colors shadow-xl"
            title="Use my location"
          >
            <Navigation size={20} />
          </button>
          
          {error && (
            <div className="bg-red-500/80 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-medium animate-pulse">
              {error}
            </div>
          )}
        </div>

        {/* Info Card */}
        {data && (
          <div className="pointer-events-auto self-end md:self-start mt-auto">
             <div className="bg-slate-900/60 backdrop-blur-lg border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm transform transition-all hover:scale-105">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-white">
                      {data.locationName.split(',')[0]}
                    </h1>
                    <div className="flex items-center text-slate-300 text-sm mt-1">
                      <MapPin size={14} className="mr-1" />
                      {data.locationName}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-4xl font-light">{Math.round(data.weather.temperature)}°</span>
                  </div>
                </div>

                <div className="space-y-3">
                   <div className="flex items-center justify-between text-slate-200 bg-white/5 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <Cloud size={18} className="text-blue-300" />
                        <span className="capitalize">{data.weather.description}</span>
                      </div>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/5 rounded-xl p-3 flex flex-col">
                        <span className="text-slate-400 text-xs uppercase tracking-wider mb-1">Wind</span>
                        <div className="flex items-center gap-2">
                           <Wind size={16} className="text-slate-300" />
                           <span className="font-semibold">{data.weather.windSpeed} km/h</span>
                        </div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 flex flex-col">
                        <span className="text-slate-400 text-xs uppercase tracking-wider mb-1">Precip</span>
                        <div className="flex items-center gap-2">
                           <Cloud size={16} className="text-slate-300" />
                           <span className="font-semibold">{(data.weather.precipitationIntensity * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                   </div>
                </div>

                <div className="mt-6">
                   <button 
                     onClick={handleShake}
                     className="w-full bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-white font-bold py-3 rounded-xl shadow-lg transform transition-transform active:scale-95 flex items-center justify-center gap-2"
                   >
                     <RefreshCw size={18} className={shakeIntensity > 0 ? "animate-spin" : ""} />
                     SHAKE GLOBE
                   </button>
                   <p className="text-center text-xs text-slate-500 mt-2">
                     Shake to stir up the weather!
                   </p>
                </div>

                {data.sources && data.sources.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs text-slate-400 mb-2">Sources:</p>
                    <div className="flex flex-wrap gap-2">
                      {data.sources.map((source, idx) => (
                        <a 
                          key={idx} 
                          href={source.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-300 hover:text-blue-200 flex items-center gap-1 truncate max-w-full"
                          title={source.title}
                        >
                          <ExternalLink size={10} />
                          <span className="truncate max-w-[150px]">{source.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}