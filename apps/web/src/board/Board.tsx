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
import {
  BoardCardArt,
  Building,
  PirateShip,
  RobberFigure,
  Road,
  Ship,
  TerrainDefs,
  Token,
  VpTokenArt,
} from "../art/board";
import { TerrainFace } from "../art/TerrainFace";
import { useArtwork } from "../art/useArtwork";
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
  ship: "BUILD_SHIP",
  move: "MOVE_SHIP",
  harbor: "PLACE_HARBOR",
};

const OF_KIND: Record<string, ActionSpec["type"][]> = {
  PLACE_SETTLEMENT: ["PLACE_SETTLEMENT"],
  PLACE_ROAD: ["PLACE_ROAD", "PLACE_SHIP"],
  MOVE_ROBBER: ["MOVE_ROBBER", "MOVE_PIRATE"],
  PLACE_FREE_ROAD: ["PLACE_FREE_ROAD", "PLACE_FREE_SHIP"],
  PLACE_HARBOR: ["PLACE_HARBOR"],
};

/**
 * Which legal actions to show as clickable targets right now. Moving a ship takes two taps:
 * first one of your movable ships (`moveFrom` unset), then where it goes.
 */
function targets(snap: Snapshot, mode: BuildMode, moveFrom: string | null): ActionSpec[] {
  const kind = snap.view.decisions.at(-1)?.kind ?? "";
  // Setup and Road Crew: a coast edge may take a road or a ship, so the action bar's Road / Ship
  // switch decides which are shown (roads unless "ship" is picked, or no road is possible).
  if (kind === "PLACE_ROAD" || kind === "PLACE_FREE_ROAD") {
    const road = kind === "PLACE_ROAD" ? "PLACE_ROAD" : "PLACE_FREE_ROAD";
    const ship = kind === "PLACE_ROAD" ? "PLACE_SHIP" : "PLACE_FREE_SHIP";
    const roads = snap.legal.filter((a) => a.type === road);
    const ships = snap.legal.filter((a) => a.type === ship);
    return mode === "ship" || roads.length === 0 ? ships : roads;
  }
  if (OF_KIND[kind]) {
    // The pirate can also leave the board (hex null): that's a button, not a board target.
    return snap.legal.filter(
      (a) => OF_KIND[kind]!.includes(a.type) && !(a.type === "MOVE_PIRATE" && a.hex === null),
    );
  }
  if (kind !== "MAIN" || !mode) return [];
  if (mode === "move") {
    const moves = snap.legal.filter((a) => a.type === "MOVE_SHIP");
    if (moveFrom) return moves.filter((a) => a.from === moveFrom);
    // One target per movable ship: its own edge, as a "from" pick.
    const seen = new Set<string>();
    return moves.filter((a) => !seen.has(a.from) && !!seen.add(a.from));
  }
  return snap.legal.filter((a) => a.type === MODE_ACTION[mode]);
}

const EDGE_LABEL: Partial<Record<ActionSpec["type"], string>> = {
  PLACE_SHIP: "Place ship here",
  BUILD_SHIP: "Build ship here",
  PLACE_FREE_SHIP: "Place ship here",
  MOVE_SHIP: "Move the ship here",
  PLACE_HARBOR: "Place your harbor here",
};

/** A port type as words, e.g. "2 wheat for 1" or "3 of a kind for 1". */
function portLabel(type: string): string {
  const resource = type.endsWith("2to1") ? type.slice(0, -4) : null;
  return resource ? `2 ${resource} for 1` : "3 of a kind for 1";
}

/** A harbor sign: the rate, and the resource icon (or "?" for 3:1). Drawn at (px, py). */
function HarborSign({ type, px, py }: { type: string; px: number; py: number }) {
  const resource = type.endsWith("2to1") ? type.slice(0, -4) : null;
  return (
    <>
      <circle className="port-sign" cx={px} cy={py} r={17} />
      {resource ? (
        <g className={`port-icon res-${resource}`}>
          <svg x={px - 8} y={py - 15} width={16} height={16} viewBox="0 0 24 24">
            <Icon name={resource} />
          </svg>
        </g>
      ) : (
        <text className="port-any" x={px} y={py - 6} textAnchor="middle" dominantBaseline="middle">
          ?
        </text>
      )}
      <text className="port-rate" x={px} y={py + 8} textAnchor="middle" dominantBaseline="middle">
        {resource ? "2:1" : "3:1"}
      </text>
    </>
  );
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
 * large as possible at zoom 1 (it matters most on narrow screens). With ships (`wholeMap`) the
 * sea is part of play, so every hex inside the frame is shown.
 */
function fitBox(hexes: Snapshot["view"]["map"]["hexes"], wholeMap: boolean): Box {
  const centers = hexes
    .filter((h) => wholeMap || h.terrain !== "sea")
    .map((h) => hexCenter(h.q, h.r));
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
  const artwork = useArtwork();
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

  // With a sea graph (ships), the sea is playable: show all of it, with the frame around it.
  const seaInPlay = view.map.hexes.some(
    (h) => h.terrain === "sea" && graph.hexKeys.has(`${h.q},${h.r}`),
  );
  const fit = useMemo(() => fitBox(view.map.hexes, seaInPlay), [view.map.hexes, seaInPlay]);
  const vp = useViewport(fit, fitArea);
  const hit = hitRadius(vp.scale);

  const pieces = Object.values(view.pieces);
  // Keyed by id and type, so a settlement upgraded to a city (same id) pops in too.
  const pieceKey = (p: Piece) => `${p.id}:${p.type}`;
  const fresh = useFreshKeys(pieces.map(pieceKey));
  const at = <K extends "vertex" | "edge" | "hex">(p: Piece, k: K): string | undefined =>
    k in p.at ? (p.at as Record<K, string>)[k] : undefined;

  // Moving a ship: the ship picked first. Forgotten whenever the mode or the position changes.
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  useEffect(() => setMoveFrom(null), [mode, view]);
  const shown = targets(snap, mode, mode === "move" ? moveFrom : null);
  const locationPoint = (location: BuildLocation): Point =>
    location.kind === "edge" ? edgeMidpoint(location.id) : vertexPoint(location.id);
  const openLocation = (location: BuildLocation) => setSelected(`${location.kind}:${location.id}`);

  /** A target was picked: a build opens its map popup; a ship to move is remembered first. */
  const pick = (action: ActionSpec) => {
    if (action.type === "MOVE_SHIP" && moveFrom === null) return setMoveFrom(action.from);
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

  /** Region outlines (islands that earn a bonus): edges between a labelled area and anything else. */
  const regionOf = new Map<string, string>(
    view.map.hexes.flatMap((h): [string, string][] =>
      h.region && h.region !== "main" ? [[`${h.q},${h.r}`, h.region]] : [],
    ),
  );
  const regionEdges = regionOf.size
    ? [...graph.edges.values()].filter((e) => {
        const [a, b] = [
          regionOf.get(e.hexes[0]!),
          e.hexes[1] ? regionOf.get(e.hexes[1]) : undefined,
        ];
        return (a || b) && a !== b;
      })
    : [];
  const frameEdges = seaInPlay ? [...graph.edges.values()].filter((e) => e.hexes.length === 1) : [];

  /** Targets are buttons: clickable, focusable, and triggered by Enter or Space. */
  const activate = (a: ActionSpec, label: string, [x, y]: Point) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onClick: () => pick(a),
    // Keyboard users tabbing through targets: pan a target into view when zoomed in.
    // Only for keyboard focus: a mouse press also focuses, and must not move the board.
    onFocus: (ev: React.FocusEvent<Element>) => {
      if (ev.currentTarget.matches(":focus-visible")) vp.show({ x, y });
    },
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        pick(a);
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
            <TerrainFace key={`${h.q},${h.r}`} q={h.q} r={h.r} terrain="sea" artwork={artwork} />
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
                <TerrainFace q={h.q} r={h.r} terrain={h.terrain} artwork={artwork} />
                {h.token !== undefined && <Token token={h.token} at={c} />}
              </g>
            );
          })}

        {/* Islands that earn a bonus are outlined; the frame closes the map off. */}
        {regionEdges.map((e) => {
          const [[x1, y1], [x2, y2]] = edgeEndpoints(graph, e.id);
          return (
            <line key={`region-${e.id}`} className="region-edge" x1={x1} y1={y1} x2={x2} y2={y2} />
          );
        })}
        {frameEdges.map((e) => {
          const [[x1, y1], [x2, y2]] = edgeEndpoints(graph, e.id);
          return (
            <line key={`frame-${e.id}`} className="frame-edge" x1={x1} y1={y1} x2={x2} y2={y2} />
          );
        })}

        {/* Ports: a pier from the coast edge out to a sign with the rate and resource */}
        {/* With harbors switched off (spec 014) the map keeps its ports but they aren't drawn. */}
        {(view.options.features?.ports === false ? [] : view.map.ports).map((port) => {
          const [mx, my] = edgeMidpoint(port.edgeId);
          const land = port.edgeId.split("|").find((k) => landKeys.has(k)) ?? "0,0";
          const [lq, lr] = land.split(",").map(Number);
          const [lx, ly] = hexCenter(lq!, lr!);
          const px = mx + (mx - lx) * 0.6;
          const py = my + (my - ly) * 0.6;
          const [[ax, ay], [bx, by]] = edgeEndpoints(graph, port.edgeId);
          const label = `Port: ${portLabel(port.type)}`;
          return (
            <g key={port.edgeId} className="port" role="img" aria-label={label}>
              <title>{label}</title>
              <line className="pier" x1={ax} y1={ay} x2={px} y2={py} />
              <line className="pier" x1={bx} y1={by} x2={px} y2={py} />
              <HarborSign type={port.type} px={px} py={py} />
            </g>
          );
        })}

        {/* Villages (spec 019): a number on a corner, with the cloth still next to it */}
        {(view.map.markers ?? []).map((m) => {
          if (m.kind !== "village" || !("vertex" in m.at)) return null;
          const token = typeof m.data?.["token"] === "number" ? m.data["token"] : 0;
          const left = view.zones[`cloth-${m.id}`]?.contents?.["cloth"] ?? 0;
          const [x, y] = vertexPoint(m.at.vertex);
          const label = `Village on ${token}: ${left} cloth left`;
          return (
            <g
              key={m.id}
              className={left === 0 ? "village empty" : "village"}
              role="img"
              aria-label={label}
            >
              <title>{label}</title>
              <Token token={token} at={[x, y]} />
              <g className="cloth-badge">
                <rect x={x + 12} y={y - 22} width={22} height={15} rx={4} />
                <text x={x + 23} y={y - 14} textAnchor="middle" dominantBaseline="middle">
                  {left}
                </text>
              </g>
            </g>
          );
        })}

        {/* Things lying on the water (spec 018): taken by the first ship to reach their edge */}
        {(view.map.markers ?? []).map((m) => {
          if (!("edge" in m.at)) return null;
          const mid = edgeMidpoint(m.at.edge);
          const port = typeof m.data?.["port"] === "string" ? m.data["port"] : "any3to1";
          const label =
            m.kind === "vp-token"
              ? "Victory point token: the first ship here takes it"
              : m.kind === "dev-card"
                ? "Face-down development card: the first ship here takes it"
                : `Harbor (${portLabel(port)}): the first ship here takes it`;
          return (
            <g key={m.id} role="img" aria-label={label}>
              <title>{label}</title>
              {m.kind === "vp-token" && <VpTokenArt at={mid} />}
              {m.kind === "dev-card" && <BoardCardArt at={mid} />}
              {m.kind === "harbor" && (
                <g className="marker harbor-marker">
                  <HarborSign type={port} px={mid[0]} py={mid[1]} />
                </g>
              )}
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

        {/* Ships, along their edge; a ship picked to move is highlighted */}
        {pieces
          .filter((p) => p.type === "ship")
          .map((p) => {
            const edge = at(p, "edge")!;
            const [[x1, y1], [x2, y2]] = edgeEndpoints(graph, edge);
            const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
            const cls = ["piece", fresh.has(pieceKey(p)) && "fresh", moveFrom === edge && "moving"]
              .filter(Boolean)
              .join(" ");
            return (
              <g key={p.id} className={cls}>
                <Ship at={edgeMidpoint(edge)} angle={angle} color={colorOf(p.owner)} />
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

        {/* Pirate */}
        {pieces
          .filter((p) => p.type === "pirate")
          .map((p) => {
            const [q, r] = at(p, "hex")!.split(",").map(Number);
            const [cx, cy] = hexCenter(q!, r!);
            return (
              <g key={p.id} className="pirate" style={{ transform: `translate(${cx}px, ${cy}px)` }}>
                <PirateShip />
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
          // Moving a ship: first tap one of your ships (its own edge), then a free edge.
          const edgeOf =
            "edge" in a ? a.edge : a.type === "MOVE_SHIP" ? (moveFrom ? a.to : a.from) : null;
          if (edgeOf) {
            const [[x1, y1], [x2, y2]] = edgeEndpoints(graph, edgeOf);
            const isShip = a.type.includes("SHIP");
            const label =
              a.type === "MOVE_SHIP" && !moveFrom
                ? "Move this ship"
                : (EDGE_LABEL[a.type] ?? "Place road here");
            return (
              <g
                key={`${a.type}-${edgeOf}-${a.type === "MOVE_SHIP" ? a.from : ""}`}
                className={isShip ? "target ship-target" : "target"}
                {...activate(a, label, edgeMidpoint(edgeOf))}
              >
                <title>{label}</title>
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
          if ((a.type === "MOVE_ROBBER" || a.type === "MOVE_PIRATE") && a.hex) {
            const [q, r] = a.hex.split(",").map(Number);
            const [x, y] = hexCenter(q!, r!);
            const label =
              a.type === "MOVE_PIRATE" ? "Move the pirate here" : "Move the robber here";
            return (
              <circle
                key={`${a.type}-${a.hex}`}
                className={
                  a.type === "MOVE_PIRATE" ? "target target-hex pirate-target" : "target target-hex"
                }
                cx={x}
                cy={y}
                r={24}
                {...activate(a, label, [x, y])}
              >
                <title>{label}</title>
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
