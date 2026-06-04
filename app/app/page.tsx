import { ModuleCenter } from '@/components/module-center';
import { ModuleCenterBoundary } from '@/components/module-center-boundary';

export default function MainAppPage() {
  return (
    <ModuleCenterBoundary>
      <ModuleCenter />
    </ModuleCenterBoundary>
  );
}
