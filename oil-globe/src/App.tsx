import React, { useRef, useState, useEffect, useMemo } from "react";
import { Viewer, Scene, Globe, Entity, CylinderGraphics, LabelGraphics } from "resium";
import * as Cesium from "cesium";
import { Cartesian3, Color, Cartesian2, HorizontalOrigin, LabelStyle, NearFarScalar, Rectangle } from "cesium";

import wellData from "./data/wells.json";
import "cesium/Build/Cesium/Widgets/widgets.css";

const FT_TO_M = 0.3048;

export default function App() {
  const viewerRef = useRef<any>(null);
  const [selectedApi, setSelectedApi] = useState<string | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string>("All"); 
  const [show3D, setShow3D] = useState(true);

  const activeWell = useMemo(() => wellData.find(w => w.api === selectedApi), [selectedApi]);

  // --- DRAINAGE ANALYSIS ---
  const subsurfaceAlerts = useMemo(() => {
    if (!activeWell) return [];
    return wellData.filter(other => {
      if (other.api === activeWell.api) return false;
      const distance = Math.sqrt(Math.pow(activeWell.lon - other.lon, 2) + Math.pow(activeWell.lat - other.lat, 2));
      const neighborIsDeeper = (other.producing_depth_ft || 0) > activeWell.total_depth_ft;
      return distance < 0.008 && neighborIsDeeper; 
    });
  }, [activeWell]);

  // --- COUNTRY & SEARCH FILTER ---
  const filteredWells = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return wellData.filter(w => {
      const matchesSearch = w.name.toLowerCase().includes(q) || w.api.includes(q);
      
      let countryMatch = false;
      if (selectedCountry === "All") {
        countryMatch = true;
      } else if (selectedCountry === "USA") {
        countryMatch = w.country === "United States" || w.country === "USA";
      } else {
        countryMatch = w.country === selectedCountry;
      }

      return matchesSearch && countryMatch;
    });
  }, [searchTerm, selectedCountry]);

  useEffect(() => {
    if (viewerRef.current?.cesiumElement && activeWell) {
      viewerRef.current.cesiumElement.camera.flyTo({
        destination: Cartesian3.fromDegrees(activeWell.lon, activeWell.lat - 0.038, 12000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
        duration: 1.5,
      });
    }
  }, [selectedApi, activeWell]);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", backgroundColor: "#0d1117", color: "#c9d1d9", overflow: "hidden", fontFamily: "'Inter', sans-serif" }}>
      
      {/* SIDEBAR */}
      <aside style={{ width: "420px", background: "#161b22", borderRight: "1px solid #30363d", display: "flex", flexDirection: "column", zIndex: 100 }}>
        <header style={{ padding: "24px", background: "#010409", borderBottom: "1px solid #30363d" }}>
          <div style={{ color: '#58a6ff', fontSize: '11px', fontWeight: 'bold', marginBottom: '15px', letterSpacing: '1px' }}>
            GEOGENIE GLOBAL REGISTRY
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
            {["All", "USA", "Argentina", "Turkey"].map((country) => (
              <button
                key={country}
                onClick={() => setSelectedCountry(country)}
                style={{
                  padding: "6px 12px",
                  fontSize: "11px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  border: "1px solid #30363d",
                  backgroundColor: selectedCountry === country ? "#388bfd" : "#161b22",
                  color: selectedCountry === country ? "#fff" : "#c9d1d9",
                }}
              >
                {country}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#8b949e' }}>EXPLORATION</span>
            <div onClick={() => setShow3D(!show3D)} style={{ cursor: 'pointer', fontSize: '10px', color: show3D ? '#238636' : '#8b949e' }}>
                 ON/OFF: {show3D ? "ON" : "OFF"}
            </div>
          </div>

          <input 
            type="text" placeholder="Search Well or API..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%", padding: "12px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", color: "#fff", outline: 'none' }}
          />
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {!selectedApi ? (
            filteredWells.map(w => (
              <div key={w.api} onClick={() => setSelectedApi(w.api)} style={{ padding: "16px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px", marginBottom: "12px", cursor: "pointer" }}>
                <div style={{ fontWeight: "bold", color: '#f0f6fc' }}>{w.name}</div>
                <div style={{ fontSize: "12px", color: "#8b949e", marginTop: '4px' }}>API: {w.api}</div>
              </div>
            ))
          ) : (
            <div>
              <button onClick={() => {setSelectedApi(null); setActiveLayerId(null);}} style={{ background: "none", border: "none", color: "#58a6ff", cursor: "pointer", marginBottom: "15px", padding: 0 }}>← BACK TO LIST</button>
              <h2 style={{ margin: "0", fontSize: "20px", color: '#fff' }}>{activeWell?.name}</h2>
              <p style={{ fontSize: "12px", color: "#8b949e", marginBottom: "20px" }}>{activeWell?.region}, {activeWell?.country}</p>
              
              {subsurfaceAlerts.length > 0 && (
                <div style={{ background: "rgba(231, 76, 60, 0.15)", border: "1px solid #e74c3c", padding: "15px", borderRadius: "8px", marginBottom: "25px" }}>
                  <div style={{ color: "#ff7b72", fontWeight: "bold", fontSize: "12px", marginBottom: "8px" }}>⚠️ PRODUCTION OFFSET ALERT</div>
                  {subsurfaceAlerts.map(alert => (
                    <div key={alert.api} style={{ fontSize: "13px", lineHeight: "1.4" }}>
                      Neighbor <strong>{alert.name}</strong> is producing oil at <strong>{alert.producing_depth_ft?.toLocaleString()} ft</strong>. 
                      This is <span style={{color: '#ff7b72'}}>{(alert.producing_depth_ft || 0) - (activeWell?.total_depth_ft || 0)} ft deeper</span> than your well.
                    </div>
                  ))}
                </div>
              )}

              {activeWell?.layers.map(l => (
                <div key={l.id} onClick={() => setActiveLayerId(activeLayerId === l.id ? null : l.id)} style={{ padding: "14px", background: activeLayerId === l.id ? "#21262d" : "#0d1117", borderLeft: `5px solid ${l.color}`, borderRadius: "4px", marginBottom: "12px", cursor: "pointer", border: activeLayerId === l.id ? "1px solid #58a6ff" : "1px solid transparent" }}>
                  <div style={{ fontWeight: "bold", fontSize: "14px" }}>{l.owner}</div>
                  <div style={{ fontSize: "12px", color: "#8b949e" }}>{l.name}</div>
                  <div style={{ fontSize: "12px", color: "#58a6ff", marginTop: "8px", fontWeight: 'bold' }}>{l.top_ft.toLocaleString()} - {l.bot_ft.toLocaleString()} ft</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* GLOBE AREA */}
      <main style={{ flex: 1, position: "relative" }}>
        <Viewer ref={viewerRef} full timeline={false} animation={false} selectionIndicator={false} infoBox={false} terrainProvider={new Cesium.EllipsoidTerrainProvider()}>
          <Scene>
            <Globe 
              depthTestAgainstTerrain={true} 
              translucency={{ 
                enabled: true, 
                frontFaceAlpha: 0.5,
                backFaceAlpha: 0.5,
                rectangle: Rectangle.MAX_VALUE,
                frontFaceAlphaByDistance: new NearFarScalar(100.0, 0.4, 8000000.0, 1.0),
                backFaceAlphaByDistance: new NearFarScalar(100.0, 0.4, 8000000.0, 1.0)
              } as any} 
            />
          </Scene>

          {wellData.map((well) => {
            const isSelected = selectedApi === well.api;
            const baseAltitudeM = 0; 

            return (
              <React.Fragment key={well.api}>
                {/* ABSOLUTE PIN */}
                <Entity
                  position={Cartesian3.fromDegrees(well.lon, well.lat, baseAltitudeM)}
                  onClick={() => { 
                    setSelectedApi(isSelected ? null : well.api); 
                    setActiveLayerId(null); 
                  }}
                  point={{ pixelSize: isSelected ? 26 : 14, color: isSelected ? Color.LIME : Color.YELLOW, outlineWidth: 2, outlineColor: Color.BLACK }}
                />

                {/* ABSOLUTE UPWARD STACK */}
                {isSelected && show3D && well.layers.map((layer, index) => {
                  const thicknessM = (layer.bot_ft - layer.top_ft) * FT_TO_M;
                  const previousHeightSum = well.layers.slice(0, index).reduce((sum, l) => sum + (l.bot_ft - l.top_ft) * FT_TO_M, 0);
                  const centerAltitudeM = baseAltitudeM + previousHeightSum + (thicknessM / 2);
                  const isLayerActive = activeLayerId === layer.id;

                  return (
                    <Entity
                      key={layer.id}
                      position={Cartesian3.fromDegrees(well.lon, well.lat, centerAltitudeM)}
                      onClick={() => setActiveLayerId(activeLayerId === layer.id ? null : layer.id)}
                    >
                      <CylinderGraphics
                        length={thicknessM}
                        topRadius={450} bottomRadius={450}
                        material={Color.fromCssColorString(layer.color).withAlpha(isLayerActive ? 0.95 : 0.6)}
                        outline={true} outlineColor={isLayerActive ? Color.WHITE : Color.BLACK}
                      />
                      {isLayerActive && (
                        <LabelGraphics
                          /* THE FIX: Added Coordinates to the bottom of the label */
                          text={`OWNER: ${layer.owner}\nFORMATION: ${layer.name}\nINTERVAL: ${layer.top_ft.toLocaleString()} - ${layer.bot_ft.toLocaleString()} ft\nCOORDS: ${well.lat.toFixed(4)}°, ${well.lon.toFixed(4)}°`}
                          font="bold 13pt sans-serif"
                          style={LabelStyle.FILL_AND_OUTLINE}
                          pixelOffset={new Cartesian2(120, 0)} 
                          horizontalOrigin={HorizontalOrigin.LEFT}
                          showBackground={true}
                          backgroundColor={Color.fromCssColorString("#0d1117").withAlpha(0.95)}
                        />
                      )}
                    </Entity>
                  );
                })}
              </React.Fragment>
            );
          })}
        </Viewer>
      </main>
    </div>
  );
}