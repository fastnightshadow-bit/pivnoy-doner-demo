import QRCode from 'qrcode';

export const encodeKioskQrSvg = async (value) => {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('KIOSK_QR_URL_INVALID');
  }
  if (url.protocol !== 'https:') {
    throw new Error('KIOSK_QR_URL_INVALID');
  }
  return QRCode.toString(url.toString(), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 420,
    color: { dark: '#111111ff', light: '#ffffffff' },
  });
};
