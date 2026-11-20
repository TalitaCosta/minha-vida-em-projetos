import Dexie, { type Table } from 'dexie';
import { dependencyError } from './taskDependencies';
import { type Workspace } from './workspace';
export type Status = 'Ideia'|'Não iniciado'|'Em andamento'|'Pausado'|'Concluído';
export type Priority = 'Baixa'|'Média'|'Alta';
export interface Task {id:string;title:string;done:boolean;dependsOn?:string[]}
export interface Note {id:string;text:string;createdAt:string;updatedAt:string}
export interface Activity {id:string;text:string;createdAt:string}
export interface Project {id:string;name:string;description:string;category:string;status:Status;priority:Priority;deadline:string;nextAction:string;tasks:Task[];createdAt:string;updatedAt:string;notes?:Note[];activities?:Activity[];workspace?:Workspace}
export interface WeeklyPlan {
  id: string;
  projectId: string;
  taskId: string;
  date: string;
  priority: Priority;
  transferredTo?: string;
}

class ProjectDatabase extends Dexie {
  projects!: Table<Project, string>;
  weeklyPlans!: Table<WeeklyPlan, string>;

  constructor() {
    super('MinhaVidaEmProjetos');
    this.version(1).stores({projects:'id,name,status,category,updatedAt'});
    this.version(2).stores({weeklyPlans:'id,date,&[projectId+taskId+date]'});
  }
}
export const db = new ProjectDatabase();
export const statuses:Status[]=['Ideia','Não iniciado','Em andamento','Pausado','Concluído'];
export const categories=['Pessoal','Casa','Trabalho','Negócios','Igreja','Tecnologia','Outros'];

export function progress(project: Project) {
  const done = project.tasks.filter(task => task.done).length;
  const total = project.tasks.length;
  const percent = total ? Math.round(done / total * 100) : project.status === 'Concluído' ? 100 : 0;
  return {done, total, percent};
}

export function activity(text: string, createdAt = new Date().toISOString()): Activity {
  return {id: crypto.randomUUID(), text, createdAt};
}

export async function updateProject(id: string, change: (current: Project) => Partial<Project> | void) {
  await db.transaction('rw', db.projects, async () => {
    const current = await db.projects.get(id);
    if (!current) throw new Error('Projeto não encontrado.');
    const changes = change(current);
    if (!changes) return;
    const next = {...current, ...changes};
    const messages: string[] = [];
    if (next.status !== current.status) messages.push(`Status: ${current.status} → ${next.status}`);
    if (next.nextAction !== current.nextAction) {
      messages.push(next.nextAction ? `Próxima ação atualizada: ${next.nextAction}` : 'Próxima ação removida.');
    }
    if (next.tasks !== current.tasks) {
      const error = dependencyError(next.tasks);
      if (error) throw new Error(error);
      const previous = new Map(current.tasks.map(task => [task.id, task]));
      for (const task of next.tasks) {
        const before = previous.get(task.id);
        if (!before) messages.push(`Tarefa adicionada: ${task.title}`);
        if (before && before.title !== task.title) messages.push(`Tarefa renomeada: ${before.title} → ${task.title}`);
        if (task.done !== (before?.done ?? false)) {
          messages.push(`Tarefa ${task.done ? 'concluída' : 'reaberta'}: ${task.title}`);
        }
        previous.delete(task.id);
      }
      for (const task of previous.values()) messages.push(`Tarefa excluída: ${task.title}`);
    }
    const updatedAt = new Date().toISOString();
    await db.projects.put({
      ...next,
      updatedAt,
      activities: [...(next.activities ?? []), ...messages.map(message => activity(message, updatedAt))],
    });
  });
}
