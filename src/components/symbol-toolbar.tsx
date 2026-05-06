"use client";

const SYMBOL_GROUPS = [
  {
    label: "逻辑",
    symbols: ["∧", "∨", "¬", "→", "↔", "∀", "∃"]
  },
  {
    label: "集合",
    symbols: ["∈", "∉", "⊆", "⊂", "∪", "∩", "∅"]
  },
  {
    label: "常用",
    symbols: ["∴", "∵", "≠", "=", "≤", "≥"]
  }
] as const;

type SymbolToolbarProps = {
  onInsert: (symbol: string) => void;
  className?: string;
};

export function SymbolToolbar({ onInsert, className }: SymbolToolbarProps) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
        {SYMBOL_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">{group.label}</span>
            {group.symbols.map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => onInsert(symbol)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
              >
                {symbol}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
