import { MemoryStore } from "../store/memory";
import { onlineSuite } from "./online-suite";

onlineSuite("online play (in-memory store)", async () => new MemoryStore());
