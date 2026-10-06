import { DateTime } from "luxon"

import * as AllowancePolicyModel from "./model.js"
import { type IAllowancePolicyPatchInput } from "./type.js"

const TIME_ZONE = "Asia/Bangkok"

export function parseDateOrNull(value: string): Date | null {
  const date = DateTime.fromISO(value, { zone: TIME_ZONE })
  if (!date.isValid) {
    return null
  }
  return date.toJSDate()
}

export function buildPatchPayload(
  body: typeof AllowancePolicyModel.patchAllowancePolicyInput.static
): { success: true; payload: IAllowancePolicyPatchInput } | { success: false; message: string } {
  const payload: IAllowancePolicyPatchInput = {
    positionKey: body.positionKey,
    aliases: body.aliases,
    groupNameTh: body.groupNameTh,
    dailyRate: body.dailyRate,
    monthlyLimit: body.monthlyLimit,
    isActive: body.isActive,
  }

  if (body.effectiveFrom !== undefined) {
    const effectiveFrom = parseDateOrNull(body.effectiveFrom)
    if (!effectiveFrom) {
      return { success: false, message: "effectiveFrom ไม่ถูกต้อง" }
    }
    payload.effectiveFrom = effectiveFrom
  }

  if (body.effectiveTo !== undefined) {
    if (body.effectiveTo === null) {
      payload.effectiveTo = null
    } else {
      const effectiveTo = parseDateOrNull(body.effectiveTo)
      if (!effectiveTo) {
        return { success: false, message: "effectiveTo ไม่ถูกต้อง" }
      }
      payload.effectiveTo = effectiveTo
    }
  }

  return { success: true, payload }
}
