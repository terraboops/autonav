---
name: ask-peanut-nav
description: Query peanut-nav navigator about Knowledge navigator for Peanut Nav. Use when user asks to "ask peanut-nav" or needs information from this knowledge base.
---

# Ask peanut-nav

Query the **peanut-nav** navigator for information.

**Navigator Location**: `/Users/terra/Developer/autonav/peanut-nav`

Knowledge navigator for Peanut Nav




## Identity Protocol

When querying this navigator, Claude Code should explicitly identify itself as the requester. This enables bidirectional identity affirmation and helps the navigator maintain context awareness.

**Example**:
```bash
autonav query "/Users/terra/Developer/autonav/peanut-nav" "Claude Code here, asking: How do I deploy?"
```

## How to Use

Simply use `autonav query` to ask questions:

```bash
autonav query "/Users/terra/Developer/autonav/peanut-nav" "your question here"
```

The navigator will provide grounded answers with sources from its knowledge base.

## What This Navigator Knows

This navigator specializes in its configured domain and follows strict grounding rules:
- Always cites sources from the knowledge base
- Never invents information
- Acknowledges uncertainty with confidence scores
- Only references files that actually exist
