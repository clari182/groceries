import { NextResponse } from "next/server";
import { cleanName, keyOf, publicView, update } from "../../../lib/store";

// Create a list. Returns the new list's id so the app can switch to it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = cleanName(body.name, 40);
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  let id = "";
  const s = await update((s) => {
    const existing = s.lists.find((l) => keyOf(l.name) === keyOf(name));
    if (existing) {
      id = existing.id;
      return;
    }
    id = crypto.randomUUID();
    s.lists.push({ id, name });
  });
  return NextResponse.json({ ...publicView(s), createdId: id });
}
