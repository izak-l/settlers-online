import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BASE_RESOURCES, DEV_CARD_NAMES, type Action } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import { CardBack, DevCardFace, ResourceCard, devName, resourceName } from "./CardFace";
import { layoutFan } from "./fan";
import { addPick, bankTrade, removePick, startPick, total, type Pick, type Side } from "./picking";
import { useCardMotion } from "./useCardMotion";
import { currentUiScale } from "../ui/uiScale";

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

/** Cards are always 64px wide: the whole game screen scales to the window instead (spec 232). */
const CARD_W = 64;

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
  const cardW = CARD_W;
  const [resRef, resWidth] = useWidth();
  const [dockRef, dockWidth] = useWidth();
  const dock = useRef<HTMLElement | null>(null);
  // A stable callback: an inline one is cleared on every render, and the trade tray's layout
  // effect (which runs before the parent's ref is set again) would see null and never float.
  const setDock = useCallback(
    (el: HTMLElement | null) => {
      dock.current = el;
      dockRef(el);
    },
    [dockRef],
  );
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
    // The fans share one row in the bottom bar (spec 232), so dev cards get part of it.
    width: (dockWidth || 320) * 0.4,
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
      const src = document.querySelector(from === "bank" ? "[data-bank]" : `[data-seat="${from}"]`);
      // Measure where the card rests, not where its animation has already moved it (that put
      // the start 140px too low and made the page scroll for a moment). Setting the animation
      // back restarts it.
      el.style.animation = "none";
      const me = el.getBoundingClientRect();
      el.style.animation = "";
      // Screen pixels to the scaled layer's pixels (spec 232).
      const scale = currentUiScale();
      let dx = 0;
      let dy = -140;
      if (src) {
        const s = src.getBoundingClientRect();
        dx = (s.left + s.width / 2 - (me.left + me.width / 2)) / scale;
        dy = (s.top + s.height / 2 - (me.top + me.height / 2)) / scale;
      }
      el.style.setProperty("--dx", `${dx}px`);
      el.style.setProperty("--dy", `${dy}px`);
    }
  }, [moves]);

  const ratio = (r: string) => snap.ratios[r] ?? 4;
  // On your own main step a tapped card opens the trade window with it as "give" (spec 232).
  const top = snap.view.decisions.at(-1);
  const canTrade =
    snap.seat !== "spectator" &&
    !!top?.allowed.includes("OFFER_TRADE") &&
    top.pendingFrom.includes(snap.seat);
  const tapHand = (r: string) => {
    if (!pick) {
      if (canTrade) setPick(addPick(startPick("trade"), "give", r, hand));
      return;
    }
    if (pick.purpose === "discard" || pick.purpose === "trade")
      setPick(addPick(pick, "give", r, hand));
  };
  const handPickable = pick ? pick.purpose === "discard" || pick.purpose === "trade" : canTrade;
  const unpick = (side: Side, r: string) => {
    if (pick) setPick(removePick(pick, side, r));
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
        {pick?.purpose === "trade" && have > 0 && <span className="rate-badge">{ratio(r)}:1</span>}
      </>
    );
    return handPickable && have > 0 ? (
      <button
        key={r}
        // Bob only while picking; on your main step the cards just lift on hover.
        className={pick ? "card-group pickable" : "card-group"}
        style={{ width }}
        onClick={() => tapHand(r)}
        aria-label={
          pick
            ? `Pick one ${resourceName(r).toLowerCase()}, you have ${have}`
            : `Trade one ${resourceName(r).toLowerCase()}, you have ${have}`
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
      ref={setDock}
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
  trade: "Trade",
  bounty: "Take two from the bank",
  monopoly: "Name a resource",
  gold: "Gold: pick from the bank",
};

const HINTS: Record<Pick["purpose"], string> = {
  discard: "Tap cards in your hand to discard them. Tap a picked card to put it back.",
  trade:
    "Tap cards in your hand to give and cards below for what you want, then offer it to the other players or trade with the bank.",
  bounty: "Tap two bank cards (the same one twice is fine).",
  monopoly: "Tap the resource you want everyone's cards of.",
  gold: "Tap the bank cards you want (the same one more than once is fine).",
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
  const [floatingStyle, setFloatingStyle] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!anchor.current) return;
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
      // The tray lives outside the scaled game layer (a portal), so it scales itself to match:
      // its width and height are in design pixels, its position in screen pixels (spec 232).
      const scale = currentUiScale();
      const width = Math.max(1, Math.min(560, (window.innerWidth - 16) / scale));
      setFloatingStyle({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width * scale - 8)),
        bottom: window.innerHeight - bottom,
        width,
        maxHeight: Math.max(1, (bottom - top) / scale),
        transform: `scale(${scale})`,
        transformOrigin: "bottom left",
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
  }, [anchor]);
  const wantKey = Object.keys(want)[0];

  let action: Action | null = null;
  let bankAction: Action | null = null;
  let ready = false;
  let label = "Confirm";
  switch (purpose) {
    case "discard":
      label = `Discard ${total(give)} / ${pick.giveLimit ?? 0}`;
      ready = total(give) === pick.giveLimit;
      action = { type: "DISCARD", resources: give };
      break;
    case "trade": {
      // One set of picks, two ways to trade them (spec 232).
      label = "Offer to players";
      ready = total(give) > 0 && total(want) > 0;
      action = { type: "OFFER_TRADE", give, want };
      const bank = bankTrade(give, want, snap.ratios);
      if (
        bank &&
        snap.legal.some(
          (a) => a.type === "BANK_TRADE" && a.give === bank.give && a.get === bank.get,
        )
      )
        bankAction = { type: "BANK_TRADE", ...bank };
      break;
    }
    case "bounty":
      label = "Take them";
      action = { type: "PLAY_YEAR_OF_PLENTY", resources: want };
      ready = snap.legal.some(
        (a) => a.type === "PLAY_YEAR_OF_PLENTY" && sameCards(a.resources, want),
      );
      break;
    case "gold":
      label = `Take ${total(want)} / ${pick.wantLimit ?? 0}`;
      ready = total(want) === pick.wantLimit;
      action = { type: "CHOOSE_GOLD", resources: want };
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
  // What the bank takes from you: 4:1, or your port rates.
  const ports = BASE_RESOURCES.filter((r) => (snap.ratios[r] ?? 4) < 4);
  const bankRule = `Bank: ${ports.length ? "your rate" : "4"} of one resource for 1 card${
    ports.length
      ? ` (${ports.map((r) => `${resourceName(r).toLowerCase()} ${snap.ratios[r]}:1`).join(", ")}, others 4:1)`
      : ""
  }.`;
  const tray = (
    <div
      // Every tray floats above the bar, which has a fixed height (spec 232).
      className="tray trade-tray"
      style={floatingStyle ?? undefined}
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
            purpose !== "gold" &&
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
      {purpose === "trade" && !bankAction && <p className="muted small tray-note">{bankRule}</p>}
      <div className="row tray-actions">
        {/* Solo games have nobody to offer to (the server rejects it too). */}
        {(purpose !== "trade" || snap.players.length > 1) && (
          <button
            className="primary"
            disabled={!ready || !action}
            onClick={() => action && send(action)}
          >
            {label}
          </button>
        )}
        {purpose === "trade" && (
          <button
            className="primary"
            disabled={!bankAction}
            onClick={() => bankAction && send(bankAction)}
          >
            Trade with bank
          </button>
        )}
        {purpose !== "discard" && purpose !== "gold" && (
          <button className="link" onClick={() => setPick(null)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
  return floatingStyle ? createPortal(tray, document.body) : null;
}
