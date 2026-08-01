import Link from "next/link";
import { redirect } from "next/navigation";

import { createProjectAction, signOutAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims.sub) {
    redirect("/login");
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <main className="projects-shell">
      <header className="projects-header">
        <div>
          <p className="eyebrow">Private workspace</p>
          <h1>WeSketch projects</h1>
        </div>
        <form action={signOutAction}>
          <button className="secondary-button" type="submit">
            Sign out
          </button>
        </form>
      </header>

      <section className="projects-content">
        <form action={createProjectAction} className="new-project-card">
          <label htmlFor="project-title">New project</label>
          <div>
            <input
              id="project-title"
              maxLength={120}
              name="title"
              placeholder="Project title"
              required
            />
            <button type="submit">Create project</button>
          </div>
        </form>

        <div className="project-grid">
          {projects?.map((project) => (
            <Link
              className="project-card"
              href={`/projects/${project.id}`}
              key={project.id}
            >
              <span>{project.title}</span>
              <small>
                Updated{" "}
                {new Date(project.updated_at).toLocaleDateString("en-AU")}
              </small>
            </Link>
          ))}
          {projects?.length === 0 ? (
            <p className="empty-state">
              Create your first project to start sketching.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
