import { useEffect, useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, MoreHorizontal, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAccounts, FrontendAccount } from '@/hooks/use-tauri-data'
import { useTranslation } from '@/lib/i18n'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { DestructiveConfirmDialog } from '@/components/ui/destructive-confirm-dialog'

export type Credential = { id: string; label: string; type: string; value: string; active: boolean }
export type Account = FrontendAccount

const services = ['OpenAI', 'Anthropic', 'Google Cloud', 'Groq', 'GitHub', 'Vercel', 'Other']
const purposes = ['Main', 'Personal', 'Development', 'Testing', 'Backup', 'Free Tier', 'Other']
const statuses = ['Active', 'Backup', 'Inactive', 'Disabled']
const freeTiers = ['Unknown', 'Available', 'In Use', 'Exhausted', 'Resets Soon']

const SelectField = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) => (
  <Field>
    <FieldLabel>{label}</FieldLabel>
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((x) => (
            <SelectItem key={x} value={x}>
              {x}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
)

const StatusBadge = ({ children }: { children: React.ReactNode }) => (
  <Badge variant="outline" className="font-normal text-muted-foreground">
    {children}
  </Badge>
)

export function CredentialCreateDialog({
  onSave,
  trigger,
}: {
  onSave: (cred: { label: string; type: string; value: string; active: boolean }) => void
  trigger?: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [type, setType] = useState('API Key')
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [active, setActive] = useState(true)

  const save = () => {
    if (!label.trim() || !value.trim()) return
    onSave({ label: label.trim(), type, value: value.trim(), active })
    setLabel('')
    setValue('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button variant="outline" size="sm"><Plus data-icon="inline-start" />Nova Credencial</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Credencial Criptografada</DialogTitle>
          <DialogDescription>
            Cadastre uma chave de API, token ou segredo. O valor sensível será criptografado via AES-256-GCM no SQLite.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="pt-2">
          <Field>
            <FieldLabel>Rótulo / Nome da Credencial</FieldLabel>
            <Input
              autoFocus
              placeholder="ex: Chave API Produção, Token JWT"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <SelectField
            label="Tipo de Credencial"
            value={type}
            onChange={setType}
            options={['API Key', 'Bearer Token', 'OAuth Secret', 'Password', 'SSH Key', 'Other']}
          />
          <Field>
            <FieldLabel>Chave / Valor Confidencial (Secret)</FieldLabel>
            <div className="relative flex items-center">
              <Input
                type={showValue ? 'text' : 'password'}
                placeholder="sk-proj-..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="pr-10 font-mono text-xs"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-1 size-7 text-muted-foreground"
                onClick={() => setShowValue(!showValue)}
              >
                {showValue ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
          </Field>
          <label className="flex items-center gap-3 pt-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(Boolean(v))} />
            Credencial ativa para uso
          </label>
        </FieldGroup>
        <DialogFooter className="mt-4">
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button disabled={!label.trim() || !value.trim()} onClick={save}>
            Salvar Credencial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AccountForm({
  draft,
  setDraft,
  password,
  setPassword,
}: {
  draft: Account
  setDraft: (a: Account) => void
  password: string
  setPassword: (password: string) => void
}) {
  const patch = (p: Partial<Account>) => setDraft({ ...draft, ...p })
  const [showPassword, setShowPassword] = useState(false)

  return (
    <FieldGroup className="pt-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Serviço" value={draft.service} onChange={(service) => patch({ service })} options={services} />
        <Field>
          <FieldLabel>Nome da conta</FieldLabel>
          <Input autoFocus placeholder="Ex.: Conta principal" value={draft.label} onChange={(e) => patch({ label: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel>E-mail</FieldLabel>
          <Input type="email" placeholder="nome@exemplo.com" value={draft.email} onChange={(e) => patch({ email: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel>
            Senha {draft.id && <span className="font-normal text-muted-foreground">(deixe vazia para manter)</span>}
          </FieldLabel>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder={draft.id ? 'Digite apenas para alterar' : 'Digite a senha'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel>Usuário <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
          <Input value={draft.username || ''} onChange={(e) => patch({ username: e.target.value })} />
        </Field>
        <SelectField label="Finalidade" value={draft.purpose} onChange={(purpose) => patch({ purpose })} options={purposes} />
        <SelectField label="Status" value={draft.status} onChange={(status) => patch({ status })} options={statuses} />
        <SelectField label="Plano" value={draft.plan} onChange={(plan) => patch({ plan })} options={['Free', 'Trial', 'Paid', 'Student', 'Custom', 'Hobby']} />
      </div>
      <Field>
        <FieldLabel>Notas <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
        <Textarea className="min-h-24" placeholder="Informações úteis sobre esta conta" value={draft.notes || ''} onChange={(e) => patch({ notes: e.target.value })} />
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <Checkbox checked={draft.inUse} onCheckedChange={(v) => patch({ inUse: Boolean(v) })} />
        Esta conta está em uso
      </label>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <KeyRound className="size-3.5" />
        A senha é armazenada com criptografia AES-256-GCM.
      </p>
    </FieldGroup>
  )
}

function LegacyAccountForm({ draft, setDraft }: { draft: Account; setDraft: (a: Account) => void }) {
  const patch = (p: Partial<Account>) => setDraft({ ...draft, ...p })

  return (
    <Tabs defaultValue="general" className="w-full">
      <TabsList className="grid w-full grid-cols-4 bg-muted p-1">
        <TabsTrigger value="general">Geral</TabsTrigger>
        <TabsTrigger value="credentials">Credenciais</TabsTrigger>
        <TabsTrigger value="usage">Uso</TabsTrigger>
        <TabsTrigger value="notes">Notas</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="pt-4">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Service" value={draft.service} onChange={(service) => patch({ service })} options={services} />
            <Field>
              <FieldLabel>Account label</FieldLabel>
              <Input value={draft.label} onChange={(e) => patch({ label: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input type="email" value={draft.email} onChange={(e) => patch({ email: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>Username</FieldLabel>
              <Input value={draft.username || ''} onChange={(e) => patch({ username: e.target.value })} />
            </Field>
            <SelectField label="Purpose" value={draft.purpose} onChange={(purpose) => patch({ purpose })} options={purposes} />
            <SelectField label="Status" value={draft.status} onChange={(status) => patch({ status })} options={statuses} />
            <SelectField label="Plan" value={draft.plan} onChange={(plan) => patch({ plan })} options={['Free', 'Trial', 'Paid', 'Student', 'Custom', 'Hobby']} />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox checked={draft.inUse} onCheckedChange={(v) => patch({ inUse: Boolean(v) })} />
            This account is currently in use
          </label>
        </FieldGroup>
      </TabsContent>
      <TabsContent value="credentials" className="pt-4">
        <div className="flex flex-col gap-3">
          <Alert>
            <ShieldAlert />
            <AlertTitle>Credenciais Criptografadas</AlertTitle>
            <AlertDescription>Os valores sensíveis são protegidos com criptografia AES-256-GCM antes de serem armazenados no banco SQLite.</AlertDescription>
          </Alert>
          {draft.credentials.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center gap-3 py-4">
                <KeyRound className="size-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.label}</span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">{c.type}</Badge>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">{c.value}</div>
                </div>
                <StatusBadge>{c.active ? 'Ativa' : 'Inativa'}</StatusBadge>
                <Button size="icon" variant="ghost" aria-label="Remove credential" onClick={() => patch({ credentials: draft.credentials.filter((x) => x.id !== c.id) })}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
          <div className="pt-2">
            <CredentialCreateDialog
              onSave={(newCred) =>
                patch({
                  credentials: [
                    ...draft.credentials,
                    { id: `temp-${Date.now()}`, label: newCred.label, type: newCred.type, value: newCred.value, active: newCred.active },
                  ],
                })
              }
            />
          </div>
        </div>
      </TabsContent>
      <TabsContent value="usage" className="pt-4">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Free Tier Status" value={draft.freeTier} onChange={(freeTier) => patch({ freeTier })} options={freeTiers} />
            <Field>
              <FieldLabel>Credits remaining</FieldLabel>
              <Input value={draft.credits || ''} onChange={(e) => patch({ credits: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>Free tier reset date</FieldLabel>
              <Input type="date" />
            </Field>
            <Field>
              <FieldLabel>Last used</FieldLabel>
              <Input value={draft.lastUsed} onChange={(e) => patch({ lastUsed: e.target.value })} />
            </Field>
          </div>
          <Field>
            <FieldLabel>Usage notes</FieldLabel>
            <Textarea placeholder="Use this account when the main quota is exhausted." />
          </Field>
        </FieldGroup>
      </TabsContent>
      <TabsContent value="notes" className="pt-4">
        <FieldGroup>
          <Field>
            <FieldLabel>Personal notes</FieldLabel>
            <Textarea className="min-h-40" value={draft.notes || ''} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Tags</FieldLabel>
            <Input
              value={(draft.tags || []).join(', ')}
              onChange={(e) =>
                patch({
                  tags: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
              placeholder="api, free-tier, backup"
            />
          </Field>
        </FieldGroup>
      </TabsContent>
    </Tabs>
  )
}

const blankAccount = (): Account => ({
  id: '',
  service: 'OpenAI',
  label: '',
  email: '',
  username: '',
  purpose: 'Development',
  status: 'Active',
  freeTier: 'Unknown',
  lastUsed: 'Never',
  plan: 'Free',
  inUse: false,
  notes: '',
  tags: [],
  credits: '',
  credentials: [],
})

function AccountDialog({
  account,
  onSave,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: {
  account?: Account
  onSave: (a: Account) => void
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? (setControlledOpen ?? (() => {})) : setInternalOpen
  const [draft, setDraft] = useState<Account>(account ?? blankAccount())
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(account ?? blankAccount())
      setPassword('')
    }
  }, [open, account])

  const save = () => {
    if (!draft.label.trim() || !draft.email.trim() || (!account && !password)) return
    onSave({ ...draft, credentials: password ? [{ id: '', label: 'Senha', type: 'Password', value: password, active: true }] : draft.credentials })
    setOpen(false)
    if (!account) setDraft(blankAccount())
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{account ? `Editar ${account.label}` : 'Nova conta'}</DialogTitle>
          <DialogDescription>
            {account ? 'Atualize os dados da conta. Preencha a senha somente se quiser alterá-la.' : 'Preencha os dados principais para cadastrar uma conta.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1">
          <AccountForm draft={draft} setDraft={setDraft} password={password} setPassword={setPassword} />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button disabled={!draft.label.trim() || !draft.email.trim() || (!account && !password)} onClick={save}>
            {account ? 'Salvar alterações' : 'Criar conta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CredentialCard({ credential, onReveal }: { credential: Credential; onReveal: (id: string) => Promise<string> }) {
  const [reveal, setReveal] = useState(false)
  const [secretText, setSecretText] = useState(credential.value)

  const handleToggleReveal = async () => {
    if (!reveal) {
      const plaintext = await onReveal(credential.id)
      setSecretText(plaintext)
      setReveal(true)
    } else {
      setSecretText(credential.value)
      setReveal(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(secretText)
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <KeyRound className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{credential.label}</div>
          <div className="font-mono text-xs text-muted-foreground">{secretText}</div>
          <div className="mt-1 text-xs text-muted-foreground">Type: {credential.type}</div>
        </div>
        <StatusBadge>{credential.active ? 'Active' : 'Inactive'}</StatusBadge>
        <Button size="icon" variant="ghost" onClick={handleToggleReveal} aria-label={reveal ? 'Hide credential' : 'Reveal credential'}>
          {reveal ? <EyeOff /> : <Eye />}
        </Button>
        <Button size="icon" variant="ghost" onClick={copyToClipboard} aria-label="Copy credential">
          <Copy />
        </Button>
      </CardContent>
    </Card>
  )
}

function AccountRow({
  account,
  onRevealCredential,
  onToggle,
  onSave,
  onArchive,
  onDelete,
  onDuplicate,
}: {
  account: Account
  onRevealCredential: (id: string) => Promise<string>
  onToggle: () => void
  onSave: (a: Account) => void
  onArchive: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const { t } = useTranslation()
  const [editOpen, setEditOpen] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [revealedPassword, setRevealedPassword] = useState('')
  const passwordCredential = account.credentials.find((credential) => credential.type.toLowerCase() === 'password')

  useEffect(() => {
    setPasswordVisible(false)
    setRevealedPassword('')
  }, [passwordCredential?.id])

  const copy = (value: string) => {
    void navigator.clipboard.writeText(value)
  }

  const revealPassword = async () => {
    if (!passwordCredential) return ''
    if (revealedPassword) return revealedPassword
    const plaintext = await onRevealCredential(passwordCredential.id)
    setRevealedPassword(plaintext)
    return plaintext
  }

  const togglePassword = async () => {
    if (!passwordVisible) await revealPassword()
    setPasswordVisible((visible) => !visible)
  }

  const copyPassword = async () => {
    const plaintext = await revealPassword()
    if (plaintext) copy(plaintext)
  }

  return (
    <TableRow className="group">
      <TableCell>
        <Checkbox checked={account.inUse} onCheckedChange={onToggle} aria-label={`${t('accounts.markInUse')} ${account.label}`} />
      </TableCell>
      <TableCell className="font-medium">{account.service}</TableCell>
      <TableCell>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="text-left font-medium text-foreground hover:underline cursor-pointer"
        >
          {account.label}
        </button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-muted-foreground">{account.email}</span>
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => copy(account.email)} aria-label={`Copiar e-mail ${account.email}`} title="Copiar e-mail">
            <Copy className="size-3.5" />
          </Button>
        </div>
      </TableCell>
      <TableCell>
        {passwordCredential ? (
          <div className="flex items-center gap-1">
            <span className="min-w-20 font-mono text-xs text-muted-foreground">
              {passwordVisible ? revealedPassword : '••••••••'}
            </span>
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={togglePassword} aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'} title={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}>
              {passwordVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={copyPassword} aria-label="Copiar senha" title="Copiar senha">
              <Copy className="size-3.5" />
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <StatusBadge>{account.purpose}</StatusBadge>
      </TableCell>
      <TableCell>
        <StatusBadge>{account.status}</StatusBadge>
      </TableCell>
      <TableCell>
        <StatusBadge>{account.freeTier}</StatusBadge>
      </TableCell>
      <TableCell className="text-muted-foreground">{account.lastUsed}</TableCell>
      <TableCell className="w-20">
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon" variant="ghost" aria-label={`${t('common.actions')} ${account.label}`} />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>{t('accounts.duplicate')}</DropdownMenuItem>
                <DropdownMenuItem onClick={onArchive}>{t('accounts.archive')}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label={`Excluir conta ${account.label}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <AccountDialog account={account} onSave={onSave} open={editOpen} onOpenChange={setEditOpen} />
      </TableCell>
    </TableRow>
  )
}

export function AccountsView() {
  const { accounts, createAccount, archiveAccount, deleteAccount, clearAllAccounts, toggleAccountUse, revealCredential, page, setPage, perPage, setPerPage, cursor, setCursor, nextCursor, totalCount, totalPages, hasMore } = useAccounts()
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [service, setService] = useState('All')
  const [status, setStatus] = useState('All')
  const [tier, setTier] = useState('All')
  const [purpose, setPurpose] = useState('All')
  const [quick, setQuick] = useState('All')
  const [group, setGroup] = useState(false)
  const [exclusive, setExclusive] = useState(true)

  const save = async (a: Account) => {
    await createAccount({
      id: a.id || undefined,
      service: a.service,
      label: a.label,
      email: a.email,
      username: a.username,
      purpose: a.purpose,
      status: a.status,
      freeTier: a.freeTier,
      plan: a.plan,
      inUse: a.inUse,
      notes: a.notes,
      tags: a.tags,
      credits: a.credits,
      password: a.credentials.find((credential) => !credential.id && credential.type === 'Password')?.value,
    })
  }

  const toggle = (a: Account) => {
    toggleAccountUse(a.id)
  }

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      const q = query.toLowerCase()
      const matchQuery = !q || a.service.toLowerCase().includes(q) || a.label.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      const matchService = service === 'All' || a.service === service
      const matchStatus = status === 'All' || a.status === status
      const matchTier = tier === 'All' || a.freeTier === tier
      const matchPurpose = purpose === 'All' || a.purpose === purpose
      const matchQuick =
        quick === 'All' ||
        (quick === 'In use' && a.inUse) ||
        (quick === 'Available' && !a.inUse && a.status === 'Active') ||
        (quick === 'Exhausted' && a.status === 'Exhausted') ||
        (quick === 'Backup' && a.purpose === 'Backup')
      return matchQuery && matchService && matchStatus && matchTier && matchPurpose && matchQuick
    })
  }, [accounts, query, service, status, tier, purpose, quick])

  const services = useMemo(() => Array.from(new Set(accounts.map((a) => a.service))), [accounts])
  const statuses = useMemo(() => Array.from(new Set(accounts.map((a) => a.status))), [accounts])
  const freeTiers = useMemo(() => Array.from(new Set(accounts.map((a) => a.freeTier))), [accounts])
  const purposes = useMemo(() => Array.from(new Set(accounts.map((a) => a.purpose))), [accounts])

  const groups = useMemo(() => {
    if (!group) return [['', filtered] as const]
    const map = new Map<string, Account[]>()
    filtered.forEach((a) => {
      const list = map.get(a.service) ?? []
      list.push(a)
      map.set(a.service, list)
    })
    return Array.from(map.entries())
  }, [filtered, group])

  return (
    <>
      <div className="mb-8 flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('accounts.eyebrow')}</span>
          <h1 className="text-3xl font-semibold tracking-tight">{t('accounts.title')}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <strong className="font-mono text-sm font-semibold text-foreground">{totalCount}</strong>
            <span>{t('accounts.accountsCount')}</span>
          </span>
          <div className="flex items-center gap-2">
            <DestructiveConfirmDialog
              title="Apagar todas as contas?"
              description="Esta ação apagará permanentemente todas as contas e suas credenciais salvas. Não será possível desfazer."
              confirmLabel="Apagar contas"
              onConfirm={clearAllAccounts}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 data-icon="inline-start" className="size-4" />
                  Limpar todas
                </Button>
              }
            />
            <AccountDialog onSave={save} trigger={<Button><Plus data-icon="inline-start" />{t('accounts.addAccount')}</Button>} />
          </div>
        </div>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search accounts..." className="pl-9" />
        </div>
        {[
          [service, setService, ['All', ...services]],
          [status, setStatus, ['All', ...statuses]],
          [tier, setTier, ['All', ...freeTiers]],
          [purpose, setPurpose, ['All', ...purposes]],
        ].map(([value, setValue, options], i) => (
          <Select key={i} value={value as string} onValueChange={(v) => v && (setValue as (x: string) => void)(v)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(options as string[]).map((x) => (
                  <SelectItem key={x} value={x}>
                    {i === 0 && x === 'All'
                      ? 'Service: All'
                      : i === 1 && x === 'All'
                        ? 'Status: All'
                        : i === 2 && x === 'All'
                          ? 'Free Tier: All'
                          : i === 3 && x === 'All'
                            ? 'Purpose: All'
                            : x}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ))}
      </div>
      <div className="mb-5 flex items-center justify-between">
        <ToggleGroup value={[quick]} onValueChange={(v) => setQuick(v[0] ?? 'All')}>
          {['All', 'In use', 'Available', 'Exhausted', 'Backup'].map((x) => (
            <ToggleGroupItem key={x} value={x}>
              {x}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-5">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={exclusive} onCheckedChange={setExclusive} />
            One in use per service
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={group} onCheckedChange={setGroup} />
            Group by service
          </label>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border">
        {groups.map(([name, items]) => (
          <div key={name}>
            {name && <div className="border-b bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{name}</div>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t('accounts.inUse')}</TableHead>
                  <TableHead>{t('accounts.service')}</TableHead>
                  <TableHead>{t('accounts.accountLabel')}</TableHead>
                  <TableHead>{t('accounts.email')}</TableHead>
                  <TableHead>Senha</TableHead>
                  <TableHead>{t('accounts.purpose')}</TableHead>
                  <TableHead>{t('accounts.status')}</TableHead>
                  <TableHead>{t('accounts.freeTier')}</TableHead>
                  <TableHead>{t('accounts.lastUsed')}</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    onRevealCredential={revealCredential}
                    onToggle={() => toggle(a)}
                    onSave={save}
                    onArchive={() => archiveAccount(a.id)}
                    onDelete={() => deleteAccount(a.id)}
                    onDuplicate={() => save({ ...a, id: '', label: `${a.label} copy`, inUse: false })}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
        <PaginationControls
          page={page}
          totalPages={totalPages}
          perPage={perPage}
          hasMore={hasMore}
          onPageChange={(p) => {
            if (p > page && nextCursor) {
              setCursor(nextCursor)
            } else if (p === 1) {
              setCursor(null)
            }
            setPage(p)
          }}
          onPerPageChange={(pp) => {
            setPerPage(pp)
            setPage(1)
            setCursor(null)
          }}
        />
      </div>
    </>
  )
}
