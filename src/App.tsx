import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Trash2, X } from 'lucide-react';
import { liveQuery } from 'dexie';
import Dashboard, { priorities, projectUrl, Sidebar, type StatusFilter } from './Dashboard';
import ProjectDetails from './ProjectDetails';
import MyWeek from './MyWeek';
import Today from './Today';
import { categories, db, statuses, updateProject, type Priority, type Project, type Status } from './db';

type ProjectFields = Pick<Project, 'name' | 'description' | 'category' | 'status' | 'priority' | 'deadline'>;
const emptyFields: ProjectFields = {name: '', description: '', category: 'Pessoal', status: 'Ideia', priority: 'Média', deadline: ''};

function subscribeRoute(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function currentRoute() {
  return window.location.hash;
}

function ProjectEditor({project, onSave, onClose, onRemove}: {
  project?: Project;
  onSave: (fields: ProjectFields) => Promise<void>;
  onClose: () => void;
  onRemove: (project: Project) => Promise<void>;
}) {
  const [fields, setFields] = useState<ProjectFields>(() => project ?? emptyFields);
  const [busy, setBusy] = useState<'save' | 'remove'>();
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = fields.name.trim();
    if (!name) {setError('Informe o nome do projeto.'); return;}
    setBusy('save');
    setError('');
    try {
      const {description, category, status, priority, deadline} = fields;
      await onSave({name, description, category, status, priority, deadline});
    } catch {
      setError('Não foi possível salvar o projeto.');
      setBusy(undefined);
    }
  }

  return <dialog ref={dialog} className="modal" aria-labelledby="editor-title" onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }} onClick={event => {if (event.target === event.currentTarget && !busy) onClose();}}>
    <form className="modal-content" onSubmit={save}>
      <div className="modal-head">
        <h2 id="editor-title">{project ? 'Editar projeto' : 'Novo projeto'}</h2>
        <button type="button" className="icon-button" aria-label="Fechar" disabled={!!busy} onClick={onClose}><X size={20}/></button>
      </div>
      <fieldset className="form" disabled={!!busy}>
        <label>Nome do projeto *<input autoFocus required value={fields.name} onChange={e => setFields({...fields, name: e.target.value})} placeholder="Ex.: Organizar minha loja"/></label>
        <label>Descrição<textarea rows={3} value={fields.description} onChange={e => setFields({...fields, description: e.target.value})}/></label>
        <div className="two">
          <label>Categoria<select value={fields.category} onChange={e => setFields({...fields, category: e.target.value})}>
            {[...new Set([...categories, fields.category])].map(category => <option key={category}>{category}</option>)}</select></label>
          <label>Status<select value={fields.status} onChange={e => setFields({...fields, status: e.target.value as Status})}>
            {statuses.map(status => <option key={status}>{status}</option>)}</select></label>
        </div>
        <div className="two">
          <label>Prioridade<select value={fields.priority} onChange={e => setFields({...fields, priority: e.target.value as Priority})}>
            {priorities.map(priority => <option key={priority}>{priority}</option>)}</select></label>
          <label>Prazo (opcional)<input type="date" value={fields.deadline} onChange={e => setFields({...fields, deadline: e.target.value})}/></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </fieldset>
      <div className="modal-actions">
        {project && <button type="button" className="secondary danger" disabled={!!busy} onClick={async () => {
          if (!window.confirm('Excluir este projeto permanentemente?')) return;
          setBusy('remove');
          try {await onRemove(project);} catch {setError('Não foi possível excluir o projeto.'); setBusy(undefined);}
        }}><Trash2 size={16}/> {busy === 'remove' ? 'Excluindo…' : 'Excluir'}</button>}
        <span className="grow"/>
        <button type="button" className="secondary" disabled={!!busy} onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={!!busy}>{busy === 'save' ? 'Salvando…' : 'Salvar projeto'}</button>
      </div>
    </form>
  </dialog>;
}

export default function App() {
  const route = useSyncExternalStore(subscribeRoute, currentRoute);
  const onDetails = route.startsWith('#/projetos/');
  const onWeek = route === '#/semana';
  const onToday = route === '#/hoje';
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{text: string}>();
  const [editor, setEditor] = useState<{project?: Project}>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('Todos');
  const main = useRef<HTMLElement>(null);
  const previousRoute = useRef(route);

  useEffect(() => {
    const subscription = liveQuery(() => db.projects.toArray()).subscribe({
      next: projects => {setProjects(projects); setLoaded(true);},
      error: () => {setError('Não foi possível carregar os projetos.'); setLoaded(true);},
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    setEditor(undefined);
    main.current?.focus({preventScroll: true});
    window.scrollTo(0, 0);
  }, [route]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(undefined), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selected = onDetails ? projects.find(project => projectUrl(project.id) === route) : undefined;
  function showNotice(text: string) {setNotice({text});}

  async function save(fields: ProjectFields) {
    const original = editor?.project;
    if (original) {
      const changes = Object.fromEntries(
        (Object.keys(fields) as (keyof ProjectFields)[]).filter(key => fields[key] !== original[key]).map(key => [key, fields[key]])
      ) as Partial<ProjectFields>;
      await updateProject(original.id, () => changes);
    } else {
      const now = new Date().toISOString();
      await db.projects.add({...fields, id: crypto.randomUUID(), nextAction: '', tasks: [], createdAt: now, updatedAt: now});
    }
    setEditor(undefined);
    showNotice(original ? 'Projeto salvo.' : 'Projeto criado.');
  }

  async function remove(project: Project) {
    await db.projects.delete(project.id);
    if (onDetails) window.location.hash = '#/';
    setEditor(undefined);
    showNotice('Projeto excluído.');
  }

  async function updateStatus(project: Project, status: Status) {
    setError('');
    try {
      await updateProject(project.id, () => ({status}));
      showNotice('Status atualizado.');
    } catch {setError('Não foi possível atualizar o status.');}
  }

  return <div className="shell">
    <Sidebar projects={projects} filter={filter} planningRoute={onToday ? 'today' : onWeek ? 'week' : undefined} onFilter={status => {
      setFilter(status);
      if (onDetails || onWeek || onToday) window.location.hash = '#/';
    }}/>
    <main ref={main} tabIndex={-1}>
      {error && <p className="error page-error" role="alert">{error}</p>}
      <div hidden={onDetails || onWeek || onToday}>
        <Dashboard projects={projects} loaded={loaded} filter={filter} onFilter={setFilter}
          onEdit={project => setEditor({project})} onStatus={updateStatus}
          onRemove={async project => {
            if (!window.confirm('Excluir este projeto permanentemente?')) return;
            setError('');
            try {await remove(project);} catch {setError('Não foi possível excluir o projeto.');}
          }}
          onSaved={showNotice}/>
      </div>
      {onWeek && <MyWeek projects={projects} projectsLoaded={loaded} onSaved={showNotice}/>}
      {onToday && <Today projects={projects} projectsLoaded={loaded} onSaved={showNotice}/>}
      {onDetails && (selected
        ? <ProjectDetails key={selected.id} project={selected} onEdit={() => setEditor({project: selected})} onSaved={showNotice}/>
        : <section className="detail-panel"><h1>{loaded ? 'Projeto não encontrado' : 'Carregando projeto…'}</h1>
          <a className="secondary back" href="#/"><ArrowLeft size={17}/> Voltar aos projetos</a></section>)}
    </main>
    {editor && <ProjectEditor project={editor.project} onSave={save} onClose={() => setEditor(undefined)} onRemove={remove}/>}
    <div className="toast-region" role="status" aria-atomic="true">
      {notice && <div className="toast"><CheckCircle2 size={20}/>{notice.text}</div>}
    </div>
  </div>;
}

