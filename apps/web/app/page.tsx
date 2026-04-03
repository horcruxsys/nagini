import Link from "next/link";

import { Button } from "@horcruxsys/nagini/ui/button";
import { approveRunAction, rejectRunAction } from "./actions";
import { getDashboardData } from "../lib/orchestrator";
import styles from "./page.module.css";

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

export default async function Home() {
  const dashboard = await getDashboardData();
  const systemReady = dashboard.providerHealth.every(
    (provider) => provider.status === "ready",
  );

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.heroShell}>
          <div className={styles.topChrome}>
            <span className={styles.chromeDot} />
            <span className={styles.chromeDot} />
            <span className={styles.chromeDot} />
            <p>Nagini Control Center</p>
            <span className={styles.statusPill}>
              {systemReady ? "All systems ready" : "Attention needed"}
            </span>
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className={styles.badge}>iOS6-inspired orchestration</span>
              <h1>
                Clean AI delivery UX for enterprise teams and 1M consumers.
              </h1>
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
                <span>
                  Updated{" "}
                  {new Date(dashboard.generatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
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
                {dashboard.providerHealth.map((provider) => (
                  <li key={provider.provider}>
                    <strong>{provider.provider}</strong>
                    <span>
                      {provider.status === "ready" ? "Ready" : "Degraded"} ·{" "}
                      {provider.message}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section className={styles.metricsRow}>
          {dashboard.metrics.map((metric) => (
            <article
              key={metric.id}
              className={styles.metricCard}
              data-tone={metric.tone}
            >
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
              {dashboard.recentActivity.map((step) => (
                <li key={step.id}>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                  <div className={styles.timelineFooter}>
                    <time>{new Date(step.timestamp).toLocaleString()}</time>
                    {!step.id.startsWith("fallback-") ? (
                      <Link className={styles.detailLink} href={`/runs/${step.id}`}>
                        Open run details
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </article>

          <article className={styles.infoPanel}>
            <div className={styles.panelTitleRow}>
              <h2>Approval queue</h2>
              <span className={styles.panelBadge}>Human in the loop</span>
            </div>
            <ul className={styles.approvalList}>
              {dashboard.approvalQueue.length > 0 ? (
                dashboard.approvalQueue.map((item) => (
                  <li key={item.runId} className={styles.approvalItem}>
                    <div className={styles.approvalHeader}>
                      <div>
                        <strong>
                          <Link
                            className={styles.detailLink}
                            href={`/runs/${item.runId}`}
                          >
                            {item.issueKey}
                          </Link>
                        </strong>
                        <p className={styles.approvalMeta}>{item.repo}</p>
                      </div>
                      <span
                        className={styles.statusTag}
                        data-status={item.status}
                      >
                        {item.status}
                      </span>
                    </div>

                    <span>{item.summary}</span>
                    <div className={styles.cardFooter}>
                      <time>{new Date(item.requestedAt).toLocaleString()}</time>
                      <Link className={styles.detailLink} href={`/runs/${item.runId}`}>
                        View details
                      </Link>
                    </div>

                    {item.status === "pending" ? (
                      <form className={styles.approvalForm}>
                        <input type="hidden" name="runId" value={item.runId} />
                        <input
                          type="hidden"
                          name="reviewer"
                          value="ui.operator"
                        />
                        <input
                          className={styles.commentInput}
                          type="text"
                          name="comment"
                          placeholder="Add guidance for the agent (optional)"
                        />
                        <div className={styles.approvalButtons}>
                          <button
                            type="submit"
                            formAction={approveRunAction}
                            className={styles.approveButton}
                          >
                            Approve
                          </button>
                          <button
                            type="submit"
                            formAction={rejectRunAction}
                            className={styles.rejectButton}
                          >
                            Reject
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className={styles.decisionNote}>
                        Decision captured. The run timeline reflects the latest
                        reviewer action.
                      </p>
                    )}
                  </li>
                ))
              ) : (
                <li className={styles.approvalItem}>
                  <strong>No approvals are waiting right now.</strong>
                  <span>
                    New implement runs will appear here for one-tap review.
                  </span>
                </li>
              )}
            </ul>
          </article>
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeading}>
            <span>Rollout track</span>
            <h2>Approval-first expansion for a high-trust launch.</h2>
          </div>
          <article className={styles.infoPanel}>
            <ul className={styles.trackList}>
              {dashboard.launchTracks.map((track) => (
                <li key={track}>{track}</li>
              ))}
            </ul>
            <p className={styles.footerNote}>
              Implementation sources live in <code>apps/orchestrator/</code>,{" "}
              <code>packages/workflows/</code>, and{" "}
              <code>packages/knowledge/</code>.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
