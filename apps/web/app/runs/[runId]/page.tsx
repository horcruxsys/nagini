import Link from "next/link";
import { notFound } from "next/navigation";

import { approveRunAction, rejectRunAction } from "../../actions";
import { getRunDetailData } from "../../../lib/orchestrator";
import styles from "./page.module.css";

type RunDetailPageProps = {
  params: Promise<{
    runId: string;
  }>;
};

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function humanize(value?: string): string {
  return value ? value.replaceAll("_", " ") : "unknown";
}

export default async function RunDetailPage({
  params,
}: RunDetailPageProps) {
  const { runId } = await params;
  const detail = await getRunDetailData(runId);

  if (!detail) {
    notFound();
  }

  const { run, timeline } = detail;
  const latestDecision = run.approval?.decisions.at(-1);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link className={styles.backLink} href="/">
          ← Back to control center
        </Link>

        <section className={styles.heroShell}>
          <div className={styles.topChrome}>
            <span className={styles.chromeDot} />
            <span className={styles.chromeDot} />
            <span className={styles.chromeDot} />
            <p>Run detail view</p>
            <span className={styles.statusBadge} data-status={run.status}>
              {humanize(run.status)}
            </span>
          </div>

          <div className={styles.heroContent}>
            <div>
              <span className={styles.badge}>Evidence-first review</span>
              <h1>
                {run.issueKey} · {humanize(run.mode)} run
              </h1>
              <p className={styles.summary}>{run.summary}</p>
            </div>

            <dl className={styles.metaGrid}>
              <div>
                <dt>Repository</dt>
                <dd>{run.repo}</dd>
              </div>
              <div>
                <dt>Base branch</dt>
                <dd>{run.baseBranch}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(run.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(run.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.card}>
            <p className={styles.cardLabel}>Approval state</p>
            <strong>{humanize(run.approval?.status ?? "not_required")}</strong>
            <span>
              {run.approval?.required
                ? "Human review is enabled for this run."
                : "This run can execute without a manual decision."}
            </span>
          </article>

          <article className={styles.card}>
            <p className={styles.cardLabel}>Validation</p>
            <strong>{humanize(run.validation?.status ?? "pending")}</strong>
            <span>{run.validation?.summary ?? "Validation has not started yet."}</span>
          </article>

          <article className={styles.card}>
            <p className={styles.cardLabel}>Execution branch</p>
            <strong>{run.plan?.branchName ?? "Not generated"}</strong>
            <span>
              {run.plan?.approvalRequired
                ? "Branch execution remains approval-first."
                : "Execution can proceed immediately when ready."}
            </span>
          </article>
        </section>

        <section className={styles.contentGrid}>
          <div className={styles.column}>
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Timeline</h2>
                <span className={styles.panelPill}>{timeline.length} events</span>
              </div>

              <ol className={styles.timelineList}>
                {timeline.map((event) => (
                  <li key={event.id} className={styles.timelineItem}>
                    <strong>{event.title}</strong>
                    <span>{event.detail}</span>
                    <time>{formatDate(event.createdAt)}</time>
                  </li>
                ))}
              </ol>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Execution plan</h2>
                <span className={styles.panelPill}>
                  {run.plan?.tasks.length ?? 0} tasks
                </span>
              </div>

              {run.plan ? (
                <div className={styles.stack}>
                  <p className={styles.supportingText}>{run.plan.summary}</p>
                  <ul className={styles.taskList}>
                    {run.plan.tasks.map((task) => (
                      <li key={task.id} className={styles.taskItem}>
                        <strong>{task.title}</strong>
                        <p>{task.reason}</p>
                        <div>
                          <p className={styles.listTitle}>Target paths</p>
                          <ul className={styles.miniList}>
                            {task.targetPaths.map((path) => (
                              <li key={path}>
                                <code>{path}</code>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className={styles.listTitle}>Test strategy</p>
                          <ul className={styles.miniList}>
                            {task.testStrategy.map((check) => (
                              <li key={check}>{check}</li>
                            ))}
                          </ul>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className={styles.emptyState}>No plan is available for this run yet.</p>
              )}
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Approval decision</h2>
                <span
                  className={styles.statusBadge}
                  data-status={run.approval?.status ?? "not_required"}
                >
                  {humanize(run.approval?.status ?? "not_required")}
                </span>
              </div>

              {run.approval?.status === "pending" ? (
                <form className={styles.approvalForm}>
                  <input type="hidden" name="runId" value={run.id} />
                  <input type="hidden" name="reviewer" value="ui.operator" />
                  <input
                    className={styles.commentInput}
                    type="text"
                    name="comment"
                    placeholder="Add reviewer guidance or blockers (optional)"
                  />
                  <div className={styles.approvalButtons}>
                    <button
                      type="submit"
                      formAction={approveRunAction}
                      className={styles.approveButton}
                    >
                      Approve run
                    </button>
                    <button
                      type="submit"
                      formAction={rejectRunAction}
                      className={styles.rejectButton}
                    >
                      Reject run
                    </button>
                  </div>
                </form>
              ) : latestDecision ? (
                <p className={styles.decisionNote}>
                  <strong>{latestDecision.reviewer}</strong> marked this run as{" "}
                  <strong>{humanize(run.approval?.status)}</strong>
                  {latestDecision.comment ? ` — ${latestDecision.comment}` : "."}
                </p>
              ) : (
                <p className={styles.emptyState}>No approval action has been recorded yet.</p>
              )}
            </article>
          </div>

          <div className={styles.column}>
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Context evidence</h2>
                <span className={styles.panelPill}>
                  {run.contextPack?.citations.length ?? 0} citations
                </span>
              </div>

              {run.contextPack ? (
                <div className={styles.stack}>
                  <p className={styles.supportingText}>{run.contextPack.summary}</p>

                  <div>
                    <p className={styles.listTitle}>Requirements</p>
                    <ul className={styles.miniList}>
                      {run.contextPack.requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className={styles.listTitle}>Impacted areas</p>
                    <ul className={styles.miniList}>
                      {run.contextPack.impactedAreas.map((area) => (
                        <li key={area}>
                          <code>{area}</code>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className={styles.listTitle}>Citations</p>
                    <ul className={styles.citationList}>
                      {run.contextPack.citations.map((citation) => (
                        <li key={citation.id} className={styles.citationItem}>
                          <div className={styles.citationHeader}>
                            <strong>{citation.title}</strong>
                            <span className={styles.sourceTag}>{citation.source}</span>
                          </div>
                          <p>{citation.snippet}</p>
                          <a href={citation.url} target="_blank" rel="noopener noreferrer">
                            Open source ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className={styles.emptyState}>Context evidence is not available for this run.</p>
              )}
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Validation evidence</h2>
                <span
                  className={styles.statusBadge}
                  data-status={run.validation?.status ?? "pending"}
                >
                  {humanize(run.validation?.status ?? "pending")}
                </span>
              </div>

              {run.validation?.commands.length ? (
                <div className={styles.commandStack}>
                  {run.validation.commands.map((command) => (
                    <article key={`${command.label}-${command.command}`} className={styles.commandCard}>
                      <div className={styles.commandHeader}>
                        <strong>{command.label}</strong>
                        <span
                          className={styles.statusBadge}
                          data-status={command.exitCode === 0 ? "completed" : "failed"}
                        >
                          exit {command.exitCode}
                        </span>
                      </div>
                      <p className={styles.commandMeta}>
                        <code>{command.command}</code> · {(command.durationMs / 1000).toFixed(1)}s
                      </p>
                      <pre className={styles.commandOutput}>
                        {command.stdout || command.stderr || "No output captured."}
                      </pre>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyState}>
                  {run.validation?.summary ?? "Validation output will appear here after execution."}
                </p>
              )}
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
