# 009 — Sounds

## Goal

Short sound effects make key moments noticeable, especially your turn starting when you've looked away, without becoming noise.

## Scope / non-scope

**Scope**

- Cues: dice roll, road / settlement built, city built, dev card bought, your turn starting, a trade offer opened (and accepted or declined if it's your offer), robber moved, a card stolen (heard by everyone when the tab is visible; only the two players involved when it's hidden), discard needed, cards gained, award taken, win, chat message.
- A speaker button in the top bar: tap to mute or unmute; a small popover holds a volume slider. Both are remembered per browser in `localStorage` (`settlers.sound`), and the code still works if storage is blocked.
- **Hidden tab:** when `document.visibilityState` is `hidden`, only cues about you play: your turn starting, a discard you owe, an offer you can answer or answers to your own, a steal you're part of, the win, and chat. Other players' routine moves stay silent.
- No sounds for the history a client receives on joining or reconnecting; only for changes after the first snapshot.
- Spectators hear the public cues (no "your turn").

**Non-scope**

- Music, per-cue volume settings, voice.

## Rules

- Pure UI. Cues come from comparing the previous and current snapshot (new events, the top decision, the winner) and from new chat messages, never from the server telling the client to play a sound.
- Sounds start only after the first user gesture on the page (browser autoplay rules); until then cues are dropped, not queued.

## Engine changes

None.

## Server/UI changes

- Initially every sound was generated in `apps/web/src/audio/synth.ts` with the Web Audio API. Spec 227 adds explicit recorded sources through `audio/catalog.ts` and `audio/player.ts`, starting with eight supplied dice recordings; other cues remain synthesized. Runtime recordings go in `apps/web/public/sounds/` with provenance and permissions in `CREDITS.md`. Original or CC0 files remain the default policy; the project owner explicitly confirmed rights and authorized use of these eight dice recordings on 2026-11-16. Recorded cues have no automatic fallback.
- `apps/web/src/audio/cues.ts` (new, pure): `cuesFor(prev, next, { hidden })` (each input carries its seat) → a list of cue ids, deduplicated so one action plays at most one or two sounds (a roll that produces resources plays the dice, then a soft card sound).
- `apps/web/src/audio/settings.ts` (new): mute and volume with safe `localStorage` access, plus a tiny subscribe API.
- `apps/web/src/audio/useSounds.ts` (new): runs `cuesFor` on each snapshot and plays chat ticks for recent messages from others (history that arrives after a join is older than 15 seconds, so it stays quiet).
- `apps/web/src/ui/SoundToggle.tsx` (new) in the top bar. `GameView.tsx` feeds snapshots to the cue player; the chat subscription feeds chat cues.

## Test plan

- `cues.test.ts`: each event maps to its cue; your-turn fires only for you; the hidden-tab filter keeps only personal cues; the first snapshot gives nothing; a roll with production gives at most two cues; spectators never get your-turn.
- `settings.test.ts`: defaults when storage throws; values round-trip.
- Manual: listen to each cue in the sandbox, mute and unmute, reload to check the setting stuck, and a second browser in a background tab only hears its turn and chat.

## Open questions

None.

## Status

Shipped

Spec 228 supersedes shared building and movement effects: roads/settlements use
separate recordings, successful steals use the supplied swipe, and robber/pirate
movement is silent. A personal ticking warning starts five seconds before the
existing turn deadline, stops when the clock ends or changes, and respects mute/volume.
