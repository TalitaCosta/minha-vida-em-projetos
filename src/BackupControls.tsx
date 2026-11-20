import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, Upload, X } from 'lucide-react';
import { exportBackup, readBackup, restoreBackup } from './backup';

const storageKey = 'minha-vida-em-projetos:last-backup-export';
const dateTime = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short'});
type Backup = Awaited<ReturnType<typeof readBackup>>;

function getLastExport() {
  try {
    const value = localStorage.getItem(storageKey);
    return value && Number.isFinite(Date.parse(value)) ? value : undefined;
  } catch {
    return undefined;
  }
}

function BackupPreview({backup, onClose, onRestored}: {backup: Backup; onClose: () => void; onRestored: () => void}) {
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function restore(event: FormEvent) {
    event.preventDefault();
    if (busy || (mode === 'replace' && !confirmed)) return;
    setBusy(true);
    setError('');
    try {
      await restoreBackup(backup, mode);
      onRestored();
    } catch {
      setError('Não foi possível restaurar o backup. Os dados anteriores foram preservados.');
      setBusy(false);
    }
  }

  const counts = backup.projects.reduce((total, project) => ({
    tasks: total.tasks + project.tasks.length,
    ideas: total.ideas + (project.workspace?.ideas?.length ?? 0),
    notes: total.notes + (project.notes?.length ?? 0),
    activities: total.activities + (project.activities?.length ?? 0),
    materials: total.materials + (project.workspace?.materials?.length ?? 0),
    files: total.files + (project.workspace?.files?.length ?? 0),
  }), {tasks: 0, ideas: 0, notes: 0, activities: 0, materials: 0, files: 0});

  return <dialog ref={dialog} className="modal backup-preview" aria-labelledby="backup-preview-title" onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <form onSubmit={restore}>
      <div className="modal-head"><h2 id="backup-preview-title">Prévia do backup</h2>
        <button className="icon-button" type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={20}/></button>
      </div>
      <fieldset className="form backup-preview-fields" disabled={busy}>
        <p className="muted">Formato v{backup.version}{backup.exportedAt && <> · Exportado em {dateTime.format(new Date(backup.exportedAt))}</>}</p>
        <dl className="backup-counts">
          {[
            ['Projetos', backup.projects.length], ['Tarefas', counts.tasks], ['Ideias', counts.ideas],
            ['Anotações', counts.notes], ['Atividades', counts.activities], ['Planejamentos', backup.weeklyPlans.length],
            ['Compras e materiais', counts.materials], ['Arquivos', counts.files],
          ].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
        </dl>
        {!!backup.projects.length && <details><summary>Ver nomes dos projetos</summary>
          <ul className="backup-project-names">{backup.projects.map(project => <li key={project.id}>{project.name}</li>)}</ul>
        </details>}
        <div className="backup-modes" role="group" aria-label="Modo de restauração">
          <label><input type="radio" name="backup-mode" checked={mode === 'merge'} onChange={() => {setMode('merge'); setConfirmed(false);}}/>
            <span><strong>Mesclar dados</strong><small>Substitui registros correspondentes e mantém os demais.</small></span>
          </label>
          <label><input type="radio" name="backup-mode" checked={mode === 'replace'} onChange={() => setMode('replace')}/>
            <span><strong>Restauração completa</strong><small>Substitui todo o conteúdo atual pelo conteúdo do backup.</small></span>
          </label>
        </div>
        {mode === 'replace' && <div className="backup-warning">
          <p>Projetos, planejamentos e anexos ausentes neste backup serão removidos. {backup.version < 6 && 'Um backup antigo pode não incluir todos os tipos de dados atuais.'}</p>
          <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
            Confirmo a substituição dos dados atuais.
          </label>
        </div>}
        {error && <p className="error" role="alert">{error}</p>}
      </fieldset>
      <div className="modal-actions"><span className="grow"/>
        <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="primary" disabled={busy || (mode === 'replace' && !confirmed)}>
          {busy ? 'Restaurando…' : mode === 'replace' ? 'Substituir dados' : 'Restaurar e mesclar'}
        </button>
      </div>
    </form>
  </dialog>;
}

export default function BackupControls({onSaved}: {onSaved: (message: string) => void}) {
  const [lastExport, setLastExport] = useState(getLastExport);
  const [busy, setBusy] = useState<'export' | 'import'>();
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Backup>();
  const input = useRef<HTMLInputElement>(null);
  return <div className="backup-controls">
    <div className="backup">
      <button className="secondary" disabled={!!busy} onClick={async () => {
        setError('');
        setBusy('export');
        try {
          const exportedAt = await exportBackup();
          setLastExport(exportedAt);
          try {localStorage.setItem(storageKey, exportedAt);} catch { /* Mantém a data na sessão. */ }
          onSaved('Backup exportado. Confira o arquivo nos downloads.');
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'Não foi possível exportar o backup.');
        } finally {setBusy(undefined);}
      }}><Download size={17}/> {busy === 'export' ? 'Exportando…' : 'Exportar backup'}</button>
      <button className="secondary" disabled={!!busy} onClick={() => input.current?.click()}>
        <Upload size={17}/> {busy === 'import' ? 'Validando…' : 'Importar backup'}
      </button>
      <input ref={input} type="file" hidden accept=".zip,.json,application/zip,application/json" onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        setError('');
        setBusy('import');
        try {setPreview(await readBackup(file));}
        catch (reason) {
          const detail = reason instanceof Error && !(reason instanceof SyntaxError) ? ' ' + reason.message : '';
          setError('Não foi possível validar o backup.' + detail);
        } finally {setBusy(undefined);}
      }}/>
    </div>
    <p className="backup-date">
      {lastExport ? <>Última exportação: <time dateTime={lastExport}>{dateTime.format(new Date(lastExport))}</time>. A data indica que o download foi iniciado. Confira se o arquivo ainda está disponível.</>
        : 'Nenhuma exportação registrada neste navegador.'}
    </p>
    {error && <p className="error" role="alert">{error}</p>}
    {preview && <BackupPreview backup={preview} onClose={() => setPreview(undefined)} onRestored={() => {
      setPreview(undefined);
      onSaved('Backup restaurado.');
    }}/>}
  </div>;
}

