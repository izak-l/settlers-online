import { MemoryStore } from "../store/memory";
import { onlineSuite } from "./online-suite";
import { socialSuite } from "./social-suite";

onlineSuite("online play (in-memory store)", async () => new MemoryStore());
socialSuite("friends, presence and invites (in-memory store)", async () => new MemoryStore());
