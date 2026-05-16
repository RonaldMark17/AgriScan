export default function StatCard({ icon: Icon, label, value, helper, tone = 'leaf' }) {
  const tones = {
    leaf: 'border-leaf-100 bg-leaf-50 text-leaf-800',
    soil: 'border-stone-200 bg-stone-50 text-soil-800',
    sky: 'border-sky-100 bg-sky-50 text-sky-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
  };

  return (
    <section className="surface rounded-lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-stone-500">{label}</p>
          <p className="mt-2 break-words text-2xl font-bold leading-none text-stone-950">{value}</p>
        </div>
        {Icon && (
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${tones[tone] || tones.leaf}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {helper && <p className="mt-3 text-sm leading-6 text-stone-600">{helper}</p>}
    </section>
  );
}
