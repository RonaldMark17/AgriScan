import { Sprout } from 'lucide-react';

export default function EmptyState({ title, body, icon: Icon = Sprout, action }) {
  return (
    <div className="empty-state">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-leaf-100 bg-white text-leaf-700 ring-4 ring-leaf-50">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-base font-bold text-stone-950">{title}</h3>
      {body && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-stone-600">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
