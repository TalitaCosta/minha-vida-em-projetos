import { db, updateProject, type WeeklyPlan } from './db';
import { shiftDate, validDateKey } from './weekDates';
import { changeCompletion, dependencyError } from './taskDependencies';
import { orderConflicts, type ScheduledTask } from './planningRules';

export type PlanDraft = Omit<WeeklyPlan, 'id' | 'transferredTo'> & {allowCompleted?: boolean};

export function taskKey(projectId: string, taskId: string) {
  return JSON.stringify([projectId, taskId]);
}

export function planKey({projectId, taskId, date}: Pick<WeeklyPlan, 'projectId' | 'taskId' | 'date'>) {
  return JSON.stringify([projectId, taskId, date]);
}

export function findPlan(plan: Pick<WeeklyPlan, 'projectId' | 'taskId' | 'date'>) {
  return db.weeklyPlans.where('[projectId+taskId+date]').equals([plan.projectId, plan.taskId, plan.date]).first();
}

async function requireTask({projectId, taskId}: WeeklyPlan) {
  const project = await db.projects.get(projectId);
  const task = project?.tasks.find(task => task.id === taskId);
  if (!task) throw new Error('A tarefa original não está mais disponível.');
  return task;
}

export class PlanOrderError extends Error {
  constructor(public conflicts: string[]) {
    super(conflicts.join(' '));
  }
}

async function validateOrder(drafts: ScheduledTask[], accepted: string[], exclude?: string) {
  if (!drafts.length) return;
  const ids = new Set(drafts.map(plan => plan.projectId));
  const projects = (await db.projects.bulkGet([...ids])).filter(project => project !== undefined);
  for (const project of projects) {
    const error = dependencyError(project.tasks);
    if (error) throw new Error(error);
  }
  const saved = await db.weeklyPlans.filter(plan => ids.has(plan.projectId) && plan.id !== exclude).toArray();
  const conflicts = orderConflicts(projects, drafts, saved);
  if (conflicts.some(conflict => !accepted.includes(conflict))) throw new PlanOrderError(conflicts);
}

export async function addPlans(drafts: PlanDraft[], accepted: string[] = []) {
  await db.transaction('rw', [db.projects, db.weeklyPlans], async () => {
    const keys = new Set<string>();
    const plans: WeeklyPlan[] = [];
    for (const {allowCompleted, ...fields} of drafts) {
      if (!validDateKey(fields.date)) throw new Error('Escolha uma data válida.');
      const plan = {...fields, id: crypto.randomUUID()};
      const task = await requireTask(plan);
      if (task.done && !allowCompleted) throw new Error(`Confirme o planejamento da tarefa concluída “${task.title}”.`);
      const key = planKey(plan);
      if (keys.has(key) || await findPlan(plan)) throw new Error(`A tarefa “${task.title}” já está planejada para esse dia.`);
      keys.add(key);
      plans.push(plan);
    }
    await validateOrder(plans, accepted);
    if (plans.length) await db.weeklyPlans.bulkAdd(plans);
  });
}

export async function movePlan(id: string, date: string, accepted: string[] = []) {
  if (!validDateKey(date)) throw new Error('Escolha uma data válida.');
  await db.transaction('rw', [db.projects, db.weeklyPlans], async () => {
    const plan = await db.weeklyPlans.get(id);
    if (!plan || plan.transferredTo) throw new Error('Este planejamento não pode ser reagendado.');
    if (plan.date === date) return;
    await requireTask(plan);
    if (await findPlan({...plan, date})) throw new Error('Esta tarefa já está planejada para o dia escolhido.');
    await validateOrder([{...plan, date}], accepted, plan.id);
    await db.weeklyPlans.update(id, {date});
  });
}

export async function transferPlan(id: string, accepted: string[] = []) {
  await db.transaction('rw', [db.projects, db.weeklyPlans], async () => {
    const source = await db.weeklyPlans.get(id);
    if (!source) throw new Error('Planejamento não encontrado.');
    const project = await db.projects.get(source.projectId);
    const task = project?.tasks.find(task => task.id === source.taskId);
    if (!task || task.done || source.transferredTo) throw new Error('Este planejamento já foi resolvido.');
    const date = shiftDate(source.date, 7);
    const destination = {...source, id: crypto.randomUUID(), date};
    if (!await findPlan(destination)) {
      await validateOrder([destination], accepted);
      await db.weeklyPlans.add(destination);
    }
    await db.weeklyPlans.update(id, {transferredTo: date});
  });
}

export function setPlannedTaskDone(plan: WeeklyPlan, done: boolean, confirmed: string[]) {
  return updateProject(plan.projectId, current => changeCompletion(current.tasks, plan.taskId, done, confirmed));
}
