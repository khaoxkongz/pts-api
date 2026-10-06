import districts from "@/models/thai-address/districts.json" with { type: "json" }
import provinces from "@/models/thai-address/provinces.json" with { type: "json" }
import subdistricts from "@/models/thai-address/sub_districts.json" with { type: "json" }

function normalize(str: string) {
  return str.trim().toLowerCase()
}

interface AddressResult<T> {
  success: boolean
  result?: T
  message?: string
  status?: number
}

export function getAllProvinces(): AddressResult<{ name_th: string; name_en: string }[]> {
  return {
    success: true,
    result: provinces.map((p) => ({
      name_th: p.name_th,
      name_en: p.name_en,
    })),
  }
}

export function getDistricts(provinceName: string): AddressResult<{ name_th: string; name_en: string }[]> {
  const normPName = normalize(provinceName)
  const province = provinces.find((p) => normalize(p.name_th) === normPName)

  if (!province) {
    return {
      success: false,
      message: "ไม่พบจังหวัด",
      status: 404,
    }
  }

  const filteredDistricts = districts
    .filter((d) => d.province_id === province.id)
    .map((d) => ({ name_th: d.name_th, name_en: d.name_en }))

  return {
    success: true,
    result: filteredDistricts,
  }
}

export function getSubdistricts(
  provinceName: string,
  districtName: string
): AddressResult<{ name_th: string; name_en: string; zipcode: number }[]> {
  const normPName = normalize(provinceName)
  const normDName = normalize(districtName)

  const province = provinces.find((p) => normalize(p.name_th) === normPName)
  if (!province) {
    return {
      success: false,
      message: "ไม่พบจังหวัด",
      status: 404,
    }
  }

  const district = districts.find((d) => normalize(d.name_th) === normDName && d.province_id === province.id)
  if (!district) {
    return {
      success: false,
      message: "ไม่พบอำเภอ",
      status: 404,
    }
  }

  const filteredSubdistricts = subdistricts
    .filter((sd) => sd.district_id === district.id)
    .map((sd) => ({
      name_th: sd.name_th,
      name_en: sd.name_en,
      zipcode: sd.zip_code,
    }))

  return {
    success: true,
    result: filteredSubdistricts,
  }
}

export function getZipcode(
  provinceName: string,
  districtName: string,
  subdistrictName: string
): AddressResult<{ zipcode: number[] }> {
  const normPName = normalize(provinceName)
  const normDName = normalize(districtName)
  const normSName = normalize(subdistrictName)

  const province = provinces.find((p) => normalize(p.name_th) === normPName)
  if (!province) {
    return {
      success: false,
      message: "ไม่พบจังหวัด",
      status: 404,
    }
  }

  const district = districts.find((d) => normalize(d.name_th) === normDName && d.province_id === province.id)
  if (!district) {
    return {
      success: false,
      message: "ไม่พบอำเภอ",
      status: 404,
    }
  }

  const matchedSubdistricts = subdistricts.filter(
    (sd) => normalize(sd.name_th) === normSName && sd.district_id === district.id
  )

  if (matchedSubdistricts.length === 0) {
    return { success: false, message: "ไม่พบตำบล", status: 404 }
  }

  const zipcodes = [...new Set(matchedSubdistricts.map((sd) => sd.zip_code))]

  return {
    success: true,
    result: {
      zipcode: zipcodes,
    },
  }
}

export function getAddressData({
  provinceName,
  districtName,
  subdistrictName,
}: {
  provinceName?: string
  districtName?: string
  subdistrictName?: string
}) {
  if (!provinceName) {
    return getAllProvinces()
  }

  if (!districtName) {
    return getDistricts(provinceName)
  }

  if (!subdistrictName) {
    return getSubdistricts(provinceName, districtName)
  }

  return getZipcode(provinceName, districtName, subdistrictName)
}
