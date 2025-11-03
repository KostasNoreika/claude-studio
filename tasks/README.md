# Claude Studio - Task Management System

**Status**: ✅ READY FOR IMPLEMENTATION
**Total Tasks**: 86 tasks
**Last Updated**: 2025-11-02

---

## 📁 What's in This Directory?

### Core Documents

1. **TASK_REGISTRY.md** - Complete list of all 86 tasks
   - Organized by phase (0-9)
   - Includes agent assignments, complexity, dependencies
   - Quick reference for all tasks

2. **EXECUTION_PLAN.md** - Master implementation plan
   - Week-by-week breakdown
   - Critical path analysis
   - Risk management
   - Success criteria

3. **Individual Task Files** - Detailed task specifications
   - Format: `/phase-XX/PXX-TXXX.md`
   - Example: `phase-00/P00-T001.md`
   - Example: `phase-03/P03-T004.md` (CRITICAL task)

---

## 🚀 How to Use This System

### For Claude CLI (when implementing)

When starting a task, Claude CLI should:

1. **Read the task file** (e.g., `tasks/phase-00/P00-T001.md`)
2. **Check dependencies** (are prerequisite tasks complete?)
3. **Implement according to spec** (follow acceptance criteria)
4. **Run tests** (ensure all tests pass)
5. **Mark complete** in TASK_REGISTRY.md

### For Humans (when planning)

1. **Start with EXECUTION_PLAN.md** to understand overall approach
2. **Check TASK_REGISTRY.md** for specific tasks in current phase
3. **Assign tasks to agents** (backend-architect, frontend-architect, etc.)
4. **Track progress** by updating task status in TASK_REGISTRY.md

---

## 📋 Task Status Tracking

Update TASK_REGISTRY.md with status:

- ⏳ **Planned**: Not started yet
- 🔄 **In Progress**: Currently being worked on
- ✅ **Completed**: Acceptance criteria met, tests passing
- ❌ **Blocked**: Cannot proceed due to blocker

---

## 🎯 Quick Start Guide

### Week 1: Phase 0 - Project Setup

Start here → `phase-00/P00-T001.md`

**Commands**:

```bash
# Read the task
cat tasks/phase-00/P00-T001.md

# Implement the task
# (follow the task specification)

# Mark complete
# Update TASK_REGISTRY.md: P00-T001 ⏳ → ✅
```

**Tasks in order**:

1. P00-T001: Initialize monorepo ← START HERE
2. P00-T002: Setup TypeScript
3. P00-T003: Configure ESLint/Prettier
4. P00-T004: Setup Jest
5. P00-T005: Setup Playwright
6. P00-T006: GitHub Actions CI

---

## 🧭 Navigation

### By Phase

- **Phase 0**: `phase-00/` (6 tasks) - Project setup
- **Phase 1**: `phase-01/` (8 tasks) - Backend foundation
- **Phase 2**: `phase-02/` (8 tasks) - Frontend terminal
- **Phase 3**: `phase-03/` (10 tasks) - Docker containers ⚠️ CRITICAL
- **Phase 4**: `phase-04/` (7 tasks) - Claude CLI
- **Phase 5**: `phase-05/` (7 tasks) - Split view UI
- **Phase 6**: `phase-06/` (10 tasks) - Dev server proxy
- **Phase 7**: `phase-07/` (8 tasks) - File watcher
- **Phase 8**: `phase-08/` (10 tasks) - Console streaming
- **Phase 9**: `phase-09/` (12 tasks) - Testing & polish

### By Agent

When Claude CLI runs with a specific agent type, it should only implement tasks assigned to that agent:

- **backend-architect**: Phases 0, 1, 3, 4, 6, 7 (34 tasks)
- **frontend-architect**: Phases 2, 5, 8 (18 tasks)
- **quality-engineer**: Testing tasks across all phases (20 tasks)
- **security-engineer**: Security review in Phases 3, 6, 8, 9 (6 tasks)
- **devops-architect**: Phase 0 + Phase 9 deployment (8 tasks)

---

## ⚠️ Critical Tasks (High Risk)

These tasks require extra attention and security review:

1. **P03-T004**: Container Session Manager (CRITICAL)
   - Foundation for all container logic
   - Security-engineer review required
   - Comprehensive testing mandatory

2. **P06-T002**: SSRF Prevention Validator (CRITICAL)
   - Prevents access to internal services
   - Penetration testing required

3. **P08-T002**: Console Script Injection (CRITICAL)
   - CSP and framework compatibility challenges
   - Fallback strategies needed

---

## 📊 Progress Tracking

### Current Status (Example)

```
Phase 0: ⏳⏳⏳⏳⏳⏳ (0/6 complete)
Phase 1: ⏳⏳⏳⏳⏳⏳⏳⏳ (0/8 complete)
Phase 2: ⏳⏳⏳⏳⏳⏳⏳⏳ (0/8 complete)
...

Overall: 0/86 tasks complete (0%)
```

Update this weekly in TASK_REGISTRY.md

---

## 🔧 Task File Format

Each task file follows this structure:

```markdown
# P{phase}-T{number}: {title}

**Phase**: {0-9}
**Agent**: {backend-architect|frontend-architect|...}
**Complexity**: {LOW|MEDIUM|HIGH|CRITICAL}
**Estimated Effort**: {hours}

## Description

[What needs to be done]

## Dependencies

[List of prerequisite tasks]

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
      ...

## Files to Create/Modify

[List of files]

## Security Considerations

[Security notes if applicable]

## Testing Requirements

[Unit/integration/E2E tests needed]

## Verification Steps

[How to verify task is complete]

## Next Tasks

[What to do after this]
```

---

## 🤝 How Claude CLI Should Use This

### When implementing a task:

```bash
# 1. Read the task file
claude "read and summarize tasks/phase-00/P00-T001.md"

# 2. Implement the task
claude "implement task P00-T001 following the specification in tasks/phase-00/P00-T001.md"

# 3. Run tests
npm test

# 4. Verify acceptance criteria
claude "verify all acceptance criteria for P00-T001 are met"

# 5. Mark complete
# (update TASK_REGISTRY.md)
```

### When planning next steps:

```bash
# Check what's next after P00-T001
claude "what tasks depend on P00-T001 being complete?"

# Find tasks for specific agent
claude "list all tasks assigned to backend-architect that are ready to start"

# Check critical path
claude "show me the critical path tasks from EXECUTION_PLAN.md"
```

---

## 📚 Additional Resources

- **MVP_PLAN.md**: Original 9-phase plan with Docker-first approach
- **ARCHITECTURE.md**: System architecture deep dive
- **SECURITY.md**: Security requirements and patterns
- **IMPLEMENTATION_SUMMARY.md**: Post-debate MCP review summary

---

## ✅ Validation

This task breakdown was:

- ✅ Created by **requirements-analyst** agent (80 tasks)
- ✅ Validated by **system-architect** agent (APPROVED WITH CHANGES)
- ✅ Enhanced with **Phase 0** and spike tasks (6 additional tasks)
- ✅ Structured for Claude CLI consumption

**Ready for implementation!** 🚀

---

**Next Step**: Start with `tasks/phase-00/P00-T001.md`
