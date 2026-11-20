import { type Priority, type Project, type WeeklyPlan } from './db';

export type ScheduledTask = Pick<WeeklyPlan, 'projectId' | 'taskId' | 'date'>;

const priorityRank: Record<Priority, number> = {Alta: 0, Média: 1, Baixa: 2};
type Draft = ScheduledTask & {priority: Priority};

export function orderConflicts(projects: Project[], drafts: ScheduledTask[], saved: WeeklyPlan[]) {
  const byProject = new Map(projects.map(project => [project.id, project]));
  const kept = saved.filter(plan => !plan.transferredTo);
  const result = new Set<string>();
  for (const plan of [...drafts, ...kept]) {
    const project = byProject.get(plan.projectId);
    const task = project?.tasks.find(item => item.id === plan.taskId);
    for (const id of task?.dependsOn ?? []) {
      const matches = (candidate: ScheduledTask) => candidate.projectId === plan.projectId && candidate.taskId === id;
      if (!drafts.includes(plan) && !drafts.some(matches)) continue;
      const prerequisites = [...drafts, ...kept].filter(matches);
      if (prerequisites.length && prerequisites.every(item => item.date > plan.date)) {
        const prerequisite = project?.tasks.find(item => item.id === id);
        result.add(`“${task?.title}” está antes de “${prerequisite?.title}”.`);
      }
    }
  }
  return [...result];
}

export function distributePlans<T extends Draft>(drafts: T[], saved: WeeklyPlan[], projects: Project[], days: string[]) {
  const assigned = new Map<T, T>();
  const remaining = [...drafts].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const loads = new Map(days.map(day => [day, saved.filter(plan => plan.date === day).length]));
  const dependencies = (draft: Draft) => projects.find(project => project.id === draft.projectId)
    ?.tasks.find(task => task.id === draft.taskId)?.dependsOn ?? [];
  while (remaining.length) {
    const index = remaining.findIndex(draft => !remaining.some(other =>
      other.projectId === draft.projectId && dependencies(draft).includes(other.taskId)));
    if (index < 0) break;
    const [draft] = remaining.splice(index, 1);
    const prerequisites = dependencies(draft);
    const selectedDates = [...assigned.values()].filter(item => item.projectId === draft.projectId && prerequisites.includes(item.taskId))
      .map(item => item.date);
    const savedDates = prerequisites.flatMap(id => {
      if (drafts.some(item => item.projectId === draft.projectId && item.taskId === id)) return [];
      return saved.filter(item => !item.transferredTo && item.projectId === draft.projectId && item.taskId === id)
        .map(item => item.date).sort().slice(0, 1);
    });
    const available = days.filter(day => !saved.some(plan => plan.date === day && plan.projectId === draft.projectId && plan.taskId === draft.taskId));
    const permitted = available.filter(day => [...selectedDates, ...savedDates].every(date => date <= day));
    const date = [...permitted].sort((a, b) => (loads.get(a) ?? 0) - (loads.get(b) ?? 0) || a.localeCompare(b))[0];
    if (date) {
      assigned.set(draft, {...draft, date});
      loads.set(date, (loads.get(date) ?? 0) + 1);
    }
  }
  return {drafts: drafts.map(draft => assigned.get(draft) ?? draft), incomplete: assigned.size !== drafts.length};
}

