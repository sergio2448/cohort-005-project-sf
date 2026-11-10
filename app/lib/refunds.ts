// The rules that decide whether a Purchase is Refundable (see GLOSSARY.md).
// Pure, so the course page and the refund action cannot drift apart again.

export const REFUND_WINDOW_DAYS = 14;
export const MAX_WATCHED_SECONDS = 2 * 60 * 60;
export const MAX_COMPLETED_FRACTION = 0.5;

export type NotRefundableReason =
  | "already-requested"
  | "seat-redeemed"
  | "window-closed"
  | "watched-too-much"
  | "completed-too-much";

export type RefundFacts = {
  purchasedAt: Date;
  now: Date;
  hasRefundRequest: boolean;
  hasRedeemedSeat: boolean;
  secondsWatched: number;
  completedLessons: number;
  totalLessons: number;
};

// The window is counted in whole local days, not hours — someone who buys at
// 23:00 still gets the whole of their last day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

/** The day of the Purchase plus the 14 calendar days after it. */
export function lastDayOfRefundWindow(purchasedAt: Date): string {
  const deadline = new Date(purchasedAt);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

/** Null when the Purchase is Refundable, otherwise the first rule it breaks. */
export function whyNotRefundable(
  facts: RefundFacts
): NotRefundableReason | null {
  // A Purchase gets at most one Refund Request: a Declined one is final.
  if (facts.hasRefundRequest) return "already-requested";

  // Once a Team Seat has been redeemed the Purchase belongs partly to the
  // seat holder, so the buyer cannot hand it back.
  if (facts.hasRedeemedSeat) return "seat-redeemed";

  const today = calendarDay(facts.now);
  const inWindow =
    today >= calendarDay(facts.purchasedAt) &&
    today <= lastDayOfRefundWindow(facts.purchasedAt);
  if (!inWindow) return "window-closed";

  if (facts.secondsWatched >= MAX_WATCHED_SECONDS) return "watched-too-much";

  if (
    facts.totalLessons > 0 &&
    facts.completedLessons / facts.totalLessons >= MAX_COMPLETED_FRACTION
  ) {
    return "completed-too-much";
  }

  return null;
}
