import { Navbar } from '@/components/navbar';
import { HeroSection } from '@/components/hero-section';
import { FeaturesSection } from '@/components/features-section';
import { TrustSection } from '@/components/trust-section';
import { DownloadSection } from '@/components/download-section';
import { PricingSection } from '@/components/pricing-section';
import { CTASection } from '@/components/cta-section';
import { Footer } from '@/components/footer';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white antialiased">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <TrustSection />
      <DownloadSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </main>
  );
}
