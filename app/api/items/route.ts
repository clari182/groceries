import { NextResponse } from "next/server";
import { cleanName, keyOf, load, publicView, remember, update } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(publicView(await load()));
}

// Add an item to a list. If it's already on that list it goes back to "to buy".
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const clean = cleanName(body.name);
  if (!clean) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const s = await update((s) => {
    const listId = s.lists.some((l) => l.id === body.listId) ? body.listId : s.lists[0].id;
    const existing = s.items.find((i) => i.listId === listId && keyOf(i.name) === keyOf(clean));
    if (existing) {
      existing.checked = false;
      existing.updatedAt = Date.now();
    } else {
      s.items.push({ id: crypto.randomUUID(), listId, name: clean, checked: false, updatedAt: Date.now() });
    }
    remember(s, clean, listId);
  });
  return NextResponse.json(publicView(s));
}

// Clear the checked items of one list (?listId=...).
export async function DELETE(req: Request) {
  const listId = new URL(req.url).searchParams.get("listId");
  const s = await update((s) => {
    s.items = s.items.filter((i) => !i.checked || (listId !== null && i.listId !== listId));
  });
  return NextResponse.json(publicView(s));
}
