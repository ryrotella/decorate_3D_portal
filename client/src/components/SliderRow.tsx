/** Compact slider row for transform controls */
export function SliderRow({ label, value, min, max, step, onChange, suffix }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-[10px] text-gray-500 w-6 shrink-0">{label}</label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-blue-500"
      />
      <span className="text-[10px] text-gray-500 w-12 text-right shrink-0">
        {typeof value === 'number' ? value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0) : value}{suffix ?? ''}
      </span>
    </div>
  );
}
