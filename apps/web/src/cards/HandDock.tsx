import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BASE_RESOURCES, DEV_CARD_NAMES, type Action } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import { CardBack, DevCardFace, ResourceCard, devName, resourceName } from "./CardFace";
import { layoutFan } from "./fan";
import { addPick, bankGive, removePick, startPick, total, type Pick, type Side } from "./picking";
import { useCardMotion } from "./useCardMotion";

const GAP = 8;

const PLAY: Record<string, string> = {
  knight: "PLAY_KNIGHT",
  roadBuilding: "PLAY_ROAD_BUILDING",
  yearOfPlenty: "PLAY_YEAR_OF_PLENTY",
  monopoly: "PLAY_MONOPOLY",
};

const BLURB: Record<string, string> = {
  knight: "Move the robber and rob a neighbour.",
  roadBuilding: "Build two roads for free.",
  yearOfPlenty: "Take any two resources from the bank.",
  monopoly: "Name a resource; everyone gives you all of theirs.",
  victoryPoint: "Worth 1 VP. Kept secret until the game ends.",
};

/** The card width for this screen; the CSS reads it from --card-w, so there's one source. */
function useCardWidth(): number {
  const query = "(max-width: 600px)";
  const [small, setSmall] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setSmall(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return small ? 48 : 64;
}

function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}

const sameCards = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? 0) === (b[k] ?? 0));
};

interface Props {
  snap: Snapshot;
  pick: Pick | null;
  setPick(p: Pick | null): void;
  send(a: Action): void;
}

/** Your cards: resources fanned by type, then development cards; plus the tray while picking. */
export function HandDock({ snap, pick, setPick, send }: Props) {
  const cardW = useCardWidth();
  const [resRef, resWidth] = useWidth();
  const [dockRef, dockWidth] = useWidth();
  const dock = useRef<HTMLElement | null>(null);
  const [openDev, setOpenDev] = useState<string | null>(null);
  const moves = useCardMotion(snap);

  const hand = snap.view.zones[`hand-${snap.seat}`]?.contents ?? {};
  const held = snap.view.zones[`dev-${snap.seat}`]?.contents ?? {};
  const bought = snap.view.zones[`devnew-${snap.seat}`]?.contents ?? {};
  const inHand = (r: string) => (hand[r] ?? 0) - (pick?.give[r] ?? 0);
  const moved = (r: string, dir: "in" | "out") =>
    moves.filter((m) => m.resource === r && m.dir === dir);
  const count = (list: { n: number }[]) => list.reduce((a, m) => a + m.n, 0);

  // Resource fan: leaving cards stay drawn for a moment as ghosts.
  const groups = BASE_RESOURCES.map((r) => inHand(r) + count(moved(r, "out")));
  const fan = layoutFan({ width: resWidth || 320, cardW, gap: GAP, groups });

  // Dev fan: one group per card type, cards bought this turn in their own group.
  const devGroups = Object.keys(DEV_CARD_NAMES).flatMap((card) =>
    [
      { card, isNew: false, n: held[card] ?? 0 },
      { card, isNew: true, n: bought[card] ?? 0 },
    ].filter((g) => g.n > 0),
  );
  const devFan = layoutFan({
    width: dockWidth || 320,
    cardW,
    gap: GAP,
    groups: devGroups.map((g) => g.n),
  });

  // Fly-in / fly-out: start each moving card at (or send it to) its source's position.
  useLayoutEffect(() => {
    const root = dock.current;
    if (!root) return;
    for (const el of root.querySelectorAll<HTMLElement>("[data-from]")) {
      const from = el.dataset["from"]!;
      const src = from === "bank" ? null : document.querySelector(`[data-seat="${from}"]`);
      const me = el.getBoundingClientRect();
      let dx = 0;
      let dy = -140;
      if (src) {
        const s = src.getBoundingClientRect();
        dx = s.left + s.width / 2 - (me.left + me.width / 2);
        dy = s.top + s.height / 2 - (me.top + me.height / 2);
      }
      el.style.setProperty("--dx", `${dx}px`);
      el.style.setProperty("--dy", `${dy}px`);
    }
  }, [moves]);

  const ratio = (r: string) => snap.ratios[r] ?? 4;
  const tapHand = (r: string) => {
    if (!pick) return;
    if (pick.purpose === "discard" || pick.purpose === "offer")
      setPick(addPick(pick, "give", r, hand));
    else if (pick.purpose === "bank") setPick(bankGive(pick, r, ratio(r), hand));
  };
  const handPickable = pick && ["discard", "offer", "bank"].includes(pick.purpose);
  const unpick = (side: Side, r: string) => {
    if (!pick) return;
    setPick(
      side === "give" && pick.purpose === "bank"
        ? { ...pick, give: {} }
        : removePick(pick, side, r),
    );
  };

  const resourceGroups = BASE_RESOURCES.map((r, gi) => {
    const shown = fan.shown[gi]!;
    if (shown === 0) return null;
    const have = inHand(r);
    const real = Math.min(have, shown);
    const arriving = moved(r, "in");
    const leaving = moved(r, "out");
    // Which card came from where: the newest cards are the arrivals, in move order.
    const sources = arriving.flatMap((m) => Array.from({ length: m.n }, () => m.from));
    const exits = leaving.flatMap((m) => Array.from({ length: m.n }, () => m.from));
    const cards = Array.from({ length: shown }, (_, i) => {
      let cls = "fan-card";
      let from: string | undefined;
      if (i >= real) {
        cls += " leave";
        from = exits[i - real];
      } else if (i >= real - sources.length) {
        cls += " arrive";
        from = sources[i - (real - sources.length)];
      }
      return (
        <span
          key={i}
          className={cls}
          style={{ left: i * fan.sliver }}
          {...(from ? { "data-from": from } : {})}
        >
          <ResourceCard resource={r} />
        </span>
      );
    });
    const width = cardW + (shown - 1) * fan.sliver;
    const label = `${have} ${resourceName(r).toLowerCase()}`;
    const body = (
      <>
        {cards}
        {have > 0 && <span className="count-badge">{have}</span>}
        {pick?.purpose === "bank" && have > 0 && <span className="rate-badge">{ratio(r)}:1</span>}
      </>
    );
    return handPickable && have > 0 ? (
      <button
        key={r}
        className="card-group pickable"
        style={{ width }}
        onClick={() => tapHand(r)}
        aria-label={
          pick?.purpose === "bank"
            ? `Give ${ratio(r)} ${resourceName(r).toLowerCase()}, you have ${have}`
            : `Pick one ${resourceName(r).toLowerCase()}, you have ${have}`
        }
      >
        {body}
      </button>
    ) : (
      <span
        key={r}
        className="card-group"
        style={{ width }}
        // Cards you no longer hold are only leaving (a moment's animation): hide them from AT.
        {...(have > 0 ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      >
        {body}
      </span>
    );
  });

  const devKey = (g: { card: string; isNew: boolean }) => `${g.card}:${g.isNew ? "new" : "old"}`;
  const open = devGroups.find((g) => devKey(g) === openDev);
  const canPlay = (card: string) => snap.legal.some((a) => a.type === PLAY[card]);
  const play = (card: string) => {
    setOpenDev(null);
    if (card === "yearOfPlenty") setPick(startPick("bounty", { wantLimit: 2 }));
    else if (card === "monopoly") setPick(startPick("monopoly", { wantLimit: 1 }));
    else send({ type: PLAY[card] } as Action);
  };

  const empty = groups.every((n) => n === 0) && devGroups.length === 0;

  return (
    <section
      className="panel hand-panel"
      style={{ "--card-w": `${cardW}px` } as React.CSSProperties}
      ref={(el) => {
        dock.current = el;
        dockRef(el);
      }}
    >
      <h3>Your hand</h3>
      {pick && (
        <Tray snap={snap} pick={pick} setPick={setPick} send={send} unpick={unpick} anchor={dock} />
      )}
      <div className="hand-rows">
        <div className="fan res-fan" ref={resRef}>
          {resourceGroups}
          {empty && <p className="muted small">No cards yet.</p>}
        </div>
        {devGroups.length > 0 && (
          <div className="fan dev-fan" role="group" aria-label="Development cards">
            {devGroups.map((g, gi) => {
              const shown = devFan.shown[gi]!;
              return (
                <button
                  key={devKey(g)}
                  className={openDev === devKey(g) ? "card-group dev open" : "card-group dev"}
                  style={{ width: cardW + (shown - 1) * devFan.sliver }}
                  aria-expanded={openDev === devKey(g)}
                  aria-label={`${devName(g.card)}${g.isNew ? ", bought this turn" : ""}, ${g.n}`}
                  onClick={() => setOpenDev(openDev === devKey(g) ? null : devKey(g))}
                >
                  {Array.from({ length: shown }, (_, i) => (
                    <span key={i} className="fan-card" style={{ left: i * devFan.sliver }}>
                      <DevCardFace card={g.card} isNew={g.isNew} />
                    </span>
                  ))}
                  {g.n > 1 && <span className="count-badge">{g.n}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {open && (
        <div className="dev-detail">
          <div>
            <strong>{devName(open.card)}</strong>
            <p className="muted small">
              {BLURB[open.card]}
              {open.isNew && PLAY[open.card] && " Bought this turn: playable from your next turn."}
            </p>
          </div>
          {PLAY[open.card] && !open.isNew && (
            <button
              className="primary"
              disabled={!canPlay(open.card)}
              onClick={() => play(open.card)}
            >
              Play
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const TITLES: Record<Pick["purpose"], string> = {
  discard: "Discard",
  bank: "Trade with the bank",
  offer: "Offer a trade",
  bounty: "Take two from the bank",
  monopoly: "Name a resource",
};

const HINTS: Record<Pick["purpose"], string> = {
  discard: "Tap cards in your hand to discard them. Tap a picked card to put it back.",
  bank: "Tap a resource in your hand to give your rate's worth, then the card you want.",
  offer: "Tap cards in your hand to give, and bank cards for what you want.",
  bounty: "Tap two bank cards (the same one twice is fine).",
  monopoly: "Tap the resource you want everyone's cards of.",
};

function Tray({
  snap,
  pick,
  setPick,
  send,
  unpick,
  anchor,
}: Props & {
  pick: Pick;
  unpick(side: Side, r: string): void;
  anchor: React.RefObject<HTMLElement>;
}) {
  const hand = snap.view.zones[`hand-${snap.seat}`]?.contents ?? {};
  const { purpose, give, want } = pick;
  const floating = purpose === "bank" || purpose === "offer";
  const [floatingStyle, setFloatingStyle] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!floating || !anchor.current) return;
    const dock = anchor.current;
    const header = dock.closest(".app")?.querySelector(".topbar");
    const viewport = window.visualViewport;
    const measure = () => {
      const rect = dock.getBoundingClientRect();
      const top =
        Math.max(viewport?.offsetTop ?? 0, header?.getBoundingClientRect().bottom ?? 0) + 8;
      const bottom = Math.min(
        rect.top - 8,
        (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 8,
      );
      const width = Math.max(1, Math.min(560, rect.width, window.innerWidth - 16));
      setFloatingStyle({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        bottom: window.innerHeight - bottom,
        width,
        maxHeight: Math.max(1, bottom - top),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    if (header) observer.observe(header);
    window.addEventListener("resize", measure);
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, [floating, anchor]);
  const giveKey = Object.keys(give)[0];
  const wantKey = Object.keys(want)[0];

  let action: Action | null = null;
  let ready = false;
  let label = "Confirm";
  switch (purpose) {
    case "discard":
      label = `Discard ${total(give)} / ${pick.giveLimit ?? 0}`;
      ready = total(give) === pick.giveLimit;
      action = { type: "DISCARD", resources: give };
      break;
    case "bank":
      label = "Trade";
      if (giveKey && wantKey) {
        action = { type: "BANK_TRADE", give: giveKey, get: wantKey };
        ready = snap.legal.some(
          (a) => a.type === "BANK_TRADE" && a.give === giveKey && a.get === wantKey,
        );
      }
      break;
    case "offer":
      label = "Offer";
      ready = total(give) > 0 && total(want) > 0;
      action = { type: "OFFER_TRADE", give, want };
      break;
    case "bounty":
      label = "Take them";
      action = { type: "PLAY_YEAR_OF_PLENTY", resources: want };
      ready = snap.legal.some(
        (a) => a.type === "PLAY_YEAR_OF_PLENTY" && sameCards(a.resources, want),
      );
      break;
    case "monopoly":
      label = "Play Monopoly";
      if (wantKey) {
        action = { type: "PLAY_MONOPOLY", resource: wantKey };
        ready = snap.legal.some((a) => a.type === "PLAY_MONOPOLY" && a.resource === wantKey);
      }
      break;
  }

  const pile = (side: Side, cards: Record<string, number>, title: string) => (
    <div className="pile">
      <span className="muted small">{title}</span>
      <div className="pile-cards">
        {Object.entries(cards).flatMap(([r, n]) =>
          Array.from({ length: n }, (_, i) => (
            <button
              key={`${r}-${i}`}
              className="pile-card"
              aria-label={`Put back one ${resourceName(r).toLowerCase()}`}
              onClick={() => unpick(side, r)}
            >
              <ResourceCard resource={r} />
            </button>
          )),
        )}
        {total(cards) === 0 && <CardBack kind="res" />}
      </div>
    </div>
  );

  const usesBank = purpose !== "discard";
  const tray = (
    <div
      className={floating ? "tray trade-tray" : "tray"}
      style={floating ? (floatingStyle ?? undefined) : undefined}
      role="group"
      aria-label={TITLES[purpose]}
    >
      <div className="tray-head">
        <strong>{TITLES[purpose]}</strong>
        <span className="muted small">{HINTS[purpose]}</span>
      </div>
      <div className="tray-body">
        <div className="tray-piles">
          {purpose !== "bounty" &&
            purpose !== "monopoly" &&
            pile("give", give, purpose === "discard" ? "Discarding" : "You give")}
          {usesBank && pile("want", want, purpose === "monopoly" ? "Resource" : "You get")}
        </div>
        {usesBank && (
          <div className="bank-strip" role="group" aria-label="Bank">
            {BASE_RESOURCES.map((r) => (
              <button
                key={r}
                className={want[r] ? "bank-card chosen" : "bank-card"}
                aria-label={`Want one ${resourceName(r).toLowerCase()}`}
                onClick={() => setPick(addPick(pick, "want", r, hand))}
              >
                <ResourceCard resource={r} />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="row tray-actions">
        <button
          className="primary"
          disabled={!ready || !action}
          onClick={() => action && send(action)}
        >
          {label}
        </button>
        {purpose !== "discard" && (
          <button className="link" onClick={() => setPick(null)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
  return floating ? (floatingStyle ? createPortal(tray, document.body) : null) : tray;
}
