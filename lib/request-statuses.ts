export const REQUEST_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "POSTPONED",
  "DONE",
  "CLOSED",
  "CANCELLED",
] as const
export type RequestStatus = typeof REQUEST_STATUSES[number]
export const REQUEST_STATUS_SET = new Set<string>(REQUEST_STATUSES)
