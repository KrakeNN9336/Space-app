// wrangler needs the assets directory to exist even before the first web build.
import { mkdirSync } from "node:fs";

mkdirSync(new URL("../apps/web/dist", import.meta.url), { recursive: true });
