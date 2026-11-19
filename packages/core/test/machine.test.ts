import { describe, expect, it } from 'vitest';
import { machineLabel, splitMachineNo } from '../src/index.js';

describe('splitMachineNo', () => {
  it('splits at XNo in any letter case', () => {
    expect(splitMachineNo('M6IIIXNo2149')).toEqual({ module: 'M6III', serial: '2149' });
    expect(splitMachineNo('NXTR-1R-Xno0000184')).toEqual({ module: 'NXTR-1R', serial: '0000184' });
    expect(splitMachineNo('M3IIxno12')).toEqual({ module: 'M3II', serial: '12' });
  });
  it('keeps numbers without XNo unchanged', () => {
    expect(splitMachineNo('AIMEX-IIIc')).toEqual({ module: 'AIMEX-IIIc', serial: null });
    expect(splitMachineNo('XNo123')).toEqual({ module: 'XNo123', serial: null });
    expect(splitMachineNo('')).toEqual({ module: '', serial: null });
  });
  it('builds the display label', () => {
    expect(machineLabel('M6IIIXNo2149')).toBe('M6III · S/N 2149');
    expect(machineLabel('NXTR-1R-Xno0000184', 'SN')).toBe('NXTR-1R · SN 0000184');
    expect(machineLabel('M6III')).toBe('M6III');
  });
});
