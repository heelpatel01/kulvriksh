# Kulvriksh Digital Platform — Performance and Navigation Standards

**Document:** `docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md`  
**Status:** Proposed engineering standard for roadmap review  
**Applies to:** Public website, surname landing pages, customer portal, genealogist portal, and admin panel  
**Purpose:** Prevent avoidable slow page transitions, excessive loading, and poor responsiveness.

## 1. Core principle

The platform must feel responsive during normal use. Navigation should not trigger a full browser-page reload unless there is a deliberate technical reason. Do not treat choosing Next.js as sufficient proof of performance; implement, measure, and test performance throughout development.

These are engineering targets, not guarantees for every device, network, or third-party provider. Record test conditions and investigate any missed target.

## 2. Frontend architecture and navigation

- Use **Next.js (React-based)** for the public website and SEO landing pages, subject to approval in `docs/00-ROADMAP.md`.
- Use Next.js-supported client-side navigation (`next/link`) for internal routes where appropriate. Avoid ordinary full-document navigation for routine internal page changes.
- Keep public pages compatible with search-engine crawling: render meaningful page content in the initial HTML using static generation or server rendering where appropriate.
- Use Server Components by default where suitable. Add Client Components only where interactivity or browser APIs require them.
- Split code by route and feature; load large or optional components only when needed.
- Do not make the entire application a Client Component merely for convenience.
- Keep shared layout elements (such as the navbar) stable across navigation so they do not unnecessarily remount.
- Show immediate visual feedback for navigation. If the destination needs more than a brief moment, display a lightweight, accessible loading state rather than leaving the interface apparently frozen.
- Preserve normal browser behavior for opening links in a new tab, keyboard navigation, focus management, and back/forward navigation.
- Avoid redirect chains and unnecessary middleware/server round trips on routine navigation.
- Do not block rendering the main page on analytics, chat widgets, nonessential scripts, or below-the-fold media.

## 3. Performance targets

Measure the production build, not only the development server. Record the device, network profile, browser, route, and whether the cache is warm or cold.

### 3.1 Core Web Vitals

Use Google's standard “good” thresholds at the 75th percentile when sufficient real-user data is available:

| Metric | Target |
|---|---:|
| Largest Contentful Paint (LCP) | ≤ 2.5 seconds |
| Interaction to Next Paint (INP) | ≤ 200 milliseconds |
| Cumulative Layout Shift (CLS) | ≤ 0.1 |

Until sufficient real-user data exists, use repeatable lab tests as an early warning signal. Lab measurements do not replace field data.

### 3.2 Application-level targets

| Scenario | Target |
|---|---|
| Warm-cache internal navigation between ordinary pages | Main destination content should become usable within 300 ms at p75 in the agreed test profile |
| Navigation with required network/API work | Provide immediate feedback; avoid a frozen or blank interface; render available shell/content without waiting for unrelated work |
| API request for a typical, indexed read operation | Aim for ≤ 300 ms server response at p75 in local/staging performance tests; document exceptions and external-provider latency separately |
| Route change | No unintended full-page reload, loss of shared layout state, or duplicate requests for the same data |
| JavaScript errors | No uncaught errors during the tested critical user journeys |
| Layout stability | Reserve space for images, media, and asynchronous content to avoid visible layout jumps |

These application-level targets are proposed project budgets. Confirm realistic test conditions during the foundation phase. Do not claim they are met without measurements.

## 4. Data fetching and caching

- Fetch only the data required for the current view.
- Avoid sequential API requests where independent requests can safely run in parallel.
- Avoid fetching the same data in multiple components when it can be shared or deduplicated.
- Cache public, non-personal content where appropriate, including static surname-page content.
- Define caching and revalidation explicitly. Do not cache private customer, genealogist, admin, family, payment, or research data in a way that could expose one user's information to another.
- Never rely on frontend caching as an authorisation or security control.
- Add pagination and suitable database indexes for lists and searches.
- Avoid N+1 database query patterns and fetching entire records when only a few fields are needed.
- Give API requests sensible timeouts, cancellation behavior, and clear retry rules. Do not automatically retry non-idempotent operations in a way that can create duplicate orders or writes.
- Keep third-party APIs out of the critical rendering path unless the page cannot function without them.

## 5. Assets and rendering

- Use Next.js image optimisation or an equivalent controlled image pipeline where appropriate.
- Serve correctly sized, compressed images in modern formats when supported.
- Lazy-load below-the-fold images and noncritical media; do not lazy-load the primary above-the-fold/LCP image.
- Use efficient font loading and avoid loading unnecessary font weights.
- Prevent layout shifts by defining image/media dimensions or aspect ratios.
- Keep client-side JavaScript small; review bundle size and remove unused dependencies.
- Defer nonessential analytics and third-party scripts without breaking the page if they fail.
- Use skeletons or placeholders only where they improve perceived continuity; do not use loading animations to hide consistently slow requests.

## 6. Backend and VPS constraints

The target Hostinger VPS is **1 vCPU, 4 GB RAM and 50 GB shared NVMe**. Performance decisions must respect this limit.

- Use efficient PostgreSQL queries and indexes; inspect slow queries during testing.
- Use one shared PrismaClient per application process.
- Apply pagination and limits to list endpoints and exports.
- Bound concurrency and resource usage for PDF generation, TTS, uploads, and other CPU/memory-heavy tasks.
- Keep large file transfers and expensive operations from unnecessarily blocking ordinary API requests.
- Set request, upload, and provider timeouts and handle failures gracefully.
- Monitor CPU, memory, disk, process restarts, API errors, and response latency.
- Do not add Redis, a queue service, or other infrastructure solely by assumption. Introduce extra infrastructure only if measured requirements and the agreed scope justify it.
- Do not expose PostgreSQL publicly.

## 7. Testing and acceptance

Performance must be tested incrementally, not postponed until launch.

1. Create a production build and test it; development-mode timings are not acceptance evidence.
2. Test representative routes: homepage, portfolio/service-style public pages if present, surname pages, customer dashboard, family tree, genealogist portal, and admin lists.
3. Test transitions from one route to another using internal navigation, including browser back/forward.
4. Check for full-document reloads, duplicate API requests, repeated shared-layout mounting, unnecessary loading indicators, console errors, and layout shifts.
5. Use Lighthouse or equivalent lab tooling for representative public routes and inspect JavaScript bundle sizes.
6. Use browser performance tooling to inspect slow route transitions and long tasks.
7. Test API response times and database queries with representative data volumes. The final family-tree size and media quotas remain dependent on client decisions.
8. Run basic load checks on the actual target VPS before launch, within the agreed scope.
9. Record baseline measurements, regressions, fixes, and final results. Do not mark a target as passed without evidence.
10. Add performance checks to the regression checklist for critical journeys.

### Minimum acceptance gate

Before a phase is accepted:
- No avoidable full-page reload on routine internal navigation.
- No obvious blank/frozen state during route transitions.
- No duplicate requests or repeated expensive work without a documented reason.
- No critical console errors in the tested journey.
- Performance regressions introduced by that phase are investigated and either fixed or explicitly documented and approved.
- Public SEO pages deliver meaningful initial HTML and retain their SEO requirements.

Before production launch:
- Run production-build performance tests.
- Record Core Web Vitals lab results for representative public pages.
- Run a basic VPS load test and document any bottlenecks or limitations.
- Confirm monitoring is available for errors and server resource pressure.

## 8. Rules for the coding agent

- Inspect the existing repository and package versions before choosing implementation details.
- Follow the approved architecture and roadmap; do not add an unapproved framework, service, or paid dependency.
- Do not replace working architecture just to chase a benchmark.
- Optimise based on measurements and profiling rather than guesswork.
- Keep accessibility, security, SEO, and data privacy intact while optimising.
- If a target cannot reasonably be met on the agreed VPS, document the measured bottleneck and propose options; do not silently add cost or infrastructure.
- Update relevant documentation when a performance decision changes architecture or scope.

## 9. Items to confirm

- Whether the proposed 300 ms warm-navigation target is accepted and which test profile defines p75.
- Which production monitoring and performance measurement tools will be used.
- Whether a separate staging environment is approved.
- Expected representative data volumes for family trees, research lists, and admin tables.

These are engineering clarifications. They must not be silently treated as new client-facing product features.
