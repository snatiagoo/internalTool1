'use server';

import { currentUser } from "@clerk/nextjs/server";
import { projectData, project, stepData, SaveProjectResult, FetchProjectsResult, FetchProjectResult } from "./definitions";
import { neon } from "@neondatabase/serverless";

const sql = neon(`${process.env.DATABASE_URL}`);


export async function saveProject(data: projectData): Promise<SaveProjectResult> {
    // imports currentUser 
    const user = await currentUser();
    // Typed result instead of throw, so callers can branch on `.success`.
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    const { name, description, state, steps } = data;

    // Server actions bypass TS at runtime, so validate `steps` is actually an array.
    if(!Array.isArray(steps)) return { success: false, error: "Invalid steps data" };

    // DB already enforces NOT NULL; this just turns any failure into a typed error.
    // sql is returned from neon, which is imported and callable "neon()"
    // sql returns an object with a property project_id
    try {
        const [project] = await sql`
            INSERT INTO projects (name, description, state, userid)
            VALUES (${name}, ${description}, ${state}, ${userId})
            RETURNING project_id
        `;
        const projectId = project.project_id;

        for(let i = 0; i<steps.length; i++){
            const { step_desc, step_state, step_order, locked } = steps[i];

            await sql`
                INSERT INTO steps (step_desc, step_state, step_order, locked, project_id)
                VALUES (${step_desc}, ${step_state}, ${step_order}, ${locked}, ${projectId})
            `;
        }
        // idk how I should look at the for loop from a vitest perspective? Maybe as data is a fake I have created
        // I just inser the steps.length value I have given it?

        return { success: true, projectId };
    } catch (err) {
        // narrow `unknown` before reading `.message`

        const message = err instanceof Error ? err.message : "Failed to save project";
        return { success: false, error: message };
    }
    // function should return object with success and either projectId or error property string
    // depending on the test im doing
}



export async function fetchProjects(): Promise<FetchProjectsResult>{
    const user = await currentUser();
    //again we need the mock of that
    // Typed result instead of throw, so callers can branch on `.success`.
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;
    // mock the try catch as well
    try {
        // sql has to be hoisted and then neon mocked with the mocked sql
        const projectRows = await sql`
            SELECT project_id, name, description, state, userid
            FROM projects
            WHERE userid = ${userId}
        `;
        // you have to mock the resolved value of projectRows for that case (length 0)?

        // No projects -> skip the steps round trip entirely.
        if(projectRows.length === 0) return { success: true, projects: [] };

        const projectIds = projectRows.map((row) => row.project_id);

        // One query for all steps (avoids N+1), grouped by project below.
        const stepRows = await sql`
            SELECT step_id, step_desc, step_state, step_order, locked, project_id
            FROM steps
            WHERE project_id = ANY(${projectIds})
            ORDER BY step_order
        `;

        const stepsByProjectId = new Map<number, stepData[]>();
        for(const row of stepRows){
            const existing = stepsByProjectId.get(row.project_id) ?? [];
            existing.push(row as stepData);
            stepsByProjectId.set(row.project_id, existing);
        }

        const projects: project[] = projectRows.map((row) => ({
            project_id: row.project_id,
            name: row.name,
            description: row.description,
            state: row.state,
            userid: row.userid,
            steps: stepsByProjectId.get(row.project_id) ?? [],
        }));
        // just mock the resolved value of projects 

        return { success: true, projects };
    } catch (err) {
        // mock for a typed error instead of throwing
        const message = err instanceof Error ? err.message : "Failed to fetch projects";
        return { success: false, error: message };
    }
}


export async function fetchProjectById(project_id: string): Promise<FetchProjectResult> {
    const user = await currentUser();
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    try {
        // Scoped by userId, same as elsewhere.
        const [projectRow] = await sql`
            SELECT project_id, name, description, state, userid
            FROM projects
            WHERE project_id = ${project_id} AND userid = ${userId}
        `;

        if(!projectRow) return { success: false, error: "Project not found" };

        const stepRows = await sql`
            SELECT step_id, step_desc, step_state, step_order, locked, project_id
            FROM steps
            WHERE project_id = ${project_id}
            ORDER BY step_order
        `;

        const fetchedProject: project = {
            project_id: projectRow.project_id,
            name: projectRow.name,
            description: projectRow.description,
            state: projectRow.state,
            userid: projectRow.userid,
            steps: stepRows as stepData[],
        };

        return { success: true, project: fetchedProject };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch project";
        return { success: false, error: message };
    }
}


// Identifies the step by step_id (project_id kept for defense-in-depth, like
// userid elsewhere). step_order/locked come from RETURNING, not params —
// don't trust the caller for anything behavior-affecting.
export async function completeStep(project_id: string, step_id: string): Promise<SaveProjectResult> {
    const user = await currentUser();
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    try {
        // Joins to projects to check ownership without a separate SELECT.
        const [updated] = await sql`
            UPDATE steps
            SET step_state = 'completed'
            FROM projects
            WHERE steps.project_id = projects.project_id
              AND steps.step_id = ${step_id}
              AND steps.project_id = ${project_id}
              AND projects.userid = ${userId}
            RETURNING steps.project_id, steps.step_order, steps.locked
        `;

        if(!updated) return { success: false, error: "Step not found" };

        // The locked step never cascades — completing it does nothing else.
        if(updated.locked) return { success: true, projectId: updated.project_id };

        const [nextStep] = await sql`
            SELECT step_id
            FROM steps
            WHERE project_id = ${project_id} AND step_order = ${updated.step_order + 1}
        `;

        if(nextStep){
            await sql`UPDATE steps SET step_state = 'active' WHERE step_id = ${nextStep.step_id}`;
        } else {
            // No next step -> this was the last one, so the project itself is done.
            await sql`UPDATE projects SET state = 'completed' WHERE project_id = ${project_id} AND userid = ${userId}`;
        }

        return { success: true, projectId: updated.project_id };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to complete step";
        return { success: false, error: message };
    }
}


export async function deleteProject(project_id: string): Promise<SaveProjectResult> {
    const user = await currentUser();
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    try {
        // Scoped by userId like editProject; steps cascade-delete automatically via FK.
        const [deleted] = await sql`
            DELETE FROM projects
            WHERE project_id = ${project_id} AND userid = ${userId}
            RETURNING project_id
        `;

        if(!deleted) return { success: false, error: "Project not found" };

        return { success: true, projectId: deleted.project_id };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete project";
        return { success: false, error: message };
    }
}


export async function editProject(data: project): Promise<SaveProjectResult> {
    const user = await currentUser();
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    // data.userid ignored — never trust client-supplied userid, use the authenticated one.
    const { project_id, name, description, state, steps } = data;

    // Same as saveProject: validate `steps` is an array before looping.
    if(!Array.isArray(steps)) return { success: false, error: "Invalid steps data" };

    try {
        // Scope by userId too — project_id alone isn't secret, so anyone could guess it.
        const [updated] = await sql`
            UPDATE projects
            SET name = ${name}, description = ${description}, state = ${state}
            WHERE project_id = ${project_id} AND userid = ${userId}
            RETURNING project_id
        `;

        // No row matched -> not found or not owned; fail before touching steps.
        if(!updated) return { success: false, error: "Project not found" };

        // Full replace: drop the old steps, then insert the current set.
        await sql`DELETE FROM steps WHERE project_id = ${project_id}`;

        for(let i = 0; i < steps.length; i++){
            const { step_desc, step_state, step_order, locked } = steps[i];

            await sql`
                INSERT INTO steps (step_desc, step_state, step_order, locked, project_id)
                VALUES (${step_desc}, ${step_state}, ${step_order}, ${locked}, ${project_id})
            `;
        }

        return { success: true, projectId: updated.project_id };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to edit project";
        return { success: false, error: message };
    }
}