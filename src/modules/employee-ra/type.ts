export interface EmployeeRASearchParams {
  search?: string
}

export interface EmployeeRADropdown {
  employee_id: string
  full_name_th: string
  nick_name_th: string
  email: string
  phone: string
  company: string
  accountId: string
  position: string
}

export interface ApproverDropdown {
  employee_id: string
  name_th: string
  position: string
  position_level: string
  accountId: string
}

export interface CompanyDropdown {
  tax_id: string
  company_full_name_th: string
  company_short_name_th: string
  company_full_name_eng: string
  company_short_name_eng: string
  approversList: ApproverDropdown[]
}

export interface SyncOptions {
  dryRun?: boolean
  normalize?: (value: string) => string
}
