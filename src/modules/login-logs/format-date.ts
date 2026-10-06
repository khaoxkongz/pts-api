import { DateTime } from "luxon"

export const LOGIN_LOGS_TIME_ZONE = "Asia/Bangkok"

const BUDDHIST_YEAR_OFFSET = 543

function toBangkok(value: Date | string): DateTime {
  const dt = typeof value === "string" ? DateTime.fromISO(value, { zone: "utc" }) : DateTime.fromJSDate(value)

  return dt.setZone(LOGIN_LOGS_TIME_ZONE)
}

/**
 * แปลงเวลาเป็นรูปแบบ dd/mm/yyyy hh:mm:ss ตามเวลาไทย (24 ชั่วโมง, ปี ค.ศ.)
 * ตัวอย่าง: 2026-09-22T07:05:09.000Z -> 22/09/2026 14:05:09
 */
export function formatBangkokDateTime(value: Date | string): string {
  const dt = toBangkok(value)

  return dt.isValid ? dt.toFormat("dd/MM/yyyy HH:mm:ss") : ""
}

/**
 * แปลงเวลาเป็นรูปแบบ dd/mm/yyyy hh:mm:ss ตามเวลาไทย (24 ชั่วโมง, ปี พ.ศ.)
 * ต้องอ่าน year หลัง setZone แล้วบวก 543 เอง มิฉะนั้นจะได้ปีผิดตอนข้ามปีจาก timezone
 */
export function formatBangkokDateTimeTh(value: Date | string): string {
  const dt = toBangkok(value)

  if (!dt.isValid) {
    return ""
  }

  return `${dt.toFormat("dd/MM")}/${dt.year + BUDDHIST_YEAR_OFFSET} ${dt.toFormat("HH:mm:ss")}`
}
