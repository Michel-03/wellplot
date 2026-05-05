import { useEffect } from "react";

export interface Layer { id: string; name: string; owner?: string; category?: string; method?: string; type?: string; date?: string; source?: string; grantor?: string; top_ft: number; bot_ft: number; color?: string; }
export interface Well { api: string; name: string; lat: number; lon: number; elevation_ft?: number | null; total_depth_ft?: number | null; producing_depth_ft?: number | null; country?: string; region?: string; county?: string; basin?: string; layers?: Layer[]; perforations?: Layer[]; ownership?: Layer[]; leases?: Layer[]; }

const DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "formations", label: "Formations" },
  { id: "perforations", label: "Perforations" },
  { id: "ownership", label: "Ownership" },
];

const formatFeet = (value: number | null | undefined) => value == null ? "-" : value.toLocaleString();
const OWNER_COLORS = ["#34D399", "#60A5FA", "#FBBF24", "#F97316", "#A78BFA", "#F472B6"];
const getOwnerColor = (index: number) => OWNER_COLORS[index % OWNER_COLORS.length];

interface SidebarProps {
  searchTerm: string; setSearchTerm: (val: string) => void;
  show3D: boolean; setShow3D: (val: boolean) => void;
  selectedTab: string; setSelectedTab: (val: string) => void;
  filteredWells: Well[];
  selectedApi: string | null; setSelectedApi: (val: string | null) => void;
  activeWell?: Well;
  activeLayerId: string | null; setActiveLayerId: (val: string | null) => void;
  isDrawingMode: boolean; setIsDrawingMode: (val: boolean) => void;
  mapSelectionBounds: any; setMapSelectionBounds: (val: any) => void;
}

export default function Sidebar({
  searchTerm, setSearchTerm, show3D, setShow3D, selectedTab, setSelectedTab, filteredWells, selectedApi, setSelectedApi,
  activeWell, activeLayerId, setActiveLayerId, isDrawingMode, setIsDrawingMode, mapSelectionBounds, setMapSelectionBounds
}: SidebarProps) {

  useEffect(() => {
    if (activeWell && !selectedTab) {
      setSelectedTab("overview");
    }
  }, [activeWell?.api, setSelectedTab, selectedTab]);

  const renderOverview = () => (
    <div style={{ display: "grid", gap: "20px" }}>
      <div style={{ padding: "16px", background: "#161b22", border: "1px solid #30363d", borderRadius: "8px" }}>
        <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#8b949e", marginBottom: "10px", fontWeight: 600 }}>Surface Location</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px", color: "#c9d1d9" }}>
          <div><span style={{ color: "#8b949e" }}>Lat:</span> {activeWell?.lat.toFixed(6)}</div>
          <div><span style={{ color: "#8b949e" }}>Lon:</span> {activeWell?.lon.toFixed(6)}</div>
          <div style={{ gridColumn: "span 2" }}><span style={{ color: "#8b949e" }}>Elevation:</span> {formatFeet(activeWell?.elevation_ft)} ft</div>
        </div>
      </div>

      <div style={{ padding: "16px", background: "#161b22", border: "1px solid #30363d", borderRadius: "8px" }}>
        <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#8b949e", marginBottom: "10px", fontWeight: 600 }}>Well Summary</div>
        <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8b949e" }}>Region</span> <span style={{ color: "#f0f6fc", fontWeight: 500 }}>{activeWell?.region || "-"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8b949e" }}>County</span> <span style={{ color: "#f0f6fc", fontWeight: 500 }}>{activeWell?.county || "-"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8b949e" }}>Basin</span> <span style={{ color: "#f0f6fc", fontWeight: 500 }}>{activeWell?.basin || "-"}</span></div>
          <div style={{ height: "1px", background: "#30363d", margin: "4px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8b949e" }}>Total Depth</span> <span style={{ color: "#58a6ff", fontWeight: 600 }}>{formatFeet(activeWell?.total_depth_ft)} ft</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8b949e" }}>Producing Depth</span> <span style={{ color: "#58a6ff", fontWeight: 600 }}>{formatFeet(activeWell?.producing_depth_ft)} ft</span></div>
        </div>
      </div>
    </div>
  );

  const renderLayerList = (layers: Layer[], type: "formation" | "perforation" | "ownership") => {
    if (!layers.length) return (
      <div style={{ padding: "20px", textAlign: "center", color: "#8b949e", fontSize: "13px", background: "#0d1117", border: "1px dashed #30363d", borderRadius: "8px" }}>
        No {type} records found for this well.
      </div>
    );

    const selectedLayer = layers.find((l: Layer, idx: number) => (l.id || `${type.substring(0,3)}-${idx}`) === activeLayerId);

    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {selectedLayer && (
          <div style={{ padding: "16px", background: "rgba(88, 166, 255, 0.1)", border: "1px solid #58a6ff", borderRadius: "8px", color: "#c9d1d9" }}>
            <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#58a6ff", fontWeight: 700, marginBottom: "4px" }}>Selected Layer</div>
            <div style={{ fontWeight: 700, color: "#f0f6fc", fontSize: "15px", marginBottom: "8px" }}>{selectedLayer.name}</div>
            <div style={{ display: "flex", gap: "15px", fontSize: "13px" }}>
              <div><span style={{ color: "#8b949e" }}>Top:</span> {formatFeet(selectedLayer.top_ft)} ft</div>
              <div><span style={{ color: "#8b949e" }}>Bot:</span> {formatFeet(selectedLayer.bot_ft)} ft</div>
            </div>
          </div>
        )}
        
        {layers.map((layer: Layer, index: number) => {
          const layerId = layer.id || `${type.substring(0,3)}-${index}`;
          const isActive = activeLayerId === layerId;
          const color = type === "ownership" ? getOwnerColor(index) : (layer.color || (type === "perforation" ? "#ff1744" : "#58a6ff"));

          return (
            <div key={layerId} onClick={() => setActiveLayerId(isActive ? null : layerId)}
              style={{ padding: "16px", background: isActive ? "#21262d" : "#0d1117", border: isActive ? `1px solid ${color}` : "1px solid #30363d", borderRadius: "8px", cursor: "pointer", transition: "all 0.2s" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                <div>
                  <div style={{ fontWeight: "bold", color: "#f0f6fc", fontSize: "14px" }}>{layer.name}</div>
                  <div style={{ fontSize: "12px", color: "#8b949e", marginTop: "2px" }}>
                    {type === "formation" ? layer.owner : type === "perforation" ? `${layer.method} • ${layer.type}` : layer.category || "Owner"}
                  </div>
                </div>
                <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: color, flexShrink: 0, marginTop: "4px" }} />
              </div>
              <div style={{ marginTop: "12px", display: "grid", gap: "4px", fontSize: "12px", color: "#c9d1d9" }}>
                {layer.grantor && <div>Grantor: {layer.grantor}</div>}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Top: {formatFeet(layer.top_ft)} ft</span>
                  <span>Bot: {formatFeet(layer.bot_ft)} ft</span>
                </div>
                {isActive && (
                  <div style={{ marginTop: "8px", color: color, fontSize: "12px", fontWeight: 600, textAlign: "right" }}>
                    Currently Viewing on Map
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <aside style={{ width: "420px", background: "#010409", borderRight: "1px solid #30363d", display: "flex", flexDirection: "column", zIndex: 100, boxShadow: "4px 0 15px rgba(0,0,0,0.5)" }}>
      <header style={{ padding: "24px 24px 16px 24px", background: "#161b22", borderBottom: "1px solid #30363d" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: "center", marginBottom: '16px' }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "8px", height: "8px", background: "#238636", borderRadius: "50%" }}></div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#c9d1d9', letterSpacing: "0.05em" }}>SUBSURFACE EXPLORER</span>
          </div>
          <button onClick={() => setShow3D(!show3D)} style={{ background: "transparent", border: "1px solid #30363d", borderRadius: "4px", padding: "4px 8px", cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: show3D ? '#238636' : '#8b949e' }}>
            3D: {show3D ? "ON" : "OFF"}
          </button>
        </div>

        <input type="text" placeholder="Search wells by name or API..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
          style={{ width: "100%", padding: "12px 14px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", color: "#fff", marginBottom: '12px', fontSize: "13px", boxSizing: "border-box" }} />
        
        <div style={{ display: "flex", gap: "8px" }}>
          {!isDrawingMode && !mapSelectionBounds && (
            <button onClick={() => { setIsDrawingMode(true); setSelectedApi(null); }} 
              style={{ flex: 1, padding: '10px', background: '#238636', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: "12px", transition: "0.2s" }}>SELECT AREA</button>
          )}
          {isDrawingMode && (
            <div style={{ display: "flex", gap: "8px", flex: 1 }}>
              <div style={{ flex: 1, padding: '10px', background: '#d29922', color: '#000', borderRadius: '6px', textAlign: 'center', fontWeight: 700, fontSize: "12px", animation: "pulse 2s infinite" }}>CLICK & DRAG MAP</div>
              <button onClick={() => setIsDrawingMode(false)} style={{ padding: '10px 16px', background: '#30363d', color: '#c9d1d9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: "12px" }}>CANCEL</button>
            </div>
          )}
          {mapSelectionBounds && !isDrawingMode && (
            <button onClick={() => setMapSelectionBounds(null)} 
              style={{ flex: 1, padding: '10px', background: '#da3633', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: "12px" }}>CLEAR AREA ({filteredWells.length} Wells)</button>
          )}
        </div>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px", background: "#0d1117" }}>
        {!selectedApi ? (
          <div>
            <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "16px", fontWeight: 600 }}>{filteredWells.length} WELLS FOUND</div>
            {filteredWells.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#8b949e" }}>No wells match your search criteria.</div>
            ) : (
                filteredWells.map((w: Well) => (
                <div key={w.api} onClick={() => setSelectedApi(w.api)} 
                    style={{ padding: "16px", background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", marginBottom: "10px", cursor: "pointer" }}>
                    <div style={{ fontWeight: 600, color: '#f0f6fc', fontSize: "14px" }}>{w.name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                        <span style={{ fontSize: "12px", color: "#8b949e" }}>API: {w.api}</span>
                        <span style={{ fontSize: "12px", color: "#58a6ff" }}>{w.county || "Unknown"} Co.</span>
                    </div>
                </div>
                ))
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: "20px" }}>
            <button onClick={() => { setSelectedApi(null); setActiveLayerId(null); }} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontWeight: 600, padding: 0, textAlign: "left", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "16px" }}>←</span> BACK TO RESULTS
            </button>

            <div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#f0f6fc", lineHeight: 1.2 }}>{activeWell?.name}</div>
              <div style={{ fontSize: "13px", color: "#8b949e", marginTop: "4px" }}>API: {activeWell?.api}</div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", borderBottom: "1px solid #30363d", paddingBottom: "16px" }}>
              {DETAIL_TABS.map((tab) => (
                <button key={tab.id} onClick={() => { setSelectedTab(tab.id); setActiveLayerId(null); }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "20px",
                    border: selectedTab === tab.id ? "1px solid #58a6ff" : "1px solid #30363d",
                    background: selectedTab === tab.id ? "rgba(88, 166, 255, 0.1)" : "#161b22",
                    color: selectedTab === tab.id ? "#58a6ff" : "#c9d1d9",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                    transition: "all 0.2s"
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {selectedTab === "overview" && renderOverview()}
              {selectedTab === "formations" && renderLayerList(activeWell?.layers || [], "formation")}
              {selectedTab === "perforations" && renderLayerList(activeWell?.perforations || [], "perforation")}
              {selectedTab === "ownership" && renderLayerList([...(activeWell?.ownership || []), ...(activeWell?.leases || [])], "ownership")}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}