import { PROTOCOL_ERROR_MESSAGES, type Ack, type ProtocolErrorCode } from "@settlers/protocol";

/** A failed acknowledgement with the standard message for its code. */
export function fail(code: ProtocolErrorCode, message?: string): Ack<never> {
  return { ok: false, code, message: message ?? PROTOCOL_ERROR_MESSAGES[code] };
}
