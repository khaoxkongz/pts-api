import { model, Schema, type InferSchemaType } from "mongoose"

const schema = new Schema(
  {
    employeeId: { type: String, default: "" },
    email: { type: String, default: "" },
    emailOneId: { type: String, default: "" },
    titleTh: { type: String, default: "" },
    fullNameTh: { type: String, default: "" },
    firstNameTh: { type: String, default: "" },
    lastNameTh: { type: String, default: "" },
    nickNameTh: { type: String, default: "" },
    accountId: { type: String, default: "" },
    phone: { type: String, default: "" },
    company: { type: String, default: "" },
  },
  { timestamps: true }
)

export type TUserRA = InferSchemaType<typeof schema>
export const UserRA = model<TUserRA>("UserRA", schema, "data_employee_ra")
