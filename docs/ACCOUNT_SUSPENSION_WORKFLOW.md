# Account Suspension and Review Workflow

AgriScan supports transparent account status management for farmer and administrator safety. Admins can place accounts into one of four states:

- `active`: normal access.
- `suspended`: temporary restriction, used for suspicious activity or policy violations.
- `disabled`: permanent or indefinite restriction until an admin reactivates the account.
- `pending_review`: restricted while administrators investigate account information or behavior.

Suspended and pending review accounts cannot access protected farming features, scans, reports, marketplace actions, or regular APIs. They can only view their account status and submit an appeal.

## Admin Suspension Requirements

Every admin status action requires:

- A reason.
- Description/details.
- Automatic timestamp.
- Admin ID.
- Affected account ID.
- IP address and user agent when available.

Status changes are recorded in:

- `audit_logs` for system-wide accountability.
- `admin_actions` for admin-focused traceability.
- `suspension_logs` for the account status timeline.

## Farmer Notification and Appeal

When a farmer account is suspended, AgriScan stores an in-app notification and displays:

> Your account has been temporarily suspended due to suspicious activity. Please contact the administrator or submit an appeal request.

Suspended farmers can submit one pending appeal with:

- Explanation.
- Supporting message.
- Updated information.

Admins can approve or reject appeals from the admin dashboard. Approving an appeal reactivates the account and records the decision. Rejecting an appeal leaves the restriction in place and notifies the farmer.

## Suspicious Activity Signals

AgriScan records security events for:

- Failed logins.
- Multiple failed login attempts.
- Rate-limited rapid login attempts.
- New or unusual device logins.
- Submitted appeals.

Repeated failed logins can trigger an automatic temporary suspension. Manual suspensions default to temporary handling unless an admin explicitly chooses `disabled`.

## Transparency and Compliance Notes

Audit logs are used to protect system integrity and prevent unauthorized or malicious activity. They also support fairness by making administrative actions reviewable, timestamped, and tied to a reason. Farmers are shown the status reason and next steps, and the appeal process gives them a path to request reactivation.

Admins should use the least restrictive status that fits the risk, write clear reasons, and reactivate accounts promptly when the issue is resolved.
