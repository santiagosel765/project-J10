"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Mail, Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

const formSchema = z.object({
	email: z
		.string()
		.email({ message: "Dirección de correo electrónico inválida." }),
	password: z
		.string()
		.min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
});

export function LoginForm() {
	const router = useRouter();
	const { toast } = useToast();
	const searchParams = useSearchParams();
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		const error = searchParams.get("error");
		if (error) {
			let errorMessage = "Error desconocido durante el inicio de sesión.";
			switch (error.toLowerCase()) {
				case "credentialssignin":
					errorMessage =
						"Credenciales inválidas. Verifica tu correo y contraseña.";
					break;
				case "sessionrequired":
					errorMessage = "Se requiere una sesión para acceder a esta página.";
					break;
				default:
					errorMessage = `Error: ${error}. Por favor, inténtalo de nuevo.`;
			}
			toast({
				title: "Error de Autenticación",
				description: errorMessage,
				variant: "destructive",
			});
			// Clean URL without causing reload
			window.history.replaceState(null, "", "/login");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchParams]);

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	async function onSubmit(values: z.infer<typeof formSchema>) {
		setIsSubmitting(true);
		try {
			const result = await signIn("credentials", {
				redirect: false,
				email: values.email,
				password: values.password,
			});

			if (result?.error) {
				let errorMessage =
					"Credenciales inválidas. Por favor, verifica e inténtalo de nuevo.";
				if (result.error !== "CredentialsSignin") {
					errorMessage = `Error: ${result.error}`;
				}
				toast({
					title: "Error de Inicio de Sesión",
					description: errorMessage,
					variant: "destructive",
				});
			} else if (result?.ok) {
				// Just navigate to dashboard - Next.js will handle the basePath
				router.push("/dashboard");
				router.refresh(); // Refresh to update session
			}
		} catch (error) {
			console.error("Error en onSubmit signIn:", error);
			toast({
				title: "Error Inesperado",
				description: "Ocurrió un error al intentar iniciar sesión.",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="w-full bg-background px-4 py-12 sm:py-16">
			<div className="mx-auto w-full max-w-md">
				<div className="text-center mb-8">
					<Image
						src="https://files.catbox.moe/bcvcp4.png"
						alt="JOE Logo"
						width={192}
						height={192}
						className="mx-auto mb-6"
					/>
					<h1 className="text-2xl md:text-3xl font-bold font-headline">
						¡Hola, soy <span className="font-bold text-primary">Joe</span>,
						bienvenido!
					</h1>
					<p className="text-muted-foreground mt-2 text-sm">
						Plataforma de orquestación de comunicaciones.
					</p>
				</div>
				<Card className="shadow-xl border-none bg-card/80 backdrop-blur-sm">
					<CardHeader className="pb-4">
						<CardTitle className="text-xl text-center">
							Iniciar Sesión
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="space-y-6">
								<FormField
									control={form.control}
									name="email"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Correo Electrónico</FormLabel>
											<div className="relative">
												<Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
												<FormControl>
													<Input
														placeholder="tu@ejemplo.com"
														{...field}
														className="pl-10 bg-background/70"
														disabled={isSubmitting}
													/>
												</FormControl>
											</div>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Contraseña</FormLabel>
											<div className="relative">
												<Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
												<FormControl>
													<Input
														type="password"
														placeholder="••••••••"
														{...field}
														className="pl-10 bg-background/70"
														disabled={isSubmitting}
													/>
												</FormControl>
											</div>
											<FormMessage />
										</FormItem>
									)}
								/>
								<Button
									type="submit"
									className="w-full"
									disabled={isSubmitting}>
									{isSubmitting ? "Iniciando Sesión..." : "Iniciar Sesión"}
								</Button>
							</form>
						</Form>
						<p className="mt-6 text-center text-sm text-muted-foreground">
							¿No tienes una cuenta?{" "}
							<Link
								href="/register"
								className="font-semibold text-primary hover:underline">
								Regístrate aquí
							</Link>
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
