export interface LocationData {
  name: string
  addressNo: string
  village: string
  soi: string
  street: string
  province: string
  district: string
  subdistrict: string
  zipcode: string
}

export function generateNormalizedName(location: LocationData): string {
  return [
    location.name,
    location.addressNo,
    location.village,
    location.soi,
    location.street,
    location.district,
    location.province,
    location.subdistrict,
    location.zipcode,
  ]
    .filter(Boolean)
    .join("")
}
