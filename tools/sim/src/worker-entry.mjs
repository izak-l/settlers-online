// Worker threads don't pick up tsx from the parent's flags, so register it here,
// then load the TypeScript worker.
import { register } from "tsx/esm/api";

register();
await import("./worker.ts");
