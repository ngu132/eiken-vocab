import './App.css'
import MetadataViewer from './MetadataViewer'

function App() {
  return (
    <div class="min-h-dvh bg-slate-50 text-slate-900">
      <header class="border-b bg-white">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <h1 class="truncate text-lg font-semibold">metadata.jsonl viewer</h1>
            <p class="truncate text-sm text-slate-600">
              `viewer/src/assets/metadata.jsonl` を読み込んで一覧/詳細表示します
            </p>
          </div>
          <a
            class="shrink-0 text-sm text-slate-600 hover:text-slate-900 underline underline-offset-4"
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
          >
            Solid + Vite
          </a>
        </div>
      </header>
      <main class="mx-auto max-w-6xl px-4 py-4">
        <MetadataViewer />
      </main>
    </div>
  )
}

export default App
