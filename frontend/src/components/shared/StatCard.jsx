export default function StatCard({ icon: Icon, label, value, helper, tone = 'leaf' }) {
  const tones = {
    leaf: 'bg-leaf-100 text-leaf-800',
    soil: 'bg-soil-100 text-soil-800',
    sky: 'bg-skyfield text-sky-800',
    amber: 'bg-amber-100 text-amber-800',
  };

  return (
    <section className="surface rounded-lg p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{value}</p>
        </div>
        {Icon && (
          <div className={`grid h-12 w-12 place-items-center rounded-lg ${tones[tone]}`}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
      {helper && <p className="mt-3 text-sm text-stone-500">{helper}</p>}
    </section>
  );
}
