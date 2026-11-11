import fs from "node:fs";

export type GateStatus = "draft" | "approved" | "blocked" | "ready";

export type GateCard = {
  status: GateStatus;
  acceptance: string[];
  architecture: string[];
  maxAttempts: number;
  attempts: number;
  body: string;
  filePath: string;
};

export class GateRefuse extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateRefuse";
  }
}

const STATUSES: readonly GateStatus[] = [
  "draft",
  "approved",
  "blocked",
  "ready",
];

export function loadCard(filePath: string): GateCard {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new GateRefuse("refused: card is unreadable");
  }
  const { yaml, body } = splitFrontMatter(text);
  const parsed = parseFront(yaml);
  return { ...parsed, body, filePath };
}

export function reopen(card: GateCard): void {
  if (card.status === "ready" || card.status === "blocked") {
    card.status = "approved";
    card.attempts = 0;
  }
}

export function saveCard(card: GateCard): void {
  const yaml = [
    "---",
    `status: ${card.status}`,
    "acceptance:",
    ...card.acceptance.map((item) => `  - ${item}`),
    "architecture:",
    ...card.architecture.map((item) => `  - ${item}`),
    `max_attempts: ${card.maxAttempts}`,
    `attempts: ${card.attempts}`,
    "---",
    "",
  ].join("\n");
  const body =
    card.body.length === 0 || card.body.endsWith("\n")
      ? card.body
      : `${card.body}\n`;
  fs.writeFileSync(card.filePath, yaml + body);
}

function splitFrontMatter(text: string): { yaml: string; body: string } {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new GateRefuse("refused: card has no front matter");
  }
  const close = normalized.indexOf("\n---", 3);
  if (close < 0) throw new GateRefuse("refused: card front matter is unclosed");
  const yaml = normalized.slice(4, close);
  let body = normalized.slice(close + 4);
  if (body.startsWith("\n")) body = body.slice(1);
  return { yaml, body };
}

function parseFront(yaml: string): Omit<GateCard, "body" | "filePath"> {
  const acceptance: string[] = [];
  const architecture: string[] = [];
  const scalars: Record<string, string> = {};
  let list: "acceptance" | "architecture" | null = null;

  for (const line of yaml.split("\n")) {
    if (line.trim() === "") continue;
    const item = line.match(/^  - (.*)$/);
    if (item) {
      if (!list)
        throw new GateRefuse(`refused: list item without a key: ${line}`);
      (list === "acceptance" ? acceptance : architecture).push(item[1]);
      continue;
    }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) throw new GateRefuse(`refused: bad line ${line}`);
    if (kv[1] === "acceptance" || kv[1] === "architecture") {
      if (kv[2].trim() !== "")
        throw new GateRefuse(`refused: ${kv[1]} must be a list`);
      list = kv[1];
      continue;
    }
    list = null;
    scalars[kv[1]] = kv[2].trim();
  }

  const status = scalars.status;
  if (!status || !STATUSES.includes(status as GateStatus)) {
    throw new GateRefuse(`refused: status is ${status ?? "missing"}`);
  }
  return {
    status: status as GateStatus,
    acceptance,
    architecture,
    maxAttempts: scalars.max_attempts ? Number(scalars.max_attempts) : 3,
    attempts: scalars.attempts ? Number(scalars.attempts) : 0,
  };
}
