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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { User, Mail, Lock, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { createUser } from "@/actions/userActions";
import Link from "next/link";
import { useState } from "react";
import type { Gerencia } from "@/actions/gerenciaActions";
import Image from "next/image";

const formSchema = z
	.object({
		name: z
			.string()
			.min(2, { message: "El nombre debe tener al menos 2 caracteres." }),
		email: z
			.string()
			.email({ message: "Dirección de correo electrónico inválida." }),
		password: z
			.string()
			.min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
		confirmPassword: z
			.string()
			.min(6, {
				message:
					"La confirmación de contraseña debe tener al menos 6 caracteres.",
			}),
		gerenciaId: z.string({ required_error: "Debes seleccionar una gerencia." }),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Las contraseñas no coinciden.",
		path: ["confirmPassword"],
	});

interface RegisterFormProps {
	gerencias: Gerencia[];
}

export function RegisterForm({ gerencias }: RegisterFormProps) {
	const router = useRouter();
	const { toast } = useToast();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			email: "",
			password: "",
			confirmPassword: "",
			gerenciaId: undefined,
		},
	});

	async function onSubmit(values: z.infer<typeof formSchema>) {
		setIsSubmitting(true);

		try {
			const result = await createUser({
				name: values.name,
				email: values.email,
				password_unhashed: values.password,
				gerencia_id: values.gerenciaId,
			});

			if (result.error) {
				toast({
					title: "Error en el Registro",
					description: result.error,
					variant: "destructive",
				});
			} else if (result.user) {
				toast({
					title: "¡Registro Exitoso!",
					description: "Tu cuenta ha sido creada. Por favor, inicia sesión.",
				});
				router.push("/login");
			}
		} catch (error) {
			console.error("Error during registration:", error);
			toast({
				title: "Error Inesperado",
				description: "Ocurrió un error al crear la cuenta.",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="mx-auto w-full max-w-md">
			<div className="text-center mb-6">
				<Image
					src="https://files.catbox.moe/bcvcp4.png"
					alt="JOE Logo"
					width={192}
					height={192}
					className="mx-auto mb-4"
				/>
				<h1 className="text-2xl md:text-3xl font-bold font-headline">
					Crea tu cuenta en <span className="text-accent">JOE</span>
				</h1>
				<p className="text-muted-foreground mt-2 text-sm">
					Regístrate para empezar a enviar mensajes.
				</p>
			</div>
			<Card className="w-full shadow-xl border-none bg-card/80 backdrop-blur-sm">
				<CardHeader className="pb-4">
					<CardTitle className="text-xl text-center">
						Registro de Nuevo Usuario
					</CardTitle>
					<CardDescription className="text-center">
						Completa tus datos para crear una cuenta.
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-0">
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Nombre</FormLabel>
										<div className="relative">
											<User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
											<FormControl>
												<Input
													placeholder="Tu nombre"
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
								name="gerenciaId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Gerencia</FormLabel>
										<div className="relative">
											<Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
												disabled={isSubmitting}>
												<FormControl>
													<SelectTrigger className="pl-10 bg-background/70">
														<SelectValue placeholder="Selecciona tu gerencia" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{gerencias.map((gerencia) => (
														<SelectItem key={gerencia.id} value={gerencia.id}>
															{gerencia.nombre}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<FormMessage />
									</FormItem>
								)}
							/>
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
							<FormField
								control={form.control}
								name="confirmPassword"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Confirmar Contraseña</FormLabel>
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
							<Button type="submit" className="w-full" disabled={isSubmitting}>
								{isSubmitting ? "Creando cuenta..." : "Crear Cuenta"}
							</Button>
						</form>
						<p className="mt-6 text-center text-sm text-muted-foreground">
							¿Ya tienes una cuenta?{" "}
							<Link
								href="/login"
								className="font-semibold text-primary hover:underline">
								Inicia sesión aquí
							</Link>
						</p>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
