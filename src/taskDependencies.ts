import { type Task } from './db';

export function dependencyError(tasks: Task[]) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  if (byId.size !== tasks.length || tasks.some(task => !task.id.trim())) return 'IDs de tarefas inválidos ou duplicados.';
  const active = new Set<string>();
  const checked = new Set<string>();
  function visit(id: string): string | undefined {
    if (active.has(id)) return 'As dependências formam um ciclo.';
    if (checked.has(id)) return;
    const task = byId.get(id);
    if (!task) return 'O pré-requisito precisa pertencer ao mesmo projeto.';
    active.add(id);
    for (const prerequisite of task.dependsOn ?? []) {
      const error = visit(prerequisite);
      if (error) return error;
    }
    active.delete(id);
    checked.add(id);
  }
  for (const task of tasks) {
    const error = visit(task.id);
    if (error) return error;
  }
}

export function pendingDependencies(tasks: Task[], task: Task) {
  return tasks.filter(candidate => task.dependsOn?.includes(candidate.id) && !candidate.done);
}

export function confirmCompletion(tasks: Task[], task: Task, done: boolean) {
  const pending = done ? pendingDependencies(tasks, task) : [];
  if (pending.length && !window.confirm(`Pré-requisitos pendentes: ${pending.map(item => item.title).join(', ')}. Concluir mesmo assim?`)) return;
  return pending.map(item => item.id);
}

export function changeCompletion(tasks: Task[], id: string, done: boolean, confirmed: string[]) {
  const task = tasks.find(item => item.id === id);
  if (!task) throw new Error('A tarefa original não está mais disponível.');
  if (task.done === done) return;
  if (done && pendingDependencies(tasks, task).some(item => !confirmed.includes(item.id))) {
    throw new Error('Os pré-requisitos mudaram. Confira-os antes de concluir.');
  }
  return {tasks: tasks.map(item => item.id === id ? {...item, done} : item)};
}
