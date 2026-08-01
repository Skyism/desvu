---
topic: School
created: 2026-07-14
updated: 2026-08-01
tags: ["213", lab]
title: Malloc lab
---

# Malloc lab

## 2026-07-14
The implicit free list is fine until you measure it. Every `mm_malloc` walks the
whole heap, so throughput falls off a cliff at the trace with 100k operations.

Two things to try, in order:

- segregated fits, size classes by power of two
- boundary tags so coalescing is O(1) instead of a scan

## 2026-07-22
Segregated fits landed. Utilisation went **up**, not down, which I did not expect —
splitting a block from a tight size class wastes less than splitting from a general one.

Still losing points on the realloc trace. The obvious fix is to grow in place when the
next block is free, and I keep not doing it because the edge cases around the epilogue
header are fiddly. Related: [[systems-design-interviews|the interview thread]].

## 2026-07-30
Realloc-in-place done. 94/100.

The thing worth remembering is not the allocator, it's that I spent three days on the
data structure and twenty minutes on the thing that actually cost points. I do this
every time — see [[How I choose what to work on]].

## 2026-08-01
Wrote it up. The lesson generalises: measure before you optimise the thing you find interesting. See [[systems-design-interviews]] and [[Measuring before optimising]].

One more: the epilogue header edge case is the only part I could not explain out loud.

