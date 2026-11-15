import { z } from "zod";
import type {
  Action,
  ActionSpec,
  ErrorCode,
  GameEvent,
  PlayerId,
  PlayerView,
} from "@settlers/engine";

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Errors the server can return that aren't engine rule errors. */
export const PROTOCOL_ERROR_CODES = [
  "UNAUTHENTICATED",
  "BAD_REQUEST",
  "NEED_USERNAME",
  "USERNAME_TAKEN",
  "NOT_FOUND",
  "NOT_HOST",
  "SEAT_TAKEN",
  "LOBBY_STARTED",
  "NOT_READY",
  "SPECTATORS_DISABLED",
  "SERVER_ERROR",
] as const;
export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];

/** UI copy for every protocol error code. */
export const PROTOCOL_ERROR_MESSAGES: Record<ProtocolErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in again.",
  BAD_REQUEST: "That request wasn't understood.",
  NEED_USERNAME: "Pick a username first.",
  USERNAME_TAKEN: "That username is taken.",
  NOT_FOUND: "That lobby or game doesn't exist.",
  NOT_HOST: "Only the host can do that.",
  SEAT_TAKEN: "That seat is taken.",
  LOBBY_STARTED: "This game has already started.",
  NOT_READY: "Every seat must be filled and ready first.",
  SPECTATORS_DISABLED: "This game doesn't allow spectators.",
  SERVER_ERROR: "Something went wrong on the server.",
};

/** Every acknowledgement is either success with data, or a stable error code. */
export type Ack<T = object> =
  ({ ok: true } & T) | { ok: false; code: ProtocolErrorCode | ErrorCode; message: string };

export const UsernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, "3–20 letters, digits or underscores");

const Id = z.string().min(1).max(64);
const VertexOrEdge = z.string().min(1).max(64);

const ResourceCounts = z.record(z.string().max(20), z.number().int().min(0).max(99));

/** Mirrors the engine's `Action` union; the engine still decides legality. */
export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLACE_SETTLEMENT"), vertex: VertexOrEdge }),
  z.object({ type: z.literal("PLACE_ROAD"), edge: VertexOrEdge }),
  z.object({ type: z.literal("ROLL") }),
  z.object({ type: z.literal("BUILD_ROAD"), edge: VertexOrEdge }),
  z.object({ type: z.literal("BUILD_SETTLEMENT"), vertex: VertexOrEdge }),
  z.object({ type: z.literal("BUILD_CITY"), vertex: VertexOrEdge }),
  z.object({ type: z.literal("END_TURN") }),
  z.object({
    type: z.literal("DISCARD"),
    resources: ResourceCounts,
  }),
  z.object({ type: z.literal("MOVE_ROBBER"), hex: VertexOrEdge }),
  z.object({ type: z.literal("STEAL"), from: z.string().min(1).max(8) }),
  z.object({ type: z.literal("BUY_DEV_CARD") }),
  z.object({ type: z.literal("PLAY_KNIGHT") }),
  z.object({ type: z.literal("PLAY_ROAD_BUILDING") }),
  z.object({ type: z.literal("PLACE_FREE_ROAD"), edge: VertexOrEdge }),
  z.object({ type: z.literal("PLAY_YEAR_OF_PLENTY"), resources: ResourceCounts }),
  z.object({ type: z.literal("PLAY_MONOPOLY"), resource: z.string().min(1).max(20) }),
]);
// Compile-time check that the schema and the engine agree.
type _SchemaMatchesEngine = [z.infer<typeof ActionSchema>] extends [Action]
  ? [Action] extends [z.infer<typeof ActionSchema>]
    ? true
    : never
  : never;
export const _actionSchemaCheck: _SchemaMatchesEngine = true;

// ---------------------------------------------------------------------------
// Client → server payloads (validated by the server)
// ---------------------------------------------------------------------------

export const SetUsernameSchema = z.object({ username: UsernameSchema });
export const CreateLobbySchema = z.object({
  maxSeats: z.union([z.literal(3), z.literal(4)]),
  allowSpectators: z.boolean(),
});
export const LobbyRefSchema = z.object({ lobbyId: Id });
export const TakeSeatSchema = z.object({
  lobbyId: Id,
  /** Seat index, or null to stand up. */
  seat: z.number().int().min(0).max(5).nullable(),
});
export const SetReadySchema = z.object({ lobbyId: Id, ready: z.boolean() });
export const JoinGameSchema = z.object({ gameId: Id });
export const GameActionSchema = z.object({ gameId: Id, action: ActionSchema });

export type SetUsername = z.infer<typeof SetUsernameSchema>;
export type CreateLobby = z.infer<typeof CreateLobbySchema>;
export type LobbyRef = z.infer<typeof LobbyRefSchema>;
export type TakeSeat = z.infer<typeof TakeSeatSchema>;
export type SetReady = z.infer<typeof SetReadySchema>;
export type JoinGame = z.infer<typeof JoinGameSchema>;
export type GameAction = z.infer<typeof GameActionSchema>;

// ---------------------------------------------------------------------------
// Server → client payloads (trusted; typed only)
// ---------------------------------------------------------------------------

export interface Me {
  id: string;
  /** Null until the user picks one. */
  username: string | null;
}

export interface LobbySeat {
  userId: string;
  username: string;
  ready: boolean;
  connected: boolean;
}

export interface LobbyState {
  id: string;
  hostId: string;
  maxSeats: number;
  allowSpectators: boolean;
  seats: (LobbySeat | null)[];
  status: "open" | "started";
  /** Set once the host starts the game. */
  gameId: string | null;
}

export interface SeatPlayer {
  seat: PlayerId;
  userId: string;
  username: string;
  connected: boolean;
}

/** Sent after every change, each socket getting its own filtered view. */
export interface GameStateMessage {
  gameId: string;
  /** Number of actions applied so far; increases by one per action. */
  seq: number;
  /** Which seat this socket plays, or "spectator". */
  you: PlayerId | "spectator";
  view: PlayerView;
  /** What `you` may legally send right now (always empty for spectators). */
  legal: ActionSpec[];
  /** Public VP per seat. */
  scores: Record<PlayerId, number>;
  /** Events this viewer may see from the action that produced this state. */
  events: GameEvent[];
  /** Full visible history, oldest first. Only sent when joining or reconnecting. */
  log?: GameEvent[];
  players: SeatPlayer[];
}

// ---------------------------------------------------------------------------
// Socket.IO event maps
// ---------------------------------------------------------------------------

type Reply<T = object> = (ack: Ack<T>) => void;

export interface ClientToServerEvents {
  "profile:setUsername": (payload: SetUsername, reply: Reply<{ me: Me }>) => void;
  "lobby:create": (payload: CreateLobby, reply: Reply<{ lobby: LobbyState }>) => void;
  "lobby:join": (payload: LobbyRef, reply: Reply<{ lobby: LobbyState }>) => void;
  "lobby:seat": (payload: TakeSeat, reply: Reply) => void;
  "lobby:ready": (payload: SetReady, reply: Reply) => void;
  "lobby:start": (payload: LobbyRef, reply: Reply<{ gameId: string }>) => void;
  "game:join": (payload: JoinGame, reply: Reply<{ you: PlayerId | "spectator" }>) => void;
  "game:action": (payload: GameAction, reply: Reply<{ seq: number }>) => void;
}

export interface ServerToClientEvents {
  welcome: (me: Me) => void;
  lobby: (lobby: LobbyState) => void;
  state: (state: GameStateMessage) => void;
}
