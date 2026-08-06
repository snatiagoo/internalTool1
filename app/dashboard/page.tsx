"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { saveProject, deleteProject, editProject, fetchProjects, fetchProjectById, completeStep } from "../db";
import { projectData, project, step, stepData } from "../definitions";
import { PencilIcon } from "../ui/PencilIcon";
import { TrashIcon } from "../ui/TrashIcon";
import { CheckIcon } from "../ui/CheckIcon";

export default function Dashboard() {
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [projects, setProjects] = useState<project[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // `[]` means this runs once on mount, not on every re-render.
        fetchProjects().then((result) => {
            // Discriminated union — checking `.success` lets TS narrow which field is safe here.
            if (result.success) {
                setProjects(result.projects);
            } else {
                setLoadError(result.error);
            }
            setIsLoading(false);
        });
    }, []);

    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [editingProject, setEditingProject] = useState<project | null>(null);
    const [editExtraSteps, setEditExtraSteps] = useState(0);
    const [editError, setEditError] = useState<string | null>(null);

    // Order 0 = locked step, 1..N = regular. Always show >=3 step inputs so nothing looks cut off.
    const editRegularSteps = editingProject
        // Subtracting sorts ascending — `.sort()` expects a negative/zero/positive result.
        ? editingProject.steps.filter((s) => !s.locked).sort((a, b) => a.step_order - b.step_order)
        : [];
    const editBaseStepCount = Math.max(3, editRegularSteps.length);

    async function handleSave(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault(); // stops the browser from doing its default full-page reload on submit

        // e.currentTarget is the form; FormData reads every named input inside it.
        const formData = new FormData(e.currentTarget);
        // .get() returns `FormDataEntryValue | null`; `as string` asserts it's text.
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;
        const lockedStep = formData.get("locked_step") as string;
        const step1 = formData.get("step1") as string;
        const step2 = formData.get("step2") as string;
        const step3 = formData.get("step3") as string;

        // locked_step is order 0, step1-3 follow; blanks are dropped (step_desc is NOT NULL).
        const steps: step[] = [
            { step_desc: lockedStep, step_state: "active", step_order: 0, locked: true, project_id: "" },
            { step_desc: step1, step_state: "active", step_order: 1, locked: false, project_id: "" },
            { step_desc: step2, step_state: "pending", step_order: 2, locked: false, project_id: "" },
            { step_desc: step3, step_state: "pending", step_order: 3, locked: false, project_id: "" },
        ].filter((s) => s.step_desc.trim() !== "");

        const data: projectData = {
            name,
            description,
            state: "active",
            steps,
        };

        const result = await saveProject(data);

        if (result.success) {
            setError(null);
            setIsOpen(false);

            // Re-fetch instead of hand-building: saveProject doesn't return step_ids,
            // and the tick button needs real ones.
            const projectId = String(result.projectId);
            const fresh = await fetchProjectById(projectId);
            if (fresh.success) {
                // Function form builds on the latest state, not a possibly-stale `projects`.
                setProjects((prev) => [...prev, fresh.project]);
            }
        } else {
            setError(result.error);
        }
    }

    async function handleDeleteConfirm() {
        if (!confirmDeleteId) return;

        const result = await deleteProject(confirmDeleteId);

        if (result.success) {
            setProjects((prev) => prev.filter((p) => p.project_id !== confirmDeleteId));
            setDeleteError(null);
            setConfirmDeleteId(null);
        } else {
            setDeleteError(result.error);
        }
    }

    async function handleEditSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!editingProject) return;

        const formData = new FormData(e.currentTarget);
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;
        const lockedStepDesc = formData.get("locked_step") as string;

        const newSteps: stepData[] = [];

        if (lockedStepDesc.trim() !== "") {
            const originalLocked = editingProject.steps.find((s) => s.locked);
            newSteps.push({
                step_desc: lockedStepDesc,
                // `?.` avoids crashing if originalLocked is undefined; `?? "active"` supplies the fallback.
                step_state: originalLocked?.step_state ?? "active",
                step_order: 0,
                locked: true,
                project_id: editingProject.project_id,
                // Ignored server-side (editProject recreates steps) — only here to satisfy stepData's type.
                step_id: originalLocked?.step_id ?? "",
            });
        }

        let order = 1;
        for (let i = 0; i < editBaseStepCount + editExtraSteps; i++) {
            // `step${i+1}` matches each input's `name` below.
            const value = formData.get(`step${i + 1}`) as string;
            if (value.trim() === "") continue;

            // Carry over step_state for existing steps; new ones default to pending.
            const original = editRegularSteps[i];
            newSteps.push({
                step_desc: value,
                step_state: original?.step_state ?? "pending",
                step_order: order,
                locked: false,
                project_id: editingProject.project_id,
                step_id: original?.step_id ?? "",
            });
            order++;
        }

        const data: project = {
            project_id: editingProject.project_id,
            name,
            description,
            state: editingProject.state,
            userid: editingProject.userid,
            steps: newSteps,
        };

        const result = await editProject(data);

        if (result.success) {
            setEditError(null);
            setEditingProject(null);

            // Re-fetch instead of using `data`: editProject reassigns fresh step_ids we never see back.
            const fresh = await fetchProjectById(editingProject.project_id);
            if (fresh.success) {
                setProjects((prev) => prev.map((p) => (p.project_id === editingProject.project_id ? fresh.project : p)));
            }
        } else {
            setEditError(result.error);
        }
    }

    async function handleCompleteStep(project_id: string, step_id: string) {
        const result = await completeStep(project_id, step_id);
        if (!result.success) return;

        // Re-fetch instead of re-deriving the cascade in JS — completeStep may
        // activate the next step or complete the project, and the result doesn't say which.
        const fresh = await fetchProjectById(project_id);
        if (fresh.success) {
            setProjects((prev) => prev.map((p) => (p.project_id === project_id ? fresh.project : p)));
        }
    }
















    
    return (
        <div>
            <div className="px-6 pt-8">
                <h1 className="text-2xl font-semibold tracking-tight">Your projects</h1>
                <p className="mt-1 text-sm text-foreground/60">
                    {projects.length === 0
                        ? "Nothing here yet."
                        : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
                </p>
            </div>

            {loadError && (
                <p className="px-6 pt-4 text-sm text-red-500">{loadError}</p>
            )}

            {isLoading && (
                <p className="px-6 pt-6 text-sm text-foreground/50">Loading projects…</p>
            )}

            {!isLoading && !loadError && projects.length === 0 && (
                <p className="px-6 pt-6 text-sm text-foreground/50">
                    No projects yet — use the + button to create one.
                </p>
            )}

            <div className="grid grid-cols-2 gap-4 p-6">
                {projects.map((proj) => {
                    // Locked step is always active too, but excluded here — find the active non-locked one.
                    const activeStep = proj.steps.find((s) => s.step_state === "active" && !s.locked);

                    return (
                        <div
                            key={proj.project_id}
                            className="relative flex flex-col rounded-lg border border-foreground/10 bg-background p-4 shadow-sm transition hover:shadow-md"
                        >
                            <div className="absolute top-3 right-3 flex gap-1">
                                <button
                                    type="button"
                                    aria-label="Edit project"
                                    onClick={() => {
                                        setEditingProject(proj);
                                        setEditExtraSteps(0);
                                        setEditError(null);
                                    }}
                                    className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 transition hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                                >
                                    <PencilIcon />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Delete project"
                                    onClick={() => {
                                        setConfirmDeleteId(proj.project_id);
                                        setDeleteError(null);
                                    }}
                                    className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 transition hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                                >
                                    <TrashIcon />
                                </button>
                            </div>

                            <h3 className="pr-16 font-semibold">{proj.name}</h3>
                            <span className="mt-1 inline-block w-fit rounded-full border border-foreground/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/60">
                                {proj.state}
                            </span>

                            {/* Slightly light box so it doesn't compete with the card border. */}
                            <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-foreground/5 px-3 py-2">
                                <span className="text-sm text-foreground/80">
                                    {activeStep ? activeStep.step_desc : "No active step"}
                                </span>
                                {activeStep && (
                                    <button
                                        type="button"
                                        aria-label="Mark step done"
                                        onClick={() => handleCompleteStep(proj.project_id, activeStep.step_id)}
                                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-foreground/40 transition hover:bg-foreground/10 hover:text-foreground cursor-pointer"
                                    >
                                        <CheckIcon />
                                    </button>
                                )}
                            </div>

                            {/* proj.project_id here fills the `[id]` segment matched by app/project/[id]/page.tsx. */}
                            <Link
                                href={`/project/${proj.project_id}`}
                                className="mt-3 text-sm font-medium text-foreground/70 underline underline-offset-2 transition hover:text-foreground"
                            >
                                View details
                            </Link>
                        </div>
                    );
                })}
            </div>

            <button
                type="button"
                aria-label="Add"
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-2xl leading-none text-background shadow-lg transition hover:opacity-90 cursor-pointer"
            >
                +
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
                    <form onSubmit={handleSave} className="w-full sm:w-1/2 rounded-lg border border-foreground/10 bg-background p-6 shadow-xl">
                        <h2 className="text-lg font-semibold">New project</h2>

                        <div className="mt-4 flex flex-col gap-3">
                            <input
                                type="text"
                                placeholder="Name"
                                name="name"
                                className="rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40"
                            />
                            <input
                                type="text"
                                placeholder="Description"
                                name="description"
                                className="rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40"
                            />

                            <input
                                type="text"
                                name="locked_step"
                                placeholder="Important step"
                                className="rounded-md border-2 border-foreground bg-foreground/5 px-3 py-2 text-sm font-medium outline-none focus:border-foreground"
                            />

                            <input
                                type="text"
                                name="step1"
                                placeholder="Step 1"
                                className="rounded-md border border-foreground/10 bg-foreground/3 px-3 py-2 text-sm text-foreground/70 outline-none focus:border-foreground/30"
                            />
                            <input
                                type="text"
                                name="step2"
                                placeholder="Step 2"
                                className="rounded-md border border-foreground/10 bg-foreground/3 px-3 py-2 text-sm text-foreground/70 outline-none focus:border-foreground/30"
                            />
                            <input
                                type="text"
                                name="step3"
                                placeholder="Step 3"
                                className="rounded-md border border-foreground/10 bg-foreground/3 px-3 py-2 text-sm text-foreground/70 outline-none focus:border-foreground/30"
                            />
                        </div>

                        {error && (
                            <p className="mt-4 text-sm text-red-500">{error}</p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium transition hover:bg-foreground/5 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 cursor-pointer"
                            >
                                Save
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {editingProject && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
                    <form onSubmit={handleEditSubmit} className="w-full sm:w-1/2 rounded-lg border border-foreground/10 bg-background p-6 shadow-xl">
                        <h2 className="text-lg font-semibold">Edit project</h2>

                        <div className="mt-4 flex flex-col gap-3">
                            {/* `defaultValue` makes this uncontrolled — no state update per
                                keystroke; FormData reads the final value on submit. */}
                            <input
                                type="text"
                                placeholder="Name"
                                name="name"
                                defaultValue={editingProject.name}
                                className="rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40"
                            />
                            <input
                                type="text"
                                placeholder="Description"
                                name="description"
                                defaultValue={editingProject.description}
                                className="rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40"
                            />

                            <input
                                type="text"
                                name="locked_step"
                                placeholder="Important step"
                                defaultValue={editingProject.steps.find((s) => s.locked)?.step_desc ?? ""}
                                className="rounded-md border-2 border-foreground bg-foreground/5 px-3 py-2 text-sm font-medium outline-none focus:border-foreground"
                            />

                            {/* Array.from({length:N}) creates N slots to .map() over — the "render N things" trick. */}
                            {Array.from({ length: editBaseStepCount + editExtraSteps }).map((_, i) => (
                                <input
                                    key={i}
                                    type="text"
                                    name={`step${i + 1}`}
                                    placeholder={`Step ${i + 1}`}
                                    defaultValue={editRegularSteps[i]?.step_desc ?? ""}
                                    className="rounded-md border border-foreground/10 bg-foreground/3 px-3 py-2 text-sm text-foreground/70 outline-none focus:border-foreground/30"
                                />
                            ))}
                        </div>

                        <div className="mt-4 flex justify-center">
                            <button
                                type="button"
                                aria-label="Add step"
                                onClick={() => setEditExtraSteps((c) => c + 1)}
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/20 text-lg leading-none transition hover:bg-foreground/5 cursor-pointer"
                            >
                                +
                            </button>
                        </div>

                        {editError && (
                            <p className="mt-4 text-sm text-red-500">{editError}</p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setEditingProject(null)}
                                className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium transition hover:bg-foreground/5 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 cursor-pointer"
                            >
                                Save
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {confirmDeleteId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-lg border border-foreground/10 bg-background p-6 shadow-xl">
                        <h2 className="text-lg font-semibold">Delete project?</h2>
                        <p className="mt-2 text-sm text-foreground/70">
                            This will permanently delete the project and all of its steps. This cannot be undone.
                        </p>

                        {deleteError && (
                            <p className="mt-4 text-sm text-red-500">{deleteError}</p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium transition hover:bg-foreground/5 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 cursor-pointer"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
