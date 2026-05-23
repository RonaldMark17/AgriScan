export default function StatCard({ icon: Icon, label, value, helper, tone = 'leaf' }) {
  const tones = {
    leaf: 'border-leaf-100 bg-leaf-50 text-leaf-800 ring-leaf-100',
    soil: 'border-soil-100 bg-soil-50 text-soil-800 ring-soil-100',
    sky: 'border-sky-100 bg-sky-50 text-sky-800 ring-sky-100',
    amber: 'border-amber-100 bg-amber-50 text-amber-800 ring-amber-100',
  };

  return (
    <section className="surface stat-card rounded-lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="break-words text-xs font-bold uppercase text-stone-500">{label}</p>
          <p className="mt-2 break-words text-3xl font-bold leading-none text-stone-950">{value}</p>
        </div>
        {Icon && (
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg border ring-1 ${tones[tone] || tones.leaf}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {helper && <p className="mt-4 text-sm leading-6 text-stone-600">{helper}</p>}
    </section>
  );
}
