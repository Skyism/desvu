---
topic: School
created: 2026-07-19
updated: 2026-08-01
tags: ["451"]
---

# Approximation algorithms

## 2026-07-19
The 2-approximation for vertex cover is embarrassing in how simple it is: take any
maximal matching, return both endpoints of every edge in it.

> Any vertex cover must contain at least one endpoint of every matched edge, so OPT ≥ |M|,
> and we returned 2|M|.

That's the whole proof. I want more of these — the ones where the bound falls out of
what you already built rather than out of a clever charging argument.

## 2026-08-01
Grew it in place. The epilogue header case was the whole difficulty.
