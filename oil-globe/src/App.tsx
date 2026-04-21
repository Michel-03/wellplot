import { Viewer, Entity } from "resium";
import * as Cesium from "cesium";
import { Cartesian3 } from "cesium";
import wells from "./data/wells.json";
import "cesium/Build/Cesium/Widgets/widgets.css";

// ✅ FIX: safe function
function getColor(layerName) {
  if (layerName === "Surface") return Cesium.Color.BROWN.withAlpha(0.4);
  if (layerName === "Water") return Cesium.Color.CYAN.withAlpha(0.4);
  if (layerName === "Reservoir") return Cesium.Color.ORANGE.withAlpha(0.6);
  if (layerName === "Basement") return Cesium.Color.GRAY.withAlpha(0.5);

  return Cesium.Color.WHITE.withAlpha(0.3);
}

function App() {
  const scale = 0.02;   // 🔥 smaller scale = better separation
  const radius = 50;    // 🔥 VERY THIN (like pipe)

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <Viewer full>
        {wells.map((well) => (
          <div key={well.id}>
            
            {/* WELL POINT */}
            <Entity
              name={well.name}
              position={Cartesian3.fromDegrees(well.lon, well.lat)}
              point={{
                pixelSize: 6,
                color: Cesium.Color.YELLOW,
              }}
            />

            {/* LAYERS (VERTICAL STACK) */}
            {well.layers.map((layer, index) => {
              const thickness =
                (layer.depthBottom - layer.depthTop) * scale;

              const centerHeight =
                -((layer.depthTop + layer.depthBottom) / 2) * scale;

              return (
                <Entity
                  key={index}
                  name={layer.name}
                  position={Cartesian3.fromDegrees(
                    well.lon,
                    well.lat,
                    centerHeight
                  )}
                  cylinder={{
                    length: thickness,
                    topRadius: radius,
                    bottomRadius: radius,
                    material: getColor(layer.name),
                  }}
                  description={`
                    <h3>${layer.name}</h3>
                    Owner: ${layer.owner}<br/>
                    Status: ${layer.status}<br/>
                    Depth: ${layer.depthTop}m - ${layer.depthBottom}m
                  `}
                />
              );
            })}
          </div>
        ))}
      </Viewer>
    </div>
  );
}

export default App;