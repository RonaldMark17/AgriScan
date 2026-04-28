export default function StatCard({ icon: Icon, label, value, helper, tone = 'leaf' }) {
  const tones = {
    leaf: 'bg-leaf-50 text-leaf-800 ring-leaf-100',
    soil: 'bg-soil-100 text-soil-800 ring-soil-100',
    sky: 'bg-skyfield text-sky-800 ring-sky-100',
    amber: 'bg-amber-50 text-amber-800 ring-amber-100',
  };

  return (
    <section className="surface rounded-lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-stone-500">{label}</p>
          <p className="mt-2 break-words text-3xl font-bold leading-none text-stone-950">{value}</p>
        </div>
        {Icon && (
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ring-1 ${tones[tone] || tones.leaf}`}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
      {helper && <p className="mt-3 text-sm leading-6 text-stone-600">{helper}</p>}
    </section>
  );
}
