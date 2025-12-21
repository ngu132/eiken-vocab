import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onMount,
  Show,
} from 'solid-js'

type NumberMap = Record<string, number>

type Meaning = {
  class: string
  translation: string
  examplePhrase?: string
  examplePhraseTranslation?: string
  exampleSentence?: string
  exampleSentenceTranslation?: string
}

type MetadataItem = {
  word: string
  isPhrase: boolean
  isTypo?: boolean
  meanings: Meaning[]
  score?: NumberMap
  count?: NumberMap
  rank?: NumberMap
}

type MetadataRow = MetadataItem & {
  id: number
  primaryClass: string
  primaryTranslation: string
  sumCount: number
  maxCount: number
}

const GRADE_KEYS = ['1', 'pre1', '2', 'pre2', '3', '4', '5'] as const
type GradeKey = (typeof GRADE_KEYS)[number]

function safeJsonParse(line: string): MetadataItem | null {
  try {
    return JSON.parse(line) as MetadataItem
  } catch {
    return null
  }
}

function sumValues(map?: NumberMap): number {
  if (!map) return 0
  let total = 0
  for (const value of Object.values(map)) total += value
  return total
}

function maxValues(map?: NumberMap): number {
  if (!map) return 0
  let max = 0
  for (const value of Object.values(map)) max = Math.max(max, value)
  return max
}

function formatNumber(value: number | undefined, digits = 3): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toFixed(digits)
}

function getSortValue(
  row: MetadataRow,
  metric: 'count' | 'rank' | 'score',
  grade: GradeKey,
): number {
  if (metric === 'count') return row.count?.[grade] ?? 0
  if (metric === 'rank') return row.rank?.[grade] ?? Number.NEGATIVE_INFINITY
  return row.score?.[grade] ?? Number.NEGATIVE_INFINITY
}

function formatSortValue(
  value: number,
  metric: 'count' | 'rank' | 'score',
): string {
  if (!Number.isFinite(value)) return '-'
  if (metric === 'count') return String(Math.trunc(value))
  return value.toFixed(3)
}

function sanitizeTsvField(value: string): string {
  return value
    .replaceAll('\t', ' ')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .trim()
}

function getQuizletDefinition(row: MetadataRow): string {
  const meanings = Array.isArray(row.meanings) ? row.meanings : []
  const parts = meanings
    .map((m) => {
      const c = m.class ? `[${m.class}]` : ''
      const t = typeof m.translation === 'string' ? m.translation.trim() : ''
      return t ? `${c}${t}` : ''
    })
    .filter((s) => s.length > 0)

  if (parts.length === 0) return row.primaryTranslation

  // Deduplicate combined strings
  const seen = new Set<string>()
  const uniq: string[] = []
  for (const p of parts) {
    if (seen.has(p)) continue
    seen.add(p)
    uniq.push(p)
  }
  return uniq.join(' / ')
}

export default function MetadataViewer() {
  const [rows, setRows] = createSignal<MetadataRow[]>([])
  const [loading, setLoading] = createSignal(true)
  const [parsed, setParsed] = createSignal(0)
  const [total, setTotal] = createSignal(0)

  const [query, setQuery] = createSignal('')
  const [showWords, setShowWords] = createSignal(true)
  const [showPhrases, setShowPhrases] = createSignal(true)
  const [showTypos, setShowTypos] = createSignal(false)
  const [minCount, setMinCount] = createSignal(0)
  const [sortMetric, setSortMetric] = createSignal<'count' | 'rank' | 'score'>(
    'rank',
  )
  const [sortLevel, setSortLevel] = createSignal<GradeKey>('2')
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('desc')
  const [page, setPage] = createSignal(1)
  const [pageSize, setPageSize] = createSignal(50)
  const [selectedId, setSelectedId] = createSignal<number | null>(null)
  const [copyStatus, setCopyStatus] = createSignal<
    'idle' | 'copied' | 'failed'
  >('idle')

  onMount(async () => {
    setLoading(true)

    const url = new URL('./assets/metadata.jsonl', import.meta.url)
    let text: string
    try {
      const res = await fetch(url)
      if (!res.ok)
        throw new Error(`failed to fetch: ${res.status} ${res.statusText}`)
      text = await res.text()
    } catch (_err) {
      setLoading(false)
      return
    }

    const lines = text
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    setTotal(lines.length)
    setParsed(0)

    const parsedRows: MetadataRow[] = []
    let index = 0
    let _bad = 0
    let _typos = 0

    const parseChunk = () => {
      const chunkSize = 500
      const end = Math.min(lines.length, index + chunkSize)
      for (; index < end; index++) {
        const item = safeJsonParse(lines[index])
        if (!item || typeof item.word !== 'string') {
          _bad += 1
          continue
        }
        const isTypo = item.isTypo === true
        if (isTypo) _typos += 1

        const primaryMeaning = Array.isArray(item.meanings)
          ? item.meanings[0]
          : undefined
        parsedRows.push({
          ...item,
          id: index,
          primaryClass: primaryMeaning?.class ?? '-',
          primaryTranslation: primaryMeaning?.translation ?? '-',
          sumCount: sumValues(item.count),
          maxCount: maxValues(item.count),
        })
      }

      setParsed(index)

      if (index < lines.length) {
        setTimeout(parseChunk, 0)
        return
      }

      setRows(parsedRows)
      setLoading(false)
    }

    parseChunk()
  })

  createEffect(() => {
    query()
    showWords()
    showPhrases()
    showTypos()
    minCount()
    sortMetric()
    sortLevel()
    sortDir()
    setPage(1)
  })

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    const allowWords = showWords()
    const allowPhrases = showPhrases()
    const allowTypos = showTypos()
    const min = minCount()
    const level = sortLevel()
    const list = rows()

    return list.filter((row) => {
      if (!allowWords && !row.isPhrase) return false
      if (!allowPhrases && row.isPhrase) return false
      if (!allowTypos && row.isTypo) return false
      const countForLevel = row.count?.[level] ?? 0
      if (countForLevel < min) return false
      if (q.length === 0) return true
      return (
        row.word.toLowerCase().includes(q) ||
        row.meanings.some(
          (m) =>
            m.translation.toLowerCase().includes(q) ||
            m.class.toLowerCase().includes(q),
        )
      )
    })
  })

  const sorted = createMemo(() => {
    const metric = sortMetric()
    const level = sortLevel()
    const dir = sortDir()
    const list = filtered().slice()
    const mul = dir === 'asc' ? 1 : -1

    list.sort((a, b) => {
      const va = getSortValue(a, metric, level)
      const vb = getSortValue(b, metric, level)
      if (va !== vb) return (va - vb) * mul
      return a.word.localeCompare(b.word)
    })

    return list
  })

  const totalPages = createMemo(() =>
    Math.max(1, Math.ceil(sorted().length / pageSize())),
  )
  const pageRows = createMemo(() => {
    const size = pageSize()
    const start = (page() - 1) * size
    return sorted().slice(start, start + size)
  })

  createEffect(() => {
    const maxPage = totalPages()
    if (page() > maxPage) setPage(maxPage)
  })

  const selected = createMemo(() => {
    const id = selectedId()
    if (id === null) return null
    return rows().find((row) => row.id === id) ?? null
  })

  const copyQuizletTsv = async () => {
    const items = sorted()
    const lines = items.map((row) => {
      const term = sanitizeTsvField(row.word)
      const def = sanitizeTsvField(getQuizletDefinition(row))
      return `${term}\t${def}`
    })

    const tsv = `${lines.join('\n')}\n`

    try {
      await navigator.clipboard.writeText(tsv)
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 1500)
      return
    } catch {
      // fall through
    }

    try {
      const textarea = document.createElement('textarea')
      textarea.value = tsv
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const ok = document.execCommand('copy')
      textarea.remove()
      if (!ok) throw new Error('copy failed')
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 1500)
    } catch {
      setCopyStatus('failed')
      setTimeout(() => setCopyStatus('idle'), 2500)
    }
  }

  return (
    <div class="flex h-full flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Filters Bar */}
      <div class="z-20 shrink-0 border-b border-slate-200 bg-white px-6 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="mx-auto max-w-400">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Search and Checkboxes */}
            <div class="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
              <div class="relative flex-1 max-w-md">
                <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg
                    aria-hidden="true"
                    class="h-4 w-4 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  class="block w-full rounded-xl border-slate-200 bg-slate-50 pl-10 pr-3 py-2.5 text-sm ring-offset-white transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-700"
                  placeholder="Search word, translation, or class..."
                  value={query()}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                />
              </div>

              <div class="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-1 dark:bg-slate-800">
                <For
                  each={[
                    {
                      id: 'words',
                      label: 'Words',
                      get: showWords,
                      set: setShowWords,
                    },
                    {
                      id: 'phrases',
                      label: 'Phrases',
                      get: showPhrases,
                      set: setShowPhrases,
                    },
                    {
                      id: 'typos',
                      label: 'Typos',
                      get: showTypos,
                      set: setShowTypos,
                    },
                  ]}
                >
                  {(item) => (
                    <button
                      type="button"
                      onClick={() => item.set(!item.get())}
                      class={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${item.get()
                          ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-indigo-400 dark:ring-slate-600'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                    >
                      <div
                        class={`h-1.5 w-1.5 rounded-full ${item.get() ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                      />
                      {item.label}
                    </button>
                  )}
                </For>
              </div>

              <div class="flex items-center gap-2 px-2">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Min Count
                </span>
                <input
                  class="w-16 rounded-lg border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  type="number"
                  min="0"
                  value={minCount()}
                  onInput={(e) =>
                    setMinCount(Math.max(0, Number(e.currentTarget.value)))
                  }
                />
              </div>
            </div>

            {/* Sorting and Page Size */}
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                <select
                  class="rounded-lg border-none bg-transparent px-2 py-1.5 text-xs font-semibold text-slate-600 focus:ring-0 dark:text-slate-300"
                  value={sortMetric()}
                  onChange={(e) => {
                    const value = e.currentTarget.value
                    if (
                      value === 'count' ||
                      value === 'rank' ||
                      value === 'score'
                    )
                      setSortMetric(value)
                  }}
                >
                  <option value="count">Count</option>
                  <option value="rank">Rank</option>
                  <option value="score">Score</option>
                </select>
                <div class="h-4 w-px bg-slate-300 dark:bg-slate-700" />
                <select
                  class="rounded-lg border-none bg-transparent px-2 py-1.5 text-xs font-semibold text-slate-600 focus:ring-0 dark:text-slate-300"
                  value={sortLevel()}
                  onChange={(e) => {
                    const value = e.currentTarget.value
                    if ((GRADE_KEYS as readonly string[]).includes(value))
                      setSortLevel(value as GradeKey)
                  }}
                >
                  <For each={GRADE_KEYS}>
                    {(key) => <option value={key}>Grade {key}</option>}
                  </For>
                </select>
                <button
                  type="button"
                  aria-label="Toggle sort direction"
                  onClick={() =>
                    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                  }
                  class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 transition-colors dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-indigo-400"
                >
                  <Show
                    when={sortDir() === 'desc'}
                    fallback={
                      <svg
                        aria-hidden="true"
                        class="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                        />
                      </svg>
                    }
                  >
                    <svg
                      aria-hidden="true"
                      class="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 4h13M3 8h9m-9 4h9m5-1v12m0 0l-4-4m4 4l4-4"
                      />
                    </svg>
                  </Show>
                </button>
              </div>

              <div class="h-6 w-px bg-slate-200 hidden lg:block dark:bg-slate-700" />

              <div class="flex items-center gap-2">
                <select
                  class="rounded-xl border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:focus:ring-indigo-500/40"
                  value={pageSize()}
                  onChange={(e) => setPageSize(Number(e.currentTarget.value))}
                >
                  {[25, 50, 100, 200].map((v) => (
                    <option value={v}>{v} / page</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div class="flex flex-1 overflow-hidden">
        {/* Table Side */}
        <div class="flex flex-1 flex-col overflow-hidden">
          {/* Status Bar */}
          <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-6 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500">
            <div class="flex items-center gap-4">
              <Show
                when={!loading()}
                fallback={
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                    <span>
                      Parsing Data: {parsed()} / {total()}
                    </span>
                  </div>
                }
              >
                <div class="flex items-center gap-4">
                  <span>{rows().length.toLocaleString()} Items Loaded</span>
                  <div class="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                  <span>{filtered().length.toLocaleString()} Filtered</span>
                </div>
              </Show>
            </div>
            <div class="flex items-center gap-3">
              <button
                type="button"
                onClick={copyQuizletTsv}
                class={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all ${copyStatus() === 'copied'
                    ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30'
                    : 'hover:text-slate-600 hover:bg-slate-200 dark:hover:text-slate-300 dark:hover:bg-slate-800'
                  }`}
              >
                <svg
                  aria-hidden="true"
                  class="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                  />
                </svg>
                {copyStatus() === 'copied'
                  ? 'Copied to Clipboard'
                  : 'Export for Quizlet'}
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div class="relative flex-1 overflow-auto">
            <table class="w-full border-separate border-spacing-0 text-sm">
              <thead class="sticky top-0 z-10">
                <tr class="bg-white/95 backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:bg-slate-900/95 dark:shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                  <th class="w-12 border-b border-slate-200 py-3 pl-6 pr-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    #
                  </th>
                  <th class="border-b border-slate-200 px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Word
                  </th>
                  <th class="border-b border-slate-200 px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Translation
                  </th>
                  <th class="w-32 border-b border-slate-200 px-3 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <span class="hidden sm:inline">
                      {sortMetric()} ({sortLevel()})
                    </span>
                    <span class="sm:hidden">
                      {sortMetric().slice(0, 1)} ({sortLevel()})
                    </span>
                  </th>
                  <th class="w-20 sm:w-24 border-b border-slate-200 px-3 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <span class="hidden sm:inline">Count ({sortLevel()})</span>
                    <span class="sm:hidden">C ({sortLevel()})</span>
                  </th>
                  <th class="w-20 sm:w-24 border-b border-slate-200 px-3 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 pr-6 dark:border-slate-800 dark:text-slate-400">
                    Sum
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                <For each={pageRows()}>
                  {(row, i) => (
                    <tr
                      onClick={() => setSelectedId(row.id)}
                      class={`group cursor-pointer transition-all hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 ${selectedId() === row.id
                          ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-900/40 dark:ring-indigo-700/50'
                          : ''
                        }`}
                    >
                      <td class="py-4 pl-6 pr-3 font-mono text-xs text-slate-400 dark:text-slate-600">
                        {i() + 1 + (page() - 1) * pageSize()}
                      </td>
                      <td class="px-3 py-4">
                        <div class="flex items-center gap-2">
                          <span class="font-bold text-slate-900 dark:text-slate-200">
                            {row.word}
                          </span>
                          <Show when={row.isPhrase}>
                            <span class="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 ring-1 ring-inset ring-sky-700/10 dark:bg-sky-950/30 dark:text-sky-400 dark:ring-sky-400/20">
                              Phrase
                            </span>
                          </Show>
                          <Show when={row.isTypo}>
                            <span class="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-400/20">
                              Typo
                            </span>
                          </Show>
                        </div>
                      </td>
                      <td class="px-3 py-4 text-slate-600 dark:text-slate-400">
                        <div class="flex flex-wrap gap-x-4 gap-y-1 items-center">
                          <For each={row.meanings}>
                            {(m) => (
                              <div class="flex items-center gap-1.5 whitespace-nowrap">
                                <span class="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                                  {m.class}
                                </span>
                                <span class="text-xs font-medium">
                                  {m.translation}
                                </span>
                              </div>
                            )}
                          </For>
                        </div>
                      </td>
                      <td class="px-3 py-4 text-right font-mono text-xs font-bold text-indigo-600 tabular-nums dark:text-indigo-400">
                        {formatSortValue(
                          getSortValue(row, sortMetric(), sortLevel()),
                          sortMetric(),
                        )}
                      </td>
                      <td class="px-3 py-4 text-right font-mono text-xs font-bold text-slate-700 tabular-nums dark:text-slate-300">
                        {row.count?.[sortLevel()] ?? 0}
                      </td>
                      <td class="px-3 py-4 text-right pr-6 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-600">
                        {row.sumCount}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div class="z-10 shrink-0 border-t border-slate-200 bg-white px-6 py-3 shadow-[0_-1px_3px_rgba(0,0,0,0.02)] dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <div class="text-xs font-medium text-slate-500 dark:text-slate-500">
                Showing {((page() - 1) * pageSize() + 1).toLocaleString()} to{' '}
                {Math.min(
                  page() * pageSize(),
                  sorted().length,
                ).toLocaleString()}{' '}
                of {sorted().length.toLocaleString()} entries
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page() <= 1}
                  class="flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-bold text-slate-600 transition-all hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <svg
                    aria-hidden="true"
                    class="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Prev
                </button>
                <div class="flex h-9 items-center justify-center rounded-xl bg-slate-50 px-4 text-xs font-bold text-indigo-600 dark:bg-slate-800 dark:text-indigo-400">
                  {page()} / {totalPages()}
                </div>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages(), p + 1))}
                  disabled={page() >= totalPages()}
                  class="flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-bold text-slate-600 transition-all hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Next
                  <svg
                    aria-hidden="true"
                    class="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Detail Drawer (Mobile) / Side Panel (Desktop) */}
        <button
          type="button"
          aria-label="Close details"
          class={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${selected() ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          onClick={() => setSelectedId(null)}
        />
        <div
          class={`z-50 flex flex-col border-slate-200 bg-white shadow-[-8px_0_30px_rgba(0,0,0,0.03)] transition-all duration-300 ease-in-out
            fixed inset-x-0 bottom-0 h-[85vh] rounded-t-4xl border-t lg:border-t-0
            lg:relative lg:inset-auto lg:h-full lg:rounded-none lg:border-l
            dark:bg-slate-900 dark:border-slate-800 dark:shadow-[-8px_0_30px_rgba(0,0,0,0.4)]
            ${selected()
              ? 'translate-y-0 opacity-100 lg:w-125'
              : 'translate-y-full opacity-0 lg:w-0 lg:translate-y-0 lg:border-none lg:opacity-0'
            }
          `}
        >
          <Show when={selected()}>
            {(row) => (
              <div class="flex h-full flex-col overflow-hidden w-full lg:w-125 mx-auto max-w-2xl lg:max-w-none">
                {/* Mobile Handle */}
                <div class="shrink-0 flex items-center justify-center py-3 lg:hidden">
                  <div class="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
                </div>
                {/* Detail Header */}
                <div class="shrink-0 border-b border-slate-100 bg-slate-50/50 px-6 py-5 lg:py-6 dark:border-slate-800 dark:bg-slate-800/20">
                  <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span
                          class={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${row().isPhrase ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'}`}
                        >
                          {row().isPhrase ? 'Phrase' : 'Word'}
                        </span>
                        <Show when={row().isTypo}>
                          <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                            Typo
                          </span>
                        </Show>
                      </div>
                      <h2 class="truncate text-3xl font-black tracking-tight text-slate-900 dark:text-white underline decoration-indigo-500/30 underline-offset-8">
                        {row().word}
                      </h2>
                    </div>
                    <button
                      type="button"
                      aria-label="Close details"
                      onClick={() => setSelectedId(null)}
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-900 transition-all dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <svg
                        aria-hidden="true"
                        class="h-6 w-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Detail Body */}
                <div class="flex-1 overflow-auto px-6 py-6 space-y-8">
                  {/* Meanings */}
                  <div class="space-y-4">
                    <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                      <div class="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      Meanings & Examples
                    </h3>
                    <div class="space-y-6">
                      {(() => {
                        const grouped: { class: string; items: Meaning[] }[] =
                          []
                        row().meanings.forEach((m) => {
                          const last = grouped[grouped.length - 1]
                          if (last && last.class === m.class) {
                            last.items.push(m)
                          } else {
                            grouped.push({ class: m.class, items: [m] })
                          }
                        })

                        const circleNumbers = [
                          '①',
                          '②',
                          '③',
                          '④',
                          '⑤',
                          '⑥',
                          '⑦',
                          '⑧',
                          '⑨',
                          '⑩',
                        ]

                        return (
                          <For each={grouped}>
                            {(group) => (
                              <div class="overflow-hidden rounded-2xl bg-slate-50 border border-slate-100 shadow-sm transition-all hover:bg-slate-100/50 dark:bg-slate-800/40 dark:border-slate-800 dark:hover:bg-slate-800/60">
                                <div class="flex items-center gap-3 border-b border-slate-200/50 bg-white/50 px-5 py-2.5 dark:border-slate-700/50 dark:bg-slate-800/60">
                                  <span class="shrink-0 cursor-default rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-black uppercase text-white shadow-sm dark:bg-indigo-700">
                                    {group.class}
                                  </span>
                                </div>
                                <div class="divide-y divide-slate-200/50 dark:divide-slate-700/50">
                                  <For each={group.items}>
                                    {(meaning, i) => (
                                      <div class="p-5 space-y-3">
                                        <div class="flex items-start gap-2">
                                          <Show when={group.items.length > 1}>
                                            <span class="mt-0.5 text-lg font-bold text-indigo-500 shrink-0">
                                              {circleNumbers[i()] ||
                                                `${i() + 1}.`}
                                            </span>
                                          </Show>
                                          <div class="flex-1 min-w-0">
                                            <p class="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                                              {meaning.translation}
                                            </p>

                                            <Show
                                              when={
                                                meaning.examplePhrase ||
                                                meaning.exampleSentence
                                              }
                                            >
                                              <div class="space-y-4 pt-4">
                                                <Show
                                                  when={meaning.examplePhrase}
                                                >
                                                  <div class="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                                                    <div class="font-mono text-sm font-semibold text-slate-700 italic dark:text-slate-300">
                                                      {meaning.examplePhrase}
                                                    </div>
                                                    <Show
                                                      when={
                                                        meaning.examplePhraseTranslation
                                                      }
                                                    >
                                                      <div class="mt-1 text-xs font-medium text-slate-500 dark:text-slate-500">
                                                        {
                                                          meaning.examplePhraseTranslation
                                                        }
                                                      </div>
                                                    </Show>
                                                  </div>
                                                </Show>
                                                <Show
                                                  when={meaning.exampleSentence}
                                                >
                                                  <div class="relative pl-4 border-l-2 border-indigo-200 dark:border-indigo-900">
                                                    <div class="font-mono text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                      {meaning.exampleSentence}
                                                    </div>
                                                    <Show
                                                      when={
                                                        meaning.exampleSentenceTranslation
                                                      }
                                                    >
                                                      <div class="mt-1 text-xs font-medium text-slate-500 dark:text-slate-500">
                                                        {
                                                          meaning.exampleSentenceTranslation
                                                        }
                                                      </div>
                                                    </Show>
                                                  </div>
                                                </Show>
                                              </div>
                                            </Show>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </For>
                                </div>
                              </div>
                            )}
                          </For>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div class="grid grid-cols-2 gap-4">
                    <div class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
                      <h4 class="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Total Frequency
                      </h4>
                      <div class="flex items-end gap-2">
                        <span class="text-3xl font-black text-slate-900 tabular-nums leading-none dark:text-white">
                          {row().sumCount}
                        </span>
                        <span class="text-xs font-bold text-slate-400 mb-0.5 dark:text-slate-500">
                          total counts
                        </span>
                      </div>
                    </div>
                    <div class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
                      <h4 class="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Max Peak
                      </h4>
                      <div class="flex items-end gap-2">
                        <span class="text-3xl font-black text-slate-900 tabular-nums leading-none dark:text-white">
                          {row().maxCount}
                        </span>
                        <span class="text-xs font-bold text-slate-400 mb-0.5 dark:text-slate-500">
                          single grade
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Level Breakdown */}
                  <div class="space-y-4">
                    <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                      <div class="h-1.5 w-1.5 rounded-full bg-violet-500" />
                      Frequency by Grade
                    </h3>
                    <div class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm divide-y divide-slate-50 dark:border-slate-800 dark:bg-slate-800/80 dark:divide-slate-700/50">
                      <For each={GRADE_KEYS}>
                        {(key) => (
                          <div class="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                            <span class="flex items-center gap-2">
                              <span class="h-5 w-8 rounded-md bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-100 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600">
                                {key}
                              </span>
                              <span class="text-xs font-bold text-slate-600 dark:text-slate-400">
                                Grade {key}
                              </span>
                            </span>
                            <div class="flex items-center gap-4">
                              <div class="text-right">
                                <div class="text-[11px] font-bold text-slate-900 tabular-nums dark:text-slate-100">
                                  Count {row().count?.[key] ?? 0}
                                </div>
                                <div class="text-[10px] font-medium text-slate-400 tabular-nums dark:text-slate-500">
                                  Score {formatNumber(row().score?.[key])}
                                </div>
                              </div>
                              <div class="w-16 h-1 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-700">
                                <div
                                  class="h-full bg-indigo-500 rounded-full dark:bg-indigo-400"
                                  style={{
                                    width: `${Math.min(100, ((row().count?.[key] ?? 0) / (row().maxCount || 1)) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>

                  {/* Raw Data */}
                  <details class="group rounded-xl border border-dashed border-slate-200 p-2 dark:border-slate-800">
                    <summary class="flex cursor-pointer select-none items-center gap-2 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-300">
                      <svg
                        aria-hidden="true"
                        class="h-3 w-3 transition-transform group-open:rotate-90"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      Raw Metadata (JSON)
                    </summary>
                    <div class="mt-2">
                      <pre class="overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-[10px] leading-relaxed text-indigo-200 dark:bg-slate-950/80">
                        {JSON.stringify(row(), null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  )
}
