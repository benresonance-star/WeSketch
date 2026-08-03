"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  Archive,
  ArchiveRestore,
  GripVertical,
  Pencil,
} from "lucide-react";

import {
  archiveProjectAction,
  createProjectAction,
  renameProjectAction,
  reorderProjectsAction,
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

function reorderProjectList(
  projects: ProjectListItem[],
  draggedId: string,
  targetId: string,
): ProjectListItem[] {
  const fromIndex = projects.findIndex((project) => project.id === draggedId);
  const toIndex = projects.findIndex((project) => project.id === targetId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return projects;
  }

  const next = [...projects];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

type ProjectCardProps = {
  project: ProjectListItem;
  archived?: boolean;
  sortable?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onRename: (projectId: string, title: string) => void;
  onArchive: (projectId: string) => void;
  onUnarchive: (projectId: string) => void;
  onDragHandleStart: (projectId: string) => void;
  onDragHandleEnd: () => void;
  onDragOverCard: (projectId: string) => void;
  onDragLeaveCard: (projectId: string) => void;
  onDropOnCard: (projectId: string) => void;
  isPending: boolean;
};

function ProjectCard({
  project,
  archived = false,
  sortable = false,
  isDragging = false,
  isDragOver = false,
  onRename,
  onArchive,
  onUnarchive,
  onDragHandleStart,
  onDragHandleEnd,
  onDragOverCard,
  onDragLeaveCard,
  onDropOnCard,
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

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", project.id);
    onDragHandleStart(project.id);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!sortable) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    onDragOverCard(project.id);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!sortable) {
      return;
    }

    event.preventDefault();
    onDropOnCard(project.id);
  };

  const cardClassName = [
    "project-card",
    isDragging ? "is-dragging" : "",
    isDragOver ? "is-drag-over" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={cardClassName}
      onDragLeave={() => onDragLeaveCard(project.id)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
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
      </a>
      <div className="project-card-footer">
        {sortable ? (
          <button
            aria-label={`Reorder ${project.title}`}
            className="project-card-drag-handle"
            draggable
            onDragEnd={onDragHandleEnd}
            onDragStart={handleDragStart}
            type="button"
          >
            <GripVertical aria-hidden="true" strokeWidth={1.5} />
          </button>
        ) : null}
        <div className="project-card-body">
          {isEditing ? (
            <input
              aria-label="Project title"
              autoFocus
              className="project-card-title-input"
              maxLength={120}
              onBlur={commitRename}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={handleTitleKeyDown}
              value={draftTitle}
            />
          ) : (
            <span className="project-card-title">{project.title}</span>
          )}
          <small>Updated {formatUpdatedDate(project.updatedAt)}</small>
        </div>
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
      </div>
    </article>
  );
}

type SortableProjectGridProps = {
  projects: ProjectListItem[];
  archived?: boolean;
  emptyMessage: string | null;
  isPending: boolean;
  onArchive: (projectId: string) => void;
  onRename: (projectId: string, title: string) => void;
  onReorder: (projectIds: string[]) => void;
  onUnarchive: (projectId: string) => void;
};

function SortableProjectGrid({
  projects,
  archived = false,
  emptyMessage,
  isPending,
  onArchive,
  onRename,
  onReorder,
  onUnarchive,
}: SortableProjectGridProps) {
  const [orderedProjects, setOrderedProjects] = useState(projects);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (!draggingId) {
      return;
    }

    const nextOrder = reorderProjectList(orderedProjects, draggingId, targetId);
    setOrderedProjects(nextOrder);
    setDraggingId(null);
    setDragOverId(null);
    onReorder(nextOrder.map((project) => project.id));
  };

  return (
    <div className="project-grid">
      {orderedProjects.map((project) => (
        <ProjectCard
          archived={archived}
          isDragOver={dragOverId === project.id && draggingId !== project.id}
          isDragging={draggingId === project.id}
          isPending={isPending}
          key={project.id}
          onArchive={onArchive}
          onDragHandleEnd={() => {
            setDraggingId(null);
            setDragOverId(null);
          }}
          onDragHandleStart={setDraggingId}
          onDragLeaveCard={(projectId) => {
            if (dragOverId === projectId) {
              setDragOverId(null);
            }
          }}
          onDragOverCard={setDragOverId}
          onDropOnCard={handleDrop}
          onRename={onRename}
          onUnarchive={onUnarchive}
          project={project}
          sortable
        />
      ))}
      {orderedProjects.length === 0 && emptyMessage ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : null}
    </div>
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

  const activeEmptyMessage =
    archivedProjects.length > 0
      ? "No active projects. Show archived projects to reopen one."
      : "Create your first project to start sketching.";

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

        <SortableProjectGrid
          emptyMessage={activeProjects.length === 0 ? activeEmptyMessage : null}
          isPending={isPending}
          key={activeProjects.map((project) => project.id).join("-")}
          onArchive={(projectId) =>
            runProjectAction(() => archiveProjectAction(projectId))
          }
          onRename={(projectId, title) =>
            runProjectAction(() => renameProjectAction(projectId, title))
          }
          onReorder={(projectIds) =>
            runProjectAction(() => reorderProjectsAction(projectIds))
          }
          onUnarchive={(projectId) =>
            runProjectAction(() => unarchiveProjectAction(projectId))
          }
          projects={activeProjects}
        />

        {showArchived && archivedProjects.length > 0 ? (
          <section className="archived-projects-section">
            <h2 className="archived-projects-heading">Archived</h2>
            <SortableProjectGrid
              archived
              emptyMessage={null}
              isPending={isPending}
              key={archivedProjects.map((project) => project.id).join("-")}
              onArchive={(projectId) =>
                runProjectAction(() => archiveProjectAction(projectId))
              }
              onRename={(projectId, title) =>
                runProjectAction(() => renameProjectAction(projectId, title))
              }
              onReorder={(projectIds) =>
                runProjectAction(() => reorderProjectsAction(projectIds))
              }
              onUnarchive={(projectId) =>
                runProjectAction(() => unarchiveProjectAction(projectId))
              }
              projects={archivedProjects}
            />
          </section>
        ) : null}
      </section>
    </main>
  );
}
