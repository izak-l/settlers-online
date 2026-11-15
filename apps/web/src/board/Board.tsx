import type { Action, ActionSpec, Piece } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import type { BuildMode, SeatInfo } from "../game/seats";
import {
  HEX_SIZE,
  edgeEndpoints,
  edgeMidpoint,
  graphFor,
  hexCenter,
  hexPolygon,
  vertexPoint,
  type Point,
} from "./geometry";

interface Props {
  snap: Snapshot;
  seats: SeatInfo[];
  mode: BuildMode;
  onAction(action: Action): void;
}

const MODE_ACTION: Record<Exclude<BuildMode, null>, ActionSpec["type"]> = {
  road: "BUILD_ROAD",
  settlement: "BUILD_SETTLEMENT",
  city: "BUILD_CITY",
};

/** Which legal actions to show as clickable targets right now. */
function targets(snap: Snapshot, mode: BuildMode): ActionSpec[] {
  const kind = snap.view.decisions.at(-1)?.kind;
  if (kind === "PLACE_SETTLEMENT" || kind === "PLACE_ROAD") {
    return snap.legal.filter((a) => a.type === "PLACE_SETTLEMENT" || a.type === "PLACE_ROAD");
  }
  if (kind === "MAIN" && mode) return snap.legal.filter((a) => a.type === MODE_ACTION[mode]);
  return [];
}

function pips(token: number): number {
  return 6 - Math.abs(7 - token);
}

const PORT_LABEL: Record<string, string> = {
  any3to1: "3:1",
  wood2to1: "2:1 wood",
  brick2to1: "2:1 brick",
  sheep2to1: "2:1 sheep",
  wheat2to1: "2:1 wheat",
  ore2to1: "2:1 ore",
};

function House({ at, color, city }: { at: Point; color: string; city: boolean }) {
  const [x, y] = at;
  const s = city ? 15 : 11;
  const d = city
    ? `M${x - s},${y + s * 0.7} V${y - s * 0.1} L${x - s * 0.45},${y - s * 0.7} L${x + s * 0.1},${y - s * 0.1} H${x + s} V${y + s * 0.7} Z`
    : `M${x - s},${y + s * 0.8} V${y - s * 0.1} L${x},${y - s} L${x + s},${y - s * 0.1} V${y + s * 0.8} Z`;
  return <path d={d} fill={color} stroke="var(--piece-outline)" strokeWidth={2} />;
}

export function Board({ snap, seats, mode, onAction }: Props) {
  const { view } = snap;
  const graph = graphFor(view);
  const colorOf = (owner?: string) => seats.find((s) => s.id === owner)?.color ?? "#888";
  const landKeys = new Set(
    view.map.hexes.filter((h) => h.terrain !== "sea").map((h) => `${h.q},${h.r}`),
  );

  // Fit the viewBox around every hex, sea included.
  const centers = view.map.hexes.map((h) => hexCenter(h.q, h.r));
  const pad = HEX_SIZE * 1.1;
  const minX = Math.min(...centers.map((c) => c[0])) - pad;
  const minY = Math.min(...centers.map((c) => c[1])) - pad;
  const width = Math.max(...centers.map((c) => c[0])) + pad - minX;
  const height = Math.max(...centers.map((c) => c[1])) + pad - minY;

  const pieces = Object.values(view.pieces);
  const at = <K extends "vertex" | "edge" | "hex">(p: Piece, k: K): string | undefined =>
    k in p.at ? (p.at as Record<K, string>)[k] : undefined;

  const shown = targets(snap, mode);

  /** Targets are buttons: clickable, focusable, and triggered by Enter or Space. */
  const activate = (a: ActionSpec, label: string) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onClick: () => onAction(a),
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onAction(a);
      }
    },
  });

  return (
    <svg
      className="board"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      role="img"
      aria-label="Game board"
    >
      {/* Hexes */}
      {view.map.hexes.map((h) => {
        const [cx, cy] = hexCenter(h.q, h.r);
        return (
          <g key={`${h.q},${h.r}`}>
            <polygon
              points={hexPolygon(h.q, h.r, HEX_SIZE, 1.5)}
              fill={`var(--t-${h.terrain}, #ccc)`}
              className={h.terrain === "sea" ? "hex sea" : "hex"}
            />
            {h.token !== undefined && (
              <g className={pips(h.token) === 5 ? "token hot" : "token"}>
                <circle cx={cx} cy={cy} r={19} />
                <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle">
                  {h.token}
                </text>
                {Array.from({ length: pips(h.token) }, (_, i) => (
                  <circle
                    key={i}
                    className="pip"
                    cx={cx + (i - (pips(h.token!) - 1) / 2) * 4.5}
                    cy={cy + 11}
                    r={1.6}
                  />
                ))}
              </g>
            )}
          </g>
        );
      })}

      {/* Ports, nudged out toward the sea */}
      {view.map.ports.map((port) => {
        const [mx, my] = edgeMidpoint(port.edgeId);
        const land = port.edgeId.split("|").find((k) => landKeys.has(k)) ?? "0,0";
        const [lq, lr] = land.split(",").map(Number);
        const [lx, ly] = hexCenter(lq!, lr!);
        const px = mx + (mx - lx) * 0.55;
        const py = my + (my - ly) * 0.55;
        return (
          <g key={port.edgeId} className="port">
            <line x1={mx} y1={my} x2={px} y2={py} />
            <rect x={px - 26} y={py - 10} width={52} height={20} rx={6} />
            <text x={px} y={py + 1} textAnchor="middle" dominantBaseline="middle">
              {PORT_LABEL[port.type] ?? port.type}
            </text>
          </g>
        );
      })}

      {/* Roads */}
      {pieces
        .filter((p) => p.type === "road")
        .map((p) => {
          const [[x1, y1], [x2, y2]] = edgeEndpoints(graph, at(p, "edge")!);
          return (
            <g key={p.id}>
              <line className="road-outline" x1={x1} y1={y1} x2={x2} y2={y2} />
              <line className="road" x1={x1} y1={y1} x2={x2} y2={y2} stroke={colorOf(p.owner)} />
            </g>
          );
        })}

      {/* Settlements and cities */}
      {pieces
        .filter((p) => p.type === "settlement" || p.type === "city")
        .map((p) => (
          <House
            key={p.id}
            at={vertexPoint(at(p, "vertex")!)}
            color={colorOf(p.owner)}
            city={p.type === "city"}
          />
        ))}

      {/* Robber */}
      {pieces
        .filter((p) => p.type === "robber")
        .map((p) => {
          const [q, r] = at(p, "hex")!.split(",").map(Number);
          const [cx, cy] = hexCenter(q!, r!);
          return <ellipse key={p.id} className="robber" cx={cx + 26} cy={cy - 18} rx={8} ry={13} />;
        })}

      {/* Clickable targets for legal moves */}
      {shown.map((a) => {
        if ("edge" in a) {
          const [[x1, y1], [x2, y2]] = edgeEndpoints(graph, a.edge);
          return (
            <line
              key={`${a.type}-${a.edge}`}
              className="target target-edge"
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              {...activate(a, "Place road here")}
            >
              <title>Place road here</title>
            </line>
          );
        }
        if ("vertex" in a) {
          const [x, y] = vertexPoint(a.vertex);
          return (
            <circle
              key={`${a.type}-${a.vertex}`}
              className="target target-vertex"
              cx={x}
              cy={y}
              r={11}
              {...activate(
                a,
                a.type === "BUILD_CITY" ? "Upgrade to city here" : "Place settlement here",
              )}
            >
              <title>{a.type === "BUILD_CITY" ? "Upgrade to city" : "Place settlement here"}</title>
            </circle>
          );
        }
        return null;
      })}
    </svg>
  );
}
