import { useState } from 'react'
import { Settings, Sun, Moon, Monitor, Type, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { usePreferencesStore, type Theme, type FontFamily } from '@/stores/preferencesStore'

export function SettingsButton() {
  const { theme, fontFamily, fontSize, setTheme, setFontFamily, setFontSize } = usePreferencesStore()
  const [isOpen, setIsOpen] = useState(false)

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Chiaro', icon: <Sun className="w-4 h-4" /> },
    { value: 'dark', label: 'Scuro', icon: <Moon className="w-4 h-4" /> },
    { value: 'system', label: 'Sistema', icon: <Monitor className="w-4 h-4" /> },
  ]

  const fonts: { value: FontFamily; label: string }[] = [
    { value: 'system', label: 'Sistema' },
    { value: 'inter', label: 'Inter' },
    { value: 'roboto', label: 'Roboto' },
    { value: 'open-sans', label: 'Open Sans' },
    { value: 'lato', label: 'Lato' },
    { value: 'montserrat', label: 'Montserrat' },
  ]

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(12, Math.min(24, fontSize + delta))
    setFontSize(newSize)
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center">
          <Settings className="w-4 h-4 mr-2" />
          Impostazioni
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        {themes.map((t) => (
          <DropdownMenuItem
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={theme === t.value ? 'bg-accent' : ''}
          >
            <span className="mr-2">{t.icon}</span>
            {t.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Font</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Type className="w-4 h-4 mr-2" />
            Famiglia: {fonts.find(f => f.value === fontFamily)?.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {fonts.map((f) => (
              <DropdownMenuItem
                key={f.value}
                onClick={() => setFontFamily(f.value)}
                className={fontFamily === f.value ? 'bg-accent' : ''}
              >
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Dimensione Font</DropdownMenuLabel>
        <div className="px-2 py-1.5 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleFontSizeChange(-1)}
            disabled={fontSize <= 12}
            className="h-8 w-8 p-0"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium w-12 text-center">{fontSize}px</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleFontSizeChange(1)}
            disabled={fontSize >= 24}
            className="h-8 w-8 p-0"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
