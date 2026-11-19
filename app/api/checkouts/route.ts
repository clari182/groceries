import { NextResponse } from "next/server";
import { publicView, update } from "../../../lib/store";

// Log a shopping trip: how much was spent, stamped with the current time.
export async function POST(req: Request) {
  const { amount, listId } = await req.json().catch(() => ({}));
  // Accept numbers or strings like "42,50" (comma decimal).
  const value = typeof amount === "string" ? Number(amount.replace(",", ".").trim()) : Number(amount);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    return NextResponse.json({ error: "Enter an amount greater than 0" }, { status: 400 });
  }

  const s = await update((s) => {
    s.checkouts.push({
      id: crypto.randomUUID(),
      amount: Math.round(value * 100) / 100,
      at: Date.now(),
      listId: s.lists.some((l) => l.id === listId) ? listId : undefined,
    });
  });
  return NextResponse.json(publicView(s));
}
