import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import Card from "@/components/Card";
import ArrowButton from "@/components/ArrowButton";
import StatsStrip from "@/components/StatsStrip";
import { ArrowIcon } from "@/components/icons";
import { homeStats, homeSteps, homeFeatures, testimonial } from "@/lib/data";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <MarketingNav />

      <section className={`shell ${styles.hero}`}>
        <p className={`eyebrow ${styles.eyebrow}`}>Adaptive Learning</p>
        <h1 className={styles.headline}>
          Master any subject through diagnosis, not repetition.
        </h1>
        <div className={styles.copy}>
          <p>
            Most tutoring tools re-teach everything and hope something sticks. This one starts by
            running a short diagnostic to find exactly where your understanding breaks — the one
            step you&apos;re actually missing, not the whole chapter.
          </p>
          <p>
            From there you get an explanation grounded in real source material, cited inline, aimed
            squarely at that gap. Then a free-response mastery check makes sure you can produce the
            answer yourself, not just recognize it.
          </p>
          <p>
            If it doesn&apos;t land the first time, the explanation comes back in a different
            format and you try again — the loop repeats until it actually sticks.
          </p>
        </div>
      </section>

      <section className={`shell ${styles.statsSection}`}>
        <StatsStrip stats={homeStats} />
      </section>

      <section className={`shell ${styles.section}`}>
        <div className={styles.sectionHead}>
          <p className="eyebrow">The Loop</p>
          <h2>How it works</h2>
        </div>
        <div className={styles.stepsRow}>
          {homeSteps.map((step) => (
            <div key={step.n} className={styles.stepCard}>
              <div className={`mono ${styles.stepNum}`}>{step.n}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`shell ${styles.section}`}>
        <div className={styles.sectionHead}>
          <p className="eyebrow">What You Get</p>
          <h2>Built around actual mastery</h2>
        </div>
        <div className={styles.featureGrid}>
          {homeFeatures.map((f) => (
            <Card key={f.title} featured={f.featured} className={styles.featureCard}>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <div className={styles.featureFoot}>
                <ArrowButton inverted={f.featured} />
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className={`shell ${styles.section}`}>
        <div className={styles.testimonialCard}>
          <p className={styles.quote}>&ldquo;{testimonial.quote}&rdquo;</p>
          <p className={styles.quoteAttr}>
            {testimonial.name} — {testimonial.role}
          </p>
        </div>
      </section>

      <section className={`shell ${styles.ctaSection}`}>
        <h2>Ready to start?</h2>
        <p>Sign up with your student ID to get matched to your courses automatically.</p>
        <Link href="/signup" className={styles.ctaButton}>
          Sign up
          <ArrowIcon size={14} />
        </Link>
      </section>
    </>
  );
}
