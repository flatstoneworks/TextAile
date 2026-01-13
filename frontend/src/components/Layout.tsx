import { NavLink, Outlet } from 'react-router-dom'
import { MessageSquare, Box, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TooltipProvider } from '@/components/ui/tooltip'

const navItems = [
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/models', icon: Box, label: 'Models' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Layout() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-50 h-12 flex items-center justify-center px-4">
          <nav className="flex items-center gap-1 bg-white/5 rounded-full px-1.5 py-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
