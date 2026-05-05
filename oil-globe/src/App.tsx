import React, {
  useRef, useState, useEffect, useMemo, useCallback
} from "react";
import {
  Viewer, Scene, Globe, Entity, CylinderGraphics,
  PolylineGraphics, PolygonGraphics
} from "resium";
import * as Cesium from "cesium";
import { Cartesian3, Color, NearFarScalar, Rectangle } from "cesium";
import wellData from "./data/wells.json";
import "cesium/Build/Cesium/Widgets/widgets.css";

/* ═══════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════ */
type WellStatus = "producing" | "drilled" | "shut-in" | "p&a";
type WellType   = "horizontal" | "vertical" | "directional";

interface Layer {
  id: string; name: string; owner: string;
  top_ft: number; bot_ft: number; color: string; lithology: string;
}
interface TrajStep {
  type: "vertical" | "curve" | "horizontal";
  length?: number; radius?: number;
}
interface Production {
  oil_bopd: number; gas_mcfd: number; water_bwpd: number;
  gor: number; wc_pct: number;
}
interface Well {
  name: string; country: string; state: string;
  basin: string; sub_basin: string; api: string;
  operator: string; lat: number; lon: number;
  elevation_ft: number; total_depth_ft: number;
  spud_date: string; status: WellStatus; well_type: WellType;
  production: Production; lease: string;
  layers: Layer[]; trajectory: TrajStep[]; branches: any[];
}

const WELLS = wellData as Well[];

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const STATUS_COLOR: Record<string, string> = {
  producing: "#00D47E", drilled: "#2986E8",
  "shut-in": "#F09030", "p&a": "#E04545"
};
const TYPE_ICON: Record<string, string> = {
  horizontal: "↔", vertical: "↕", directional: "↗"
};

// Depth scale: compress real depths so they sit just under the globe surface
// Real wells are 3–6 km deep; ECEF surface is ~6371 km radius
// We render at 1:12 scale so cylinders are ~200-500m below surface — visible with translucency
const DEPTH_SCALE = 0.05;
const FT_TO_M    = 0.3048;

const fmt  = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));

/* ═══════════════════════════════════════════════════════════════
   STABLE UNDERGROUND GEOMETRY — computed once per well
   All cylinders at FIXED negative Z (below ellipsoid surface)
═══════════════════════════════════════════════════════════════ */
function getLayerCenterZ(well: Well, layerIdx: number): number {
  const layer = well.layers[layerIdx];
  // Midpoint depth scaled and negated (underground)
  return -((layer.top_ft + layer.bot_ft) / 2) * FT_TO_M * DEPTH_SCALE;
}
function getLayerThickM(layer: Layer): number {
  return (layer.bot_ft - layer.top_ft) * FT_TO_M * DEPTH_SCALE;
}

// Trajectory stays within the same lon/lat column, just going underground
function buildUGTrajectory(well: Well): Cartesian3[] {
  const pts: Cartesian3[] = [];
  const { lon, lat } = well;
  let z = 0; // starts at surface

  well.trajectory.forEach((seg) => {
    if (seg.type === "vertical") {
      const len = (seg.length || 0) * FT_TO_M * DEPTH_SCALE;
      const steps = 16;
      for (let i = 1; i <= steps; i++) {
        z -= len / steps;
        pts.push(Cartesian3.fromDegrees(lon, lat, z));
      }
    } else if (seg.type === "curve") {
      const r = (seg.radius || 400) * FT_TO_M * DEPTH_SCALE;
      // Curve from vertical → horizontal, TINY lon offset (0.0004°≈40m)
      const lonShift = 0.0004;
      const steps = 20;
      const zStart = z;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = t * (Math.PI / 2);
        pts.push(Cartesian3.fromDegrees(
          lon + Math.sin(a) * lonShift,
          lat,
          zStart - r * (1 - Math.cos(a))
        ));
      }
      z = zStart - r;
    } else if (seg.type === "horizontal") {
      // Horizontal leg: extend only 0.001° in lon (~100m visible) to stay near well
      const lonEnd = lon + 0.001;
      const steps = 16;
      for (let i = 1; i <= steps; i++) {
        pts.push(Cartesian3.fromDegrees(
          lon + (lonEnd - lon) * (i / steps),
          lat, z
        ));
      }
    }
  });
  return pts;
}

/* ═══════════════════════════════════════════════════════════════
   CANVAS — CROSS SECTION RENDERER
═══════════════════════════════════════════════════════════════ */
function drawSection(
  canvas: HTMLCanvasElement,
  well: Well,
  animPct: number,
  hiId: string | null
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const L = 70, R = 16, T = 46, B = 28;
  const pw = W - L - R, ph = H - T - B;
  const maxD = well.total_depth_ft;
  const dY = (d: number) => T + (d / maxD) * ph;

  // ── background
  ctx.fillStyle = "#040c17";
  ctx.fillRect(0, 0, W, H);

  // subtle scan-line texture
  for (let y = T; y < T + ph; y += 4) {
    ctx.fillStyle = "rgba(255,255,255,0.012)";
    ctx.fillRect(L, y, pw, 1);
  }

  // ── layers
  well.layers.forEach((lyr) => {
    const y1 = dY(lyr.top_ft), y2 = dY(lyr.bot_ft), lh = y2 - y1;
    const hi  = hiId === lyr.id;
    const tgt = lyr.name.includes("TARGET");

    ctx.fillStyle = lyr.color + (hi ? "EE" : "AA");
    ctx.fillRect(L, y1, pw, lh);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(L, y1, pw, lh);
    if (hi)  { ctx.fillStyle = "rgba(255,255,255,0.09)"; ctx.fillRect(L, y1, pw, lh); }
    if (tgt) { ctx.fillStyle = "rgba(229,57,53,0.15)";   ctx.fillRect(L, y1, 6, lh); }

    // borders
    ctx.setLineDash([]);
    if (tgt) {
      ctx.strokeStyle = "#E53935"; ctx.lineWidth = hi ? 2 : 1.5;
      ctx.strokeRect(L + 1, y1 + 1, pw - 2, lh - 2);
    }
    if (hi) {
      ctx.strokeStyle = "#ffffff60"; ctx.lineWidth = 1.2;
      ctx.strokeRect(L + 1, y1 + 1, pw - 2, lh - 2);
    }
    // separator
    ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(L, y1); ctx.lineTo(L + pw, y1); ctx.stroke();

    // label
    if (lh > 11) {
      const fs = Math.min(10.5, Math.max(7.5, lh * 0.42));
      ctx.font = `${tgt ? "700 " : ""}${fs}px 'JetBrains Mono',monospace`;
      ctx.fillStyle = hi ? "#fff" : tgt ? "#FFA0A0" : "rgba(255,255,255,0.52)";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const lbl = lh < 18
        ? lyr.name.replace(" — TARGET", " ★").split(" ").slice(0, 3).join(" ")
        : lyr.name;
      ctx.fillText(lbl, L + 9, (y1 + y2) / 2);
    }
  });

  // ── depth axis
  ctx.fillStyle = "#030b14";
  ctx.fillRect(0, T, L - 1, ph);
  ctx.strokeStyle = "rgba(25,75,130,0.55)"; ctx.lineWidth = 0.6;
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.stroke();

  const ticks = Math.min(10, Math.floor(ph / 28));
  for (let i = 0; i <= ticks; i++) {
    const d = Math.round((maxD * i) / ticks);
    const y = dY(d);
    ctx.fillStyle = "#1a4560"; ctx.font = "8px 'JetBrains Mono',monospace";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(i === 0 ? "0" : fmt(d), L - 5, y);
    ctx.strokeStyle = "rgba(15,55,100,0.25)"; ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
  }
  ctx.save(); ctx.translate(10, T + ph / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#1a4560"; ctx.font = "8px 'JetBrains Mono',monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("DEPTH (ft MD)", 0, 0); ctx.restore();

  // ── title bar
  ctx.fillStyle = "#020a12"; ctx.fillRect(0, 0, W, T);
  ctx.fillStyle = "#182a40"; ctx.fillRect(0, T, W, 1);
  const sc = STATUS_COLOR[well.status] || "#888";
  ctx.fillStyle = sc; ctx.beginPath(); ctx.arc(L + 10, T / 2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#88b8e0"; ctx.font = "600 11px 'JetBrains Mono',monospace";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(well.name, L + 22, T / 2 - 6);
  ctx.fillStyle = "#284a62"; ctx.font = "9px 'JetBrains Mono',monospace";
  ctx.fillText(`TVD ${fmt(well.total_depth_ft)} ft  ·  ${well.operator}  ·  ${well.api}`, L + 22, T / 2 + 7);

  // ── wellbore path
  const maxHoriz = well.trajectory.reduce(
    (s, t) => s + (t.type === "horizontal" ? (t.length || 0) : t.type === "curve" ? (t.radius || 0) : 0), 0
  ) || 1;
  const hPxMax  = pw * 0.58;
  const wHX     = L + pw * 0.16;
  const wHY     = dY(0);

  type Pt = { x: number; y: number };
  const path: Pt[] = [{ x: wHX, y: wHY }];
  let cD = 0, cH = 0;

  well.trajectory.forEach((seg) => {
    if (seg.type === "vertical") {
      const d1 = cD + (seg.length || 0);
      path.push({ x: wHX + (cH / maxHoriz) * hPxMax, y: dY(cD) });
      path.push({ x: wHX + (cH / maxHoriz) * hPxMax, y: dY(d1) });
      cD = d1;
    } else if (seg.type === "curve") {
      const r = seg.radius || 400;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, a = t * Math.PI / 2;
        path.push({
          x: wHX + ((cH + r * Math.sin(a)) / maxHoriz) * hPxMax,
          y: dY(cD + r * (1 - Math.cos(a)))
        });
      }
      cD += r; cH += r;
    } else if (seg.type === "horizontal") {
      const h1 = cH + (seg.length || 0);
      path.push({ x: wHX + (cH / maxHoriz) * hPxMax, y: dY(cD) });
      path.push({ x: wHX + (h1 / maxHoriz) * hPxMax, y: dY(cD) });
      cH = h1;
    }
  });

  const drawN = Math.max(2, Math.floor(animPct * path.length));
  const pts   = path.slice(0, drawN);

  if (pts.length >= 2) {
    // casing pipes
    [-6, 6].forEach((off) => {
      ctx.save(); ctx.strokeStyle = "rgba(120,165,210,0.3)";
      ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(pts[0].x + off, pts[0].y);
      pts.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x + off, p.y); });
      ctx.stroke(); ctx.restore();
    });
    // glow
    ctx.save(); ctx.strokeStyle = sc + "28"; ctx.lineWidth = 16;
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x, p.y); });
    ctx.stroke(); ctx.restore();
    // main line
    ctx.save(); ctx.strokeStyle = sc; ctx.lineWidth = 3.5;
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x, p.y); });
    ctx.stroke(); ctx.restore();

    // drill bit animating
    if (animPct < 0.999) {
      const bp = pts[pts.length - 1];
      ctx.save();
      ctx.fillStyle = sc; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bp.x, bp.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = sc; ctx.font = "9px 'JetBrains Mono',monospace";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const liveD = Math.round(maxD * animPct * 0.9 + maxD * 0.05);
      ctx.fillText(`▼ ${fmt(liveD)} ft`, bp.x + 11, bp.y);
      ctx.restore();
    }
    // TD marker
    if (animPct >= 0.999 && path.length > 1) {
      const ep = path[path.length - 1];
      ctx.save();
      ctx.fillStyle = "#E53935"; ctx.strokeStyle = "#FF6060"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(ep.x, ep.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "700 9px 'JetBrains Mono',monospace";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(`TD  ${fmt(well.total_depth_ft)} ft`, ep.x + 11, ep.y);
      ctx.restore();
      // lateral arrow
      if (cH > 0) {
        const latLen = well.trajectory.find(t => t.type === "horizontal")?.length || 0;
        const sx = wHX + ((cH - latLen) / maxHoriz) * hPxMax;
        const ex = ep.x;
        const ay = ep.y + 24;
        ctx.save(); ctx.strokeStyle = "#243a52"; ctx.lineWidth = 0.8; ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sx, ay - 8); ctx.lineTo(sx, ay);
        ctx.moveTo(sx, ay); ctx.lineTo(ex, ay);
        ctx.moveTo(ex, ay - 8); ctx.lineTo(ex, ay);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#243a52"; ctx.font = "8px 'JetBrains Mono',monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText(`← ${fmt(latLen)} ft lateral →`, (sx + ex) / 2, ay + 3);
        ctx.restore();
      }
    }
  }
  // well head
  ctx.save();
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#3a8ad5"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(wHX, wHY, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#040c17"; ctx.beginPath(); ctx.arc(wHX, wHY, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2a5070"; ctx.font = "8px 'JetBrains Mono',monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("SURFACE", wHX, wHY - 9);
  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════
   COMPARE CROSS SECTION (mini, side by side)
═══════════════════════════════════════════════════════════════ */
function MiniSection({ well }: { well: Well }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    setPct(0);
    const t0 = performance.now(), dur = 1400;
    const step = (now: number) => {
      const r = Math.min((now - t0) / dur, 1);
      const e = r < 0.5 ? 2 * r * r : 1 - Math.pow(-2 * r + 2, 2) / 2;
      setPct(e);
      if (r < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [well.api]);

  useEffect(() => {
    if (!ref.current) return;
    const cv = ref.current;
    cv.width  = cv.offsetWidth * window.devicePixelRatio;
    cv.height = cv.offsetHeight * window.devicePixelRatio;
    const ctx = cv.getContext("2d")!;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    drawSection(cv, well, pct, null);
  }, [well, pct]);

  return (
    <div style={{ flex: 1, minWidth: 280, background: "#040c17", borderRadius: 6, overflow: "hidden", border: "1px solid #0d2035" }}>
      <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOOLTIP COMPONENT
═══════════════════════════════════════════════════════════════ */
interface TipState { x: number; y: number; well: Well }
const HoverTip = ({ tip }: { tip: TipState }) => {
  const sc = STATUS_COLOR[tip.well.status] || "#888";
  return (
    <div style={{
      position: "fixed", left: tip.x + 15, top: tip.y - 12, zIndex: 9999,
      background: "#030a15F6", border: "1px solid #1a3555",
      borderRadius: 6, padding: "10px 13px", minWidth: 210, maxWidth: 270,
      backdropFilter: "blur(14px)", pointerEvents: "none",
      fontFamily: "'JetBrains Mono',monospace",
      boxShadow: "0 10px 40px #00000090, 0 0 0 1px #2060a020"
    }}>
      <div style={{ fontSize: 8, color: "#1e5080", letterSpacing: ".15em", textTransform: "uppercase", marginBottom: 4 }}>
        {tip.well.basin} · {tip.well.sub_basin}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#c8e8ff", marginBottom: 7, lineHeight: 1.2 }}>
        {tip.well.name}
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
        {[
          { t: tip.well.status,    c: sc },
          { t: `${TYPE_ICON[tip.well.well_type]} ${tip.well.well_type}`, c: "#2986E8" },
          { t: tip.well.state,     c: "#4a7090" }
        ].map(({ t, c }) => (
          <span key={t} style={{ fontSize: 9, padding: "1px 7px", borderRadius: 3, background: c + "1A", color: c, border: `1px solid ${c}40` }}>{t}</span>
        ))}
      </div>
      <div style={{ fontSize: 9, color: "#2a5070", marginBottom: 8 }}>{tip.well.operator}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 10px", borderTop: "1px solid #0d2035", paddingTop: 8 }}>
        {[
          { l: "Oil",   v: `${fmt(tip.well.production.oil_bopd)} bopd`, c: "#C0392B" },
          { l: "Gas",   v: `${fmt(tip.well.production.gas_mcfd)} mcfd`,  c: "#2986E8" },
          { l: "Water", v: `${fmt(tip.well.production.water_bwpd)} bwpd`,c: "#1a8090" },
          { l: "WC",    v: `${tip.well.production.wc_pct}%`,             c: "#3a6070" },
          { l: "TVD",   v: `${fmt(tip.well.total_depth_ft)} ft`,         c: "#4a7090" },
          { l: "GOR",   v: fmtK(tip.well.production.gor),                c: "#5a6080" },
        ].map(({ l, v, c }) => (
          <div key={l}>
            <div style={{ fontSize: 7, color: "#1a3550", textTransform: "uppercase", letterSpacing: ".07em" }}>{l}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 8, color: "#0f2535", marginTop: 8, fontFamily: "monospace" }}>{tip.well.api}</div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION PANEL (full detail for one well)
═══════════════════════════════════════════════════════════════ */
const SectionPanel = ({
  well, onClose, hiLayer, setHiLayer
}: {
  well: Well; onClose: () => void;
  hiLayer: string | null; setHiLayer: (id: string | null) => void;
}) => {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const animRf = useRef(0);
  const [pct, setPct] = useState(0);
  const [cvTip, setCvTip] = useState<{ x: number; y: number; layer: Layer } | null>(null);

  useEffect(() => {
    setPct(0);
    const t0 = performance.now(), dur = 1800;
    const step = (now: number) => {
      const r = Math.min((now - t0) / dur, 1);
      const e = r < 0.5 ? 2 * r * r : 1 - Math.pow(-2 * r + 2, 2) / 2;
      setPct(e);
      if (r < 1) animRf.current = requestAnimationFrame(step);
    };
    animRf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRf.current);
  }, [well.api]);

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const par = cv.parentElement!;
    cv.width  = par.clientWidth;
    cv.height = par.clientHeight;
    drawSection(cv, well, pct, hiLayer);
  }, [well, pct, hiLayer]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget;
    const r  = cv.getBoundingClientRect();
    const my = e.clientY - r.top;
    const dep = ((my - 46) / (cv.height - 46 - 28)) * well.total_depth_ft;
    const layer = well.layers.find(l => dep >= l.top_ft && dep <= l.bot_ft);
    layer ? setCvTip({ x: e.clientX, y: e.clientY, layer }) : setCvTip(null);
  };
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget;
    const r  = cv.getBoundingClientRect();
    const my = e.clientY - r.top;
    const dep = ((my - 46) / (cv.height - 46 - 28)) * well.total_depth_ft;
    const layer = well.layers.find(l => dep >= l.top_ft && dep <= l.bot_ft);
    if (layer) setHiLayer(hiLayer === layer.id ? null : layer.id);
  };

  const sc = STATUS_COLOR[well.status] || "#888";

  return (
    <div style={{
      position: "absolute", inset: 0, right: 0,
      width: 700, left: "auto",
      display: "flex", flexDirection: "column",
      background: "#030912", borderLeft: "1px solid #0c1e30",
      zIndex: 40, fontFamily: "'JetBrains Mono',monospace",
      animation: "sli .2s ease"
    }}>
      <style>{`@keyframes sli{from{transform:translateX(32px);opacity:0}to{transform:none;opacity:1}}`}</style>

      {/* header */}
      <div style={{ padding: "9px 14px", borderBottom: "1px solid #0c1e30", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc, boxShadow: `0 0 8px ${sc}`, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#b8d8f2" }}>{well.name}</div>
          <div style={{ fontSize: 9, color: "#1e4060", marginTop: 1 }}>{well.basin} · {well.sub_basin} · {well.state} · {well.operator}</div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: sc + "1A", color: sc, border: `1px solid ${sc}40` }}>{well.status}</span>
          <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: "#2986E81A", color: "#5aacf8", border: "1px solid #2986E840" }}>{TYPE_ICON[well.well_type]} {well.well_type}</span>
        </div>
        <button onClick={onClose} style={{ background: "#091525", border: "1px solid #142a40", color: "#2a5070", width: 26, height: 26, borderRadius: 4, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>

      {/* canvas cross section */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas
          ref={cvRef}
          style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair" }}
          onMouseMove={onMove}
          onMouseLeave={() => setCvTip(null)}
          onClick={onClick}
        />
        {cvTip && (
          <div style={{
            position: "fixed", left: cvTip.x + 13, top: cvTip.y - 8,
            background: "#030a15F5", border: "1px solid #1a3555",
            borderRadius: 5, padding: "7px 10px", pointerEvents: "none",
            zIndex: 9999, fontFamily: "'JetBrains Mono',monospace",
            boxShadow: "0 6px 24px #000000A0"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: cvTip.layer.color, border: cvTip.layer.name.includes("TARGET") ? "2px solid #E53935" : "none" }} />
              <span style={{ fontSize: 11, color: "#80b8d8", fontWeight: 700 }}>{cvTip.layer.name}</span>
            </div>
            <div style={{ fontSize: 9, color: "#1e4060" }}>{fmt(cvTip.layer.top_ft)} – {fmt(cvTip.layer.bot_ft)} ft  ·  {fmt(cvTip.layer.bot_ft - cvTip.layer.top_ft)} ft thick</div>
            <div style={{ fontSize: 9, color: "#1a3555", marginTop: 2 }}>{cvTip.layer.lithology}</div>
          </div>
        )}
      </div>

      {/* bottom KPI + strat */}
      <div style={{ display: "flex", borderTop: "1px solid #0c1e30", flexShrink: 0 }}>
        {/* KPIs */}
        <div style={{ flex: 1, padding: "10px 14px", borderRight: "1px solid #0c1e30" }}>
          <div style={{ fontSize: 8, color: "#1a4060", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 }}>Production</div>
          {[
            { l: "Oil",   v: fmt(well.production.oil_bopd),   u: "bopd", pct: (well.production.oil_bopd / 2000) * 100,   c: "#C0392B" },
            { l: "Gas",   v: fmt(well.production.gas_mcfd),   u: "mcfd", pct: (well.production.gas_mcfd / 25000) * 100,  c: "#2986E8" },
            { l: "Water", v: fmt(well.production.water_bwpd), u: "bwpd", pct: (well.production.water_bwpd / 8000) * 100, c: "#1a8090" },
            { l: "WC",    v: `${well.production.wc_pct}%`,   u: "",     pct: well.production.wc_pct,                    c: "#3a5060" },
          ].map(({ l, v, u, pct, c }) => (
            <div key={l} style={{ marginBottom: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 8, color: "#1a4060", textTransform: "uppercase", letterSpacing: ".07em" }}>{l}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#90b8d8" }}>{v}<span style={{ fontWeight: 400, fontSize: 8, color: "#1e4060", marginLeft: 3 }}>{u}</span></span>
              </div>
              <div style={{ height: 2, background: "#091525", borderRadius: 1 }}>
                <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: c, borderRadius: 1, transition: "width .6s ease", boxShadow: `0 0 4px ${c}80` }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 8, lineHeight: 1.8, color: "#1a3a50" }}>
            <div>API: <span style={{ color: "#2a5570" }}>{well.api}</span></div>
            <div>Spud: <span style={{ color: "#2a5570" }}>{well.spud_date}</span></div>
            <div>Coord: <span style={{ color: "#2a5570" }}>{well.lat.toFixed(4)}°N, {Math.abs(well.lon).toFixed(4)}°W</span></div>
            <div>Elev: <span style={{ color: "#2a5570" }}>{fmt(well.elevation_ft)} ft ASL</span></div>
            <div style={{ marginTop: 4, color: "#0f2535" }}>{well.lease}</div>
          </div>
        </div>

        {/* Stratigraphy */}
        <div style={{ width: 218, padding: "10px 12px", overflowY: "auto", maxHeight: 240 }}>
          <div style={{ fontSize: 8, color: "#1a4060", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 }}>
            Stratigraphy — click layer
          </div>
          {well.layers.map((lyr) => {
            const hi  = hiLayer === lyr.id;
            const tgt = lyr.name.includes("TARGET");
            return (
              <div key={lyr.id} onClick={() => setHiLayer(hi ? null : lyr.id)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 7,
                  padding: "5px 6px", borderRadius: 4, marginBottom: 2, cursor: "pointer",
                  background: hi ? "#061525" : "transparent",
                  border: hi ? "1px solid #142a40" : "1px solid transparent",
                  transition: "all .12s"
                }}>
                <div style={{
                  width: 9, height: 9, borderRadius: 2, flexShrink: 0, marginTop: 2,
                  background: lyr.color,
                  border: tgt ? "2px solid #E53935" : hi ? "1px solid #ffffff40" : "none",
                  boxShadow: tgt ? "0 0 5px #E5393560" : "none"
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, lineHeight: 1.3, fontWeight: tgt ? 700 : 400,
                    color: hi ? "#80b8e8" : tgt ? "#d08080" : "#4a6a80" }}>{lyr.name}</div>
                  <div style={{ fontSize: 8, color: "#0f2535", marginTop: 1 }}>
                    {fmt(lyr.top_ft)} – {fmt(lyr.bot_ft)} ft · {lyr.owner}
                  </div>
                  {hi && <div style={{ fontSize: 8, color: "#2a5570", marginTop: 2 }}>
                    {lyr.lithology} · {fmt(lyr.bot_ft - lyr.top_ft)} ft
                  </div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   COMPARE PANEL (multi-well side by side)
═══════════════════════════════════════════════════════════════ */
const ComparePanel = ({ wells, onClose }: { wells: Well[]; onClose: () => void }) => {
  const [tab, setTab] = useState<"section" | "table">("section");
  const cols = ["OIL (bopd)", "GAS (mcfd)", "WATER (bwpd)", "WC%", "TVD (ft)", "TYPE", "STATUS"];
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 50,
      background: "#020912F8", backdropFilter: "blur(6px)",
      display: "flex", flexDirection: "column",
      fontFamily: "'JetBrains Mono',monospace",
      animation: "sli .2s ease"
    }}>
      {/* toolbar */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #0c1e30", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#5090c8" }}>⚖ Compare  <span style={{ color: "#1a4060" }}>{wells.length} wells</span></div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["section", "table"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? "#142a44" : "#07121e",
              border: `1px solid ${tab === t ? "#2060a0" : "#0c1e30"}`,
              color: tab === t ? "#5aacf8" : "#2a5070",
              borderRadius: 4, padding: "3px 10px", cursor: "pointer",
              fontSize: 9, fontFamily: "inherit", textTransform: "capitalize"
            }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          background: "#091525", border: "1px solid #142a40", color: "#2a5070",
          width: 26, height: 26, borderRadius: 4, cursor: "pointer", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>✕</button>
      </div>

      {tab === "section" && (
        <div style={{ flex: 1, display: "flex", gap: 8, padding: 12, overflow: "hidden" }}>
          {wells.map(w => <MiniSection key={w.api} well={w} />)}
        </div>
      )}

      {tab === "table" && (
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #0c1e30" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", color: "#1a4060", fontSize: 8, textTransform: "uppercase", letterSpacing: ".1em" }}>Well</th>
                {cols.map(c => (
                  <th key={c} style={{ textAlign: "right", padding: "6px 10px", color: "#1a4060", fontSize: 8, textTransform: "uppercase", letterSpacing: ".1em" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wells.map((w, i) => {
                const sc = STATUS_COLOR[w.status] || "#888";
                return (
                  <tr key={w.api} style={{ borderBottom: "1px solid #060e18", background: i % 2 ? "#040c16" : "transparent" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#80b0d0" }}>{w.name}</div>
                      <div style={{ fontSize: 8, color: "#1a4060" }}>{w.basin} · {w.state}</div>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#C0392B", fontWeight: 700 }}>{fmt(w.production.oil_bopd)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#2986E8", fontWeight: 700 }}>{fmt(w.production.gas_mcfd)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#1a8090", fontWeight: 700 }}>{fmt(w.production.water_bwpd)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#4a7090" }}>{w.production.wc_pct}%</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#4a7090" }}>{fmt(w.total_depth_ft)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#5aacf8" }}>{TYPE_ICON[w.well_type]} {w.well_type}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, background: sc + "1A", color: sc, border: `1px solid ${sc}40` }}>{w.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════════ */
export default function App() {
  const viewerRef = useRef<any>(null);

  // Selection & hover
  const [focusApi,    setFocusApi]    = useState<string | null>(null);  // single clicked well for section
  const [checkedApis, setCheckedApis] = useState<Set<string>>(new Set()); // multi-checked wells
  const [hoveredApi,  setHoveredApi]  = useState<string | null>(null);
  const [tip,         setTip]         = useState<TipState | null>(null);
  const [hiLayer,     setHiLayer]     = useState<string | null>(null);
  const [showSection, setShowSection] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  // Rectangle/lasso selection on globe
  const [drawMode,   setDrawMode]   = useState(false);
  const [drawCorner, setDrawCorner] = useState<{ lon: number; lat: number } | null>(null);
  const [drawRect,   setDrawRect]   = useState<{ w: number; e: number; s: number; n: number } | null>(null);

  // Filters
  const [basinFilter, setBasinFilter] = useState("ALL");
  const [typeFilter,  setTypeFilter]  = useState("ALL");
  const [stateFilter, setStateFilter] = useState("ALL");

  const basins = useMemo(() => ["ALL", ...Array.from(new Set(WELLS.map(w => w.basin)))], []);
  const states = useMemo(() => ["ALL", ...Array.from(new Set(WELLS.map(w => w.state))).sort()], []);

  const filtered = useMemo(() => WELLS.filter(w =>
    (basinFilter === "ALL" || w.basin === basinFilter) &&
    (typeFilter  === "ALL" || w.well_type === typeFilter) &&
    (stateFilter === "ALL" || w.state === stateFilter)
  ), [basinFilter, typeFilter, stateFilter]);

  const focusWell   = useMemo(() => WELLS.find(w => w.api === focusApi) || null, [focusApi]);
  const checkedWells = useMemo(() => WELLS.filter(w => checkedApis.has(w.api)), [checkedApis]);

  // Fly to well
  useEffect(() => {
    if (!viewerRef.current?.cesiumElement || !focusWell) return;
    viewerRef.current.cesiumElement.camera.flyTo({
      destination: Cartesian3.fromDegrees(focusWell.lon, focusWell.lat - 0.035, 14000),
      orientation: { pitch: Cesium.Math.toRadians(-42), heading: Cesium.Math.toRadians(5) },
      duration: 1.5,
    });
  }, [focusWell]);

  // Toggle checkbox
  const toggleCheck = useCallback((api: string) => {
    setCheckedApis(prev => {
      const next = new Set(prev);
      next.has(api) ? next.delete(api) : next.add(api);
      return next;
    });
  }, []);

  const selectFocus = useCallback((w: Well) => {
    setFocusApi(w.api);
    setHiLayer(null);
    setShowSection(true);
    setShowCompare(false);
    setTip(null);
  }, []);

  const closeSection = useCallback(() => {
    setFocusApi(null);
    setShowSection(false);
    setHiLayer(null);
  }, []);

  // Rectangle selection on globe
  const startDraw = useCallback(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    setDrawMode(true);
    setDrawRect(null);
    setDrawCorner(null);
    viewer.canvas.style.cursor = "crosshair";
  }, []);

  const cancelDraw = useCallback(() => {
    setDrawMode(false);
    setDrawRect(null);
    setDrawCorner(null);
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) viewer.canvas.style.cursor = "auto";
  }, []);

  // Globe click → start/end rectangle
  const handleGlobeLeftClick = useCallback((movement: any) => {
    if (!drawMode) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const pos = viewer.scene.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
    if (!pos) return;
    const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(pos);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);

    if (!drawCorner) {
      setDrawCorner({ lon, lat });
    } else {
      const rect = {
        w: Math.min(drawCorner.lon, lon), e: Math.max(drawCorner.lon, lon),
        s: Math.min(drawCorner.lat, lat), n: Math.max(drawCorner.lat, lat),
      };
      setDrawRect(rect);
      setDrawMode(false);
      setDrawCorner(null);
      if (viewer) viewer.canvas.style.cursor = "auto";
      // Select all wells inside rectangle
      const inside = filtered.filter(w => w.lon >= rect.w && w.lon <= rect.e && w.lat >= rect.s && w.lat <= rect.n);
      setCheckedApis(prev => {
        const next = new Set(prev);
        inside.forEach(w => next.add(w.api));
        return next;
      });
    }
  }, [drawMode, drawCorner, filtered]);

  // Stats
  const totalOil = filtered.reduce((s, w) => s + w.production.oil_bopd, 0);
  const totalGas = filtered.reduce((s, w) => s + w.production.gas_mcfd, 0);
  const nProd    = filtered.filter(w => w.status === "producing").length;

  return (
    <div style={{
      width: "100vw", height: "100vh", display: "flex",
      fontFamily: "'JetBrains Mono','Courier New',monospace",
      background: "#020810", overflow: "hidden"
    }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" />

      {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
      <div style={{
        width: 262, flexShrink: 0, background: "#030912",
        borderRight: "1px solid #0b1c2c",
        display: "flex", flexDirection: "column", zIndex: 10, overflow: "hidden"
      }}>
        {/* Logo */}
        <div style={{ padding: "13px 14px 10px", borderBottom: "1px solid #0b1c2c", background: "linear-gradient(180deg,#05101e,#030912)" }}>
          <div style={{ fontSize: 8, color: "#1a5080", letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 5 }}>◈ US Basin Intelligence</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#d8eeff", letterSpacing: "-.03em", lineHeight: 1 }}>
            Well<span style={{ color: "#2986E8" }}>Sight</span>
          </div>
          <div style={{ fontSize: 8, color: "#0f2535", marginTop: 5 }}>{filtered.length} / {WELLS.length} wells</div>
        </div>

        {/* Filters */}
        <div style={{ padding: "9px 12px", borderBottom: "1px solid #0b1c2c" }}>
          {([
            { label: "Basin",     val: basinFilter, opts: basins, set: setBasinFilter },
            { label: "State",     val: stateFilter, opts: states, set: setStateFilter },
            { label: "Well Type", val: typeFilter,  opts: ["ALL","horizontal","vertical","directional"], set: setTypeFilter },
          ] as any[]).map(({ label, val, opts, set }) => (
            <div key={label} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 7, color: "#1a4060", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 3 }}>{label}</div>
              <select value={val} onChange={e => set(e.target.value)}
                style={{ width: "100%", background: "#04101e", border: "1px solid #0b1c2c", color: "#3a6888", borderRadius: 3, padding: "4px 7px", fontSize: 10, cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
                {opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Multi-select toolbar */}
        <div style={{ padding: "7px 12px", borderBottom: "1px solid #0b1c2c", display: "flex", gap: 5, alignItems: "center" }}>
          <button onClick={startDraw} style={{
            background: drawMode ? "#142a44" : "#07121e",
            border: `1px solid ${drawMode ? "#2986E8" : "#0b1c2c"}`,
            color: drawMode ? "#5aacf8" : "#2a5070",
            borderRadius: 4, padding: "4px 9px", cursor: "pointer",
            fontSize: 9, fontFamily: "inherit", flex: 1
          }}>
            {drawMode ? "⬚ Click 2nd corner..." : "⬚ Box Select"}
          </button>
          {drawMode && (
            <button onClick={cancelDraw} style={{ background: "#07121e", border: "1px solid #0b1c2c", color: "#4a2030", borderRadius: 4, padding: "4px 7px", cursor: "pointer", fontSize: 9, fontFamily: "inherit" }}>✕</button>
          )}
          {checkedApis.size > 0 && (
            <button
              onClick={() => { if (checkedApis.size >= 2) { setShowCompare(true); setShowSection(false); } }}
              style={{ background: "#0d2a44", border: "1px solid #2060a0", color: "#5aacf8", borderRadius: 4, padding: "4px 9px", cursor: "pointer", fontSize: 9, fontFamily: "inherit", flex: 1 }}>
              ⚖ Compare ({checkedApis.size})
            </button>
          )}
        </div>
        {checkedApis.size > 0 && (
          <div style={{ padding: "3px 12px 6px", display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ fontSize: 8, color: "#1a4060" }}>{checkedApis.size} selected</span>
            <button onClick={() => setCheckedApis(new Set())} style={{ background: "none", border: "none", color: "#2a3a50", cursor: "pointer", fontSize: 9, fontFamily: "inherit" }}>clear all</button>
          </div>
        )}

        {/* Well list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map((w) => {
            const isFocus   = w.api === focusApi;
            const isChecked = checkedApis.has(w.api);
            const isHov     = w.api === hoveredApi;
            const sc        = STATUS_COLOR[w.status] || "#888";
            return (
              <div key={w.api}
                onMouseEnter={() => setHoveredApi(w.api)}
                onMouseLeave={() => setHoveredApi(null)}
                style={{
                  padding: "7px 12px", borderBottom: "1px solid #060d18",
                  background: isFocus ? "#071830" : isChecked ? "#061220" : isHov ? "#040e1a" : "transparent",
                  borderLeft: `2px solid ${isFocus ? "#2986E8" : isChecked ? "#1a6040" : "transparent"}`,
                  transition: "all .1s", display: "flex", alignItems: "flex-start", gap: 8
                }}>
                {/* Checkbox */}
                <div
                  onClick={() => toggleCheck(w.api)}
                  style={{
                    width: 14, height: 14, borderRadius: 3, marginTop: 2, cursor: "pointer", flexShrink: 0,
                    background: isChecked ? "#1a6040" : "#06111e",
                    border: `1px solid ${isChecked ? "#00D47E" : "#0c1e30"}`,
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                  {isChecked && <span style={{ fontSize: 9, color: "#00D47E", lineHeight: 1 }}>✓</span>}
                </div>
                {/* Well info */}
                <div style={{ flex: 1, cursor: "pointer", minWidth: 0 }} onClick={() => selectFocus(w)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isFocus ? "#5aacf8" : "#7aa8c8", lineHeight: 1.3, flex: 1, marginRight: 4 }}>
                      <span style={{ color: sc, marginRight: 4, fontSize: 9 }}>{TYPE_ICON[w.well_type]}</span>
                      {w.name}
                    </span>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc, flexShrink: 0, marginTop: 4, boxShadow: isFocus ? `0 0 6px ${sc}` : "none" }} />
                  </div>
                  <div style={{ fontSize: 8, color: "#1a4060", marginTop: 2 }}>{w.basin} · {w.state}</div>
                  <div style={{ fontSize: 8, color: "#0c1e2e", marginTop: 1 }}>{w.operator}</div>
                  {(isFocus || isChecked) && (
                    <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
                      {[
                        { l: "OIL", v: fmtK(w.production.oil_bopd) + " bo", c: "#C0392B" },
                        { l: "GAS", v: fmtK(w.production.gas_mcfd) + " mc",  c: "#2986E8" },
                      ].map(({ l, v, c }) => (
                        <div key={l} style={{ background: c + "14", border: `1px solid ${c}28`, borderRadius: 3, padding: "2px 5px" }}>
                          <div style={{ fontSize: 6, color: c + "90", textTransform: "uppercase" }}>{l}</div>
                          <div style={{ fontSize: 9, color: c, fontWeight: 700 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Status legend */}
        <div style={{ padding: "9px 14px", borderTop: "1px solid #0b1c2c" }}>
          <div style={{ fontSize: 7, color: "#1a4060", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 7 }}>Status</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px" }}>
            {Object.entries(STATUS_COLOR).map(([k, c]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: c, boxShadow: `0 0 4px ${c}` }} />
                <span style={{ fontSize: 9, color: "#1a4060", textTransform: "capitalize" }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ GLOBE AREA ══════════════════════════════════════════════ */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <Viewer
          ref={viewerRef}
          full
          timeline={false}
          animation={false}
          selectionIndicator={false}
          infoBox={false}
          terrainProvider={new Cesium.EllipsoidTerrainProvider()}
          onClick={handleGlobeLeftClick}
        >
          <Scene>
            <Globe
              depthTestAgainstTerrain={false}
              translucency={{
                enabled: true,
                frontFaceAlpha: 0.3,
                backFaceAlpha:  0.2,
                rectangle: Rectangle.MAX_VALUE,
                frontFaceAlphaByDistance: new NearFarScalar(100, 0.08, 8_000_000, 1.0),
              } as any}
            />
          </Scene>

          {/* Rectangle selection preview */}
          {drawRect && (
            <Entity>
              <PolygonGraphics
                hierarchy={new Cesium.PolygonHierarchy(
                  Cartesian3.fromDegreesArray([
                    drawRect.w, drawRect.s,
                    drawRect.e, drawRect.s,
                    drawRect.e, drawRect.n,
                    drawRect.w, drawRect.n,
                  ])
                )}
                material={Color.fromCssColorString("#2986E8").withAlpha(0.08)}
                outline
                outlineColor={Color.fromCssColorString("#2986E8").withAlpha(0.6)}
                outlineWidth={2}
              />
            </Entity>
          )}

          {filtered.map((well) => {
            const isFocus   = well.api === focusApi;
            const isChecked = checkedApis.has(well.api);
            const isHov     = well.api === hoveredApi;
            const sc  = STATUS_COLOR[well.status] || "#888";
            const col = Color.fromCssColorString(sc);

            // Underground total scaled depth
            const totalScaledM = well.total_depth_ft * FT_TO_M * DEPTH_SCALE;

            return (
              <React.Fragment key={well.api}>
                {/* ── SURFACE POINT — fixed at lon/lat, z=5 ── */}
                <Entity
                  position={Cartesian3.fromDegrees(well.lon, well.lat, 5)}
                  onClick={() => selectFocus(well)}
                  onMouseEnter={(mv: any) => {
                    setHoveredApi(well.api);
                    setTip({ x: mv?.endPosition?.x ?? 300, y: mv?.endPosition?.y ?? 200, well });
                  }}
                  onMouseLeave={() => { setHoveredApi(null); setTip(null); }}
                  point={{
                    pixelSize:    isFocus ? 22 : isChecked ? 18 : isHov ? 15 : 10,
                    color:        isFocus ? Color.WHITE : isChecked ? Color.fromCssColorString("#00D47E") : col,
                    outlineColor: col,
                    outlineWidth: isFocus ? 3 : isChecked ? 2 : isHov ? 1.5 : 0,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  }}
                />

                {/* ── UNDERGROUND: cylinders (stable, no movement) ── */}
                {isFocus && well.layers.map((layer, idx) => {
                  const thickM  = getLayerThickM(layer);
                  const centerZ = getLayerCenterZ(well, idx);
                  const isTgt   = layer.name.includes("TARGET");
                  return (
                    <Entity
                      key={`cyl-${layer.id}`}
                      position={Cartesian3.fromDegrees(well.lon, well.lat, centerZ)}
                    >
                      <CylinderGraphics
                        length={Math.max(thickM, 8)}
                        topRadius={isTgt ? 650 : 420}
                        bottomRadius={isTgt ? 650 : 420}
                        material={Color.fromCssColorString(layer.color).withAlpha(isTgt ? 0.9 : 0.55)}
                        outline={isTgt || layer.id === hiLayer}
                        outlineColor={isTgt ? Color.fromCssColorString("#E53935") : Color.WHITE.withAlpha(0.6)}
                        outlineWidth={2}
                      />
                    </Entity>
                  );
                })}

                {/* ── UNDERGROUND: drill path (stable) ── */}
                {isFocus && well.trajectory.length > 0 && (() => {
                  const pts = buildUGTrajectory(well);
                  return pts.length >= 2 ? (
                    <Entity>
                      <PolylineGraphics
                        positions={pts}
                        width={4}
                        material={new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.5, color: col })}
                        clampToGround={false}
                        arcType={Cesium.ArcType.NONE}
                      />
                    </Entity>
                  ) : null;
                })()}

                {/* ── Vertical stem surface → bottom ── */}
                {isFocus && (
                  <Entity>
                    <PolylineGraphics
                      positions={[
                        Cartesian3.fromDegrees(well.lon, well.lat, 0),
                        Cartesian3.fromDegrees(well.lon, well.lat, -totalScaledM),
                      ]}
                      width={1.5}
                      material={col.withAlpha(0.22)}
                      arcType={Cesium.ArcType.NONE}
                    />
                  </Entity>
                )}

                {/* ── Checked well ring indicator ── */}
                {isChecked && !isFocus && (
                  <Entity
                    position={Cartesian3.fromDegrees(well.lon, well.lat, 5)}
                    point={{
                      pixelSize: 18, color: Color.TRANSPARENT,
                      outlineColor: Color.fromCssColorString("#00D47E").withAlpha(0.8),
                      outlineWidth: 2.5,
                      disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </Viewer>

        {/* Hover tooltip */}
        {tip && <HoverTip tip={tip} />}

        {/* Draw mode instruction */}
        {drawMode && (
          <div style={{
            position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
            background: "#091525F0", border: "1px solid #2986E8", borderRadius: 6,
            padding: "8px 18px", fontSize: 10, color: "#5aacf8",
            zIndex: 30, pointerEvents: "none", fontFamily: "'JetBrains Mono',monospace"
          }}>
            {!drawCorner ? "Click first corner of selection box" : "Click second corner to select wells"}
          </div>
        )}

        {/* Top stats bar */}
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          display: "flex", background: "#030912CC", backdropFilter: "blur(10px)",
          border: "1px solid #0b1c2c", borderRadius: 6, overflow: "hidden",
          zIndex: 10, boxShadow: "0 4px 20px #00000060",
          fontFamily: "'JetBrains Mono',monospace"
        }}>
          {[
            { l: "Wells",     v: String(filtered.length) },
            { l: "Producing", v: String(nProd) },
            { l: "Basins",    v: String(new Set(filtered.map(w => w.basin)).size) },
            { l: "Avg Oil",   v: filtered.length ? `${fmt(Math.round(totalOil / filtered.length))} bopd` : "—" },
            { l: "Tot Gas",   v: `${fmtK(totalGas)} mcfd` },
            { l: "Selected",  v: String(checkedApis.size) },
          ].map((s, i, a) => (
            <div key={i} style={{ padding: "6px 14px", textAlign: "center", borderRight: i < a.length - 1 ? "1px solid #0b1c2c" : "none" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: i === 5 && checkedApis.size > 0 ? "#00D47E" : "#4a9ae0" }}>{s.v}</div>
              <div style={{ fontSize: 7, color: "#1a4060", textTransform: "uppercase", letterSpacing: ".1em" }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Hint */}
        {!focusWell && !showCompare && !drawMode && (
          <div style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
            background: "#030912CC", backdropFilter: "blur(8px)",
            border: "1px solid #0b1c2c", borderRadius: 5,
            padding: "6px 16px", fontSize: 9, color: "#1a4060",
            zIndex: 10, pointerEvents: "none", fontFamily: "'JetBrains Mono',monospace"
          }}>
            Click marker → cross-section  ·  ☑ Checkboxes → multi-select  ·  ⬚ Box Select → draw area
          </div>
        )}

        {/* Section panel */}
        {showSection && focusWell && !showCompare && (
          <SectionPanel well={focusWell} onClose={closeSection} hiLayer={hiLayer} setHiLayer={setHiLayer} />
        )}

        {/* Compare panel */}
        {showCompare && checkedWells.length >= 2 && (
          <ComparePanel wells={checkedWells} onClose={() => setShowCompare(false)} />
        )}
      </div>
    </div>
  );
}