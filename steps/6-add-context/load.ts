const csv = await Bun.file(
  './data/wordlist-scores/vocablist_by_grade.csv',
).text()
const rows = csv.split('\n').slice(1) // ヘッダー行を除く

const cols = [
  'vocab',
  'type',
  'score_1',
  'score_pre1',
  'score_2',
  'score_pre2',
  'score_3',
  'score_4',
  'score_5',
  'count_1',
  'count_pre1',
  'count_2',
  'count_pre2',
  'count_3',
  'count_4',
  'count_5',
  'rank_1',
  'rank_pre1',
  'rank_2',
  'rank_pre2',
  'rank_3',
  'rank_4',
  'rank_5',
] as const
export const source = (rows.map((row) =>
  Object.fromEntries(
    row.split(',').map((cell, i) => {
      const num = Number.parseFloat(cell)
      const val = Number.isNaN(num) ? cell : num
      return [cols[i], val] as const
    }),
  ),
) as (Record<(typeof cols)[number], string | number> & {
  vocab: string
  type: 'unigram' | 'phrase'
})[])
