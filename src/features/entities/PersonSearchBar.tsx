import { useEffect, useState } from 'react';

export type Filters = {
  q?: string;
  hasCF?: boolean;
  hasDOB?: boolean;
  hasAddr?: boolean;
  hasTitle?: boolean;
  confMin?: number;
  sort?: 'name' | 'confidence' | 'occ';
};

export function PersonSearchBar({ value, onChange }: { value: Filters; onChange: (v: Filters) => void }) {
  const [local, setLocal] = useState<Filters>(value);
  useEffect(() => { setLocal(value); }, [value]);

  useEffect(() => {
    const t = setTimeout(() => onChange(local), 200);
    return () => clearTimeout(t);
  }, [local]);

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 border-b">
      <input
        className="flex-1 min-w-[240px] px-3 py-2 border rounded-lg outline-none"
        placeholder="Cerca nome, CF, indirizzo, email…"
        value={local.q ?? ''}
        onChange={e => setLocal(v => ({ ...v, q: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter' && !local.q) onChange({ ...local, q: '' }); }}
      />
      <div className="flex items-center gap-2">
        <Chip checked={!!local.hasCF} label="Ha CF" onChange={c => setLocal(v => ({ ...v, hasCF: c }))} />
        <Chip checked={!!local.hasDOB} label="Ha data nascita" onChange={c => setLocal(v => ({ ...v, hasDOB: c }))} />
        <Chip checked={!!local.hasAddr} label="Ha indirizzo" onChange={c => setLocal(v => ({ ...v, hasAddr: c }))} />
        <Chip checked={!!local.hasTitle} label="Ha titolo" onChange={c => setLocal(v => ({ ...v, hasTitle: c }))} />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm">Conf. ≥</label>
        <input
          type="number"
          min={0}
          max={1}
          step={0.1}
          className="w-20 px-2 py-2 border rounded-lg"
          value={local.confMin ?? 0}
          onChange={e => setLocal(v => ({ ...v, confMin: Number(e.target.value) }))}
        />
      </div>
      <select
        className="px-3 py-2 border rounded-lg"
        value={local.sort ?? 'name'}
        onChange={e => setLocal(v => ({ ...v, sort: e.target.value as any }))}
      >
        <option value="name">Ordina: Nome</option>
        <option value="confidence">Ordina: Confidenza</option>
        <option value="occ">Ordina: Occorrenze</option>
      </select>
      <button
        className="px-3 py-2 border rounded-lg hover:bg-neutral-50"
        onClick={() => onChange({ q: '', hasCF: false, hasDOB: false, hasAddr: false, confMin: 0, sort: 'name' })}
        title="Azzera filtri"
      >
        Reset
      </button>
    </div>
  );
}

function Chip({ checked, label, onChange }: { checked: boolean; label: string; onChange: (c: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`px-3 py-1 rounded-full text-sm border ${checked ? 'bg-neutral-200' : 'bg-white hover:bg-neutral-50'}`}
      aria-pressed={checked}
    >
      {label}
    </button>
  );
}


