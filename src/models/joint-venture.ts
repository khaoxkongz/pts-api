import { model, Schema, type InferSchemaType } from "mongoose"

const organizeChartSchema = new Schema(
  {
    lineOfWork: { type: [], default: [] },
    department: { type: [], default: [] },
    section: { type: [], default: [] },
    groupOfWork: { type: [], default: [] },
    agency: { type: [], default: [] },
  },
  { _id: false }
)

const approverSchema = new Schema(
  {
    userId: { type: String, default: "" },
    employeeId: { type: String, default: "" },
    companyId: { type: String, default: "" },
    position: { type: String, default: "" },
    positionLevel: { type: String, default: "" },
    companyFullNameEng: { type: String, default: "" },
    companyFullNameTh: { type: String, default: "" },
    taxId: { type: String, default: "" },
    orgchart: {
      type: organizeChartSchema,
      default: {
        lineOfWork: [],
        department: [],
        section: [],
        groupOfWork: [],
        agency: [],
      },
    },
    nameTh: { type: String, default: "" },
    nameEn: { type: String, default: "" },
    accountId: { type: String, default: "" },
  },
  { _id: false }
)

const jointVentureSchema = new Schema(
  {
    taxId: { type: String, default: "" },
    companyFullNameTh: { type: String, default: "" },
    companyFullNameEng: { type: String, default: "" },
    companyShortNameTh: { type: String, default: "" },
    companyShortNameEng: { type: String, default: "" },
    approversList: { type: [approverSchema], default: [] },
  },
  { timestamps: true }
)

export type TJointVenture = InferSchemaType<typeof jointVentureSchema>
export const JointVenture = model<TJointVenture>("CompanyJv", jointVentureSchema, "data_company_jv")
