"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchProjectById, completeStep } from "@/app/db";
import { project } from "@/app/definitions";
import { LockIcon } from "@/app/ui/LockIcon";
import { CheckIcon } from "@/app/ui/CheckIcon";

export default function ProjectPage() {
    // useParams reads `[id]` directly — not a Promise, since client components can't be async.
    const params = useParams<{ id: string }>();
    const id = params.id;

    const [proj, setProj] = useState<project | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchProjectById(id).then((result) => {
            if (result.success) {
                setProj(result.project);
            } else {
                setError(result.error);
            }
            setIsLoading(false);
        });
    }, [id]);

    async function handleCompleteStep(step_id: string) {
        if (!proj) return;

        const result = await completeStep(proj.project_id, step_id);
        if (!result.success) return;

        // Re-fetch instead of guessing — completeStep may cascade server-side.
        const fresh = await fetchProjectById(proj.project_id);
        if (fresh.success) {
            setProj(fresh.project);
        }
    }

    if (isLoading) {
        return <p className="p-6 text-sm text-foreground/50">Loading…</p>;
    }

    if (error || !proj) {
        return (
            <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                <p className="text-sm text-red-500">{error}</p>
                <Link href="/dashboard" className="text-sm text-foreground/60 underline underline-offset-2 transition hover:text-foreground">
                    Back to dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-2xl px-6 py-12">
            <Link href="/dashboard" className="text-sm text-foreground/50 transition hover:text-foreground">
                ← Back to dashboard
            </Link>

            <div className="mt-6">
                <span className="inline-block rounded-full border border-foreground/15 px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground/60">
                    {proj.state}
                </span>

                <h1 className="mt-4 text-3xl font-semibold tracking-tight">{proj.name}</h1>
                <p className="mt-3 text-foreground/70">{proj.description}</p>
            </div>

            <div className="mt-10">
                <h2 className="text-sm font-medium uppercase tracking-wide text-foreground/50">Steps</h2>

                <ul className="mt-3 flex flex-col gap-2">
                    {proj.steps.map((step) => (
                        <li
                            key={step.step_id}
                            className="flex items-center justify-between gap-3 rounded-md border border-foreground/10 bg-foreground/5 px-4 py-3"
                        >
                            <span className="flex items-center gap-2 text-sm">
                                {step.locked && (
                                    <span className="text-foreground/40" aria-label="Locked step">
                                        <LockIcon />
                                    </span>
                                )}
                                {step.step_desc}
                            </span>

                            <span className="flex shrink-0 items-center gap-2">
                                <span
                                    className={
                                        step.step_state === "active"
                                            ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
                                            : "rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/50"
                                    }
                                >
                                    {step.step_state}
                                </span>

                                <button
                                    type="button"
                                    aria-label="Mark step done"
                                    onClick={() => handleCompleteStep(step.step_id)}
                                    className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/40 transition hover:bg-foreground/10 hover:text-foreground cursor-pointer"
                                >
                                    <CheckIcon />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
