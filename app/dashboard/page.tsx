"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { saveProject, deleteProject, editProject, fetchProjects } from "../db";
import { projectData, project, step } from "../definitions";

function PencilIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    );
}

export default function Dashboard() {
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [projects, setProjects] = useState<project[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        // The `[]` at the end means "run this effect once, right after the
        // first render" — not on every re-render. An effect with no array
        // at all would run after every single render, which we don't want here.
        fetchProjects().then((result) => {
            // `result` is a "discriminated union": either { success: true, projects }
            // or { success: false, error }. Checking `result.success` first lets
            // TypeScript know which of those two shapes we're holding, so it allows
            // `result.projects` in this branch and `result.error` in the other.
            if (result.success) {
                setProjects(result.projects);
            } else {
                setLoadError(result.error);
            }
        });
    }, []);

    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [editingProject, setEditingProject] = useState<project | null>(null);
    const [editExtraSteps, setEditExtraSteps] = useState(0);
    const [editError, setEditError] = useState<string | null>(null);

    // Steps typed at creation always have order 0 = locked step, then 1..N
    // for the regular ones. Always show at least 3 regular-step inputs in
    // the edit form, even if the project has fewer, so nothing looks cut off.
    const editRegularSteps = editingProject
        // `(a, b) => a.step_order - b.step_order` is the standard way to sort
        // numbers ascending: .sort() expects a negative/zero/positive number
        // back, and subtracting does exactly that.
        ? editingProject.steps.filter((s) => !s.locked).sort((a, b) => a.step_order - b.step_order)
        : [];
    const editBaseStepCount = Math.max(3, editRegularSteps.length);

    async function handleSave(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault(); // stops the browser from doing its default full-page reload on submit

        // e.currentTarget is the <form> element itself; FormData reads the
        // current value of every input inside it that has a `name` attribute.
        const formData = new FormData(e.currentTarget);
        // .get() always returns `FormDataEntryValue | null` (it could be a File
        // for a file input), so `as string` just tells TypeScript "trust me,
        // this is a text input, treat it as a string".
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;
        const lockedStep = formData.get("locked_step") as string;
        const step1 = formData.get("step1") as string;
        const step2 = formData.get("step2") as string;
        const step3 = formData.get("step3") as string;

        // locked_step is always step_order 0; step1-3 fill in after it.
        // Empty step inputs are dropped since step_desc is NOT NULL in the DB.
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

            // saveProject returns projectId as a number (straight from Postgres),
            // but our `project` type stores it as a string, so convert it here.
            const projectId = String(result.projectId);
            // `(prev) => [...prev, newItem]` — using a function form, rather than
            // `[...projects, newItem]` — guarantees we're building on top of the
            // actual latest state, not a possibly-stale `projects` variable from
            // this render. `...prev` copies all the existing projects into a new
            // array before adding the new one (state should never be mutated directly).
            setProjects((prev) => [
                ...prev,
                {
                    project_id: projectId,
                    name,
                    description,
                    state: "active",
                    userid: "",
                    // `{ ...s, project_id: projectId }` copies every field of `s`
                    // and then overwrites just `project_id` with the real one.
                    steps: steps.map((s) => ({ ...s, project_id: projectId })),
                },
            ]);
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

        const newSteps: step[] = [];

        if (lockedStepDesc.trim() !== "") {
            const originalLocked = editingProject.steps.find((s) => s.locked);
            newSteps.push({
                step_desc: lockedStepDesc,
                // `?.` ("optional chaining") reads .step_state only if
                // originalLocked actually exists, giving undefined instead of
                // crashing if it doesn't. `?? "active"` ("nullish coalescing")
                // then swaps in "active" if that result was null/undefined.
                step_state: originalLocked?.step_state ?? "active",
                step_order: 0,
                locked: true,
                project_id: editingProject.project_id,
            });
        }

        let order = 1;
        for (let i = 0; i < editBaseStepCount + editExtraSteps; i++) {
            // Template literal: `step${i + 1}` builds the strings "step1",
            // "step2", etc. to match the `name` attribute each input below was
            // rendered with.
            const value = formData.get(`step${i + 1}`) as string;
            if (value.trim() === "") continue;

            // Carry over the original step_state for steps that already
            // existed; new ones (added via "+") default to pending.
            const original = editRegularSteps[i];
            newSteps.push({
                step_desc: value,
                step_state: original?.step_state ?? "pending",
                step_order: order,
                locked: false,
                project_id: editingProject.project_id,
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
            setProjects((prev) => prev.map((p) => (p.project_id === editingProject.project_id ? data : p)));
            setEditingProject(null);
        } else {
            setEditError(result.error);
        }
    }

    return (
        <div>
            {loadError && (
                <p className="px-6 pt-6 text-sm text-red-500">{loadError}</p>
            )}

            <div className="grid grid-cols-2 gap-4 p-6">
                {projects.map((proj) => {
                    // The locked step is always "active" too (see saveProject/
                    // handleSave), but we don't want it shown here — so this
                    // looks for the first active step that ISN'T the locked one.
                    const activeStep = proj.steps.find((s) => s.step_state === "active" && !s.locked);

                    return (
                        <div key={proj.project_id} className="relative rounded-lg border border-foreground/10 bg-background p-4 shadow-sm">
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
                            <p className="mt-1 text-xs uppercase tracking-wide text-foreground/50">{proj.state}</p>
                            <p className="mt-2 text-sm text-foreground/70">
                                {activeStep ? activeStep.step_desc : "No active step"}
                            </p>

                            {/* The `[id]` folder in app/project/[id]/page.tsx matches
                                whatever value sits in this spot of the URL — so filling
                                it in with proj.project_id here is what makes that page's
                                `params.id` equal to this specific project's id. */}
                            <Link
                                href={`/project/${proj.project_id}`}
                                className="mt-3 inline-block text-sm font-medium underline underline-offset-2"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <form onSubmit={handleEditSubmit} className="w-full sm:w-1/2 rounded-lg border border-foreground/10 bg-background p-6 shadow-xl">
                        <h2 className="text-lg font-semibold">Edit project</h2>

                        <div className="mt-4 flex flex-col gap-3">
                            {/* `defaultValue` (not `value`) makes this an "uncontrolled"
                                input: React sets the starting text, then hands control
                                to the browser — typing doesn't trigger a state update on
                                every keystroke. We only read the final text back out via
                                FormData when the form is submitted. */}
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

                            {/* Array.from({ length: N }) makes an array of N empty
                                slots just so we can .map() over it — a common trick for
                                "render this many things" when there's no real array to
                                loop over. `key` just needs to be unique among these
                                inputs so React can track which is which between renders. */}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
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
