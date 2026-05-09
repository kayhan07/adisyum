import { Suspense } from 'react';
import SettingsPage from './settings-client';

export default function SettingsRoutePage() {
  return (
    <Suspense fallback={null}>
      <SettingsPage />
    </Suspense>
  );
}
