'use server';

import { auth, currentUser } from "@clerk/nextjs/server";
import { projectData, project, step, SaveProjectResult, FetchProjectResult } from "./definitions";
import { neon } from "@neondatabase/serverless";

const sql = neon(`${process.env.DATABASE_URL}`);


export async function saveProject(data: projectData): Promise<SaveProjectResult> {

    const user = await currentUser();
    // Return a typed result instead of throwing so the caller (a form/UI)
    // can branch on `.success` instead of needing a try/catch of its own.
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    const { name, description, state, steps} : project = data;

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



export async function fetchProject(project_id: string): Promise<FetchProjectResult>{
    const user = await currentUser();
    // Return a typed result instead of throwing so the caller (a form/UI)
    // can branch on `.success` instead of needing a try/catch of its own.
    if(user == undefined) return { success: false, error: "Not authenticated" };
    const userId = user.id;

    try {
        // Basic approach: two round trips. Fetch the project first, scoped
        // to this user, so we can both check ownership and fail fast with
        // "not found" before spending a second query on its steps.
        const [projectRow] = await sql`
            SELECT project_id, name, description, state, userid
            FROM projects
            WHERE project_id = ${project_id} AND userid = ${userId}
        `;

        if(!projectRow) return { success: false, error: "Project not found" };

        const steps = await sql`
            SELECT step_desc, step_state, step_order, locked, project_id
            FROM steps
            WHERE project_id = ${project_id}
            ORDER BY step_order
        `;

        /* Easier alternative: a single JOIN, one round trip instead of two.
           Trades away the "fail fast before querying steps" benefit above,
           and requires grouping the flat rows back into project + steps[]
           in JS afterwards.

        const rows = await sql`
            SELECT p.project_id, p.name, p.description, p.state, p.userid,
                   s.step_desc, s.step_state, s.step_order, s.locked
            FROM projects p
            LEFT JOIN steps s ON s.project_id = p.project_id
            WHERE p.project_id = ${project_id} AND p.userid = ${userId}
            ORDER BY s.step_order
        `;

        if(rows.length === 0) return { success: false, error: "Project not found" };

        const { project_id: id, name, description, state, userid } = rows[0];
        const steps = rows
            .filter(r => r.step_desc != null) // drop the null step row from a project with no steps
            .map(r => ({
                step_desc: r.step_desc,
                step_state: r.step_state,
                step_order: r.step_order,
                locked: r.locked,
                project_id: id,
            }));
        */

        const projectData: projectData = {
            project_id: projectRow.project_id,
            name: projectRow.name,
            description: projectRow.description,
            state: projectRow.state,
            userid: projectRow.userid,
            steps: steps as step[],
        };

        return { success: true, project: projectData };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch project";
        return { success: false, error: message };
    }

}