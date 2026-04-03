import { Button } from "@horcruxsys/nagini/ui/button";
import styles from "./page.module.css";

const capabilities = [
  {
    title: "Jira-aware planning",
    description:
      "Turn a ticket like `CDX-739` into requirements, acceptance criteria, and an execution-ready plan.",
  },
  {
    title: "Confluence-backed RAG",
    description:
      "Retrieve design rationale, prior discussions, and constraints with citations and freshness signals.",
  },
  {
    title: "GitHub MCP execution",
    description:
      "Inspect the repo, locate impacted files, and drive safe implementation through a bounded workflow.",
  },
  {
    title: "Validation-first delivery",
    description:
      "Keep every run grounded in lint, type-check, test, and PR evidence before calling the task done.",
  },
];

const workflow = [
  "Understand the ticket and linked context.",
  "Assemble a cited context pack from Jira, Confluence, and repo hints.",
  "Generate a plan, approvals, and target file list.",
  "Execute in a controlled plan → code → validate loop.",
  "Publish a draft PR with evidence and follow-up notes.",
];

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <span className={styles.badge}>Nagini AI Delivery Orchestrator</span>
        <h1>
          Implement software work items with grounded multi-agent execution.
        </h1>
        <p className={styles.lead}>
          This workspace now includes an implementation scaffold for an
          orchestrator that connects Jira, Confluence, and GitHub MCP to plan
          and execute delivery safely.
        </p>

        <div className={styles.ctas}>
          <a
            className={styles.primary}
            href="http://localhost:4000/health"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open orchestrator health
          </a>
          <a className={styles.secondary} href="/onboarding">
            Project onboarding
          </a>
          <Button appName="web" className={styles.secondary}>
            Preview shared UI
          </Button>
        </div>

        <section className={styles.grid}>
          {capabilities.map((item) => (
            <article key={item.title} className={styles.card}>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </article>
          ))}
        </section>

        <section className={styles.workflow}>
          <h2 className={styles.sectionTitle}>Execution flow</h2>
          <ol>
            {workflow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className={styles.footerNote}>
            Design and implementation notes live in{" "}
            <code>docs/ai-orchestrator/</code> and the API scaffold lives in{" "}
            <code>apps/orchestrator/</code>.
          </p>
        </section>
      </main>
    </div>
  );
}
