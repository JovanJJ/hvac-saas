import assert from "node:assert/strict";
import { schemas } from "../../features/equipment/model";
import { activeRegister } from "../../features/operations/active-register";
assert.equal(
  schemas.customer.safeParse({ name: " ", contact: "" }).success,
  false,
);
assert.equal(
  schemas.site.safeParse({
    name: "Lokacija",
    code: "A",
    address: "Primer",
    timeZone: "Invalid/Zone",
    contact: "",
    accessNote: "",
  }).success,
  false,
);
assert.equal(
  schemas.unit.safeParse({
    role: "indoor",
    model: "Fiktivan model",
    serial: "",
    manufacturer: "",
  }).success,
  true,
);
assert.equal(
  schemas.unit.safeParse({
    role: "other",
    model: "",
    serial: "",
    manufacturer: "",
  }).success,
  false,
);
const result = activeRegister({
  customers: [{ id: "active" }, { id: "archived", archived_at: "2026-11-21" }],
  sites: [
    { id: "s1", customer_id: "active" },
    { id: "s2", customer_id: "archived" },
    { id: "s3", customer_id: "active", archived_at: "2026-11-21" },
  ],
  systems: [
    { id: "a", site_id: "s1" },
    { id: "b", site_id: "s2" },
    { id: "c", site_id: "s3" },
    { id: "d", site_id: "s1", archived_at: "2026-11-21" },
  ],
  visits: [],
});
assert.deepEqual(
  result.systems.map((row) => row.id),
  ["a"],
);
assert.deepEqual(
  result.sites.map((row) => row.id),
  ["s1"],
);
