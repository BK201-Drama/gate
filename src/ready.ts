import type { GateCard } from "./card.ts";
import type { Report } from "./check.ts";

export function ready(
  card: GateCard,
  report: Report | null,
): { code: 0 | 1 | 2; message: string } {
  if (card.status !== "approved")
    return { code: 2, message: `refused: status is ${card.status}` };
  if (!report) return { code: 2, message: "refused: report is missing" };
  if (!report.passed) return { code: 1, message: "failed: report not passed" };
  card.status = "ready";
  return { code: 0, message: "ready" };
}
