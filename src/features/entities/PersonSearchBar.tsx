import { useEffect, useState } from 'react';

export type Filters = { q?: string };

export function PersonSearchBar({ value, onChange }: { value: Filters; onChange: (v: Filters) => void }) {
  const [local, setLocal] = useState<Filters>(value);
  useEffect(() => { setLocal(value); }, [value]);

  useEffect(() => {
    const t = setTimeout(() => onChange(local), 200);
    return () => clearTimeout(t);
  }, [local]);

  return (
    <div className="flex items-center gap-2 p-2 border-b">
      <input
        className="flex-1 min-w-[240px] px-3 py-2 border rounded-lg outline-none"
        placeholder="Cerca nome, CF, indirizzo, email…"
        value={local.q ?? ''}
        onChange={e => setLocal(v => ({ ...v, q: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter') onChange({ ...local }); }}
      />
    </div>
  );
}

// (chips rimossi)


