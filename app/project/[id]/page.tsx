import { fetchProjectById } from "@/app/db";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await fetchProjectById(id);

    if (!result.success) {
        return <p className="p-6 text-sm text-red-500">{result.error}</p>;
    }

    const project = result.project;

    // The steps come back already sorted by step_order (fetchProjectById's
    // SQL query has an ORDER BY), so no client-side sorting needed here.
    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="mt-1 text-sm text-foreground/60">{project.state}</p>
            <p className="mt-4">{project.description}</p>

            <ul className="mt-6 flex flex-col gap-2">
                {project.steps.map((step) => (
                    <li key={step.step_order}>
                        {step.step_desc} — {step.step_state}
                    </li>
                ))}
            </ul>
        </div>
    );
}