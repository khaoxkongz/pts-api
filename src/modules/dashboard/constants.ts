import { STATUS } from "@/utils/status/status.js"

import { type TWorthinessCategory } from "./type.js"

export const DASHBOARD_STATUSES = [STATUS.WAITING_PLANNER_COST_ANALYSIS, STATUS.COMPLETED] as const

export const DASHBOARD_CATEGORY_ORDER = ["WORTHY", "MODERATE", "NOT_WORTHY", "UNANALYZED", "OTHER"] as const

export const DASHBOARD_CATEGORY_LABELS: Record<TWorthinessCategory, string> = {
  WORTHY: "แผนงานคุ้มค่า",
  MODERATE: "แผนงานคุ้มค่าระดับหนึ่ง (พอใช้)",
  NOT_WORTHY: "แผนงานไม่คุ้มค่า",
  UNANALYZED: "แผนงานที่ยังไม่วิเคราะห์ความคุ้มค่า",
  OTHER: "อื่นๆ",
}

export const WORTHY_VALUES = new Set(["แผนงานคุ้มค่า", "คุ้มค่า", "worthy"])
export const MODERATE_VALUES = new Set(["คุ้มค่าในระดับหนึ่ง (พอใช้)", "พอใช้", "moderate"])
export const NOT_WORTHY_VALUES = new Set(["แผนงานไม่คุ้มค่า", "ไม่คุ้มค่า", "not worthy"])
