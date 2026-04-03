import Link from "next/link";

import { approveRunAction, rejectRunAction } from "./actions";
import {
  getDashboardData,
  getOrchestratorBaseUrl,
  getSetupState,
} from "../lib/orchestrator";
import styles from "./page.module.css";

const pillars = [
  {
    title: "Fast-first orchestration",
    description:
      "Users can move from a command like `implement <issue-key>` to a cited plan in seconds, without cognitive overload.",
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
  const [dashboard, setup] = await Promise.all([
    getDashboardData(),
    getSetupState(),
  ]);
  const systemReady =
    setup.ready &&
    dashboard.providerHealth.every((provider) => provider.status === "ready");
  const suggestedCommand =
    dashboard.approvalQueue[0]?.issueKey != null
      ? `implement ${dashboard.approvalQueue[0].issueKey}`
      : setup.recommended.issueKeyTemplate;
  const healthUrl = `${getOrchestratorBaseUrl()}/health`;

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
              {systemReady
                ? "Live connectors ready"
                : `${setup.completedCount}/${setup.totalCount} connectors connected`}
            </span>
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className={styles.badge}>
                Paperclip-inspired onboarding
              </span>
              <h1>
                Connect real tools first, then watch the live agent cockpit.
              </h1>
              <p className={styles.lead}>
                The product now guides teams through connector setup, approval
                rules, and launch readiness before handing off to the real
                dashboard where agent activity, validation, and approvals are
                visible in one place.
              </p>

              <div className={styles.ctas}>
                <Link className={styles.primary} href="/onboarding">
                  {setup.ready ? "Manage connectors" : "Start onboarding"}
                </Link>
                <a
                  className={styles.secondaryLink}
                  href={healthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Check orchestrator health
                </a>
                <span className={styles.secondaryButton}>
                  {setup.nextAction}
                </span>
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
                  {suggestedCommand}
                </div>
              </div>

              <ul className={styles.signalList}>
                {dashboard.providerHealth.map((provider) => (
                  <li key={provider.provider}>
                    <strong>{provider.provider}</strong>
                    <span>
                      {(provider.status === "ready"
                        ? "Ready"
                        : provider.status === "not_configured"
                          ? "Setup needed"
                          : "Degraded") + " · "}
                      {provider.message}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        {!setup.ready ? (
          <section className={styles.setupBanner}>
            <div>
              <p className={styles.bannerEyebrow}>Onboarding progress</p>
              <h2>
                {setup.completedCount}/{setup.totalCount} connectors are ready
              </h2>
              <p className={styles.bannerText}>{setup.nextAction}</p>
            </div>
            <Link className={styles.primary} href="/onboarding">
              Continue setup
            </Link>
          </section>
        ) : null}

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
              <h2>Live agent activity</h2>
              <span className={styles.panelBadge}>Real orchestration</span>
            </div>
            <ol className={styles.timeline}>
              {dashboard.recentActivity.map((step) => (
                <li key={step.id}>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                  <div className={styles.timelineFooter}>
                    <time>{new Date(step.timestamp).toLocaleString()}</time>
                    {!step.id.startsWith("fallback-") ? (
                      <Link
                        className={styles.detailLink}
                        href={`/runs/${step.id}`}
                      >
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
                      <Link
                        className={styles.detailLink}
                        href={`/runs/${item.runId}`}
                      >
                        View details
                      </Link>
                    </div>

                    {item.status === "pending" ? (
                      <form className={styles.approvalForm}>
                        <input type="hidden" name="runId" value={item.runId} />
                        <input
                          type="hidden"
                          name="reviewer"
                          value={setup.recommended.reviewer}
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
