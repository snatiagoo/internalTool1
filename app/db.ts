'use server';

import { currentUser } from "@clerk/nextjs/server";
import { projectData, project, step, SaveProjectResult, FetchProjectsResult, FetchProjectResult } from "./definitions";
import { neon } from "@neondatabase/serverless";

const sql = neon(`${process.env.DATABASE_URL}`);


export async function saveProject(data: projectData): Promise<SaveProjectResult> {

    const user = await currentUser();
    // Return a typed result instead of throwing so the caller (a form/UI)
    // can branch on `.success` instead of needing a try/catch of its own.
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    const { name, description, state, steps } = data;

    // `projectData` types `steps` as an array, but this is a server action —
    // it's reachable from the client without going through TypeScript, so a
    // malformed request could send `steps` as undefined/null/non-array and
    // crash on `steps.length` below before we ever hit the DB.
    if(!Array.isArray(steps)) return { success: false, error: "Invalid steps data" };

    // Postgres already enforces NOT NULL on every column via the schema, so
    // we don't duplicate that validation here — we just need to turn a DB
    // failure (bad data, connection issue, etc.) into a typed error instead
    // of an unhandled rejection.
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

        return { success: true, projectId };
    } catch (err) {
        // err is `unknown` in TS catch blocks, so narrow before reading `.message`.
        const message = err instanceof Error ? err.message : "Failed to save project";
        return { success: false, error: message };
    }
}



export async function fetchProjects(): Promise<FetchProjectsResult>{
    const user = await currentUser();
    // Return a typed result instead of throwing so the caller (a form/UI)
    // can branch on `.success` instead of needing a try/catch of its own.
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    try {
        const projectRows = await sql`
            SELECT project_id, name, description, state, userid
            FROM projects
            WHERE userid = ${userId}
        `;

        // No projects -> skip the steps round trip entirely.
        if(projectRows.length === 0) return { success: true, projects: [] };

        const projectIds = projectRows.map((row) => row.project_id);

        // One query for all steps across every project, instead of one
        // query per project (N+1), then group them back up in JS below.
        const stepRows = await sql`
            SELECT step_desc, step_state, step_order, locked, project_id
            FROM steps
            WHERE project_id = ANY(${projectIds})
            ORDER BY step_order
        `;

        const stepsByProjectId = new Map<number, step[]>();
        for(const row of stepRows){
            const existing = stepsByProjectId.get(row.project_id) ?? [];
            existing.push(row as step);
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

        return { success: true, projects };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch projects";
        return { success: false, error: message };
    }
}


export async function fetchProjectById(project_id: string): Promise<FetchProjectResult> {
    const user = await currentUser();
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    try {
        // Scoped by userId, same ownership reasoning as everywhere else here.
        const [projectRow] = await sql`
            SELECT project_id, name, description, state, userid
            FROM projects
            WHERE project_id = ${project_id} AND userid = ${userId}
        `;

        if(!projectRow) return { success: false, error: "Project not found" };

        const stepRows = await sql`
            SELECT step_desc, step_state, step_order, locked, project_id
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
            steps: stepRows as step[],
        };

        return { success: true, project: fetchedProject };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch project";
        return { success: false, error: message };
    }
}


export async function deleteProject(project_id: string): Promise<SaveProjectResult> {
    const user = await currentUser();
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    try {
        // Scoped by userId for the same ownership reason as editProject.
        // steps.project_id has ON DELETE CASCADE, so its rows are removed
        // automatically — no separate DELETE FROM steps needed here.
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

    // `data.userid` is ignored here too — same reasoning as saveProject:
    // never trust a client-supplied userid, scope by the authenticated user.
    const { project_id, name, description, state, steps } = data;

    // Same reasoning as saveProject: this is a server action, so validate
    // `steps` is actually an array before looping over it.
    if(!Array.isArray(steps)) return { success: false, error: "Invalid steps data" };

    try {
        // Scope the UPDATE to userId, not just project_id — otherwise any
        // authenticated user could edit another user's project by guessing
        // its project_id, since project_id alone isn't a secret.
        const [updated] = await sql`
            UPDATE projects
            SET name = ${name}, description = ${description}, state = ${state}
            WHERE project_id = ${project_id} AND userid = ${userId}
            RETURNING project_id
        `;

        // No row matched -> either the project doesn't exist or it isn't
        // this user's, so fail before touching any steps.
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