# Demo data lives in the repo (demo/)
dev:
    AGENT_PLANNER_DIR=${AGENT_PLANNER_DIR:-demo/agents} AGENT_PLANNER_STATE=${AGENT_PLANNER_STATE:-demo/state} AGENT_PLANNER_DEMO=${AGENT_PLANNER_DEMO-1} bun --watch src/web/server.ts

# Type check (tsc checks, bun does not)
typecheck:
    bunx tsc --noEmit

test: typecheck
    bun test

# Sync systemd units from the agent folder ($AGENT_PLANNER_DIR)
sync:
    bun bin/agent-planner sync --dir ${AGENT_PLANNER_DIR:?set AGENT_PLANNER_DIR}

# Web UI as a user service: link the unit from the repo, start it, restart it (after an update)
install:
    @test -f "$HOME/.config/agent-planner/web.env" || { echo "missing ~/.config/agent-planner/web.env -- copy .env.example there and edit it" >&2; exit 1; }
    systemctl --user link {{justfile_directory()}}/systemd/agent-planner-web.service
    systemctl --user enable --now agent-planner-web.service
    systemctl --user restart agent-planner-web.service
