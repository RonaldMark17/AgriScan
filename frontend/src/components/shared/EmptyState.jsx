import { Sprout } from 'lucide-react';

export default function EmptyState({ title, body, icon: Icon = Sprout, action }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center sm:p-8">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white text-leaf-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-base font-bold text-stone-950">{title}</h3>
      {body && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-stone-600">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
