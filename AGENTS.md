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
