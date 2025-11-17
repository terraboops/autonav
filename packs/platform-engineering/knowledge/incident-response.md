# Incident Response Guide

**Version**: 0.1.0
**Last Updated**: 2025-11-17

This guide defines incident classification, response procedures, communication protocols, and post-incident review processes for platform teams.

---

## Table of Contents

1. [Incident Severity Levels](#incident-severity-levels)
2. [Response Procedures](#response-procedures)
3. [Communication Protocols](#communication-protocols)
4. [Escalation Paths](#escalation-paths)
5. [Post-Incident Review](#post-incident-review)
6. [Runbook Organization](#runbook-organization)
7. [On-Call Best Practices](#on-call-best-practices)

---

## Incident Severity Levels

### P0 - Critical

**Definition**: Complete service outage or critical functionality broken affecting all or majority of users.

**Examples**:
- Entire production platform down
- Data loss or corruption
- Security breach or data leak
- Payment processing completely broken

**Response Time**: Immediate (within 5 minutes)

**Resolution Target**: 1-2 hours

**Response Team**:
- Incident Commander
- On-call engineers (all teams)
- Engineering leadership
- Communications lead

**Notification**:
- Page on-call immediately
- Alert engineering leadership
- Notify executive team
- Prepare customer communication

### P1 - High

**Definition**: Major functionality degraded or unavailable affecting significant portion of users.

**Examples**:
- Critical service degraded (high latency, high error rate)
- Major feature completely broken
- Multi-region or multi-service outage
- Deployment blocking production releases

**Response Time**: Within 15 minutes

**Resolution Target**: 4-8 hours

**Response Team**:
- Incident Commander
- Relevant on-call engineers
- Service owners
- Communications lead (if customer-facing)

**Notification**:
- Page on-call immediately
- Alert team leads
- Notify stakeholders if customer impact

### P2 - Medium

**Definition**: Partial functionality impaired or minor functionality broken affecting subset of users.

**Examples**:
- Non-critical service degraded
- Single instance/region having issues
- Performance degradation within SLO but approaching limits
- Internal tool broken

**Response Time**: Within 1 hour

**Resolution Target**: 24 hours

**Response Team**:
- On-call engineer
- Service owner
- Additional team members as needed

**Notification**:
- Alert on-call
- Update team channel
- Notify affected internal teams

### P3 - Low

**Definition**: Minor issue with minimal or no user impact.

**Examples**:
- Non-critical metric anomaly
- Single pod/container issue (others healthy)
- Cosmetic bug
- Non-urgent technical debt

**Response Time**: Within 4 hours (business hours)

**Resolution Target**: 7 days

**Response Team**:
- Assigned engineer (may not be on-call)
- Service owner

**Notification**:
- Create ticket
- Update team channel

---

## Response Procedures

### P0/P1 Incident Response

#### Step 1: Alert Received (0-5 minutes)

**On-call engineer actions**:
```
1. Acknowledge alert (stop paging)
2. Assess severity - is this really P0/P1?
3. If yes, join incident channel immediately
4. Post initial status: "Investigating [brief description]"
5. Declare incident if not auto-declared
```

**Example message**:
```
@channel P1 INCIDENT: Production API returning 500 errors. Investigating now.
Status: INVESTIGATING
Incident Commander: @alice
Started: 2024-01-15 10:23 UTC
```

#### Step 2: Initial Assessment (5-15 minutes)

**Gather key information**:
```bash
# What is broken?
- Which service(s)?
- What functionality?
- Error rate/impact percentage?

# When did it start?
kubectl get events --sort-by='.lastTimestamp' | tail -20

# What changed?
kubectl rollout history deployment/<name>

# Current state?
kubectl get pods -n <namespace>
kubectl top pods -n <namespace>

# Recent errors?
kubectl logs -n <namespace> -l app=<app> --tail=100 | grep -i error
```

**Post update**:
```
UPDATE:
- API service returning 503 errors
- Error rate: 45%
- Started: ~10:20 UTC (correlated with deployment)
- Likely cause: New deployment v2.5.3
- Action: Rolling back deployment
```

#### Step 3: Mitigation (15-30 minutes)

**Priority: Stop the bleeding**

**If caused by deployment**:
```bash
# Rollback immediately
kubectl rollout undo deployment/<name> -n <namespace>

# Monitor rollback
kubectl rollout status deployment/<name> -n <namespace>

# Verify error rate decreasing
# Check Grafana/Prometheus
```

**If caused by resource exhaustion**:
```bash
# Scale up immediately
kubectl scale deployment/<name> --replicas=<higher-count> -n <namespace>

# Or add more nodes
# (depends on cloud provider)
```

**If caused by dependency failure**:
```bash
# Identify failing dependency
kubectl get pods -n <dependency-namespace>

# Restart if needed
kubectl rollout restart deployment/<dependency> -n <dependency-namespace>

# Or enable circuit breaker/fallback
```

**Post update**:
```
UPDATE:
- Rolled back deployment to v2.5.2
- Rollback complete at 10:28 UTC
- Error rate dropping: 45% → 15% → 5%
- Monitoring for stability
```

#### Step 4: Verification (30-45 minutes)

**Verify mitigation worked**:
```bash
# Check error rate returned to baseline
# Check latency returned to normal
# Check all pods healthy
kubectl get pods -n <namespace>

# Check no new errors in logs
kubectl logs -n <namespace> -l app=<app> --since=10m | grep -i error

# Verify monitoring metrics green
```

**Post update**:
```
UPDATE:
- Error rate back to baseline (< 0.1%)
- Latency normal
- All pods healthy
- INCIDENT RESOLVED
Resolved: 2024-01-15 10:35 UTC
Duration: 12 minutes

Root cause: Deployment v2.5.3 had database connection pool misconfiguration
Follow-up: Post-incident review scheduled for 2024-01-16 14:00
```

#### Step 5: Post-Mitigation (45-60 minutes)

**Stabilization**:
1. Monitor for 30-60 minutes to ensure stability
2. Check for any secondary effects
3. Verify all alerts cleared
4. Thank responders

**Communication**:
1. Post final resolution message
2. Update status page
3. Notify stakeholders
4. Schedule post-incident review

### P2/P3 Incident Response

**Lighter-weight process**:

1. **Acknowledge**: Acknowledge alert, post in team channel
2. **Assess**: Determine actual severity and impact
3. **Investigate**: Use standard troubleshooting procedures
4. **Fix**: Apply fix when root cause identified
5. **Verify**: Confirm issue resolved
6. **Document**: Update ticket with findings and fix

**No need for**:
- Incident commander
- War room/channel
- Frequent updates
- Formal post-incident review (though optional)

---

## Communication Protocols

### Incident Channel

**Create incident channel** (P0/P1):
```
Channel name: #incident-2024-01-15-api-outage
Purpose: Coordinate response to API outage
Invite: @oncall-engineers @team-leads @comms-lead
```

**Channel guidelines**:
- Keep signal-to-noise high
- Updates only (minimal chatter)
- Use threads for discussions
- Pin important updates
- Archive after incident resolved

### Status Update Cadence

**P0**:
- Every 10-15 minutes until resolved
- Even if "no update" (shows you're working on it)

**P1**:
- Every 30 minutes until resolved

**P2**:
- Every 2-4 hours or major milestone

**P3**:
- When resolved

### Update Template

```
UPDATE [TIMESTAMP]:
Status: [INVESTIGATING | IDENTIFIED | MITIGATING | RESOLVED]
Impact: [Description of current user impact]
Action: [What we're doing right now]
ETA: [When we expect next update or resolution]
```

**Example**:
```
UPDATE 10:25 UTC:
Status: MITIGATING
Impact: API error rate at 45%, affecting user logins and data fetching
Action: Rolling back deployment v2.5.3 to v2.5.2
ETA: Rollback completion in 5 minutes, will monitor for 15 min
```

### External Communication

**When to notify customers**:
- P0: Always
- P1: If customer-facing functionality affected
- P2/P3: Generally no, unless prolonged

**Status page update template**:
```
[INVESTIGATING] We are investigating reports of [service] issues
Updated: [timestamp]

[IDENTIFIED] We have identified the issue with [service] causing [impact]
Updated: [timestamp]

[MONITORING] A fix has been applied. We are monitoring for stability.
Updated: [timestamp]

[RESOLVED] The issue with [service] has been resolved.
Duration: [start] - [end]
Updated: [timestamp]
```

---

## Escalation Paths

### When to Escalate

**Escalate immediately if**:
- P0 incident (always escalate)
- Cannot determine root cause after 30 minutes
- Mitigation not working
- Issue spreading to other services
- Data loss risk
- Security implications

**Escalate eventually if**:
- P1 not resolved in 2 hours
- P2 not making progress after 8 hours
- Need specialized expertise (database, networking, security)

### Who to Escalate To

**Technical Escalation**:
1. Service owner (if not already involved)
2. Senior engineer on team
3. Team lead
4. Principal engineer / architect
5. Engineering leadership

**Operational Escalation** (P0 only):
1. Engineering manager
2. Director of Engineering
3. VP Engineering / CTO

**External Escalation**:
1. Cloud provider support (infrastructure issues)
2. Vendor support (third-party service issues)
3. Security team (security incidents)

### Escalation Message Template

```
@escalation-contact Need assistance with P1 incident

Incident: API outage (#incident-2024-01-15-api-outage)
Started: 10:23 UTC (45 minutes ago)
Impact: 45% error rate on production API
What we've tried:
- Rolled back deployment (error rate unchanged)
- Checked all dependencies (all healthy)
- Reviewed logs (no clear error pattern)
Need help with: Determining why rollback didn't fix the issue
```

---

## Post-Incident Review

### Purpose

1. **Learn** what happened and why
2. **Improve** systems and processes
3. **Share** knowledge with team
4. **NOT** to assign blame

### Blameless Post-Mortem

**Key principle**: Focus on systems and processes, not individuals.

**Good questions**:
- "What conditions led to this failure?"
- "How can we detect this sooner?"
- "What can we improve?"

**Bad questions**:
- "Who caused this?"
- "Why didn't you catch this?"
- "Who's responsible?"

### Post-Incident Review Template

#### 1. Incident Summary

```
Incident: Production API Outage
Severity: P1
Date: 2024-01-15
Duration: 12 minutes (10:23 - 10:35 UTC)
Impact: 45% error rate on production API, affecting user logins and data fetching
```

#### 2. Timeline

```
10:20 UTC - Deployment v2.5.3 started
10:23 UTC - Alert fired: High error rate
10:23 UTC - On-call engineer acknowledged, started investigation
10:25 UTC - Identified deployment as likely cause
10:26 UTC - Started rollback to v2.5.2
10:28 UTC - Rollback complete
10:30 UTC - Error rate returning to normal
10:35 UTC - Incident resolved, monitoring for stability
```

#### 3. Root Cause

```
Root Cause: Database connection pool misconfigured in v2.5.3

Details:
- Connection pool size set to 10 (should be 100)
- Under load, connections exhausted quickly
- New connections timing out after 5s
- Resulted in 503 errors to clients

Why it happened:
- Configuration change not caught in code review
- Staging environment uses smaller load (issue didn't surface)
- No alert for connection pool exhaustion
```

#### 4. What Went Well

```
✅ Alert fired within 3 minutes of issue starting
✅ On-call responded immediately
✅ Rollback procedure worked smoothly
✅ Clear communication throughout incident
✅ Quick resolution (12 minutes)
```

#### 5. What Went Wrong

```
❌ Issue not caught in staging (insufficient load testing)
❌ Configuration change not flagged in code review
❌ No alert for connection pool exhaustion
❌ Deployment continued despite early errors (first pods failed)
```

#### 6. Action Items

```
1. [P0] Add connection pool metrics and alerts
   Owner: @alice
   Due: 2024-01-20

2. [P0] Add load testing to CI/CD pipeline
   Owner: @bob
   Due: 2024-01-25

3. [P1] Update deployment automation to halt on early pod failures
   Owner: @charlie
   Due: 2024-02-01

4. [P2] Add configuration validation to pre-deployment checks
   Owner: @diana
   Due: 2024-02-15

5. [P2] Document connection pool sizing guidelines
   Owner: @eve
   Due: 2024-01-30
```

#### 7. Lessons Learned

```
- Configuration changes are just as risky as code changes
- Staging environment needs production-like load
- Early warning signs (first pod failures) should halt deployments
- Connection pool exhaustion is not currently visible in our monitoring
```

### Post-Incident Review Meeting

**When**: Within 2 business days of P0/P1 resolution

**Duration**: 60 minutes

**Attendees**:
- Incident responders
- Service owners
- Engineering manager
- Anyone interested

**Agenda**:
1. Incident commander presents timeline and root cause (10 min)
2. Discussion: What happened and why (20 min)
3. Brainstorm: How to prevent recurrence (20 min)
4. Assign action items (10 min)

**Outcome**:
- Published post-incident review document
- Action items assigned with owners and due dates
- Knowledge shared with wider team

---

## Runbook Organization

### What is a Runbook?

A runbook is a step-by-step guide for responding to specific alerts or scenarios.

### Runbook Template

```markdown
# Runbook: High Error Rate Alert

## Alert Description
Alert fires when error rate > 5% for 5 minutes

## Impact
Users experiencing failures when [describe functionality]

## Possible Causes
1. Recent deployment introduced bug
2. Downstream dependency failing
3. Resource exhaustion (CPU, memory, connections)
4. Database issues

## Investigation Steps

### 1. Check recent changes
```bash
kubectl rollout history deployment/<name> -n <namespace>
```

### 2. Check error logs
```bash
kubectl logs -n <namespace> -l app=<app> --tail=100 | grep -i error
```

### 3. Check dependencies
```bash
kubectl get pods -n <dependency-namespace>
```

### 4. Check resources
```bash
kubectl top pods -n <namespace>
```

## Mitigation Steps

### If caused by deployment:
```bash
kubectl rollout undo deployment/<name> -n <namespace>
```

### If caused by dependency:
```bash
kubectl rollout restart deployment/<dependency> -n <dependency-namespace>
```

### If caused by resources:
```bash
kubectl scale deployment/<name> --replicas=<higher> -n <namespace>
```

## Escalation
If not resolved in 30 minutes, escalate to @team-lead

## Related Documentation
- deployment.md → Rollback Procedures
- troubleshooting.md → Application Errors
```

### Runbook Best Practices

1. **Keep it simple**: Step-by-step, no assumptions
2. **Include commands**: Copy-paste ready
3. **Explain why**: Not just what, but why we do each step
4. **Test regularly**: Run through runbook quarterly
5. **Update after incidents**: Capture new learnings
6. **Link to related docs**: Don't duplicate, link

### Common Runbooks to Create

**By service**:
- High error rate
- High latency
- Service down
- High memory usage
- Database connection errors

**By component**:
- Pod CrashLoopBackOff
- Deployment stuck
- Node not ready
- PVC not binding
- Ingress not routing

**By scenario**:
- Total outage response
- Data corruption response
- Security incident response
- Rollback procedure

---

## On-Call Best Practices

### Before Going On-Call

- [ ] Verify alert routing works (test page yourself)
- [ ] Review recent incidents and runbooks
- [ ] Know who to escalate to
- [ ] Have access to all required systems
- [ ] Laptop charged, internet working
- [ ] Phone volume on, notifications enabled

### During On-Call

**Respond promptly**:
- Acknowledge alerts within 5 minutes
- Post initial status within 15 minutes

**Communicate clearly**:
- Post updates regularly
- Be clear about what you're doing
- Ask for help if stuck

**Stay calm**:
- Incidents are stressful but manageable
- Follow runbooks and procedures
- Focus on mitigation first, root cause later

**Document**:
- Keep timeline of actions
- Note what worked and what didn't
- Will be valuable for post-incident review

### After On-Call

**Handoff**:
- Brief incoming on-call on current issues
- Share any trends or concerns
- Update runbooks if needed

**Self-care**:
- Take breaks after stressful incidents
- Don't burn out
- It's okay to need help

---

## Quick Reference

### Severity Quick Decision

```
All users affected + critical functionality = P0
Many users affected + major functionality = P1
Some users affected + minor functionality = P2
Few/no users affected = P3
```

### Response Time SLA

| Severity | Response Time | Resolution Target |
|----------|---------------|-------------------|
| P0 | 5 minutes | 1-2 hours |
| P1 | 15 minutes | 4-8 hours |
| P2 | 1 hour | 24 hours |
| P3 | 4 hours | 7 days |

### Essential Commands

```bash
# Check pod status
kubectl get pods -n <namespace>

# Check recent events
kubectl get events -n <namespace> --sort-by='.lastTimestamp' | tail -20

# Check logs
kubectl logs -n <namespace> <pod> --tail=100

# Rollback deployment
kubectl rollout undo deployment/<name> -n <namespace>

# Scale deployment
kubectl scale deployment/<name> --replicas=<count> -n <namespace>

# Restart deployment
kubectl rollout restart deployment/<name> -n <namespace>
```

### Communication Templates

**Initial alert**:
```
@channel P1 INCIDENT: [Brief description]
Status: INVESTIGATING
IC: @<your-name>
Started: [timestamp]
```

**Update**:
```
UPDATE [timestamp]:
Status: MITIGATING
Impact: [current impact]
Action: [current action]
ETA: [next update time]
```

**Resolution**:
```
RESOLVED [timestamp]:
Duration: [duration]
Root cause: [brief description]
Follow-up: Post-incident review scheduled [date/time]
```

---

**Related Documentation**:
- Troubleshooting procedures: See troubleshooting.md
- Deployment and rollback: See deployment.md
- Monitoring and alerts: See monitoring.md
- Kubernetes operations: See kubernetes.md
