import { NextResponse } from "next/server";
import { cleanName, publicView, update } from "../../../../lib/store";

type Ctx = { params: Promise<{ id: string }> };

// Rename a list.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = cleanName(body.name, 40);
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const s = await update((s) => {
    const list = s.lists.find((l) => l.id === id);
    if (list) list.name = name;
  });
  return NextResponse.json(publicView(s));
}

// Delete a list and its items. The last list can't be deleted.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  let refused = false;
  const s = await update((s) => {
    if (s.lists.length <= 1) {
      refused = true;
      return;
    }
    s.lists = s.lists.filter((l) => l.id !== id);
    s.items = s.items.filter((i) => i.listId !== id);
  });
  if (refused) return NextResponse.json({ error: "You need at least one list" }, { status: 400 });
  return NextResponse.json(publicView(s));
}
