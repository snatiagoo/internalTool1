'use server';

import { auth, currentUser } from "@clerk/nextjs/server";
import { projectData } from "./definitions";
import { neon } from "@neondatabase/serverless";

const sql = neon(`${process.env.DATABASE_URL}`);


export async function saveProject(data: projectData){
    const user = await currentUser();
    if(user == undefined) return;
    const userId = user.id;

    const { name, description, state, steps} : projectData = data;




}