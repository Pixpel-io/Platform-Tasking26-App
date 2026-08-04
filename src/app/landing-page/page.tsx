import { Nav } from "./_components/Nav";
import { Hero } from "./_components/Hero";
import { LogoStrip } from "./_components/LogoStrip";
import { Bento } from "./_components/Bento";
import { Showcase } from "./_components/Showcase";
import { Testimonials } from "./_components/Testimonials";
import { Pricing } from "./_components/Pricing";
import { CTA } from "./_components/CTA";
import { Footer } from "./_components/Footer";

export default function LandingPage() {
  return (
    <>
      <a href="#landing-content" className="landing-skip-link">
        Skip to content
      </a>
      <Nav />
      <main id="landing-content">
        <Hero />
        <LogoStrip />
        <Bento />
        <Showcase />
        <Testimonials />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
