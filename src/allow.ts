import type { GateCard } from "./card.ts";

export function allow(card: GateCard): { code: 0 | 2; message: string } {
  if (card.status === "approved") return { code: 0, message: "approved" };
  return { code: 2, message: `refused: status is ${card.status}` };
}
