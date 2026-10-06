# PTS API

Backend for planners as they move through their approval workflow, and for the notifications that workflow raises for the people involved.

## Language

**Planner**:
The document a workflow is about; the subject of workflow events and the usual source of a notification.
_Avoid_: Plan, planner document

**Planner (role)**:
The user role whose holders work on planners, alongside GA and Finance. Always qualified with "(role)" in prose so it is never confused with the document.
_Avoid_: Planner (unqualified, when the role is meant)

**Notification**:
A message telling one account that something happened in a workflow, kept in that account's inbox until read.
_Avoid_: Planner notification, alert
