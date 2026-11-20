import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Plus, Zap } from 'lucide-react';
import { type Project } from './db';
import PlanEditor from './PlanEditor';
import { PlanEntry, fullDate, shortDate, weekday } from './PlanEntry';
import { PlanSummary, usePlanEntries, useToday } from './planningView';
import { localDate, shiftDate, startOfWeek } from './weekDates';

export default function MyWeek({projects, projectsLoaded, onSaved}: {
  projects: Project[];
  projectsLoaded: boolean;
  onSaved: (message: string) => void;
}) {
  const today = useToday();
  const current = startOfWeek(localDate(today));
  const [start, setStart] = useState(current);
  const [editing, setEditing] = useState<'single' | 'quick'>();
  const days = Array.from({length: 7}, (_, index) => shiftDate(start, index));
  const end = days[6];

  const {loaded, failed, entries} = usePlanEntries(projects, projectsLoaded, start, end);
  const pending = entries.filter(({task, plan}) => task && !task.done && !plan.transferredTo);

  return <div className="week-page">
    <a className="secondary back" href="#/"><ArrowLeft size={17}/> Voltar aos projetos</a>
    <header className="page-heading">
      <div><h1>Minha Semana</h1><p className="muted">{fullDate.format(localDate(start))} a {fullDate.format(localDate(end))}</p></div>
      <div className="week-navigation"><button className="secondary" onClick={() => setEditing('quick')}><Zap size={18}/> Planejamento rápido</button><button className="primary" onClick={() => setEditing('single')}><Plus size={19}/> Planejar tarefa</button></div>
    </header>
    <div className="week-navigation" aria-label="Navegar entre semanas">
      <button className="secondary" onClick={() => setStart(shiftDate(start, -7))}><ArrowLeft size={17}/> Semana anterior</button>
      <button className="secondary" aria-current={start === current ? 'date' : undefined} onClick={() => setStart(startOfWeek(new Date()))}>Semana atual</button>
      <button className="secondary" onClick={() => setStart(shiftDate(start, 7))}>Próxima semana <ArrowRight size={17}/></button>
    </div>
    {loaded && failed && <p className="error" role="alert">Não foi possível carregar o planejamento.</p>}
    <PlanSummary entries={entries} loaded={loaded && !failed} />
    {!loaded && <p role="status" className="panel-empty">Carregando planejamento…</p>}
    {loaded && !failed && !entries.length && <section className="empty">
      <span className="stat-icon purple"><CalendarDays size={23}/></span>
      <h2>Uma semana para organizar</h2><p>Escolha uma tarefa de um projeto e reserve um dia para ela.</p>
      <button className="primary" onClick={() => setEditing('single')}><Plus size={17}/> Planejar primeira tarefa</button>
    </section>}
    <section className="week-grid" aria-label="Dias da semana">
      {days.map(day => <section className="detail-panel week-day" key={day}>
        <div className="panel-heading">
          <h2>{weekday.format(localDate(day))}</h2>
          <time className={day === today ? 'category' : 'muted'} dateTime={day}>{shortDate.format(localDate(day))}{day === today ? ' · Hoje' : ''}</time>
        </div>
        {entries.filter(entry => entry.plan.date === day).map(entry => <PlanEntry key={entry.plan.id} entry={entry} days={days} onSaved={onSaved}/>)}
        {loaded && !failed && !entries.some(entry => entry.plan.date === day) && <p className="panel-empty">Nenhuma tarefa planejada.</p>}
      </section>)}
    </section>
    <section className="detail-panel week-pending">
      <div className="panel-heading"><h2><Clock3 size={20}/> Pendências da semana</h2></div>
      {pending.length ? <div className="week-grid">{pending.map(entry => <PlanEntry key={entry.plan.id} entry={entry} days={days} pending onSaved={onSaved}/>)}</div>
        : loaded && !failed && <p className="panel-empty">Nenhuma tarefa aguardando reagendamento.</p>}
    </section>
    {editing && <PlanEditor projects={projects} days={days} today={today} multiple={editing === 'quick'}
      onClose={() => setEditing(undefined)} onSaved={count => {
        setEditing(undefined);
        onSaved(count === 1 ? 'Planejamento salvo.' : count + ' tarefas planejadas.');
      }}/>}
  </div>;
}

