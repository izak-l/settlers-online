/**
 * Original flat icons, drawn on a 24×24 grid. Shared by cards, costs, the log and (M7c) the board.
 * Colours come from `currentColor` plus a few fixed tints, so they work on any card background.
 */

const PATHS: Record<string, React.ReactNode> = {
  road: <path d="M4 19 L17 3 L22 7 L9 23 Z" fill="currentColor" />,
  settlement: <path d="M3 11 L12 3 L21 11 V22 H14 V15 H10 V22 H3 Z" fill="currentColor" />,
  city: <path d="M2 9 L7 4 L12 9 V13 L17 8 L22 13 V22 H2 Z" fill="currentColor" />,
  ship: (
    <>
      <path d="M3 17 H22 L18 22 H7 Z M12 2 V15 H3 Z M14 4 L21 15 H14 Z" fill="currentColor" />
    </>
  ),
  wood: (
    <>
      <path d="M12 2 L5 11 h3 L4 16 h6 v6 h4 v-6 h6 L16 11 h3 Z" fill="currentColor" />
    </>
  ),
  brick: (
    <>
      <rect x="2" y="5" width="9" height="5" rx="1" fill="currentColor" />
      <rect x="13" y="5" width="9" height="5" rx="1" fill="currentColor" />
      <rect x="6.5" y="12" width="11" height="5" rx="1" fill="currentColor" />
      <rect x="2" y="19" width="9" height="3" rx="1" fill="currentColor" opacity="0.75" />
      <rect x="13" y="19" width="9" height="3" rx="1" fill="currentColor" opacity="0.75" />
    </>
  ),
  sheep: (
    <>
      <path
        d="M7 9 a3 3 0 0 1 5 -2 a3 3 0 0 1 5 1 a3 3 0 0 1 2 5 a3 3 0 0 1 -3 4 h-8 a3 3 0 0 1 -3 -4 a3 3 0 0 1 2 -4 Z"
        fill="currentColor"
      />
      <ellipse cx="4.5" cy="11" rx="2.5" ry="2" fill="currentColor" opacity="0.7" />
      <rect x="8" y="17" width="2" height="4" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="14" y="17" width="2" height="4" rx="1" fill="currentColor" opacity="0.7" />
    </>
  ),
  wheat: (
    <>
      <path d="M12 22 V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} fill="currentColor">
          <ellipse
            cx="9.5"
            cy={9 + i * 3.2}
            rx="2.4"
            ry="1.3"
            transform={`rotate(-35 9.5 ${9 + i * 3.2})`}
          />
          <ellipse
            cx="14.5"
            cy={9 + i * 3.2}
            rx="2.4"
            ry="1.3"
            transform={`rotate(35 14.5 ${9 + i * 3.2})`}
          />
        </g>
      ))}
      <ellipse cx="12" cy="5" rx="1.4" ry="2.6" fill="currentColor" />
    </>
  ),
  ore: (
    <>
      <path d="M3 20 L8 9 L12 13 L15 6 L21 20 Z" fill="currentColor" />
      <path d="M15 6 L13.5 11 L17 10 Z" fill="currentColor" opacity="0.55" />
      <path d="M8 9 L7 14 L10 12 Z" fill="currentColor" opacity="0.55" />
    </>
  ),
  knight: (
    <path
      d="M12 2 L20 5 V11 C20 16.5 16.5 20 12 22 C7.5 20 4 16.5 4 11 V5 Z M12 6 V18 M7 11 H17"
      fill="currentColor"
      stroke="var(--icon-cut, #0005)"
      strokeWidth="1.4"
    />
  ),
  victoryPoint: (
    <path
      d="M12 2 L14.9 8.6 L22 9.3 L16.6 14 L18.2 21 L12 17.3 L5.8 21 L7.4 14 L2 9.3 L9.1 8.6 Z"
      fill="currentColor"
    />
  ),
  roadBuilding: (
    <>
      <path
        d="M9 2 L3 22 M15 2 L21 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 4 V7 M12 10 V14 M12 17 V21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  yearOfPlenty: (
    <>
      <circle cx="8" cy="15" r="5" fill="currentColor" />
      <circle cx="16" cy="9" r="5" fill="currentColor" opacity="0.75" />
      <path d="M16 6.5 V11.5 M13.5 9 H18.5" stroke="var(--icon-cut, #0005)" strokeWidth="1.5" />
    </>
  ),
  monopoly: (
    <path
      d="M3 18 L4 7 L9 12 L12 4 L15 12 L20 7 L21 18 Z M3 20 H21"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
    />
  ),
  palette: (
    <>
      <path
        d="M12 3 C6 3 3 7 3 12 S7 21 12 21 H14 A2 2 0 0 0 15 17.3 A2 2 0 0 1 16 14 H18 C23 14 22 3 12 3 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="7" cy="11" r="1.3" fill="currentColor" />
      <circle cx="10" cy="7" r="1.3" fill="currentColor" />
      <circle cx="15" cy="7" r="1.3" fill="currentColor" />
      <circle cx="18" cy="10" r="1.3" fill="currentColor" />
    </>
  ),
  // An original eight-toothed cog (spec 231): flat-topped teeth, symmetric about both axes,
  // one tooth straight up. Generated: teeth every 45°, 16° wide at the tip, 26° at the root.
  gear: (
    <>
      <path
        d="M10.34 4.79 L10.61 2.10 L13.39 2.10 L13.66 4.79 A7.4 7.4 0 0 1 15.92 5.72 L18.02 4.01 L19.99 5.98 L18.28 8.08 A7.4 7.4 0 0 1 19.21 10.34 L21.90 10.61 L21.90 13.39 L19.21 13.66 A7.4 7.4 0 0 1 18.28 15.92 L19.99 18.02 L18.02 19.99 L15.92 18.28 A7.4 7.4 0 0 1 13.66 19.21 L13.39 21.90 L10.61 21.90 L10.34 19.21 A7.4 7.4 0 0 1 8.08 18.28 L5.98 19.99 L4.01 18.02 L5.72 15.92 A7.4 7.4 0 0 1 4.79 13.66 L2.10 13.39 L2.10 10.61 L4.79 10.34 A7.4 7.4 0 0 1 5.72 8.08 L4.01 5.98 L5.98 4.01 L8.08 5.72 A7.4 7.4 0 0 1 10.34 4.79 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  speaker: (
    <>
      <path d="M3 9 H7 L12 5 V19 L7 15 H3 Z" fill="currentColor" />
      <path
        d="M15.5 9 Q17.5 12 15.5 15 M18 6.5 Q22 12 18 17.5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  speakerOff: (
    <>
      <path d="M3 9 H7 L12 5 V19 L7 15 H3 Z" fill="currentColor" />
      <path
        d="M16 9.5 L21 14.5 M21 9.5 L16 14.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </>
  ),
};

export function Icon({ name, size = 24, title }: { name: string; size?: number; title?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {PATHS[name] ?? <circle cx="12" cy="12" r="8" fill="currentColor" />}
    </svg>
  );
}
