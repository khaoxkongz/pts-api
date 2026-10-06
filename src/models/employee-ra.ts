import { type InferSchemaType, model, Schema } from "mongoose"

const employeeRASchema = new Schema(
  {
    accountId: { type: String, default: "" },
    employeeId: { type: String, required: true },
    titleTh: { type: String, default: "" },
    fullNameTh: { type: String, default: "" },
    firstNameTh: { type: String, default: "" },
    lastNameTh: { type: String, default: "" },
    nickNameTh: { type: String, default: "" },
    email: { type: String, default: "" },
    emailOneId: { type: String, default: "" },
    phone: { type: String, default: "" },
    company: { type: String, default: "" },
    companyTaxId: { type: String, default: "" },
    position: { type: String, default: "" },
    positionLevel: { type: String, default: "" },
  },
  { timestamps: true }
)

const approverSchema = new Schema(
  {
    accountId: { type: String, default: "" },
    employeeId: { type: String, default: "" },
    titleTh: { type: String, default: "" },
    nameTh: { type: String, default: "" },
    position: { type: String, default: "" },
    positionLevel: { type: String, default: "" },
  },
  { _id: false }
)

const companyJVSchema = new Schema(
  {
    taxId: { type: String, required: true, unique: true },
    businessId: { type: String, default: "" },
    companyFullNameTh: { type: String, default: "" },
    companyFullNameEng: { type: String, default: "" },
    companyShortNameTh: { type: String, default: "" },
    companyShortNameEng: { type: String, default: "" },
    approversList: { type: [approverSchema], default: [] },
  },
  { timestamps: true }
)

export type TCompanyJV = InferSchemaType<typeof companyJVSchema>
export const CompanyJV = model<TCompanyJV>("CompanyJV", companyJVSchema, "data_company_jv")

export type TEmployeeRA = InferSchemaType<typeof employeeRASchema>
export const EmployeeRA = model<TEmployeeRA>("EmployeeRA", employeeRASchema, "data_employee_ra")
