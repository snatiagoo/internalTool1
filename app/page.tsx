import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInButton, SignUpButton } from "@clerk/nextjs";

const steps = [
  {
    title: "Capture the idea",
    description: "Write down what you're building and why, before touching any code.",
  },
  {
    title: "Break it into steps",
    description: "Turn the idea into an ordered list of small, concrete next steps.",
  },
  {
    title: "Track state as you go",
    description: "Mark each step done as you finish it, so you always know what's next.",
  },
];

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl text-center">
        <span className="inline-block rounded-full border border-foreground/15 px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground/60">
          Code Planner
        </span>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Plan your code, one step at a time
        </h1>

        <p className="mt-4 text-base text-foreground/70 sm:text-lg">
          A basic planner for breaking your project into next steps and
          tracking which ones are done — so you always know where you left
          off.
        </p>

        <div className="mt-10 flex items-center justify-center gap-3">
          <SignUpButton>
            <button className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90">
              Sign up
            </button>
          </SignUpButton>
          <SignInButton>
            <button className="rounded-md border border-foreground/20 px-5 py-2.5 text-sm font-medium transition hover:bg-foreground/5">
              Sign in
            </button>
          </SignInButton>
        </div>

        <ol className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-lg border border-foreground/10 p-5"
            >
              <span className="text-sm font-medium text-foreground/40">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className="mt-2 font-medium">{step.title}</h2>
              <p className="mt-1 text-sm text-foreground/60">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}


