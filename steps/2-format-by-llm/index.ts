import { User } from '@evex/rakutenai'
import { Glob } from 'bun'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import dedent from 'ts-dedent'
import { EIKEN_SECTIONS } from './eiken'
import { mkdir } from 'node:fs/promises'
import pLimit from 'p-limit'

async function processFile(filePath: string) {
  console.log('Processing file:', filePath)
  const name = path.basename(filePath)
  const [grade, yearStr, adminStr] = name.replace('.pdf', '').split('_')
  const year = Number.parseInt(yearStr ?? '0', 10)
  const admin = Number.parseInt(adminStr ?? '0', 10)
  const sections = EIKEN_SECTIONS[grade as keyof typeof EIKEN_SECTIONS]

  const user = await User.create()

  const uploaded = await user.uploadFile({
    file: new File([Bun.file(filePath)], name, {
      type: 'application/pdf',
    }),
  })

  async function processSection(section: string) {
    const thread = await user.createThread()
    const stream = thread.sendMessage({
      mode: 'AI_READ',
      contents: [
        {
          type: 'text',
          text: dedent`
            問題文をXMLで出力。インデント改行なしのminifyされたXML。PDFをそのままではなく、PDFの読み取りでスペースがなくなるなどの誤差は補正する。
            セクション「${section}」をターゲットにし、その部分を完全に出力
            使えるタグ
            * <reading_sections>および<listening_sections> ルートで使う XML
            * <section idx=".."> セクションで区切る。リスニングやリーディングセクションかパート。リーディングは1から5、リスニングは1から4まである
            * <question type=".." for=".." index=".."> 問題で区切る。
              * type ... その質問の種類。空欄補充:fill, 文の続きを選択:completion, 正しい文を選択: sentence, 分類不可: other
              * for ... contentを参照している場合はそのindexをforに入れる
              * <body> 問題文
                * 空欄補充の場合、空欄を <blank index=".."> で使う
                * 親には必ず question を持つ
              * <choices> 親には必ず question を持つ
                * <choice answer index=".." blankFor="..."> 選択肢、解答である場合は answer論理属性をつける、blankに結びついている場合は blankFor
            * <content index="..." type=""> パラグラフ。typeは、メールはemail,長文はparagraph,リスニングの文字起こしはscript,会話はconversation
              * 空欄補充の場合、空欄を <blank id=".."> で使う
              * type=conversation の場合、<line speaker="..">..</line> を子にする
            `,
        },
        {
          type: 'file',
          file: uploaded,
        },
      ],
    })
    console.log(`\tSent request for section ${section} on file ${name}`)
    let text = ''
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        text += chunk.text
      }
    }
    thread.close()
    return text
  }

  const processed: { reading: string[]; listening: string[] } = {
    reading: [],
    listening: [],
  }

  for (let i = 1; i <= sections.reading; i++) {
    const res = await processSection(`リーディングセクション${i}`)
    processed.reading.push(res)
  }
  for (let i = 1; i <= sections.listening; i++) {
    const res = await processSection(`リスニングPart${i}`)
    processed.listening.push(res)
  }
  const outPath = path.join('./data/output/', name.replace('.pdf', ''))
  await mkdir(path.dirname(outPath), { recursive: true })
  for (const [idx, content] of processed.reading.entries()) {
    await Bun.write(path.join(outPath, `reading_${idx + 1}.txt`), content)
  }
  for (const [idx, content] of processed.listening.entries()) {
    await Bun.write(path.join(outPath, `listening_${idx + 1}.txt`), content)
  }
}

const limit = pLimit(5) // Limit to 5 concurrent processes
const promises: Promise<void>[] = []
for await (const file of new Glob('./data/eiken_combined/*.pdf').scan()) {
  const name = path.basename(file)
  if (existsSync(path.join('./data/output', name.replace('.pdf', '')))) {
    console.log('Skipping existing:', name)
    continue
  }
  promises.push(limit(() => processFile(file)))
}

await Promise.all(promises)
console.log('All done!')
