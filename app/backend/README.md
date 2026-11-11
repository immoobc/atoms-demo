# FuncSea Backend

This directory is the backend of a FuncSea App. Resource provisioning and generated database files are owned by the FuncSea MCP.

## Workflow

1. Read `.atoms/skills/funcsea-backend/references/backend-resources.md`.
2. Call `funcsea:status`; if the state is not `READY`, call `funcsea:initialize` and check again.
3. After `READY`, use the database and object-storage MCP tools.
4. Implement application behavior in `routers/`, `services/`, and `schemas/`.

## Project files

- `models/`, `alembic/`: generated and maintained by the MCP; inspect them, but do not rewrite them casually.
- `core/`, `main.py`, `lambda_handler.py`: protected framework files.
- `routers/`, `services/`, `schemas/`: application backend code.
- Do not create a second user/authentication table for the built-in FuncSea users.

## Development references

- Frontend SDK: `.atoms/skills/funcsea-backend/references/web_sdk.md`
- Custom APIs and payments: `.atoms/skills/funcsea-backend/references/custom_api.md`
- AI capabilities: `.atoms/skills/funcsea-backend/references/ai_capability.md`
- Object storage: `.atoms/skills/funcsea-backend/references/object_storage.md`

## Run

- From `app`, use `./start_app_v2.sh --local` for local startup.
- From `app/frontend`, use the existing package scripts for frontend checks.
