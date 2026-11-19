import { promises as fs } from "fs";
import path from "path";

export type List = {
  id: string;
  name: string;
};

export type Item = {
  id: string;
  listId: string;
  name: string;
  checked: boolean;
  updatedAt: number;
};

export type State = {
  lists: List[];
  items: Item[];
  // Every name ever added, with how often it was used. Feeds autocomplete.
  // listId is the list the name was last added to, so suggestions can favor it.
  known: Record<string, { name: string; count: number; lastUsed: number; listId?: string }>;
};

const empty = (): State => ({ lists: [], items: [], known: {} });

// Older data had a single list. Make sure there is always at least one list
// and every item belongs to an existing one.
function normalize(s: State): State {
  if (s.lists.length === 0) s.lists.push({ id: "default", name: "Supermarket" }); // fixed id: GETs don't save
  const ids = new Set(s.lists.map((l) => l.id));
  for (const i of s.items) if (!ids.has(i.listId)) i.listId = s.lists[0].id;
  return s;
}
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
    return normalize(raw ? { ...empty(), ...JSON.parse(raw) } : empty());
  } catch (e: any) {
    if (e?.code === "ENOENT") return normalize(empty());
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

export const cleanName = (v: unknown, max = 80) =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";

export function remember(s: State, name: string, listId: string) {
  const k = keyOf(name);
  const prev = s.known[k];
  s.known[k] = { name: prev?.name ?? name.trim(), count: (prev?.count ?? 0) + 1, lastUsed: Date.now(), listId };
}

export function publicView(s: State) {
  const suggestions = Object.values(s.known)
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
    .map((k) => ({ name: k.name, listId: k.listId }));
  return { lists: s.lists, items: s.items, suggestions };
}
