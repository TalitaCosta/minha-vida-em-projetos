export const optionalSections = [
  {id: 'materials', label: 'Compras e materiais'},
  {id: 'budget', label: 'Orçamento'},
  {id: 'links', label: 'Links úteis'},
] as const;

export type OptionalSection = typeof optionalSections[number]['id'];
export const maxFileBytes = 5 * 1024 * 1024;

export interface WorkspaceItem {id: string; title: string}
export interface WorkspaceFile {id: string; name: string; mime: string; base64: string}
export interface Workspace {
  enabled?: OptionalSection[];
  ideas?: WorkspaceItem[];
  files?: WorkspaceFile[];
  materials?: (WorkspaceItem & {done: boolean})[];
  budget?: (WorkspaceItem & {cents: number})[];
  links?: (WorkspaceItem & {url: string})[];
}

export function webAddress(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function list(value: unknown, valid: (item: Record<string, unknown>) => boolean) {
  return value === undefined || (Array.isArray(value) && value.every(item =>
    object(item) && typeof item.id === 'string' && !!item.id && valid(item))
    && new Set(value.map(item => item.id)).size === value.length);
}

export function validWorkspace(value: unknown): value is Workspace | undefined {
  const title = (item: Record<string, unknown>) => typeof item.title === 'string' && !!item.title.trim();
  return value === undefined || (object(value)
    && (value.enabled === undefined || (Array.isArray(value.enabled)
      && value.enabled.every(id => optionalSections.some(section => section.id === id))
      && new Set(value.enabled).size === value.enabled.length))
    && list(value.ideas, title)
    && list(value.materials, item => title(item) && typeof item.done === 'boolean')
    && list(value.budget, item => title(item) && typeof item.cents === 'number' && Number.isSafeInteger(item.cents) && item.cents >= 0)
    && list(value.links, item => title(item) && typeof item.url === 'string' && !!webAddress(item.url))
    && list(value.files, item => typeof item.name === 'string' && !!item.name && typeof item.mime === 'string'
      && typeof item.base64 === 'string' && item.base64.length <= Math.ceil(maxFileBytes / 3) * 4
      && item.base64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(item.base64)
      && item.base64.length / 4 * 3 - (item.base64.endsWith('==') ? 2 : item.base64.endsWith('=') ? 1 : 0) <= maxFileBytes));
}
