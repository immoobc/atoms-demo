# atoms-demo

An Atoms-style AI demo with a cross-session memory system and a project workspace that turns prompts into runnable web apps.

## Features

- **Memory chat**: Streaming AI chat with three memory layers.
  - **Rules**: Global user-defined rules.
  - **Session history**: The recent messages in the current conversation.
  - **Long-term memories**: Structured facts that persist across conversations.
  - **Pipeline**: Memories are extracted, saved, retrieved, and added to the prompt. Duplicate memories are skipped, and conflicting ones are updated. Memory has three modes: off, use only, and use and learn. Users can see which memories each reply used or changed, and can manage memories and rules.
- **Project workspace**: Projects with a goal, background, and acceptance criteria. Users can attach long-term memories to a project.
  - **Pipeline**: Project lead (plans tasks and acceptance points) → developer (generates the app, self-checks it, and repairs it once if needed) → saves project conclusions as memories.
  - **Workspace view**: Each stage updates live. A sandboxed iframe previews the generated app. A file browser shows the code. Every iteration creates a new version you can switch to.

## Structure

```
backend/   FastAPI backend (FuncSea / Atoms Cloud)
  services/memory_engine.py      memory extraction, retrieval, conflict handling
  services/project_pipeline.py   project lead / developer roles and self-check
  routers/memchat.py             chat + memory API
  routers/project_workspace.py   project workspace API
frontend/  React + TypeScript + Vite + Tailwind + shadcn/ui
  src/pages/                     Index (chat), Projects, ProjectWorkspace
  src/components/chat|project/   UI components
```

## Models

- **Chat, project lead, and developer**: `deepseek-v4-pro`.
- **Memory extraction**: `deepseek-v4-flash`.

## Running

The backend requires runtime configuration from the Atoms Cloud environment, including the database, auth, and AI gateway. No secrets are stored in this repository.

```bash
cd frontend && pnpm install && pnpm run build
cd .. && ./start_app_v2.sh --local
```
