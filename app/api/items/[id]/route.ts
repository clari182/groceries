import { NextResponse } from "next/server";
import { keyOf, publicView, update } from "../../../../lib/store";

type Ctx = { params: Promise<{ id: string }> };

// Check/uncheck an item, or move it to another list.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const s = await update((s) => {
    const item = s.items.find((i) => i.id === id);
    if (!item) return;
    if (typeof body.checked === "boolean") item.checked = body.checked;
    if (typeof body.listId === "string" && body.listId !== item.listId && s.lists.some((l) => l.id === body.listId)) {
      // If the target list already has this item, merge into it instead of duplicating.
      const dupe = s.items.find((i) => i.listId === body.listId && keyOf(i.name) === keyOf(item.name));
      if (dupe) {
        dupe.checked = dupe.checked && item.checked;
        dupe.updatedAt = Date.now();
        s.items = s.items.filter((i) => i.id !== item.id);
        return;
      }
      item.listId = body.listId;
      const k = s.known[keyOf(item.name)];
      if (k) k.listId = body.listId;
    }
    item.updatedAt = Date.now();
  });
  return NextResponse.json(publicView(s));
}

// Remove an item entirely.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const s = await update((s) => {
    s.items = s.items.filter((i) => i.id !== id);
  });
  return NextResponse.json(publicView(s));
}
