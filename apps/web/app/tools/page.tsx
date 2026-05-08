import { Topbar } from "@/components/shell/Topbar";

export default function ToolsPage() {
  return (
    <>
      <Topbar title="Tools" subtitle="Usage analytics" />
      <section className="flex flex-1 flex-col gap-3 px-4 py-6 md:px-6">
        <p className="text-muted text-sm">
          Tool usage charts land in T11.
        </p>
      </section>
    </>
  );
}
