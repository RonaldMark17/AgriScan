import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';

export function StatusBadge({ status = 'active', children }) {
  const normalized = String(status || 'active').toLowerCase();
  const tones = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-400/20',
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-400/20',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-400/20',
    verified: 'border-emerald-200 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-400/20',
    suspended: 'border-amber-200 bg-amber-50 text-amber-800 ring-1 ring-amber-400/20',
    pending: 'border-amber-200 bg-amber-50 text-amber-800 ring-1 ring-amber-400/20',
    pending_review: 'border-sky-200 bg-sky-50 text-sky-800 ring-1 ring-sky-400/20',
    unread: 'border-sky-200 bg-sky-50 text-sky-800 ring-1 ring-sky-400/20',
    disabled: 'border-rose-200 bg-rose-50 text-rose-800 ring-1 ring-rose-400/20',
    rejected: 'border-rose-200 bg-rose-50 text-rose-800 ring-1 ring-rose-400/20',
    failed: 'border-rose-200 bg-rose-50 text-rose-800 ring-1 ring-rose-400/20',
    read: 'border-slate-200 bg-slate-50 text-slate-700',
    draft: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border ${tones[normalized] || tones.draft}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${normalized.includes('active') || normalized.includes('approved') ? 'bg-emerald-500' : normalized.includes('suspended') || normalized.includes('pending') ? 'bg-amber-500' : 'bg-slate-400'}`} />
      {children || labelize(status)}
    </span>
  );
}

export function SeverityBadge({ severity = 'info' }) {
  const normalized = String(severity || 'info').toLowerCase();
  const tones = {
    critical: 'border-rose-200 bg-rose-50 text-rose-800 ring-1 ring-rose-400/20',
    high: 'border-rose-200 bg-rose-50 text-rose-800 ring-1 ring-rose-400/20',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 ring-1 ring-amber-400/20',
    medium: 'border-amber-200 bg-amber-50 text-amber-800 ring-1 ring-amber-400/20',
    info: 'border-sky-200 bg-sky-50 text-sky-800 ring-1 ring-sky-400/20',
    low: 'border-emerald-200 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-400/20',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${tones[normalized] || tones.info}`}>
      {labelize(normalized)}
    </span>
  );
}

export function SearchFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  filters = [],
  actions,
}) {
  return (
    <div className="surface rounded-2xl p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="field field-leading-icon min-h-11 rounded-xl text-sm"
              type="search"
              value={search}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
          {filters.length ? (
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <label key={filter.id} className="relative min-w-[10rem] flex-1 sm:flex-none">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    className="field field-leading-icon min-h-11 rounded-xl text-xs font-semibold"
                    value={filter.value}
                    onChange={(event) => filter.onChange?.(event.target.value)}
                    aria-label={filter.label}
                  >
                    {filter.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  getRowKey,
  loading = false,
  emptyTitle = 'No records found',
  emptyBody = 'Try adjusting your search or filters.',
  page = 1,
  pageSize = 10,
  onPageChange,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const pageCount = Math.max(1, Math.ceil(safeRows.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const startIndex = (currentPage - 1) * pageSize;
  const visibleRows = safeRows.slice(startIndex, startIndex + pageSize);
  const showingStart = safeRows.length === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(startIndex + pageSize, safeRows.length);

  return (
    <section className="surface overflow-hidden rounded-3xl border border-slate-200/80 shadow-sm">
      {loading ? (
        <div className="grid min-h-48 place-items-center p-8 text-sm font-semibold text-slate-500">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            Loading records...
          </span>
        </div>
      ) : safeRows.length === 0 ? (
        <div className="p-8 text-center">
          <div className="empty-state">
            <Search className="mx-auto h-9 w-9 text-slate-300" />
            <h3 className="mt-3 text-base font-extrabold text-slate-900">{emptyTitle}</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{emptyBody}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-shell overflow-x-auto rounded-none border-0 shadow-none">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/75">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500 ${column.headerClassName || ''}`}>
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleRows.map((row, index) => (
                  <tr
                    key={getRowKey ? getRowKey(row) : row.id ?? index}
                    className="transition hover:bg-slate-50/70"
                  >
                    {columns.map((column) => (
                      <td key={column.key} className={`px-5 py-4 align-middle ${column.className || ''}`}>
                        {column.render ? column.render(row) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-slate-500">
              Showing <span className="font-bold text-slate-700">{showingStart}–{showingEnd}</span> of <span className="font-bold text-slate-700">{safeRows.length}</span> records
            </p>
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary h-9 rounded-xl px-3 text-xs font-bold"
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onPageChange?.(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
                Page {currentPage} of {pageCount}
              </span>
              <button
                className="btn-secondary h-9 rounded-xl px-3 text-xs font-bold"
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => onPageChange?.(currentPage + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function FormSection({ title, body, children, icon: Icon }) {
  return (
    <section className="surface rounded-3xl border border-slate-200/80 p-6 shadow-sm">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon ? (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
          {body ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-md animate-in fade-in">
      <div className="surface modal-panel w-full max-w-lg overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl animate-in zoom-in-95">
        <div className="flex shrink-0 items-start gap-3.5 p-6 pb-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${danger ? 'bg-rose-50 text-rose-600 border border-rose-200/60' : 'bg-emerald-50 text-emerald-600 border border-emerald-200/60'}`}>
            {danger ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
            {body ? <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{body}</p> : null}
          </div>
          <button className="btn-icon ml-auto h-9 w-9 rounded-xl" type="button" onClick={onCancel} aria-label="Close modal">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children ? <div className="px-6 pb-2">{children}</div> : null}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/50 p-6 sm:flex-row sm:justify-end">
          <button className="btn-secondary h-11 rounded-xl px-5" type="button" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button className={`${danger ? 'btn-danger' : 'btn-primary'} h-11 rounded-xl px-5`} type="button" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="surface rounded-2xl p-5 shadow-sm">
          <div className="h-4 w-1/3 animate-pulse rounded-lg bg-slate-200" />
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function ChartCard({ title, body, actions, children }) {
  return (
    <section className="surface rounded-3xl p-6 sm:p-7 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h2>
          {body ? <p className="mt-1 text-xs text-slate-500">{body}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function NotificationCard({ notification, onMarkRead }) {
  const isUnread = !notification?.is_read;

  return (
    <article className={`rounded-2xl border p-5 transition-all duration-200 ${isUnread ? 'border-emerald-200 bg-emerald-50/60 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50/50'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-sm font-extrabold text-slate-900">{notification.title}</h3>
            <StatusBadge status={isUnread ? 'unread' : 'read'}>{isUnread ? 'Unread' : 'Read'}</StatusBadge>
            <StatusBadge status="draft">{labelize(notification.type || 'system')}</StatusBadge>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">{notification.body}</p>
          <p className="mt-3 text-[11px] font-semibold text-slate-400">{formatDateTime(notification.created_at)}</p>
        </div>
        {isUnread ? (
          <button className="btn-secondary h-8 rounded-xl px-3 text-xs font-bold" type="button" onClick={() => onMarkRead?.(notification)}>
            Mark read
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function CropCard({ title, meta, status, children, actions }) {
  return (
    <article className="surface rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-950/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-extrabold text-slate-900">{title}</h3>
          {meta ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{meta}</p> : null}
        </div>
        {status ? <StatusBadge status={status}>{labelize(status)}</StatusBadge> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{actions}</div> : null}
    </article>
  );
}

export function ReportCard({ title, value, body, icon: Icon }) {
  return (
    <article className="surface rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-950/5">
      <div className="flex items-start gap-4">
        {Icon ? (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm">
            <Icon className="h-6 w-6" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
          <p className="mt-1.5 text-2xl font-black text-slate-900">{value}</p>
          {body ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p> : null}
        </div>
      </div>
    </article>
  );
}

export function labelize(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
