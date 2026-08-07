import { vi, it, expect, beforeEach, describe } from "vitest";
import { currentUser } from "@clerk/nextjs/server";
import { saveProject, fetchProjects, fetchProjectById, completeStep, deleteProject, editProject } from "./db";
import type { projectData, project } from "./definitions";

vi.mock("@clerk/nextjs/server");

// db.ts calls `neon(...)` once at module load to create `sql`, before any test
// runs — so the mock has to exist before db.ts is imported. vi.hoisted runs
// before both vi.mock factories and the imports below, so sqlMock is ready in time.
const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock("@neondatabase/serverless", () => ({
    neon: () => sqlMock,
}));

const mockedCurrentUser = vi.mocked(currentUser);

const baseData: projectData = {
    name: "Learn guitar",
    description: "Get through the basics",
    state: "active",
    steps: [
        { step_desc: "Buy a guitar", step_state: "active", step_order: 0, locked: true, project_id: "" },
        { step_desc: "Learn 3 chords", step_state: "pending", step_order: 1, locked: false, project_id: "" },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("saveProject", () => {
    it("returns an error when there is no authenticated user", async () => {
        mockedCurrentUser.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof currentUser>>);

        const result = await saveProject(baseData);

        expect(result).toEqual({ success: false, error: "Not authenticated" });
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it("returns an error when steps is not an array", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);

        // Casting past the type on purpose — this guards against server actions
        // getting called with bad data at runtime, where TS can't help.
        const result = await saveProject({ ...baseData, steps: "not-an-array" as unknown as projectData["steps"] });

        expect(result).toEqual({ success: false, error: "Invalid steps data" });
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it("inserts the project and each step, returning the new projectId", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([{ project_id: 42 }]);

        const result = await saveProject(baseData);

        expect(result).toEqual({ success: true, projectId: 42 });

        // 1 call for the project insert + 1 per step.
        expect(sqlMock).toHaveBeenCalledTimes(1 + baseData.steps.length);

        // A tagged template call is fn(stringsArray, ...interpolatedValues) —
        // slice(1) drops the strings array and leaves just what was interpolated.
        expect(sqlMock.mock.calls[0].slice(1)).toEqual([
            baseData.name,
            baseData.description,
            baseData.state,
            "user_123",
        ]);

        baseData.steps.forEach((step, i) => {
            expect(sqlMock.mock.calls[i + 1].slice(1)).toEqual([
                step.step_desc,
                step.step_state,
                step.step_order,
                step.locked,
                42,
            ]);
        });
    });

    it("returns a typed error instead of throwing when the insert fails", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockRejectedValueOnce(new Error("connection lost"));

        const result = await saveProject(baseData);

        expect(result).toEqual({ success: false, error: "connection lost" });
    });
});


describe("fetchProjects", () => {
    it("returns an error when there is no authenticated user", async () => {
        mockedCurrentUser.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof currentUser>>); // null currentuser

        const result = await fetchProjects();

        expect(result).toEqual({ success: false, error: "Not authenticated" });
        expect(sqlMock).not.toHaveBeenCalled(); // not called as we dont get to that point
    });

    it("returns an empty list without querying steps when there are no projects", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([]);
        // the project table is empty for said user
        const result = await fetchProjects();

        expect(result).toEqual({ success: true, projects: [] });
        // Only the projects query should run — the steps query is skipped entirely.
        expect(sqlMock).toHaveBeenCalledTimes(1);
        // we dont call for steps, as it return early
    });

    it("groups steps under their own project", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);

        const projectRows = [
            { project_id: 1, name: "Learn guitar", description: "Get through the basics", state: "active", userid: "user_123" },
            { project_id: 2, name: "Run a 5k", description: "Couch to 5k", state: "active", userid: "user_123" },
        ];
        const stepRows = [
            { step_id: "s1", step_desc: "Buy a guitar", step_state: "active", step_order: 0, locked: true, project_id: 1 },
            { step_id: "s2", step_desc: "Learn 3 chords", step_state: "pending", step_order: 1, locked: false, project_id: 1 },
            { step_id: "s3", step_desc: "Buy running shoes", step_state: "active", step_order: 0, locked: true, project_id: 2 },
        ];
        sqlMock.mockResolvedValueOnce(projectRows);
        sqlMock.mockResolvedValueOnce(stepRows);

        const result = await fetchProjects();

        expect(result).toEqual({
            success: true,
            projects: [
                { project_id: 1, name: "Learn guitar", description: "Get through the basics", state: "active", userid: "user_123", steps: [stepRows[0], stepRows[1]] },
                { project_id: 2, name: "Run a 5k", description: "Couch to 5k", state: "active", userid: "user_123", steps: [stepRows[2]] },
            ],
        });

        // Second call's interpolated arg is the array of ids pulled from the first call's rows.
        expect(sqlMock.mock.calls[1].slice(1)).toEqual([[1, 2]]);
    });

    it("returns a typed error instead of throwing when the query fails", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockRejectedValueOnce(new Error("connection lost"));

        const result = await fetchProjects();

        expect(result).toEqual({ success: false, error: "connection lost" });
    });
});


describe("fetchProjectById", () => {
    it("returns an error when there is no authenticated user", async () => {
        mockedCurrentUser.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof currentUser>>);

        const result = await fetchProjectById("p1");

        expect(result).toEqual({ success: false, error: "Not authenticated" });
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it("returns an error when the project doesn't exist (or isn't owned by the user)", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([]); // no matching row — ownership is enforced in the WHERE clause, not a separate check

        const result = await fetchProjectById("p1");

        expect(result).toEqual({ success: false, error: "Project not found" });
        // Short-circuits before the steps query ever runs.
        expect(sqlMock).toHaveBeenCalledTimes(1);
    });

    it("returns the project with its steps attached", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        const projectRow = { project_id: "p1", name: "Learn guitar", description: "Get through the basics", state: "active", userid: "user_123" };
        const stepRows = [
            { step_id: "s1", step_desc: "Buy a guitar", step_state: "active", step_order: 0, locked: true, project_id: "p1" },
        ];
        sqlMock.mockResolvedValueOnce([projectRow]);
        sqlMock.mockResolvedValueOnce(stepRows);

        const result = await fetchProjectById("p1");

        expect(result).toEqual({ success: true, project: { ...projectRow, steps: stepRows } });
    });

    it("returns a typed error instead of throwing when the query fails", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockRejectedValueOnce(new Error("connection lost"));

        const result = await fetchProjectById("p1");

        expect(result).toEqual({ success: false, error: "connection lost" });
    });
});


describe("completeStep", () => {
    it("returns an error when there is no authenticated user", async () => {
        mockedCurrentUser.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof currentUser>>);

        const result = await completeStep("p1", "s1");

        expect(result).toEqual({ success: false, error: "Not authenticated" });
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it("returns an error when the step doesn't exist (or isn't owned by the user)", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([]); // the UPDATE...RETURNING matched no row

        const result = await completeStep("p1", "s1");

        expect(result).toEqual({ success: false, error: "Step not found" });
        expect(sqlMock).toHaveBeenCalledTimes(1);
    });

    // The interesting part of this function: it branches on what "completing this
    // step" should trigger next, so each branch gets its own case rather than
    // just checking the return value once.

    it("completing the locked step returns immediately without cascading", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([{ project_id: "p1", step_order: 0, locked: true }]);

        const result = await completeStep("p1", "s0");

        expect(result).toEqual({ success: true, projectId: "p1" });
        // No "find the next step" lookup, no project update — locked is a dead end by design.
        expect(sqlMock).toHaveBeenCalledTimes(1);
    });

    it("completing a regular step activates the next one", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([{ project_id: "p1", step_order: 1, locked: false }]); // the completed step itself
        sqlMock.mockResolvedValueOnce([{ step_id: "s2" }]); // lookup for step_order 2

        const result = await completeStep("p1", "s1");

        expect(result).toEqual({ success: true, projectId: "p1" });
        expect(sqlMock).toHaveBeenCalledTimes(3);
        // 2nd call looks up step_order + 1 within the same project.
        expect(sqlMock.mock.calls[1].slice(1)).toEqual(["p1", 2]);
        // 3rd call activates that step by id — never trusts the caller for which step is "next".
        expect(sqlMock.mock.calls[2].slice(1)).toEqual(["s2"]);
    });

    it("completing the last step marks the project completed instead", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([{ project_id: "p1", step_order: 3, locked: false }]);
        sqlMock.mockResolvedValueOnce([]); // no next step exists

        const result = await completeStep("p1", "s3");

        expect(result).toEqual({ success: true, projectId: "p1" });
        expect(sqlMock).toHaveBeenCalledTimes(3);
        // 3rd call updates the project itself instead of a step, scoped by project_id + userid.
        expect(sqlMock.mock.calls[2].slice(1)).toEqual(["p1", "user_123"]);
    });

    it("returns a typed error instead of throwing when the update fails", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockRejectedValueOnce(new Error("connection lost"));

        const result = await completeStep("p1", "s1");

        expect(result).toEqual({ success: false, error: "connection lost" });
    });
});


describe("deleteProject", () => {
    it("returns an error when there is no authenticated user", async () => {
        mockedCurrentUser.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof currentUser>>);

        const result = await deleteProject("p1");

        expect(result).toEqual({ success: false, error: "Not authenticated" });
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it("returns an error when the project doesn't exist (or isn't owned by the user)", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([]);

        const result = await deleteProject("p1");

        expect(result).toEqual({ success: false, error: "Project not found" });
    });

    it("deletes the project when it exists and is owned by the user", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([{ project_id: "p1" }]);

        const result = await deleteProject("p1");

        expect(result).toEqual({ success: true, projectId: "p1" });
        // Scoped by userid too, not just project_id — same ownership pattern as everywhere else.
        expect(sqlMock.mock.calls[0].slice(1)).toEqual(["p1", "user_123"]);
    });

    it("returns a typed error instead of throwing when the delete fails", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockRejectedValueOnce(new Error("connection lost"));

        const result = await deleteProject("p1");

        expect(result).toEqual({ success: false, error: "connection lost" });
    });
});


describe("editProject", () => {
    const baseProject: project = {
        project_id: "p1",
        name: "Learn guitar",
        description: "Get through the basics",
        state: "active",
        userid: "user_123",
        steps: [
            { step_id: "s1", step_desc: "Buy a guitar", step_state: "active", step_order: 0, locked: true, project_id: "p1" },
            { step_id: "s2", step_desc: "Learn 3 chords", step_state: "pending", step_order: 1, locked: false, project_id: "p1" },
        ],
    };

    it("returns an error when there is no authenticated user", async () => {
        mockedCurrentUser.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof currentUser>>);

        const result = await editProject(baseProject);

        expect(result).toEqual({ success: false, error: "Not authenticated" });
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it("returns an error when steps is not an array", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);

        const result = await editProject({ ...baseProject, steps: "not-an-array" as unknown as project["steps"] });

        expect(result).toEqual({ success: false, error: "Invalid steps data" });
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it("returns an error when the project doesn't exist (or isn't owned by the user), before touching steps", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([]); // the project UPDATE matched nothing

        const result = await editProject(baseProject);

        expect(result).toEqual({ success: false, error: "Project not found" });
        // Fails before the steps DELETE/INSERT run — a rejected edit shouldn't touch existing steps.
        expect(sqlMock).toHaveBeenCalledTimes(1);
    });

    it("replaces all steps (delete then re-insert) after updating the project", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockResolvedValueOnce([{ project_id: "p1" }]); // the project UPDATE
        // DELETE + each step INSERT resolve to the default (undefined) — their return values are unused.

        const result = await editProject(baseProject);

        expect(result).toEqual({ success: true, projectId: "p1" });
        // call 0 = project UPDATE, call 1 = steps DELETE, calls 2.. = one INSERT per step.
        expect(sqlMock).toHaveBeenCalledTimes(2 + baseProject.steps.length);

        baseProject.steps.forEach((step, i) => {
            expect(sqlMock.mock.calls[i + 2].slice(1)).toEqual([
                step.step_desc,
                step.step_state,
                step.step_order,
                step.locked,
                baseProject.project_id,
            ]);
        });
    });

    it("returns a typed error instead of throwing when the update fails", async () => {
        mockedCurrentUser.mockResolvedValue({ id: "user_123" } as unknown as Awaited<ReturnType<typeof currentUser>>);
        sqlMock.mockRejectedValueOnce(new Error("connection lost"));

        const result = await editProject(baseProject);

        expect(result).toEqual({ success: false, error: "connection lost" });
    });
});
