import type { StoryblokStory } from './storyblok';

export interface ProgressRow {
  cours_id: string;
  validated_at: string;
}

export interface ProgressStatus {
  validated: boolean;
  percentage: number;
}

export function getProgressIndex(rows: ProgressRow[]) {
  return new Set(rows.map((row) => row.cours_id));
}

export function getModuleStatus(module: StoryblokStory, validatedIds: Set<string>): ProgressStatus {
  const courses = module.content.cours ?? [];
  const validated = courses.filter((course) => validatedIds.has(course.uuid)).length;
  return {
    validated: courses.length > 0 && validated === courses.length,
    percentage: courses.length ? Math.round((validated / courses.length) * 100) : 0,
  };
}

export function getPartStatus(part: StoryblokStory, validatedIds: Set<string>): ProgressStatus {
  const modules = part.content.modules ?? [];
  const statuses = modules.map((module) => getModuleStatus(module, validatedIds));
  const validated = statuses.filter((status) => status.validated).length;
  return {
    validated: modules.length > 0 && validated === modules.length,
    percentage: modules.length ? Math.round((validated / modules.length) * 100) : 0,
  };
}

export function getFirstIncompleteCourse(parts: StoryblokStory[], validatedIds: Set<string>) {
  for (const part of parts) {
    for (const module of part.content.modules ?? []) {
      for (const course of module.content.cours ?? []) {
        if (!validatedIds.has(course.uuid)) return course;
      }
    }
  }
  return null;
}

export function flattenCourses(stories: StoryblokStory[]) {
  return stories.flatMap((part) =>
    (part.content.modules ?? []).flatMap((module) => module.content.cours ?? [])
  );
}
