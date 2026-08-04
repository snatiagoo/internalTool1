"use client";

import { useState } from "react";

export default function Dashboard() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div>
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
                    <div className="w-full max-w-md rounded-lg border border-foreground/10 bg-background p-6 shadow-xl">
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
                                
                                placeholder="Step 1"
                                className="rounded-md border border-foreground/10 bg-foreground/3 px-3 py-2 text-sm text-foreground/70 outline-none focus:border-foreground/30"
                            />
                            <input
                                type="text"
                                
                                placeholder="Step 2"
                                className="rounded-md border border-foreground/10 bg-foreground/3 px-3 py-2 text-sm text-foreground/70 outline-none focus:border-foreground/30"
                            />
                            <input
                                type="text"
                                
                                placeholder="Step 3"
                                className="rounded-md border border-foreground/10 bg-foreground/3 px-3 py-2 text-sm text-foreground/70 outline-none focus:border-foreground/30"
                            />
                        </div>

                        <div className="mt-4 flex justify-center">
                            <button
                                type="button"
                                aria-label="Add step"
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/20 text-lg leading-none transition hover:bg-foreground/5 cursor-pointer"
                            >
                                +
                            </button>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium transition hover:bg-foreground/5 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 cursor-pointer"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
