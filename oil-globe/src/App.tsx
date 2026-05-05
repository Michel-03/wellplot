import { useRef, useState, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import SubsurfaceGlobe from "./components/SubsurfaceGlobe";
import wellData from "./data/wells.json";
import "cesium/Build/Cesium/Widgets/widgets.css";

export interface Layer {
  id: string;
  name: string;
  owner?: string;
  category?: string;
  method?: string;
  type?: string;
  date?: string;
  source?: string;
  grantor?: string;
  top_ft: number;
  bot_ft: number;
  color?: string;
}

export interface Well {
  api: string;
  name: string;
  lat: number;
  lon: number;
  elevation_ft?: number | null;
  total_depth_ft?: number | null;
  producing_depth_ft?: number | null;
  country?: string;
  region?: string;
  county?: string;
  basin?: string;
  enverus_perf?: any;
  layers?: Layer[];
  perforations?: Layer[];
  ownership?: Layer[];
  leases?: Layer[];
}

const FT_TO_M = 0.3048;

export default function App() {
  const viewerRef = useRef<any>(null);
  
  const [selectedApi, setSelectedApi] = useState<string | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCountry] = useState<string>("All"); 
  const [show3D, setShow3D] = useState(true);
  const [selectedTab, setSelectedTab] = useState("overview");

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [mapSelectionBounds, setMapSelectionBounds] = useState<any>(null);

  const activeWell = useMemo(() => {
    return (wellData as any[]).find((w) => w.api === selectedApi) as Well | undefined;
  }, [selectedApi]);

  const filteredWells = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return (wellData as any[]).filter((w) => {
      if (mapSelectionBounds) {
        const inBounds = w.lon >= mapSelectionBounds.west && w.lon <= mapSelectionBounds.east && 
                         w.lat >= mapSelectionBounds.south && w.lat <= mapSelectionBounds.north;
        if (!inBounds) return false;
      }
      
      const matchesSearch = w.name?.toLowerCase().includes(q) || w.api?.includes(q);
      const countryMatch = selectedCountry === "All" || 
                           (selectedCountry === "USA" ? (w.country === "United States" || w.country === "USA") : w.country === selectedCountry);
      
      return matchesSearch && countryMatch;
    }) as Well[];
  }, [searchTerm, selectedCountry, mapSelectionBounds]);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", backgroundColor: "#0d1117", color: "#c9d1d9", overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar 
        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
        show3D={show3D} setShow3D={setShow3D}
        selectedTab={selectedTab} setSelectedTab={setSelectedTab}
        filteredWells={filteredWells}
        selectedApi={selectedApi} setSelectedApi={setSelectedApi}
        activeWell={activeWell}
        activeLayerId={activeLayerId} setActiveLayerId={setActiveLayerId}
        isDrawingMode={isDrawingMode} setIsDrawingMode={setIsDrawingMode}
        mapSelectionBounds={mapSelectionBounds} setMapSelectionBounds={setMapSelectionBounds}
      />
      <SubsurfaceGlobe 
        viewerRef={viewerRef}
        filteredWells={filteredWells}
        selectedApi={selectedApi} setSelectedApi={setSelectedApi}
        activeLayerId={activeLayerId} setActiveLayerId={setActiveLayerId}
        show3D={show3D}
        selectedTab={selectedTab}
        activeWell={activeWell}
        FT_TO_M={FT_TO_M}
        isDrawingMode={isDrawingMode} setIsDrawingMode={setIsDrawingMode}
        mapSelectionBounds={mapSelectionBounds} setMapSelectionBounds={setMapSelectionBounds}
      />
    </div>
  );
}