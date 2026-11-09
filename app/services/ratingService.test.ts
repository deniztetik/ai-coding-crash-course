import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  rateCourse,
  getUserRating,
  getCourseRatingSummary,
  getRatingSummariesForCourses,
} from "./ratingService";
import { enrollUser } from "./enrollmentService";

function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("rateCourse", () => {
    it("records a rating for an enrolled student", () => {
      enrollUser(base.user.id, base.course.id, false, false);

      const result = rateCourse(base.user.id, base.course.id, 4);

      expect(result.rating).toBe(4);
      expect(getUserRating(base.user.id, base.course.id)).toBe(4);
    });

    it("replaces the student's previous rating instead of adding another", () => {
      enrollUser(base.user.id, base.course.id, false, false);

      rateCourse(base.user.id, base.course.id, 2);
      rateCourse(base.user.id, base.course.id, 5);

      expect(getUserRating(base.user.id, base.course.id)).toBe(5);
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 5,
        count: 1,
      });
    });

    it("rejects students who are not enrolled", () => {
      expect(() => rateCourse(base.user.id, base.course.id, 4)).toThrowError(
        "Only enrolled students can rate this course"
      );
    });

    it("rejects the course's own instructor", () => {
      expect(() =>
        rateCourse(base.instructor.id, base.course.id, 5)
      ).toThrowError("Instructors cannot rate their own course");
    });

    it("rejects a missing course", () => {
      expect(() => rateCourse(base.user.id, 9999, 4)).toThrowError(
        "Course not found"
      );
    });

    it.each([0, 6, 3.5, NaN])("rejects out-of-range rating %s", (rating) => {
      enrollUser(base.user.id, base.course.id, false, false);

      expect(() =>
        rateCourse(base.user.id, base.course.id, rating)
      ).toThrowError("Rating must be a whole number from 1 to 5");
    });
  });

  describe("getUserRating", () => {
    it("returns null when the student has not rated", () => {
      expect(getUserRating(base.user.id, base.course.id)).toBeNull();
    });
  });

  describe("getCourseRatingSummary", () => {
    it("returns no average when there are no ratings", () => {
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("averages ratings to one decimal place", () => {
      const ratings = [5, 4, 4];
      ratings.forEach((rating, i) => {
        const student = createStudent(`s${i}@example.com`);
        enrollUser(student.id, base.course.id, false, false);
        rateCourse(student.id, base.course.id, rating);
      });

      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 4.3,
        count: 3,
      });
    });
  });

  describe("getRatingSummariesForCourses", () => {
    it("returns a summary per rated course and omits unrated ones", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Second Course",
          slug: "second-course",
          description: "Another course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();
      enrollUser(base.user.id, base.course.id, false, false);
      rateCourse(base.user.id, base.course.id, 3);

      const summaries = getRatingSummariesForCourses([
        base.course.id,
        course2.id,
      ]);

      expect(summaries.get(base.course.id)).toEqual({ average: 3, count: 1 });
      expect(summaries.has(course2.id)).toBe(false);
    });

    it("returns an empty map for no course ids", () => {
      expect(getRatingSummariesForCourses([]).size).toBe(0);
    });
  });
});
