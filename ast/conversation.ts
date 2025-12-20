import type { Chunk } from "./text"

export interface ConversationLine {
  type: "ConversationLine"
  speaker: string
  text: Chunk[]
}
export interface Conversation {
  type: "Conversation"
  lines: ConversationLine[]
}
