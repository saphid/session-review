interface StatStripProps {
  turns: number;
  tools: number;
  skills: number;
  linked: number;
}

interface StatDef {
  key: "turns" | "tools" | "skills" | "linked";
  label: string;
  value: number;
}

/**
 * Four-up summary strip — TURNS · TOOLS · SKILLS · LINKED. Big tabular
 * numerics, small uppercase labels. Marked as a `role="list"` so the
 * spec can target it semantically and screen readers announce it as a
 * group.
 */
export function StatStrip({ turns, tools, skills, linked }: StatStripProps) {
  const stats: StatDef[] = [
    { key: "turns", label: "Turns", value: turns },
    { key: "tools", label: "Tools", value: tools },
    { key: "skills", label: "Skills", value: skills },
    { key: "linked", label: "Linked", value: linked },
  ];
  return (
    <ul
      role="list"
      aria-label="Session statistics"
      className="border-border bg-surface-low grid grid-cols-2 gap-px overflow-hidden rounded-md border min-[480px]:grid-cols-4"
    >
      {stats.map((stat) => (
        <li
          key={stat.key}
          data-stat={stat.key}
          className="bg-surface-low flex flex-col items-center gap-1 px-4 py-3 text-center"
        >
          <span
            data-slot="value"
            className="text-text text-2xl font-semibold leading-none tabular-nums tracking-tight"
          >
            {stat.value}
          </span>
          <span className="text-muted-strong text-xs font-medium uppercase tracking-[0.07em]">
            {stat.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
