import { model, Schema, type InferSchemaType } from "mongoose"

const digitalWorkflowDataSchema = new Schema(
  {
    account_id: { type: String, default: "" },
    email_user: { type: String, default: "" },
    transaction_id: { type: String, default: "" },
    document_id: { type: String, default: "" },
    flow_account: { type: Array, default: [] },
    flow_id: { type: String, default: "" },
    pdf_base: { type: String, default: "" },
    json_data: { type: Array, default: [] },
    external_data: { type: Object, default: {} },
    action_type: { type: String, default: "" },
    approver: { type: Object, default: {} },
    others_data: { type: Object, default: {} },
    attach_file: { type: Array, default: [] },
    document_status: { type: String, default: "" },
    document_type_id: { type: String, default: "" },
    document_type_name: { type: String, default: "" },
    business: { type: Object, default: {} },
    biz_detail: { type: Object, default: {} },
    sign_position: { type: Object, default: {} },
    step_index: { type: String, default: "" },
    createdAt: { type: String, default: "" },
  },
  { strict: false }
)

export type TDigitalWorkflowData = InferSchemaType<typeof digitalWorkflowDataSchema>
export const DigitalWorkflowData = model<TDigitalWorkflowData>(
  "DigitalWorkflowData",
  digitalWorkflowDataSchema,
  "digital_workflow_data"
)
