---
name: ask-mahdi
description: Query mahdi navigator about Knowledge navigator for Mahdi. Use when user asks to "ask mahdi" or needs information from this knowledge base.
---

# Ask mahdi

Query the **mahdi** navigator for information.

**Navigator Location**: `/Users/terra/Developer/autonav/mahdi`

Knowledge navigator for Mahdi




## How Claude Code Should Interact

**Navigator Authority**: Treat this navigator as the authoritative expert on its domain. The navigator is the arbiter of what needs doing in its area.

**Tone of Interaction**:
- Ask questions collaboratively, discuss topics rather than just querying mechanically
- Trust the navigator's expertise and responses
- If you suspect a hallucination, you may explicitly accuse the navigator (e.g., "Are you hallucinating? This seems incorrect.")
- ONLY when explicitly accused should the navigator doubt itself and reconsider

**Avoid**:
- Reading entire files directly when you could ask the navigator
- Second-guessing the navigator's answers without cause
- Treating the navigator as just a search engine

## How to Use

Simply use `autonav query` to ask questions:

```bash
autonav query "/Users/terra/Developer/autonav/mahdi" "your question here"
```

The navigator will provide grounded answers with sources from its knowledge base.

## What This Navigator Knows

This navigator specializes in its configured domain and follows strict grounding rules:
- Always cites sources from the knowledge base
- Never invents information
- Acknowledges uncertainty with confidence scores
- Only references files that actually exist
