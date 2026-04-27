export default function PageHeader({ eyebrow, title, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="text-xs font-bold uppercase tracking-wide text-leaf-700">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-stone-950 sm:text-3xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
