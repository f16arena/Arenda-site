"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import type { ChatView } from "./chat-view"

type ChatViewProps = ComponentProps<typeof ChatView>

const ChatViewChunk = dynamic(
  () => import("./chat-view").then((mod) => mod.ChatView),
  {
    ssr: false,
    loading: () => <ChatSkeleton />,
  },
)

export function ChatViewLoader(props: ChatViewProps) {
  return <ChatViewChunk {...props} />
}

function ChatSkeleton() {
  return (
    <div className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2 border-b border-slate-100 p-4 dark:border-slate-800 lg:border-b-0 lg:border-r">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="flex flex-col p-5">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="mt-8 flex-1 space-y-3">
          <div className="h-12 w-2/3 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="ml-auto h-12 w-1/2 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-12 w-3/5 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="mt-5 h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}
