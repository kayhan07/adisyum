import { redirect } from 'next/navigation';

export default function SettingsPrintersPage() {
  redirect('/settings?tab=integrations');
}
