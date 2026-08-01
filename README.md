# WeSketch

The current Phase 2 build adds private, durable Supabase projects to the
validated sketch core on the minimum supported device:

- iPad Pro 12.9-inch, first generation (`ML0N2X/A`)
- Apple Pencil, first generation
- iPadOS 16.7.16 / Safari 16

It includes email/password authentication, owner-isolated projects, Pencil
drawing, whole-stroke erasing, rectangle/lasso regions, private image storage,
deterministic three-level context snapshots, IndexedDB caching, and asynchronous
Supabase synchronization. AI services are not used yet.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Set
`NEXT_PUBLIC_SITE_URL` to the LAN URL used by the iPad, and add
`{NEXT_PUBLIC_SITE_URL}/auth/callback` to Supabase Auth's allowed redirect URLs.
Apply
`supabase/migrations/20260801113049_phase_2_persistence.sql` to the linked
Supabase project. The migration creates owner-only RLS policies and the private
`project-assets` bucket.

The development server listens on all interfaces. Open the displayed LAN URL
from Safari on the iPad while both devices are on the same network.

## Automated checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Target-iPad acceptance test

1. Create an account on the development computer, confirm the email, then sign
   in on the iPad.
2. Create a project and open it in Safari.
3. Draw continuously with Apple Pencil for ten minutes.
4. While drawing, rest a palm on the display and introduce/remove touch
   contacts. Confirm that touch does not move the viewport during an active
   Pencil stroke.
5. Use two fingers to pan and pinch at several zoom levels.
6. Switch to Hand and verify one-finger pan.
7. Wait for the sync state to show **saved**, close Safari, reopen the same
   project, and confirm every completed non-stress stroke returns.
8. Import an image from Photos, wait for **saved**, and repeat the reopen test.
9. Load the 10,000-stroke test at the recommended 1.5× pixel ratio.
10. Record the displayed render duration and verify navigation remains usable.
11. Repeat at 2× only as a stress comparison.
12. Launch from the Home Screen and repeat Pencil, pinch, orientation, and
    reload checks.
13. Erase complete strokes at multiple zoom levels and verify undo/redo.
14. Draw over the imported image, select the hybrid region, and tap
    **Prepare AI context**.
15. Confirm Selection, Neighbourhood, and Whole canvas previews all match the
    visible composition.

Phase 2 passes when normal sketching produces no lost strokes, accidental
viewport gestures, or unrecoverable pointer cancellations; projects and private
images survive a full browser close/reopen; the 10,000-stroke document remains
navigable at 1.5×; and all three context previews match the visible composition.

## Prototype boundaries

- Stress-test strokes are memory-only and intentionally disappear on reload.
- Completed user strokes and image objects are cached in IndexedDB and
  synchronized to the authenticated Supabase project.
- Remote mutations retry in order during the active browser session. IndexedDB
  retains local additions and deletion tombstones so an interrupted sync is
  reconciled after the next authenticated reopen.
- The renderer uses a finite 2048 × 1536 world artboard.
- The first implementation uses a whole-stroke undo model.
- AI-region selections are transient and separate from image-object selection.
