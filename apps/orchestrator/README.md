# Orchestrator App

This app provides the initial API surface for the AI delivery orchestrator.

## Commands

```bash
pnpm --filter orchestrator dev
```

## Endpoints

- `GET /health`
- `GET /api/capabilities`
- `GET /api/runs`
- `POST /api/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/events`

## Example request

```bash
curl -X POST http://localhost:4000/api/runs \
  -H 'content-type: application/json' \
  -d '{
    "projectId": "demo-project",
    "mode": "implement",
    "issueKey": "CDX-739",
    "repo": "nagini",
    "baseBranch": "main"
  }'
```

> Current validation and connector behavior are intentionally scaffolded in simulation mode so the workflow contract can be integrated safely before live credentials and sandbox execution are added.
