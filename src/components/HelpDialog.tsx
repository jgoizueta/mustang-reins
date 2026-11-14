import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import help from '../help/help.md?raw'

// help.md uses site-absolute /help/… image paths; rebase them under the Vite base path.
const urlTransform = (url: string) =>
  url.startsWith('/help/') ? `${import.meta.env.BASE_URL}${url.slice(1)}` : defaultUrlTransform(url)

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(52rem,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-card shadow-2xl outline-none">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-label">Help</Dialog.Title>
            <Dialog.Close className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">How to use Mustang Reins</Dialog.Description>
          <div className="help-prose overflow-y-auto px-6 py-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform}>{help}</ReactMarkdown>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
