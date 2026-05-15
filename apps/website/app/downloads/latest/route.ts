import { NextResponse } from 'next/server';

export const runtime = 'edge';

const latestInstallerUrl =
  process.env.NEXT_PUBLIC_ADISYUM_WINDOWS_INSTALLER_URL ||
  'https://downloads.adisyum.com/windows/AdisyumSetup.exe';

export function GET() {
  const response = NextResponse.redirect(latestInstallerUrl, 302);
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('X-Adisyum-Download-Channel', 'stable');
  return response;
}
