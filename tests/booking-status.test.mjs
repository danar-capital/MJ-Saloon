import assert from "node:assert/strict";
import test from "node:test";
import { bookingStatusTimingAllowed } from "../lib/booking-status.ts";

const item = { bookingDate: "2026-08-29", startMinute: 720, endMinute: 765 };

test("booking status timing keeps the slot locked until the service ends", () => {
  assert.equal(bookingStatusTimingAllowed("arrived", item, { date: "2026-08-29", minutes: 660 }), true);
  assert.equal(bookingStatusTimingAllowed("in_service", item, { date: "2026-08-29", minutes: 720 }), true);
  assert.equal(bookingStatusTimingAllowed("completed", item, { date: "2026-08-29", minutes: 720 }), false);
  assert.equal(bookingStatusTimingAllowed("completed", item, { date: "2026-08-29", minutes: 764 }), false);
  assert.equal(bookingStatusTimingAllowed("completed", item, { date: "2026-08-29", minutes: 765 }), true);
  assert.equal(bookingStatusTimingAllowed("no_show", item, { date: "2026-08-29", minutes: 764 }), false);
  assert.equal(bookingStatusTimingAllowed("cancelled", item, { date: "2026-08-28", minutes: 600 }), true);
});
