import React from "react";
import { seedFromString, buildGraph, hexKey } from "@settlers/engine";
import { generateMap, BASE_4P } from "@settlers/maps";

function hexCenter(q: number, r: number, size: number): [number, number] {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * (3 / 2) * r;
  return [x, y];
}

function hexCorners(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

const TERRAIN_COLORS: Record<string, string> = {
  forest: "#2d6a2d",
  pasture: "#7ec850",
  fields: "#e8c84a",
  hills: "#c05a2a",
  mountains: "#888",
  desert: "#e0d0a0",
  sea: "#5b9bd5",
};

const SIZE = 50;
const PADDING = 80;

export function BoardPreview({ seed }: { seed: string }) {
  const { map } = generateMap(BASE_4P, seedFromString(seed));
  const landHexes = map.hexes.filter((h) => h.terrain !== "sea");
  const graph = buildGraph(landHexes);

  const centers = map.hexes.map((h) => ({ ...h, center: hexCenter(h.q, h.r, SIZE) }));
  const xs = centers.map((h) => h.center[0]);
  const ys = centers.map((h) => h.center[1]);
  const minX = Math.min(...xs) - PADDING;
  const minY = Math.min(...ys) - PADDING;
  const width = Math.max(...xs) + PADDING - minX;
  const height = Math.max(...ys) + PADDING - minY;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      style={{ background: "#5b9bd5" }}
    >
      {centers.map((h) => {
        const [cx, cy] = h.center;
        const color = TERRAIN_COLORS[h.terrain] ?? "#ccc";
        const hk = hexKey(h);
        // Suppress unused warning — vertex IDs used in M3 for hit targets
        void graph.hexVertices.get(hk);
        return (
          <g key={hk}>
            <polygon
              points={hexCorners(cx, cy, SIZE - 2)}
              fill={color}
              stroke="#fff"
              strokeWidth={1}
            />
            {h.token !== undefined && (
              <>
                <circle cx={cx} cy={cy} r={18} fill="#fff" opacity={0.85} />
                <text
                  x={cx}
                  y={cy + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={14}
                  fontWeight="bold"
                  fill={h.token === 6 || h.token === 8 ? "#c0392b" : "#222"}
                >
                  {h.token}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
