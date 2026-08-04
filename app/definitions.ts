
export type projectData = {
    name: string,
    project_id: string,
    description: string,
    state: string,
    userid: string,
    steps: step[],
}

export type project = {
    name: string,
    project_id: string,
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

export type FetchProjectResult =
    | { success: true, project: projectData }
    | { success: false, error: string }