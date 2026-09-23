import type { ReactNode } from 'react';
import { LoaderCircle, AlertCircle, ArrowRight, Sun } from 'lucide-react';
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Loading…
    </div>
  );
}
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={18} />
      <span>{children}</span>
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <Sun size={28} />
      <p>{children}</p>
    </div>
  );
}
export function Arrow() {
  return <ArrowRight size={18} aria-hidden="true" />;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      {status.toLowerCase().replaceAll('_', ' ')}
    </span>
  );
}
