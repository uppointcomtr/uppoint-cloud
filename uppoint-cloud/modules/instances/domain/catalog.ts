export interface RegionCatalogItem {
  code: string;
  label: string;
}

export interface PlanCatalogItem {
  code: string;
  label: string;
  cpuCores: number;
  memoryMb: number;
  diskGb: number;
}

export interface ImageCatalogItem {
  code: string;
  label: string;
  family: "linux" | "windows";
}

export const REGION_CATALOG: RegionCatalogItem[] = [
  { code: "tr-ist-1", label: "Istanbul DC-1" },
  { code: "tr-ist-2", label: "Istanbul DC-2" },
];

export const PLAN_CATALOG: PlanCatalogItem[] = [
  { code: "vm-basic-1", label: "Basic 1 vCPU / 2 GB RAM", cpuCores: 1, memoryMb: 2048, diskGb: 40 },
  { code: "vm-standard-2", label: "Standard 2 vCPU / 4 GB RAM", cpuCores: 2, memoryMb: 4096, diskGb: 60 },
  { code: "vm-standard-4", label: "Standard 4 vCPU / 8 GB RAM", cpuCores: 4, memoryMb: 8192, diskGb: 120 },
];

export function findPlanByCode(code: string): PlanCatalogItem | null {
  return PLAN_CATALOG.find((item) => item.code === code) ?? null;
}

export function findRegionByCode(code: string): RegionCatalogItem | null {
  return REGION_CATALOG.find((item) => item.code === code) ?? null;
}
