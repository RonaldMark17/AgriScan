export default function StatCard({ icon: Icon, label, value, helper, tone = 'leaf' }) {
  const tones = {
    leaf: 'border-emerald-200/60 bg-emerald-50/80 text-emerald-700 shadow-sm shadow-emerald-500/10',
    soil: 'border-amber-200/60 bg-amber-50/80 text-amber-700 shadow-sm shadow-amber-500/10',
    sky: 'border-sky-200/60 bg-sky-50/80 text-sky-700 shadow-sm shadow-sky-500/10',
    amber: 'border-amber-200/60 bg-amber-50/80 text-amber-700 shadow-sm shadow-amber-500/10',
  };

  return (
    <section className="surface stat-card rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-950/5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="break-words text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-2.5 break-words text-3xl font-black tracking-tight text-slate-900">{value}</p>
        </div>
        {Icon && (
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${tones[tone] || tones.leaf}`}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
      {helper && <p className="mt-3 text-xs leading-relaxed text-slate-500">{helper}</p>}
    </section>
  );
}
