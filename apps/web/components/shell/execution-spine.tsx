export function ExecutionSpine({
  stages,
}: {
  stages: Array<{ label: string; value: string }>;
}) {
  return (
    <ol className="divide-y divide-line border-y border-line" aria-label="Execution spine">
      {stages.map((stage) => (
        <li key={stage.label} className="flex min-h-11 items-center justify-between gap-4 text-sm">
          <span className="tracking-[0.14em] text-dim">{stage.label}</span>
          <span className="num">{stage.value}</span>
        </li>
      ))}
    </ol>
  );
}
