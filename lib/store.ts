import { promises as fs } from "fs";
import path from "path";

export type Item = {
  id: string;
  name: string;
  checked: boolean;
  updatedAt: number;
};

export type State = {
  items: Item[];
  // Every name ever added, with how often it was used. Feeds autocomplete.
  known: Record<string, { name: string; count: number; lastUsed: number }>;
};

const empty = (): State => ({ items: [], known: {} });
const KEY = "groceries:state";

// Upstash Redis (or Vercel KV, which exposes the same REST API) when configured.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd: string[]) {
  const res = await fetch(redisUrl!, {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken}` },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  return (await res.json()).result;
}

// Otherwise a JSON file on disk (fine for local use or a single server).
const file = path.join(process.cwd(), "data", "groceries.json");

export async function load(): Promise<State> {
  try {
    const raw = redisUrl && redisToken ? await redis(["GET", KEY]) : await fs.readFile(file, "utf8");
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch (e: any) {
    if (e?.code === "ENOENT") return empty();
    throw e;
  }
}

async function save(state: State) {
  const raw = JSON.stringify(state);
  if (redisUrl && redisToken) {
    await redis(["SET", KEY, raw]);
  } else {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, raw);
  }
}

// Serialize writes inside this process so quick taps don't overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
export function update(fn: (s: State) => void): Promise<State> {
  const run = queue.then(async () => {
    const s = await load();
    fn(s);
    await save(s);
    return s;
  });
  queue = run.catch(() => {});
  return run;
}

export const keyOf = (name: string) => name.trim().toLowerCase();

export function remember(s: State, name: string) {
  const k = keyOf(name);
  const prev = s.known[k];
  s.known[k] = { name: prev?.name ?? name.trim(), count: (prev?.count ?? 0) + 1, lastUsed: Date.now() };
}

export function publicView(s: State) {
  const suggestions = Object.values(s.known)
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
    .map((k) => k.name);
  return { items: s.items, suggestions };
}
