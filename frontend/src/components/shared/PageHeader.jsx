export default function PageHeader({ eyebrow, title, body, actions }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 break-words text-2xl font-bold leading-tight text-stone-950 sm:text-3xl">{title}</h1>
        {body && <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{body}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div>}
    </div>
  );
}
