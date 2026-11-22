import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planSchema,
  recurrenceNote,
  type Occurrence,
} from "../../features/maintenance/model";
const valid = {
  siteId: "a1000000-0000-4000-8000-000000000001",
  name: "Fiktivan plan",
  anchorDate: "2028-02-29",
  anchorTime: "02:30",
  timeZone: "Europe/Belgrade",
  intervalMonths: "6",
  durationMinutes: "60",
  systems: ["a1000000-0000-4000-8000-000000000002"],
  members: ["a1000000-0000-4000-8000-000000000003"],
};
test("plan accepts a leap-day anchor and coerces bounded monthly configuration", () => {
  const result = planSchema.parse(valid);
  assert.equal(result.intervalMonths, 6);
  assert.equal(result.durationMinutes, 60);
});
test("plan rejects invalid calendars, invalid times, empty coverage/team and unbounded parameters", () => {
  for (const patch of [
    { anchorDate: "2027-02-29" },
    { anchorDate: "1999-12-31" },
    { anchorTime: "24:00" },
    { systems: [] },
    { members: [] },
    { intervalMonths: 0 },
    { intervalMonths: 121 },
    { durationMinutes: 14 },
    { durationMinutes: 1441 },
  ])
    assert.equal(planSchema.safeParse({ ...valid, ...patch }).success, false);
});
test("occurrence explanations distinguish clamping, gaps and the earlier overlapping instant", () => {
  const base = { monthEndClamped: false, resolution: "exact" } as Occurrence;
  assert.equal(recurrenceNote(base), "");
  assert.match(
    recurrenceNote({ ...base, monthEndClamped: true }),
    /izvorni dan/,
  );
  assert.match(
    recurrenceNote({ ...base, resolution: "overlap_earlier" }),
    /raniji termin/,
  );
  assert.match(
    recurrenceNote({
      ...base,
      resolution: "gap_forward",
      resolvedLocal: "2027-03-28T03:00",
    }),
    /03:00/,
  );
});
