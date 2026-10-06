import { describe, expect, it } from "vite-plus/test"

import { notificationRulesConfig, validateNotificationRulesConfig } from "./rules.js"
import { type NotificationRulesConfig, type WorkflowEventRuleDefinition } from "./type.js"

const auditOnly: WorkflowEventRuleDefinition = { mode: "audit_only", reason: "Recorded only." }

// A made-up config: every Workflow Event is Audit-only except PLANNER_CREATED, which carries the rule under test.
function configWithRule(rule: WorkflowEventRuleDefinition): NotificationRulesConfig {
  return {
    events: {
      PLANNER_CREATED: rule,
      GA_ESTIMATE_CONFIRMED: auditOnly,
      GM_JV_REJECTED: auditOnly,
      GM_JV_APPROVED: auditOnly,
      GM_JV_REAPPROVAL_REQUIRED: auditOnly,
      PLANNER_FULLY_APPROVED: auditOnly,
      EMPLOYEE_SUMMARY_SUBMITTED: auditOnly,
      GA_ACTUAL_CONFIRMED: auditOnly,
      ALLOWANCE_CLAIM_CANCELLED: auditOnly,
      ALLOWANCE_CLAIM_REJECTED: auditOnly,
      PLANNER_READY_FOR_ANALYSIS: auditOnly,
      PLANNER_ANALYSIS_COMPLETED: auditOnly,
      PLANNER_CANCELLED: auditOnly,
    },
  }
}

describe("notification rules config validation", () => {
  it("accepts the real notification rules config", () => {
    expect(() => validateNotificationRulesConfig(notificationRulesConfig)).not.toThrow()
  })

  it("accepts an Audit-only rule, which has no targets and no content", () => {
    const config = configWithRule({ mode: "audit_only", reason: "Recorded for traceability only." })

    expect(validateNotificationRulesConfig(config)).toBe(config)
  })

  it("rejects a notify rule with no targets", () => {
    const config = configWithRule({
      mode: "notify",
      targets: [],
      content: [{ templateKey: "planner.created", title: "Title", body: "Body" }],
    })

    expect(() => validateNotificationRulesConfig(config)).toThrow(
      "Notification rule for PLANNER_CREATED must declare at least one target"
    )
  })

  it("rejects a notify rule with no content", () => {
    const config = configWithRule({ mode: "notify", targets: ["ROLE:GA"], content: [] })

    expect(() => validateNotificationRulesConfig(config)).toThrow(
      "Notification rule for PLANNER_CREATED must declare at least one content variant"
    )
  })

  it("rejects a content variant for a Recipient Kind that the rule's targets can't produce", () => {
    const config = configWithRule({
      mode: "notify",
      targets: ["ROLE:GA"],
      content: [
        { when: { recipientKinds: ["GA"] }, templateKey: "planner.created.ga", title: "Title", body: "Body" },
        {
          when: { recipientKinds: ["SUPERVISOR"] },
          templateKey: "planner.created.supervisor",
          title: "Title",
          body: "Body",
        },
      ],
    })

    expect(() => validateNotificationRulesConfig(config)).toThrow(
      "Notification rule for PLANNER_CREATED references unsupported recipient kinds: SUPERVISOR"
    )
  })

  it("rejects a content variant for a Recipient Kind the targets can't produce, even when a fallback variant exists", () => {
    const config = configWithRule({
      mode: "notify",
      targets: ["CREATOR"],
      content: [
        { when: { recipientKinds: ["FINANCE"] }, templateKey: "planner.created.finance", title: "Title", body: "Body" },
        { templateKey: "planner.created.{{recipientKindLower}}", title: "Title", body: "Body" },
      ],
    })

    expect(() => validateNotificationRulesConfig(config)).toThrow(
      "Notification rule for PLANNER_CREATED references unsupported recipient kinds: FINANCE"
    )
  })

  it("rejects a rule with no fallback variant when a Recipient Kind its targets can produce has no variant", () => {
    const config = configWithRule({
      mode: "notify",
      targets: ["SUPERVISOR", "GM_APPROVERS"],
      content: [
        {
          when: { recipientKinds: ["SUPERVISOR"] },
          templateKey: "planner.created.supervisor",
          title: "Title",
          body: "Body",
        },
      ],
    })

    expect(() => validateNotificationRulesConfig(config)).toThrow(
      "Notification rule for PLANNER_CREATED does not cover recipient kind GM_APPROVER"
    )
  })

  it("accepts a rule with no fallback variant when every Recipient Kind its targets can produce has a variant", () => {
    const config = configWithRule({
      mode: "notify",
      targets: ["SUPERVISOR", "GM_APPROVERS"],
      content: [
        {
          when: { recipientKinds: ["SUPERVISOR"] },
          templateKey: "planner.created.supervisor",
          title: "Title",
          body: "Body",
        },
        { when: { recipientKinds: ["GM_APPROVER"] }, templateKey: "planner.created.gm", title: "Title", body: "Body" },
      ],
    })

    expect(validateNotificationRulesConfig(config)).toBe(config)
  })

  it("accepts a rule with a fallback variant, whichever Recipient Kinds its targets produce", () => {
    const config = configWithRule({
      mode: "notify",
      targets: ["CANCELLATION_AUDIENCE", "SUPERVISOR", "ROLE:PLANNER", "ROLE:FINANCE"],
      content: [
        {
          when: { recipientKinds: ["EMPLOYEE"] },
          templateKey: "planner.created.employee",
          title: "Title",
          body: "Body",
        },
        { templateKey: "planner.created.{{recipientKindLower}}", title: "Title", body: "Body" },
      ],
    })

    expect(validateNotificationRulesConfig(config)).toBe(config)
  })
})
