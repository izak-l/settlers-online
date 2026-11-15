import { MapDefSchema, type MapDef } from "./schema";
import baseMapRaw from "../maps/base-4p.json" with { type: "json" };

export const BASE_4P: MapDef = MapDefSchema.parse(baseMapRaw);
