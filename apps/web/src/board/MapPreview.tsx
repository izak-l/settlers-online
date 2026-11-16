import type { MapDef } from "@settlers/maps";
import { TerrainArt, TerrainDefs, Token } from "../art/board";
import { HEX_SIZE, edgeMidpoint, hexCenter, hexPolygon } from "./geometry";
import { previewTiles } from "./mapTiles";

/**
 * A small, static picture of an unresolved map: fixed tiles as they are, random land as a
 * neutral tile with "?", random tokens as "?". Ports placed at random aren't drawn.
 */
export function MapPreview({ def, label }: { def: MapDef; label?: string }) {
  const tiles = previewTiles(def);
  if (tiles.length === 0) return <svg className="map-preview" viewBox="0 0 1 1" aria-hidden />;
  const centers = tiles.map((t) => hexCenter(t.q, t.r));
  const xs = centers.map((c) => c[0]);
  const ys = centers.map((c) => c[1]);
  const pad = HEX_SIZE * 1.05;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  const w = Math.max(...xs) + pad - x;
  const h = Math.max(...ys) + pad - y;
  const fixedPorts = (def.ports ?? []).filter((p) => p.edge !== "auto");

  return (
    <svg
      className="map-preview"
      viewBox={`${x} ${y} ${w} ${h}`}
      role="img"
      aria-label={label ?? `Preview of ${def.name ?? def.id}`}
    >
      <TerrainDefs />
      {tiles.map((t) => {
        const c = hexCenter(t.q, t.r);
        const key = `${t.q},${t.r}`;
        if (t.kind === "sea") {
          return (
            <polygon key={key} points={hexPolygon(t.q, t.r, HEX_SIZE, 1)} fill="url(#tg-sea)" />
          );
        }
        const token = t.token;
        return (
          <g key={key}>
            <polygon
              points={hexPolygon(t.q, t.r, HEX_SIZE, 1.5)}
              className={t.kind === "random" ? "hex random" : "hex"}
              fill={t.kind === "random" ? "var(--t-random)" : `url(#tg-${t.terrain})`}
            />
            {t.kind === "fixed" && <TerrainArt terrain={t.terrain} at={c} />}
            {typeof token === "number" && <Token token={token} at={c} />}
            {token === "random" && (
              <text
                x={c[0]}
                y={c[1]}
                className="unknown"
                textAnchor="middle"
                dominantBaseline="central"
              >
                ?
              </text>
            )}
          </g>
        );
      })}
      {fixedPorts.map((p) => {
        const [mx, my] = edgeMidpoint(p.edge);
        return <circle key={p.edge} cx={mx} cy={my} r={12} className="port-sign" />;
      })}
    </svg>
  );
}
