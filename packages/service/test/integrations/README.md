# Service Integration Tests

- `vectorDB/`: real vector database integration tests and local compose files
- `sandbox/editorIdle.integration.test.ts`: real code-server idle exit, multiple connections,
  restart and independent Agent-process preservation. Requires Docker and a locally available
  agent-sandbox image; `SANDBOX_EDITOR_TEST_IMAGE` can select a different image with code-server
  idle-timeout support. Tests use temporary containers without network access or user volumes.

Run the editor lifecycle tests from the repository root:

```sh
pnpm --filter @fastgpt/service exec vitest run -c vitest.integration.config.ts test/integrations/sandbox/editorIdle.integration.test.ts --coverage.enabled=false
```

These tests exercise real 60-second heartbeat and idle windows and take several minutes.
