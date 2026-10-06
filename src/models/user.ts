import { model, Schema, type InferSchemaType } from "mongoose"

const companyMemberSchema = new Schema(
  {
    companyTaxId: { type: String, required: true },
    companyName: { type: String, default: "" },
    employeeId: { type: String, required: true },
    positionName: { type: String, default: "" },
    positionLevel: { type: String, default: "" },
  },
  { _id: false }
)

const userSchema = new Schema(
  {
    accountId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    emailOneId: { type: String, default: "" },
    fullName: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    nickName: { type: String, default: "" },
    title: { type: String, default: "" },
    phone: { type: String, default: "" },
    companies: { type: [companyMemberSchema], default: [] },
    isSupervisor: { type: Boolean, default: false },
    gmCompany: { type: [String], default: [] },
    role: {
      type: String,
      enum: ["SUPERADMIN", "EMPLOYEE", "GA", "GM", "PLANNER", "FINANCE"],
      default: "EMPLOYEE",
    },
  },
  { timestamps: true }
)

const SupervisorSchema = new Schema({
  supervisorEmployeeId: { type: String, required: true },
  subordinateEmployeeIds: { type: [String] },
})

export type TSupervisor = InferSchemaType<typeof SupervisorSchema>
export const Supervisor = model("Supervisor", SupervisorSchema, "supervisor")
export type TUser = InferSchemaType<typeof userSchema>
export type TCompanyMember = InferSchemaType<typeof companyMemberSchema>
export const User = model<TUser>("User", userSchema, "user")
