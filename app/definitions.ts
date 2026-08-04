
export type projectData = {
    name: string,
    description: string,
    state: boolean,
    steps: step[],
}


export type step = {
        step_desc: string,
        step_state: boolean,
        locked: boolean,
}