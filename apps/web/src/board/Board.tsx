import { useEffect, useMemo, useRef, useState } from "react";
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
import { Icon } from "../art/icons";
import { Building, RobberFigure, Road, TerrainArt, TerrainDefs, Token } from "../art/board";
import { BuildPopover } from "./BuildPopover";
import { buildLocations, type BuildLocation } from "./buildLocations";
import { BoardControls } from "./BoardControls";
import { useViewport } from "./useViewport";
import { hitRadius, type Box } from "./viewport";

interface Props {
  fitArea?: HTMLElement | null;
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

export function Board({ snap, seats, mode, onAction, fitArea }: Props) {
  const { view } = snap;
  const [selected, setSelected] = useState<string | null>(null);
  const locationRefs = useRef(new Map<string, SVGGElement>());
  const locations = buildLocations(snap.builds ?? []);
  const currentLocation = locations.find(
    (location) => `${location.kind}:${location.id}` === selected,
  );
  const top = view.decisions.at(-1);
  const decisionKey = `${snap.seat}|${view.turn.number}|${top?.kind}|${top?.pendingFrom.join(",")}`;
  useEffect(() => setSelected(null), [decisionKey, mode]);
  const dismissBuild = (restoreFocus = false) => {
    if (restoreFocus && selected)
      locationRefs.current.get(selected)?.focus({ preventScroll: true });
    setSelected(null);
  };
  useEffect(() => {
    if (!selected) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-board-ui], .build-location")) setSelected(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissBuild(true);
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [selected]);
  const graph = graphFor(view);
  const colorOf = (owner?: string) => seats.find((s) => s.id === owner)?.color ?? "#888";
  const landKeys = new Set(
    view.map.hexes.filter((h) => h.terrain !== "sea").map((h) => `${h.q},${h.r}`),
  );

  const fit = useMemo(() => fitBox(view.map.hexes), [view.map.hexes]);
  const vp = useViewport(fit, fitArea);
  const hit = hitRadius(vp.scale);

  const pieces = Object.values(view.pieces);
  // Keyed by id and type, so a settlement upgraded to a city (same id) pops in too.
  const pieceKey = (p: Piece) => `${p.id}:${p.type}`;
  const fresh = useFreshKeys(pieces.map(pieceKey));
  const at = <K extends "vertex" | "edge" | "hex">(p: Piece, k: K): string | undefined =>
    k in p.at ? (p.at as Record<K, string>)[k] : undefined;

  const shown = targets(snap, mode);
  const locationPoint = (location: BuildLocation): Point =>
    location.kind === "edge" ? edgeMidpoint(location.id) : vertexPoint(location.id);
  const openLocation = (location: BuildLocation) => setSelected(`${location.kind}:${location.id}`);

  const activateAction = (action: ActionSpec) => {
    const location = locations.find((location) =>
      location.options.some(
        (option) =>
          option.action.type === action.type &&
          ("edge" in action
            ? location.id === action.edge
            : "vertex" in action && location.id === action.vertex),
      ),
    );
    if (location) openLocation(location);
    else onAction(action);
  };

  /** Targets are buttons: clickable, focusable, and triggered by Enter or Space. */
  const activate = (a: ActionSpec, label: string, [x, y]: Point) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onClick: () => activateAction(a),
    onFocus: (ev: React.FocusEvent<Element>) => {
      if (ev.currentTarget.matches(":focus-visible")) vp.show({ x, y });
    },
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        activateAction(a);
      }
    },
  });

  return (
    <div
      className="board-viewport"
      ref={vp.ref}
      style={
        {
          touchAction: "none",
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
        <TerrainDefs />

        {/* Sea hexes, then a sandy rim under the land so the coast reads as one shape */}
        {view.map.hexes
          .filter((h) => h.terrain === "sea")
          .map((h) => (
            <g key={`${h.q},${h.r}`}>
              <polygon
                points={hexPolygon(h.q, h.r, HEX_SIZE, 1)}
                fill="url(#tg-sea)"
                className="hex sea"
              />
              <TerrainArt terrain="sea" at={hexCenter(h.q, h.r)} />
            </g>
          ))}
        {view.map.hexes
          .filter((h) => h.terrain !== "sea")
          .map((h) => (
            <polygon
              key={`rim-${h.q},${h.r}`}
              points={hexPolygon(h.q, h.r, HEX_SIZE, -7)}
              className="coast"
            />
          ))}

        {/* Land */}
        {view.map.hexes
          .filter((h) => h.terrain !== "sea")
          .map((h) => {
            const c = hexCenter(h.q, h.r);
            return (
              <g key={`${h.q},${h.r}`}>
                <polygon
                  points={hexPolygon(h.q, h.r, HEX_SIZE, 1.5)}
                  fill={`url(#tg-${h.terrain})`}
                  className="hex"
                />
                <TerrainArt terrain={h.terrain} at={c} />
                {h.token !== undefined && <Token token={h.token} at={c} />}
              </g>
            );
          })}

        {/* Ports: a pier from the coast edge out to a sign with the rate and resource */}
        {view.map.ports.map((port) => {
          const [mx, my] = edgeMidpoint(port.edgeId);
          const land = port.edgeId.split("|").find((k) => landKeys.has(k)) ?? "0,0";
          const [lq, lr] = land.split(",").map(Number);
          const [lx, ly] = hexCenter(lq!, lr!);
          const px = mx + (mx - lx) * 0.6;
          const py = my + (my - ly) * 0.6;
          const [[ax, ay], [bx, by]] = edgeEndpoints(graph, port.edgeId);
          const resource = port.type.endsWith("2to1") ? port.type.slice(0, -4) : null;
          const rate = resource ? "2:1" : "3:1";
          const label = resource ? `Port: 2 ${resource} for 1` : "Port: 3 of a kind for 1";
          return (
            <g key={port.edgeId} className="port" role="img" aria-label={label}>
              <title>{label}</title>
              <line className="pier" x1={ax} y1={ay} x2={px} y2={py} />
              <line className="pier" x1={bx} y1={by} x2={px} y2={py} />
              <circle className="port-sign" cx={px} cy={py} r={17} />
              {resource ? (
                <g className={`port-icon res-${resource}`}>
                  <svg x={px - 8} y={py - 15} width={16} height={16} viewBox="0 0 24 24">
                    <Icon name={resource} />
                  </svg>
                </g>
              ) : (
                <text
                  className="port-any"
                  x={px}
                  y={py - 6}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  ?
                </text>
              )}
              <text
                className="port-rate"
                x={px}
                y={py + 8}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {rate}
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
                <Road from={[x1, y1]} to={[x2, y2]} color={colorOf(p.owner)} />
              </g>
            );
          })}

        {/* Settlements and cities */}
        {pieces
          .filter((p) => p.type === "settlement" || p.type === "city")
          .map((p) => (
            <g key={p.id} className={fresh.has(pieceKey(p)) ? "piece fresh" : "piece"}>
              <Building
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
              <g
                key={p.id}
                className="robber"
                style={{ transform: `translate(${cx + 28}px, ${cy - 14}px)` }}
              >
                <RobberFigure />
              </g>
            );
          })}

        {/* Only engine-approved locations are interactive; costs may still be unaffordable. */}
        {locations.map((location) => {
          const key = `${location.kind}:${location.id}`;
          const [x, y] = locationPoint(location);
          const edge = location.kind === "edge" ? edgeEndpoints(graph, location.id) : null;
          return (
            <g
              key={key}
              ref={(el) => {
                if (el) locationRefs.current.set(key, el);
                else locationRefs.current.delete(key);
              }}
              data-location={key}
              className={`build-location ${selected === key ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={
                location.kind === "edge" ? "Inspect edge builds" : "Inspect corner builds"
              }
              aria-haspopup="dialog"
              aria-expanded={selected === key}
              onClick={() => openLocation(location)}
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) vp.show({ x, y });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openLocation(location);
                }
              }}
            >
              {edge ? (
                <>
                  <line
                    className="hit"
                    x1={edge[0][0]}
                    y1={edge[0][1]}
                    x2={edge[1][0]}
                    y2={edge[1][1]}
                    style={{ strokeWidth: hit * 2 }}
                  />
                  <line
                    className="build-marker"
                    x1={edge[0][0]}
                    y1={edge[0][1]}
                    x2={edge[1][0]}
                    y2={edge[1][1]}
                  />
                </>
              ) : (
                <>
                  <circle className="hit" cx={x} cy={y} r={hit} />
                  <circle className="build-marker" cx={x} cy={y} r={11} />
                </>
              )}
            </g>
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
      {currentLocation && (
        <BuildPopover
          key={selected}
          options={currentLocation.options}
          at={vp.screenPoint({
            x: locationPoint(currentLocation)[0],
            y: locationPoint(currentLocation)[1],
          })}
          frame={vp.frame}
          onClose={dismissBuild}
          onBuild={(action) => {
            setSelected(null);
            onAction(action);
          }}
        />
      )}
      <BoardControls vp={vp} />
    </div>
  );
}
