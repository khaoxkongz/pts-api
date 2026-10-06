import { type Column } from "exceljs"

export const STANDARD_ORDER = [
  "documentId",
  "name",
  "objectives",
  "expectedOutcomes",
  "projectName",
  "dateRange",
  "participantCount",
  "employeeInfo",
  "location",
  "allowancePerPlan",
  "allowancePerMonth",
  "allowanceAccum",
  "allowanceRemaining",
  "jvResponsibility",
  "jvRatio",
  "estimatedCost",
  "actualCost",
  "actualCostFiles",
  "outcomeDetail",
  "outcomeIssues",
  "outcomeNotes",
  "outcomeFiles",
  "worthinessStatus",
  "worthinessNotes",
  "worthinessFiles",
] as const

export type ExportColumnKey = (typeof STANDARD_ORDER)[number]

export interface ColumnConfig {
  key: string
  header: string
  width: number
  mergePerPlan?: boolean
}

export const COLUMN_DEFINITIONS: Record<string, ColumnConfig> = {
  // --- General Info ---
  documentId: { key: "documentId", header: "เลขที่เอกสาร", width: 15, mergePerPlan: true },
  name: { key: "name", header: "ชื่อแผนงาน", width: 25, mergePerPlan: true },
  dateRange: { key: "dateRange", header: "วันที่ไป-กลับ", width: 22, mergePerPlan: true },
  objectives: { key: "objectives", header: "วัตถุประสงค์", width: 30, mergePerPlan: true },
  expectedOutcomes: { key: "expectedOutcomes", header: "ผลลัพธ์ที่คาดหวัง", width: 30, mergePerPlan: true },
  projectName: { key: "projectName", header: "โปรเจ็กต์", width: 20, mergePerPlan: true },
  participantCount: { key: "participantCount", header: "จำนวนพนักงาน", width: 15, mergePerPlan: true },

  // --- Employee Info (Mapped to single "employeeInfo" key from frontend usually, but can be split) ---
  employeeId: { key: "employeeId", header: "รหัสพนักงาน", width: 15 },
  fullNameTh: { key: "fullNameTh", header: "ชื่อ-สกุลพนักงาน", width: 25 },

  // --- Location (Dynamic handling needed, key placeholder) ---
  location: { key: "location", header: "ที่อยู่สถานที่ Onsite", width: 40 },

  // --- Allowance Group ---
  allowancePerPlan: { key: "allowanceClaimed", header: "ค่าเบี้ยเลี้ยงที่เบิกได้ทั้งหมด / แผนงาน", width: 30 },
  allowancePerMonth: { key: "allowanceMonthly", header: "ค่าเบี้ยเลี้ยงที่เบิกได้ทั้งหมด / เดือน", width: 30 },
  allowanceAccum: { key: "allowanceAccum", header: "ค่าเบี้ยเลี้ยงเบิกสะสม / เดือน", width: 30 },
  allowanceRemaining: { key: "allowanceRemaining", header: "ค่าเบี้ยเลี้ยงคงเหลือ / เดือน", width: 30 },

  // --- JV Info ---
  jvResponsibility: { key: "jvNames", header: "JV ที่รับผิดชอบค่าใช้จ่าย", width: 30, mergePerPlan: true },

  // --- Budget ---
  estimatedCost: { key: "estimatedTotal", header: "ค่าใช้จ่ายประมาณการ", width: 20, mergePerPlan: true },

  // --- Actual Cost Group ---
  actualCost: { key: "actualTotal", header: "ค่าใช้จ่ายจริง", width: 20, mergePerPlan: true },
  actualCostFiles: { key: "actualBudgetFiles", header: "ไฟล์แนบค่าใช้จ่ายจริง", width: 30, mergePerPlan: true },

  // --- Outcome Group ---
  outcomeDetail: { key: "keyAchievement", header: "รายละเอียดผลลัพธ์", width: 40, mergePerPlan: true },
  outcomeIssues: { key: "issueAndChallenges", header: "ปัญหา/อุปสรรค", width: 40, mergePerPlan: true },
  outcomeNotes: { key: "additionalNotes", header: "หมายเหตุ (ผลลัพธ์)", width: 30, mergePerPlan: true },
  outcomeFiles: { key: "supportingDocs", header: "ไฟล์แนบผลลัพธ์", width: 30, mergePerPlan: true },

  // --- Worthiness Group ---
  worthinessStatus: { key: "worthinessStatus", header: "สถานะความคุ้มค่า", width: 25, mergePerPlan: true },
  worthinessNotes: { key: "worthinessNotes", header: "หมายเหตุ (ความคุ้มค่า)", width: 30, mergePerPlan: true },
  worthinessFiles: { key: "worthinessFiles", header: "ไฟล์แนบความคุ้มค่า", width: 30, mergePerPlan: true },
}

export function buildSelectedColumns(
  projection: Record<string, boolean | undefined> | null | undefined,
  maxLocations: number
): ColumnConfig[] {
  const columns: ColumnConfig[] = []

  // If projection is not provided or is empty, use all columns as default
  const isDefault = !projection || Object.keys(projection).length === 0

  for (const key of STANDARD_ORDER) {
    // Include if it's default OR explicitly set to true
    if (isDefault || projection?.[key] === true) {
      if (key === "employeeInfo") {
        const employeeIdDef = COLUMN_DEFINITIONS.employeeId
        const fullNameThDef = COLUMN_DEFINITIONS.fullNameTh
        if (employeeIdDef) {
          columns.push(employeeIdDef)
        }
        if (fullNameThDef) {
          columns.push(fullNameThDef)
        }
      } else if (key === "location") {
        for (let i = 1; i <= maxLocations; i += 1) {
          columns.push({
            key: `locationAddress_${i}`,
            header: `ที่อยู่สถานที่ Onsite (สถานที่ ${i})`,
            width: 40,
          })
          columns.push({
            key: `locationDateRange_${i}`,
            header: `วันที่ไป-กลับ สถานที่ Onsite (สถานที่ ${i})`,
            width: 25,
          })
        }
      } else {
        const def = COLUMN_DEFINITIONS[key]
        if (def) {
          columns.push(def)
        }
      }
    }
  }

  return columns
}

export function buildExcelColumns(configs: ColumnConfig[]): Partial<Column>[] {
  return configs.map((col) => ({
    key: col.key,
    header: col.header,
    width: col.width,
  }))
}
