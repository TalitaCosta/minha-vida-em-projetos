import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X, Zap } from 'lucide-react';
import { liveQuery } from 'dexie';
import { priorities } from './Dashboard';
import { db, type Priority, type Project, type WeeklyPlan } from './db';
import { priorityTone, shortDate, weekday } from './PlanEntry';
import { addPlans, PlanOrderError, planKey, taskKey, type PlanDraft } from './weeklyPlans';
import { localDate } from './weekDates';
import DependencyBadge from './DependencyBadge';
import { dependencyError, pendingDependencies } from './taskDependencies';
import { distributePlans, orderConflicts } from './planningRules';

export default function PlanEditor({projects, days, today, multiple, onSaved, onClose}: {
  projects: Project[];
  days: string[];
  today: string;
  multiple: boolean;
  onSaved: (count: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [selected, setSelected] = useState<Record<string, PlanDraft>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [accepted, setAccepted] = useState<{key: string; conflicts: string[]}>();
  const [serverOrder, setServerOrder] = useState<{key: string; conflicts: string[]}>();
  const [distributionWarning, setDistributionWarning] = useState('');
  const [snapshot, setSnapshot] = useState<{plans: WeeklyPlan[]; failed?: boolean}>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const plans = snapshot?.plans ?? [];
  const defaultDate = days.includes(today) ? today : days[0];
  const occupied = new Set(plans.map(planKey));
  const plannedTasks = new Set(plans.filter(plan => !plan.transferredTo).map(plan => taskKey(plan.projectId, plan.taskId)));
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const tasks = projects.flatMap(project => project.tasks.map(task => ({project, task, key: taskKey(project.id, task.id)})));
  const visible = tasks.filter(({project, task}) => (!projectFilter || project.id === projectFilter)
    && (project.name + ' ' + task.title).toLocaleLowerCase('pt-BR').includes(query));
  const choices = Object.entries(selected).map(([key, draft]) => ({key, draft, original: tasks.find(item => item.key === key)}));
  const drafts = choices.map(choice => choice.draft);
  const selectionKey = JSON.stringify(drafts);
  const order = [...new Set([...orderConflicts(projects, drafts, plans),
    ...(serverOrder?.key === selectionKey ? serverOrder.conflicts : [])])];
  const orderAccepted = accepted?.key === selectionKey && order.every(conflict => accepted.conflicts.includes(conflict));
  const dependencyIssue = choices.map(choice => choice.original?.project).find(project => project && dependencyError(project.tasks));
  const duplicateCount = drafts.filter(draft => occupied.has(planKey(draft))).length;
  const pendingCount = choices.filter(({original}) => original && pendingDependencies(original.project.tasks, original.task).length).length;
  const hasCompleted = choices.some(choice => choice.original?.task.done);
  const canSave = !!snapshot && !snapshot.failed && choices.length > 0 && !duplicateCount && !dependencyIssue && choices.every(choice => choice.original)
    && (!hasCompleted || confirmed) && (!order.length || orderAccepted);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const subscription = liveQuery(() => db.weeklyPlans.toArray()).subscribe({
      next: plans => setSnapshot({plans}),
      error: () => setSnapshot({plans: [], failed: true}),
    });
    return () => subscription.unsubscribe();
  }, []);

  function deselect(key: string) {
    setSelected(current => {
      const next = {...current};
      delete next[key];
      return next;
    });
    setConfirmed(false);
  }

  function distribute() {
    const allowedDays = days.includes(today) ? days.filter(day => day >= today) : days;
    const result = distributePlans(drafts, plans, projects, allowedDays);
    setSelected(Object.fromEntries(choices.map(({key}, index) => [key, result.drafts[index]])));
    setAccepted(undefined);
    setServerOrder(undefined);
    setDistributionWarning(result.incomplete || orderConflicts(projects, result.drafts, plans).length
      ? 'A distribuição não conseguiu respeitar todos os pré-requisitos ou encontrar um dia livre. Confira e ajuste as datas.' : '');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSave) return;
    setError('');
    setBusy(true);
    try {
      await addPlans(choices.map(({draft, original}) => ({
        ...draft, allowCompleted: confirmed && original?.task.done,
      })), orderAccepted ? accepted.conflicts : []);
      onSaved(choices.length);
    } catch (reason) {
      if (reason instanceof PlanOrderError) setServerOrder({key: selectionKey, conflicts: reason.conflicts});
      else setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o planejamento.');
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="modal planning-modal" aria-labelledby="planning-title" onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <form className="modal-content" onSubmit={submit}>
      <div className="modal-head">
        <h2 id="planning-title">{multiple ? 'Planejamento rápido' : 'Planejar tarefa'}</h2>
        <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose} disabled={busy}><X size={20}/></button>
      </div>
      <fieldset className="form planning-body" disabled={busy}>
        <div className="two">
          <label>Buscar projeto ou tarefa<input autoFocus type="search" value={search} onChange={event => setSearch(event.target.value)}/></label>
          <label>Projeto<select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
            <option value="">Todos os projetos</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select></label>
        </div>
        <div className="planning-columns">
          <div className="planning-catalog">
            {!visible.length && <p className="panel-empty">Nenhuma tarefa encontrada. Você pode adicionar tarefas no checklist do projeto.</p>}
            {[{done: false, label: 'Tarefas pendentes'}, {done: true, label: 'Tarefas concluídas'}].map(group => {
              const rows = visible.filter(({task}) => task.done === group.done);
              if (!rows.length) return null;
              return <section className="planning-group" key={group.label} aria-label={group.label}>
                <h3>{group.label}</h3>
                {rows.map(({project, task, key}) => {
                  const draft = selected[key];
                  const date = draft?.date ?? defaultDate;
                  const isPlanned = occupied.has(planKey({projectId: project.id, taskId: task.id, date}));
                  const hasFreeDay = days.some(day => !occupied.has(planKey({projectId: project.id, taskId: task.id, date: day})));
                  const priority = draft?.priority ?? project.priority;
                  return <label className="planning-option" key={key}>
                    <input type={multiple ? 'checkbox' : 'radio'} name={multiple ? undefined : 'planning-task'}
                      checked={!!draft} disabled={!draft && !hasFreeDay} onChange={event => {
                        if (!event.target.checked) {deselect(key); return;}
                        setSelected(current => ({
                          ...(multiple ? current : {}),
                          [key]: {projectId: project.id, taskId: task.id, date: defaultDate, priority: project.priority},
                        }));
                        setConfirmed(false);
                      }}/>
                    <span><strong>{task.title}</strong><small>{project.name}</small>
                      {isPlanned
                        ? <small>Já planejada para {shortDate.format(localDate(date))}</small>
                        : plannedTasks.has(key) && <small>Planejada em outro dia</small>}
                      <DependencyBadge pending={pendingDependencies(project.tasks, task)}/>
                    </span>
                    <span className={'status-badge ' + priorityTone[priority]} title="Prioridade">{priority}</span>
                  </label>;
                })}
              </section>;
            })}
          </div>
          <section className="planning-selection" aria-label="Tarefas selecionadas">
            <h3>Selecionadas ({choices.length})</h3>
            {!choices.length && <p className="panel-empty">Escolha {multiple ? 'tarefas na lista' : 'uma tarefa na lista'} para definir o planejamento.</p>}
            {choices.map(({key, draft, original}) => <article className="planning-choice" key={key}>
              <div className="week-task-top">
                <div><strong>{original?.task.title ?? 'Tarefa indisponível'}</strong>
                  <small>{original?.project.name}{original?.task.done ? ' · Concluída' : ''}</small>
                  {original && <DependencyBadge pending={pendingDependencies(original.project.tasks, original.task)}/>}</div>
                <button type="button" className="icon-button" aria-label={'Remover da seleção: ' + (original?.task.title ?? 'tarefa')}
                  onClick={() => deselect(key)}><X size={17}/></button>
              </div>
              <div className="two">
                {days.length > 1 ? <label>Dia de execução<select value={draft.date} onChange={event => {
                  const date = event.target.value;
                  setSelected(current => ({...current, [key]: {...draft, date}}));
                }}>
                  {days.map(day => <option key={day} value={day}>{weekday.format(localDate(day))}, {shortDate.format(localDate(day))}
                    {occupied.has(planKey({...draft, date: day})) ? ' · Já planejada' : ''}</option>)}
                </select></label> : <p className="muted">Hoje · {shortDate.format(localDate(draft.date))}</p>}
                <label>Prioridade semanal<select value={draft.priority} onChange={event => {
                  const priority = event.target.value as Priority;
                  setSelected(current => ({...current, [key]: {...draft, priority}}));
                }}>{priorities.map(value => <option key={value}>{value}</option>)}</select></label>
              </div>
              {occupied.has(planKey(draft)) && <p className="error">Esta tarefa já está planejada para o dia selecionado.</p>}
            </article>)}
            {hasCompleted && <label className="planning-confirm">
              <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
              Confirmo o planejamento das tarefas já concluídas.
            </label>}
          </section>
        </div>
        {distributionWarning && <p className="panel-empty" role="status">{distributionWarning}</p>}
        {!snapshot && <p className="muted" role="status">Carregando planejamentos…</p>}
        {snapshot?.failed && <p className="error" role="alert">Não foi possível consultar os planejamentos existentes.</p>}
        {dependencyIssue && <p className="error" role="alert">{dependencyError(dependencyIssue.tasks)}</p>}
        {order.length > 0 && <div className="planning-order">
          <strong>Conflitos de ordem de execução</strong>
          <ul>{order.map(conflict => <li key={conflict}>{conflict}</li>)}</ul>
          <label className="planning-confirm">
            <input type="checkbox" checked={!!orderAccepted} onChange={event => setAccepted(event.target.checked
              ? {key: selectionKey, conflicts: order} : undefined)}/>
            Confirmo o planejamento com esta ordem de execução.
          </label>
        </div>}
        {error && <p className="error" role="alert">{error}</p>}
      </fieldset>
      {multiple && <div className="planning-summary">
        <div aria-live="polite">
          <strong>Resumo do planejamento</strong>
          <ul>
            <li>{drafts.length} selecionadas</li>
            <li>{new Set(drafts.map(draft => draft.date)).size} dias</li>
            {(['Alta', 'Média', 'Baixa'] as const).map(priority => <li key={priority}>{priority} {drafts.filter(draft => draft.priority === priority).length}</li>)}
            <li>{duplicateCount} já planejadas para o dia</li>
            <li>{pendingCount} com dependências pendentes</li>
          </ul>
        </div>
        {days.length === 7 && <button type="button" className="secondary" disabled={busy || !snapshot || snapshot.failed || !drafts.length || !!dependencyIssue} onClick={distribute}>
          <Zap size={17}/> Distribuir automaticamente
        </button>}
      </div>}
      <div className="modal-actions">
        <span className="grow"/>
        <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="primary" disabled={!canSave || busy}>{busy ? 'Salvando…' : 'Salvar planejamento'}</button>
      </div>
    </form>
  </dialog>;
}

