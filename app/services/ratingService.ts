import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings, courses } from "~/db/schema";
import { isUserEnrolled } from "./enrollmentService";

// ─── Rating Service ───
// Star ratings (1–5) left by enrolled students. One rating per student per
// course; rating again replaces the previous value. No written reviews.
// Uses positional parameters (project convention).

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export type RatingSummary = {
  average: number | null;
  count: number;
};

export function isValidRating(rating: number) {
  return (
    Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING
  );
}

export function getUserRating(userId: number, courseId: number) {
  const row = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, userId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .get();

  return row?.rating ?? null;
}

export function rateCourse(userId: number, courseId: number, rating: number) {
  if (!isValidRating(rating)) {
    throw new Error(
      `Rating must be a whole number from ${MIN_RATING} to ${MAX_RATING}`
    );
  }

  const course = db
    .select({ instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    throw new Error("Course not found");
  }
  if (course.instructorId === userId) {
    throw new Error("Instructors cannot rate their own course");
  }
  if (!isUserEnrolled(userId, courseId)) {
    throw new Error("Only enrolled students can rate this course");
  }

  const now = new Date().toISOString();
  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating, updatedAt: now },
    })
    .returning()
    .get();
}

export function getCourseRatingSummary(courseId: number): RatingSummary {
  return (
    getRatingSummariesForCourses([courseId]).get(courseId) ?? {
      average: null,
      count: 0,
    }
  );
}

/**
 * Batch lookup for listing pages: one query for any number of courses.
 * Courses with no ratings are absent from the map.
 */
export function getRatingSummariesForCourses(courseIds: number[]) {
  const summaries = new Map<number, RatingSummary>();
  if (courseIds.length === 0) return summaries;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    summaries.set(row.courseId, {
      average: Math.round(row.average * 10) / 10,
      count: row.count,
    });
  }

  return summaries;
}
