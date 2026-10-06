import { validateNotificationRulesConfig } from "./config-utils.js"
import { type NotificationRulesConfig } from "./types.js"

const config = {
  events: {
    PLANNER_CREATED: {
      mode: "notify",
      guards: [],
      targets: ["ROLE:GA"],
      content: [
        {
          templateKey: "planner.created.ga",
          title: "มีแผนงานใหม่ !",
          body: "มีการสร้างแผนงานใหม่ {{sourceName}} กรุณากรอกค่าใช้จ่ายประมาณการ",
        },
      ],
    },
    GA_ESTIMATE_CONFIRMED: {
      mode: "notify",
      guards: [
        {
          fromStatusesAllOf: ["WAITING_GA_ESTIMATE"],
          toStatusesAllOf: ["WAITING_JV_APPROVAL"],
        },
      ],
      targets: ["SUPERVISOR", "GM_APPROVERS"],
      content: [
        {
          when: {
            recipientKinds: ["SUPERVISOR"],
          },
          templateKey: "ga.estimate.confirmed.supervisor",
          title: "มีแผนงานใหม่ !",
          body: "มีการสร้างแผนงานใหม่ {{sourceName}}",
        },
        {
          when: {
            recipientKinds: ["GM_APPROVER"],
          },
          templateKey: "ga.estimate.confirmed.gm",
          title: "มีแผนงานใหม่รอการอนุมัติ !",
          body: "มีแผนงานใหม่ {{sourceName}} กรุณาตรวจสอบและดำเนินการอนุมัติแผนงาน",
        },
      ],
    },
    GM_JV_REJECTED: {
      mode: "notify",
      guards: [
        {
          fromStatusesAllOf: ["WAITING_JV_APPROVAL"],
          toStatusesAllOf: ["JV_REJECTED"],
        },
      ],
      targets: ["CREATOR", "SUPERVISOR", "GM_APPROVERS", "PLANNER_MEMBERS"],
      content: [
        {
          templateKey: "gm.jv.rejected.{{recipientKindLower}}",
          title: "แผนงานถูกปฏิเสธ",
          body: "แผนงาน {{sourceName}} ไม่ได้รับการอนุมัติ",
        },
      ],
    },
    GM_JV_APPROVED: {
      mode: "audit_only",
      reason:
        "Approval is captured in the audit trail, while user-facing fan-out is deferred to later workflow events.",
    },
    GM_JV_REAPPROVAL_REQUIRED: {
      mode: "notify",
      targets: ["RESET_APPROVERS"],
      content: [
        {
          templateKey: "gm.jv.reapproval_required.gm",
          title: "ปรับสัดส่วนค่าใช้จ่ายแผนงาน",
          body: "มีการปรับสัดส่วนค่าใช้จ่ายแผนงาน {{sourceName}} โปรดตรวจสอบรายละเอียดและดำเนินการพิจารณาอนุมัติอีกครั้ง",
        },
      ],
    },
    PLANNER_FULLY_APPROVED: {
      mode: "notify",
      guards: [
        {
          fromStatusesAllOf: ["WAITING_JV_APPROVAL"],
          toStatusesAllOf: ["WAITING_EMP_SUMMARY", "WAITING_GA_ACTUAL_COST"],
        },
      ],
      targets: ["CREATOR", "PLANNER_MEMBERS", "ROLE:GA", "SUPERVISOR", "ROLE:PLANNER", "ROLE:FINANCE"],
      content: [
        {
          when: {
            recipientKinds: ["EMPLOYEE"],
          },
          templateKey: "planner.fully_approved.employee",
          title: "มีแผนงานรอกรอกผลลัพธ์ ค่าใช้จ่ายจริงเพิ่มเติม และเบิกเบี้ยเลี้ยง",
          body: "แผนงาน {{sourceName}} ดำเนินการเสร็จสิ้นแล้ว กรุณากรอกผลลัพธ์ ค่าใช้จ่ายจริงเพิ่มเติม และเบิกเบี้ยเลี้ยง",
        },
        {
          when: {
            recipientKinds: ["GA"],
          },
          templateKey: "planner.fully_approved.ga",
          title: "มีแผนงานรอกรอกค่าใช้จ่ายจริงเพิ่มเติม",
          body: "แผนงาน {{sourceName}} ดำเนินการเสร็จสิ้นแล้ว กรุณากรอกค่าใช้จ่ายจริงเพิ่มเติม",
        },
        {
          templateKey: "planner.fully_approved.{{recipientKindLower}}",
          title: "อนุมัติแผนงานแล้ว",
          body: "แผนงาน {{sourceName}} ได้รับการอนุมัติแล้ว",
        },
      ],
    },
    EMPLOYEE_SUMMARY_SUBMITTED: {
      mode: "audit_only",
      reason: "Employee summary submission is recorded for traceability but does not directly notify recipients.",
    },
    GA_ACTUAL_CONFIRMED: {
      mode: "audit_only",
      reason:
        "GA actual confirmation is recorded for traceability while notification fan-out is deferred to follow-up events.",
    },
    ALLOWANCE_CLAIM_CANCELLED: {
      mode: "notify",
      targets: ["AFFECTED_EMPLOYEE"],
      content: [
        {
          templateKey: "allowance.claim.cancelled.employee",
          title: "คำขอเบิกค่าเบี้ยเลี้ยงถูกยกเลิก",
          body: "แผนงาน {{sourceName}} ที่ท่านได้ทำรายการเบิกค่าเบี้ยเลี้ยงถูกยกเลิก กรุณายื่นคำขอใหม่อีกครั้งหรือกดยืนยันยกเลิกการเบิกภายใน 5 วัน มิฉะนั้นระบบจะยืนยันยกเลิกการเบิกให้อัตโนมัติ",
        },
      ],
    },
    ALLOWANCE_CLAIM_REJECTED: {
      mode: "notify",
      targets: ["AFFECTED_EMPLOYEE"],
      content: [
        {
          templateKey: "allowance.claim.rejected.employee",
          title: "คำขอเบิกค่าเบี้ยเลี้ยงถูกปฏิเสธ",
          body: "แผนงาน {{sourceName}} ที่ท่านได้ทำรายการเบิกค่าเบี้ยเลี้ยงถูกปฏิเสธ กรุณายื่นคำขอใหม่อีกครั้งหรือกดยืนยันการปฏิเสธภายใน 5 วัน มิฉะนั้นระบบจะยืนยันการปฏิเสธให้อัตโนมัติ",
        },
      ],
    },
    PLANNER_READY_FOR_ANALYSIS: {
      mode: "notify",
      guards: [
        {
          fromStatusesNoneOf: ["WAITING_PLANNER_COST_ANALYSIS"],
          toStatusesAllOf: ["WAITING_PLANNER_COST_ANALYSIS"],
        },
      ],
      targets: ["ROLE:PLANNER", "ROLE:FINANCE", "SUPERVISOR", "GM_APPROVERS", "ROLE:GA"],
      content: [
        {
          when: {
            recipientKinds: ["PLANNER"],
            metadata: { triggerAction: "ALLOWANCE_RESOLVED" },
          },
          templateKey: "planner.ready_for_analysis.allowance_resolved.planner",
          title: "มีแผนงานรอการวิเคราะห์ความคุ้มค่า !",
          body: "แผนงาน {{sourceName}} มีการบันทึกผลลัพธ์ ค่าใช้จ่ายจริง และเสร็จสิ้นกระบวนการเบิกเบี้ยเลี้ยงแล้ว กรุณาดำเนินการวิเคราะห์ความคุ้มค่า",
        },
        {
          when: {
            metadata: { triggerAction: "ALLOWANCE_RESOLVED" },
          },
          templateKey: "planner.ready_for_analysis.allowance_resolved.{{recipientKindLower}}",
          title: "แผนงานเสร็จสิ้นแล้ว",
          body: "แผนงาน {{sourceName}} ดำเนินการเสร็จสิ้นแล้ว",
        },
        {
          when: {
            recipientKinds: ["PLANNER"],
          },
          templateKey: "planner.ready_for_analysis.planner",
          title: "มีแผนงานรอการวิเคราะห์ความคุ้มค่า !",
          body: "แผนงาน {{sourceName}} เสร็จสิ้นแล้ว โดยพนักงานและ GA กรอกค่าใช้จ่ายจริงและบันทึกผลลัพธ์ครบถ้วนแล้ว กรุณาดำเนินการวิเคราะห์ความคุ้มค่า",
        },
        {
          templateKey: "planner.ready_for_analysis.{{recipientKindLower}}",
          title: "แผนงานเสร็จสิ้นแล้ว",
          body: "แผนงาน {{sourceName}} ดำเนินการเสร็จสิ้นแล้ว",
        },
      ],
    },
    PLANNER_ANALYSIS_COMPLETED: {
      mode: "notify",
      guards: [
        {
          fromStatusesAllOf: ["WAITING_PLANNER_COST_ANALYSIS"],
          toStatusesAllOf: ["COMPLETED"],
        },
      ],
      targets: ["GM_APPROVERS"],
      content: [
        {
          templateKey: "planner.analysis_completed.gm",
          title: "แผนงานวิเคราะห์ความคุ้มค่าแล้ว",
          body: "แผนงาน {{sourceName}} ดำเนินการวิเคราะห์ความคุ้มค่าเรียบร้อยแล้ว",
        },
      ],
    },
    PLANNER_CANCELLED: {
      mode: "notify",
      guards: [{ toStatusesAllOf: ["CANCELLED"] }],
      targets: ["CANCELLATION_AUDIENCE"],
      content: [
        {
          when: { recipientKinds: ["EMPLOYEE"] },
          templateKey: "planner.cancelled.employee",
          title: "แผนงานถูกยกเลิก",
          body: "แผนงาน {{sourceName}} ที่ท่านเป็นสมาชิกอยู่ถูกยกเลิกแล้ว",
        },
        {
          templateKey: "planner.cancelled.{{recipientKindLower}}",
          title: "แผนงานถูกยกเลิก",
          body: "แผนงาน {{sourceName}} ถูกยกเลิกแล้ว",
        },
      ],
    },
  },
} satisfies NotificationRulesConfig

export const notificationRulesConfig = validateNotificationRulesConfig(config)
