import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface DestructiveConfirmDialogProps {
  trigger: React.ReactElement
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
}

export function DestructiveConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Apagar tudo',
  onConfirm,
}: DestructiveConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const confirm = async () => {
    setConfirming(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={confirming} />}>Cancelar</DialogClose>
          <Button variant="destructive" disabled={confirming} onClick={confirm}>
            {confirming ? 'Apagando...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
