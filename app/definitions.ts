
// Create-time shape: no project_id/userid yet (saveProject derives userid server-side).
export type projectData = {
    name: string,
    description: string,
    state: string,
    steps: step[],
}

// Shape once a project exists in the DB; steps are stepData since they exist too.
export type project = {
    project_id: string,
    name: string,
    description: string,
    state: string,
    userid: string,
    steps: stepData[],
}



export type step = {
        step_desc: string,
        step_state: string,
        step_order: number,
        locked: boolean,
        project_id: string,
}

// Same project/projectData split, one level down: a step that exists in the DB.
export type stepData = step & {
    step_id: string,
}

// Discriminated union: check `.success` to narrow which field is present.
export type SaveProjectResult =
    | { success: true, projectId: number }
    | { success: false, error: string }

export type FetchProjectsResult =
    | { success: true, projects: project[] }
    | { success: false, error: string }

export type FetchProjectResult =
    | { success: true, project: project }
    | { success: false, error: string }