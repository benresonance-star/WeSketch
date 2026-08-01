# Sketch AI — MVP Product & Technical Specification

**Status:** Implementation-ready MVP  
**Primary device:** Older iPad Pro with Apple Pencil  
**Deployment:** Vercel  
**Backend:** Supabase  
**AI:** OpenAI API initially; provider abstraction prepared for Gemini later  
**App type:** iPad-first responsive Progressive Web App (PWA)  
**Primary interaction:** Sketch → Select → Ask / Generate / Transform → Continue spatial conversation

---

## 1. Product intent

Sketch AI is a lightweight collaborative sketching environment for thinking visually with AI.

The product is not intended to replace Procreate, Concepts, Morpholio Trace, CAD, or a full whiteboard application. Its purpose is to make the shortest possible loop between:

1. drawing an idea,
2. pointing at a part of it,
3. discussing that part with an AI,
4. generating visual alternatives,
5. placing results back beside the sketch,
6. sketching over or around those results,
7. continuing the conversation.

The central interaction should feel closer to working at tracing paper with a design collaborator than prompting an image generator.

The marquee/lasso selection is semantically important. It means:

> “This is the thing I am thinking about.”

---

## 2. MVP success criterion

A user on an iPad Pro must be able to:

1. open the web app,
2. create a canvas,
3. draw naturally with Apple Pencil,
4. marquee or lasso part of the drawing,
5. enter or dictate a question,
6. send the selected sketch to OpenAI,
7. receive a useful visual/design response,
8. request generated image alternatives,
9. place a generated result beside the drawing,
10. select part of either the original sketch or an AI result and continue the conversation,
11. leave and later reopen the project with the sketch and conversation intact.

If this loop feels natural and useful, the MVP has succeeded.

---

# 3. Core design principles

## 3.1 Sketch first

The canvas must dominate the interface.

AI controls should remain secondary until the user makes a selection.

The default state should feel like a quiet sketchbook, not a chatbot.

## 3.2 Spatial conversation

AI interactions belong to selections and artifacts, not merely to a chronological chat stream.

Every AI interaction should preserve:

- selected region,
- location on canvas,
- local context,
- whole-canvas context,
- prompt,
- AI response,
- generated outputs,
- parent interaction.

## 3.3 Context without forcing the user to explain

When the user selects part of a sketch, the application automatically prepares three visual context levels:

### Selection
High-resolution crop of the selected region.

### Neighbourhood
A larger crop surrounding the selection.

Default: approximately 2× the selection width and height, clamped to canvas bounds.

### Whole canvas
Low-resolution thumbnail of the current canvas.

The AI therefore receives:

> what the user selected + where it sits + what the whole drawing is about.

## 3.4 Human remains in control

AI results never overwrite original sketch content automatically.

Generated outputs appear as new objects/cards/layers.

Original strokes remain recoverable.

## 3.5 Fast over feature-rich

Do not build a full drawing package for MVP.

Prefer an excellent five-second interaction loop over a large tool palette.

---

# 4. MVP interface

Use a clean, light interface optimised for landscape iPad.

Dark mode may be added later.

## 4.1 Main layout

Landscape:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Project title                  Undo Redo                    Share    │
├───────┬───────────────────────────────────────┬─────────────────────┤
│       │                                       │                     │
│ TOOL  │                                       │     AI PANEL        │
│ BAR   │             SKETCH CANVAS             │                     │
│       │                                       │ Chat / Images       │
│       │                                       │                     │
│       │                                       │                     │
├───────┴───────────────────────────────────────┴─────────────────────┤
│                         optional artifact strip                     │
└─────────────────────────────────────────────────────────────────────┘
```

Portrait should remain functional but landscape is the priority.

## 4.2 Left toolbar

MVP tools:

- Pen
- Eraser
- Rectangle Select
- Lasso Select
- Image import
- Hand / pan
- Undo
- Redo

Optional if trivial:

- basic colour picker
- basic stroke width
- text note

Do not add complex brushes in MVP.

## 4.3 Selection state

When a region is selected:

- show subtle selection outline,
- show drag handles for rectangular selection,
- display floating contextual action bar near the selection.

Actions:

- **Ask**
- **Generate**
- **Transform**

Possible later actions:

- Explain
- Critique
- Compare
- Annotate
- Branch

## 4.4 AI side panel

Tabs:

- **Chat**
- **Images**

Chat panel contains:

- selected-context preview,
- optional indicator showing:
  - Selection
  - Context
  - Canvas
- conversation messages,
- generated image thumbnails embedded in relevant response,
- microphone button,
- prompt input,
- send button.

The user should be able to collapse the side panel to maximise canvas space.

## 4.5 Prompt bar

Example:

> What would you like to ask about this selection?

Support:

- typing,
- iOS dictation,
- optional browser speech capture later.

For MVP, native iOS keyboard dictation is sufficient. Do not block MVP on custom speech-to-text.

---

# 5. Interaction modes

## 5.1 Ask

Purpose:

Conversational multimodal reasoning about the selected area.

Example:

> “This entry feels too abrupt. How could it become more ceremonial without becoming grand?”

Request includes:

- user prompt,
- high-resolution selection image,
- neighbourhood crop,
- whole-canvas thumbnail,
- project/system instructions,
- relevant conversation history.

Response:

- concise natural-language design observation,
- typically 1–4 ideas,
- optionally prompts user toward a visual exploration.

The AI should behave as a collaborative design partner.

Preferred language patterns include:

- “I notice…”
- “I wonder if…”
- “One tension here is…”
- “You could test…”
- “The current sketch suggests…”

Avoid excessive certainty about ambiguous hand sketches.

## 5.2 Generate

Purpose:

Generate one or more visual interpretations or alternatives based on the selected sketch.

Example:

> “Generate three alternatives that keep the compressed entry but bring light from above.”

Input should include the selection image and context.

Default output count:

- 3 concepts if supported efficiently,
- otherwise 1 primary result with easy “more variations” action.

Generated images:

- appear in the Images tab,
- are saved to Supabase Storage,
- become project artifacts,
- can be dragged or inserted onto the canvas.

## 5.3 Transform

Purpose:

Use the selected image/sketch as stronger visual source material while modifying an identified property.

Examples:

- “Make this threshold timber.”
- “Turn the handrail into bronze vines.”
- “Keep the geometry but explore a Japanese timber character.”
- “Make this stair lighter without changing the footprint.”

Transform should preserve the user's stated invariants.

The prompt composer should explicitly include:

- preserve:
- modify:
- context:

where possible.

---

# 6. Canvas requirements

## 6.1 Technology approach

Use a performant browser canvas implementation that supports Apple Pencil through Pointer Events.

Recommended initial stack:

- React / Next.js
- TypeScript
- HTML Canvas or a lightweight canvas library
- Pointer Events API
- `pointerType === "pen"` awareness

The drawing implementation must preserve:

- x/y points,
- pressure where available,
- timestamps if useful,
- stroke colour,
- stroke width.

Do not depend on pressure for correctness.

## 6.2 Canvas coordinate system

Use a persistent world coordinate system independent of screen resolution.

Every object has:

```ts
{
  id,
  type,
  x,
  y,
  width,
  height,
  rotation,
  zIndex
}
```

Strokes store points in world coordinates.

This is required so selections and AI artifacts remain spatially anchored when zooming/panning.

## 6.3 Zoom and pan

Required:

- pinch-to-zoom,
- two-finger pan,
- optional hand tool,
- reset / fit canvas.

Apple Pencil drawing must not unintentionally pan the canvas.

## 6.4 Stroke rendering

Target smooth visual feedback.

Recommended:

- collect pointer samples,
- render immediately locally,
- simplify paths only after stroke completion if needed,
- persist stroke asynchronously.

Do not send every pointer point to Supabase while the stroke is being drawn.

## 6.5 Autosave

Autosave:

- after a completed stroke,
- after object movement,
- after AI artifact insertion,
- after selection-linked conversation events.

Debounce persistence to avoid excessive writes.

Local app state must update instantly and persistence should happen asynchronously.

---

# 7. Selection model

Selections are first-class project entities.

## 7.1 Rectangle selection

User drags a rectangular area.

Persist:

```ts
{
  id,
  canvas_id,
  user_id,
  selection_type: "rectangle",
  bounds: { x, y, width, height },
  created_at
}
```

## 7.2 Lasso selection

User draws polygon/polyline around an area.

Persist:

```ts
{
  selection_type: "lasso",
  path: [{x, y}, ...],
  bounds: { x, y, width, height }
}
```

For MVP, AI image preparation may rasterise the lasso bounding rectangle with an alpha mask or white background outside the lasso.

## 7.3 Context extraction

At request time generate:

### A. Selection image

Target long edge:

- approximately 1024–1600 px

Avoid unnecessarily large payloads.

### B. Neighbourhood image

Bounds:

```text
selection bounds expanded by approximately 50% on each side
```

or equivalent 2× overall context size.

### C. Whole-canvas image

Target long edge:

- approximately 1024 px

Use enough detail for compositional understanding while controlling API cost.

## 7.4 Selection marker

The AI request record stores the exact world-space selection bounds.

Later the UI should be able to reopen a conversation and visually re-highlight the source selection.

---

# 8. Image preparation

Rasterise server-bound images on the client where practical.

Use:

- PNG or WebP,
- transparent or white background,
- bounded resolution,
- compression appropriate for sketch material.

Do not upload the full-resolution entire canvas for every turn if it has not changed.

Create cached context snapshots where appropriate.

Every AI turn may reference:

```text
selection_snapshot
neighbourhood_snapshot
canvas_snapshot
```

These snapshots provide provenance: the future conversation can show exactly what the AI saw at that moment.

---

# 9. AI architecture

Create an AI provider abstraction from the beginning.

```ts
interface AIProvider {
  ask(input: AskInput): Promise<AskResult>
  generate(input: GenerateInput): Promise<GenerateResult>
  transform(input: TransformInput): Promise<TransformResult>
}
```

Initial implementation:

```text
OpenAIProvider
```

Future:

```text
GeminiProvider
```

The UI must not contain provider-specific logic.

---

# 10. OpenAI integration

## 10.1 Security

**Never expose `OPENAI_API_KEY` to the browser.**

All OpenAI API calls must originate from server-side Vercel Functions / Next.js route handlers.

The key is stored as a Vercel environment variable.

Use:

```text
OPENAI_API_KEY
OPENAI_CHAT_MODEL
OPENAI_IMAGE_MODEL
```

Do not prefix the API key with `NEXT_PUBLIC_`.

Model IDs are configuration, not hard-coded product assumptions.

This lets the deployed app change models without changing the UI or database design.

## 10.2 Conversational reasoning

Use the current OpenAI Responses API rather than building new work on the deprecated Assistants API.

The server should submit multimodal input containing:

- system/developer design-partner instructions,
- user text,
- selection image,
- neighbourhood image,
- whole canvas image,
- compact relevant conversation history.

Prefer streaming text back to the client where straightforward.

## 10.3 Conversation strategy

Supabase is the source of truth for application conversation history.

Do not make the OpenAI provider the sole store of project memory.

Persist:

- user messages,
- assistant responses,
- model/provider,
- selection reference,
- context snapshot references,
- generation IDs where useful,
- timestamps,
- token/cost metadata where available.

This allows provider switching later.

## 10.4 Image generation

Use the current OpenAI-supported image generation/edit capability.

Server workflow:

```text
client request
→ authorise user
→ load relevant project + selection
→ obtain signed/private source images
→ compose provider request
→ OpenAI
→ receive generated image
→ upload generated image to Supabase Storage
→ create artifact row
→ return artifact metadata to client
```

Do not expose temporary OpenAI image payloads as the permanent project record.

Supabase Storage becomes the canonical project asset store.

---

# 11. System prompt / design behaviour

Create a central server-side prompt template.

Initial behaviour:

```text
You are a thoughtful visual design collaborator working with a person through sketches.

The user has selected a particular region of a larger visual canvas.

You receive:
1. SELECTION — the exact region the user is pointing to.
2. LOCAL CONTEXT — the area surrounding that region.
3. WHOLE CANVAS — a lower-resolution view of the broader drawing.

Treat the selection as the primary subject and the other images as context.

Do not pretend uncertain sketch content is certain.
State observations as observations.
Preserve constraints explicitly stated by the user.
Prefer concise, spatially specific responses.
Help the user explore rather than prematurely resolve the design.

Useful interaction patterns include:
- "I notice..."
- "I wonder if..."
- identifying tensions,
- proposing bounded experiments,
- comparing alternatives,
- suggesting what to sketch next.

When the user requests generated imagery, preserve the important geometry and relationships visible in the supplied sketch unless they ask for them to change.
```

Keep prompt versioning.

Store a prompt version identifier on AI runs so behaviour can later be audited.

---

# 12. Application architecture

```text
┌───────────────────────────┐
│        iPad / PWA         │
│                           │
│ React + Canvas            │
│ Apple Pencil              │
│ Local interaction state   │
└─────────────┬─────────────┘
              │ HTTPS
              ▼
┌───────────────────────────┐
│       Vercel / Next.js    │
│                           │
│ App hosting               │
│ Route handlers            │
│ Auth validation           │
│ AI orchestration          │
│ OpenAI API calls          │
│ Signed asset access       │
└───────┬───────────┬───────┘
        │           │
        ▼           ▼
┌──────────────┐  ┌──────────────┐
│   Supabase   │  │    OpenAI    │
│              │  │              │
│ Auth         │  │ Responses    │
│ Postgres     │  │ Vision       │
│ Storage      │  │ Images       │
│ RLS          │  │              │
└──────────────┘  └──────────────┘
```

---

# 13. Vercel

Use Next.js deployed to Vercel.

Responsibilities:

- serve PWA,
- host server-side API routes,
- validate Supabase authenticated user,
- call OpenAI,
- perform AI orchestration,
- enforce rate limits,
- log failures safely.

Suggested routes:

```text
POST /api/ai/ask
POST /api/ai/generate
POST /api/ai/transform
POST /api/context/render          optional
GET  /api/health
```

Do not place large persistent binary files on Vercel's filesystem.

Persist assets to Supabase Storage.

Environment variables:

```text
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=
OPENAI_IMAGE_MODEL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only.

Never expose it to client JavaScript.

---

# 14. Supabase responsibilities

Use:

- Supabase Auth
- Postgres
- Storage
- Row Level Security

Supabase is the durable system of record.

## 14.1 Auth

MVP may support:

- email magic link

or

- email + password

A single-user developer mode is acceptable initially, but database ownership and RLS should still be designed properly.

## 14.2 Storage buckets

Suggested private buckets:

```text
canvas-snapshots
selection-snapshots
generated-images
imports
```

Alternative: a single private `project-assets` bucket with path conventions.

Recommended path:

```text
{user_id}/{project_id}/{artifact_type}/{uuid}.{ext}
```

Example:

```text
0d.../project-123/selection/7d....webp
```

Use private storage.

Generate signed URLs where browser access is required.

Storage access must be protected with RLS policies.

---

# 15. Database schema

Use UUID primary keys.

All user-owned tables must include ownership directly or through an RLS-safe project relationship.

## 15.1 profiles

```text
id uuid PK references auth.users
display_name text
created_at timestamptz
updated_at timestamptz
```

## 15.2 projects

```text
id uuid PK
owner_id uuid references auth.users
title text
thumbnail_path text null
created_at timestamptz
updated_at timestamptz
last_opened_at timestamptz
```

## 15.3 canvases

```text
id uuid PK
project_id uuid FK
name text
width numeric
height numeric
background jsonb
viewport jsonb
created_at timestamptz
updated_at timestamptz
```

For MVP one project may contain one canvas, but preserve the one-to-many structure.

## 15.4 strokes

```text
id uuid PK
canvas_id uuid FK
user_id uuid
points jsonb
style jsonb
z_index integer
created_at timestamptz
updated_at timestamptz
deleted_at timestamptz null
```

Example `points`:

```json
[
  {"x":120.2,"y":80.1,"p":0.42},
  {"x":121.7,"y":81.9,"p":0.47}
]
```

## 15.5 canvas_objects

For images and future spatial artifacts:

```text
id uuid PK
canvas_id uuid FK
user_id uuid
type text
x numeric
y numeric
width numeric
height numeric
rotation numeric default 0
z_index integer
artifact_id uuid null
data jsonb
created_at timestamptz
updated_at timestamptz
deleted_at timestamptz null
```

Types initially:

```text
image
note
```

Later:

```text
ai_card
group
shape
text
link
```

## 15.6 selections

```text
id uuid PK
canvas_id uuid FK
user_id uuid
selection_type text
bounds jsonb
path jsonb null
created_at timestamptz
```

## 15.7 conversations

```text
id uuid PK
project_id uuid FK
canvas_id uuid FK
user_id uuid
title text null
created_at timestamptz
updated_at timestamptz
```

## 15.8 messages

```text
id uuid PK
conversation_id uuid FK
user_id uuid null
role text
content text
selection_id uuid null
ai_run_id uuid null
parent_message_id uuid null
created_at timestamptz
```

Roles:

```text
user
assistant
system
```

System messages normally should not need to be exposed in UI.

## 15.9 context_snapshots

```text
id uuid PK
selection_id uuid FK
canvas_id uuid FK
selection_asset_path text
neighbourhood_asset_path text
canvas_asset_path text
canvas_revision text null
created_at timestamptz
```

## 15.10 ai_runs

```text
id uuid PK
user_id uuid
project_id uuid
conversation_id uuid
selection_id uuid null
provider text
model text
action text
status text
prompt_version text
request_metadata jsonb
response_metadata jsonb
input_tokens bigint null
output_tokens bigint null
estimated_cost numeric null
error_code text null
error_message text null
created_at timestamptz
completed_at timestamptz null
```

Action:

```text
ask
generate
transform
```

Status:

```text
queued
running
completed
failed
cancelled
```

## 15.11 artifacts

```text
id uuid PK
project_id uuid FK
canvas_id uuid FK
user_id uuid
source_ai_run_id uuid null
artifact_type text
storage_path text
mime_type text
width integer null
height integer null
metadata jsonb
created_at timestamptz
```

Artifact types:

```text
generated_image
imported_image
canvas_snapshot
selection_snapshot
```

---

# 16. Row Level Security

RLS must be enabled for every user-facing table.

Baseline principle:

> authenticated users may only access rows belonging to projects they own or are explicitly members of.

MVP can use owner-only permissions.

Do not depend exclusively on UI filtering.

Policies should enforce access at the database layer.

Storage objects must use equivalent ownership/path rules.

Service-role access is restricted to server code.

Do not put authorisation decisions in user-editable metadata.

---

# 17. Client state

Use a client-side store such as Zustand or similarly lightweight state management.

Suggested state domains:

```text
project
canvas
tools
selection
viewport
conversation
artifacts
sync
```

Keep transient pointer state out of global persistence where possible.

Do not make Supabase round trips part of drawing latency.

---

# 18. Offline and weak-network behaviour

Full offline collaboration is out of MVP scope, but basic resilience is important for iPad sketching.

Required:

- strokes render immediately,
- unsaved mutations queue locally if a save briefly fails,
- show subtle sync state,
- retry mutations,
- never silently discard completed strokes.

Possible implementation:

- IndexedDB mutation queue.

PWA shell should be installable to Home Screen.

Do not attempt offline AI.

---

# 19. PWA requirements

Include:

- web app manifest,
- application icons,
- standalone display mode,
- appropriate viewport settings,
- safe-area handling,
- iPad landscape support.

Prevent undesirable browser interaction while drawing:

- page scroll during canvas gestures,
- text selection,
- accidental long-press interactions where possible.

Do not disable expected accessibility behaviours outside the canvas unnecessarily.

---

# 20. Apple Pencil interaction

Critical interaction rules:

### Pencil
Default = draw.

### One finger
UI interaction / select depending on tool.

### Two fingers
Pan/zoom.

### Pencil + selection tool
Draw lasso or rectangle.

Use Pointer Events and pointer capture.

Where supported, pressure may affect line width subtly.

Do not require newer Pencil-specific APIs.

The application must still work with:

- older Apple Pencil,
- finger,
- mouse on desktop.

---

# 21. AI request lifecycle

For Ask:

```text
1. User selects region.
2. User enters prompt.
3. Client freezes selection geometry for this request.
4. Client renders:
   - selection
   - neighbourhood
   - whole canvas
5. Snapshots upload to private Supabase Storage.
6. Context snapshot row is created.
7. Client POSTs /api/ai/ask with IDs, not secrets.
8. Server authenticates Supabase user.
9. Server verifies ownership of project/canvas/selection.
10. Server creates ai_run.
11. Server obtains required images securely.
12. Server calls OpenAI.
13. Response streams or returns to client.
14. Assistant message is persisted.
15. ai_run marked completed.
16. UI displays response attached to the selection.
```

For Generate:

```text
1–11 same pattern
12. Server requests image generation/edit.
13. Result image is saved into generated-images storage.
14. artifact row is created.
15. ai_run marked completed.
16. Client receives artifact.
17. Thumbnail appears in AI panel.
18. User can insert artifact onto canvas.
```

---

# 22. Context optimisation

Do not resend unnecessarily large context.

Implement a `canvas_revision` or content hash.

If the whole canvas has not changed since the last AI turn, an existing snapshot may be reused.

Local crop should be regenerated if the nearby sketch changed.

Selection image should represent exactly what was visible at send time.

This system gives useful provenance and reduces repeated image processing.

---

# 23. Conversation branching

MVP UI may display a linear conversation, but data should support branching.

`messages.parent_message_id` permits:

```text
original idea
 ├─ variation A
 │   ├─ refinement A1
 │   └─ refinement A2
 └─ variation B
```

Generated artifacts also retain `source_ai_run_id`.

This prevents the architecture from becoming trapped in one linear chat model.

---

# 24. Generated artifact interaction

Each generated image should support:

- preview,
- insert on canvas,
- drag,
- resize,
- delete from canvas without deleting source artifact,
- select and ask AI about it,
- select and transform again.

When inserted onto canvas, it becomes a `canvas_object` pointing to an `artifact`.

Do not duplicate binary files unnecessarily.

---

# 25. Import images

Allow import from:

- iPad Photos / Files via standard file picker.

Imported image:

1. uploads to private Supabase Storage,
2. creates artifact,
3. creates canvas object.

User can sketch over it and select regions containing both imported imagery and strokes.

---

# 26. Image compositing for AI

When a selection overlaps multiple object types:

- strokes,
- imported images,
- generated images,

the AI should see the rendered visual composition exactly as the user sees it.

Therefore AI input should be based on rasterised canvas output rather than independently sending raw stroke objects during MVP.

Later semantic stroke/object data may be added as structured context.

---

# 27. Performance targets

Prioritise perceived responsiveness.

Targets:

- drawing latency should feel direct,
- selection should appear immediately,
- canvas pan/zoom should remain smooth on older iPad Pro hardware,
- autosave must not freeze drawing,
- side panel should not trigger full-canvas rerenders,
- large images should use browser-friendly preview sizes.

Use profiling on a real older iPad before adding visual effects.

Avoid expensive perpetual canvas shadows, blur filters, or excessive DOM overlays.

---

# 28. Error handling

Every AI action needs visible recoverable states:

```text
Preparing context…
Thinking…
Generating…
Saving…
```

On failure:

```text
Couldn’t complete this request.
[Try again]
```

Do not lose:

- prompt,
- selection,
- context snapshots.

Record server error safely in `ai_runs`.

Never expose raw API credentials or internal stack traces.

---

# 29. Rate limiting and cost controls

Implement per-user server-side rate limiting.

At minimum track:

- AI requests,
- image generation requests,
- model used,
- token usage if returned,
- estimated cost if available.

Add simple guardrails:

- maximum context image dimensions,
- maximum prompt length,
- maximum generations per request,
- request timeout,
- image MIME validation,
- upload size limits.

Later UI may show usage.

MVP does not require billing.

---

# 30. Security requirements

Non-negotiable:

- OpenAI key server-side only.
- Supabase service-role key server-side only.
- RLS enabled.
- private storage buckets.
- validate authenticated ownership server-side before AI processing.
- signed asset access where needed.
- validate MIME types and upload sizes.
- sanitise filenames.
- do not log image binaries or user prompts unnecessarily.
- do not include secrets in client bundles.
- use environment-specific Vercel secrets.
- no public bucket for private sketches.

The Vercel server is the trust boundary for privileged AI operations.

---

# 31. Privacy posture

MVP should clearly communicate:

- sketches are stored in the user's project,
- selected images are transmitted to the configured AI provider when the user explicitly invokes AI,
- AI is not invoked continuously while drawing,
- only context required for the requested interaction is transmitted.

This explicit selection model is valuable:

> drawing is private activity until the user invokes an AI action.

Do not continuously upload screen/video streams to the AI.

---

# 32. API contracts

## POST /api/ai/ask

Request:

```json
{
  "projectId": "uuid",
  "canvasId": "uuid",
  "conversationId": "uuid",
  "selectionId": "uuid",
  "contextSnapshotId": "uuid",
  "prompt": "This entry feels too abrupt..."
}
```

Response / streamed final payload conceptually:

```json
{
  "runId": "uuid",
  "messageId": "uuid",
  "text": "I notice...",
  "status": "completed"
}
```

## POST /api/ai/generate

Request:

```json
{
  "projectId": "uuid",
  "canvasId": "uuid",
  "conversationId": "uuid",
  "selectionId": "uuid",
  "contextSnapshotId": "uuid",
  "prompt": "Generate three alternatives...",
  "count": 3
}
```

Response:

```json
{
  "runId": "uuid",
  "artifacts": [
    {
      "id": "uuid",
      "type": "generated_image",
      "signedUrl": "temporary-url",
      "width": 1536,
      "height": 1024
    }
  ]
}
```

## POST /api/ai/transform

Same core request structure as Generate, with explicit transformation intent.

---

# 33. Supabase migrations

Codex must create SQL migrations for:

- tables,
- indexes,
- enums or check constraints,
- foreign keys,
- updated_at handling,
- RLS enablement,
- RLS policies,
- Storage bucket creation instructions/policies if practical.

Important indexes:

```text
projects(owner_id)
canvases(project_id)
strokes(canvas_id)
canvas_objects(canvas_id)
messages(conversation_id, created_at)
ai_runs(conversation_id, created_at)
artifacts(project_id, created_at)
selections(canvas_id, created_at)
```

---

# 34. Suggested repository structure

```text
/
├─ app/
│  ├─ page.tsx
│  ├─ projects/
│  ├─ project/[projectId]/
│  └─ api/
│     └─ ai/
│        ├─ ask/route.ts
│        ├─ generate/route.ts
│        └─ transform/route.ts
│
├─ components/
│  ├─ canvas/
│  │  ├─ SketchCanvas.tsx
│  │  ├─ StrokeRenderer.tsx
│  │  ├─ SelectionOverlay.tsx
│  │  ├─ ContextActions.tsx
│  │  └─ CanvasObject.tsx
│  ├─ ai/
│  │  ├─ AIPanel.tsx
│  │  ├─ Conversation.tsx
│  │  ├─ PromptBar.tsx
│  │  └─ ArtifactCard.tsx
│  └─ ui/
│
├─ lib/
│  ├─ ai/
│  │  ├─ provider.ts
│  │  ├─ openai.ts
│  │  ├─ prompts.ts
│  │  └─ context.ts
│  ├─ canvas/
│  │  ├─ rasterize.ts
│  │  ├─ coordinates.ts
│  │  └─ selection.ts
│  ├─ supabase/
│  │  ├─ client.ts
│  │  ├─ server.ts
│  │  └─ middleware.ts
│  └─ auth/
│
├─ stores/
│  └─ canvas-store.ts
│
├─ types/
│  ├─ canvas.ts
│  ├─ ai.ts
│  └─ database.ts
│
├─ supabase/
│  └─ migrations/
│
├─ public/
│  ├─ manifest.webmanifest
│  └─ icons/
│
├─ tests/
│
└─ README.md
```

---

# 35. UI visual direction

The MVP should resemble a refined sketchbook rather than a SaaS dashboard.

Characteristics:

- warm white or very light neutral canvas,
- generous whitespace,
- restrained borders,
- small number of controls,
- black/graphite drawing strokes,
- single restrained accent colour for selection and active AI actions,
- soft floating contextual toolbar,
- rounded but not overly playful UI,
- high-quality typography,
- minimal persistent chrome.

Canvas receives approximately 65–75% of landscape width when AI panel is open.

AI panel receives approximately 25–35%.

Panel collapses.

Avoid:

- dense tool ribbons,
- colourful AI gradients everywhere,
- permanent chat bubbles over the sketch,
- excessive cards,
- desktop-first tiny controls.

Touch targets should be iPad-appropriate.

---

# 36. Initial screen states

## State A — Empty canvas

Show:

```text
Start sketching
```

very subtly.

Do not show onboarding modal unless essential.

## State B — Drawing

Only drawing tools visible.

AI remains quiet.

## State C — Selection

Selected region outlined.

Floating:

```text
Ask     Generate     Transform
```

## State D — Ask

AI panel opens.

Top shows small context preview.

Prompt is submitted.

Response streams below.

## State E — Generate

Show image result cards.

Actions per card:

```text
Place on canvas
Variation
Ask about this
```

## State F — Canvas with AI artifact

Generated result sits beside sketch.

User can draw around/over it and make another selection.

This is the core recursive loop.

---

# 37. MVP scope

## Must have

- Next.js / React / TypeScript
- Vercel deployment
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- RLS
- iPad/Pencil drawing
- eraser
- undo/redo
- pan/zoom
- rectangle selection
- lasso selection
- selection crop
- neighbourhood context crop
- whole-canvas context snapshot
- OpenAI Ask
- OpenAI Generate
- OpenAI Transform where supported
- persistent conversations
- persistent generated artifacts
- insert generated image onto canvas
- image import
- autosave
- basic PWA support
- responsive desktop support

## Explicitly out of MVP

- CAD
- vector export
- complex layers
- brush marketplace
- collaboration/multi-user presence
- comments by multiple humans
- semantic object recognition
- automatic BIM generation
- React Flow
- timeline/history visualisation
- full offline editing
- Gemini implementation
- custom voice transcription
- realtime voice conversation
- agent swarm
- project management
- version-control UI
- infinite model/provider settings
- billing

Architecture should not unnecessarily prevent these later.

---

# 38. Build phases

## Phase 1 — Sketch shell

Implement:

- app shell,
- PWA,
- project screen,
- sketch canvas,
- Apple Pencil,
- pan/zoom,
- undo/redo,
- local state.

Acceptance:

User can comfortably sketch for several minutes on iPad without obvious interaction failures.

## Phase 2 — Persistence

Implement:

- Supabase Auth,
- projects,
- canvases,
- strokes,
- autosave,
- reopen project,
- Storage.

Acceptance:

Close browser, reopen project, drawing is intact.

## Phase 3 — Selection intelligence

Implement:

- rectangle selection,
- lasso,
- selection snapshots,
- neighbourhood snapshots,
- whole-canvas snapshots,
- contextual toolbar.

Acceptance:

A selected area can produce three accurate visual snapshots corresponding to what the user sees.

## Phase 4 — Ask AI

Implement:

- server-side OpenAI provider,
- `/api/ai/ask`,
- AI panel,
- streaming where practical,
- conversation persistence,
- selection-linked messages.

Acceptance:

User selects part of drawing and has a useful multi-turn conversation about it.

## Phase 5 — Visual generation

Implement:

- Generate,
- Transform,
- Storage of outputs,
- artifacts,
- image cards,
- insert generated image into canvas.

Acceptance:

User can move from hand sketch to AI visual result and then continue sketching/asking from that result.

## Phase 6 — Hardening

Implement:

- iPad testing,
- loading/error states,
- rate limiting,
- request validation,
- storage cleanup strategy,
- performance profiling,
- security review.

---

# 39. Required tests

## Unit

Test:

- world/screen coordinate conversion,
- selection bounds,
- context expansion,
- crop calculations,
- path serialisation,
- provider request mapping.

## Integration

Test:

- authenticated project creation,
- RLS isolation,
- stroke persistence,
- snapshot upload,
- Ask request,
- generated artifact persistence.

## Browser / E2E

Test core loop:

```text
create project
→ draw
→ select
→ ask
→ receive response
→ generate
→ insert image
→ reload
→ verify everything remains
```

Use Playwright where practical.

## Manual iPad tests

Mandatory before MVP is considered complete:

- Pencil drawing,
- finger interactions,
- pinch zoom,
- two-finger pan,
- lasso,
- keyboard open/close,
- side-panel interaction,
- orientation changes,
- Home Screen PWA launch,
- Safari fallback,
- older iPad performance.

---

# 40. Definition of done

The MVP is complete when the following experience works reliably:

> I open Sketch AI on my iPad.
>
> I draw an architectural or conceptual sketch with Apple Pencil.
>
> I lasso one region.
>
> I tap Ask and say, “I like this space but the transition feels too abrupt.”
>
> The AI understands which part I mean while also seeing the surrounding and whole sketch.
>
> I ask it to generate alternatives.
>
> Visual alternatives appear beside the sketch.
>
> I drag one onto the canvas.
>
> I sketch over it.
>
> I select part of the new hybrid drawing and continue the conversation.
>
> I close the app.
>
> When I return, the project, drawings, images, selections and conversation are still there.

Anything not required to make this loop excellent should be treated as secondary.

---

# 41. Implementation constraints for Codex

Codex should:

1. build the smallest coherent implementation satisfying this specification;
2. prefer simple maintainable components over premature abstraction;
3. keep AI provider calls behind a provider interface;
4. keep API credentials server-only;
5. apply Supabase RLS from the first migration;
6. use private Storage;
7. treat the canvas as local-first interactive state with asynchronous persistence;
8. avoid large dependencies unless they clearly improve Pencil/canvas interaction;
9. verify iPad Pointer Event compatibility;
10. avoid implementing out-of-scope features;
11. create a useful README with setup instructions;
12. provide `.env.example` with names only, never secrets;
13. make all model IDs configurable;
14. fail gracefully if AI configuration is absent;
15. include seed/demo project capability only if it does not complicate production code.

---

# 42. Environment setup

`.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=
OPENAI_CHAT_MODEL=
OPENAI_IMAGE_MODEL=
```

On Vercel:

- configure environment variables separately for Development / Preview / Production as appropriate;
- secrets remain server-side;
- redeploy when server environment configuration changes.

---

# 43. README setup sequence

Document:

1. clone repository,
2. install dependencies,
3. create Supabase project,
4. run migrations,
5. configure private Storage buckets/policies,
6. configure Auth,
7. copy `.env.example` to local environment file,
8. add Supabase values,
9. add OpenAI API key,
10. choose configured OpenAI model IDs,
11. run locally,
12. run tests,
13. deploy to Vercel,
14. configure Vercel environment variables,
15. verify production Auth redirect URLs,
16. test from actual iPad.

---

# 44. Future extensions

Do not implement yet, but preserve conceptual room for:

## Multiple AI providers

OpenAI / Gemini selectable at interaction or project level.

## AI sketch overlays

AI returns transparent drawn annotations rather than only text/images.

## “I notice / I wonder”

AI may quietly create optional observation pins without interrupting drawing.

This should remain opt-in rather than continuous surveillance.

## Voice conversation

Hold Pencil / voice gesture, speak naturally while drawing.

## Spatial threads

Conversation markers live directly on canvas.

## Branches

Pull an AI result sideways to create an explicit alternate design lineage.

## Design memory

Project-level concepts, constraints, decisions and preferences.

## Semantic ink

Certain marks become recognised relationships, annotations or constraints.

## Geometry mode

Selected visual ideas can later transition toward explicit editable geometry.

## Collaborative Canvas integration

The system can eventually become a specialised visual interaction surface inside a broader collaborative thinking environment.

---

# 45. Architectural principle

Do not treat this as:

```text
drawing app + chatbot
```

Treat it as:

```text
shared visual thinking space
```

The important primitive is not the message.

It is:

```text
user attention
+ spatial selection
+ visual context
+ dialogue
+ generated proposition
+ continued making
```

The MVP should prove whether that loop creates a qualitatively better way for a human and AI to think together.
