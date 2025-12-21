import type { ListeningSection, ReadingSection } from './section'

export interface Test {
  type: 'Test'
  readingSections: ReadingSection[]
  listeningSections: ListeningSection[]
}
