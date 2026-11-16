import { useMemo, useRef } from "react";
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
import { BoardControls } from "./BoardControls";
import { useViewport } from "./useViewport";
import { hitRadius, type Box } from "./viewport";

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
  if (kind === "MOVE_ROBBER") return snap.legal.filter((a) => a.type === "MOVE_ROBBER");
  if (kind === "PLACE_FREE_ROAD") return snap.legal.filter((a) => a.type === "PLACE_FREE_ROAD");
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

const FRESH_MS = 700;

/**
 * Keys that appeared in the last moment, for the "pop in" animation. Nothing counts as fresh on
 * the first render, so joining a game mid-way doesn't animate every piece. Kept for FRESH_MS so
 * a quick re-render doesn't cut the animation short.
 */
function useFreshKeys(keys: string[]): Set<string> {
  const firstSeen = useRef<Map<string, number> | null>(null);
  const now = Date.now();
  if (!firstSeen.current) firstSeen.current = new Map(keys.map((k) => [k, 0]));
  for (const k of keys) if (!firstSeen.current.has(k)) firstSeen.current.set(k, now);
  return new Set(keys.filter((k) => now - firstSeen.current!.get(k)! < FRESH_MS));
}

/**
 * The land plus enough sea for the port labels; the outer sea is cropped, so the land is as
 * large as possible at zoom 1 (it matters most on narrow screens).
 */
function fitBox(hexes: Snapshot["view"]["map"]["hexes"]): Box {
  const centers = hexes.filter((h) => h.terrain !== "sea").map((h) => hexCenter(h.q, h.r));
  const padX = HEX_SIZE * 1.85;
  const padY = HEX_SIZE * 1.6;
  const x = Math.min(...centers.map((c) => c[0])) - padX;
  const y = Math.min(...centers.map((c) => c[1])) - padY;
  return {
    x,
    y,
    w: Math.max(...centers.map((c) => c[0])) + padX - x,
    h: Math.max(...centers.map((c) => c[1])) + padY - y,
  };
}

export function Board({ snap, seats, mode, onAction }: Props) {
  const { view } = snap;
  const graph = graphFor(view);
  const colorOf = (owner?: string) => seats.find((s) => s.id === owner)?.color ?? "#888";
  const landKeys = new Set(
    view.map.hexes.filter((h) => h.terrain !== "sea").map((h) => `${h.q},${h.r}`),
  );

  const fit = useMemo(() => fitBox(view.map.hexes), [view.map.hexes]);
  const vp = useViewport(fit);
  const hit = hitRadius(vp.scale);

  const pieces = Object.values(view.pieces);
  // Keyed by id and type, so a settlement upgraded to a city (same id) pops in too.
  const pieceKey = (p: Piece) => `${p.id}:${p.type}`;
  const fresh = useFreshKeys(pieces.map(pieceKey));
  const at = <K extends "vertex" | "edge" | "hex">(p: Piece, k: K): string | undefined =>
    k in p.at ? (p.at as Record<K, string>)[k] : undefined;

  const shown = targets(snap, mode);

  /** Targets are buttons: clickable, focusable, and triggered by Enter or Space. */
  const activate = (a: ActionSpec, label: string, [x, y]: Point) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onClick: () => onAction(a),
    // Keyboard users tabbing through targets: pan a target into view when zoomed in.
    // Only for keyboard focus: a mouse press also focuses, and must not move the board.
    onFocus: (ev: React.FocusEvent<Element>) => {
      if (ev.currentTarget.matches(":focus-visible")) vp.show({ x, y });
    },
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onAction(a);
      }
    },
  });

  return (
    <div
      className="board-viewport"
      ref={vp.ref}
      style={
        {
          touchAction: vp.zoom > 1 ? "none" : "pan-y",
          "--board-aspect": fit.w / fit.h,
        } as React.CSSProperties
      }
    >
      <svg
        className="board"
        viewBox={vp.viewBox}
        preserveAspectRatio="xMidYMid meet"
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
              <g key={p.id} className={fresh.has(pieceKey(p)) ? "piece fresh" : "piece"}>
                <line className="road-outline" x1={x1} y1={y1} x2={x2} y2={y2} />
                <line className="road" x1={x1} y1={y1} x2={x2} y2={y2} stroke={colorOf(p.owner)} />
              </g>
            );
          })}

        {/* Settlements and cities */}
        {pieces
          .filter((p) => p.type === "settlement" || p.type === "city")
          .map((p) => (
            <g key={p.id} className={fresh.has(pieceKey(p)) ? "piece fresh" : "piece"}>
              <House
                key={p.type}
                at={vertexPoint(at(p, "vertex")!)}
                color={colorOf(p.owner)}
                city={p.type === "city"}
              />
            </g>
          ))}

        {/* Robber */}
        {pieces
          .filter((p) => p.type === "robber")
          .map((p) => {
            const [q, r] = at(p, "hex")!.split(",").map(Number);
            const [cx, cy] = hexCenter(q!, r!);
            // Positioned by a CSS transform, so moving it animates (see .robber in styles.css).
            return (
              <ellipse
                key={p.id}
                className="robber"
                rx={8}
                ry={13}
                style={{ transform: `translate(${cx + 26}px, ${cy - 18}px)` }}
              />
            );
          })}

        {/* Clickable targets for legal moves */}
        {shown.map((a) => {
          if ("edge" in a) {
            const [[x1, y1], [x2, y2]] = edgeEndpoints(graph, a.edge);
            return (
              <g
                key={`${a.type}-${a.edge}`}
                className="target"
                {...activate(a, "Place road here", edgeMidpoint(a.edge))}
              >
                <title>Place road here</title>
                {/* A wide invisible stroke makes the tap area comfortable on touch screens. */}
                <line
                  className="hit"
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  style={{ strokeWidth: hit * 2 }}
                />
                <line className="target-edge" x1={x1} y1={y1} x2={x2} y2={y2} />
              </g>
            );
          }
          if (a.type === "MOVE_ROBBER") {
            const [q, r] = a.hex.split(",").map(Number);
            const [x, y] = hexCenter(q!, r!);
            return (
              <circle
                key={`robber-${a.hex}`}
                className="target target-hex"
                cx={x}
                cy={y}
                r={24}
                {...activate(a, "Move the robber here", [x, y])}
              >
                <title>Move the robber here</title>
              </circle>
            );
          }
          if ("vertex" in a) {
            const [x, y] = vertexPoint(a.vertex);
            const label =
              a.type === "BUILD_CITY" ? "Upgrade to city here" : "Place settlement here";
            return (
              <g key={`${a.type}-${a.vertex}`} className="target" {...activate(a, label, [x, y])}>
                <title>{label}</title>
                <circle className="hit" cx={x} cy={y} r={hit} />
                <circle className="target-vertex" cx={x} cy={y} r={11} />
              </g>
            );
          }
          return null;
        })}
      </svg>
      <BoardControls vp={vp} />
    </div>
  );
}
