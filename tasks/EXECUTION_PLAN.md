# Claude Studio - Master Execution Plan

**Last Updated**: 2025-11-02
**Status**: READY FOR IMPLEMENTATION
**Total Tasks**: 86 tasks
**Estimated Duration**: 7 weeks (with parallelization)

---

## Quick Start

### For Implementation

1. **Read this document** to understand the overall plan
2. **Check TASK_REGISTRY.md** for complete task list
3. **Begin with Phase 0** tasks in sequential order
4. **Follow dependencies** strictly (do not skip prerequisite tasks)
5. **Mark tasks complete** in TASK_REGISTRY.md as you finish them

### For Task Assignment

- **backend-architect**: Phases 0, 1, 3, 4, 6, 7 (critical path)
- **frontend-architect**: Phases 2, 5, 8 (parallel track)
- **quality-engineer**: Testing tasks in all phases
- **security-engineer**: Security review in Phases 3, 6, 8, 9
- **devops-architect**: Setup (Phase 0) and deployment (Phase 9)

---

## Implementation Strategy

### Sequential Phases (Must Complete in Order)

These phases form the **critical path** and must be completed sequentially:

```
Phase 0 → Phase 1 → Phase 3 → Phase 4 → Phase 9
(Setup) (Backend) (Docker) (Claude) (Integration)
```

**Rationale**: Each phase depends on architectural decisions from the previous.

### Parallel Tracks

While the critical path progresses, these can be developed in parallel:

**Frontend Track** (can start after Phase 0):

```
Phase 2 → Phase 5 → Phase 8
(Terminal) (Split View) (Console Panel)
```

**Integration Points**:

- Phase 2 integrates with Phase 1 (WebSocket)
- Phase 5 integrates with Phase 2 (Terminal component)
- Phase 8 integrates with Phase 6 (Proxy for console injection)

---

## Week-by-Week Breakdown

### Week 1: Project Setup + Validation

**Goal**: Establish foundation and de-risk critical assumptions

**Tasks**:

- **Phase 0**: All tasks (P00-T001 through P00-T006)
  - Monorepo setup
  - TypeScript configuration
  - ESLint + Prettier + husky
  - Jest + Playwright setup
  - CI/CD pipeline

**Spike Tasks** (system-architect recommendation):

- **SPIKE-001**: Validate Claude CLI works in Docker container
  - Build test Dockerfile with Claude CLI
  - Run `claude "hello world"` inside container
  - Verify ANSI colors render
  - Document findings
- **SPIKE-002**: Test console injection across frameworks
  - Test script injection in React (Vite)
  - Test script injection in Next.js
  - Test CSP handling
  - Document findings

**Deliverables**:

- Project compiles (TypeScript)
- Tests run (Jest + Playwright)
- CI pipeline green
- Spike reports complete

---

### Week 2: Backend Foundation + Frontend Terminal

**Goal**: Working WebSocket communication and terminal UI

**Backend Track** (backend-architect):

- **Phase 1**: All tasks (P01-T001 through P01-T008)
  - Express server with health check
  - WebSocket server with echo
  - Shared TypeScript types
  - Unit tests

**Frontend Track** (frontend-architect):

- **Phase 2**: All tasks (P02-T001 through P02-T008)
  - React + Vite setup
  - xterm.js integration
  - WebSocket client
  - Terminal ↔ WebSocket integration

**Deliverables**:

- Backend WebSocket server running
- Frontend terminal renders
- Can type in terminal → see echo response
- All unit tests passing

**E2E Test**: Open browser, type "hello" in terminal, see "hello" echoed back

---

### Week 3: Docker Containerization (CRITICAL)

**Goal**: Replace WebSocket echo with Docker container I/O

**Tasks**:

- **Phase 3**: All tasks (P03-T001 through P03-T010)
  - Install dockerode
  - Create Dockerfile
  - Build image
  - Container session manager (P03-T004 - CRITICAL)
  - Container attach for I/O
  - Replace node-pty with Docker
  - Security hardening
  - Re-attachment logic
  - Container lifecycle cleanup
  - Integration tests

**Critical Success Factors**:

- P03-T004 (Container manager) must be perfect - this is foundation
- Security review by security-engineer required
- All security tests must pass

**Deliverables**:

- Docker image built (claude-studio-env:latest)
- Container created per session
- Can execute bash commands in container
- Session persists across WebSocket reconnect
- Security tests pass (container isolation, resource limits)

**E2E Test**: Open browser, type "echo hello", see output from container

---

### Week 4: Claude CLI + Split View

**Goal**: Run Claude CLI in container + split panel UI

**Backend Track** (backend-architect):

- **Phase 4**: All tasks (P04-T001 through P04-T007)
  - Install Claude CLI in Docker
  - Configure bash shell startup
  - Handle ANSI colors
  - Session state persistence
  - E2E tests for Claude interaction
  - Security tests for container isolation

**Frontend Track** (frontend-architect):

- **Phase 5**: All tasks (P05-T001 through P05-T007)
  - Install react-split-pane
  - Create SplitView layout
  - Create Preview component (iframe)
  - URL state management
  - Responsive design
  - Component tests

**Deliverables**:

- Claude CLI responds to prompts in container
- ANSI colors render correctly
- Split view: Terminal (left) | Preview (right)
- Can manually enter URL in Preview

**E2E Test**: Type `claude "create hello.txt"`, file appears in project directory

---

### Week 5: Dev Server Proxy + File Watcher

**Goal**: Proxy dev server + auto-reload on file changes

**Tasks**:

- **Phase 6**: All tasks (P06-T001 through P06-T010)
  - Manual port configuration endpoint
  - SSRF prevention (P06-T002 - security-engineer review)
  - http-proxy-middleware setup
  - Dynamic port mapping for containers
  - Send preview URL via WebSocket
  - Port configuration modal (frontend)
  - HMR WebSocket proxy
  - Integration tests
  - Security tests (SSRF)
  - E2E tests

- **Phase 7**: All tasks (P07-T001 through P07-T008)
  - Install chokidar
  - File change debouncing
  - Broadcast reload via WebSocket
  - Reload event listener (frontend)
  - Manual reload button
  - Smart reload filtering
  - Integration tests
  - E2E tests

**Deliverables**:

- User enters port 5173, preview loads dev server
- Edit file → preview auto-reloads within 500ms
- HMR WebSocket works (Vite hot reload)
- SSRF tests pass (malicious ports blocked)

**E2E Test**: Start Vite dev server on 5173, edit src/App.tsx, preview updates automatically

---

### Week 6: Console Streaming

**Goal**: Browser console logs visible to Claude

**Tasks**:

- **Phase 8**: All tasks (P08-T001 through P08-T010)
  - Console interceptor script
  - Script injection via proxy (P08-T002)
  - Handle console messages via WebSocket
  - XSS prevention (P08-T004 - security-engineer review)
  - ConsolePanel component (frontend)
  - Integrate with WebSocket
  - Fallback postMessage SDK
  - Handle postMessage events
  - Integration tests (console streaming)
  - Security tests (XSS)
  - E2E tests

**Deliverables**:

- `console.log("test")` in browser → appears in Claude terminal
- `console.error` with stack trace visible
- ConsolePanel shows messages with colors
- XSS tests pass (HTML in logs escaped)

**E2E Test**: Preview loads, execute `console.error("test error")`, terminal shows "[Browser Console] [ERROR] test error"

---

### Week 7: Integration Testing + Polish + Deployment

**Goal**: Production-ready system with comprehensive testing

**Tasks**:

- **Phase 9**: All tasks (P09-T001 through P09-T012)
  - Setup comprehensive test infrastructure
  - Comprehensive security test suite (P09-T002)
  - WebSocket reconnection logic
  - Container lifecycle error handling
  - Proxy error handling
  - Rate limiting across all endpoints
  - Session cleanup and heartbeat
  - UX improvements (clear terminal, reconnect button, etc.)
  - Comprehensive documentation
  - Final integration and regression testing (P09-T010)
  - Production deployment configuration
  - Performance testing and optimization

**Deliverables**:

- All 86 tasks complete
- All tests passing (unit, integration, E2E, security)
- Test coverage >= 80%
- Security audit complete (no CRITICAL vulnerabilities)
- Documentation complete
- docker-compose.yml for production
- Deployed to Mac Studio (localhost:3850)

**Final E2E Test**: Demo scenario from MVP_PLAN.md works end-to-end

---

## Critical Success Factors

### Must-Have for MVP

1. **Security Tests Pass**
   - Container isolation verified
   - SSRF prevention validated
   - XSS prevention validated
   - Rate limiting enforced
   - No CRITICAL vulnerabilities

2. **Core Workflow Works**
   - Open browser → see terminal
   - Type Claude command → get response
   - Claude creates file → see in preview
   - File change → preview reloads
   - Browser error → Claude sees it

3. **Session Persistence**
   - Close browser → container stays alive
   - Re-open browser → reconnect to same session
   - Terminal history preserved

4. **Resource Limits Enforced**
   - Container cannot exceed 1GB RAM
   - Container CPU throttled at 50%
   - Idle containers auto-destroyed after 4 hours

---

## Risk Management

### High-Risk Tasks (Extra Attention Required)

#### P03-T004: Container Session Manager (CRITICAL)

- **Risk**: Foundation for all container logic, must be perfect
- **Mitigation**: Dedicate 2 days, comprehensive tests, security review
- **Blocker Impact**: If this fails, Phases 4-9 blocked

#### P06-T002: SSRF Prevention (CRITICAL)

- **Risk**: Security vulnerability could allow access to internal services
- **Mitigation**: Security-engineer must review, penetration test with malicious inputs
- **Blocker Impact**: Cannot deploy to production without this

#### P08-T002: Script Injection (CRITICAL)

- **Risk**: CSP, CORS, and framework differences can block injection
- **Mitigation**: Test with multiple frameworks, implement fallback strategies
- **Blocker Impact**: Console streaming won't work without this

### Blockers and Dependencies

**Phase 3 blocks Phase 4**:

- Cannot run Claude in container until container manager works
- **Mitigation**: SPIKE-001 validates assumption early

**Phase 6 blocks Phase 8**:

- Cannot inject console script without proxy middleware
- **Mitigation**: Implement fallback postMessage strategy

**Phase 9 requires all previous phases**:

- Integration testing cannot happen until all features complete
- **Mitigation**: Per-phase testing reduces risk

---

## Quality Gates

### Per-Phase Quality Criteria

Each phase must meet these criteria before moving to next:

1. **All acceptance criteria met**
   - Every checkbox in task YAML checked
   - Manual verification complete

2. **Tests passing**
   - Unit tests >= 80% coverage for new code
   - Integration tests for critical paths
   - E2E test for happy path

3. **Security review** (for Phases 3, 6, 8)
   - Security-engineer approval
   - Security tests passing

4. **Code review**
   - Peer review complete
   - No critical issues

5. **Documentation updated**
   - README reflects new features
   - API docs updated (if applicable)

---

## Metrics and Tracking

### Progress Tracking

Update TASK_REGISTRY.md daily with:

- Tasks completed (mark with ✅)
- Tasks in progress (mark with 🔄)
- Tasks blocked (mark with ❌, add blocker reason)

### Weekly Status Report

Every Friday, generate report:

- Tasks completed this week
- Tasks in progress
- Blockers identified
- Risks escalated
- Next week's plan

### Health Metrics

Track these metrics throughout:

- **Velocity**: Tasks completed per week (target: 12-15)
- **Quality**: Test pass rate (target: 100%)
- **Coverage**: Code coverage (target: >= 80%)
- **Security**: Vulnerabilities found (target: 0 CRITICAL/HIGH)
- **Performance**: Build time, test time (trend down)

---

## Escalation Path

### When to Escalate

Escalate immediately if:

1. **Task blocked > 2 days** (cannot proceed)
2. **Security issue found** (CRITICAL or HIGH severity)
3. **Architecture decision needed** (affects multiple phases)
4. **Spike reveals blocker** (assumption invalid)
5. **Timeline at risk** (> 20% behind schedule)

### Escalation Process

1. **Document issue** in GitHub issue
2. **Tag relevant agent** (backend-architect, security-engineer, etc.)
3. **Propose solutions** (2-3 options with trade-offs)
4. **Decision within 24 hours**

---

## Success Criteria (MVP Complete)

### Functional

- ✅ User can open http://localhost:3850
- ✅ Terminal loads and connects to Docker container
- ✅ Can execute `claude "help"` and get response
- ✅ Can execute `claude "create React counter app"`
- ✅ Files created by Claude appear in preview
- ✅ Edit file → preview auto-reloads
- ✅ Browser console.error visible to Claude
- ✅ Session persists across browser refresh

### Non-Functional

- ✅ All 86 tasks complete
- ✅ Test coverage >= 80%
- ✅ All security tests pass
- ✅ Performance: <100ms WebSocket latency, <500ms file change → reload
- ✅ Stability: 4-hour session without crash or memory leak
- ✅ Documentation complete (README, setup guide, troubleshooting)

### Security

- ✅ No CRITICAL or HIGH vulnerabilities
- ✅ Container breakout prevention validated
- ✅ SSRF prevention validated
- ✅ XSS prevention validated
- ✅ DoS prevention validated (rate limits enforced)
- ✅ Path traversal prevention validated

---

## Next Steps

1. ✅ Project plan created and validated
2. ✅ Tasks broken down and documented
3. ⏭️ **BEGIN IMPLEMENTATION**: Start with P00-T001 (Monorepo setup)
4. ⏭️ Run SPIKE-001 and SPIKE-002 (de-risk assumptions)
5. ⏭️ Daily standup: What done, what next, any blockers

---

**Let's build something amazing!** 🚀
