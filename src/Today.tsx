import { useState } from 'react';
import { ArrowLeft, Plus, Sun } from 'lucide-react';
import { type Priority, type Project } from './db';
import PlanEditor from './PlanEditor';
import { PlanEntry } from './PlanEntry';
import { PlanSummary, usePlanEntries, useToday } from './planningView';
import { localDate } from './weekDates';

const longDate = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'full'});
const priorityRank: Record<Priority, number> = {Alta: 0, Média: 1, Baixa: 2};

export default function Today({projects, projectsLoaded, onSaved}: {
  projects: Project[];
  projectsLoaded: boolean;
  onSaved: (message: string) => void;
}) {
  const today = useToday();
  const {entries, loaded, failed} = usePlanEntries(projects, projectsLoaded, today);
  const [editingDate, setEditingDate] = useState<string>();
  const sorted = [...entries].sort((a, b) => {
    const rank = (entry: typeof a) => entry.task ? Number(entry.task.done) : 2;
    return rank(a) - rank(b)
      || priorityRank[a.plan.priority] - priorityRank[b.plan.priority]
      || (a.task?.title ?? '').localeCompare(b.task?.title ?? '', 'pt-BR');
  });
  const planButton = <button className="primary" disabled={!loaded || failed} onClick={() => setEditingDate(today)}>
    <Plus size={18}/> Planejar meu dia
  </button>;

  return <div className="week-page today-page">
    <a className="secondary back" href="#/"><ArrowLeft size={17}/> Voltar aos projetos</a>
    <header className="page-heading">
      <div><time dateTime={today} className="today-date">{longDate.format(localDate(today))}</time>
        <h1>Meu Dia</h1><p className="muted">Concentre-se no que importa hoje</p></div>
      {entries.length > 0 && planButton}
    </header>
    <PlanSummary entries={entries} loaded={loaded && !failed} daily/>
    {failed && <p className="error" role="alert">Não foi possível carregar o planejamento de hoje.</p>}
    {!loaded && <p role="status" className="panel-empty">Carregando tarefas de hoje…</p>}
    {loaded && !failed && (sorted.length
      ? <section className="detail-panel today-tasks">
          <h2>Tarefas de hoje</h2>
          {sorted.map(entry => <PlanEntry key={entry.plan.id} entry={entry} onSaved={onSaved}/>)}
        </section>
      : <section className="empty">
          <span className="stat-icon purple"><Sun size={23}/></span>
          <h2>Seu dia ainda está livre</h2>
          <p>Escolha tarefas dos seus projetos para organizar o que quer fazer hoje.</p>
          {planButton}
        </section>)}
    {editingDate === today && <PlanEditor projects={projects} days={[today]} today={today} multiple
      onClose={() => setEditingDate(undefined)} onSaved={count => {
        setEditingDate(undefined);
        onSaved(count === 1 ? 'Tarefa planejada para hoje.' : count + ' tarefas planejadas para hoje.');
      }}/>}
  </div>;
}
