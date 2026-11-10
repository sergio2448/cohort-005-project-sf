import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  refunds,
  videoWatchEvents,
} from "~/db/schema";
import { whyNotRefundable, type NotRefundableReason } from "~/lib/refunds";

type Purchase = typeof purchases.$inferSelect;

export type RefundEligibility =
  | { refundable: true; purchase: Purchase; amount: number }
  | { refundable: false; reason: NotRefundableReason | "no-purchase" };

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getSecondsWatched(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

/**
 * Whether this user's Purchase of the course is Refundable, and if so the
 * amount a Refund would return: always the full Amount Paid.
 */
export function getRefundEligibility(
  userId: number,
  courseId: number,
  now: Date = new Date()
): RefundEligibility {
  const purchase = getLatestPurchase(userId, courseId);
  if (!purchase) return { refundable: false, reason: "no-purchase" };

  const hasRefundRequest = !!db
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.purchaseId, purchase.id))
    .get();

  const hasRedeemedSeat = !!db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchase.id), isNotNull(coupons.redeemedAt))
    )
    .get();

  const lessonIds = getLessonIdsForCourse(courseId);

  const reason = whyNotRefundable({
    purchasedAt: new Date(purchase.createdAt),
    now,
    hasRefundRequest,
    hasRedeemedSeat,
    secondsWatched: getSecondsWatched(userId, lessonIds),
    completedLessons: getCompletedLessonCount(userId, lessonIds),
    totalLessons: lessonIds.length,
  });

  if (reason) return { refundable: false, reason };

  return { refundable: true, purchase, amount: purchase.amountPaid };
}
