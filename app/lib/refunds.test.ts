import { describe, it, expect } from "vitest";
import {
  MAX_WATCHED_SECONDS,
  lastDayOfRefundWindow,
  whyNotRefundable,
  type RefundFacts,
} from "./refunds";

const purchasedAt = new Date(2026, 10, 1, 23, 0); // 1 Nov 2026, 23:00 local

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchasedAt,
    now: new Date(2026, 10, 5, 12, 0),
    hasRefundRequest: false,
    hasRedeemedSeat: false,
    secondsWatched: 0,
    completedLessons: 0,
    totalLessons: 10,
    ...overrides,
  };
}

describe("whyNotRefundable", () => {
  it("accepts a fresh Purchase", () => {
    expect(whyNotRefundable(facts())).toBeNull();
  });

  describe("the Refund Window", () => {
    it("runs from the purchase day to 14 calendar days after it", () => {
      expect(lastDayOfRefundWindow(purchasedAt)).toBe("2026-11-15");
    });

    it("stays open for the whole of its last day", () => {
      const now = new Date(2026, 10, 15, 23, 59);
      expect(whyNotRefundable(facts({ now }))).toBeNull();
    });

    it("closes the day after", () => {
      const now = new Date(2026, 10, 16, 0, 1);
      expect(whyNotRefundable(facts({ now }))).toBe("window-closed");
    });

    it("is not open before the purchase day", () => {
      const now = new Date(2026, 9, 31, 12, 0);
      expect(whyNotRefundable(facts({ now }))).toBe("window-closed");
    });
  });

  it("refuses a Purchase that has ever had a Refund Request", () => {
    expect(whyNotRefundable(facts({ hasRefundRequest: true }))).toBe(
      "already-requested"
    );
  });

  it("refuses a team Purchase once a seat has been redeemed", () => {
    expect(whyNotRefundable(facts({ hasRedeemedSeat: true }))).toBe(
      "seat-redeemed"
    );
  });

  it("refuses once 2 hours have been watched", () => {
    expect(
      whyNotRefundable(facts({ secondsWatched: MAX_WATCHED_SECONDS - 1 }))
    ).toBeNull();
    expect(
      whyNotRefundable(facts({ secondsWatched: MAX_WATCHED_SECONDS }))
    ).toBe("watched-too-much");
  });

  it("refuses once half the lessons are completed", () => {
    expect(whyNotRefundable(facts({ completedLessons: 4 }))).toBeNull();
    expect(whyNotRefundable(facts({ completedLessons: 5 }))).toBe(
      "completed-too-much"
    );
  });

  it("does not divide by zero for a course with no lessons", () => {
    expect(whyNotRefundable(facts({ totalLessons: 0 }))).toBeNull();
  });
});
