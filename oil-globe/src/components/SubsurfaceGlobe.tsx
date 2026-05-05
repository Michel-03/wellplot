import React, { useEffect, useState, Fragment } from "react";
import { Viewer, ScreenSpaceEventHandler, ScreenSpaceEvent, Entity, CylinderGraphics, LabelGraphics, PolylineGraphics, RectangleGraphics, BillboardGraphics, PointGraphics } from "resium";
import * as Cesium from "cesium";
import { Cartesian3, Color, Cartesian2, HorizontalOrigin, VerticalOrigin, Rectangle, PolylineDashMaterialProperty } from "cesium";
import type { Well } from "../App";

const createRigImage = (color: string) => {
  const svg = `<svg height="54" width="54" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="${color}" stroke="#000000" stroke-width="1" stroke-linejoin="round" d="M17.8,20l-1.6-10H16V8h2V6H14.1L13,2H11L9.9,6H6V8H8v2H6.2L4.6,20H2v2H22V20H17.8z M12,4.1l0.6,1.9h-1.2L12,4.1z M8.8,8h6.5l0.3,2H8.4L8.8,8z M12,12.5l2.6,4.5H9.4L12,12.5z M10.4,11h3.1l0.5,3.4l-1.9-3.3h-0.3l-1.9,3.3L10.4,11z M7.8,14.6L9.6,18H6.3L7.8,14.6z M14.4,18l1.8-3.4l1.6,3.4H14.4z"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const createDotImage = (color: string) => {
  const svg = `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="6" fill="${color}" opacity="0.95" /></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

export interface Layer { id: string; name: string; owner?: string; category?: string; method?: string; type?: string; date?: string; source?: string; grantor?: string; top_ft: number; bot_ft: number; color?: string; }

const getSafeColor = (colorStr?: string, defaultHex = "#ffffff") => {
  try {
    const c = Color.fromCssColorString(colorStr || defaultHex);
    return c instanceof Color ? c : Color.fromCssColorString(defaultHex);
  } catch {
    return Color.fromCssColorString(defaultHex);
  }
};

const calculateGaps = (layers: any[], maxDepth: number) => {
  if (!layers || layers.length === 0) return [{ top_ft: 0, bot_ft: maxDepth }];
  const sorted = [...layers].sort((a, b) => a.top_ft - b.top_ft);
  const gaps: {top_ft: number, bot_ft: number}[] = [];
  let currentDepth = 0;
  
  sorted.forEach(layer => {
    if (layer.top_ft > currentDepth + 1) { 
      gaps.push({ top_ft: currentDepth, bot_ft: layer.top_ft });
    }
    currentDepth = Math.max(currentDepth, layer.bot_ft);
  });
  
  if (currentDepth + 1 < maxDepth) {
    gaps.push({ top_ft: currentDepth, bot_ft: maxDepth });
  }
  return gaps;
};

// HIGH VISIBILITY PALETTES
const FORMATION_COLORS = ["#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#fb7185"]; 
const getFormationColor = (index: number) => FORMATION_COLORS[index % FORMATION_COLORS.length];

const OWNER_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444"]; 
const getOwnerColor = (index: number) => OWNER_COLORS[index % OWNER_COLORS.length];

const PERF_COLORS = ["#ffea00", "#ff003c", "#00e5ff"]; 
const getPerfColor = (index: number) => PERF_COLORS[index % PERF_COLORS.length];

const RADIUS_FORMATION = 40;  
const RADIUS_OWNERSHIP = 24;  
const RADIUS_PERF = 8;        

const SURFACE_OFFSET_M = 0;
const DEPTH_SCALE = 0.04;
const UNIFORM_RIG_COLOR = "#00E5FF"; 

interface GlobeProps {
  viewerRef: React.MutableRefObject<any>;
  filteredWells: Well[];
  selectedApi: string | null;
  setSelectedApi: React.Dispatch<React.SetStateAction<string | null>>;
  activeLayerId: string | null;
  setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  show3D: boolean;
  selectedTab: string;
  activeWell?: Well;
  FT_TO_M: number;
  isDrawingMode: boolean;
  setIsDrawingMode: React.Dispatch<React.SetStateAction<boolean>>;
  mapSelectionBounds: any;
  setMapSelectionBounds: React.Dispatch<React.SetStateAction<any>>;
}

export default function SubsurfaceGlobe({
  viewerRef, filteredWells, selectedApi, setSelectedApi, activeLayerId, setActiveLayerId, show3D,
  selectedTab, activeWell, FT_TO_M, isDrawingMode, setIsDrawingMode, mapSelectionBounds, setMapSelectionBounds
}: GlobeProps) {
  
  const [drawingStart, setDrawingStart] = useState<Cesium.Cartesian3 | null>(null);
  const [currentDragEnd, setCurrentDragEnd] = useState<Cesium.Cartesian3 | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ items: any[]; x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (viewerRef.current?.cesiumElement && activeWell) {
      viewerRef.current.cesiumElement.camera.flyTo({
        destination: Cartesian3.fromDegrees(activeWell.lon, activeWell.lat - 0.038, 12000), 
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 }, 
        duration: 1.5,
      });
    }
  }, [selectedApi, activeWell, viewerRef]);

  const flyToAngle = (pitchDegrees: number, offsetLon: number = 0, offsetLat: number = 0) => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || !activeWell) return;
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(activeWell.lon + offsetLon, activeWell.lat + offsetLat, 12000), 
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(pitchDegrees), roll: 0 }, 
        duration: 1.0,
      });
  };

  const handleLeftDown = (movement: any) => {
    if (!isDrawingMode) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
    if (cartesian) {
      setDrawingStart(cartesian);
      setCurrentDragEnd(cartesian);
      setIsDragging(true);
      viewer.scene.screenSpaceCameraController.enableInputs = false; 
    }
  };

  const handleMouseMove = (movement: any) => {
    if (!movement?.endPosition) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    if (isDrawingMode && drawingStart && isDragging) {
      const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        setCurrentDragEnd(cartesian);
      }
      return; 
    }

    const pickedObjects = viewer.scene.drillPick(movement.endPosition);
    let hoveredItems: any[] = [];
    let seenIds = new Set();
    
    for (let i = 0; i < pickedObjects.length; i++) {
        const entityId = pickedObjects[i].id?.id;
        if (typeof entityId === 'string' && entityId.includes("::")) {
            const [rawType, api, layerId] = entityId.split("::");
            const type = rawType.split("-")[0];
            const well = filteredWells.find(w => w.api === api);
            if (!well) continue;

            if (type === "formation") {
                if (!seenIds.has(`form-${layerId}`)) {
                    seenIds.add(`form-${layerId}`);
                    const info = well.layers?.find(l => String(l.id) === layerId);
                    if (info) hoveredItems.push({ name: info.name, top: info.top_ft, bot: info.bot_ft, category: "FORMATION" });
                }
            } else if (type === "perforation") {
                if (!seenIds.has(`perf-${layerId}`)) {
                    seenIds.add(`perf-${layerId}`);
                    const info = well.perforations?.find((p, idx) => String(p.id || `perf-${idx}`) === layerId);
                    if (info) hoveredItems.push({ name: info.name, top: info.top_ft, bot: info.bot_ft, category: info.type ? `PERF • ${info.type}` : "PERFORATION" });
                }
            } else if (type === "ownership") {
                if (!seenIds.has(`own-${layerId}`)) {
                    seenIds.add(`own-${layerId}`);
                    const info = [...(well.ownership || []), ...(well.leases || [])].find((o, idx) => String(o.id || `own-${idx}`) === layerId);
                    if (info) hoveredItems.push({ name: info.name, top: info.top_ft, bot: info.bot_ft, category: info.category ? `OWNER • ${info.category}` : "OWNERSHIP" });
                }
            } else if (type === "empty") {
                if (!seenIds.has(`empty-${layerId}`)) {
                    seenIds.add(`empty-${layerId}`);
                    const [topStr, botStr] = layerId.split("-");
                    hoveredItems.push({ name: "NO DATA", top: parseFloat(topStr), bot: parseFloat(botStr), isEmpty: true, category: `EMPTY SPACE (${selectedTab.toUpperCase()})` });
                }
            }
        }
    }

    if (hoveredItems.length > 0) {
        hoveredItems.sort((a, b) => {
            const getRank = (c: string) => c.includes("PERF") ? 1 : c.includes("OWNER") ? 2 : c.includes("FORM") ? 3 : 4;
            return getRank(a.category) - getRank(b.category);
        });

        setHoverInfo({
            items: hoveredItems,
            x: movement.endPosition.x,
            y: movement.endPosition.y
        });
    } else {
        setHoverInfo(null);
    }
  };

  const handleLeftUp = (movement: any) => {
    if (!isDrawingMode || !drawingStart) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const endCartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
    
    if (endCartesian && isDragging) {
      const startCart = Cesium.Cartographic.fromCartesian(drawingStart);
      const endCart = Cesium.Cartographic.fromCartesian(endCartesian);

      const west = Cesium.Math.toDegrees(Math.min(startCart.longitude, endCart.longitude));
      const east = Cesium.Math.toDegrees(Math.max(startCart.longitude, endCart.longitude));
      const south = Cesium.Math.toDegrees(Math.min(startCart.latitude, endCart.latitude));
      const north = Cesium.Math.toDegrees(Math.max(startCart.latitude, endCart.latitude));

      if (Math.abs(east - west) > 0.0001 && Math.abs(north - south) > 0.0001) {
        setMapSelectionBounds({ west, east, south, north });
        setIsDrawingMode(false);
      }
    }

    setDrawingStart(null);
    setCurrentDragEnd(null);
    setIsDragging(false);
    viewer.scene.screenSpaceCameraController.enableInputs = true; 
  };

  const handleLeftClick = (movement: any) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    if (isDrawingMode) {
        const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
        if (!cartesian) return;
        if (!drawingStart) {
            setDrawingStart(cartesian);
        } else {
            const startCart = Cesium.Cartographic.fromCartesian(drawingStart);
            const endCart = Cesium.Cartographic.fromCartesian(cartesian);
            setMapSelectionBounds({
                west: Cesium.Math.toDegrees(Math.min(startCart.longitude, endCart.longitude)),
                east: Cesium.Math.toDegrees(Math.max(startCart.longitude, endCart.longitude)),
                south: Cesium.Math.toDegrees(Math.min(startCart.latitude, endCart.latitude)),
                north: Cesium.Math.toDegrees(Math.max(startCart.latitude, endCart.latitude))
            });
            setDrawingStart(null); setCurrentDragEnd(null); setIsDrawingMode(false);
        }
        return;
    }

    const pickedObjects = viewer.scene.drillPick(movement.position);
    let foundLayerId: string | null = null;
    let foundApi: string | null = null;
    let clickedPinApi: string | null = null;

    for (let i = 0; i < pickedObjects.length; i++) {
        const entityId = pickedObjects[i].id?.id;
        if (typeof entityId === 'string') {
            if (entityId.includes("::")) {
                const [rawType, api, layerId] = entityId.split("::");
                const type = rawType.split("-")[0];

                if (type === "formation" || type === "perforation" || type === "ownership") {
                    foundLayerId = layerId; foundApi = api; break;
                } else if (type === "empty") {
                    foundLayerId = `empty-${layerId}`; foundApi = api; break;
                }
            } else if (entityId.startsWith("well-pin-")) {
                clickedPinApi = entityId.replace("well-pin-", "");
            }
        }
    }

    if (foundLayerId && foundApi) {
        if (selectedApi !== foundApi) setSelectedApi(foundApi);
        setActiveLayerId(prev => prev === foundLayerId ? null : foundLayerId);
    } else if (clickedPinApi) {
        setSelectedApi(prev => prev === clickedPinApi ? null : clickedPinApi);
        setActiveLayerId(null);
    } else {
        setSelectedApi(null);
        setActiveLayerId(null);
    }
  };

  const handleTickClick = (well: Well, ft: number) => {
    let foundId: string | null = null;
    if ((selectedTab === "formations" || selectedTab === "overview") && well.layers) {
        const found = well.layers.find((l) => l.top_ft === ft || l.bot_ft === ft);
        if (found) foundId = String(found.id);
    } else if (selectedTab === "perforations" && well.perforations) {
        const found = well.perforations.find((p) => p.top_ft === ft || p.bot_ft === ft);
        if (found) foundId = String(found.id || `perf-${well.perforations.indexOf(found)}`);
    } else if (selectedTab === "ownership" && (well.ownership || well.leases)) {
        const items = [...(well.ownership || []), ...(well.leases || [])];
        const found = items.find((o) => o.top_ft === ft || o.bot_ft === ft);
        if (found) foundId = String(found.id || `own-${items.indexOf(found)}`);
    }

    if (foundId) {
        setSelectedApi(well.api);
        setActiveLayerId(foundId);
    }
  };

  let selectedLayerInfo: any = null;
  if (activeWell && activeLayerId) {
    if (activeLayerId.startsWith('empty-')) {
        const [topStr, botStr] = activeLayerId.replace('empty-', '').split('-');
        selectedLayerInfo = { name: "No Data Available", owner: `Empty Segment`, top_ft: parseFloat(topStr), bot_ft: parseFloat(botStr) };
    } else if (activeLayerId === 'surface-gap') {
        const minTop = Math.min(...(activeWell.layers || []).map(l => l.top_ft));
        selectedLayerInfo = { name: "Surface Casing", owner: "Surface", top_ft: 0, bot_ft: minTop };
    } else {
        selectedLayerInfo = activeWell.layers?.find(l => String(l.id) === activeLayerId) ||
                            activeWell.perforations?.find((p, i) => String(p.id || `perf-${i}`) === activeLayerId) ||
                            [...(activeWell.ownership || []), ...(activeWell.leases || [])].find((o, i) => String(o.id || `own-${i}`) === activeLayerId);
    }
  }

  let dragRect: Cesium.Rectangle | null = null;
  if (isDrawingMode && drawingStart && currentDragEnd) {
    const startCart = Cesium.Cartographic.fromCartesian(drawingStart);
    const endCart = Cesium.Cartographic.fromCartesian(currentDragEnd);
    dragRect = Rectangle.fromDegrees(
      Cesium.Math.toDegrees(Math.min(startCart.longitude, endCart.longitude)),
      Cesium.Math.toDegrees(Math.min(startCart.latitude, endCart.latitude)),
      Cesium.Math.toDegrees(Math.max(startCart.longitude, endCart.longitude)),
      Cesium.Math.toDegrees(Math.max(startCart.latitude, endCart.latitude))
    );
  }

  return (
    <main style={{ flex: 1, position: "relative", cursor: isDrawingMode ? 'crosshair' : 'default' }}>
      
      {selectedApi && activeWell && !isDrawingMode && (
        <div style={{ position: "absolute", bottom: 20, right: 340, display: "flex", gap: "8px", zIndex: 40 }}>
          <button onClick={() => flyToAngle(-90, 0, 0)} style={{ padding: "8px 14px", background: "rgba(13,17,23,0.9)", border: "1px solid #30363d", borderRadius: "6px", color: "#c9d1d9", fontSize: "11px", fontWeight: "bold", cursor: "pointer", backdropFilter: "blur(4px)" }}>
            ⬇️ Top View
          </button>
          <button onClick={() => flyToAngle(-10, 0, -0.045)} style={{ padding: "8px 14px", background: "rgba(13,17,23,0.9)", border: "1px solid #30363d", borderRadius: "6px", color: "#c9d1d9", fontSize: "11px", fontWeight: "bold", cursor: "pointer", backdropFilter: "blur(4px)" }}>
            ⬅️ Side View
          </button>
          <button onClick={() => flyToAngle(-35, 0, -0.038)} style={{ padding: "8px 14px", background: "rgba(35,134,54,0.9)", border: "1px solid #2ea043", borderRadius: "6px", color: "#ffffff", fontSize: "11px", fontWeight: "bold", cursor: "pointer", backdropFilter: "blur(4px)" }}>
            🔄 Reset
          </button>
        </div>
      )}

      {hoverInfo && !isDrawingMode && (
        <div style={{
          position: 'absolute', left: hoverInfo.x + 15, top: hoverInfo.y - 15,
          background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(0,0,0,0.15)',
          padding: '14px 16px', borderRadius: '8px', color: '#333',
          pointerEvents: 'none', zIndex: 500, boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
          fontFamily: "Arial, sans-serif", minWidth: "250px"
        }}>
          {hoverInfo.items.slice(0, 5).map((item, idx) => {
            const isPerf = item.category.includes('PERF');
            const isOwner = item.category.includes('OWNER');
            const colorTheme = isPerf ? '#C62828' : isOwner ? '#1565C0' : '#2E7D32';
            const borderTheme = isPerf ? '#EF5350' : isOwner ? '#42A5F5' : '#4CAF50';
            const icon = isPerf ? '⬇️' : isOwner ? '⚖️' : '⛏️';

            return (
              <div key={idx} style={{ marginBottom: idx === Math.min(hoverInfo.items.length, 5) - 1 ? '0' : '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: colorTheme, marginBottom: '4px', borderBottom: `2px solid ${borderTheme}`, paddingBottom: '4px' }}>
                  {icon} {item.category}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: item.isEmpty ? '#888' : '#333', marginBottom: '4px' }}>{item.name}</div>
                <table style={{ fontSize: '10px', lineHeight: 1.7, borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                        <tr>
                            <td style={{ color: '#666', width: '90px', fontWeight: 600 }}>Top Depth</td>
                            <td style={{ fontWeight: 'bold' }}>{item.top.toLocaleString()} ft</td>
                        </tr>
                        <tr>
                            <td style={{ color: '#666', width: '90px', fontWeight: 600 }}>Base Depth</td>
                            <td style={{ fontWeight: 'bold' }}>{item.bot.toLocaleString()} ft</td>
                        </tr>
                    </tbody>
                </table>
              </div>
            );
          })}
          {hoverInfo.items.length > 5 && (
            <div style={{ fontSize: '11px', color: '#1565C0', marginTop: '10px', fontWeight: 'bold', textAlign: 'center' }}>
              + {hoverInfo.items.length - 5} MORE ENTITIES
            </div>
          )}
        </div>
      )}

      <Viewer ref={viewerRef} full timeline={false} animation={false} selectionIndicator={false} infoBox={false}>
        <ScreenSpaceEventHandler>
          <ScreenSpaceEvent action={handleLeftDown} type={Cesium.ScreenSpaceEventType.LEFT_DOWN} />
          <ScreenSpaceEvent action={handleMouseMove} type={Cesium.ScreenSpaceEventType.MOUSE_MOVE} />
          <ScreenSpaceEvent action={handleLeftUp} type={Cesium.ScreenSpaceEventType.LEFT_UP} />
          <ScreenSpaceEvent action={handleLeftClick} type={Cesium.ScreenSpaceEventType.LEFT_CLICK} />
        </ScreenSpaceEventHandler>

        {selectedLayerInfo && selectedLayerInfo.name !== "Surface Casing" && (
          <div style={{ position: 'absolute', top: 20, right: 20, width: 300, padding: 16, borderRadius: 12, background: 'rgba(13,17,23,0.92)', border: '1px solid #30363d', color: '#c9d1d9', zIndex: 30, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 800, color: '#8b949e', marginBottom: 10, textTransform: "uppercase" }}>Selected Layer Context</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: '#f0f6fc' }}>{selectedLayerInfo.name}</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{selectedLayerInfo.owner || selectedLayerInfo.category || selectedLayerInfo.method || "-"}</div>
            <div style={{ display: 'grid', gridTemplateColumns: "1fr 1fr", gap: "8px", borderTop: "1px solid #30363d", paddingTop: "12px" }}>
              <div><span style={{ fontSize: 11, color: '#8b949e', display: "block" }}>Top</span> <span style={{ fontSize: 13, color: '#58a6ff', fontWeight: 600 }}>{selectedLayerInfo.top_ft.toLocaleString()} ft</span></div>
              <div><span style={{ fontSize: 11, color: '#8b949e', display: "block" }}>Bottom</span> <span style={{ fontSize: 13, color: '#58a6ff', fontWeight: 600 }}>{selectedLayerInfo.bot_ft.toLocaleString()} ft</span></div>
              <div style={{ gridColumn: "span 2", marginTop: "4px" }}><span style={{ fontSize: 11, color: '#8b949e', display: "inline-block", marginRight: "8px" }}>Thickness:</span> <span style={{ fontSize: 13, color: '#f0f6fc', fontWeight: 600 }}>{Math.abs(selectedLayerInfo.bot_ft - selectedLayerInfo.top_ft).toLocaleString()} ft</span></div>
            </div>
          </div>
        )}

        {mapSelectionBounds && (
          <Entity>
            <RectangleGraphics coordinates={Rectangle.fromDegrees(mapSelectionBounds.west, mapSelectionBounds.south, mapSelectionBounds.east, mapSelectionBounds.north)} material={getSafeColor('#238636').withAlpha(0.15)} outline={true} outlineColor={getSafeColor('#238636')} />
          </Entity>
        )}

        {dragRect && (
          <Entity>
            <RectangleGraphics coordinates={dragRect} material={getSafeColor('#d29922').withAlpha(0.3)} outline={true} outlineColor={getSafeColor('#d29922')} />
          </Entity>
        )}

        {filteredWells.map((well: Well) => {
          const isSelected = selectedApi === well.api;
          const isFaded = selectedApi !== null && !isSelected;
          const pointAlpha = isFaded ? 0.85 : 1.0; 
          const labelOffsetLon = well.lon + 0.0015;

          const combinedOwnership = [...(well.ownership || []), ...(well.leases || [])];
          
          const shouldShowWrapper = isSelected && show3D;

          let wellMaxDepth = well.total_depth_ft || 0;
          if (!wellMaxDepth) {
              const allTops = [...(well.layers||[]), ...(well.perforations||[]), ...(well.ownership||[]), ...(well.leases||[])].map(l => l.bot_ft);
              wellMaxDepth = allTops.length ? Math.max(...allTops) : 15000;
          }

          const activeLayers = selectedTab === 'perforations' ? well.perforations : selectedTab === 'ownership' ? combinedOwnership : well.layers;
          const emptyGaps = calculateGaps(activeLayers || [], wellMaxDepth);

          const isFormationsTab = selectedTab === "formations" || selectedTab === "overview";
          const isPerforationsTab = selectedTab === "perforations";
          const isOwnershipTab = selectedTab === "ownership";

          let activeTickData: { ft: number, color: string }[] = [];
          if (show3D && isSelected) {
              if (isFormationsTab) {
                  well.layers?.forEach((l, idx) => {
                      const c = l.color || getFormationColor(idx);
                      activeTickData.push({ ft: l.top_ft, color: c });
                      activeTickData.push({ ft: l.bot_ft, color: c });
                  });
              } else if (isPerforationsTab) {
                  well.perforations?.forEach((p, idx) => {
                      const c = p.color || getPerfColor(idx);
                      activeTickData.push({ ft: p.top_ft, color: c });
                      activeTickData.push({ ft: p.bot_ft, color: c });
                  });
              } else if (isOwnershipTab) {
                  combinedOwnership.forEach((item, idx) => {
                      const c = getOwnerColor(idx);
                      activeTickData.push({ ft: item.top_ft, color: c });
                      activeTickData.push({ ft: item.bot_ft, color: c });
                  });
              }
          }
          
          const uniqueTicksMap = new Map<number, string>();
          activeTickData.forEach(t => { if (!uniqueTicksMap.has(t.ft)) uniqueTicksMap.set(t.ft, t.color); });
          const uniqueTickDepths = Array.from(uniqueTicksMap.keys()).sort((a, b) => a - b);
          const pinColorHex = well.layers?.[0]?.color || "#FFFF00";

          return (
            <Fragment key={well.api}>
              
              <Entity id={`well-pin-${well.api}`} position={Cartesian3.fromDegrees(well.lon, well.lat, 0)} name={well.name} description={well.api}>
                {!isSelected && (
                  <BillboardGraphics
                    image={createRigImage(UNIFORM_RIG_COLOR)}
                    verticalOrigin={VerticalOrigin.BOTTOM}
                    scale={0.8}
                    color={getSafeColor(UNIFORM_RIG_COLOR).withAlpha(pointAlpha)}
                  />
                )}
                {isSelected && (
                  <Fragment>
                    <PointGraphics pixelSize={16} color={getSafeColor("#FFFFFF")} outlineWidth={4} outlineColor={getSafeColor("#238636")} heightReference={Cesium.HeightReference.CLAMP_TO_GROUND} />
                    <BillboardGraphics image={createDotImage(pinColorHex)} verticalOrigin={VerticalOrigin.CENTER} scale={1.4} />
                    <LabelGraphics text={well.name} font="bold 13pt sans-serif" fillColor={getSafeColor("#ffffff")} outlineColor={getSafeColor("#000000")} outlineWidth={3} pixelOffset={new Cartesian2(0, -28)} horizontalOrigin={HorizontalOrigin.CENTER} verticalOrigin={VerticalOrigin.BOTTOM} disableDepthTestDistance={Number.POSITIVE_INFINITY} />
                  </Fragment>
                )}
              </Entity>

              {show3D && isSelected && emptyGaps.map((gap, idx) => {
                const topAltitudeM = SURFACE_OFFSET_M + gap.top_ft * FT_TO_M * DEPTH_SCALE;
                const bottomAltitudeM = SURFACE_OFFSET_M + gap.bot_ft * FT_TO_M * DEPTH_SCALE;
                const thicknessM = Math.abs(bottomAltitudeM - topAltitudeM);
                const centerAltitudeM = (topAltitudeM + bottomAltitudeM) / 2;
                const layerSelected = activeLayerId === `empty-${gap.top_ft}-${gap.bot_ft}`;
                const dynamicRadius = isPerforationsTab ? RADIUS_PERF : isOwnershipTab ? RADIUS_OWNERSHIP : RADIUS_FORMATION;

                return (
                  <Fragment key={`gap-${well.api}-${idx}`}>
                    <Entity id={`empty-cyl::${well.api}::${gap.top_ft}-${gap.bot_ft}`} position={Cartesian3.fromDegrees(well.lon, well.lat, centerAltitudeM)} onClick={() => { setSelectedApi(well.api); setActiveLayerId(layerSelected ? null : `empty-${gap.top_ft}-${gap.bot_ft}`); }}>
                      <CylinderGraphics
                        length={thicknessM}
                        topRadius={dynamicRadius}
                        bottomRadius={dynamicRadius}
                        material={getSafeColor("#4b5563").withAlpha(layerSelected ? 0.4 : 0.15)}
                      />
                    </Entity>
                  </Fragment>
                );
              })}

              {shouldShowWrapper && well.layers?.map((layer, idx) => {
                const topAltitudeM = SURFACE_OFFSET_M + layer.top_ft * FT_TO_M * DEPTH_SCALE;
                const bottomAltitudeM = SURFACE_OFFSET_M + layer.bot_ft * FT_TO_M * DEPTH_SCALE;
                const thicknessM = Math.abs(bottomAltitudeM - topAltitudeM);
                const centerAltitudeM = (topAltitudeM + bottomAltitudeM) / 2;
                const layerSelected = activeLayerId === String(layer.id);
                const hexCode = layer.color || getFormationColor(idx);

                return (
                  <Fragment key={`${well.api}-${layer.id}-form`}>
                    {isFormationsTab && (
                      <Entity id={`formation-poly::${well.api}::${layer.id}`}>
                        <PolylineGraphics positions={[Cartesian3.fromDegrees(well.lon, well.lat, topAltitudeM), Cartesian3.fromDegrees(well.lon, well.lat, bottomAltitudeM)]} width={5} material={getSafeColor(hexCode).withAlpha(1.0)} />
                      </Entity>
                    )}
                    <Entity id={`formation-cyl::${well.api}::${layer.id}`} position={Cartesian3.fromDegrees(well.lon, well.lat, centerAltitudeM)}>
                      <CylinderGraphics length={thicknessM} topRadius={RADIUS_FORMATION} bottomRadius={RADIUS_FORMATION} material={getSafeColor(hexCode).withAlpha(layerSelected && isFormationsTab ? 0.5 : 0.25)} />
                    </Entity>
                    {isFormationsTab && (
                       <Fragment>
                            <Entity position={Cartesian3.fromDegrees(well.lon, well.lat, topAltitudeM)}><BillboardGraphics image={createDotImage(hexCode)} verticalOrigin={VerticalOrigin.CENTER} scale={0.7} /></Entity>
                            <Entity position={Cartesian3.fromDegrees(well.lon, well.lat, bottomAltitudeM)}><BillboardGraphics image={createDotImage(hexCode)} verticalOrigin={VerticalOrigin.CENTER} scale={0.7} /></Entity>
                       </Fragment>
                    )}
                  </Fragment>
                );
              })}

              {shouldShowWrapper && combinedOwnership.map((item, idx) => {
                const ownId = String(item.id || `own-${idx}`);
                const isOwnSelected = activeLayerId === ownId;
                const itemColor = getOwnerColor(idx);
                const topAltitudeM = SURFACE_OFFSET_M + item.top_ft * FT_TO_M * DEPTH_SCALE;
                const bottomAltitudeM = SURFACE_OFFSET_M + item.bot_ft * FT_TO_M * DEPTH_SCALE;
                const thicknessM = Math.abs(bottomAltitudeM - topAltitudeM);
                const centerAltitudeM = (topAltitudeM + bottomAltitudeM) / 2;
                
                return (
                  <Fragment key={`${well.api}-${ownId}-own`}>
                    {isOwnershipTab && (
                      <Entity id={`ownership-poly::${well.api}::${ownId}`}>
                        <PolylineGraphics positions={[Cartesian3.fromDegrees(well.lon, well.lat, topAltitudeM), Cartesian3.fromDegrees(well.lon, well.lat, bottomAltitudeM)]} width={5} material={getSafeColor(itemColor).withAlpha(1.0)} />
                      </Entity>
                    )}
                    <Entity id={`ownership-cyl::${well.api}::${ownId}`} position={Cartesian3.fromDegrees(well.lon, well.lat, centerAltitudeM)}>
                      <CylinderGraphics length={thicknessM} topRadius={RADIUS_OWNERSHIP} bottomRadius={RADIUS_OWNERSHIP} material={getSafeColor(itemColor).withAlpha(isOwnSelected && isOwnershipTab ? 0.85 : 0.65)} />
                    </Entity>
                    {isOwnershipTab && (
                      <Fragment>
                        <Entity position={Cartesian3.fromDegrees(well.lon, well.lat, topAltitudeM)}><BillboardGraphics image={createDotImage(itemColor)} verticalOrigin={VerticalOrigin.CENTER} scale={0.7} /></Entity>
                        <Entity position={Cartesian3.fromDegrees(well.lon, well.lat, bottomAltitudeM)}><BillboardGraphics image={createDotImage(itemColor)} verticalOrigin={VerticalOrigin.CENTER} scale={0.7} /></Entity>
                      </Fragment>
                    )}
                  </Fragment>
                );
              })}

              {shouldShowWrapper && well.perforations?.map((perf, idx) => {
                const perfId = String(perf.id || `perf-${idx}`);
                const isPerfSelected = activeLayerId === perfId;
                const pColor = perf.color || getPerfColor(idx);
                const topAltitudeM = SURFACE_OFFSET_M + perf.top_ft * FT_TO_M * DEPTH_SCALE;
                const bottomAltitudeM = SURFACE_OFFSET_M + perf.bot_ft * FT_TO_M * DEPTH_SCALE;
                const thicknessM = Math.abs(bottomAltitudeM - topAltitudeM);
                const centerAltitudeM = (topAltitudeM + bottomAltitudeM) / 2;
                
                return (
                  <Fragment key={`${well.api}-${perfId}-perf`}>
                    {isPerforationsTab && (
                      <Entity id={`perforation-poly::${well.api}::${perfId}`}>
                        <PolylineGraphics positions={[Cartesian3.fromDegrees(well.lon, well.lat, topAltitudeM), Cartesian3.fromDegrees(well.lon, well.lat, bottomAltitudeM)]} width={5} material={getSafeColor(pColor).withAlpha(1.0)} />
                      </Entity>
                    )}
                    <Entity id={`perforation-cyl::${well.api}::${perfId}`} position={Cartesian3.fromDegrees(well.lon, well.lat, centerAltitudeM)}>
                      <CylinderGraphics length={thicknessM} topRadius={RADIUS_PERF} bottomRadius={RADIUS_PERF} material={getSafeColor(pColor).withAlpha(isPerfSelected && isPerforationsTab ? 1.0 : 0.95)} />
                    </Entity>
                    {isPerforationsTab && (
                      <Fragment>
                        <Entity position={Cartesian3.fromDegrees(well.lon, well.lat, topAltitudeM)}><BillboardGraphics image={createDotImage(pColor)} verticalOrigin={VerticalOrigin.CENTER} scale={0.7} /></Entity>
                        <Entity position={Cartesian3.fromDegrees(well.lon, well.lat, bottomAltitudeM)}><BillboardGraphics image={createDotImage(pColor)} verticalOrigin={VerticalOrigin.CENTER} scale={0.7} /></Entity>
                      </Fragment>
                    )}
                  </Fragment>
                );
              })}

              {show3D && isSelected && uniqueTickDepths.map((ft: any) => {
                const tickAlt = SURFACE_OFFSET_M + ft * FT_TO_M * DEPTH_SCALE;
                const tColor = uniqueTicksMap.get(ft) || "#f8f8ff";
                const tColorObj = getSafeColor(tColor);
                return (
                  <Fragment key={`lbl-${well.api}-${ft}`}>
                    <Entity>
                      <PolylineGraphics positions={[Cartesian3.fromDegrees(well.lon, well.lat, tickAlt), Cartesian3.fromDegrees(labelOffsetLon, well.lat, tickAlt)]} width={1.5} material={new PolylineDashMaterialProperty({ color: tColorObj.withAlpha(0.92), dashLength: 4.0 })} />
                    </Entity>
                    <Entity position={Cartesian3.fromDegrees(labelOffsetLon, well.lat, tickAlt)} onClick={() => handleTickClick(well, ft)}>
                      <LabelGraphics text={`${ft.toLocaleString()} ft`} font="bold 12pt sans-serif" fillColor={tColorObj} outlineColor={getSafeColor("#000000")} outlineWidth={2} pixelOffset={new Cartesian2(5, 0)} horizontalOrigin={HorizontalOrigin.LEFT} disableDepthTestDistance={Number.POSITIVE_INFINITY} />
                    </Entity>
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}
      </Viewer>
    </main>
  );
}