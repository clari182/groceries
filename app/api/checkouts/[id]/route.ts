import { NextResponse } from "next/server";
import { publicView, update } from "../../../../lib/store";

type Ctx = { params: Promise<{ id: string }> };

// Delete a checkout logged by mistake.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const s = await update((s) => {
    s.checkouts = s.checkouts.filter((c) => c.id !== id);
  });
  return NextResponse.json(publicView(s));
}
