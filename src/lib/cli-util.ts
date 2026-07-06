import { UserError } from "./errors";
import { type Priority, STATUSES, type Slip, type SlipType, type Status, TYPES } from "./model";

export function findSlip(slips: Slip[], id: string): Slip {
  const s = slips.find((x) => x.id === id);
  if (!s) throw new UserError(`no slip with id "${id}"`);
  return s;
}

export function parsePriority(v: string): Priority {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 4)
    throw new UserError(`priority must be 0-4, got "${v}"`);
  return n as Priority;
}

export function parseType(v: string): SlipType {
  if (!(TYPES as readonly string[]).includes(v))
    throw new UserError(`type must be one of ${TYPES.join("|")}`);
  return v as SlipType;
}

export function parseStatus(v: string): Status {
  if (!(STATUSES as readonly string[]).includes(v))
    throw new UserError(`status must be one of ${STATUSES.join("|")}`);
  return v as Status;
}

export function oneLine(s: Slip): string {
  const labels = s.labels.length ? `  [${s.labels.join(", ")}]` : "";
  return `${s.id}  p${s.priority} ${s.status} ${s.type}  ${s.title}${labels}`;
}
