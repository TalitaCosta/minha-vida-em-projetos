import { useState } from 'react';
import { ArrowLeft, CalendarDays, Flag, History, ListTodo, MessageSquare, NotebookPen, Pencil, Target, Trash2 } from 'lucide-react';
import { activity, progress, updateProject, type Project, type Task } from './db';
import { ProgressBar, StatusBadge } from './Dashboard';
import DependencyBadge from './DependencyBadge';
import ProjectWorkspace from './ProjectWorkspace';
import { changeCompletion, confirmCompletion, pendingDependencies } from './taskDependencies';

const dateTime = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short'});

function Timestamp({value}: {value: string}) {
  return <time dateTime={value}>{dateTime.format(new Date(value))}</time>;
}

function TextForm({label, button, initial = '', multiline = false, clear = false, allowEmpty = false, onSave, onCancel}: {
  label: string;
  button: string;
  initial?: string;
  multiline?: boolean;
  clear?: boolean;
  allowEmpty?: boolean;
  onSave: (text: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  return <form className="form detail-form" onSubmit={async event => {
    event.preventDefault();
    if (saving || (!allowEmpty && !text.trim())) return;
    setSaving(true);
    setFailed(false);
    try {
      await onSave(text.trim());
      if (clear) setText('');
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }}>
    <label>{label}{multiline
      ? <textarea rows={3} value={text} disabled={saving} onChange={event => setText(event.target.value)}/>
      : <input value={text} disabled={saving} onChange={event => setText(event.target.value)}/>}
    </label>
    {failed && <p className="error" role="alert">Não foi possível salvar. Tente novamente.</p>}
    <div className="detail-actions">
      <button className="primary" disabled={saving || (!allowEmpty && !text.trim())}>{saving ? 'Salvando…' : button}</button>
      {onCancel && <button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancelar</button>}
    </div>
  </form>;
}

function TaskEditor({task, tasks, onSave, onCancel}: {
  task: Task;
  tasks: Task[];
  onSave: (title: string, dependsOn?: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [dependencies, setDependencies] = useState(task.dependsOn ?? []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <form className="form detail-form" onSubmit={async event => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError('');
    try {await onSave(title.trim(), dirty ? dependencies : undefined);}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a tarefa.');}
    finally {setSaving(false);}
  }}>
    <label>Nome da tarefa<input required value={title} disabled={saving} onChange={event => setTitle(event.target.value)}/></label>
    <details className="task-dependencies" open={dependencies.length > 0 || undefined}>
      <summary>Dependências</summary>
      {tasks.length < 2 && <p className="muted">Adicione outra tarefa ao projeto para escolher um pré-requisito.</p>}
      {tasks.filter(item => item.id !== task.id).map(item => <label key={item.id}>
        <input type="checkbox" checked={dependencies.includes(item.id)} disabled={saving} onChange={event => {
          const checked = event.target.checked;
          setDependencies(current => checked ? [...current, item.id] : current.filter(id => id !== item.id));
          setDirty(true);
        }}/>{item.title}{item.done ? ' (concluída)' : ''}
      </label>)}
    </details>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="detail-actions">
      <button className="primary" disabled={saving || !title.trim()}>{saving ? 'Salvando…' : 'Salvar tarefa'}</button>
      <button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancelar</button>
    </div>
  </form>;
}

export default function ProjectDetails({project, onEdit, onSaved}: {
  project: Project;
  onEdit: () => void;
  onSaved: (message: string) => void;
}) {
  const [editingTask, setEditingTask] = useState<string>();
  const [editingNote, setEditingNote] = useState<string>();
  const [editingAction, setEditingAction] = useState(false);
  const [error, setError] = useState('');
  const {done, total} = progress(project);
  const notes = [...(project.notes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = [...(project.activities ?? [])].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function update(change: (current: Project) => Partial<Project> | void, message = 'Alterações salvas.') {
    await updateProject(project.id, change);
    onSaved(message);
  }

  async function run(change: (current: Project) => Partial<Project> | void) {
    setError('');
    try {
      await update(change);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o projeto. Tente novamente.');
    }
  }

  return <div className="details">
    <a className="secondary back" href="#/"><ArrowLeft size={17}/> Voltar aos projetos</a>
    <section id="workspace-overview" className="detail-panel detail-hero workspace-section" tabIndex={-1} aria-label="Visão geral">
      <header className="page-heading">
        <div><div className="badge-group"><span className="category">{project.category}</span><StatusBadge status={project.status}/></div><h1>{project.name}</h1></div>
        <button className="secondary" onClick={onEdit}><Pencil size={16}/> Editar projeto</button>
      </header>
      <p className="description">{project.description || 'Sem descrição.'}</p>
      <div className="metadata">
        <span><Flag size={17}/> Prioridade <b>{project.priority}</b></span>
        <span><CalendarDays size={17}/> {project.deadline ? <>Prazo <b>{new Date(project.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}</b></> : 'Sem prazo'}</span>
      </div>
      <ProgressBar project={project} large/>
    </section>
    <ProjectWorkspace project={project} onSaved={onSaved}>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="detail-grid">
      <div className="detail-column">
        <section id="workspace-tasks" className="detail-panel workspace-section" tabIndex={-1}>
          <div className="panel-heading"><h2><ListTodo size={20}/> Checklist</h2><span className="category">{done}/{total} concluídas</span></div>
          {!total && <p className="panel-empty">Adicione uma tarefa para começar o checklist.</p>}
          {project.tasks.map(task => editingTask === task.id
            ? <TaskEditor key={task.id} task={task} tasks={project.tasks}
                onCancel={() => setEditingTask(undefined)} onSave={async (title, dependsOn) => {
                  await update(current => {
                    if (!current.tasks.some(item => item.id === task.id)) throw new Error('A tarefa foi excluída.');
                    return {tasks: current.tasks.map(item => item.id === task.id
                      ? {...item, title, ...(dependsOn === undefined ? {} : {dependsOn})} : item)};
                  });
                  setEditingTask(undefined);
                }}/>
            : <div className={`detail-item task-item${task.done ? ' completed' : ''}`} key={task.id}>
                <label>
                  <input type="checkbox" checked={task.done} onChange={event => {
                    const done = event.target.checked;
                    const confirmed = confirmCompletion(project.tasks, task, done);
                    if (confirmed) void run(current => changeCompletion(current.tasks, task.id, done, confirmed));
                  }}/><span>{task.title}<DependencyBadge pending={pendingDependencies(project.tasks, task)}/></span>
                </label>
                <div className="detail-actions">
                  <button className="icon-button" title="Editar tarefa" aria-label={`Editar tarefa: ${task.title}`} onClick={() => setEditingTask(task.id)}><Pencil size={16}/></button>
                  <button className="icon-button danger" title="Excluir tarefa" aria-label={`Excluir tarefa: ${task.title}`} onClick={() => {
                    if (window.confirm(`Excluir a tarefa “${task.title}”?`)) {
                      void run(current => ({tasks: current.tasks.filter(item => item.id !== task.id).map(item =>
                        item.dependsOn?.includes(task.id) ? {...item, dependsOn: item.dependsOn.filter(id => id !== task.id)} : item)}));
                    }
                  }}><Trash2 size={16}/></button>
                </div>
              </div>)}
          <TextForm label="Nova tarefa" button="Adicionar tarefa" clear onSave={async title => {
            await update(current => ({tasks: [...current.tasks, {id: crypto.randomUUID(), title, done: false}]}));
          }}/>
        </section>
        <section id="workspace-notes" className="detail-panel workspace-section" tabIndex={-1}>
          <div className="panel-heading"><h2><NotebookPen size={20}/> Anotações</h2></div>
          <TextForm label="Nova anotação" button="Adicionar anotação" multiline clear onSave={async text => {
            const createdAt = new Date().toISOString();
            await update(current => ({notes: [...(current.notes ?? []), {id: crypto.randomUUID(), text, createdAt, updatedAt: createdAt}]}));
          }}/>
          {!notes.length && <p className="panel-empty">Guarde aqui ideias e informações sobre o projeto.</p>}
          {notes.map(note => editingNote === note.id
            ? <TextForm key={note.id} label="Editar anotação" button="Salvar anotação" initial={note.text} multiline
                onCancel={() => setEditingNote(undefined)} onSave={async text => {
                  await update(current => ({notes: (current.notes ?? []).map(item => item.id === note.id
                    ? {...item, text, updatedAt: new Date().toISOString()} : item)}));
                  setEditingNote(undefined);
                }}/>
            : <article className="detail-item note-item" key={note.id}>
                <div>
                  <p>{note.text}</p>
                  <Timestamp value={note.createdAt}/>
                  {note.updatedAt !== note.createdAt && <> · Editada em <Timestamp value={note.updatedAt}/></>}
                </div>
                <div className="detail-actions">
                  <button className="icon-button" title="Editar anotação" aria-label="Editar anotação" onClick={() => setEditingNote(note.id)}><Pencil size={16}/></button>
                  <button className="icon-button danger" title="Excluir anotação" aria-label="Excluir anotação" onClick={() => {
                    if (window.confirm('Excluir esta anotação?')) {
                      void run(current => ({notes: (current.notes ?? []).filter(item => item.id !== note.id)}));
                    }
                  }}><Trash2 size={16}/></button>
                </div>
              </article>)}
        </section>
      </div>
      <div className="detail-column">
        <section className="detail-panel action-panel">
          <div className="panel-heading"><h2><Target size={21}/> Próxima ação</h2></div>
          {editingAction
            ? <TextForm label="Qual é o próximo passo?" button="Salvar" initial={project.nextAction} allowEmpty
                onCancel={() => setEditingAction(false)} onSave={async nextAction => {
                  await update(() => ({nextAction}), 'Próxima ação salva.');
                  setEditingAction(false);
                }}/>
            : <><p className="action-text">{project.nextAction || 'Defina o próximo passo deste projeto.'}</p>
                <button className="secondary back" onClick={() => setEditingAction(true)}><Pencil size={16}/> {project.nextAction ? 'Editar próxima ação' : 'Definir próxima ação'}</button></>}
        </section>
        <section id="workspace-history" className="detail-panel workspace-section" tabIndex={-1}>
          <div className="panel-heading"><h2><History size={20}/> Histórico de atividades</h2></div>
          <TextForm label="Atualização manual" button="Registrar atualização" multiline clear onSave={async text => {
            await update(current => ({activities: [...(current.activities ?? []), activity(text)]}));
          }}/>
          {history.length ? <ol className="timeline">{history.map(entry => {
            const Icon = entry.text.startsWith('Tarefa ') ? ListTodo : entry.text.startsWith('Status:') ? Flag
              : entry.text.startsWith('Próxima ação ') ? Target : MessageSquare;
            return <li key={entry.id}><span className="timeline-icon"><Icon size={15}/></span>
              <Timestamp value={entry.createdAt}/><p>{entry.text}</p>
            </li>;
          })}</ol> : <p className="panel-empty">As alterações do projeto aparecerão aqui.</p>}
        </section>
      </div>
    </div>
    </ProjectWorkspace>
  </div>;
}
