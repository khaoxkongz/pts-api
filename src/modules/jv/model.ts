import { t } from "elysia"

export const RequestBodyApproveJV = t.Object({
  documentId: t.String({
    description: "ID แผนงานที่ต้องการอนุมัติ JV",
  }),
  jvs: t.Array(
    t.Object({
      taxId: t.String({
        description: "เลขประจำตัวผู้เสียภาษีของบริษัท JV ที่ต้องการอนุมัติ",
      }),
      percentageRatio: t.Number({
        description: "สัดส่วนเปอร์เซ็นต์ของ JV ที่อนุมัติ",
      }),
      expenseRatio: t.Number({
        description: "สัดส่วนค่าใช้จ่ายของ JV ที่อนุมัติ",
      }),
    })
  ),
})

export const RequestBodyRejectJV = t.Object({
  documentId: t.String({
    description: "ID แผนงานที่ต้องการปฏิเสธ JV",
  }),
  jvs: t.Array(
    t.Object({
      taxId: t.String({
        description: "เลขประจำตัวผู้เสียภาษีของบริษัท JV ที่ต้องการปฏิเสธ",
      }),
      reason: t.String({
        description: "เหตุผลที่ปฏิเสธ JV",
      }),
    })
  ),
})

export const profile = t.Object({
  userId: t.String(),
  role: t.String(),
})
