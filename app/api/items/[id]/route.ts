import { NextResponse } from "next/server";
import { publicView, update } from "../../../../lib/store";

type Ctx = { params: Promise<{ id: string }> };

// Check or uncheck an item.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { checked } = await req.json().catch(() => ({}));
  const s = await update((s) => {
    const item = s.items.find((i) => i.id === id);
    if (item) {
      item.checked = !!checked;
      item.updatedAt = Date.now();
    }
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
