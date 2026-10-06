import { describe, expect, it } from "vite-plus/test"

import { Planner } from "../../models/planner.js"

function plannerWithCancellation(previousStatuses?: string[]) {
  const cancellation = {
    reason: "ยกเลิกเพื่อทดสอบ",
    cancelledBy: "account-1",
    cancelledAt: new Date("2026-08-18T00:00:00.000Z"),
    ...(previousStatuses ? { previousStatuses } : {}),
  }

  return new Planner({ status: ["CANCELLED"], cancellation })
}

describe("planner cancellation", () => {
  it("stores the statuses captured before cancellation", () => {
    const planner = plannerWithCancellation(["WAITING_GA_ESTIMATE", "WAITING_JV_APPROVAL"])

    expect(planner.cancellation?.previousStatuses).toEqual(["WAITING_GA_ESTIMATE", "WAITING_JV_APPROVAL"])
  })

  it("defaults previous statuses to an empty array", () => {
    const planner = plannerWithCancellation()

    expect(planner.cancellation?.previousStatuses).toEqual([])
  })
})
