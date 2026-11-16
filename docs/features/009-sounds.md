# 009 — Sounds

## Goal

Short sound effects make key moments noticeable, especially your turn starting when you've looked away, without becoming noise.

## Scope / non-scope

**Scope**

- Cues: dice roll, road / settlement built, city built, dev card bought, your turn starting, a trade offer opened (and accepted or declined if it's your offer), robber moved, card stolen (from you or by you), discard needed, cards gained, award taken, win, chat message.
- A speaker button in the top bar: tap to mute or unmute; a small popover holds a volume slider. Both are remembered per browser in `localStorage` (`settlers.sound`), and the code still works if storage is blocked.
- **Hidden tab:** when `document.visibilityState` is `hidden`, only cues about you play: your turn starting, a discard you owe, an offer you can answer, something stolen from you, the win, and chat. Other players' routine moves stay silent.
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

- `apps/web/src/audio/synth.ts` (new): every sound is generated with the Web Audio API (oscillators, filtered noise and gain envelopes; each recipe is a few lines). There are **no audio files**, so nothing needs licensing. If we ever add a file, it goes in `apps/web/public/sounds/` with its source and licence in `CREDITS.md` there, and only our own or CC0 files are allowed.
- `apps/web/src/audio/cues.ts` (new, pure): `cuesFor(prev, next, { seat, hidden })` → a list of cue ids, deduplicated so one action plays at most one or two sounds (a roll that produces resources plays the dice, then a soft card sound).
- `apps/web/src/audio/settings.ts` (new): mute and volume with safe `localStorage` access, plus a tiny subscribe API.
- `apps/web/src/ui/SoundToggle.tsx` (new) in the top bar. `GameView.tsx` feeds snapshots to the cue player; the chat subscription feeds chat cues.

## Test plan

- `cues.test.ts`: each event maps to its cue; your-turn fires only for you; the hidden-tab filter keeps only personal cues; the first snapshot gives nothing; a roll with production gives at most two cues; spectators never get your-turn.
- `settings.test.ts`: defaults when storage throws; values round-trip.
- Manual: listen to each cue in the sandbox, mute and unmute, reload to check the setting stuck, and a second browser in a background tab only hears its turn and chat.

## Open questions

None.

## Status

Draft
