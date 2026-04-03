import Link from "next/link";

import { Button } from "@horcruxsys/nagini/ui/button";
import styles from "./page.module.css";

const trustMetrics = [
  { label: "Connected projects", value: "124", note: "+18 this week" },
  { label: "Weekly automations", value: "2.8k", note: "92% validated" },
  { label: "Consumer reach", value: "1M+", note: "global scale ready" },
];

const pillars = [
  {
    title: "Fast-first orchestration",
    description:
      "Users can move from a command like `implement CDX-739` to a cited plan in seconds, without cognitive overload.",
  },
  {
    title: "Trust by design",
    description:
      "Every recommendation shows citations, validation evidence, and approval states before any high-impact action.",
  },
  {
    title: "Scale for 1M consumers",
    description:
      "The experience uses progressive disclosure, resilient defaults, and low-friction onboarding to serve large audiences reliably.",
  },
];

const activityFeed = [
  "Ticket parsed from Jira with acceptance criteria and linked pages.",
  "Hybrid retrieval ranked design guidance and impacted repo areas.",
  "Execution validated lint and type-check before marking complete.",
];

const launchTracks = [
  "Pilot with one product team and approval-on-write enabled.",
  "Expand retrieval freshness and PR automation for shared services.",
  "Open the consumer surface to large-scale self-serve project onboarding.",
];

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.heroShell}>
          <div className={styles.topChrome}>
            <span className={styles.chromeDot} />
            <span className={styles.chromeDot} />
            <span className={styles.chromeDot} />
            <p>Nagini Control Center</p>
            <span className={styles.statusPill}>All systems ready</span>
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className={styles.badge}>iOS6-inspired orchestration</span>
              <h1>Clean AI delivery UX for enterprise teams and 1M consumers.</h1>
              <p className={styles.lead}>
                This next phase brings a polished, high-trust interface to the
                orchestrator: faster onboarding, clearer approvals, and a
                consumer-grade experience for Jira, Confluence, and GitHub-led
                delivery.
              </p>

              <div className={styles.ctas}>
                <a
                  className={styles.primary}
                  href="http://127.0.0.1:4001/health"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open live orchestrator
                </a>
                <Link className={styles.secondaryLink} href="/onboarding">
                  View onboarding flow
                </Link>
                <Button appName="web" className={styles.secondaryButton}>
                  Preview interaction
                </Button>
              </div>
            </div>

            <aside className={styles.commandPanel}>
              <div className={styles.panelHeader}>
                <strong>Run composer</strong>
                <span>Latency target: &lt; 250ms p95</span>
              </div>

              <div className={styles.segmentedControl}>
                <span className={styles.segmentActive}>Implement</span>
                <span>Plan</span>
                <span>Review</span>
              </div>

              <div className={styles.commandBox}>
                <label htmlFor="command">Command</label>
                <div id="command" className={styles.commandInput}>
                  implement CDX-739
                </div>
              </div>

              <ul className={styles.signalList}>
                <li>
                  <strong>Jira</strong>
                  <span>Ticket understood</span>
                </li>
                <li>
                  <strong>Confluence</strong>
                  <span>2 cited pages found</span>
                </li>
                <li>
                  <strong>Validation</strong>
                  <span>Real lint + type-check enabled</span>
                </li>
              </ul>
            </aside>
          </div>
        </section>

        <section className={styles.metricsRow}>
          {trustMetrics.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.note}</span>
            </article>
          ))}
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeading}>
            <span>Why this UX works</span>
            <h2>Designed for clarity, speed, and trust at massive scale.</h2>
          </div>

          <div className={styles.cardGrid}>
            {pillars.map((item) => (
              <article key={item.title} className={styles.infoCard}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.twoColumn}>
          <article className={styles.infoPanel}>
            <div className={styles.panelTitleRow}>
              <h2>Live activity</h2>
              <span className={styles.panelBadge}>Realtime feel</span>
            </div>
            <ol className={styles.timeline}>
              {activityFeed.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>

          <article className={styles.infoPanel}>
            <div className={styles.panelTitleRow}>
              <h2>Phase rollout</h2>
              <span className={styles.panelBadge}>1M-user path</span>
            </div>
            <ul className={styles.trackList}>
              {launchTracks.map((track) => (
                <li key={track}>{track}</li>
              ))}
            </ul>
            <p className={styles.footerNote}>
              Implementation sources live in <code>apps/orchestrator/</code>,{" "}
              <code>packages/workflows/</code>, and <code>packages/knowledge/</code>.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
