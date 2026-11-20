import { useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import { projectUrl } from './Dashboard';
import { db, type Priority, type Project, type Task, type WeeklyPlan } from './db';
import { movePlan, PlanOrderError, setPlannedTaskDone, transferPlan } from './weeklyPlans';
import { confirmCompletion, pendingDependencies } from './taskDependencies';
import DependencyBadge from './DependencyBadge';
import { localDate } from './weekDates';

export const shortDate = new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: '2-digit'});
export const fullDate = new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'});
export const weekday = new Intl.DateTimeFormat('pt-BR', {weekday: 'long'});
export const priorityTone: Record<Priority, string> = {Baixa: 'neutral', Média: 'purple', Alta: 'amber'};

export type WeekEntry = {plan: WeeklyPlan; project?: Project; task?: Task};

export function PlanEntry({entry, days, pending = false, onSaved}: {
  entry: WeekEntry;
  days?: string[];
  pending?: boolean;
  onSaved: (message: string) => void;
}) {
  const {plan, project, task} = entry;
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');

  async function run(operation: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
      onSaved(message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o planejamento.');
    } finally {
      setBusy(false);
    }
  }

  async function schedule(operation: (accepted?: string[]) => Promise<void>, message: string) {
    await run(async () => {
      try {await operation();}
      catch (reason) {
        if (!(reason instanceof PlanOrderError)) throw reason;
        if (!window.confirm(`${reason.message} Salvar mesmo assim?`)) throw reason;
        await operation(reason.conflicts);
      }
    }, message);
  }

  return <article className={task?.done ? 'week-task completed' : 'week-task'}>
    <div className="week-task-top">
      {task && !pending
        ? <label className="week-task-title"><input type="checkbox" checked={task.done} disabled={busy} onChange={event => {
            const done = event.target.checked;
            const confirmed = confirmCompletion(project?.tasks ?? [], task, done);
            if (confirmed) void run(() => setPlannedTaskDone(plan, done, confirmed), done ? 'Tarefa concluída.' : 'Tarefa reaberta.');
          }}/>{task.title}</label>
        : <strong className="week-task-title">{task?.title ?? 'Tarefa indisponível'}</strong>}
      <span className={'status-badge ' + priorityTone[plan.priority]}>{plan.priority}</span>
    </div>
    {task && <DependencyBadge pending={pendingDependencies(project?.tasks ?? [], task)}/>}
    <div className="week-task-meta">
      {project ? <a href={projectUrl(project.id)}>{project.name} <ArrowRight size={14}/></a> : <span>Projeto indisponível</span>}
      {pending && <time dateTime={plan.date}>{weekday.format(localDate(plan.date))}, {shortDate.format(localDate(plan.date))}</time>}
      {plan.transferredTo && <span>Transferida para {fullDate.format(localDate(plan.transferredTo))}</span>}
    </div>
    <div className="week-task-actions">
      {task && !plan.transferredTo && (days ? <select value={plan.date} disabled={busy} aria-label={'Mover tarefa: ' + task.title}
        onChange={event => {
          const date = event.target.value;
          void schedule(accepted => movePlan(plan.id, date, accepted), 'Tarefa reagendada.');
        }}>
        {days.map(day => <option key={day} value={day}>{day === plan.date ? (pending ? 'Reagendar' : 'Mover para outro dia') : weekday.format(localDate(day)) + ', ' + shortDate.format(localDate(day))}</option>)}
      </select> : <form className="day-move" onSubmit={event => {
          event.preventDefault();
          void schedule(accepted => movePlan(plan.id, destination, accepted), 'Tarefa reagendada.');
        }}>
          <label>Reagendar<input type="date" required value={destination} disabled={busy} onChange={event => setDestination(event.target.value)}/></label>
          <button className="secondary" disabled={busy || !destination || destination === plan.date}>Mover</button>
        </form>)}
      {pending
        ? <button className="secondary" disabled={busy} onClick={() => void schedule(accepted => transferPlan(plan.id, accepted), 'Tarefa planejada para a próxima semana.')}>
            Próxima semana <ArrowRight size={16}/>
          </button>
        : <button className="icon-button danger" title="Remover do planejamento" aria-label={'Remover do planejamento: ' + (task?.title ?? 'tarefa indisponível')} disabled={busy}
            onClick={() => void run(() => db.weeklyPlans.delete(plan.id), 'Tarefa removida do planejamento.')}><Trash2 size={17}/></button>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </article>;
}

