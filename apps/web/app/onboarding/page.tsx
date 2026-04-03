import Link from "next/link";

import styles from "./page.module.css";

const steps = [
  "Connect Jira, Confluence, and GitHub with least-privilege access.",
  "Pick approval rules, validation requirements, and rollout safeguards.",
  "Launch a focused pilot before enabling self-serve product teams.",
];

const Page = () => {
  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.header}>
          <span className={styles.badge}>Guided setup</span>
          <h1>Onboard teams in minutes, not meetings.</h1>
          <p>
            This flow is intentionally simple for large-scale adoption: clean
            defaults, visible trust controls, and fast first success.
          </p>
        </div>

        <div className={styles.grid}>
          {steps.map((step, index) => (
            <article key={step} className={styles.card}>
              <span>{`0${index + 1}`}</span>
              <h2>{step}</h2>
            </article>
          ))}
        </div>

        <div className={styles.actions}>
          <Link href="/">Back to control center</Link>
          <a
            href="http://127.0.0.1:4001/health"
            target="_blank"
            rel="noreferrer"
          >
            Check live health
          </a>
        </div>
      </section>
    </main>
  );
};

export default Page;
