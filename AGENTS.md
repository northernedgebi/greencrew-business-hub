<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Share local-date and weekday selection through the scheduling date picker so single visits and recurring plans use consistent calendar rules.
- Preserve a recurring job's original occurrence separately from its actual scheduled date so moving a visit cannot recreate its original cut when filling the schedule.
- Recurring plan edits affect newly generated visits; existing visits are edited individually to preserve dispatch changes and completed work.
- Store crew schedule access on invitations and company memberships; enforce crew/date scope in database policies so all job read paths share the same access boundary.
- Crew managers may dispatch only within their enabled crew/date scope; recurring generation remains office-only to avoid generating outside authorized dates.
- Route stop order is stored per job (route_order) and computed client-side from cached property/crew coordinates; geocoding runs in an authenticated server function via OpenStreetMap so no paid map key is needed.
- Disabling a company (subscription_status = suspended) is enforced in is_member/has_company_role so every RLS path locks out; only platform admins may change subscription status or trial dates (trigger).
- Customer portal writes go only through security-definer portal_* RPCs; companies act on service_requests directly under office RLS.
- Customer services reuse recurring_plans and jobs, distinguished by service_kind; atomic office-only RPCs create customers/services and combine individual visits so all schedule, route and billing views share persisted work.
- Winter services use the same service records and billing flow as landscaping; onboarding accepts a service array atomically, and shared-visit actions retain separate prices and recurrence identities while checking customer, property, company, crew, and local date.
- Service creation sends the calendar's IANA time zone; validate dates and generate initial occurrences in that zone so local today is not rejected after UTC midnight.
- Generate recurrence dates from the original start plus occurrence index, not by incrementing the previous date, to preserve month/year anchors and original occurrence deduplication after moves.
- Derive customer billing holds through the security-definer customer_account_state function and security-invoker customer_accounts view; enforce service start/dispatch and generation through database guards, keeping manual inactivity separate so payments never clear cancellations and date-based holds cannot go stale.
- Use the shared DeleteRecord confirmation for company record deletion with explicit related-record consequences, tenant-scoped RLS writes, returned-row verification, and cache invalidation; keep existing bookings when deleting recurring plans to preserve dispatched and completed work.
- Recurring services may have an optional season window stored as MM-DD text (season_start/season_end); generation skips dates outside the window via in_service_season, and forms collect full dates but persist month-day only.
- Customer billing mode (combined vs per_property) decides whether unbilled completed visits become one invoice with per-address line labels or one invoice per address; invoice pages group line items by property address with subtotals.
