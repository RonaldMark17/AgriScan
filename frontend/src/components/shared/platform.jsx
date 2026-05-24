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

export function StatusBadge({ status = 'active', children }) {
  const normalized = String(status || 'active').toLowerCase();
  const tones = {
    active: 'border-leaf-100 bg-leaf-50 text-leaf-800',
    approved: 'border-leaf-100 bg-leaf-50 text-leaf-800',
    success: 'border-leaf-100 bg-leaf-50 text-leaf-800',
    verified: 'border-leaf-100 bg-leaf-50 text-leaf-800',
    suspended: 'border-amber-100 bg-amber-50 text-amber-800',
    pending: 'border-amber-100 bg-amber-50 text-amber-800',
    pending_review: 'border-sky-100 bg-sky-50 text-sky-800',
    unread: 'border-sky-100 bg-sky-50 text-sky-800',
    disabled: 'border-red-100 bg-red-50 text-red-700',
    rejected: 'border-red-100 bg-red-50 text-red-700',
    failed: 'border-red-100 bg-red-50 text-red-700',
    read: 'border-stone-200 bg-stone-50 text-stone-700',
    draft: 'border-stone-200 bg-stone-50 text-stone-700',
  };

  return (
    <span className={`status-pill border ${tones[normalized] || tones.draft}`}>
      {children || labelize(status)}
    </span>
  );
}

export function SeverityBadge({ severity = 'info' }) {
  const normalized = String(severity || 'info').toLowerCase();
  const tones = {
    critical: 'border-red-200 bg-red-50 text-red-700',
    high: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    medium: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    low: 'border-leaf-200 bg-leaf-50 text-leaf-800',
  };

  return (
    <span className={`status-pill border ${tones[normalized] || tones.info}`}>
      {labelize(normalized)}
    </span>
  );
}

export function SearchFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search',
  filters = [],
  actions,
}) {
  return (
    <div className="surface rounded-lg p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              className="field field-leading-icon min-h-10"
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
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <select
                    className="field field-leading-icon min-h-10"
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
        {actions ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
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
    <section className="surface overflow-hidden rounded-lg">
      {loading ? (
        <div className="grid min-h-40 place-items-center p-6 text-sm font-semibold text-stone-500">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-leaf-700" />
            Loading records...
          </span>
        </div>
      ) : safeRows.length === 0 ? (
        <div className="p-4">
          <div className="empty-state">
            <Search className="mx-auto h-8 w-8 text-stone-400" />
            <h3 className="mt-3 text-base font-bold text-stone-950">{emptyTitle}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-stone-600">{emptyBody}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-shell rounded-none border-0 shadow-none">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className={`px-4 py-3 ${column.headerClassName || ''}`}>
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visibleRows.map((row, index) => (
                  <tr key={getRowKey ? getRowKey(row) : row.id ?? index}>
                    {columns.map((column) => (
                      <td key={column.key} className={`px-4 py-3 align-top ${column.className || ''}`}>
                        {column.render ? column.render(row) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-stone-100 bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-stone-600">
              Showing {showingStart}-{showingEnd} of {safeRows.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onPageChange?.(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="status-pill border border-stone-200 bg-white text-stone-700">
                Page {currentPage} of {pageCount}
              </span>
              <button
                className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
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
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700 ring-1 ring-leaf-100">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          {body ? <p className="mt-1 text-sm leading-6 text-stone-600">{body}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-stone-950/45 p-4 backdrop-blur-sm sm:items-center">
      <div className="surface modal-panel w-full max-w-lg rounded-lg bg-white p-5">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${danger ? 'bg-red-50 text-red-700' : 'bg-leaf-50 text-leaf-700'}`}>
            {danger ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-stone-950">{title}</h2>
            {body ? <p className="mt-2 text-sm leading-6 text-stone-600">{body}</p> : null}
          </div>
          <button className="btn-icon ml-auto h-9 w-9" type="button" onClick={onCancel} aria-label="Close modal">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} type="button" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="surface rounded-lg p-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-stone-200" />
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

export function ChartCard({ title, body, actions, children }) {
  return (
    <section className="surface rounded-lg p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          {body ? <p className="mt-1 text-sm leading-6 text-stone-600">{body}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function NotificationCard({ notification, onMarkRead }) {
  const isUnread = !notification?.is_read;

  return (
    <article className={`rounded-lg border p-4 transition ${isUnread ? 'border-leaf-200 bg-leaf-50/70' : 'border-stone-200 bg-white hover:bg-stone-50'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-sm font-bold text-stone-950">{notification.title}</h3>
            <StatusBadge status={isUnread ? 'unread' : 'read'}>{isUnread ? 'Unread' : 'Read'}</StatusBadge>
            <StatusBadge status="draft">{labelize(notification.type || 'system')}</StatusBadge>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600">{notification.body}</p>
          <p className="mt-3 text-xs font-semibold text-stone-400">{formatDateTime(notification.created_at)}</p>
        </div>
        {isUnread ? (
          <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" type="button" onClick={() => onMarkRead?.(notification)}>
            Mark read
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function CropCard({ title, meta, status, children, actions }) {
  return (
    <article className="surface rounded-lg p-4 transition hover:border-leaf-200 hover:bg-leaf-50/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-bold text-stone-950">{title}</h3>
          {meta ? <p className="mt-1 text-sm leading-6 text-stone-600">{meta}</p> : null}
        </div>
        {status ? <StatusBadge status={status}>{labelize(status)}</StatusBadge> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}

export function ReportCard({ title, value, body, icon: Icon }) {
  return (
    <article className="surface rounded-lg p-4">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700 ring-1 ring-leaf-100">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="panel-heading">{title}</p>
          <p className="mt-1 text-2xl font-bold text-stone-950">{value}</p>
          {body ? <p className="mt-1 text-sm leading-6 text-stone-600">{body}</p> : null}
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
