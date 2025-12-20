export interface JapaneseChunk {
  type: "JapaneseChunk"
  text: string
}
export interface EnglishChunk {
  type: "EnglishChunk"
  text: string
}
export interface BlankChunk {
  type: "BlankChunk"
  id?: string | number
}

export type Chunk = JapaneseChunk | EnglishChunk | BlankChunk

// "let's sit () on the table."" -> [{type: "EnglishChunk", text: "let's sit "}, {type: "BlankChunk"}, {type: "EnglishChunk", text: " on the table."}]
export interface Text {
  type: "Text"
  chunks: Chunk[]
}
