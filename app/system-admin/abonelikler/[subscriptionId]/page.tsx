import SubscriptionDetailClient from './subscription-detail-client';

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  return <SubscriptionDetailClient subscriptionId={decodeURIComponent(subscriptionId)} />;
}
