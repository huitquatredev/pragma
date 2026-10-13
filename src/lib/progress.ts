import type { StoryblokStory } from './storyblok';
import type { Inscription } from './supabase';

export interface ProgressRow {
  cours_id: string;
  validated_at: string;
}

export interface ProgressStatus {
  validated: boolean;
  percentage: number;
}

export function hasCourseAccess(course: StoryblokStory, inscription: Inscription): boolean {
  if (course.content.upgrade && !inscription.upgrade) return false;
  if (course.content.option_camille && !inscription.camille) return false;
  return true;
}

function accessibleCourses(cours: StoryblokStory[], inscription: Inscription) {
  return cours.filter((c) => c.content && hasCourseAccess(c, inscription));
}

/** Accessible/total counts for a possibly-unresolved cours list (teaser-safe). */
export function countAccessible(
  cours: unknown,
  inscription: Inscription
): { accessible: number; total: number } {
  const list = (Array.isArray(cours) ? cours : []).filter(
    (c): c is StoryblokStory => !!c && typeof c === 'object' && !!(c as StoryblokStory).content
  );
  return {
    accessible: list.filter((c) => hasCourseAccess(c, inscription)).length,
    total: list.length,
  };
}

export function getProgressIndex(rows: ProgressRow[]) {
  return new Set(rows.map((row) => row.cours_id));
}

export function partCourses(part: StoryblokStory, inscription: Inscription) {
  const fromModules = (part.content.modules ?? []).flatMap((module) => module.content?.cours ?? []);
  const direct = part.content.cours ?? [];
  return accessibleCourses([...fromModules, ...direct], inscription);
}

export function getModuleStatus(
  module: StoryblokStory,
  validatedIds: Set<string>,
  inscription: Inscription
): ProgressStatus {
  const courses = accessibleCourses(module.content?.cours ?? [], inscription);
  const validated = courses.filter((course) => validatedIds.has(course.uuid)).length;
  return {
    validated: courses.length > 0 && validated === courses.length,
    percentage: courses.length ? Math.round((validated / courses.length) * 100) : 0,
  };
}

export function getPartStatus(
  part: StoryblokStory,
  validatedIds: Set<string>,
  inscription: Inscription
): ProgressStatus {
  const modules = part.content.modules ?? [];
  const statuses = modules.map((module) => getModuleStatus(module, validatedIds, inscription));
  const allCourses = flattenCourses([part], inscription);
  const validatedCourses = allCourses.filter((c) => validatedIds.has(c.uuid)).length;
  // Parties sans module : la validation se joue directement sur les cours rattachés
  const allValidated =
    statuses.length > 0
      ? statuses.every((s) => s.validated)
      : allCourses.length > 0 && validatedCourses === allCourses.length;
  return {
    validated: allValidated,
    percentage: allCourses.length ? Math.round((validatedCourses / allCourses.length) * 100) : 0,
  };
}

export function getFirstIncompleteCourse(
  parts: StoryblokStory[],
  validatedIds: Set<string>,
  inscription: Inscription
) {
  for (const part of parts) {
    for (const course of partCourses(part, inscription)) {
      if (!validatedIds.has(course.uuid)) return course;
    }
  }
  return null;
}

export function flattenCourses(stories: StoryblokStory[], inscription: Inscription) {
  return stories.flatMap((part) => partCourses(part, inscription));
}
