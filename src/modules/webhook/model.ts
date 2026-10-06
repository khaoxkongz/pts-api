import { t } from "elysia"

// export const webhookBody = t.Object({
//   account_id: t.Optional(t.String()),
//   email_user: t.Optional(t.String()),
//   transaction_id: t.Optional(t.String()),
//   document_id: t.Optional(t.String()),
//   flow_account: t.Optional(t.Array(t.Any())),
//   flow_id: t.Optional(t.String()),
//   pdf_base: t.Optional(t.String()),
//   json_data: t.Optional(t.Any()),
//   external_data: t.Optional(t.Record(t.String(), t.Any())),
//   action_type: t.Optional(t.String()),
//   approver: t.Optional(t.Record(t.String(), t.Any())),
//   others_data: t.Optional(t.Record(t.String(), t.Any())),
//   attach_file: t.Optional(t.Array(t.Any())),
//   document_status: t.Optional(t.String()),
//   document_type_id: t.Optional(t.String()),
//   document_type_name: t.Optional(t.String()),
//   business: t.Optional(t.Record(t.String(), t.Any())),
//   biz_detail: t.Optional(t.Record(t.String(), t.Any())),
//   sign_position: t.Optional(t.Record(t.String(), t.Any())),
//   step_index: t.Optional(t.String()),
//   createdAt: t.Optional(t.String()),
// })

export const webhookBody = t.Any()

export const webhookQuery = t.Object({
  plannerDocNo: t.String(),
})

export type WebhookBody = typeof webhookBody.static
