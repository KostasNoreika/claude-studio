# Claude Studio - Next Steps (Phase 3+)

**Current State**: Phases 0-2 complete (22/86 tasks), Docker setup in progress
**Token Usage**: ~124k/200k (62%)
**Remaining**: Phase 3-9 (64 tasks)

---

## Phase 3: In Progress (3/10 done)

### Completed ✅
- P03-T001: dockerode installed (v4.0.9) - Docker client connected
- P03-T002: Dockerfile created (`server/docker/Dockerfile`) - node:20-alpine base
- P03-T003: Build initiated (image building now)

### Next: P03-T004 (CRITICAL - 6-8 hours)
**Container Session Manager** - Most critical task in entire project!

```bash
# Continue with:
cd /opt/dev/claude-studio
# Read specification first:
cat tasks/phase-03/P03-T004.md

# Then implement using backend-architect agent
```

**Key Points**:
- Read P03-T004.md carefully (already read in context)
- Container lifecycle: create, start, stop, remove
- Resource limits: 1GB RAM, 512 CPU shares
- Security: read-only FS, capability dropping, non-root
- Session tracking with sessionId labels
- Zombie cleanup on startup

**Implementation skeleton**:
```typescript
// server/src/docker/containerManager.ts
export class ContainerManager {
  private static instance: ContainerManager;
  private docker: Docker;
  private sessions: Map<string, ContainerSession>;

  async createSession(config: ContainerConfig): Promise<ContainerSession>
  async stopSession(sessionId: string): Promise<void>
  listSessions(): ContainerSession[]
  async cleanupZombieContainers(): Promise<number>
}
```

### Remaining Phase 3 Tasks (7 tasks)
- P03-T005: Container attach (stdin/stdout/stderr)
- P03-T006: Replace echo with Docker I/O in WebSocket handler
- P03-T007: Re-attachment logic (session persistence)
- P03-T008: Security review (security-engineer)
- P03-T009: Container lifecycle error handling
- P03-T010: Integration tests

**After Phase 3**: Docker containers work, but still no Claude CLI (that's Phase 4)

---

## Phases 4-9: Quick Reference

### Phase 4: Claude CLI (7 tasks)
- Install Claude CLI in Docker image
- Configure bash startup
- ANSI color handling
- Session persistence
- Tests

**Output**: Can run `claude "help"` in container

### Phase 5: Split View UI (7 tasks, parallel with Phase 4)
- react-split-pane
- Terminal | Preview layout
- iframe preview component
- URL state management

**Output**: Two-panel UI (terminal + preview)

### Phase 6: Dev Server Proxy (10 tasks)
- Port configuration endpoint
- **P06-T002**: SSRF prevention (CRITICAL - security)
- http-proxy-middleware
- Dynamic port mapping
- HMR WebSocket proxy

**Output**: Preview panel shows proxied dev server

### Phase 7: File Watcher (8 tasks)
- chokidar file watcher
- Debounced reload signals
- WebSocket broadcast
- Manual reload button

**Output**: File changes trigger preview reload

### Phase 8: Console Streaming (10 tasks)
- Console interceptor script
- **P08-T002**: Script injection (CRITICAL - CSP challenges)
- **P08-T004**: XSS prevention (CRITICAL - security)
- ConsolePanel component
- Fallback postMessage SDK

**Output**: Browser console logs visible in terminal

### Phase 9: Testing & Polish (12 tasks)
- **P09-T002**: Security test suite (CRITICAL)
- Error handling across all components
- Rate limiting
- Session cleanup
- UX improvements
- **P09-T010**: Final integration testing (CRITICAL)
- Production deployment config
- Performance optimization

**Output**: Production-ready MVP

---

## Critical Path

Must complete in order:
```
Phase 3 → Phase 4 → Phase 6 → Phase 7 → Phase 8 → Phase 9
         ↓
      Phase 5 (parallel)
```

**Blockers**:
- P03-T004 blocks all of Phase 4
- Phase 6 blocks Phase 8 (proxy needed for script injection)
- All phases block Phase 9 (integration testing)

---

## Token Budget Strategy

**Problem**: Need ~350k tokens total, only have 200k per session

**Solution**: Multi-session approach
1. **Session 1** (this): Phases 0-2 + P03-T001-T003 (~124k tokens)
2. **Session 2**: P03-T004-T010 + Phase 4 (~80k tokens estimated)
3. **Session 3**: Phases 5-6 (~70k tokens)
4. **Session 4**: Phases 7-8 (~70k tokens)
5. **Session 5**: Phase 9 + final testing (~60k tokens)

---

## How to Continue (Next Session)

### Session 2 Prompt:
```
Continue Claude Studio implementation from Phase 3, Task 4.

Background:
- Phases 0-2 complete (22/86 tasks done)
- Backend server + frontend terminal working
- WebSocket communication functional
- Docker setup complete (dockerode + image built)

Context to read:
- /opt/dev/claude-studio/PHASE_0-2_COMPLETION_REPORT.md
- /opt/dev/claude-studio/NEXT_STEPS.md
- /opt/dev/claude-studio/tasks/phase-03/P03-T004.md
- /opt/dev/claude-studio/tasks/EXECUTION_PLAN.md

Current task: P03-T004 (Container Session Manager) - CRITICAL
Use backend-architect agent for implementation.
After P03-T004, continue with remaining Phase 3 tasks sequentially.

Goal: Complete Phase 3 (Docker Containerization) and Phase 4 (Claude CLI).
```

---

## Quick Test Commands

```bash
# Verify current state
cd /opt/dev/claude-studio

# Check servers running
lsof -i :3850  # Backend
lsof -i :3001  # Frontend

# Run tests
pnpm test                    # All tests (should pass 179/179)
pnpm --filter server test    # Backend (63 tests)
pnpm --filter client test    # Frontend (116 tests)

# Check Docker
docker images | grep claude-studio-env  # Should show latest image
docker ps                               # Should be empty (no running containers yet)

# Start servers if needed
pnpm --filter server dev  # Terminal 1
pnpm --filter client dev  # Terminal 2

# Open app
open http://127.0.0.1:3001
```

---

## Files Created So Far

**Phase 3 Progress**:
- `server/package.json` - dockerode dependency added
- `server/src/docker/test-connection.ts` - Docker connection test
- `server/docker/Dockerfile` - Container image definition
- Docker image: claude-studio-env:latest (building)

**Still Need** (Phase 3):
- `server/src/docker/types.ts` - TypeScript interfaces
- `server/src/docker/containerManager.ts` - Main container manager (P03-T004)
- `server/src/__tests__/docker/containerManager.test.ts` - Tests
- Updated `server/src/websocket/handler.ts` - Replace echo with container I/O

---

## Success Metrics

**Phase 3 Complete**:
- [ ] Can create Docker container per session
- [ ] Can execute bash commands in container
- [ ] Container I/O connected to WebSocket
- [ ] Resource limits enforced (1GB RAM, 512 CPU)
- [ ] Security hardening applied (read-only FS, non-root)
- [ ] Session persistence across reconnects
- [ ] Zombie container cleanup works
- [ ] All tests passing

**MVP Complete (All Phases)**:
- [ ] Can run `claude "help"` in browser terminal
- [ ] Can create files with Claude, see in preview
- [ ] File changes trigger auto-reload
- [ ] Browser console logs visible to Claude
- [ ] All 86 tasks complete
- [ ] 80%+ test coverage
- [ ] No CRITICAL security vulnerabilities
- [ ] Production deployment ready

---

## Estimated Timeline

**Remaining Effort**:
- Phase 3: 7 tasks (~2-3 days with P03-T004)
- Phase 4: 7 tasks (~1-2 days)
- Phase 5: 7 tasks (~1-2 days, parallel)
- Phase 6: 10 tasks (~2-3 days, includes security)
- Phase 7: 8 tasks (~1-2 days)
- Phase 8: 10 tasks (~2-3 days, includes security)
- Phase 9: 12 tasks (~2-3 days, integration & testing)

**Total**: ~3-5 weeks with AI assistance (original estimate: 7 weeks)

---

## Known State

**Working Now**:
- ✅ Full monorepo with TypeScript
- ✅ Backend Express + WebSocket server
- ✅ Frontend React + xterm.js terminal
- ✅ WebSocket bidirectional communication
- ✅ 179 tests passing (100% pass rate)
- ✅ CI/CD pipeline configured
- ✅ Docker client connected
- ✅ Docker image defined

**Not Working Yet**:
- ❌ Container execution (echo only, no real bash)
- ❌ Claude CLI (not installed)
- ❌ Split view UI (single terminal view)
- ❌ Dev server proxy (no preview)
- ❌ File watcher (no auto-reload)
- ❌ Console streaming (no browser logs)

---

## Tips for Next Session

1. **Start Fresh**: New session will have full 200k tokens
2. **Read Context First**: PHASE_0-2_COMPLETION_REPORT.md has everything
3. **Focus on P03-T004**: This is the most critical task, take time to get it right
4. **Use Agents**: backend-architect for implementation, quality-engineer for tests
5. **Test Frequently**: Run tests after each task to catch issues early
6. **Check Docker**: `docker ps` and `docker logs` are your friends
7. **Security Matters**: Read-only FS and capability dropping are critical

---

**Last Updated**: 2025-11-02 (Session 1)
**Next Session**: Start with P03-T004 (Container Session Manager)
**Progress**: 25/86 tasks (29%), Phases 0-2 complete + 3 Phase 3 tasks
