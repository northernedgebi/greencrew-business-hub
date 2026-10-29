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
- Snow jobs snapshot service pricing, store total crew-work hours, and calculate billable prices in a database trigger after crew-field validation; invoiced pricing/time is immutable so all billing paths use the same protected charge.
- Customer history is append-only under office/read-only RLS and written by record triggers; billing transitions are captured on invoice writes and reconciled on history reads with effective dates, while completed/billed visits cannot be deleted individually.
- Service creation sends the calendar's IANA time zone; validate dates and generate initial occurrences in that zone so local today is not rejected after UTC midnight.
- Generate recurrence dates from the original start plus occurrence index, not by incrementing the previous date, to preserve month/year anchors and original occurrence deduplication after moves.
- Derive customer billing holds through the security-definer customer_account_state function and security-invoker customer_accounts view; enforce service start/dispatch and generation through database guards, keeping manual inactivity separate so payments never clear cancellations and date-based holds cannot go stale.
- Use the shared DeleteRecord confirmation for company record deletion with explicit related-record consequences, tenant-scoped RLS writes, returned-row verification, and cache invalidation; keep existing bookings when deleting recurring plans to preserve dispatched and completed work.
- Recurring services may have an optional season window stored as MM-DD text (season_start/season_end); generation skips dates outside the window via in_service_season, and forms collect full dates but persist month-day only.
- Customer billing mode (combined vs per_property) decides whether unbilled completed visits become one invoice with per-address line labels or one invoice per address; invoice pages group line items by property address with subtotals.
- Monthly billing uses an office-authorized atomic RPC and invoice period/group uniqueness; a managed authenticated daily callback creates drafts in each customer's local time zone to avoid duplicate charges. Fixed fees use combined invoices and visit coverage snapshots; included visits remain priced history but are excluded from per-visit billing. Card processing remains disconnected until explicitly enabled.
- Invoice print output reuses persisted totals and grouped items; email sharing composes an itemized message in the user's mailbox until a sender domain is configured.
- Customer service forms check normalized names per property against plans and upcoming standalone work, excluding the edited record and generated occurrences; refetch before saving so stale lists cannot silently add duplicates.
- Reuse CompanyBrand with private signed storage logos; public company_branding exposes only name/id/current logo, and storage permits only current logos publicly. Portal account selection scopes content by customer so multiple hired companies retain separate branding.
