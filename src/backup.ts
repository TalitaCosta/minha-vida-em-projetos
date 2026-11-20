import { db, statuses, type Project, type Status, type WeeklyPlan } from './db';
import { validDateKey } from './weekDates';
import { findPlan, planKey } from './weeklyPlans';
import { dependencyError } from './taskDependencies';
import { maxFileBytes, validWorkspace } from './workspace';

const zipVersion = 6;
const format = 'minha-vida-em-projetos';
const maxBackupBytes = 512 * 1024 * 1024;
type Backup = {version: number; projects: Project[]; weeklyPlans: WeeklyPlan[]; exportedAt?: string};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function strings(value: Record<string, unknown>, ...keys: string[]) {
  return keys.every(key => typeof value[key] === 'string');
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function project(value: unknown): value is Project {
  return record(value)
    && strings(value, 'id', 'name', 'description', 'category', 'deadline', 'nextAction', 'createdAt', 'updatedAt')
    && statuses.includes(value.status as Status)
    && ['Baixa', 'Média', 'Alta'].includes(String(value.priority))
    && validWorkspace(value.workspace)
    && Array.isArray(value.tasks)
    && value.tasks.every(task => record(task) && strings(task, 'id', 'title') && typeof task.done === 'boolean'
      && (task.dependsOn === undefined || (Array.isArray(task.dependsOn)
        && task.dependsOn.every(id => typeof id === 'string') && new Set(task.dependsOn).size === task.dependsOn.length)));
}

function entries(value: unknown, notes: boolean) {
  return value === undefined || (Array.isArray(value) && value.every(entry =>
    record(entry) && strings(entry, 'id', 'text') && timestamp(entry.createdAt)
    && (!notes || timestamp(entry.updatedAt))));
}

function weeklyPlan(value: unknown): value is WeeklyPlan {
  return record(value) && strings(value, 'id', 'projectId', 'taskId')
    && validDateKey(value.date)
    && (value.priority === 'Baixa' || value.priority === 'Média' || value.priority === 'Alta')
    && (value.transferredTo === undefined || validDateKey(value.transferredTo));
}

function validateData(data: unknown, zipped = false): Backup {
  if (!record(data) || typeof data.version !== 'number'
    || !(zipped ? data.version === zipVersion : [1, 2, 3, 4, 5].includes(data.version))
    || !Array.isArray(data.projects) || !data.projects.every(project)
    || new Set(data.projects.map(p => p.id)).size !== data.projects.length
    || data.projects.some(p => !p.id.trim() || dependencyError(p.tasks))
    || (data.version !== 1 && !data.projects.every(p => entries(p.notes, true) && entries(p.activities, false)))) {
    throw new Error('Formato inválido');
  }
  const plans = data.version >= 3 ? data.weeklyPlans : [];
  if (!Array.isArray(plans) || !plans.every(weeklyPlan)
    || new Set(plans.map(plan => plan.id)).size !== plans.length
    || new Set(plans.map(planKey)).size !== plans.length) throw new Error('Planejamentos inválidos');
  return {version: data.version, projects: data.projects, weeklyPlans: plans};
}

type ManifestEntry = {path: string; size: number; sha256: string};

function browserBytes(bytes: Uint8Array) {
  return bytes.buffer instanceof ArrayBuffer
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : Uint8Array.from(bytes);
}

async function integrity(path: string, bytes: Uint8Array): Promise<ManifestEntry> {
  const digest = await crypto.subtle.digest('SHA-256', browserBytes(bytes));
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return {path, size: bytes.byteLength, sha256};
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}

function manifestEntry(value: unknown): value is ManifestEntry {
  return record(value) && typeof value.path === 'string' && /^(dados\.json|arquivos\/\d+\/\d+\.bin)$/.test(value.path)
    && typeof value.size === 'number' && Number.isSafeInteger(value.size) && value.size >= 0
    && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256);
}

async function readZip(file: File): Promise<Backup> {
  const {unzipSync} = await import('fflate');
  const names = new Set<string>();
  let uncompressed = 0;
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {filter: entry => {
    const {name, originalSize, compression, size} = entry;
    if (names.has(name) || !/^(manifesto\.json|dados\.json|arquivos\/\d+\/\d+\.bin)$/.test(name)) {
      throw new Error('Estrutura ZIP inválida.');
    }
    names.add(name);
    if (compression === 0 && size !== originalSize) throw new Error('Tamanho de entrada ZIP inválido.');
    uncompressed += originalSize;
    if (uncompressed > maxBackupBytes || (name.startsWith('arquivos/') && originalSize > maxFileBytes)) {
      throw new Error('O conteúdo do ZIP excede o limite de restauração.');
    }
    return true;
  }});
  if (!archive['manifesto.json']) throw new Error('O ZIP não contém o manifesto do backup.');
  const manifest = parseJson(archive['manifesto.json']);
  if (!record(manifest) || manifest.format !== format || manifest.version !== zipVersion || !timestamp(manifest.exportedAt)
    || !Array.isArray(manifest.entries) || !manifest.entries.every(manifestEntry)
    || new Set(manifest.entries.map(entry => entry.path)).size !== manifest.entries.length
    || names.size !== manifest.entries.length + 1) throw new Error('Manifesto inválido ou versão incompatível.');
  for (const entry of manifest.entries) {
    const bytes = archive[entry.path];
    if (!bytes || bytes.length !== entry.size || (await integrity(entry.path, bytes)).sha256 !== entry.sha256) {
      throw new Error('Falha na verificação de integridade do backup.');
    }
  }
  if (!archive['dados.json']) throw new Error('O ZIP não contém os dados do backup.');
  const data = parseJson(archive['dados.json']);
  if (!record(data) || !Array.isArray(data.projects)) throw new Error('Dados inválidos.');
  const used = new Set(['manifesto.json', 'dados.json']);
  for (const project of data.projects) {
    if (!record(project) || !record(project.workspace) || !Array.isArray(project.workspace.files)) continue;
    project.workspace.files = project.workspace.files.map((file: unknown) => {
      if (!record(file) || typeof file.path !== 'string' || !/^arquivos\/\d+\/\d+\.bin$/.test(file.path)
        || used.has(file.path) || !archive[file.path]) throw new Error('Referência a anexo inválida.');
      const {path, ...metadata} = file;
      used.add(path);
      const bytes = archive[path];
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 16384) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
      }
      return {...metadata, base64: btoa(binary)};
    });
  }
  if (used.size !== names.size) throw new Error('O ZIP contém anexos sem referência.');
  return {...validateData(data, true), exportedAt: manifest.exportedAt};
}

export async function readBackup(file: File): Promise<Backup> {
  if (file.size > maxBackupBytes) throw new Error('O backup ultrapassa o limite de 512 MB.');
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (header[0] === 0x50 && header[1] === 0x4b) return readZip(file);
  return validateData(JSON.parse(await file.text()));
}

export async function restoreBackup(backup: Backup, mode: 'merge' | 'replace') {
  await db.transaction('rw', [db.projects, db.weeklyPlans], async () => {
    if (mode === 'replace') {
      await db.weeklyPlans.clear();
      await db.projects.clear();
      await db.projects.bulkAdd(backup.projects);
      await db.weeklyPlans.bulkAdd(backup.weeklyPlans);
      return;
    }
    if (backup.version < 5) {
      const existing = await db.projects.bulkGet(backup.projects.map(p => p.id));
      const projects = backup.projects.map((p, i) => {
        const previous = existing[i];
        const ids = new Set(p.tasks.map(task => task.id));
        const oldTasks = new Map(previous?.tasks.map(task => [task.id, task]));
        const tasks = p.tasks.map(task => {
          const dependsOn = task.dependsOn ?? (backup.version < 4 ? oldTasks.get(task.id)?.dependsOn?.filter(id => ids.has(id)) : undefined);
          return dependsOn === undefined ? task : {...task, dependsOn};
        });
        const error = dependencyError(tasks);
        if (error) throw new Error(error);
        return {...p, tasks, workspace: p.workspace ?? previous?.workspace,
          ...(backup.version === 1 ? {notes: previous?.notes, activities: previous?.activities} : {})};
      });
      await db.projects.bulkPut(projects);
    } else {
      await db.projects.bulkPut(backup.projects);
    }
    // Clear previous positions for incoming IDs before restoring moves that swap dates.
    if (backup.weeklyPlans.length) await db.weeklyPlans.bulkDelete(backup.weeklyPlans.map(plan => plan.id));
    for (const plan of backup.weeklyPlans) {
      const conflict = await findPlan(plan);
      if (conflict && conflict.id !== plan.id) await db.weeklyPlans.delete(conflict.id);
      await db.weeklyPlans.put(plan);
    }
  });
}

export async function exportBackup() {
  const {zipSync, strToU8} = await import('fflate');
  const backup = await db.transaction('r', [db.projects, db.weeklyPlans], async () => ({
    version: zipVersion, projects: await db.projects.toArray(), weeklyPlans: await db.weeklyPlans.toArray(),
  }));
  const archive: Record<string, Uint8Array> = {};
  let uncompressed = 0;
  const projects = backup.projects.map((project, projectIndex) => {
    if (!project.workspace?.files) return project;
    const files = project.workspace.files.map(({base64, ...file}, fileIndex) => {
      const path = `arquivos/${projectIndex}/${fileIndex}.bin`;
      const binary = atob(base64);
      if (binary.length > maxFileBytes) throw new Error('Um anexo ultrapassa o limite de 5 MB.');
      uncompressed += binary.length;
      if (uncompressed > maxBackupBytes) throw new Error('O backup ultrapassa o limite de 512 MB.');
      archive[path] = Uint8Array.from(binary, character => character.charCodeAt(0));
      return {...file, path};
    });
    return {...project, workspace: {...project.workspace, files}};
  });
  archive['dados.json'] = strToU8(JSON.stringify({...backup, projects}));
  const exportedAt = new Date().toISOString();
  const entries: ManifestEntry[] = [];
  for (const [path, bytes] of Object.entries(archive)) entries.push(await integrity(path, bytes));
  archive['manifesto.json'] = strToU8(JSON.stringify({format, version: zipVersion, exportedAt, entries}, null, 2));
  if (uncompressed + archive['dados.json'].length + archive['manifesto.json'].length > maxBackupBytes) {
    throw new Error('O backup ultrapassa o limite de 512 MB.');
  }
  const zip = zipSync(archive, {level: 0});
  if (zip.length > maxBackupBytes) throw new Error('O backup ultrapassa o limite de 512 MB.');
  const blob = new Blob([browserBytes(zip)], {type: 'application/zip'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `projetos-backup-${exportedAt.slice(0, 10)}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return exportedAt;
}
