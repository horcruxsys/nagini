import Link from "next/link";

import { getOrchestratorBaseUrl, getSetupState } from "../../lib/orchestrator";
import styles from "./page.module.css";

const providerCopy = {
  jira: "Understand real work items, priorities, and acceptance criteria.",
  confluence:
    "Ground plans in design rationale, ADRs, and product documentation.",
  github: "Discover live repositories, impacted files, and execution targets.",
} as const;

function statusLabel(status: "ready" | "degraded" | "not_configured") {
  if (status === "ready") {
    return "Connected";
  }

  if (status === "not_configured") {
    return "Needs setup";
  }

  return "Attention needed";
}

export default async function Page() {
  const setup = await getSetupState();
  const healthUrl = `${getOrchestratorBaseUrl()}/health`;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.header}>
          <span className={styles.badge}>Guided setup</span>
          <h1>Connect your real tools, then enter the live agent cockpit.</h1>
          <p>
            This onboarding flow replaces demo data with real connector checks,
            discovered workspaces, and approval-first launch guidance.
          </p>
        </div>

        <section className={styles.progressHero}>
          <div>
            <p className={styles.eyebrow}>Workspace readiness</p>
            <h2>
              {setup.completedCount}/{setup.totalCount} connectors connected
            </h2>
            <p>{setup.nextAction}</p>
          </div>
          <div className={styles.progressCard}>
            <span className={styles.progressValue}>
              {Math.round((setup.completedCount / setup.totalCount) * 100)}%
            </span>
            <span>completion</span>
          </div>
        </section>

        <div className={styles.layout}>
          <div className={styles.connectorColumn}>
            {setup.connectors.map((connector, index) => (
              <article
                key={connector.provider}
                className={styles.connectorCard}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.stepIndex}>{`0${index + 1}`}</span>
                  <div>
                    <h2>{connector.label}</h2>
                    <p>{providerCopy[connector.provider]}</p>
                  </div>
                  <span
                    className={styles.statusTag}
                    data-status={connector.status}
                  >
                    {statusLabel(connector.status)}
                  </span>
                </div>

                <p className={styles.message}>{connector.message}</p>

                {connector.resources.length > 0 ? (
                  <ul className={styles.resourceList}>
                    {connector.resources.map((resource) => (
                      <li key={resource.id} className={styles.resourceItem}>
                        <strong>{resource.label}</strong>
                        {resource.description ? (
                          <span>{resource.description}</span>
                        ) : null}
                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open ↗
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.emptyState}>
                    <strong>No live resources discovered yet.</strong>
                    <span>
                      Missing env: {connector.missingEnv.join(", ") || "none"}
                    </span>
                  </div>
                )}
              </article>
            ))}

            <article className={styles.connectorCard}>
              <div className={styles.cardHeader}>
                <span className={styles.stepIndex}>04</span>
                <div>
                  <h2>Launch policy</h2>
                  <p>
                    Use approval-first defaults while the first teams onboard.
                  </p>
                </div>
              </div>

              <ul className={styles.policyList}>
                <li>
                  <strong>Suggested command</strong>
                  <span>{setup.recommended.issueKeyTemplate}</span>
                </li>
                <li>
                  <strong>Default reviewer</strong>
                  <span>{setup.recommended.reviewer}</span>
                </li>
                <li>
                  <strong>Recommended repo</strong>
                  <span>
                    {setup.recommended.repo ??
                      "Will appear after GitHub discovery"}
                  </span>
                </li>
              </ul>
            </article>
          </div>

          <aside className={styles.sidebar}>
            <article className={styles.sideCard}>
              <p className={styles.eyebrow}>Quick start</p>
              <h3>1. Copy the example env file</h3>
              <pre className={styles.codeBlock}>cp .env.example .env</pre>
              <p>
                Add real Jira, Confluence, and GitHub credentials. The server
                now reads <code>.env</code> automatically.
              </p>
            </article>

            <article className={styles.sideCard}>
              <p className={styles.eyebrow}>What happens next</p>
              <ul className={styles.checkList}>
                <li>Connector status turns green</li>
                <li>Live projects, spaces, and repos appear</li>
                <li>The dashboard begins showing real agent activity</li>
              </ul>
            </article>

            <div className={styles.actions}>
              <Link href="/">Open control center</Link>
              <a href={healthUrl} target="_blank" rel="noreferrer">
                Check live health
              </a>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
