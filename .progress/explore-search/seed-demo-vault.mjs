/**
 * Seed a throwaway Dès vu vault for driving the Explore + search UI by hand.
 * Never points at ~/Documents/Dès vu — that holds live personal data.
 *
 *   node seed-vault.mjs <vaultRoot>
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.argv[2]
if (!root || root.includes('Documents')) {
  throw new Error('refusing to seed anywhere near the real vault')
}

await rm(root, { recursive: true, force: true })
for (const dir of ['data', 'Library', 'Journal', 'Brain Dump/School', 'Synthesis', 'Inbox', 'Attachments']) {
  await mkdir(path.join(root, dir), { recursive: true })
}

const TODAY = new Date()
const day = (offset) => {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ms = (offset) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + offset, 9).getTime()

const write = (rel, text) => writeFile(path.join(root, rel), text, 'utf8')
const writeJson = (rel, value) => write(rel, `${JSON.stringify(value, null, 2)}\n`)

// --------------------------------------------------------------------------
// Library — every type, every status, a spread of ages, three past the window
// --------------------------------------------------------------------------
const library = [
  {
    slug: 'ddia-ch5-replication',
    saved: day(-2),
    front: {
      title: 'Designing Data-Intensive Applications, ch.5 — Replication',
      url: 'https://example.com/ddia-ch5',
      type: 'article',
      status: 'unread',
      source: 'news.ycombinator.com',
      tags: '[distributed-systems, databases]',
      estimated_minutes: 12,
    },
    body: 'Single-leader, multi-leader and leaderless replication, and what each one costs you when the network splits. The chapter that makes distributed systems feel less like folklore.\n\n## Notes\nRead alongside [[15-440]].',
  },
  {
    slug: 'attention-is-all-you-need',
    saved: day(-3),
    front: {
      title: 'Attention Is All You Need',
      url: 'https://arxiv.org/abs/1706.03762',
      type: 'paper',
      status: 'reading',
      source: 'arxiv.org',
      tags: '[ml, transformers]',
      estimated_minutes: 55,
    },
    body: 'The transformer paper. Self-attention replaces recurrence entirely, and the whole architecture fits on one page of pseudocode.',
  },
  {
    slug: 'crafting-interpreters-scanning',
    saved: day(-4),
    front: {
      title: 'Crafting Interpreters — Scanning',
      url: 'https://craftinginterpreters.com/scanning.html',
      type: 'article',
      status: 'unread',
      source: 'craftinginterpreters.com',
      tags: '[compilers]',
      estimated_minutes: 18,
    },
    body: 'Turning a flat string of characters into tokens, one regular language at a time.',
  },
  {
    slug: 'strange-loop-simple-made-easy',
    saved: day(-5),
    front: {
      title: 'Simple Made Easy',
      url: 'https://www.youtube.com/watch?v=SxdOUGdseq4',
      type: 'video',
      status: 'unread',
      source: 'youtube.com',
      tags: '[design, talks]',
      estimated_minutes: 62,
    },
    body: 'Hickey on the difference between simple and easy, and why complecting things is the real cost in software systems.',
  },
  {
    slug: 'systems-design-interview-primer',
    saved: day(-7),
    front: {
      title: 'A systems design interview primer',
      url: 'https://example.com/primer',
      type: 'article',
      status: 'done',
      source: 'example.com',
      tags: '[recruiting, interviews]',
      estimated_minutes: 25,
    },
    body: 'What interviewers are actually listening for when they ask you to design a URL shortener.',
  },
  {
    slug: 'raft-in-search-of-an-understandable-consensus',
    saved: day(-12),
    front: {
      title: 'In Search of an Understandable Consensus Algorithm (Raft)',
      url: 'https://raft.github.io/raft.pdf',
      type: 'paper',
      status: 'unread',
      source: 'raft.github.io',
      tags: '[distributed-systems, consensus]',
      estimated_minutes: 90,
    },
    body: 'Consensus, decomposed into leader election, log replication and safety so that it can actually be taught.',
  },
  {
    slug: '15-440-lecture-notes',
    saved: day(-17),
    front: {
      title: '15-440 lecture notes — distributed systems',
      type: 'other',
      status: 'reading',
      tags: '[school, distributed-systems]',
      estimated_minutes: 30,
    },
    body: 'My own running notes from the distributed systems lectures.',
  },
  {
    slug: 'a-note-with-no-estimate',
    saved: day(-6),
    front: {
      title: 'Something I saved before it could be sized',
      url: 'https://example.com/unsized',
      type: 'article',
      status: 'unread',
      source: 'example.com',
      tags: '[misc]',
    },
    body: 'The fetch worked but the estimate did not. It should say so plainly rather than pretending to be zero minutes.',
  },
  {
    slug: 'a-four-minute-link',
    saved: day(-1),
    front: {
      title: 'The smallest useful thing about vim registers',
      url: 'https://example.com/registers',
      type: 'article',
      status: 'unread',
      source: 'example.com',
      tags: '[tools]',
      estimated_minutes: 4,
    },
    body: 'Four minutes of vim registers, which is about four minutes more than most people know.',
  },
  // --- three past the 30-day window and still unread: auto-archive fodder ---
  {
    slug: 'the-log-what-every-engineer-should-know',
    saved: day(-42),
    front: {
      title: 'The Log: what every software engineer should know',
      url: 'https://example.com/the-log',
      type: 'article',
      status: 'unread',
      source: 'example.com',
      tags: '[distributed-systems, streaming]',
      estimated_minutes: 45,
    },
    body: 'The log as the fundamental abstraction behind replication, streaming and integration.',
  },
  {
    slug: 'a-long-talk-i-never-watched',
    saved: day(-50),
    front: {
      title: 'A long talk I never got round to',
      url: 'https://www.youtube.com/watch?v=example',
      type: 'video',
      status: 'unread',
      source: 'youtube.com',
      tags: '[talks]',
      estimated_minutes: 78,
    },
    body: 'Saved in a burst of enthusiasm on a Tuesday and never opened since.',
  },
  {
    slug: 'dynamo-amazons-highly-available-key-value-store',
    saved: day(-57),
    front: {
      title: "Dynamo: Amazon's highly available key-value store",
      url: 'https://example.com/dynamo',
      type: 'paper',
      status: 'unread',
      source: 'example.com',
      tags: '[distributed-systems, databases]',
      estimated_minutes: 65,
    },
    body: 'Eventual consistency, vector clocks and the operational reality of running a quorum store.',
  },
  // --- already set aside before this session, and the only note mentioning Paxos ---
  {
    slug: 'paxos-made-simple',
    saved: day(-63),
    front: {
      title: 'Paxos made simple',
      url: 'https://example.com/paxos',
      type: 'paper',
      status: 'unread',
      source: 'example.com',
      tags: '[distributed-systems, consensus]',
      estimated_minutes: 40,
      archived: true,
    },
    body: 'Lamport, on the algorithm everyone cites and nobody implements from the paper. Set aside a while ago — still here, still findable.',
  },
]

for (const item of library) {
  const front = { archived: false, ...item.front, saved: item.saved }
  const order = ['title', 'url', 'type', 'status', 'source', 'tags', 'estimated_minutes', 'saved', 'archived']
  const lines = order
    .filter((key) => front[key] !== undefined)
    .map((key) => `${key}: ${front[key]}`)
  await write(`Library/${item.saved}-${item.slug}.md`, `---\n${lines.join('\n')}\n---\n\n${item.body}\n`)
}

// --------------------------------------------------------------------------
// Todos — open, done (the only note mentioning Stripe) and dropped
// --------------------------------------------------------------------------
const todo = (over) => ({
  id: over.id,
  text: over.text,
  category: over.category ?? 'school',
  priority: over.priority ?? 2,
  estimate_minutes: over.estimate_minutes ?? 30,
  actual_minutes: over.actual_minutes ?? null,
  due: over.due ?? null,
  status: over.status ?? 'open',
  recurrence: null,
  recurrence_parent: null,
  tags: over.tags ?? [],
  notes: over.notes ?? '',
  source: 'app',
  created_at: over.created_at ?? ms(-3),
  updated_at: over.updated_at ?? ms(-1),
  completed_at: over.completed_at ?? null,
})

await writeJson('data/todos.json', [
  todo({ id: 't1', text: '15-440 distributed systems project — checkpoint 2', due: day(0), estimate_minutes: 90, tags: ['systems'] }),
  todo({ id: 't2', text: 'Email professor about the systems reading', due: day(0), estimate_minutes: 10, category: 'school' }),
  todo({ id: 't3', text: 'Behavioural prep for Thursday', due: day(1), estimate_minutes: 45, category: 'recruiting' }),
  todo({
    id: 't4',
    text: 'Finish the Stripe OA writeup',
    category: 'recruiting',
    status: 'done',
    due: day(-4),
    actual_minutes: 75,
    completed_at: ms(-4),
    notes: 'Went long on the systems question.',
  }),
  todo({ id: 't5', text: 'Read the systems paper before recitation', status: 'dropped', due: day(-6) }),
])

// --------------------------------------------------------------------------
// The other trackers, so every search kind has something to find
// --------------------------------------------------------------------------
await writeJson('data/journal.json', [
  { id: 'j1', entry_date: day(0), rating: 5, gratitude_text: 'A quiet morning.', learned: 'Reading about distributed systems is easier after the lecture than before it.', mood_word: 'steady', created_at: ms(0), updated_at: ms(0) },
  { id: 'j2', entry_date: day(-1), rating: 4, learned: 'Systems design is mostly naming things.', created_at: ms(-1), updated_at: ms(-1) },
  { id: 'j3', entry_date: day(-2), rating: 6, created_at: ms(-2), updated_at: ms(-2) },
])
await writeJson('data/journal-streak.json', { longest: 44 })

await writeJson('data/meals.json', [
  { id: 'm1', date: day(0), meal: 'lunch', description: 'Burrito after the systems lecture', calories: 720, protein_g: 34, estimated: true, source: 'telegram', created_at: ms(0) },
  { id: 'm2', date: day(0), meal: 'breakfast', description: 'Oats and coffee', calories: null, protein_g: null, estimated: false, source: 'telegram', created_at: ms(0) },
])

await writeJson('data/workouts.json', [
  { id: 'w1', date: day(0), type: 'run', description: 'Easy run to clear my head after systems', duration_minutes: 32, source: 'telegram', created_at: ms(0) },
])

await writeJson('data/finance.json', {
  purchases: [
    { id: 'p1', date: day(0), amount: 4.25, category: 'coffee', description: 'Coffee before the systems lecture', source: 'telegram', created_at: ms(0) },
    { id: 'p2', date: day(-1), amount: 38.4, category: 'groceries', description: 'Weekly shop', source: 'app', created_at: ms(-1) },
  ],
})

await writeJson('data/settings.json', {
  finance: { categories: [{ name: 'coffee', limit: 40 }, { name: 'groceries', limit: 300 }], currency: 'USD', month_starts_on: 1 },
  nutrition: { calorie_target: 2400, protein_target_g: 150, show_targets: true },
  todos: { default_priority: 2, default_estimate_minutes: 30 },
  library: { auto_archive_days: 30 },
  synthesis: { journal_access: 'full' },
})

await write(
  'Brain Dump/School/distributed-systems.md',
  `---\ntopic: School\ncreated: ${day(-9)}\nupdated: ${day(-1)}\ntags: [systems, thinking]\n---\n\n## ${day(-9)}\nStarted a thread on distributed systems because the same confusion keeps coming back.\n\n## ${day(-1)}\nThe replication chapter answered it. Related: [[Designing Data-Intensive Applications, ch.5 — Replication]].\n`
)

await write(
  'Synthesis/2026-W31.md',
  `# Week 31\n\nMost of the week went to distributed systems: three of five journal entries mention it, the reading queue is now half systems papers, and the one dropped todo was a systems paper you did not get to.\n`
)

await write(`Inbox/${day(0)}.md`, `- [ ] 09:14 · telegram · https://example.com/something-to-sort\n`)

console.log(JSON.stringify({ root, libraryItems: library.length }, null, 2))
