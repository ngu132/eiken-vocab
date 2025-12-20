import {
  parse,
  type HTMLElement,
  type Node as HtmlNode,
  TextNode,
} from 'node-html-parser'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

type Chunk =
  | { type: 'JapaneseChunk'; text: string }
  | { type: 'EnglishChunk'; text: string }
  | { type: 'BlankChunk'; id?: string | number }

type Text = { type: 'Text'; chunks: Chunk[] }

type EnglishPhraseChoice = { type: 'EnglishPhraseChoice'; choice: Text }
type MultipleNumberChoice = { type: 'MultipleNumberChoice'; choices: number[] }

type ConversationLine = {
  type: 'ConversationLine'
  speaker: string
  text: Chunk[]
}
type Conversation = { type: 'Conversation'; lines: ConversationLine[] }

type SelectResponseByConversation = {
  type: 'SelectResponseByConversation'
  index?: number
  conversation: Conversation
  choices: EnglishPhraseChoice[]
  answerIndex: number
}

type SelectTrueSentence = {
  type: 'SelectTrueSentence'
  index?: number
  question: string
  choices: EnglishPhraseChoice[]
  answerIndex: number
}

type SentenceCompletion = {
  type: 'SentenceCompletion'
  index?: number
  sentence: Text
  choices: EnglishPhraseChoice[]
  answerIndex: number
}

type ContentCloze = {
  type: 'ContentCloze'
  index?: number
  content: Text
  choices: EnglishPhraseChoice[]
  answerIndex: number
}

type ShortSentenceCloze = {
  type: 'ShortSentenceCloze'
  index?: number
  sentence: Text
  choices: EnglishPhraseChoice[]
  answerIndex: number
}

type Content = {
  type: 'EmailContent' | 'PosterContent' | 'SentenceContent' | 'PassageContent'
  content: Text
}

type ReadContentAndAnswerSection = {
  type: 'ReadContentAndAnswerSection'
  contents: Content[]
  questions: ContentUnderstanding[]
}

type MultipleReadContentAndAnswerSectionPart = {
  type: 'MultipleReadContentAndAnswerSectionPart'
  content: Content
  questions: ContentUnderstanding[]
}
type MultipleReadContentAndAnswerSection = {
  type: 'MultipleReadContentAndAnswerSection'
  parts: MultipleReadContentAndAnswerSectionPart[]
}

type ShortSentenceClozeSection = {
  type: 'ShortSentenceClozeSection'
  questions: ShortSentenceCloze[]
}

type JapaneseTranslateWordOrderCombination = {
  type: 'JapaneseTranslateWordOrderCombination'
  index?: number
  question: string
  words: { type: 'EnglishChunk'; text: string }[]
  choices: MultipleNumberChoice[]
  answerIndex: number
}
type JapaneseTranslateWordOrderCombinationSection = {
  type: 'JapaneseTranslateWordOrderCombinationSection'
  blankIndices: number[]
  questions: JapaneseTranslateWordOrderCombination[]
}

type ReallifePart = {
  type: 'ReallifePart'
  index?: number
  question: string
  choices: EnglishPhraseChoice[]
  answerIndices: number[]
}
type Reallife = {
  type: 'Reallife'
  index?: number
  situation: string
  script: Text
  parts: ReallifePart[]
}
type ReallifeSection = { type: 'ReallifeSection'; questions: Reallife[] }

type SelectSentenceByEnglishSentence = {
  type: 'SelectSentenceByEnglishSentence'
  index?: number
  question: string
  choices: EnglishPhraseChoice[]
  answerIndex: number
}
type SelectSentenceByEnglishSentenceSection = {
  type: 'SelectSentenceByEnglishSentence'
  questions: SelectSentenceByEnglishSentence[]
}

type SelectResponseByConversationSection = {
  type: 'SelectResponseByConversationSection'
  questions: SelectResponseByConversation[]
}

type ListeningSection =
  | ReallifeSection
  | SelectSentenceByEnglishSentenceSection
  | SelectResponseByConversationSection
type ContentUnderstanding = SelectTrueSentence | SentenceCompletion | ContentCloze

type ReadingSection =
  | ReadContentAndAnswerSection
  | MultipleReadContentAndAnswerSection
  | ShortSentenceClozeSection
  | JapaneseTranslateWordOrderCombinationSection

type Test = {
  type: 'Test'
  readingSections: ReadingSection[]
  listeningSections: ListeningSection[]
}

const RE_JA = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/

function isJapanese(text: string): boolean {
  return RE_JA.test(text)
}

function normalizeWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function parseQuestionIndex(node: HTMLElement | null | undefined): number | undefined {
  const raw = node?.getAttribute('index')
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function isElement(n: HtmlNode): n is HTMLElement {
  return n.nodeType === 1
}

function isText(n: HtmlNode): n is TextNode {
  return n instanceof TextNode || n.nodeType === 3
}

function chunksFromNodes(nodes: HtmlNode[]): Chunk[] {
  const chunks: Chunk[] = []
  let buffer = ''

  const flush = () => {
    if (!buffer) return
    const normalized = normalizeWs(buffer)
    buffer = ''
    if (!normalized) return
    chunks.push({
      type: isJapanese(normalized) ? 'JapaneseChunk' : 'EnglishChunk',
      text: normalized,
    })
  }

  for (const node of nodes) {
    if (isText(node)) {
      buffer += node.rawText ?? node.toString()
      continue
    }
    if (!isElement(node)) continue

    const tag = node.tagName.toLowerCase()
    if (tag === 'blank') {
      flush()
      const id =
        node.getAttribute('index') ?? node.getAttribute('id') ?? undefined
      chunks.push(id ? { type: 'BlankChunk', id } : { type: 'BlankChunk' })
      continue
    }
    if (tag === 'br') {
      buffer += ' '
      continue
    }

    const inner = chunksFromNodes(node.childNodes)
    if (inner.length) {
      flush()
      chunks.push(...inner)
    }
  }

  flush()
  return chunks.filter((c) => c.type === 'BlankChunk' || c.text)
}

function textFromNodes(nodes: HtmlNode[]): Text {
  return { type: 'Text', chunks: chunksFromNodes(nodes) }
}

function choiceList(choicesNode: HTMLElement | null): EnglishPhraseChoice[] {
  if (!choicesNode) return []
  const choices = choicesNode.querySelectorAll('choice')
  return choices.map((c) => ({
    type: 'EnglishPhraseChoice',
    choice: textFromNodes(c.childNodes),
  }))
}

function answerIndices(choicesNode: HTMLElement | null): number[] {
  if (!choicesNode) return []
  const choices = choicesNode.querySelectorAll('choice')
  const out: number[] = []
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i]
    if (!choice) continue
    const v = choice.getAttribute('answer')
    if (v == null) continue
    const vv = v.toLowerCase().trim()
    if (vv === '' || vv === 'true' || vv === '1' || vv === 'yes') out.push(i)
  }
  return out
}

function answerIndex(choicesNode: HTMLElement | null): number {
  const indices = answerIndices(choicesNode)
  return indices.length ? indices[0] : -1
}

function parseConversation(content: HTMLElement): Conversation {
  const lines = content.querySelectorAll('line').map((line) => {
    const speaker = line.getAttribute('speaker') ?? ''
    return {
      type: 'ConversationLine',
      speaker,
      text: chunksFromNodes(line.childNodes),
    } satisfies ConversationLine
  })
  return { type: 'Conversation', lines }
}

function parseShortSentenceCloze(question: HTMLElement): ShortSentenceCloze {
  const body = question.querySelector('body')
  const choices = question.querySelector('choices')
  return {
    type: 'ShortSentenceCloze',
    index: parseQuestionIndex(question),
    sentence: textFromNodes(body?.childNodes ?? []),
    choices: choiceList(choices),
    answerIndex: answerIndex(choices),
  }
}

function parseSelectTrueSentence(question: HTMLElement): SelectTrueSentence {
  const body = question.querySelector('body')
  const choices = question.querySelector('choices')
  return {
    type: 'SelectTrueSentence',
    index: parseQuestionIndex(question),
    question: normalizeWs(body?.text ?? ''),
    choices: choiceList(choices),
    answerIndex: answerIndex(choices),
  }
}

function hasBlank(body: HTMLElement | null): boolean {
  return Boolean(body?.querySelector('blank'))
}

function parseSentenceCompletion(question: HTMLElement): SentenceCompletion {
  const body = question.querySelector('body')
  const choices = question.querySelector('choices')
  return {
    type: 'SentenceCompletion',
    index: parseQuestionIndex(question),
    sentence: textFromNodes(body?.childNodes ?? []),
    choices: choiceList(choices),
    answerIndex: answerIndex(choices),
  }
}

function parseContentUnderstanding(question: HTMLElement): ContentUnderstanding {
  const qType = (question.getAttribute('type') ?? '').toLowerCase()
  const body = question.querySelector('body')
  if (qType === 'completion' || hasBlank(body)) return parseSentenceCompletion(question)
  return parseSelectTrueSentence(question)
}

function parseListeningQuestion(
  question: HTMLElement,
): SelectResponseByConversation | SelectTrueSentence | ShortSentenceCloze {
  const qType = (question.getAttribute('type') ?? '').toLowerCase()
  const body = question.querySelector('body')
  const choices = question.querySelector('choices')

  const content = body?.querySelector('content')
  if (
    content &&
    (content.getAttribute('type') ?? '').toLowerCase() === 'conversation'
  ) {
    return {
      type: 'SelectResponseByConversation',
      index: parseQuestionIndex(question),
      conversation: parseConversation(content),
      choices: choiceList(choices),
      answerIndex: answerIndex(choices),
    }
  }

  if (qType === 'fill' || qType === 'completion') {
    return {
      type: 'ShortSentenceCloze',
      index: parseQuestionIndex(question),
      sentence: textFromNodes(body?.childNodes ?? []),
      choices: choiceList(choices),
      answerIndex: answerIndex(choices),
    }
  }

  return {
    type: 'SelectTrueSentence',
    index: parseQuestionIndex(question),
    question: normalizeWs(body?.text ?? ''),
    choices: choiceList(choices),
    answerIndex: answerIndex(choices),
  }
}

function parseContentNode(content: HTMLElement): Content {
  const t = (content.getAttribute('type') ?? '').toLowerCase()
  if (t === 'email')
    return { type: 'EmailContent', content: textFromNodes(content.childNodes) }
  if (t === 'poster')
    return { type: 'PosterContent', content: textFromNodes(content.childNodes) }
  if (t === 'paragraph' || t === 'passage')
    return {
      type: 'PassageContent',
      content: textFromNodes(content.childNodes),
    }
  return { type: 'PassageContent', content: textFromNodes(content.childNodes) }
}

function collectDirectChildren(section: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const child of section.childNodes) {
    if (!isElement(child)) continue
    const tag = child.tagName.toLowerCase()
    if (tag === 'content' || tag === 'question') out.push(child)
  }
  return out
}

const CIRCLED_MAP: Record<string, number> = {
  '①': 1,
  '②': 2,
  '③': 3,
  '④': 4,
  '⑤': 5,
  '⑥': 6,
  '⑦': 7,
  '⑧': 8,
  '⑨': 9,
  '⑩': 10,
  '⑪': 11,
  '⑫': 12,
  '⑬': 13,
  '⑭': 14,
  '⑮': 15,
  '⑯': 16,
  '⑰': 17,
  '⑱': 18,
  '⑲': 19,
  '⑳': 20,
}

function parseCircledWordList(bodyText: string): { n: number; text: string }[] {
  const rx = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g
  const hits = [...bodyText.matchAll(rx)]
  if (!hits.length) return []
  const out: { n: number; text: string }[] = []
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]?.index ?? 0
    const end = i + 1 < hits.length ? (hits[i + 1]?.index ?? bodyText.length) : bodyText.length
    const marker = hits[i]?.[0] ?? ''
    const n = CIRCLED_MAP[marker]
    if (!n) continue
    const segment = bodyText.slice(start + marker.length, end)
    const cleaned = segment.replace(/[()（）]/g, ' ').trim()
    const trimmed = cleaned.split(/(\d+)番目/)[0]?.trim() ?? cleaned
    if (!trimmed) continue
    out.push({ n, text: normalizeWs(trimmed) })
  }
  return out.sort((a, b) => a.n - b.n)
}

function parsePairChoiceText(text: string): number[] | null {
  const t = normalizeWs(text)
  const m = t.match(
    /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|[0-9]+)\s*[─\-ー–—]\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|[0-9]+)$/,
  )
  if (!m) return null
  const a = CIRCLED_MAP[m[1] ?? ''] ?? Number(m[1])
  const b = CIRCLED_MAP[m[2] ?? ''] ?? Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return [a, b]
}

function detectBlankIndices(text: string): number[] {
  const out = new Set<number>()
  for (const m of text.matchAll(/(\d+)番目/g)) out.add(Number(m[1]))
  return [...out].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
}

function isWordOrderQuestion(q: HTMLElement): boolean {
  const body = q.querySelector('body')
  const bodyText = normalizeWs(body?.text ?? '')
  if (!bodyText) return false
  if (!/[①②③④⑤]/.test(bodyText)) return false
  const choices = q.querySelector('choices')
  const first = choices?.querySelector('choice')?.text ?? ''
  return Boolean(parsePairChoiceText(first))
}

function parseWordOrderSection(
  questions: HTMLElement[],
  hintText: string,
): JapaneseTranslateWordOrderCombinationSection {
  let blankIndices = detectBlankIndices(hintText)
  if (!blankIndices.length) {
    blankIndices = detectBlankIndices(questions.map((q) => normalizeWs(q.text)).join(' '))
  }
  const parsedQuestions: JapaneseTranslateWordOrderCombination[] = questions.map((q) => {
    const body = q.querySelector('body')
    const bodyText = normalizeWs(body?.text ?? '')
    const words = parseCircledWordList(bodyText).map((w) => ({
      type: 'EnglishChunk',
      text: w.text,
    }))
    const choicesNode = q.querySelector('choices')
    const choiceEls = choicesNode?.querySelectorAll('choice') ?? []
    const choices = choiceEls
      .map((c) => parsePairChoiceText(c.text))
      .filter((x): x is number[] => Array.isArray(x) && x.length > 0)
      .map((pair) => ({ type: 'MultipleNumberChoice', choices: pair }))

    return {
      type: 'JapaneseTranslateWordOrderCombination',
      index: parseQuestionIndex(q),
      question: bodyText,
      words,
      choices,
      answerIndex: answerIndex(choicesNode),
    }
  })

  return { type: 'JapaneseTranslateWordOrderCombinationSection', blankIndices, questions: parsedQuestions }
}

function parseReadingSection(section: HTMLElement): ReadingSection[] {
  const items = collectDirectChildren(section)
  const contents = items.filter((x) => x.tagName.toLowerCase() === 'content')
  const questions = items.filter((x) => x.tagName.toLowerCase() === 'question')
  const out: ReadingSection[] = []

  if (!contents.length) {
    if (questions.length && questions.every(isWordOrderQuestion)) {
      out.push(parseWordOrderSection(questions, questions.map((q) => q.text).join(' ')))
      return out
    }
    out.push({ type: 'ShortSentenceClozeSection', questions: questions.map(parseShortSentenceCloze) })
    return out
  }

  const contentByIndex = new Map<string, HTMLElement>()
  const contentOrder: string[] = []
  for (const c of contents) {
    const idx = (c.getAttribute('index') ?? '').trim()
    if (!idx) continue
    contentByIndex.set(idx, c)
    contentOrder.push(idx)
  }

  const resolveForKey = (q: HTMLElement): string | null => {
    const key = (q.getAttribute('for') ?? '').trim()
    if (!key) return null
    if (contentByIndex.has(key)) return key
    if (/^\d+$/.test(key)) {
      const n = Number(key)
      const mapped = contentOrder[n - 1]
      if (n >= 1 && n <= contentOrder.length && mapped) return mapped
    }
    return null
  }

  const qsByKey = new Map<string, HTMLElement[]>()
  for (const k of contentOrder) qsByKey.set(k, [])

  let currentKey: string | null = contentOrder[0] ?? null
  for (const it of items) {
    const tag = it.tagName.toLowerCase()
    if (tag === 'content') {
      const idx = (it.getAttribute('index') ?? '').trim()
      if (idx && contentByIndex.has(idx)) currentKey = idx
      continue
    }
    if (tag !== 'question') continue
    const explicit = resolveForKey(it)
    const key = explicit ?? currentKey
    if (key && qsByKey.has(key)) qsByKey.get(key)!.push(it)
  }

  const hintedText = contents.map((c) => normalizeWs(c.text)).join(' ')
  for (const k of contentOrder) {
    const qs = qsByKey.get(k) ?? []
    if (!qs.length) continue
    if (!qs.every(isWordOrderQuestion)) continue
    const hint = normalizeWs(contentByIndex.get(k)?.text ?? hintedText)
    out.push(parseWordOrderSection(qs, hint))
    qsByKey.set(k, [])
  }

  const contentGroups = contentOrder
    .map((k) => ({ content: contentByIndex.get(k), questions: qsByKey.get(k) ?? [] }))
    .filter((g) => g.content && g.questions.length) as { content: HTMLElement; questions: HTMLElement[] }[]

  if (contentGroups.length >= 2) {
    out.push({
      type: 'MultipleReadContentAndAnswerSection',
      parts: contentGroups.map((g) => ({
        type: 'MultipleReadContentAndAnswerSectionPart',
        content: parseContentNode(g.content),
        questions: g.questions.map(parseContentUnderstanding),
      })),
    })
  } else if (contentGroups.length === 1) {
    const g = contentGroups[0]
    out.push({
      type: 'ReadContentAndAnswerSection',
      contents: [parseContentNode(g.content)],
      questions: g.questions.map(parseContentUnderstanding),
    })
  }

  // Orphan questions (not in any mapped group): keep as separate cloze / word-order section.
  const groupedQuestions = new Set<HTMLElement>()
  for (const g of contentGroups) for (const q of g.questions) groupedQuestions.add(q)
  const orphan = questions.filter((q) => !groupedQuestions.has(q) && !resolveForKey(q))
  if (orphan.length) {
    if (orphan.every(isWordOrderQuestion)) out.push(parseWordOrderSection(orphan, hintedText))
    else out.push({ type: 'ShortSentenceClozeSection', questions: orphan.map(parseShortSentenceCloze) })
  }

  return out
}

function parseReadingSections(root: HTMLElement): ReadingSection[] {
  const reading = root.querySelector('reading_sections')
  if (!reading) return []

  const out: ReadingSection[] = []
  for (const section of reading.querySelectorAll('section')) {
    out.push(...parseReadingSection(section))
  }

  return out
}

function splitSituationScript(text: string): {
  situation: string
  script: string
} {
  const m = text.match(/^\(([^)]+)\)\s*([^.]*)\.\s*(.*)$/)
  if (!m) return { situation: '', script: text }
  return { situation: `(${m[1]})${m[2]}`.trim(), script: m[3]?.trim() ?? '' }
}

function textPrefixBeforeQuestions(node: HTMLElement): string {
  let s = ''
  for (const child of node.childNodes) {
    if (isElement(child) && child.tagName.toLowerCase() === 'question') break
    if (isText(child)) s += child.rawText ?? child.toString()
    else if (isElement(child)) s += child.text ?? ''
  }
  return normalizeWs(s)
}

function parseListeningSection(section: HTMLElement): ListeningSection {
  const hasScript = section
    .querySelectorAll(':scope > content')
    .some((c) => (c.getAttribute('type') ?? '').toLowerCase() === 'script')
  if (hasScript) {
    const scripts = section
      .querySelectorAll(':scope > content')
      .filter((c) => (c.getAttribute('type') ?? '').toLowerCase() === 'script')

    const siblingQuestions = section.querySelectorAll(':scope > question')
    const qsByFor = new Map<string, HTMLElement[]>()
    for (const q of siblingQuestions) {
      const k = (q.getAttribute('for') ?? '').trim()
      if (!k) continue
      if (!qsByFor.has(k)) qsByFor.set(k, [])
      qsByFor.get(k)?.push(q)
    }

    const reallifes: Reallife[] = scripts.map((script) => {
      const idx = (script.getAttribute('index') ?? '').trim()
      const raw = textPrefixBeforeQuestions(script)
      const { situation, script: scriptText } = splitSituationScript(raw)

      const nestedQuestions = script.querySelectorAll(':scope > question')
      const externalQuestions = idx ? (qsByFor.get(idx) ?? []) : []
      const allQuestions = [...nestedQuestions, ...externalQuestions]

      const parts: ReallifePart[] = allQuestions.map((q) => {
        const body = q.querySelector('body')
        const choices = q.querySelector('choices')
        const ais = answerIndices(choices)
        return {
          type: 'ReallifePart',
          index: parseQuestionIndex(q),
          question: normalizeWs(body?.text ?? ''),
          choices: choiceList(choices),
          answerIndices: ais,
        }
      })

      return {
        type: 'Reallife',
        index: undefined,
        situation,
        script: {
          type: 'Text',
          chunks: scriptText
            ? [{ type: 'EnglishChunk', text: scriptText }]
            : [],
        },
        parts,
      }
    })

    return { type: 'ReallifeSection', questions: reallifes }
  }

  const questions = section
    .querySelectorAll(':scope > question')
    .map(parseListeningQuestion)
  const convos = questions.filter(
    (q): q is SelectResponseByConversation =>
      q.type === 'SelectResponseByConversation',
  )
  if (convos.length)
    return { type: 'SelectResponseByConversationSection', questions: convos }

  const normalized: SelectSentenceByEnglishSentence[] = questions.map((q) => {
    if (q.type === 'SelectTrueSentence') {
      return {
        type: 'SelectSentenceByEnglishSentence',
        index: q.index,
        question: q.question,
        choices: q.choices,
        answerIndex: q.answerIndex,
      }
    }
    if (q.type === 'ShortSentenceCloze') {
      const sentenceText = normalizeWs(
        q.sentence.chunks
          .map((c) => (c.type === 'BlankChunk' ? `[${c.id ?? ''}]` : c.text))
          .join(''),
      )
      return {
        type: 'SelectSentenceByEnglishSentence',
        index: q.index,
        question: sentenceText,
        choices: q.choices,
        answerIndex: q.answerIndex,
      }
    }
    return {
      type: 'SelectSentenceByEnglishSentence',
      index: undefined,
      question: '',
      choices: q.choices,
      answerIndex: q.answerIndex,
    }
  })

  return { type: 'SelectSentenceByEnglishSentence', questions: normalized }
}

function parseListeningSections(root: HTMLElement): ListeningSection[] {
  const listening = root.querySelector('listening_sections')
  if (!listening) return []
  return listening.querySelectorAll('section').map(parseListeningSection)
}

function parseFileToTestSections(text: string): {
  readingSections: ReadingSection[]
  listeningSections: ListeningSection[]
} {
  const root = parse(text, { lowerCaseTagName: true })
  return {
    readingSections: parseReadingSections(root),
    listeningSections: parseListeningSections(root),
  }
}

function parseArgs(argv: string[]): {
  input: string
  output: string
  overwrite: boolean
} {
  let input = 'data/output'
  let output = 'data/parsed'
  let overwrite = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--input') input = argv[++i] ?? input
    else if (a === '--output') output = argv[++i] ?? output
    else if (a === '--overwrite') overwrite = true
    else if (a === '--help' || a === '-h') {
      // eslint-disable-next-line no-console
      console.log(
        'usage: bun steps/3-parse-llm-output/output_html_to_ast_json.ts [--input output] [--output parsed] [--overwrite]',
      )
      process.exit(0)
    }
  }
  return { input, output, overwrite }
}

async function main() {
  const { input, output, overwrite } = parseArgs(process.argv.slice(2))

  const byTest = new Map<string, string[]>()
  const glob = new Bun.Glob(
    path.posix.join(input.replaceAll('\\', '/'), '**/*.txt'),
  )
  for await (const p of glob.scan()) {
    const rel = p.replaceAll('\\', '/')
    const relToInput = rel.startsWith(`${input}/`)
      ? rel.slice(input.length + 1)
      : rel
    const parts = relToInput.split('/')
    const firstPart = parts[0]
    if (!firstPart) continue
    const testId = parts.length > 1 ? firstPart : '_root'
    if (!byTest.has(testId)) byTest.set(testId, [])
    byTest.get(testId)?.push(rel)
  }

  for (const [testId, files] of [...byTest.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const readingSections: ReadingSection[] = []
    const listeningSections: ListeningSection[] = []

    for (const file of [...files].sort()) {
      const text = await Bun.file(file).text()
      const parsed = parseFileToTestSections(text)
      readingSections.push(...parsed.readingSections)
      listeningSections.push(...parsed.listeningSections)
    }

    const test: Test = { type: 'Test', readingSections, listeningSections }
    const outPath = path.join(output, `${testId}.json`)
    await mkdir(path.dirname(outPath), { recursive: true })
    const outFile = Bun.file(outPath)
    if ((await outFile.exists()) && !overwrite) {
      throw new Error(`Refusing to overwrite: ${outPath} (pass --overwrite)`)
    }
    await Bun.write(outPath, JSON.stringify(test, null, 2) + '\n')
  }
}

await main()
