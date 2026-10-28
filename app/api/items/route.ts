import { NextResponse } from "next/server";
import { keyOf, load, publicView, remember, update } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(publicView(await load()));
}

// Add an item. If it's already on the list it is (re)moved to "to buy".
export async function POST(req: Request) {
  const { name } = await req.json().catch(() => ({}));
  const clean = typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  if (!clean) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const s = await update((s) => {
    const existing = s.items.find((i) => keyOf(i.name) === keyOf(clean));
    if (existing) {
      existing.checked = false;
      existing.updatedAt = Date.now();
    } else {
      s.items.push({ id: crypto.randomUUID(), name: clean, checked: false, updatedAt: Date.now() });
    }
    remember(s, clean);
  });
  return NextResponse.json(publicView(s));
}

// Clear all checked items.
export async function DELETE() {
  const s = await update((s) => {
    s.items = s.items.filter((i) => !i.checked);
  });
  return NextResponse.json(publicView(s));
}
