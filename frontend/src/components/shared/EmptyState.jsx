import { Sprout } from 'lucide-react';

export default function EmptyState({ title, body }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center">
      <Sprout className="mx-auto h-10 w-10 text-leaf-700" />
      <h3 className="mt-3 text-base font-semibold text-stone-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-stone-500">{body}</p>
    </div>
  );
}
