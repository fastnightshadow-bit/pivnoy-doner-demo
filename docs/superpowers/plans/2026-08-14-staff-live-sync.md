# Staff Live Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make kitchen and courier orders update automatically, preserve a valid staff session across reloads, and recover safely from stale order versions.

**Architecture:** Keep server-sent events as the fast path and add a shared five-second polling controller as the fallback. Reuse the existing HttpOnly session cookie through a new `getSession()` client method. Put stale-version recovery in a small shared helper so kitchen and courier perform the same guarded single retry.

**Tech Stack:** Vanilla ES modules, Fetch API, EventSource, Node test runner, PWA service workers.

## Global Constraints

- Do not weaken server authorization or optimistic concurrency.
- Do not expose the staff PIN or session cookie to JavaScript storage.
- Retry a status mutation at most once and only after loading a fresh matching order.
- Keep client cache versions coherent across HTML, modules, and service workers.

---

### Task 1: Shared synchronization and conflict recovery

**Files:**
- Create: `staff-live-sync.js`
- Test: `tests/staff-live-sync.test.mjs`

**Interfaces:**
- Produces: `createStaffLiveSync(options)` and `executeVersionedAction(options)`.

- [x] **Step 1: Write failing tests** for five-second fallback refresh, overlapping-refresh prevention, clean stop, one conflict retry, and no retry when the fresh state no longer permits the action.
- [x] **Step 2: Run focused tests** and confirm failures are caused by missing exports.
- [x] **Step 3: Implement the shared helpers** with one in-flight refresh and one guarded retry.
- [x] **Step 4: Run focused tests** and confirm they pass.

### Task 2: Restore sessions and improve API errors

**Files:**
- Modify: `kitchen-api.js`
- Modify: `courier-api.js`
- Modify: `tests/kitchen-api.test.mjs`
- Modify: `tests/courier-api.test.mjs`

**Interfaces:**
- Produces: `getSession()` on both real and demo APIs; errors include HTTP status, server code, and details.

- [x] **Step 1: Write failing API tests** for session restoration, unauthenticated null, and preserved 409 metadata.
- [x] **Step 2: Run focused tests** and record RED.
- [x] **Step 3: Implement minimal API changes** without storing credentials in local storage.
- [x] **Step 4: Run focused tests** and confirm GREEN.

### Task 3: Wire kitchen and courier interfaces

**Files:**
- Modify: `kitchen.js`
- Modify: `courier.js`
- Modify: `kitchen.html`
- Modify: `courier.html`
- Modify: `kitchen-sw.js`
- Modify: `courier-sw.js`
- Modify: `tests/deployment.test.mjs`

**Interfaces:**
- Consumes: shared synchronization helpers and API `getSession()`.

- [x] **Step 1: Add regression tests** for the complete immutable-cache dependency graph.
- [x] **Step 2: Restore valid sessions on load**, start SSE plus five-second polling, and synchronize immediately when a tab becomes visible.
- [x] **Step 3: Route kitchen and courier status actions through guarded conflict recovery** and show useful errors for expired sessions.
- [x] **Step 4: Bump all staff asset and service-worker cache versions coherently.**
- [x] **Step 5: Run focused and deployment tests.**

### Task 4: Verify and publish to stage

**Files:**
- Modify: `client-theme.css`
- Modify: client HTML cache references already changed for the dark-address fix.

- [x] **Step 1: Run the complete root and server suites.**
- [x] **Step 2: Run syntax, diff, and cache-version checks.**
- [x] **Step 3: Commit and push the branch.**
- [x] **Step 4: Deploy only the stage web image and verify public pages plus `/api/health` without reading staff/customer data.**
