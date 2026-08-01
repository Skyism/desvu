// Seed a throwaway vault for driving the Brain dump + Synthesis surfaces by hand.
// Every thread is written in exactly the shape `inbox_commit.py::apply_braindump` writes:
//   ---\ntopic:\ncreated:\nupdated:\ntags: [..]\n---\n\n# Title\n\n## DATE\nbody\n
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
if (!root) throw new Error('usage: node seed.mjs <vault-root>')

function write(rel, text) {
  const abs = path.join(root, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, text, 'utf8')
}

function thread({ topic, slug, title, created, updated, tags, blocks }) {
  const fm = [
    '---',
    `topic: ${topic}`,
    `created: ${created}`,
    `updated: ${updated}`,
    `tags: [${tags.join(', ')}]`,
    '---',
    '',
    `# ${title}`,
    '',
  ].join('\n')
  const body = blocks.map(([date, text]) => `## ${date}\n${text.trim()}\n`).join('\n')
  write(`Brain Dump/${topic}/${slug}.md`, `${fm}\n${body}`)
}

// -- School -----------------------------------------------------------------
thread({
  topic: 'School',
  slug: 'malloc-lab',
  title: 'Malloc lab',
  created: '2026-07-14',
  updated: '2026-07-30',
  tags: ['213', 'lab'],
  blocks: [
    [
      '2026-07-14',
      `The implicit free list is fine until you measure it. Every \`mm_malloc\` walks the
whole heap, so throughput falls off a cliff at the trace with 100k operations.

Two things to try, in order:

- segregated fits, size classes by power of two
- boundary tags so coalescing is O(1) instead of a scan`,
    ],
    [
      '2026-07-22',
      `Segregated fits landed. Utilisation went **up**, not down, which I did not expect —
splitting a block from a tight size class wastes less than splitting from a general one.

Still losing points on the realloc trace. The obvious fix is to grow in place when the
next block is free, and I keep not doing it because the edge cases around the epilogue
header are fiddly. Related: [[systems-design-interviews|the interview thread]].`,
    ],
    [
      '2026-07-30',
      `Realloc-in-place done. 94/100.

The thing worth remembering is not the allocator, it's that I spent three days on the
data structure and twenty minutes on the thing that actually cost points. I do this
every time — see [[How I choose what to work on]].`,
    ],
  ],
})

thread({
  topic: 'School',
  slug: 'approximation-algorithms',
  title: 'Approximation algorithms',
  created: '2026-07-19',
  updated: '2026-07-19',
  tags: ['451'],
  blocks: [
    [
      '2026-07-19',
      `The 2-approximation for vertex cover is embarrassing in how simple it is: take any
maximal matching, return both endpoints of every edge in it.

> Any vertex cover must contain at least one endpoint of every matched edge, so OPT ≥ |M|,
> and we returned 2|M|.

That's the whole proof. I want more of these — the ones where the bound falls out of
what you already built rather than out of a clever charging argument.`,
    ],
  ],
})

// -- Recruiting -------------------------------------------------------------
thread({
  topic: 'Recruiting',
  slug: 'systems-design-interviews',
  title: 'Systems design interviews',
  created: '2026-07-12',
  updated: '2026-08-01',
  tags: ['interviews', 'systems-design'],
  blocks: [
    [
      '2026-07-12',
      `Start from the read path, not the write path. Every mock I've done that went badly
started with me designing a schema.

The read path forces the questions that matter: how many, how fresh, how tolerant of
being wrong.`,
    ],
    [
      '2026-07-27',
      `Read [[2026-07-28-ddia-ch4|DDIA ch.4]] on encoding and evolution. The framing I want
to steal: *schema evolution is a compatibility problem in two directions at once*, and
almost every answer I've given about migrations only handled one of them.

1. backward — new code reads old data
2. forward — old code reads new data

The second is the one people forget, and it's the one that bites during a rolling deploy.`,
    ],
    [
      '2026-08-01',
      `Mock with Priya. Went fine until she asked what happens when the cache and the
database disagree, and I said "we'd invalidate" as though that were a mechanism rather
than a wish.

To fix before the Ramp loop:

- [x] read the DDIA chapter on replication
- [ ] be able to say what "invalidate" costs, concretely
- [ ] one worked example of read-through vs write-through, out loud, under five minutes`,
    ],
  ],
})

thread({
  topic: 'Recruiting',
  slug: 'jane-street-loop',
  title: 'Jane Street loop',
  created: '2026-07-25',
  updated: '2026-07-26',
  tags: ['interviews'],
  blocks: [
    [
      '2026-07-25',
      `Phone screen scheduled. The prep everyone recommends is mental maths drills, which I
suspect is the visible part of the thing rather than the thing.`,
    ],
    [
      '2026-07-26',
      `Talked to someone who works there. The advice was: they are watching how you handle
being wrong in front of a stranger, not whether you are fast.

Which is, annoyingly, the same skill as preparing for a mock and the same skill
as the mock I flubbed. Same ground as [[systems-design-interviews]].`,
    ],
  ],
})

// -- Projects ---------------------------------------------------------------
thread({
  topic: 'Projects',
  slug: 'des-vu',
  title: 'Dès vu',
  created: '2026-07-20',
  updated: '2026-08-01',
  tags: ['pkm', 'obsidian'],
  blocks: [
    [
      '2026-07-20',
      `The thing that kills every second brain I've built is that it's write-only. You put
things in and nothing comes back out, so eventually you stop putting things in.

So: the weekly synthesis is not a feature, it's the whole argument. Everything else is
plumbing that makes the synthesis possible.`,
    ],
    [
      '2026-07-31',
      `Capture has to be off-device. If logging a thought requires opening a laptop, the
thought is gone. Telegram → \`Inbox/\` → \`/sort-inbox\` is three moving parts but only
the first one is in the critical path of my attention.

Sketch of the bot flow is here: ![[Attachments/capture-flow.png]]`,
    ],
    [
      '2026-08-01',
      `Six inputs, and only one of them is allowed to be slow.

| input | latency that matters | where it lands |
|---|---:|---|
| a thought | seconds | \`Inbox/\` |
| a purchase | seconds | \`data/finance.json\` |
| a link | minutes | \`Library/\` |
| the weekly write-up | days | \`Synthesis/\` |

> The synthesis is allowed to take a week because nobody is standing there waiting for it.
> Everything above it is in the path of a thought I will otherwise lose.

Related: [[why-i-abandon-books]].`,
    ],
  ],
})

// -- Personal ---------------------------------------------------------------
thread({
  topic: 'Personal',
  slug: 'sleep-and-lifting',
  title: 'Sleep and lifting',
  created: '2026-07-08',
  updated: '2026-07-29',
  tags: ['health'],
  blocks: [
    [
      '2026-07-08',
      `Noticing that the days I rate highest are almost always days I lifted, and I keep
assuming the lifting causes the rating. It might be the other way round.`,
    ],
    [
      '2026-07-29',
      `Three weeks of data and the pattern holds but the direction still isn't clear. What
would settle it is lifting on a day that already started badly, which I have never once
managed to do.`,
    ],
  ],
})

// -- Ideas ------------------------------------------------------------------
thread({
  topic: 'Ideas',
  slug: 'small-tools',
  title: 'Small tools',
  created: '2026-07-11',
  updated: '2026-07-11',
  tags: [],
  blocks: [
    [
      '2026-07-11',
      `A running list. Nothing here is a commitment.

- a CLI that tells you which of your open tabs you have had open for over a week
- a thing that reads my git history and writes the standup I never write
- \`grep\` for my own handwriting, via the scanner`,
    ],
  ],
})

// -- A topic the sort skill invented, beyond the seeded five ----------------
thread({
  topic: 'Reading',
  slug: 'why-i-abandon-books',
  title: 'Why I abandon books',
  created: '2026-07-24',
  updated: '2026-07-24',
  tags: ['reading'],
  blocks: [
    [
      '2026-07-24',
      `Always around page 60. Long enough to have paid for it, short enough that the plot
has not started.

I think the actual mechanism is that I read to have read, and page 60 is where that
stops working. Compare [[des-vu|Dès vu]] — same failure, different object.`,
    ],
  ],
})

// -- Library (so a wikilink into it resolves) --------------------------------
write(
  'Library/2026-07-28-ddia-ch4.md',
  `---
title: Designing Data-Intensive Applications, ch.4
url: https://example.com/ddia-ch4
type: article
status: reading
source: example.com
tags: [distributed-systems, encoding]
estimated_minutes: 34
saved: 2026-07-28
archived: false
---

Encoding and evolution: how data outlives the code that wrote it.

## Notes
The two-directional compatibility framing is the useful part.
`
)

// -- Synthesis ---------------------------------------------------------------
write(
  'Synthesis/2026-W31.md',
  `---
week: 2026-W31
generated: 2026-08-02
---

You spent this week on allocators and on being wrong out loud, and those turned out to be
the same week.

## What you thought about

Three of the seven threads you touched are about the gap between preparing and performing.
[[malloc-lab]] ends with you noticing that you spent three days on the data structure and
twenty minutes on the thing that cost points. [[systems-design-interviews]] ends with you
saying "we'd invalidate" and hearing yourself say it. [[jane-street-loop]] records someone
telling you outright that the loop is a test of handling being wrong.

You wrote that observation down three times in six days without connecting them.

## What you said you'd do

| said | where | state |
|---|---|---|
| read the DDIA chapter on replication | [[systems-design-interviews]] | done |
| say what "invalidate" costs, concretely | [[systems-design-interviews]] | open |
| lift on a day that started badly | [[sleep-and-lifting]] | never once |

## Across the trackers

Every day you rated 5 or higher this week had a workout on it, and every workout day was
a day you also closed at least one recruiting task. That is three data points and not a
finding, but it is the third week it has held — [[2026-W30]] said the same thing with
different numbers.

Coffee is 31% of discretionary spend, up from 22%.

## The one that surprised me

You abandon books at page 60 because you "read to have read" — [[why-i-abandon-books]].
You are, this week, reading [[2026-07-28-ddia-ch4|DDIA ch.4]] for a loop rather than for
itself. Worth watching whether it survives page 60.

> New topic this week: **Reading**. Created by the sorter on 24 July.
`
)

// -- Settings ----------------------------------------------------------------
write(
  'data/settings.json',
  JSON.stringify(
    {
      finance: {
        categories: [
          { name: 'Groceries', limit: 250 },
          { name: 'Coffee', limit: 60 },
        ],
        currency: 'USD',
        month_starts_on: 1,
      },
      nutrition: { calorie_target: null, protein_target_g: null, show_targets: false },
      todos: { default_priority: 2, default_estimate_minutes: 30 },
      library: { auto_archive_days: 30 },
      synthesis: { journal_access: 'full' },
    },
    null,
    2
  ) + '\n'
)

for (const empty of ['Inbox', 'Journal', 'Attachments']) {
  mkdirSync(path.join(root, empty), { recursive: true })
}

console.log('seeded', root)
