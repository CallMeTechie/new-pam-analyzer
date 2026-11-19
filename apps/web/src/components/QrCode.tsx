import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** QR code as SVG, e.g. a new API key for the Android app to scan. */
export function QrCode({ value, label, size = 200 }: { value: string; label: string; size?: number }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { count: n + 4, path: d };
  }, [value]);
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${count} ${count}`} role="img" aria-label={label}>
      <rect width={count} height={count} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
