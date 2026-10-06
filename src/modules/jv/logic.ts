import { CompanyJV } from "@/models/employee-ra.js"
import { type TPlanner } from "@/models/planner.js"
import { STATUS, type PlannerStatus } from "@/utils/status/status.js"

import { type IJVItem } from "../planner/type.js"

export interface ValidationResult {
  ok: boolean
  error?: string
  errorCode?: number
  jv?: IJVItem
}

export async function validateJvAction(
  planner: TPlanner | null,
  taxId: string,
  userId: string,
  action: "APPROVE" | "REJECT"
) {
  if (!planner) {
    return {
      ok: false,
      error: "ไม่พบแผนงานที่ระบุ",
      errorCode: 404,
    }
  }

  const statuses = planner.status.map((s) => s)
  if (!statuses.includes(STATUS.WAITING_JV_APPROVAL)) {
    return {
      ok: false,
      error: "สถานะปัจจุบันไม่อยู่ในขั้นตอนการอนุมัติ JV",
      errorCode: 400,
    }
  }

  const jv = planner.jvs.find((item) => item.taxId === taxId)
  if (!jv) {
    return {
      ok: false,
      error: "ไม่พบ JV ที่ระบุในแผนงานนี้",
      errorCode: 404,
    }
  }

  const isApprover = await CompanyJV.exists({
    taxId,
    "approversList.accountId": userId,
  })

  if (action === "APPROVE") {
    if (jv.status === STATUS.JV_APPROVED) {
      return {
        ok: false,
        error: "JV นี้ได้รับการอนุมัติแล้ว",
        errorCode: 400,
      }
    }
    if (!isApprover) {
      return {
        ok: false,
        error: "คุณไม่มีสิทธิ์อนุมัติ JV นี้",
        errorCode: 403,
      }
    }
  } else if (action === "REJECT" && !isApprover) {
    return {
      ok: false,
      error: "คุณไม่มีสิทธิ์ปฏิเสธ JV นี้",
      errorCode: 403,
    }
  }

  return { ok: true, jv }
}

export async function isApproverOfAnyJv(taxIds: string[], userId: string): Promise<boolean> {
  const approves = await CompanyJV.exists({
    taxId: { $in: taxIds },
    "approversList.accountId": userId,
  })

  return approves !== null
}

export function shouldResetOtherJvs(
  oldJv: TPlanner["jvs"][number],
  ratio: { percentage: number; expense: number }
): boolean {
  return oldJv.percentageRatio !== ratio.percentage
}

export function getPlannerStatuses(planner: TPlanner): PlannerStatus[] {
  return planner.status.map((s) => String(s) as PlannerStatus)
}
