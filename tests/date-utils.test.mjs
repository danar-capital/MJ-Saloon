import assert from "node:assert/strict";
import test from "node:test";

import { shiftIsoDate } from "../lib/date-utils.ts";

test("calendar navigation advances exactly one civil day", () => {
  assert.equal(shiftIsoDate("2026-08-29", 1), "2026-08-30");
  assert.equal(shiftIsoDate("2026-08-29", -1), "2026-08-28");
  assert.equal(shiftIsoDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftIsoDate("2028-02-28", 1), "2028-02-29");
});
