/** Module type and serial number of a machine number such as `M6IIIXNo2149` or `NXTR-1R-Xno0000184`. */
export interface MachineId {
  module: string;
  serial: string | null;
}

/**
 * Splits a machine number at `XNo` (any letter case), which stands for "serial number":
 * `M6IIIXNo2149` → module `M6III`, serial `2149`; `NXTR-1R-Xno0000184` → `NXTR-1R`, `0000184`.
 * A number without `XNo` is returned unchanged as the module.
 */
export function splitMachineNo(machineNo: string): MachineId {
  const m = /^(.+?)[-_ ]?xno[-_ :]?([0-9A-Za-z]+)$/i.exec(machineNo.trim());
  if (!m?.[1] || !m[2]) return { module: machineNo, serial: null };
  return { module: m[1], serial: m[2] };
}

/** Display form, e.g. `M6III · S/N 2149`. */
export function machineLabel(machineNo: string, sn = 'S/N'): string {
  const { module, serial } = splitMachineNo(machineNo);
  return serial ? `${module} · ${sn} ${serial}` : module;
}
