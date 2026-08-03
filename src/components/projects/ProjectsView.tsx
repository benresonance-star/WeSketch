"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import {
  Archive,
  ArchiveRestore,
  Pencil,
} from "lucide-react";

import {
  archiveProjectAction,
  createProjectAction,
  renameProjectAction,
  signOutAction,
  unarchiveProjectAction,
} from "@/app/actions";

export type ProjectListItem = {
  id: string;
  title: string;
  updatedAt: string;
  archivedAt: string | null;
  thumbnailUrl: string | null;
  canvasColor: string;
};

type ProjectsViewProps = {
  projects: ProjectListItem[];
};

const SHOW_ARCHIVED_STORAGE_KEY = "wesketch-show-archived-v1";

function formatUpdatedDate(value: string) {
  return new Date(value).toLocaleDateString("en-AU");
}

type ProjectCardProps = {
  project: ProjectListItem;
  archived?: boolean;
  onRename: (projectId: string, title: string) => void;
  onArchive: (projectId: string) => void;
  onUnarchive: (projectId: string) => void;
  isPending: boolean;
};

function ProjectCard({
  project,
  archived = false,
  onRename,
  onArchive,
  onUnarchive,
  isPending,
}: ProjectCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(project.title);

  useEffect(() => {
    if (!isEditing) {
      setDraftTitle(project.title);
    }
  }, [isEditing, project.title]);

  const commitRename = () => {
    const trimmedTitle = draftTitle.trim();
    setIsEditing(false);

    if (!trimmedTitle || trimmedTitle === project.title) {
      setDraftTitle(project.title);
      return;
    }

    onRename(project.id, trimmedTitle);
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDraftTitle(project.title);
      setIsEditing(false);
    }
  };

  return (
    <article className="project-card">
      <a
        className="project-card-link"
        href={`/projects/${project.id}`}
      >
        <div
          className="project-card-preview"
          style={{ backgroundColor: project.canvasColor }}
        >
          {project.thumbnailUrl ? (
            <img
              alt=""
              className="project-card-preview-image"
              src={project.thumbnailUrl}
            />
          ) : (
            <span className="project-card-preview-empty">No preview yet</span>
          )}
        </div>
        <div className="project-card-body">
          {isEditing ? (
            <input
              aria-label="Project title"
              autoFocus
              className="project-card-title-input"
              maxLength={120}
              onBlur={commitRename}
              onChange={(event) => setDraftTitle(event.target.value)}
              onClick={(event) => event.preventDefault()}
              onKeyDown={handleTitleKeyDown}
              value={draftTitle}
            />
          ) : (
            <span className="project-card-title">{project.title}</span>
          )}
          <small>Updated {formatUpdatedDate(project.updatedAt)}</small>
        </div>
      </a>
      <div className="project-card-actions">
        {!archived ? (
          <>
            <button
              aria-label={`Rename ${project.title}`}
              className="project-card-action"
              data-tooltip="Rename"
              disabled={isPending}
              onClick={() => setIsEditing(true)}
              type="button"
            >
              <Pencil aria-hidden="true" strokeWidth={1.5} />
            </button>
            <button
              aria-label={`Archive ${project.title}`}
              className="project-card-action"
              data-tooltip="Archive"
              disabled={isPending}
              onClick={() => onArchive(project.id)}
              type="button"
            >
              <Archive aria-hidden="true" strokeWidth={1.5} />
            </button>
          </>
        ) : (
          <button
            aria-label={`Unarchive ${project.title}`}
            className="project-card-action"
            data-tooltip="Unarchive"
            disabled={isPending}
            onClick={() => onUnarchive(project.id)}
            type="button"
          >
            <ArchiveRestore aria-hidden="true" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </article>
  );
}

export function ProjectsView({ projects }: ProjectsViewProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      setShowArchived(
        window.localStorage.getItem(SHOW_ARCHIVED_STORAGE_KEY) === "true",
      );
    } catch {
      // Keep archived hidden when storage is unavailable.
    }
  }, []);

  const { activeProjects, archivedProjects } = useMemo(() => {
    const active: ProjectListItem[] = [];
    const archived: ProjectListItem[] = [];

    for (const project of projects) {
      if (project.archivedAt) {
        archived.push(project);
      } else {
        active.push(project);
      }
    }

    return { activeProjects: active, archivedProjects: archived };
  }, [projects]);

  const toggleShowArchived = () => {
    setShowArchived((current) => {
      const next = !current;

      try {
        window.localStorage.setItem(
          SHOW_ARCHIVED_STORAGE_KEY,
          next ? "true" : "false",
        );
      } catch {
        // The toggle still applies for this session.
      }

      return next;
    });
  };

  const runProjectAction = (action: () => Promise<void>) => {
    startTransition(() => {
      void action();
    });
  };

  return (
    <main className="projects-shell">
      <header className="projects-header">
        <div>
          <p className="eyebrow">Private workspace</p>
          <h1>WeSketch projects</h1>
        </div>
        <div className="projects-header-actions">
          {archivedProjects.length > 0 ? (
            <button
              aria-label={
                showArchived ? "Hide archived projects" : "Show archived projects"
              }
              aria-pressed={showArchived}
              className={
                showArchived
                  ? "projects-archive-toggle active"
                  : "projects-archive-toggle"
              }
              data-tooltip={
                showArchived ? "Hide archived" : "Show archived"
              }
              onClick={toggleShowArchived}
              type="button"
            >
              <Archive aria-hidden="true" strokeWidth={1.5} />
            </button>
          ) : null}
          <form action={signOutAction}>
            <button className="secondary-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
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
          {activeProjects.map((project) => (
            <ProjectCard
              archived={false}
              isPending={isPending}
              key={project.id}
              onArchive={(projectId) =>
                runProjectAction(() => archiveProjectAction(projectId))
              }
              onRename={(projectId, title) =>
                runProjectAction(() => renameProjectAction(projectId, title))
              }
              onUnarchive={(projectId) =>
                runProjectAction(() => unarchiveProjectAction(projectId))
              }
              project={project}
            />
          ))}
          {activeProjects.length === 0 ? (
            <p className="empty-state">
              {archivedProjects.length > 0
                ? "No active projects. Show archived projects to reopen one."
                : "Create your first project to start sketching."}
            </p>
          ) : null}
        </div>

        {showArchived && archivedProjects.length > 0 ? (
          <section className="archived-projects-section">
            <h2 className="archived-projects-heading">Archived</h2>
            <div className="project-grid">
              {archivedProjects.map((project) => (
                <ProjectCard
                  archived
                  isPending={isPending}
                  key={project.id}
                  onArchive={(projectId) =>
                    runProjectAction(() => archiveProjectAction(projectId))
                  }
                  onRename={(projectId, title) =>
                    runProjectAction(() => renameProjectAction(projectId, title))
                  }
                  onUnarchive={(projectId) =>
                    runProjectAction(() => unarchiveProjectAction(projectId))
                  }
                  project={project}
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
