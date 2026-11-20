import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, CalendarClock, CalendarDays, CalendarX2, CheckCircle2, CirclePause, Clock3, Flag,
  FolderKanban, FolderOpen, LayoutGrid, Lightbulb, List, ListTodo, Menu, MoreHorizontal,
  Pencil, PlayCircle, Plus, Search, ShieldCheck, Sun, Target, Trash2, X,
} from 'lucide-react';
import { categories, progress, statuses, type Priority, type Project, type Status } from './db';
import BackupControls from './BackupControls';

export const priorities: Priority[] = ['Baixa', 'Média', 'Alta'];
export const projectUrl = (id: string) => '#/projetos/' + encodeURIComponent(id);
export type StatusFilter = Status | 'Todos';

const statusIcons = {
  Todos: LayoutGrid,
  Ideia: Lightbulb,
  'Não iniciado': Clock3,
  'Em andamento': PlayCircle,
  Pausado: CirclePause,
  Concluído: CheckCircle2,
};

export function Sidebar({projects, filter, planningRoute, onFilter}: {
  projects: Project[];
  filter: StatusFilter;
  planningRoute?: 'week' | 'today';
  onFilter: (status: StatusFilter) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return <aside className="sidebar" data-expanded={expanded}>
    <div className="brand">
      <span className="brand-mark"><FolderKanban size={23}/></span>
      <span>Minha Vida<br/><strong>em Projetos</strong></span>
      <button ref={toggle} className="icon-button sidebar-toggle" aria-label={expanded ? 'Recolher menu' : 'Abrir menu'}
        aria-expanded={expanded} aria-controls="project-navigation" onClick={() => setExpanded(!expanded)}>
        {expanded ? <X size={22}/> : <Menu size={22}/>}
      </button>
    </div>
    <nav id="project-navigation" className="sidebar-nav" aria-label="Navegação principal">
      {[
        {href: '#/hoje', route: 'today', label: 'Hoje', Icon: Sun},
        {href: '#/semana', route: 'week', label: 'Minha Semana', Icon: CalendarDays},
      ].map(({href, route, label, Icon}) => <a key={route} href={href} className={planningRoute === route ? 'nav active planning-link' : 'nav planning-link'}
        aria-current={planningRoute === route ? 'page' : undefined} onClick={() => {
          if (expanded) toggle.current?.focus();
          setExpanded(false);
        }}><Icon size={18}/><span>{label}</span></a>)}
      <p className="side-title">Projetos</p>
      {(['Todos', ...statuses] as const).map(status => {
        const Icon = statusIcons[status];
        const count = status === 'Todos' ? projects.length : projects.filter(p => p.status === status).length;
        return <button key={status} className={!planningRoute && filter === status ? 'nav active' : 'nav'}
          aria-pressed={!planningRoute && filter === status} onClick={() => {
            onFilter(status);
            if (expanded) toggle.current?.focus();
            setExpanded(false);
          }}>
          <Icon size={18}/><span>{status === 'Todos' ? 'Todos os projetos' : status}</span><b>{count}</b>
        </button>;
      })}
    </nav>
    <div className="sidebar-bottom"><ShieldCheck size={18}/> Dados salvos neste navegador</div>
  </aside>;
}

export function ProgressBar({project, large = false}: {project: Project; large?: boolean}) {
  const {done, total, percent} = progress(project);
  return <div className={large ? 'progress-block large' : 'progress-block'}>
    <div className="progress-label">
      <span><ListTodo size={16}/> {done} de {total} {total === 1 ? 'tarefa' : 'tarefas'}</span><strong>{percent}%</strong>
    </div>
    <div className="progress" role="progressbar" aria-label={`Progresso de ${project.name}`}
      aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div style={{width: `${percent}%`}}/></div>
  </div>;
}

const tones: Record<Status, string> = {
  Ideia: 'neutral', 'Não iniciado': 'neutral', 'Em andamento': 'purple', Pausado: 'amber', Concluído: 'green',
};

export function StatusBadge({status}: {status: Status}) {
  return <span className={`status-badge ${tones[status]}`}>{status}</span>;
}

const dayMilliseconds = 86_400_000;

function localDay(date: Date) {
  // Map local calendar dates to equally spaced day numbers, including across DST.
  const day = new Date(0);
  day.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return day.getTime() / dayMilliseconds;
}

function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + 'T12:00:00');
  const [year, month, day] = value.split('-').map(Number);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? date : undefined;
}

function timestamp(value: string | undefined) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return calendarDate(value)?.getTime();
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function lastActivity(project: Project) {
  let latest: number | undefined;
  for (const event of project.activities ?? []) {
    const time = timestamp(event.createdAt);
    if (time !== undefined && (latest === undefined || time > latest)) latest = time;
  }
  return latest ?? timestamp(project.updatedAt) ?? timestamp(project.createdAt);
}

function ProjectCard({project, today, onEdit, onRemove, onStatus}: {
  project: Project;
  today: number;
  onEdit: () => void;
  onRemove: () => void;
  onStatus: (status: Status) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const deadline = calendarDate(project.deadline);
  const daysUntilDeadline = deadline ? localDay(deadline) - today : undefined;
  const latestActivity = lastActivity(project);
  const inactiveDays = latestActivity === undefined ? 0 : today - localDay(new Date(latestActivity));
  const active = project.status !== 'Concluído';
  const overdue = active && daysUntilDeadline !== undefined && daysUntilDeadline < 0;
  const dueSoon = active && daysUntilDeadline !== undefined && daysUntilDeadline >= 0 && daysUntilDeadline <= 7;
  const inactive = active && inactiveDays >= 7;
  const suggestStart = (project.status === 'Ideia' || project.status === 'Não iniciado') && project.tasks.some(task => task.done);
  return <article className="project">
    <div className="project-top">
      <span className="category">{project.category}</span>
      <div className="project-actions" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget) && menu.current) menu.current.open = false;
      }}>
        <details ref={menu} onKeyDown={event => {
          if (event.key === 'Escape' && menu.current?.open) {
            menu.current.open = false;
            menu.current.querySelector('summary')?.focus();
          }
        }}>
          <summary className="icon-button" aria-label={`Ações de ${project.name}`} title="Ações do projeto"><MoreHorizontal size={20}/></summary>
          <div className="action-popover">
            <button onClick={() => {
              if (menu.current) {menu.current.open = false; menu.current.querySelector('summary')?.focus();}
              onEdit();
            }}><Pencil size={16}/> Editar projeto</button>
            <button className="danger" onClick={() => {
              if (menu.current) {menu.current.open = false; menu.current.querySelector('summary')?.focus();}
              onRemove();
            }}><Trash2 size={16}/> Excluir projeto</button>
          </div>
        </details>
      </div>
    </div>
    {(overdue || dueSoon || inactive) && <div className="project-alerts">
      {overdue
        ? <span className="attention-badge overdue"><CalendarX2 size={15}/> Atrasado</span>
        : dueSoon && <span className="attention-badge amber"><CalendarClock size={15}/> Prazo próximo</span>}
      {inactive && <span className="attention-badge neutral"><Clock3 size={15}/> Sem atividade há {inactiveDays} dias</span>}
    </div>}
    <div className="project-intro">
      <h3><a className="project-link" href={projectUrl(project.id)}>{project.name}</a></h3>
      <p className="description">{project.description || 'Sem descrição.'}</p>
    </div>
    <div className="metadata">
      <span><Flag size={15}/> Prioridade <b>{project.priority}</b></span>
      <span><CalendarDays size={15}/> {deadline ? deadline.toLocaleDateString('pt-BR') : 'Sem prazo'}</span>
    </div>
    <ProgressBar project={project}/>
    <div className="next"><b><Target size={16}/> Próxima ação</b><p>{project.nextAction || 'Defina o próximo passo deste projeto.'}</p></div>
    {suggestStart && <div className="status-suggestion">
      <p><Lightbulb size={17}/> <span>Este projeto já possui tarefas concluídas. Deseja marcar como Em andamento?</span></p>
      <button className="secondary" onClick={() => {
        if (window.confirm(`Marcar “${project.name}” como Em andamento?`)) onStatus('Em andamento');
      }}>Alterar status</button>
    </div>}
    <div className="project-footer">
      <select className={`card-status ${tones[project.status]}`} aria-label={`Status de ${project.name}`} value={project.status}
        onChange={event => onStatus(event.target.value as Status)}>
        {statuses.map(status => <option key={status}>{status}</option>)}
      </select>
      <a className="secondary open-project" href={projectUrl(project.id)}>Abrir projeto <ArrowRight size={16}/></a>
    </div>
  </article>;
}

const viewKey = 'minha-vida-em-projetos:dashboard-view';
type DashboardView = 'cards' | 'list';
const sortOptions = {
  updatedAt: 'Última atualização',
  name: 'Nome',
  createdAt: 'Data de criação',
  deadline: 'Prazo',
  progress: 'Progresso',
};
type SortField = keyof typeof sortOptions;
const nameOrder = new Intl.Collator('pt-BR', {sensitivity: 'base', numeric: true});
const updatedDate = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short'});

function readView(): DashboardView {
  try {return localStorage.getItem(viewKey) === 'list' ? 'list' : 'cards';}
  catch {return 'cards';}
}

function sortValue(project: Project, field: Exclude<SortField, 'name'>) {
  if (field === 'progress') return progress(project).percent;
  return field === 'deadline' ? calendarDate(project.deadline)?.getTime() : timestamp(project[field]);
}

function ProjectList({projects}: {projects: Project[]}) {
  return <div className="project-list">
    <div className="project-list-head" aria-hidden="true">
      <span>Nome do projeto</span><span>Categoria</span><span>Status</span>
      <span>Progresso</span><span>Próxima ação</span><span>Última atualização</span>
    </div>
    <ul aria-label="Projetos em lista">
      {projects.map(project => {
        const {percent} = progress(project);
        const updated = timestamp(project.updatedAt);
        return <li key={project.id}>
          <a href={projectUrl(project.id)} className={project.status === 'Em andamento' ? 'project-row in-progress' : 'project-row'}>
            <strong className="project-row-name" title={project.name}>{project.name}</strong>
            <span className="category" title={project.category}>{project.category}</span>
            <StatusBadge status={project.status}/>
            <span className="project-row-progress">
              <span className="progress" role="progressbar" aria-label="Progresso" aria-valuenow={percent}
                aria-valuemin={0} aria-valuemax={100}><span style={{width: percent + '%'}}/></span>
              <strong>{percent}%</strong>
            </span>
            <span className="project-row-next" title={project.nextAction || undefined}>
              <span className="project-row-label">Próxima ação</span>
              <span>{project.nextAction || 'Sem próxima ação'}</span>
            </span>
            <span className="project-row-updated">
              <span className="project-row-label">Última atualização</span>
              {updated === undefined ? 'Sem data' : <time dateTime={new Date(updated).toISOString()}>{updatedDate.format(updated)}</time>}
            </span>
          </a>
        </li>;
      })}
    </ul>
  </div>;
}

export default function Dashboard({projects, loaded, filter, onFilter, onEdit, onRemove, onStatus, onSaved}: {
  projects: Project[];
  loaded: boolean;
  filter: StatusFilter;
  onFilter: (status: StatusFilter) => void;
  onEdit: (project?: Project) => void;
  onRemove: (project: Project) => void;
  onStatus: (project: Project, status: Status) => void;
  onSaved: (message: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [view, setView] = useState<DashboardView>(readView);
  const [orderBy, setOrderBy] = useState<SortField>('updatedAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [today, setToday] = useState(() => localDay(new Date()));
  useEffect(() => {
    let timeout: number;
    function updateDay() {
      window.clearTimeout(timeout);
      const now = new Date();
      setToday(localDay(now));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timeout = window.setTimeout(updateDay, midnight.getTime() - now.getTime());
    }
    updateDay();
    window.addEventListener('focus', updateDay);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('focus', updateDay);
    };
  }, []);
  const visible = projects.filter(project =>
    (filter === 'Todos' || project.status === filter)
    && (!category || project.category === category)
    && (!priority || project.priority === priority)
    && (project.name + ' ' + project.category + ' ' + project.description).toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => {
    const multiplier = direction === 'asc' ? 1 : -1;
    if (orderBy === 'name') return multiplier * nameOrder.compare(a.name, b.name);
    const first = sortValue(a, orderBy);
    const second = sortValue(b, orderBy);
    if (first === undefined || second === undefined) return Number(first === undefined) - Number(second === undefined);
    return multiplier * (first - second) || nameOrder.compare(a.name, b.name);
  });
  const summary = [
    {label: 'Total de projetos', icon: FolderKanban, tone: 'purple', value: projects.length},
    {label: 'Em andamento', icon: PlayCircle, tone: 'blue', value: projects.filter(p => p.status === 'Em andamento').length},
    {label: 'Pausados', icon: CirclePause, tone: 'amber', value: projects.filter(p => p.status === 'Pausado').length},
    {label: 'Concluídos', icon: CheckCircle2, tone: 'green', value: projects.filter(p => p.status === 'Concluído').length},
  ];
  function reset() {
    setSearch(''); setCategory(''); setPriority(''); onFilter('Todos');
  }
  function chooseView(next: DashboardView) {
    setView(next);
    try {localStorage.setItem(viewKey, next);} catch { /* A visualização continua disponível na sessão. */ }
  }

  return <div className="dashboard">
    <header className="page-heading">
      <div><h1>Meus projetos</h1><p className="muted">Organize suas ideias e acompanhe suas conquistas</p></div>
      <div className="dashboard-actions">
        <div className="view-switch" role="group" aria-label="Visualização dos projetos">
          <button className="text-button" aria-pressed={view === 'cards'} onClick={() => chooseView('cards')}><LayoutGrid size={17}/> Cards</button>
          <button className="text-button" aria-pressed={view === 'list'} onClick={() => chooseView('list')}><List size={17}/> Lista</button>
        </div>
        <button className="primary" onClick={() => onEdit()}><Plus size={19}/> Novo projeto</button>
      </div>
    </header>
    <section className="stats" aria-label="Resumo dos projetos">
      {summary.map(({label, icon: Icon, tone, value}) => <div className="stat" key={label}>
        <span className={`stat-icon ${tone}`}><Icon size={21}/></span>
        <div><strong>{loaded ? value : '–'}</strong><span>{label}</span></div>
      </div>)}
    </section>
    <section className="toolbar" aria-label="Busca, filtros e backup">
      <div className="toolbar-top">
        <label className="search"><Search size={19}/><input aria-label="Buscar projetos" placeholder="Buscar projetos..." value={search} onChange={event => setSearch(event.target.value)}/></label>
        <BackupControls onSaved={onSaved}/>
      </div>
      <div className="filters">
        <label>Categoria<select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">Todas</option>{[...new Set([...categories, ...projects.map(p => p.category)])].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Status<select value={filter} onChange={event => onFilter(event.target.value as StatusFilter)}>
          <option value="Todos">Todos</option>{statuses.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Prioridade<select value={priority} onChange={event => setPriority(event.target.value)}>
          <option value="">Todas</option>{priorities.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Ordenar por<select value={orderBy} onChange={event => setOrderBy(event.target.value as SortField)}>
          {Object.entries(sortOptions).map(([field, label]) => <option key={field} value={field}>{label}</option>)}
        </select></label>
        <label>Ordem<select value={direction} onChange={event => setDirection(event.target.value as 'asc' | 'desc')}>
          <option value="asc">Crescente</option><option value="desc">Decrescente</option>
        </select></label>
        {(search || category || priority || filter !== 'Todos') && <button className="text-button" onClick={reset}>Limpar filtros</button>}
      </div>
    </section>
    <div className="section-heading"><h2>Projetos</h2><span aria-live="polite">{loaded && `${visible.length} ${visible.length === 1 ? 'projeto' : 'projetos'}`}</span></div>
    <section className={view === 'cards' ? 'project-grid' : undefined} aria-label="Projetos" aria-busy={!loaded}>
      {visible.length > 0 && (view === 'list' ? <ProjectList projects={visible}/> : visible.map(project =>
        <ProjectCard key={project.id} project={project} today={today} onEdit={() => onEdit(project)}
          onRemove={() => onRemove(project)} onStatus={status => onStatus(project, status)}/>))}
      {!visible.length && <div className="empty">
        <span className="stat-icon purple"><FolderOpen size={23}/></span>
        <h3>{!loaded ? 'Carregando projetos…' : projects.length ? 'Nenhum projeto encontrado' : 'Tudo começa com um projeto'}</h3>
        {loaded && <><p>{projects.length ? 'Experimente ajustar a busca ou os filtros.' : 'Cadastre uma ideia e defina seu primeiro passo.'}</p>
          {projects.length ? <button className="secondary" onClick={reset}>Limpar filtros</button>
            : <button className="primary" onClick={() => onEdit()}><Plus size={17}/> Criar projeto</button>}</>}
      </div>}
    </section>
  </div>;
}
