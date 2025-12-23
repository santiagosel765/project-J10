
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubMenuItemDef {
  href?: string;
  label?: string;
  icon: LucideIcon;
  isSubmenu?: boolean;
  title?: string;
  subItems?: SubMenuItemDef[];
}

interface NavSubmenuProps {
  item: SubMenuItemDef;
  level: number;
}

export function NavSubmenu({ item, level }: NavSubmenuProps) {
  const pathname = usePathname();
  const Icon = item.icon;

  const isActive = item.subItems?.some(subItem => 
    subItem.isSubmenu 
      ? subItem.subItems?.some(subSubItem => pathname.startsWith(subSubItem.href!))
      : pathname.startsWith(subItem.href!)
  ) ?? false;

  const renderSubItem = (subItem: SubMenuItemDef) => {
    const SubIcon = subItem.icon;
    if (subItem.isSubmenu) {
      return (
        <DropdownMenuSub key={subItem.title}>
          <DropdownMenuSubTrigger>
            <SubIcon className="mr-2 h-4 w-4" />
            <span>{subItem.title}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              {subItem.subItems?.map(renderSubItem)}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      );
    }
    return (
      <DropdownMenuItem key={subItem.href} asChild>
        <Link href={subItem.href!} className="flex items-center">
          <SubIcon className="mr-2 h-4 w-4" />
          {subItem.label}
        </Link>
      </DropdownMenuItem>
    );
  };
  
  if (level === 0) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant={isActive ? "secondary" : "ghost"}
            className="text-sm font-medium shrink-0"
          >
            <Icon className="mr-2 h-4 w-4" />
            {item.title}
            <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {item.subItems?.map(renderSubItem)}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Nested submenu rendering
  return (
     <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon className="mr-2 h-4 w-4" />
        <span>{item.title}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          {item.subItems?.map(renderSubItem)}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
