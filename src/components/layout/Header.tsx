"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, UserCircle2 } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession, signOut } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";
import { GerenciaUsageStats } from "./GerenciaUsageStats";

export default function Header() {
	const { data: session, status } = useSession();
	const user = session?.user;
	const isAdmin = user?.role === "admin";

	const getInitials = (name?: string | null, email?: string | null) => {
		if (name) {
			const parts = name.split(" ").filter((p) => p);
			if (parts.length > 1) {
				return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
			}
			return name.substring(0, 2).toUpperCase();
		}
		if (email) {
			return email.substring(0, 2).toUpperCase();
		}
		return "U";
	};

	return (
		<header className="sticky top-0 z-50 w-full border-b bg-card shadow-sm">
			<div className="container flex h-16 items-center justify-between px-4 md:px-6">
				<div className="flex items-center gap-4">
					<Link href="/dashboard" className="flex items-center gap-2">
						<Image
							src="https://files.catbox.moe/bcvcp4.png"
							alt="JOE Logo"
							width={32}
							height={32}
						/>
						<span className="text-xl sm:text-2xl font-bold font-headline text-foreground">
							JOE
						</span>
					</Link>
				</div>

				<div className="flex-1 flex justify-center">
					{status === "authenticated" && <GerenciaUsageStats />}
				</div>

				<div className="flex items-center gap-4">
					{status === "loading" && (
						<Skeleton className="h-10 w-10 rounded-full" />
					)}

					{status === "authenticated" && user && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									className="relative h-10 w-10 rounded-full">
									<Avatar className="h-10 w-10">
										{/* El objeto user de la sesión ya no tiene la propiedad 'image'.
                        Mostramos el fallback con las iniciales siempre.
                        La imagen real se obtiene en la página de perfil. */}
										<AvatarFallback>
											{getInitials(user.name, user.email)}
										</AvatarFallback>
									</Avatar>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-56" align="end" forceMount>
								<DropdownMenuLabel className="font-normal">
									<div className="flex flex-col space-y-1">
										<p className="text-sm font-medium leading-none">
											{user.name ?? "Usuario"}
										</p>
										<p className="text-xs leading-none text-muted-foreground">
											{user.email ?? "Sin correo electrónico"}
										</p>
									</div>
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem asChild>
									<Link href="/dashboard/profile">
										<UserCircle2 className="mr-2 h-4 w-4" />
										<span>Perfil</span>
									</Link>
								</DropdownMenuItem>
								{isAdmin && (
									<DropdownMenuItem asChild>
										<Link href="/dashboard/settings">
											<Settings className="mr-2 h-4 w-4" />
											<span>Configuración</span>
										</Link>
									</DropdownMenuItem>
								)}
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => signOut({ callbackUrl: "/login" })}>
									<LogOut className="mr-2 h-4 w-4" />
									<span>Cerrar sesión</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{status === "unauthenticated" && (
						<Button asChild variant="outline" size="sm">
							<Link href="/login">Iniciar Sesión</Link>
						</Button>
					)}
				</div>
			</div>
		</header>
	);
}
