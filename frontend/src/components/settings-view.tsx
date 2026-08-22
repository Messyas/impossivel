import { useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, Monitor, Moon, RotateCcw, Sun, UserRound } from 'lucide-react'
import { useUserPreferences, type Font, type Locale, type Theme } from '@/hooks/use-user-preferences'
import { useTranslation } from '@/lib/i18n'
import { processAvatarImage } from '@/lib/image-processor'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

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
