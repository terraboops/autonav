# Platform Engineering Pack - Interview Guide

## Purpose

Guide the interview to customize this navigator for the user's specific platform engineering environment and needs.

## Key Topics to Explore

### 1. Use Case

Understand how they'll primarily use this navigator:
- **On-call reference**: Quick answers during incidents and troubleshooting
- **Team onboarding**: Getting new platform engineers up to speed
- **Personal learning**: Building knowledge and skills
- **Day-to-day operations**: Regular platform work and maintenance

*Multiple use cases are common - understand the primary focus.*

### 2. Environment

Learn about their specific infrastructure:
- **Cloud Provider**: AWS, GCP, Azure, on-prem, or multi-cloud?
- **Kubernetes**: EKS, GKE, AKS, OpenShift, vanilla K8s? Or not using K8s?
- **Monitoring Stack**: Prometheus/Grafana, Datadog, New Relic, CloudWatch, or something else?

*This shapes how troubleshooting advice and examples are given.*

### 3. Team Context

Understand their organizational situation:
- **Team size**: Solo, small team (2-5), medium (5-15), or large organization?
- **Responsibilities**: Infrastructure, platform services, SRE, DevOps, or mixed?
- **Current challenges**: What problems are they trying to solve?
- **Goals**: What do they want this navigator to help them achieve?

*Calibrates communication style and scope of advice.*

### 4. Experience Level

Gauge their platform engineering background:
- **Beginner**: New to platform engineering, needs foundational explanations
- **Intermediate**: Knows the basics, looking for best practices and deeper knowledge
- **Expert**: Deep experience, wants efficiency, edge cases, and advanced patterns

*Adjusts technical depth and amount of context provided.*

### 5. Autonomy Preference

Clarify how autonomous the navigator should be:
- **Proactive**: Create runbooks, incident notes, and documentation automatically when relevant
- **Ask first**: Suggest documentation but ask before creating or modifying files
- **Conservative**: Only create files when explicitly requested

*Sets self-organization behavior in CLAUDE.md.*

## Interview Approach

1. **Start with use case** - Sets the overall context for the conversation
2. **Ask about environment** - 2-3 quick questions about cloud/K8s/monitoring
3. **Explore team context** - Understand their situation and goals
4. **Gauge experience** - Adjust how you'll communicate going forward
5. **Clarify autonomy** - Important for self-organization rules

Keep it conversational - don't make it feel like a form. You can combine related questions naturally.

## CLAUDE.md Customizations

Based on interview responses, customize the generated CLAUDE.md to include:

- **Environment context**: "This navigator operates in an AWS EKS environment with Prometheus/Grafana monitoring"
- **Team scope**: Responsibilities and typical workflows
- **Communication style**: Adjusted for experience level
- **Self-organization rules**: Match their autonomy preference
- **Focus areas**: Prioritize based on their stated challenges and goals

## Example Opening

> "I see you're setting up a platform engineering navigator. To make this as useful as possible, I'd like to understand your environment and how you'll use it. First, what's your primary use case - will this mainly be for on-call support, team onboarding, personal learning, or day-to-day operations work?"
