import { type RecipientKind } from "../types.js"
import { type NotificationRulesConfig, type RecipientTarget } from "./types.js"

const recipientKindsByTarget: Record<RecipientTarget, RecipientKind[]> = {
  "ROLE:GA": ["GA"],
  "ROLE:PLANNER": ["PLANNER"],
  "ROLE:FINANCE": ["FINANCE"],
  SUPERVISOR: ["SUPERVISOR"],
  CREATOR: ["EMPLOYEE"],
  PLANNER_MEMBERS: ["EMPLOYEE"],
  GM_APPROVERS: ["GM_APPROVER"],
  RESET_APPROVERS: ["GM_APPROVER"],
  AFFECTED_EMPLOYEE: ["EMPLOYEE"],
  CANCELLATION_AUDIENCE: ["EMPLOYEE", "GA", "GM_APPROVER"],
}

function getPossibleRecipientKinds(targets: RecipientTarget[]) {
  const kinds = new Set<RecipientKind>()

  for (const target of targets) {
    for (const kind of recipientKindsByTarget[target]) {
      kinds.add(kind)
    }
  }

  return [...kinds]
}

export function validateNotificationRulesConfig(config: NotificationRulesConfig) {
  for (const [eventType, definition] of Object.entries(config.events)) {
    if (definition.mode === "audit_only") {
      continue
    }

    if (definition.targets.length === 0) {
      throw new Error(`Notification rule for ${eventType} must declare at least one target`)
    }

    if (definition.content.length === 0) {
      throw new Error(`Notification rule for ${eventType} must declare at least one content variant`)
    }

    const possibleRecipientKinds = getPossibleRecipientKinds(definition.targets)
    const hasFallbackVariant = definition.content.some((variant) => !variant.when?.recipientKinds?.length)

    for (const variant of definition.content) {
      const recipientKinds = variant.when?.recipientKinds ?? []
      const invalidRecipientKinds = recipientKinds.filter((kind) => !possibleRecipientKinds.includes(kind))

      if (invalidRecipientKinds.length > 0) {
        throw new Error(
          `Notification rule for ${eventType} references unsupported recipient kinds: ${invalidRecipientKinds.join(", ")}`
        )
      }
    }

    if (hasFallbackVariant) {
      continue
    }

    for (const recipientKind of possibleRecipientKinds) {
      const covered = definition.content.some((variant) => variant.when?.recipientKinds?.includes(recipientKind))

      if (!covered) {
        throw new Error(`Notification rule for ${eventType} does not cover recipient kind ${recipientKind}`)
      }
    }
  }

  return config
}
