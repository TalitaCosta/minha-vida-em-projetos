import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Banknote, Download, FileImage, Lightbulb, Link2, Plus, Settings2, ShoppingCart, Trash2, X } from 'lucide-react';
import { updateProject, type Project } from './db';
import { maxFileBytes, optionalSections, webAddress, type OptionalSection, type Workspace, type WorkspaceFile } from './workspace';

type SaveWorkspace = (change: (current: Workspace) => Partial<Workspace>, message: string) => Promise<void>;
const currency = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});

function Preferences({enabled, save, onClose}: {enabled: OptionalSection[]; save: SaveWorkspace; onClose: () => void}) {
  const [draft, setDraft] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="modal" aria-labelledby="sections-title" onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError('');
      try {
        await save(() => ({enabled: draft}), 'Seções atualizadas.');
        onClose();
      } catch {
        setError('Não foi possível salvar a configuração.');
        setBusy(false);
      }
    }}>
      <div className="modal-head"><h2 id="sections-title">Personalizar seções</h2>
        <button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={20}/></button>
      </div>
      <fieldset className="form workspace-preferences" disabled={busy}>
        <p className="muted">Os registros permanecem salvos ao ocultar uma seção.</p>
        {optionalSections.map(({id, label}) => <label key={id}>
          <input type="checkbox" checked={draft.includes(id)} onChange={event => {
            const checked = event.target.checked;
            setDraft(current => checked ? [...current, id] : current.filter(section => section !== id));
          }}/>{label}
        </label>)}
        {error && <p className="error" role="alert">{error}</p>}
      </fieldset>
      <div className="modal-actions"><span className="grow"/>
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar seções'}</button>
      </div>
    </form>
  </dialog>;
}

const panels = {
  ideas: {label: 'Ideias', field: 'Nova ideia', empty: 'Nenhuma ideia registrada.', Icon: Lightbulb},
  materials: {label: 'Compras e materiais', field: 'Item de compra ou material', empty: 'Nenhum item registrado.', Icon: ShoppingCart},
  budget: {label: 'Orçamento', field: 'Item do orçamento', empty: 'Nenhum valor registrado.', Icon: Banknote},
  links: {label: 'Links úteis', field: 'Nome do link', empty: 'Nenhum link registrado.', Icon: Link2},
};

type TextPanelId = keyof typeof panels;

function Remove({label, onClick}: {label: string; onClick: () => void}) {
  return <button type="button" className="icon-button danger" title="Excluir registro" aria-label={'Excluir ' + label}
    onClick={() => {if (window.confirm('Excluir “' + label + '”?')) onClick();}}><Trash2 size={17}/></button>;
}

function TextPanel({section, workspace, save}: {section: TextPanelId; workspace: Workspace; save: SaveWorkspace}) {
  const {label, field, empty, Icon} = panels[section];
  const [title, setTitle] = useState('');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const records = workspace[section] ?? [];

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    const item = {id: crypto.randomUUID(), title: title.trim()};
    setError('');
    setBusy(true);
    try {
      switch (section) {
        case 'ideas': await save(current => ({ideas: [...(current.ideas ?? []), item]}), 'Ideia adicionada.'); break;
        case 'materials': await save(current => ({materials: [...(current.materials ?? []), {...item, done: false}]}), 'Item adicionado.'); break;
        case 'budget': {
          const raw = extra.trim().replace(',', '.');
          const cents = Math.round(Number(raw) * 100);
          if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isSafeInteger(cents)) throw new Error('Informe um valor válido em reais.');
          await save(current => ({budget: [...(current.budget ?? []), {...item, cents}]}), 'Valor adicionado.');
          break;
        }
        case 'links': {
          const url = webAddress(extra.trim());
          if (!url) throw new Error('Informe um endereço que comece com http:// ou https://.');
          await save(current => ({links: [...(current.links ?? []), {...item, url}]}), 'Link adicionado.');
        }
      }
      setTitle('');
      setExtra('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o registro.');
    } finally {setBusy(false);}
  }

  async function change(update: (current: Workspace) => Partial<Workspace>, message: string) {
    setError('');
    try {await save(update, message);} catch {setError('Não foi possível atualizar o registro.');}
  }

  return <section id={'workspace-' + section} className="detail-panel workspace-section" tabIndex={-1}>
    <div className="panel-heading"><h2><Icon size={20}/> {label}</h2>
      {section === 'budget' && <strong>Total {currency.format((workspace.budget ?? []).reduce((sum, item) => sum + item.cents, 0) / 100)}</strong>}
    </div>
    <form className="form detail-form" onSubmit={add}>
      <label>{field}<input required value={title} disabled={busy} onChange={event => setTitle(event.target.value)}/></label>
      {section === 'budget' && <label>Valor (R$)<input required inputMode="decimal" value={extra} disabled={busy}
        onChange={event => setExtra(event.target.value)}/></label>}
      {section === 'links' && <label>Endereço<input required type="url" value={extra} disabled={busy}
        onChange={event => setExtra(event.target.value)}/></label>}
      <button className="primary back" disabled={busy || !title.trim()}><Plus size={17}/> Adicionar</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {!records.length && <p className="panel-empty">{empty}</p>}
    {records.map(item => <div className="workspace-record" key={item.id}>
      {'url' in item && typeof item.url === 'string' ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
        : 'done' in item && typeof item.done === 'boolean' ? <label><input type="checkbox" checked={item.done} onChange={event => {
            const done = event.target.checked;
            void change(current => ({materials: (current.materials ?? []).map(record => record.id === item.id ? {...record, done} : record)}), 'Item atualizado.');
          }}/>{item.title}</label>
        : <span>{item.title}</span>}
      {'cents' in item && typeof item.cents === 'number' && <strong>{currency.format(item.cents / 100)}</strong>}
      <Remove label={item.title} onClick={() => void change(current => ({
        [section]: (current[section] ?? []).filter(record => record.id !== item.id),
      }), 'Registro removido.')}/>
    </div>)}
  </section>;
}

async function encodeFile(file: File): Promise<WorkspaceFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({id: crypto.randomUUID(), name: file.name, mime: file.type, base64: String(reader.result).split(',', 2)[1]});
    reader.onerror = () => reject(new Error('Não foi possível ler “' + file.name + '”.'));
    reader.readAsDataURL(file);
  });
}

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif']);

function FilesPanel({files, save}: {files: WorkspaceFile[]; save: SaveWorkspace}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section id="workspace-files" className="detail-panel workspace-section" tabIndex={-1}>
    <div className="panel-heading"><h2><FileImage size={20}/> Imagens e arquivos</h2></div>
    <label className="workspace-upload">Adicionar arquivos
      <input type="file" multiple disabled={busy} onChange={async event => {
        const selected = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (!selected.length) return;
        setError('');
        if (selected.some(file => file.size > maxFileBytes)) {setError('Cada arquivo pode ter até 5 MB.'); return;}
        setBusy(true);
        try {
          const added = await Promise.all(selected.map(encodeFile));
          await save(current => ({files: [...(current.files ?? []), ...added]}), 'Arquivos adicionados.');
        } catch {setError('Não foi possível salvar os arquivos. Confira o espaço disponível no navegador.');}
        finally {setBusy(false);}
      }}/>
      <small>{busy ? 'Salvando arquivos…' : 'Até 5 MB por arquivo'}</small>
    </label>
    {error && <p className="error" role="alert">{error}</p>}
    {!files.length && <p className="panel-empty">Nenhuma imagem ou arquivo anexado.</p>}
    {files.map(file => <div className="workspace-record" key={file.id}>
      {imageTypes.has(file.mime) && <img loading="lazy" src={'data:' + file.mime + ';base64,' + file.base64} alt=""/>}
      <span>{file.name}</span>
      <a className="icon-button" title="Baixar arquivo" aria-label={'Baixar ' + file.name}
        href={'data:application/octet-stream;base64,' + file.base64} download={file.name}><Download size={17}/></a>
      <Remove label={file.name} onClick={async () => {
        setError('');
        try {await save(current => ({files: (current.files ?? []).filter(item => item.id !== file.id)}), 'Arquivo removido.');}
        catch {setError('Não foi possível remover o arquivo.');}
      }}/>
    </div>)}
  </section>;
}

export default function ProjectWorkspace({project, children, onSaved}: {
  project: Project;
  children: ReactNode;
  onSaved: (message: string) => void;
}) {
  const [customizing, setCustomizing] = useState(false);
  const workspace = project.workspace ?? {};
  const enabled = workspace.enabled ?? [];
  const sections = [
    {id: 'overview', label: 'Visão geral'}, {id: 'ideas', label: 'Ideias'},
    {id: 'tasks', label: 'Tarefas'}, {id: 'notes', label: 'Anotações'},
    {id: 'files', label: 'Imagens e arquivos'}, {id: 'history', label: 'Histórico'},
    ...optionalSections.filter(section => enabled.includes(section.id)),
  ];
  const save: SaveWorkspace = async (change, message) => {
    await updateProject(project.id, current => ({workspace: {...current.workspace, ...change(current.workspace ?? {})}}));
    onSaved(message);
  };

  return <>
    <nav className="workspace-nav" aria-label="Seções do projeto">
      {sections.map(({id, label}) => <button className="text-button" key={id} onClick={() => {
        const section = document.getElementById('workspace-' + id);
        section?.focus({preventScroll: true});
        section?.scrollIntoView({block: 'start'});
      }}>{label}</button>)}
      <button className="secondary" onClick={() => setCustomizing(true)}><Settings2 size={17}/> Personalizar seções</button>
    </nav>
    {children}
    <div className="detail-grid">
      <div className="detail-column">
        <TextPanel section="ideas" workspace={workspace} save={save}/>
        {enabled.includes('materials') && <TextPanel section="materials" workspace={workspace} save={save}/>}
        {enabled.includes('budget') && <TextPanel section="budget" workspace={workspace} save={save}/>}
      </div>
      <div className="detail-column">
        <FilesPanel files={workspace.files ?? []} save={save}/>
        {enabled.includes('links') && <TextPanel section="links" workspace={workspace} save={save}/>}
      </div>
    </div>
    {customizing && <Preferences enabled={enabled} save={save} onClose={() => setCustomizing(false)}/>}
  </>;
}

