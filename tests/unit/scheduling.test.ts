import assert from "node:assert/strict";
import {
  readFilters,
  shiftDate,
  localInput,
  scheduleLink,
  rescheduleSchema,
  cancellationSchema,
  membersSchema,
} from "../../features/scheduling/model";
assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
assert.equal(shiftDate("2028-02-28", 1), "2028-02-29");
const week = readFilters(
  {
    date: "2026-11-22",
    view: "week",
    site: "a1000000-0000-4000-8000-000000000001",
    cancelled: "on",
  },
  "2026-11-21",
);
assert.equal(week.from, "2026-11-16");
assert.equal(week.until, "2026-11-22");
assert.equal(
  new URL(
    scheduleLink(week, "2026-11-23"),
    "https://example.invalid",
  ).searchParams.get("site"),
  week.site,
);
assert.equal(readFilters({ date: "2026-02-30" }, "2026-11-21").invalid, true);
assert.equal(
  localInput("2026-11-21T23:30:00Z", "Europe/Belgrade"),
  "2026-11-22T00:30",
);
assert.equal(cancellationSchema.safeParse({ reason: "   " }).success, false);
assert.equal(membersSchema.safeParse({ members: [] }).success, false);
assert.equal(
  rescheduleSchema.safeParse({
    start: "2026-11-21T10:00",
    end: "2026-11-21T09:00",
    timeZone: "Europe/Belgrade",
  }).success,
  false,
);
