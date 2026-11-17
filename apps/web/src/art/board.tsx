/**
 * Original flat board art, drawn in board units (a hex has radius HEX_SIZE = 60).
 * Each terrain gets a few simple shapes around the centre, which the number token covers.
 * Everything here is decoration: it never takes pointer events (see `.art` in styles.css).
 */
import type { Point } from "../board/geometry";

const TERRAINS = [
  "forest",
  "pasture",
  "fields",
  "hills",
  "mountains",
  "desert",
  "sea",
  "gold",
  "fog",
];

/** One radial gradient per terrain (lighter in the middle), referenced as url(#tg-<terrain>). */
export function TerrainDefs() {
  return (
    <defs>
      {TERRAINS.map((t) => (
        <radialGradient key={t} id={`tg-${t}`} cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor={`var(--t-${t}-light, var(--t-${t}))`} />
          <stop offset="100%" stopColor={`var(--t-${t})`} />
        </radialGradient>
      ))}
      <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#000" floodOpacity="0.35" />
      </filter>
    </defs>
  );
}

/** Spots around the centre (outside the token), as offsets. */
const RING: Point[] = [
  [-30, -26],
  [0, -38],
  [30, -26],
  [-34, 14],
  [34, 14],
  [-14, 36],
  [16, 36],
];

function Pine({ at: [x, y], s = 1 }: { at: Point; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-1.5} y={6} width={3} height={5} fill="#5b3a1e" />
      <path d="M0 -12 L-8 0 H-4 L-9 7 H9 L4 0 H8 Z" fill="#1d5a2c" />
      <path d="M0 -12 L-8 0 H-4 L-9 7 H0 Z" fill="#000" opacity="0.15" />
    </g>
  );
}

function Sheep({ at: [x, y] }: { at: Point }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={0} rx={7} ry={5} fill="#f7f4ea" />
      <circle cx={-7} cy={-1.5} r={2.6} fill="#3a3a3a" />
      <rect x={-4} y={4} width={1.6} height={3} fill="#3a3a3a" />
      <rect x={2.5} y={4} width={1.6} height={3} fill="#3a3a3a" />
    </g>
  );
}

function Tuft({ at: [x, y] }: { at: Point }) {
  return (
    <path
      d={`M${x - 4} ${y + 3} L${x - 2} ${y - 3} M${x} ${y + 3} L${x} ${y - 4} M${x + 4} ${y + 3} L${x + 2} ${y - 3}`}
      stroke="#5f9a35"
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  );
}

function WheatRow({ y, from, to }: { y: number; from: number; to: number }) {
  const ears = [];
  for (let x = from; x <= to; x += 7) {
    ears.push(<ellipse key={x} cx={x} cy={y - 3} rx={1.8} ry={3.4} fill="#b8901f" />);
  }
  return (
    <g>
      <path d={`M${from - 3} ${y + 1} H${to + 3}`} stroke="#c9a12e" strokeWidth={1.4} />
      {ears}
    </g>
  );
}

function Mound({ at: [x, y] }: { at: Point }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-12 6 Q0 -10 12 6 Z" fill="#a9532b" />
      <rect x={-6} y={-1} width={6} height={3} rx={0.6} fill="#e19a6f" />
      <rect x={1} y={-1} width={6} height={3} rx={0.6} fill="#e19a6f" />
      <rect x={-2.5} y={2.6} width={6} height={3} rx={0.6} fill="#e19a6f" />
    </g>
  );
}

function Peak({ at: [x, y], s = 1 }: { at: Point; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-13 9 L0 -12 L13 9 Z" fill="#6c727c" />
      <path d="M0 -12 L13 9 H3 Z" fill="#000" opacity="0.18" />
      <path d="M0 -12 L-4.6 -4.5 L-1.5 -6 L1 -3.5 L4.4 -5.2 Z" fill="#f4f6f8" />
    </g>
  );
}

function Dune({ at: [x, y] }: { at: Point }) {
  return (
    <path
      d={`M${x - 14} ${y + 4} Q${x - 4} ${y - 6} ${x + 14} ${y + 4}`}
      stroke="#c9b27a"
      strokeWidth={2}
      fill="none"
      strokeLinecap="round"
    />
  );
}

function Wave({ at: [x, y] }: { at: Point }) {
  return (
    <path
      d={`M${x - 9} ${y} q4.5 -4 9 0 t9 0`}
      stroke="#ffffff"
      strokeOpacity={0.28}
      strokeWidth={1.6}
      fill="none"
      strokeLinecap="round"
    />
  );
}

/** A gold nugget: a faceted lump with a glint. */
function Nugget({ at: [x, y], s = 1 }: { at: Point; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-8 4 L-6 -4 L1 -7 L8 -2 L7 5 L-1 7 Z" fill="#d9a81e" />
      <path d="M1 -7 L8 -2 L7 5 L1 1 Z" fill="#000" opacity="0.15" />
      <path d="M-5 -2 L-2 -4" stroke="#fff6d0" strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

/** A small stream winding across a gold field. */
function Stream({ cx, cy }: { cx: number; cy: number }) {
  return (
    <path
      d={`M${cx - 44} ${cy + 22} q14 -10 26 -2 t26 0 t24 -6`}
      stroke="#7cc0e8"
      strokeWidth={3}
      fill="none"
      strokeLinecap="round"
      opacity={0.85}
    />
  );
}

/** The illustration for one hex, centred on (cx, cy). */
export function TerrainArt({ terrain, at: [cx, cy] }: { terrain: string; at: Point }) {
  const p = (i: number): Point => [cx + RING[i]![0], cy + RING[i]![1]];
  let body: React.ReactNode = null;
  switch (terrain) {
    case "forest":
      body = [0, 1, 2, 3, 4, 5, 6].map((i) => <Pine key={i} at={p(i)} s={i === 1 ? 1.15 : 1} />);
      break;
    case "pasture":
      body = (
        <>
          {[0, 2, 5, 6].map((i) => (
            <Tuft key={i} at={p(i)} />
          ))}
          <Sheep at={p(3)} />
          <Sheep at={p(4)} />
          <Sheep at={p(1)} />
        </>
      );
      break;
    case "fields":
      body = (
        <>
          <WheatRow y={cy - 30} from={cx - 18} to={cx + 18} />
          <WheatRow y={cy + 34} from={cx - 18} to={cx + 18} />
          <WheatRow y={cy + 2} from={cx - 42} to={cx - 26} />
          <WheatRow y={cy + 2} from={cx + 26} to={cx + 42} />
        </>
      );
      break;
    case "hills":
      body = [0, 2, 3, 4, 1].map((i) => <Mound key={i} at={p(i)} />);
      break;
    case "mountains":
      body = (
        <>
          <Peak at={p(1)} s={1.25} />
          <Peak at={p(3)} />
          <Peak at={p(4)} />
          <Peak at={p(5)} s={0.8} />
          <Peak at={p(6)} s={0.8} />
        </>
      );
      break;
    case "desert":
      body = (
        <>
          {[0, 2, 3, 4, 6].map((i) => (
            <Dune key={i} at={p(i)} />
          ))}
        </>
      );
      break;
    case "sea":
      body = [0, 4, 5].map((i) => <Wave key={i} at={p(i)} />);
      break;
    case "fog":
      // A face-down hex (spec 016): drifting mist and a question mark.
      body = (
        <>
          {[0, 2, 5].map((i) => (
            <path
              key={i}
              d={`M${p(i)[0] - 16} ${p(i)[1]} q8 -6 16 0 t16 0`}
              stroke="#ffffff"
              strokeOpacity={0.7}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
            />
          ))}
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fog-mark">
            ?
          </text>
        </>
      );
      break;
    case "gold":
      body = (
        <>
          <Stream cx={cx} cy={cy} />
          <Nugget at={p(0)} />
          <Nugget at={p(1)} s={1.2} />
          <Nugget at={p(2)} s={0.9} />
          <Nugget at={p(6)} s={0.8} />
        </>
      );
      break;
  }
  return <g className="art">{body}</g>;
}

function pips(token: number): number {
  return 6 - Math.abs(7 - token);
}

/** A number token: a cream disc with a shadow; 6 and 8 are red. */
export function Token({ token, at: [cx, cy] }: { token: number; at: Point }) {
  const n = pips(token);
  return (
    <g className={n === 5 ? "token hot" : "token"}>
      <circle cx={cx} cy={cy + 1.5} r={19} className="token-shadow" />
      <circle cx={cx} cy={cy} r={19} className="token-disc" />
      <circle cx={cx} cy={cy} r={16} className="token-ring" />
      <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle">
        {token}
      </text>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} className="pip" cx={cx + (i - (n - 1) / 2) * 4.5} cy={cy + 10} r={1.6} />
      ))}
    </g>
  );
}

/** A road: a dark outline, the seat colour, and a light top edge. */
export function Road({
  from: [x1, y1],
  to: [x2, y2],
  color,
}: {
  from: Point;
  to: Point;
  color: string;
}) {
  // Pull the ends in a little, so roads meet buildings instead of running under them.
  const k = 0.12;
  const a: Point = [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
  const b: Point = [x2 - (x2 - x1) * k, y2 - (y2 - y1) * k];
  return (
    <g className="road-piece">
      <line className="road-outline" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      <line className="road" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} />
      <line className="road-shine" x1={a[0]} y1={a[1] - 1.5} x2={b[0]} y2={b[1] - 1.5} />
    </g>
  );
}

/** A settlement (small house) or a city (a wider building with a tower). */
export function Building({ at: [x, y], color, city }: { at: Point; color: string; city: boolean }) {
  if (!city) {
    return (
      <g className="building" transform={`translate(${x} ${y}) scale(1.3)`}>
        <path d="M-10 9 V-1 L0 -11 L10 -1 V9 Z" fill={color} className="outline" />
        <path d="M0 -11 L10 -1 V9 H0 Z" fill="#000" opacity="0.18" />
        <path d="M-10 -1 L0 -11 L10 -1" fill="none" className="roofline" />
        <rect x={-3} y={2} width={5} height={7} fill="#0006" />
      </g>
    );
  }
  return (
    <g className="building" transform={`translate(${x} ${y}) scale(1.25)`}>
      <path
        d="M-15 11 V-2 H-6 V-10 L-1 -16 L4 -10 V-2 H15 V11 Z"
        fill={color}
        className="outline"
      />
      <path d="M4 -10 V-2 H15 V11 H4 Z" fill="#000" opacity="0.18" />
      <rect x={-12} y={2} width={4} height={4} fill="#fff8" />
      <rect x={8} y={2} width={4} height={4} fill="#fff6" />
      <rect x={-3} y={-6} width={4} height={5} fill="#fff8" />
      <rect x={-3} y={4} width={5} height={7} fill="#0006" />
    </g>
  );
}

/**
 * A ship on a sea edge: a hull in the seat colour with a white sail, turned to lie along the
 * edge. `angle` is the edge's direction in degrees.
 */
export function Ship({ at: [x, y], angle, color }: { at: Point; angle: number; color: string }) {
  // Keep the sail upright: flip the hull when the edge points left.
  const a = ((angle % 180) + 180) % 180;
  const tilt = a > 90 ? a - 180 : a;
  return (
    <g className="ship-piece" transform={`translate(${x} ${y}) rotate(${tilt}) scale(1.35)`}>
      <path d="M-15 2 H15 L10 9 H-10 Z" fill={color} className="outline" />
      <path d="M0 2 H15 L10 9 H0 Z" fill="#000" opacity="0.18" />
      <path d="M-1 1 V-14" stroke="#4a3520" strokeWidth={1.6} />
      <path d="M0 -14 L10 -1 H0 Z" fill="#f7f4ea" className="sail" />
      <path d="M-1.5 -12 L-9 -1 H-1.5 Z" fill="#e8e3d3" className="sail" />
    </g>
  );
}

/** The pirate: a dark ship with a black sail. Positioned by the caller. */
export function PirateShip() {
  return (
    <g className="pirate-figure">
      <ellipse cx={0} cy={13} rx={16} ry={3.5} fill="#000" opacity="0.3" />
      <path d="M-18 4 H18 L12 12 H-12 Z" className="pirate-hull" />
      <path d="M-1 3 V-18" stroke="#2b2118" strokeWidth={2} />
      <path d="M0 -18 L13 -2 H0 Z" className="pirate-sail" />
      <path d="M-2 -16 L-12 -2 H-2 Z" className="pirate-sail" />
      <circle cx={5} cy={-8} r={2} fill="#f2f2f2" />
    </g>
  );
}

/** The robber: a hooded figure with a ground shadow. Positioned by the caller. */
export function RobberFigure() {
  return (
    <g className="robber-figure">
      <ellipse cx={0} cy={15} rx={11} ry={3.5} fill="#000" opacity="0.35" />
      <path d="M-10 15 C-10 2 -7 -4 -5 -6 L5 -6 C7 -4 10 2 10 15 Z" className="robber-body" />
      <circle cx={0} cy={-11} r={7} className="robber-body" />
      <path d="M-4.5 -10 Q0 -6 4.5 -10" stroke="#fff6" strokeWidth={1.2} fill="none" />
    </g>
  );
}

/** A VP token lying on the water (spec 018): a red medallion with a gold star. */
export function VpTokenArt({ at: [x, y] }: { at: Point }) {
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 6.5 : 2.8;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <g className="marker vp-marker">
      <circle cx={x} cy={y} r={11} className="vp-medal" />
      <polygon points={star} className="vp-star" />
    </g>
  );
}

/** A face-down development card lying on the water (spec 018). */
export function BoardCardArt({ at: [x, y] }: { at: Point }) {
  return (
    <g className="marker card-marker" transform={`translate(${x} ${y}) rotate(-12)`}>
      <rect x={-8} y={-11} width={16} height={22} rx={2.5} className="card-back" />
      <rect x={-5} y={-8} width={10} height={16} rx={1.5} className="card-back-inner" />
    </g>
  );
}
