import { Lock } from 'lucide-react';
import { type Task } from './db';

export default function DependencyBadge({pending}: {pending: Task[]}) {
  if (!pending.length) return null;
  return <span className="dependency-block">
    <span className="attention-badge amber"><Lock size={14}/> Bloqueada</span>
    <small>Aguardando {pending.map(task => task.title).join(', ')}</small>
  </span>;
}
