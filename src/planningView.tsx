import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { CalendarDays, CheckCircle2, Clock3, ListTodo } from 'lucide-react';
import { db, type Project, type WeeklyPlan } from './db';
import { type WeekEntry } from './PlanEntry';
import { taskKey } from './weeklyPlans';
import { dateKey } from './weekDates';

export function useToday() {
  const [today, setToday] = useState(() => dateKey(new Date()));
  useEffect(() => {
    let timer: number;
    function refresh() {
      window.clearTimeout(timer);
      const now = new Date();
      setToday(dateKey(now));
      const next = new Date(now);
      next.setHours(24, 0, 0, 0);
      timer = window.setTimeout(refresh, next.getTime() - now.getTime());
    }
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return today;
}

export function usePlanEntries(projects: Project[], projectsLoaded: boolean, start: string, end = start) {
  const [snapshot, setSnapshot] = useState<{start: string; end: string; plans: WeeklyPlan[]; failed?: boolean}>();
  useEffect(() => {
    const subscription = liveQuery(() => db.weeklyPlans.where('date').between(start, end, true, true).toArray())
      .subscribe({
        next: plans => setSnapshot({start, end, plans}),
        error: () => setSnapshot({start, end, plans: [], failed: true}),
      });
    return () => subscription.unsubscribe();
  }, [start, end]);
  const loaded = projectsLoaded && snapshot?.start === start && snapshot.end === end;
  const plans = loaded ? snapshot.plans : [];
  const projectIndex = new Map(projects.map(project => [project.id, project]));
  const entries: WeekEntry[] = plans.map(plan => {
    const project = projectIndex.get(plan.projectId);
    return {plan, project, task: project?.tasks.find(task => task.id === plan.taskId)};
  });
  return {loaded, plans, entries, failed: loaded && !!snapshot.failed};
}

export function PlanSummary({entries, loaded, daily = false}: {entries: WeekEntry[]; loaded: boolean; daily?: boolean}) {
  const unique = new Map(entries.filter(entry => entry.task)
    .map(({plan, task}) => [taskKey(plan.projectId, plan.taskId), task]));
  const done = [...unique.values()].filter(task => task?.done).length;
  const percent = unique.size ? Math.round(done / unique.size * 100) : 0;
  const label = daily ? 'Progresso diário' : 'Progresso semanal';
  return <>
    <section className="stats week-stats" aria-label={daily ? 'Indicadores de hoje' : 'Indicadores semanais'} aria-busy={!loaded}>
      {[
        {label: daily ? 'Planejadas para hoje' : 'Tarefas planejadas', value: unique.size, Icon: CalendarDays, tone: 'purple'},
        {label: 'Tarefas concluídas', value: done, Icon: CheckCircle2, tone: 'green'},
        {label: 'Tarefas pendentes', value: unique.size - done, Icon: Clock3, tone: 'amber'},
      ].map(({label, value, Icon, tone}) => <div className="stat" key={label}>
        <span className={'stat-icon ' + tone}><Icon size={21}/></span>
        <div><strong>{loaded ? value : '–'}</strong><span>{label}</span></div>
      </div>)}
    </section>
    <section className="detail-panel week-progress">
      <div className="progress-label"><span><ListTodo size={17}/> {label}</span><strong>{percent}%</strong></div>
      <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div style={{width: percent + '%'}}/>
      </div>
    </section>
  </>;
}
