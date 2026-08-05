
// Shape the dashboard form submits to create a project — no project_id (not
// assigned yet) and no userid (saveProject derives it from the authenticated
// user rather than trusting a client-supplied value).
export type projectData = {
    name: string,
    description: string,
    state: string,
    steps: step[],
}

// Shape of a project once it exists in the DB (fetchProjects' result, and
// what editProject needs to identify which project to update).
export type project = {
    project_id: string,
    name: string,
    description: string,
    state: string,
    userid: string,
    steps: step[],
}



export type step = {
        step_desc: string,
        step_state: string,
        step_order: number,
        locked: boolean,
        project_id: string,
}

// Discriminated union so callers can check `.success` and TS narrows
// which of `projectId`/`error` is actually present.
export type SaveProjectResult =
    | { success: true, projectId: number }
    | { success: false, error: string }

export type FetchProjectsResult =
    | { success: true, projects: project[] }
    | { success: false, error: string }

export type FetchProjectResult =
    | { success: true, project: project }
    | { success: false, error: string }