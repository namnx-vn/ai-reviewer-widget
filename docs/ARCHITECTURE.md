# AI Reviewer Architecture

## Overview

AI Reviewer uses a layered review architecture.

```text
                    GitHub PR
                        │
                        ▼
                 Diff Collector
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
        AST        Architecture      AI
      Analysis        Rules        Reasoning
          │             │             │
          └─────────────┼─────────────┘
                        │
                        ▼
                  Review Engine
                        │
                        ▼
                  Review Result
                        │
                        ▼
                   GitHub PR
                     Comment
```