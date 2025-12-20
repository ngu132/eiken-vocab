import { For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js'

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

const LEVEL_KEYS = ['pre2', 'pre1', '5', '4', '3', '2', '1'] as const
type LevelKey = (typeof LEVEL_KEYS)[number]

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

function formatLevels(map?: NumberMap): string {
  if (!map) return '-'
  const parts: string[] = []
  for (const key of LEVEL_KEYS) {
    const value = map[key]
    if (typeof value !== 'number') continue
    if (value === 0) continue
    parts.push(`${key}:${value}`)
  }
  return parts.length === 0 ? '-' : parts.join(' ')
}

function formatNumber(value: number | undefined, digits = 3): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toFixed(digits)
}

function getSortValue(row: MetadataRow, metric: 'count' | 'rank' | 'score', level: LevelKey): number {
  if (metric === 'count') return row.count?.[level] ?? 0
  if (metric === 'rank') return row.rank?.[level] ?? Number.NEGATIVE_INFINITY
  return row.score?.[level] ?? Number.NEGATIVE_INFINITY
}

function formatSortValue(value: number, metric: 'count' | 'rank' | 'score'): string {
  if (!Number.isFinite(value)) return '-'
  if (metric === 'count') return String(Math.trunc(value))
  return value.toFixed(3)
}

function sanitizeTsvField(value: string): string {
  return value.replaceAll('\t', ' ').replaceAll('\r', ' ').replaceAll('\n', ' ').trim()
}

function getQuizletDefinition(row: MetadataRow): string {
  const meanings = Array.isArray(row.meanings) ? row.meanings : []
  const translations = meanings
    .map((m) => (typeof m.translation === 'string' ? m.translation.trim() : ''))
    .filter((t) => t.length > 0)

  if (translations.length === 0) return row.primaryTranslation

  const seen = new Set<string>()
  const uniq: string[] = []
  for (const t of translations) {
    if (seen.has(t)) continue
    seen.add(t)
    uniq.push(t)
  }
  return uniq.join(' / ')
}

export default function MetadataViewer() {
  const [rows, setRows] = createSignal<MetadataRow[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [parsed, setParsed] = createSignal(0)
  const [total, setTotal] = createSignal(0)
  const [badLines, setBadLines] = createSignal(0)
  const [starSkipped, setStarSkipped] = createSignal(0)

  const [query, setQuery] = createSignal('')
  const [showWords, setShowWords] = createSignal(true)
  const [showPhrases, setShowPhrases] = createSignal(true)
  const [minCount, setMinCount] = createSignal(0)
  const [sortMetric, setSortMetric] = createSignal<'count' | 'rank' | 'score'>('rank')
  const [sortLevel, setSortLevel] = createSignal<LevelKey>('5')
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('desc')
  const [page, setPage] = createSignal(1)
  const [pageSize, setPageSize] = createSignal(50)
  const [selectedId, setSelectedId] = createSignal<number | null>(null)
  const [copyStatus, setCopyStatus] = createSignal<'idle' | 'copied' | 'failed'>('idle')

  onMount(async () => {
    setLoading(true)
    setError(null)

    const url = new URL('./assets/metadata.jsonl', import.meta.url)
    let text: string
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`failed to fetch: ${res.status} ${res.statusText}`)
      text = await res.text()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
      return
    }

    const lines = text
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    setTotal(lines.length)
    setParsed(0)
    setBadLines(0)
    setStarSkipped(0)

    const parsedRows: MetadataRow[] = []
    let index = 0
    let bad = 0
    let skipped = 0

    const parseChunk = () => {
      const chunkSize = 500
      const end = Math.min(lines.length, index + chunkSize)
      for (; index < end; index++) {
        const item = safeJsonParse(lines[index])
        if (!item || typeof item.word !== 'string') {
          bad += 1
          continue
        }
        if (item.word.includes('☆')) {
          skipped += 1
          continue
        }

        const primaryMeaning = Array.isArray(item.meanings) ? item.meanings[0] : undefined
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
      setBadLines(bad)
      setStarSkipped(skipped)

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
    const min = minCount()
    const list = rows()

    return list.filter((row) => {
      if (!allowWords && !row.isPhrase) return false
      if (!allowPhrases && row.isPhrase) return false
      if (row.sumCount < min) return false
      if (q.length === 0) return true
      return (
        row.word.toLowerCase().includes(q) ||
        row.primaryTranslation.toLowerCase().includes(q) ||
        row.primaryClass.toLowerCase().includes(q)
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

  const totalPages = createMemo(() => Math.max(1, Math.ceil(sorted().length / pageSize())))
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

    const tsv = lines.join('\n') + '\n'

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
    <div class="space-y-4">
      <div class="rounded-lg border bg-white p-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">
              Search
              <input
                class="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300 md:w-96"
                placeholder="word / translation / class"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </label>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showWords()}
                  onChange={(e) => setShowWords(e.currentTarget.checked)}
                />
                words
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showPhrases()}
                  onChange={(e) => setShowPhrases(e.currentTarget.checked)}
                />
                phrases
              </label>
              <label class="flex items-center gap-2">
                <span class="text-slate-600">min count</span>
                <input
                  class="w-24 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                  type="number"
                  min="0"
                  value={minCount()}
                  onInput={(e) => setMinCount(Math.max(0, Number(e.currentTarget.value)))}
                />
              </label>
            </div>
          </div>

          <div class="flex flex-wrap items-end gap-3">
            <label class="text-sm">
              sort metric
              <select
                class="mt-1 w-40 rounded-md border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={sortMetric()}
                onChange={(e) => setSortMetric(e.currentTarget.value as 'count' | 'rank' | 'score')}
              >
                <option value="count">count</option>
                <option value="rank">rank</option>
                <option value="score">score</option>
              </select>
            </label>
            <label class="text-sm">
              level
              <select
                class="mt-1 w-28 rounded-md border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={sortLevel()}
                onChange={(e) => setSortLevel(e.currentTarget.value as LevelKey)}
              >
                <For each={LEVEL_KEYS}>{(key) => <option value={key}>{key}</option>}</For>
              </select>
            </label>
            <label class="text-sm">
              dir
              <select
                class="mt-1 w-28 rounded-md border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={sortDir()}
                onChange={(e) => setSortDir(e.currentTarget.value as 'asc' | 'desc')}
              >
                <option value="asc">asc</option>
                <option value="desc">desc</option>
              </select>
            </label>
            <label class="text-sm">
              page size
              <select
                class="mt-1 w-28 rounded-md border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={pageSize()}
                onChange={(e) => setPageSize(Number(e.currentTarget.value))}
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </label>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <div>
            <Show when={!loading()} fallback={<span>loading... {parsed()}/{total()}</span>}>
              <span>
                loaded {rows().length.toLocaleString()} rows (bad: {badLines().toLocaleString()}, ☆ skipped:{' '}
                {starSkipped().toLocaleString()}) / filtered{' '}
                {sorted().length.toLocaleString()}
              </span>
            </Show>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="rounded-md border bg-white px-3 py-1 disabled:opacity-50"
              onClick={copyQuizletTsv}
              disabled={loading() || sorted().length === 0}
              title="英単語<TAB>日本語 の TSV をクリップボードへコピー"
            >
              <Show when={copyStatus() === 'copied'} fallback={copyStatus() === 'failed' ? 'Copy failed' : 'Copy for Quizlet'}>
                Copied
              </Show>
            </button>
            <button
              class="rounded-md border bg-white px-3 py-1 disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page() <= 1}
            >
              Prev
            </button>
            <span class="tabular-nums">
              {page()} / {totalPages()}
            </span>
            <button
              class="rounded-md border bg-white px-3 py-1 disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(totalPages(), p + 1))}
              disabled={page() >= totalPages()}
            >
              Next
            </button>
          </div>
        </div>

        <Show when={error()}>
          {(message) => (
            <div class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {message()}
            </div>
          )}
        </Show>
      </div>

      <div class="overflow-hidden rounded-lg border bg-white">
        <div class="overflow-auto">
          <table class="min-w-full border-collapse text-sm">
            <thead class="sticky top-0 bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th class="w-12 px-3 py-2">#</th>
                <th class="px-3 py-2">word</th>
                <th class="px-3 py-2">class</th>
                <th class="px-3 py-2">translation</th>
                <th class="w-28 px-3 py-2 text-right">
                  {sortLevel()} {sortMetric()}
                </th>
                <th class="w-24 px-3 py-2 text-right">sum</th>
                <th class="w-24 px-3 py-2 text-right">max</th>
                <th class="px-3 py-2">counts</th>
              </tr>
            </thead>
            <tbody>
              <For each={pageRows()}>
                {(row, i) => (
                  <tr
                    class={
                      selectedId() === row.id
                        ? 'cursor-pointer bg-slate-100'
                        : 'cursor-pointer hover:bg-slate-50'
                    }
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td class="whitespace-nowrap px-3 py-2 text-slate-500">{i() + 1 + (page() - 1) * pageSize()}</td>
                    <td class="whitespace-nowrap px-3 py-2 font-mono">
                      {row.word}
                      <Show when={row.isPhrase}>
                        <span class="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                          phrase
                        </span>
                      </Show>
                    </td>
                    <td class="whitespace-nowrap px-3 py-2">{row.primaryClass}</td>
                    <td class="min-w-96 px-3 py-2">{row.primaryTranslation}</td>
                    <td class="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">
                      {formatSortValue(getSortValue(row, sortMetric(), sortLevel()), sortMetric())}
                    </td>
                    <td class="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">{row.sumCount}</td>
                    <td class="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">{row.maxCount}</td>
                    <td class="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                      {formatLevels(row.count)}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <div class="border-t bg-slate-50 px-4 py-2 text-xs text-slate-600">
          row をクリックすると下に詳細が表示されます
        </div>
      </div>

      <Show when={selected()}>
        {(row) => (
          <section class="rounded-lg border bg-white p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="truncate font-mono text-lg font-semibold">{row().word}</h2>
                <div class="mt-1 text-sm text-slate-600">
                  <span>{row().isPhrase ? 'phrase' : 'word'}</span>
                  <span class="mx-2">·</span>
                  <span>sumCount {row().sumCount}</span>
                  <span class="mx-2">·</span>
                  <span>maxCount {row().maxCount}</span>
                </div>
              </div>
              <button class="rounded-md border bg-white px-3 py-1 text-sm" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </div>

            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <div class="space-y-3">
                <div class="rounded-md border p-3">
                  <div class="text-xs font-medium text-slate-500">Counts</div>
                  <div class="mt-1 font-mono text-sm">{formatLevels(row().count)}</div>
                </div>
                <div class="rounded-md border p-3">
                  <div class="text-xs font-medium text-slate-500">Scores (selected)</div>
                  <div class="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
                    <For each={LEVEL_KEYS}>
                      {(key) => (
                        <>
                          <div class="text-slate-600">{key}</div>
                          <div class="text-right tabular-nums">{formatNumber(row().score?.[key])}</div>
                        </>
                      )}
                    </For>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div class="rounded-md border p-3">
                  <div class="text-xs font-medium text-slate-500">Meanings</div>
                  <div class="mt-2 space-y-3">
                    <For each={row().meanings}>
                      {(meaning) => (
                        <div class="rounded-md bg-slate-50 p-3">
                          <div class="flex flex-wrap items-center gap-2 text-sm">
                            <span class="rounded bg-white px-2 py-0.5 text-xs text-slate-600">{meaning.class}</span>
                            <span class="font-medium">{meaning.translation}</span>
                          </div>
                          <Show when={meaning.examplePhrase || meaning.exampleSentence}>
                            <div class="mt-2 space-y-1 text-xs text-slate-700">
                              <Show when={meaning.examplePhrase}>
                                <div class="font-mono">{meaning.examplePhrase}</div>
                              </Show>
                              <Show when={meaning.examplePhraseTranslation}>
                                <div>{meaning.examplePhraseTranslation}</div>
                              </Show>
                              <Show when={meaning.exampleSentence}>
                                <div class="font-mono">{meaning.exampleSentence}</div>
                              </Show>
                              <Show when={meaning.exampleSentenceTranslation}>
                                <div>{meaning.exampleSentenceTranslation}</div>
                              </Show>
                            </div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </div>

                <details class="rounded-md border p-3">
                  <summary class="cursor-pointer text-xs font-medium text-slate-500">Raw JSON</summary>
                  <pre class="mt-2 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
                    {JSON.stringify(row(), null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          </section>
        )}
      </Show>
    </div>
  )
}
