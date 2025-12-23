

"use client";
import Header from '@/components/layout/Header';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, FileText, ListChecks, Scale, Network, ShieldCheck, Users, PieChart, Ban, BarChart3 } from 'lucide-react'; 
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Skeleton } from '@/components/ui/skeleton';
import { NavSubmenu } from '@/components/layout/NavSubmenu';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const userRole = session?.user?.role;

  const allNavItems = [
    { 
      isSubmenu: true,
      title: "Dashboard",
      icon: LayoutDashboard,
      roles: ['admin', 'colaborador'],
      subItems: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { 
          isSubmenu: true,
          title: "Saturación",
          icon: PieChart,
          subItems: [
            { href: "/dashboard/saturation", label: "Vista de Frecuencia", icon: PieChart },
            { href: "/dashboard/saturation/exclusions", label: "Exclusiones", icon: Ban },
          ]
        },
      ]
    },
    { 
      isSubmenu: true,
      title: "Campañas",
      icon: ListChecks,
      roles: ['admin', 'colaborador'],
      subItems: [
        { href: "/dashboard/campaigns", label: "Campañas", icon: ListChecks },
        { href: "/dashboard/templates", label: "Plantillas", icon: FileText },
      ]
    },
    { 
      isSubmenu: true,
      title: "Cobranza",
      icon: Scale,
      roles: ['admin'],
      subItems: [
        { href: "/dashboard/strategy", label: "Estrategia", icon: Network },
        { href: "/dashboard/collections", label: "Cobranza", icon: Scale },
        { href: "/dashboard/preventive-collections", label: "Prevención", icon: ShieldCheck },
      ]
    },
    { href: "/dashboard/reporting", label: "Reportería", icon: BarChart3, roles: ['admin', 'colaborador'] },
    { href: "/dashboard/users", label: "Usuarios", icon: Users, roles: ['admin'] },
  ];

  const navItems = allNavItems.filter(item => userRole && item.roles.includes(userRole));

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <nav className="bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex items-center space-x-1 h-12 overflow-x-auto whitespace-nowrap">
            {status === 'loading' && (
              <div className="flex items-center space-x-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-28" />)}
              </div>
            )}
            {status === 'authenticated' && navItems.map((item) => {
              if (item.isSubmenu) {
                return <NavSubmenu key={item.title} item={item} level={0} />;
              }
              
              const Icon = item.icon!;
              let isActive = pathname === item.href;
              if (item.href && item.href !== "/dashboard" && pathname.startsWith(item.href)) {
                isActive = true;
              }

              return (
                <Button 
                  key={item.href}
                  variant={isActive ? "secondary" : "ghost"} 
                  asChild 
                  className="text-sm font-medium shrink-0"
                >
                  <Link href={item.href!}>
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>
      </nav>
      <main className="flex-1 container mx-auto py-6 px-4 md:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
