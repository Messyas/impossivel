import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ImagePlus, KeyRound, Loader2, Monitor, Moon, RotateCcw, Sun, UserRound } from 'lucide-react'
import { useUserPreferences, type Font, type Locale, type Theme } from '@/hooks/use-user-preferences'
import { useTranslation } from '@/lib/i18n'
import { processAvatarImage } from '@/lib/image-processor'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { safeInvoke, isTauri } from '@/lib/ipc'
import { Switch } from '@/components/ui/switch'

type AgentSettings = { enabled:boolean; port:number; endpoint:string }
type AgentTokenInfo = { client:string; created_at:string }
type AgentHistoryItem = { client:string; operation:string; summary:string; created_at:string }
type PendingAgentDeletion = { id:string; client:string; entity_type:string; entity_id:string; summary:string; created_at:string }

const themes: { value: Theme; labelKey: 'settings.themeSystem' | 'settings.themeLight' | 'settings.themeDark'; descKey: 'settings.themeSystemDesc' | 'settings.themeLightDesc' | 'settings.themeDarkDesc'; icon: typeof Sun }[] = [
  { value: 'system', labelKey: 'settings.themeSystem', descKey: 'settings.themeSystemDesc', icon: Monitor },
  { value: 'light', labelKey: 'settings.themeLight', descKey: 'settings.themeLightDesc', icon: Sun },
  { value: 'dark', labelKey: 'settings.themeDark', descKey: 'settings.themeDarkDesc', icon: Moon },
]

const fonts: { value: Font; labelKey: 'settings.fontGeist' | 'settings.fontInter' | 'settings.fontSerif' }[] = [
  { value: 'geist', labelKey: 'settings.fontGeist' },
  { value: 'inter', labelKey: 'settings.fontInter' },
  { value: 'serif', labelKey: 'settings.fontSerif' },
]

const locales: { value: Locale; label: string; nativeLabel: string }[] = [
  { value: 'pt-BR', label: 'Português (BR)', nativeLabel: 'Português' },
  { value: 'en-US', label: 'English (US)', nativeLabel: 'English' },
  { value: 'es', label: 'Español', nativeLabel: 'Español' },
  { value: 'fr', label: 'Français', nativeLabel: 'Français' },
]

function initials(name: string) {
  if (!name.trim()) return 'US'
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function SettingsView() {
  const { preferences, update, reset } = useUserPreferences()
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [agent,setAgent]=useState<AgentSettings>({enabled:false,port:48731,endpoint:'http://127.0.0.1:48731/mcp'})
  const [agentTokens,setAgentTokens]=useState<AgentTokenInfo[]>([])
  const [agentHistory,setAgentHistory]=useState<AgentHistoryItem[]>([])
  const [pendingDeletes,setPendingDeletes]=useState<PendingAgentDeletion[]>([])
  const [portDraft,setPortDraft]=useState('48731')
  const [newTokens,setNewTokens]=useState<Record<string,string>>({})
  const [agentMessage,setAgentMessage]=useState('')
  const [agentClient,setAgentClient]=useState<'codex'|'claude'|'antigravity'>('codex')
  const [copied,setCopied]=useState(false)

  const loadAgents=async()=>{if(!isTauri())return;try{const [config,tokens,history,pending]=await Promise.all([safeInvoke<AgentSettings>('get_agent_settings'),safeInvoke<AgentTokenInfo[]>('list_agent_tokens'),safeInvoke<AgentHistoryItem[]>('get_agent_history'),safeInvoke<PendingAgentDeletion[]>('get_pending_deletions')]);setAgent(config);setPortDraft(String(config.port));setAgentTokens(tokens);setAgentHistory(history);setPendingDeletes(pending)}catch(e){console.error('Falha ao carregar a integração MCP',e)}}
  useEffect(()=>{void loadAgents()},[])
  const configureAgent=async(enabled:boolean)=>{try{await safeInvoke('set_agent_enabled',{enabled});setAgent(v=>({...v,enabled}));setAgentMessage(enabled?'MCP local ativado. O agente precisa se reconectar.':'Integração desativada e tokens revogados.');if(!enabled){setAgentTokens([]);setNewTokens({})}}catch(e){setAgentMessage(e instanceof Error?e.message:'Não foi possível alterar a integração.')}}
  const generateToken=async(client:string)=>{try{const token=await safeInvoke<string>('generate_agent_token',{client});setNewTokens(v=>({...v,[client]:token}));await loadAgents();setAgentClient(client as typeof agentClient);setAgentMessage(`Token do ${client} criado. Copie agora para concluir a configuração.`)}catch(e){setAgentMessage(e instanceof Error?e.message:'Não foi possível gerar o token.')}}
  const revokeToken=async(client:string)=>{try{await safeInvoke('revoke_agent_token',{client});setNewTokens(v=>({...v,[client]:''}));await loadAgents();setAgentMessage(`Acesso do ${client} revogado.`)}catch(e){setAgentMessage(e instanceof Error?e.message:'Não foi possível revogar o token.')}}
  const saveAgentPort=async()=>{const port=Number(portDraft);try{await safeInvoke('set_agent_port',{port});await loadAgents();setAgentMessage('Porta MCP atualizada. Reconecte o cliente.')}catch(e){setAgentMessage(e instanceof Error?e.message:'Não foi possível alterar a porta.')}}
  const resolveDeletion=async(id:string,approve:boolean)=>{try{await safeInvoke('resolve_pending_deletion',{id,approve});await loadAgents();setAgentMessage(approve?'Exclusão confirmada.':'Solicitação de exclusão rejeitada.')}catch(e){setAgentMessage(e instanceof Error?e.message:'Não foi possível resolver a exclusão.')}}
  const configText=()=>{const token=newTokens[agentClient];if(!token)return 'Gere um token para ver a configuração de conexão.';const headers={Authorization:`Bearer ${token}`};if(agentClient==='codex')return `[mcp_servers.study_os]\nurl = "${agent.endpoint}"\nhttp_headers = { Authorization = "Bearer ${token}" }`;return JSON.stringify({mcpServers:{study_os:agentClient==='claude'?{type:'http',url:agent.endpoint,headers}:{serverUrl:agent.endpoint,headers}}},null,2)}
  const copyConfig=async()=>{try{await navigator.clipboard.writeText(configText());setCopied(true);setAgentMessage('Configuração copiada. Adicione-a ao arquivo MCP da ferramenta e reinicie a conexão.');window.setTimeout(()=>setCopied(false),1500)}catch{setAgentMessage('A cópia automática falhou. Selecione o texto de configuração e copie manualmente.')}}

  const change = (patch: Parameters<typeof update>[0]) => {
    update(patch)
    setSaved(true)
    setErrorMsg(null)
    window.setTimeout(() => setSaved(false), 1800)
  }

  const handleImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setProcessing(true)
      setErrorMsg(null)
      const compressedDataUrl = await processAvatarImage(file, { maxSizePx: 256, quality: 0.85 })
      change({ avatar: compressedDataUrl })
    } catch (err) {
      console.error('Failed to process avatar image:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao processar imagem.')
    } finally {
      setProcessing(false)
      // Reset input value so the same file can be selected again
      if (event.target) event.target.value = ''
    }
  }

  return (
    <section className="flex w-full flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('settings.eyebrow')}</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
            <p className="mt-2 text-muted-foreground">{t('settings.subtitle')}</p>
          </div>
          {saved && (
            <Alert className="w-fit py-2">
              <Check className="size-4 text-primary" />
              <AlertTitle className="text-sm">{t('settings.saved')}</AlertTitle>
            </Alert>
          )}
        </div>
      </header>

      {errorMsg && (
        <Alert variant="destructive" className="w-full">
          <AlertTitle>Erro no upload</AlertTitle>
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.profileTitle')}</CardTitle>
                <CardDescription>{t('settings.profileDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                  <Avatar className="size-20 border">
                    <AvatarImage src={preferences.avatar || undefined} alt={`Foto de ${preferences.name}`} />
                    <AvatarFallback className="text-lg">{initials(preferences.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" disabled={processing} onClick={() => fileRef.current?.click()}>
                        {processing ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus data-icon="inline-start" />}
                        {processing ? t('settings.processingPhoto') : t('settings.changePhoto')}
                      </Button>
                      {preferences.avatar && !processing && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => change({ avatar: '' })}>
                          {t('settings.removePhoto')}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('settings.photoHelp')}</p>
                    <input
                      ref={fileRef}
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleImage}
                    />
                  </div>
                </div>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="display-name">{t('settings.displayName')}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="display-name"
                      value={preferences.name}
                      onChange={(event) => change({ name: event.target.value })}
                      placeholder={t('settings.displayNamePlaceholder')}
                    />
                    <span className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                      <UserRound className="size-4" />
                      {t('settings.displayNameHelp')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound className="size-4"/>Integrações de IA</CardTitle>
                <CardDescription>Conecte Codex, Claude Code ou Antigravity ao Study/OS por MCP local. O app precisa estar aberto para o agente acessar seus estudos.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">Acesso MCP local</p><p className="text-xs text-muted-foreground">Somente conexões locais autorizadas com token.</p></div><Switch checked={agent.enabled} onCheckedChange={(checked)=>void configureAgent(checked)} aria-label="Ativar integração MCP"/></div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="agent-port">Porta local</Label><Input id="agent-port" type="number" min={1024} max={65535} value={portDraft} onChange={e=>setPortDraft(e.target.value)} disabled={!agent.enabled}/></div><Button variant="outline" onClick={()=>void saveAgentPort()} disabled={!agent.enabled||Number(portDraft)===agent.port}>Alterar porta</Button></div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="agent-client">Ferramenta</Label><select id="agent-client" value={agentClient} onChange={e=>setAgentClient(e.target.value as typeof agentClient)} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="antigravity">Antigravity</option></select></div><div className="space-y-2"><Label>Servidor MCP</Label><code className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-xs">{agent.endpoint}</code></div><Button disabled={!agent.enabled} onClick={()=>void generateToken(agentClient)}><KeyRound className="size-4"/>Gerar token</Button></div>
                {newTokens[agentClient]&&<div className="space-y-2"><Label>Token novo · aparece somente nesta sessão</Label><code className="block break-all rounded-lg border bg-muted/40 p-3 text-xs">{newTokens[agentClient]}</code><p className="text-xs text-muted-foreground">Criar um token novo revoga o anterior desta ferramenta.</p></div>}
                <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="agent-config">Configuração do cliente</Label><Button size="sm" variant="outline" onClick={()=>void copyConfig()} disabled={!newTokens[agentClient]}>{copied?<Check className="size-4"/>:<Copy className="size-4"/>}Copiar</Button></div><Textarea id="agent-config" value={configText()} readOnly rows={agentClient==='codex'?3:8} className="font-mono text-xs"/><p className="text-xs text-muted-foreground">Cole no arquivo de configuração MCP da ferramenta. O agente conecta ao serviço do próprio app; nenhum login ou chave de API é solicitado pelo Study/OS.</p></div>
                {agentTokens.length>0&&<div className="space-y-2"><Label>Acessos autorizados</Label>{agentTokens.map(item=><div key={item.client} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"><span className="text-sm capitalize">{item.client} · {new Date(item.created_at).toLocaleDateString(preferences.locale)}</span><Button size="sm" variant="ghost" className="text-destructive" onClick={()=>void revokeToken(item.client)}>Revogar</Button></div>)}</div>}
                {pendingDeletes.length>0&&<div className="space-y-2"><Label>Exclusões aguardando sua decisão</Label>{pendingDeletes.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div className="min-w-0"><p className="text-sm font-medium">{item.summary}</p><p className="text-xs text-muted-foreground">{item.entity_type} · pedido por {item.client}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>void resolveDeletion(item.id,false)}>Rejeitar</Button><Button size="sm" variant="destructive" onClick={()=>void resolveDeletion(item.id,true)}>Excluir</Button></div></div>)}</div>}
                {agentHistory.length>0&&<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Histórico recente ({agentHistory.length})</summary><div className="mt-3 max-h-52 space-y-2 overflow-auto">{agentHistory.map((item,index)=><div key={`${item.created_at}-${index}`} className="border-t pt-2"><p className="text-xs">{item.summary}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.client} · {item.operation} · {new Date(item.created_at).toLocaleString(preferences.locale)}</p></div>)}</div></details>}
                {agentMessage&&<p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground" role="status">{agentMessage}</p>}
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.themeTitle')}</CardTitle>
                <CardDescription>{t('settings.themeDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {themes.map(({ value, labelKey, descKey, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => change({ theme: value })}
                    className={`flex flex-col gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-accent ${
                      preferences.theme === value ? 'border-primary bg-accent/50' : 'border-border'
                    }`}
                    aria-pressed={preferences.theme === value}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="size-5" />
                      <span
                        className={`flex size-5 items-center justify-center rounded-full border ${
                          preferences.theme === value ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                        }`}
                      >
                        {preferences.theme === value && <Check className="size-3" />}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{t(labelKey)}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(descKey)}</p>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.typographyTitle')}</CardTitle>
                <CardDescription>{t('settings.typographyDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {fonts.map(({ value, labelKey }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => change({ font: value })}
                    className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent ${
                      preferences.font === value ? 'border-primary bg-accent/50' : 'border-border'
                    }`}
                    aria-pressed={preferences.font === value}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t(labelKey)}</span>
                      {preferences.font === value && <Check className="size-4 text-primary" />}
                    </div>
                    <span className={value === 'serif' ? 'font-serif text-base' : 'font-sans text-base'}>{t('settings.fontSample')}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.languageTitle')}</CardTitle>
                <CardDescription>{t('settings.languageDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {locales.map(({ value, label, nativeLabel }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => change({ locale: value })}
                    className={`flex items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-accent ${
                      preferences.locale === value ? 'border-primary bg-accent/50' : 'border-border'
                    }`}
                    aria-pressed={preferences.locale === value}
                  >
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">{nativeLabel}</span>
                    </span>
                    {preferences.locale === value && <Check className="size-4 text-primary" />}
                  </button>
                ))}
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  reset()
                  setSaved(true)
                }}
              >
                <RotateCcw data-icon="inline-start" />
                {t('settings.restoreDefaults')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
