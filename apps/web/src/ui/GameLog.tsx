import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH, type ChatMessage } from "@settlers/protocol";
import type { GameClient, Snapshot } from "../game/LocalGame";
import { errorText, type SeatInfo } from "../game/seats";

const SHOWN = 200;

/** Engine log text names seats ("p2"); show each as the player's name in their colour. */
function Named({ text, seats }: { text: string; seats: SeatInfo[] }) {
  const parts = text.split(/\b(p\d+)\b/);
  return (
    <>
      {parts.map((part, i) => {
        const seat = i % 2 === 1 ? seats.find((s) => s.id === part) : undefined;
        return seat ? (
          <strong key={i} style={{ color: seat.color }}>
            {seat.name}
          </strong>
        ) : (
          part
        );
      })}
    </>
  );
}

/** Keep a list scrolled to the bottom, unless the reader has scrolled up to look back. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLOListElement>(null);
  const stuck = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  const onScroll = () => {
    const el = ref.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  return { ref, onScroll };
}

function LogList({ snap, seats }: { snap: Snapshot; seats: SeatInfo[] }) {
  const recent = snap.log.slice(-SHOWN);
  const offset = snap.log.length - recent.length;
  const { ref, onScroll } = useStickToBottom(snap.log.length);
  return (
    <ol ref={ref} onScroll={onScroll} aria-live="polite">
      {recent.map((e, i) => (
        <li key={offset + i} className={e.type === "TURN_ENDED" ? "turn-end" : undefined}>
          <Named text={e.text} seats={seats} />
        </li>
      ))}
    </ol>
  );
}

function ChatList({
  messages,
  seats,
  you,
}: {
  messages: ChatMessage[];
  seats: SeatInfo[];
  you: Snapshot["seat"];
}) {
  const { ref, onScroll } = useStickToBottom(messages.length);
  const colorOf = (username: string) => seats.find((s) => s.name === username)?.color;
  return (
    <ol ref={ref} onScroll={onScroll} aria-live="polite">
      {messages.length === 0 && (
        <li className="muted">
          {you === "spectator"
            ? "No messages yet. Players can't see what spectators write."
            : "No messages yet."}
        </li>
      )}
      {messages.map((m) => (
        <li key={m.id} className={m.channel === "spectators" ? "from-spectator" : undefined}>
          <strong style={{ color: colorOf(m.username) }}>{m.username}</strong>
          {m.channel === "spectators" && <span className="muted small"> (watching)</span>}:{" "}
          <span className="chat-text">{m.text}</span>
        </li>
      ))}
    </ol>
  );
}

function ChatForm({ send }: { send: (text: string) => Promise<string | null> }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="chat-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        void send(text).then((err) => {
          setError(err);
          if (!err) setText("");
        });
      }}
    >
      <input
        value={text}
        maxLength={CHAT_MAX_LENGTH}
        onChange={(e) => setText(e.target.value)}
        placeholder="Say something"
        aria-label="Chat message"
      />
      <button type="submit">Send</button>
      {error && <p className="error small">{error}</p>}
    </form>
  );
}

/** The game log and (online) chat, as two tabs of one panel. */
export function GameLog({
  snap,
  seats,
  client,
}: {
  snap: Snapshot;
  seats: SeatInfo[];
  client: GameClient;
}) {
  const chat = client.chat;
  const [tab, setTab] = useState<"log" | "chat">("log");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [seen, setSeen] = useState(0);
  useEffect(() => chat?.subscribe(setMessages), [chat]);
  useEffect(() => {
    if (tab === "chat") setSeen(messages.length);
  }, [tab, messages.length]);
  const unread = Math.max(0, messages.length - seen);

  return (
    <section className="panel log">
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "log"}
          className={tab === "log" ? "tab active" : "tab"}
          onClick={() => setTab("log")}
        >
          Log
        </button>
        {chat && (
          <button
            role="tab"
            aria-selected={tab === "chat"}
            className={tab === "chat" ? "tab active" : "tab"}
            onClick={() => setTab("chat")}
          >
            Chat{unread > 0 && <span className="unread">{unread}</span>}
          </button>
        )}
      </div>
      {tab === "log" || !chat ? (
        <LogList snap={snap} seats={seats} />
      ) : (
        <>
          <ChatList messages={messages} seats={seats} you={snap.seat} />
          <ChatForm
            send={async (text) => {
              try {
                const err = await chat.send(text);
                return err ? errorText(err.code, err.message) : null;
              } catch {
                return "The server didn't answer. Try again.";
              }
            }}
          />
        </>
      )}
    </section>
  );
}
