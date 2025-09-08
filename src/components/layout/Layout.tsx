import React from 'react'
import { Outlet } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'

export function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
      <Toaster />
    </div>
  )
}