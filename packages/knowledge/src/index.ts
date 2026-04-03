import type {
  ContextCitation,
  ContextPack,
  WorkItem,
} from "@horcruxsys/nagini/domain";

export interface BuildContextPackInput {
  workItem: WorkItem;
  citations: ContextCitation[];
  repoHints: string[];
}

export interface KnowledgeService {
  createContextPack(input: BuildContextPackInput): Promise<ContextPack>;
}

export class StaticKnowledgeService implements KnowledgeService {
  async createContextPack(input: BuildContextPackInput): Promise<ContextPack> {
    const { workItem, citations, repoHints } = input;

    return {
      issueKey: workItem.key,
      summary: `${workItem.title}: ${workItem.description}`,
      requirements: workItem.acceptanceCriteria,
      assumptions: [
        "The repo already contains the baseline app and package structure.",
        "GitHub, Jira, and Confluence access will be wired via project-level credentials.",
      ],
      constraints: [
        "All generated outputs must remain auditable.",
        "Validation evidence is required before marking a run complete.",
      ],
      impactedAreas: repoHints,
      citations,
      unresolvedQuestions: [
        "Which actions should require mandatory human approval in the target environment?",
      ],
    };
  }
}
