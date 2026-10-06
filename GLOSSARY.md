# PTS API

Backend for planners as they move through their approval workflow, and for the notifications that workflow raises for the people involved.

## Planning

**Planner**:
The document a workflow is about; the subject of workflow events and the usual source of a notification.
_Avoid_: Plan, planner document

**Planner (role)**:
The user role whose holders work on planners, alongside GA and Finance. Always qualified with "(role)" in prose so it is never confused with the document.
_Avoid_: Planner (unqualified, when the role is meant)

**JV**:
A Joint Venture: a business entity, identified by its tax ID, that takes part in a planner and is approved or rejected by a GM on its own.
_Avoid_: Journal voucher, partner

## Workflow events

**Workflow Event**:
A recorded fact that a planner, or a JV on it, changed status, raised by the module where the change happened.
_Avoid_: Domain event, action

**Outbox Event**:
A workflow event waiting to be turned into notifications; saved right after the change itself, published at once, and retried until it is published or runs out of attempts.

**Audit-only**:
A workflow event type that is recorded but notifies nobody.

## Notifications

**Notification**:
A message telling one account that something happened in a workflow, kept in that account's inbox until read.
_Avoid_: Planner notification, alert

**Recipient Kind**:
Why an account receives a notification: GA, Employee, Supervisor, GM Approver, Planner (role) or Finance. GA, Planner (role) and Finance always mean the account was notified because it holds that role.

**Recipient Target**:
A rule's description of who should be notified (such as the creator or the GM approvers); it resolves to accounts, each with a recipient kind.
_Avoid_: Audience, recipient (when the selector is meant)

**Inbox**:
The notifications of one account, newest first; the source of truth for what that account has been told.

**Live Push**:
A hint over the stream that a new notification arrived; it may arrive more than once and is never the source of truth.
_Avoid_: Real-time notification
