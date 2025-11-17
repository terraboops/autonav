# Platform Engineering Knowledge Pack - Test Questions

**Version**: 0.1.0
**Purpose**: Validate that the knowledge pack can accurately answer common platform engineering questions

---

## Test Question Categories

1. **Lookup**: Simple fact retrieval from single source
2. **Multi-source**: Requires synthesizing information from multiple files
3. **Troubleshooting**: Diagnostic procedures and problem-solving
4. **Procedural**: Step-by-step how-to questions
5. **Architecture**: Design decisions and trade-offs
6. **Configuration**: Config management and GitOps

---

## Test Questions and Expected Responses

### 1. Lookup Questions

#### Q1: What are the incident severity levels?

**Expected Answer**:
- Should cite incident-response.md → "Incident Severity Levels"
- List P0, P1, P2, P3 with definitions
- Include response times for each level

**Key Points to Cover**:
- P0: Critical (complete outage, 5 min response)
- P1: High (major degradation, 15 min response)
- P2: Medium (partial impairment, 1 hour response)
- P3: Low (minor issue, 4 hour response)

**Success Criteria**:
- ✅ Accurate severity definitions
- ✅ Correct response times
- ✅ Citation to incident-response.md
- ✅ No hallucinated information

---

#### Q2: What kubectl command shows recent events in a namespace?

**Expected Answer**:
- Should cite kubernetes.md → "Essential kubectl Commands" or "Common Workflows"
- Provide exact command: `kubectl get events -n <namespace> --sort-by='.lastTimestamp'`

**Success Criteria**:
- ✅ Correct command syntax
- ✅ Includes sorting option
- ✅ Citation to kubernetes.md

---

### 2. Multi-Source Questions

#### Q3: How do I safely deploy a new version of my service?

**Expected Answer**:
- Should cite deployment.md → "Deployment Strategies"
- Mention canary or blue-green deployment for safety
- Reference monitoring.md for metrics to watch
- Include deployment.md → "Pre-Deployment Checklist"

**Key Points to Cover**:
1. Choose deployment strategy (canary recommended for safety)
2. Pre-deployment checklist
3. Deploy to small percentage first
4. Monitor key metrics (error rate, latency)
5. Gradually increase traffic
6. Rollback plan ready

**Success Criteria**:
- ✅ Recommends safe strategy (not just rolling update)
- ✅ Includes monitoring requirements
- ✅ Mentions rollback plan
- ✅ Cites multiple sources (deployment.md + monitoring.md)

---

#### Q4: My pod is stuck in CrashLoopBackOff. How do I debug it?

**Expected Answer**:
- Should cite kubernetes.md → "Troubleshooting Pod States" → "CrashLoopBackOff"
- Reference troubleshooting.md → "Container Failures"
- Provide diagnostic steps

**Key Steps to Include**:
1. Check logs: `kubectl logs <pod> --previous`
2. Check exit code: `kubectl describe pod <pod>`
3. Common causes: OOMKilled (137), app error (1), config missing
4. Resolution based on cause

**Success Criteria**:
- ✅ Correct diagnostic commands
- ✅ Mentions checking previous logs
- ✅ Lists common causes
- ✅ Cites kubernetes.md and/or troubleshooting.md

---

### 3. Troubleshooting Questions

#### Q5: Production API has high error rate (45%). What do I do?

**Expected Answer**:
- Should cite incident-response.md → "P0/P1 Incident Response"
- Reference troubleshooting.md → "Application Errors" → "High Error Rate"
- Provide immediate action steps

**Key Steps to Include**:
1. Declare P1 incident
2. Check recent changes (deployment, config)
3. Check logs for errors
4. If recent deployment: rollback immediately
5. Monitor metrics for improvement
6. Post-incident review after resolution

**Success Criteria**:
- ✅ Recognizes as P1 incident
- ✅ Prioritizes mitigation (stop the bleeding)
- ✅ Includes rollback in response
- ✅ Cites incident-response.md

---

#### Q6: My Prometheus alerts aren't firing. How do I troubleshoot?

**Expected Answer**:
- Should cite monitoring.md → "Troubleshooting Monitoring" → "Alerts Not Firing"
- Provide systematic diagnostic approach

**Key Steps to Include**:
1. Verify PrometheusRule exists
2. Check alert in Prometheus UI (Alerts section)
3. Check Alertmanager connection
4. Test alert expression (may never evaluate to true)
5. Check Alertmanager routing config

**Success Criteria**:
- ✅ Systematic troubleshooting steps
- ✅ Specific commands to check each component
- ✅ Cites monitoring.md

---

### 4. Procedural Questions

#### Q7: Walk me through setting up GitOps with Argo CD

**Expected Answer**:
- Should cite configuration.md → "GitOps Workflow" → "Argo CD Setup"
- Provide step-by-step installation and configuration

**Key Steps to Include**:
1. Install Argo CD in cluster
2. Access Argo CD UI
3. Create Application resource pointing to Git repo
4. Configure sync policy (manual or automated)
5. Verify deployment

**Success Criteria**:
- ✅ Installation commands provided
- ✅ Application manifest example included
- ✅ Explains sync policy options
- ✅ Cites configuration.md

---

#### Q8: How do I create a canary deployment that gradually increases from 10% to 100%?

**Expected Answer**:
- Should cite deployment.md → "Deployment Strategies" → "Canary Deployment"
- Provide step-by-step procedure from deployment.md → "Canary Deployment Procedure"

**Key Steps to Include**:
1. Deploy canary (10%)
2. Monitor metrics (15-30 min)
3. Increase to 25%, monitor
4. Increase to 50%, monitor
5. Promote to 100%
6. At each stage: check error rate, latency, logs

**Success Criteria**:
- ✅ Gradual rollout percentages
- ✅ Monitoring between stages
- ✅ Specific commands for scaling
- ✅ Cites deployment.md

---

### 5. Architecture Questions

#### Q9: Should I use a service mesh for my platform?

**Expected Answer**:
- Should cite architecture.md → "Service Mesh Considerations"
- Provide decision framework (not yes/no)
- Discuss trade-offs

**Key Points to Cover**:
1. Consider if: Many services (10+), need advanced routing, require mTLS
2. Skip if: Few services, simple needs, team not ready
3. Pros: Security, observability, traffic control
4. Cons: Complexity, performance overhead, resource usage

**Success Criteria**:
- ✅ Not prescriptive (depends on context)
- ✅ Lists criteria for decision
- ✅ Discusses trade-offs
- ✅ Cites architecture.md

---

#### Q10: What's the difference between Ingress and LoadBalancer services?

**Expected Answer**:
- Should cite architecture.md → "Networking Patterns" → "Ingress vs LoadBalancer vs NodePort"
- Explain use cases for each

**Key Points to Cover**:
- LoadBalancer: One load balancer per service (expensive at scale)
- Ingress: Single load balancer for many services, HTTP/HTTPS routing
- Ingress is more common for production HTTP services

**Success Criteria**:
- ✅ Clear distinction between types
- ✅ Use case recommendations
- ✅ Cites architecture.md

---

### 6. Configuration Questions

#### Q11: How do I manage secrets in GitOps without committing them to Git?

**Expected Answer**:
- Should cite configuration.md → "Secret Management"
- Provide multiple options

**Key Solutions to Cover**:
1. External Secrets Operator (recommended)
2. Sealed Secrets
3. SOPS
Each with brief explanation

**Success Criteria**:
- ✅ Multiple solutions provided
- ✅ Explains why not to commit secrets
- ✅ Recommends approach (External Secrets for most cases)
- ✅ Cites configuration.md

---

#### Q12: What's the recommended GitOps repository structure?

**Expected Answer**:
- Should cite configuration.md → "GitOps Workflow" → "Repository Structure"
- Provide options with trade-offs

**Key Points to Cover**:
- Option 1: Monorepo (single repo, overlays for environments)
- Option 2: Repo per environment
- Option 3: Repo per app
- Recommendation: Start with monorepo

**Success Criteria**:
- ✅ Multiple options presented
- ✅ Trade-offs discussed
- ✅ Recommendation provided
- ✅ Cites configuration.md

---

## Edge Case Questions

These questions test the navigator's ability to recognize limitations and handle uncertainty.

### E1: How do I optimize my MongoDB queries?

**Expected Answer**:
- Should recognize this is **out of scope** (specialized database domain)
- Should cite system-configuration.md → "What to Defer"
- Should suggest referring to database specialists or MongoDB documentation

**Success Criteria**:
- ✅ Recognizes as out of scope
- ✅ Doesn't make up information
- ✅ Suggests appropriate escalation
- ✅ Cites system-configuration.md if possible

---

### E2: How do I configure Istio mTLS for external services?

**Expected Answer**:
- Should acknowledge this is at the edge of the knowledge pack
- May provide basic info from architecture.md (Istio overview)
- Should indicate that detailed Istio configuration requires vendor docs
- Should not hallucinate Istio-specific commands not in knowledge pack

**Success Criteria**:
- ✅ Provides available context from architecture.md
- ✅ Acknowledges need for detailed vendor documentation
- ✅ Doesn't make up Istio commands
- ✅ Medium/low confidence indicated

---

## Validation Criteria

### For Each Test Question

**Accuracy** (most important):
- [ ] Answer is factually correct
- [ ] Information comes from knowledge pack (not hallucinated)
- [ ] Commands/configs match those in knowledge files

**Citations** (critical):
- [ ] Cites specific file(s)
- [ ] Cites specific section(s) within files
- [ ] Citations are accurate (section actually exists)

**Completeness**:
- [ ] Covers key points for the question
- [ ] Provides actionable guidance
- [ ] Includes relevant commands or examples

**Clarity**:
- [ ] Answer is well-structured
- [ ] Easy to follow
- [ ] Prioritizes most important information

**Confidence Calibration**:
- [ ] Acknowledges when information is partial
- [ ] Defers out-of-scope questions appropriately
- [ ] Doesn't overstate certainty

---

## Testing Procedure

### Manual Testing

1. **Ask each question** to the navigator
2. **Record the response**
3. **Verify accuracy**:
   - Check citations are correct
   - Verify information matches source files
   - Confirm no hallucinated details
4. **Score**: Pass/Fail for each question
5. **Document issues** for improvement

### Success Threshold

**Target**: 10/12 main questions pass (83%)
- All citations must be accurate (no hallucinations)
- Edge cases should handle uncertainty appropriately

### Iteration

If questions fail:
1. **Review response** - what went wrong?
2. **Check knowledge files** - is information present and clear?
3. **Update system-configuration.md** - improve grounding rules if needed
4. **Retest** after improvements

---

## Additional Test Scenarios

### Realistic User Questions

These mirror how platform engineers actually ask questions:

1. "Pod keeps restarting, help!"
2. "How do I rollback this deployment?"
3. "Need to set up monitoring for new service"
4. "What's the incident process for a P0?"
5. "Best practice for storing database passwords?"
6. "Why is my service unreachable?"
7. "How to do zero-downtime deployments?"
8. "What metrics should I alert on?"
9. "Difference between StatefulSet and Deployment?"
10. "How do I debug high latency?"

### Multi-Turn Conversations

Test follow-up questions:
1. User: "How do I deploy safely?"
   Navigator: [Provides canary deployment info]
2. User: "What metrics should I monitor during canary?"
   Navigator: [Should reference monitoring.md metrics]
3. User: "The canary is showing errors, what now?"
   Navigator: [Should reference rollback procedures]

---

## Notes for Navigator Testing

- Navigator should **always cite sources**
- Navigator should **never invent file paths or sections**
- Navigator should **acknowledge uncertainty** when appropriate
- Navigator should **defer to specialists** for out-of-scope topics
- Navigator should **prioritize safety** (rollback, monitoring, validation)

---

## Test Results Template

```
Test Date: YYYY-MM-DD
Navigator Version: X.X.X
Knowledge Pack Version: 0.1.0

Results:
- Q1: ✅ Pass - Accurate citations, complete answer
- Q2: ✅ Pass - Correct command provided
- Q3: ✅ Pass - Multi-source synthesis worked well
- Q4: ✅ Pass - Troubleshooting steps accurate
- Q5: ✅ Pass - Recognized as P1, provided immediate actions
- Q6: ❌ Fail - Missing citation to monitoring.md
- Q7: ✅ Pass - Clear step-by-step procedure
- Q8: ✅ Pass - Canary rollout percentages correct
- Q9: ✅ Pass - Good trade-off analysis
- Q10: ✅ Pass - Clear distinction between types
- Q11: ✅ Pass - Multiple solutions with recommendations
- Q12: ✅ Pass - Repository structures explained

Edge Cases:
- E1: ✅ Pass - Correctly deferred to database specialists
- E2: ✅ Pass - Acknowledged limitations, didn't hallucinate

Overall: 11/12 (92%) - Exceeds target
Issues: Q6 needs citation improvement
```
