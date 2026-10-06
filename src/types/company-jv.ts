export interface CompanyJVResponse {
  success: boolean
  count: number
  result: CompanyJVModel[]
}

export interface CompanyJVModel {
  _id: string
  taxId: string
  companyFullNameTh: string
  companyFullNameEng: string
  companyShortNameTh: string
  companyShortNameEng: string
  countAllEmployees: number
  countActiveEmployees: number
  countResignEmployees: number
}

export interface ApproverModel {
  accountId: string
  employeeId: string
  titleTh: string
  nameTh: string
  position: string
  positionLevel: string
}

export interface CompanyJsonRequest {
  company: string
  name: string
}
