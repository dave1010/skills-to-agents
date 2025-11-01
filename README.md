# skills-to-agents

`skills-to-agents` is a tiny CLI and GitHub Action that lets any coding agent which understands the `AGENTS.md` convention take advantage of Claude-style Skills.

Claude's Skills system packages reusable agent instructions, metadata, and optional code or reference material inside directories that contain a `SKILL.md`. This project maps those directories onto the far more widespread `AGENTS.md` convention so that agents from other ecosystems can load the same Skill instructions without additional integration work.

## What it does

* **Scans Claude Skill directories** – the tool looks for `skills/*/SKILL.md`, parses the YAML frontmatter, and collects each Skill's name, description, and relative path.
* **Generates `AGENTS.md` entries** – it inserts a `<skills>…</skills>` block (creating one if necessary) that lists every Skill with a link back to the source instructions.
* **Ships as a GitHub Action** – run it in CI to keep the `AGENTS.md` file in sync whenever Skill content changes.
* **Provides a reusable CLI** – run `node src/skills-to-agents.js` locally to preview or update the generated block.

## Why bridge Skills and `AGENTS.md`?

Claude loads Skills progressively: lightweight metadata is always available, detailed instructions are read on demand from `SKILL.md`, and extra resources (scripts, templates, datasets) stay on disk until referenced. By translating those Skill directories into an `AGENTS.md` summary, other agents inherit the same curated instructions and can manually open the linked resources when the task requires deeper guidance.

This project gives you a single source of truth for Skill documentation while staying compatible with the ecosystems that already expect instructions inside `AGENTS.md` files.

## Managing skills

Add your actual Skills under `skills/<skill-name>`, and the tool will keep the agent-facing documentation synchronized automatically. This path is customisable.

Skills could be:

- committed in the repo
- symlinked
- part of the build process

Ensure the Skills exist in the workspace when this action is ran.
If the Skills are brought in as part of the build, then ensure your coding agent knows how to do this, otherwise the Skills won't be where it expects to find them.

## Running in GitHub Actions

The bundled composite action (`action.yml`) wraps the CLI so you can automate updates in any workflow. The action sets up Node.js, runs the generator, and exposes a `changed` output so you can decide whether to commit or open a PR with the new `AGENTS.md` content.

A minimal configuration that commits and pushes a change to AGENTS.md looks like this:

```yaml
name: Update AGENTS skills list

on:
  push:
    branches:
      - main
    paths:
      - 'skills/**'
  workflow_dispatch:

jobs:
  update-agents-skills:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: dave1010/skills-to-agents@v1
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore: sync AGENTS skills list'
          file_pattern: AGENTS.md
```

### Customising options

```yaml
name: Sync AGENTS.md from Skills

on:
  push:
    paths:
      - "skills/**"
  pull_request:
    paths:
      - "skills/**"
  workflow_dispatch:

jobs:
  build-agents-md:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate skills block
        uses: dave1010/skills-to-agents@v1
        with:
          repo-root: .
          skills-dir: skills
          agents-path: AGENTS.md
```

### Update only if AGENTS.md changed

```yaml
name: Build agents.md
on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-agents:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build AGENTS.md
        id: build
        uses: dave1010/skills-to-agents@v1
      - name: Commit changes
        if: steps.build.outputs.changed == 'true'
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add AGENTS.md
          git commit -m "chore(agents): update AGENTS.md"
          git push
```

### Open a PR instead of direct commit

```yaml
permissions:
  contents: write
  pull-requests: write

steps:
  - uses: actions/checkout@v4
  - uses: dave1010/skills-to-agents@v1
  - uses: peter-evans/create-pull-request@v7
    if: steps.build.outputs.changed == 'true'
    with:
      branch: chore/update-agents
      title: "Update AGENTS.md"
      commit-message: "chore(agents): update AGENTS.md"
      body: "Automated update of AGENTS.md from skills."
```

## Using the CLI locally

```bash
npm install # if you want local node_modules for linting or tooling
node src/skills-to-agents.js --skills-dir skills --agents-path AGENTS.md --write
```

Key flags:

* `--skills-dir` – directory that contains Skill subfolders (defaults to `skills`).
* `--agents-path` – target `AGENTS.md` file to update (defaults to `AGENTS.md`).
* `--preamble` / `--preamble-file` – override the default text inserted at the top of the generated block.
* `--write` – apply changes; omit it to perform a dry run.

The script exits with an error if required files are missing or frontmatter cannot be parsed, which keeps CI builds honest.
