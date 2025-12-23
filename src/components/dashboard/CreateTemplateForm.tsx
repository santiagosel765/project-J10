

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRouter, useSearchParams } from "next/navigation"; 
import { Save, Info, Wand2, Loader2, Paperclip, Link2, X, File, Image as ImageIcon, PhoneCall, MessageSquareReply, Pointer, AlertCircle, Bot } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createTemplate } from "@/actions/templateActions"; 
import React, { useState } from "react";
import { generateTemplate } from "@/ai/flows/generateTemplateFlow";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Image from "next/image";
import { uploadFile } from "@/actions/fileActions";

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const formSchema = z.object({
  templateName: z.string().min(3, { message: "El nombre de la plantilla debe tener al menos 3 caracteres." }),
  templateType: z.enum(["whatsapp", "sms", "email", "llamada", "llamada-ia"], { required_error: "Selecciona un tipo de plantilla." }),
  templateContent: z.string().min(1, { message: "Este campo no puede estar vacío." }),
  templateParameters: z.string().optional().refine(params => {
    if (!params || params.trim() === "") return true;
    const paramArray = params.split(',').map(p => p.trim());
    return paramArray.every(p => /^[a-zA-Z0-9_]+$/.test(p) && p.toLowerCase() !== 'contacto');
  }, { message: "Los parámetros deben ser palabras (letras, números, guión bajo) separadas por comas. El parámetro 'contacto' es implícito y no debe listarse aquí." }),
  
  linkUrl: z.string().url({ message: "Por favor, introduce una URL válida." }).optional().or(z.literal('')),
  mediaUrl: z.string().optional(),
  
  buttonType: z.enum(['none', 'call', 'reply']).optional(),
  buttonText: z.string().optional(),
  buttonValue: z.string().optional(),
  
  // Campos ocultos para resolver regla de cobranza
  daysToResolve: z.string().optional(),
  channelToResolve: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.templateType !== 'llamada-ia') {
        if (data.templateContent.length < 10) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "El contenido debe tener al menos 10 caracteres.",
                path: ["templateContent"],
            });
        }
        if (data.templateContent.includes("{{") && !data.templateContent.includes("}}")) {
             ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Los parámetros deben estar entre llaves dobles, ej: {{parametro}}.",
                path: ["templateContent"],
            });
        }
        if (data.templateType === 'sms' && data.templateContent.length > 160) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `El contenido para SMS no debe exceder los 160 caracteres. Actual: ${data.templateContent.length}.`,
                path: ["templateContent"],
            });
        }
    }
    
    if (data.buttonType === 'call' && !data.buttonValue) {
        ctx.addIssue({ code: 'custom', message: 'Se requiere un número de teléfono para el botón de llamada.', path: ['buttonValue'] });
    }
    if (data.buttonType === 'reply' && !data.buttonText) {
        ctx.addIssue({ code: 'custom', message: 'Se requiere el texto para el botón de respuesta rápida.', path: ['buttonText'] });
    }
});


export default function CreateTemplateForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams(); 

  const initialName = searchParams.get('name');
  const initialType = searchParams.get('type') as 'whatsapp' | 'sms' | 'email' | 'llamada' | 'llamada-ia' | null;
  const initialDaysToResolve = searchParams.get('daysToResolve');
  const initialChannelToResolve = searchParams.get('channelToResolve');
  const fromStrategy = searchParams.get('from') === 'strategy';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [mediaFileType, setMediaFileType] = useState<string | undefined>(undefined);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // AI State
  const [aiObjective, setAiObjective] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      templateName: initialName || "",
      templateType: initialType || undefined,
      templateContent: "",
      templateParameters: "",
      daysToResolve: initialDaysToResolve || undefined,
      channelToResolve: initialChannelToResolve || undefined,
      linkUrl: "",
      mediaUrl: "",
      buttonType: 'none',
      buttonText: '',
      buttonValue: '',
    },
  });
  
  const templateType = form.watch("templateType");
  const templateContent = form.watch("templateContent");
  const buttonType = form.watch("buttonType");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        form.setError("mediaUrl", {
            type: "manual",
            message: `El archivo es demasiado grande. El límite es de ${MAX_FILE_SIZE_MB}MB.`
        });
        clearMedia();
        return;
      }
      form.clearErrors("mediaUrl");
      setMediaFileName(file.name);
      setMediaFileType(file.type);

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setMediaPreview(result);
        // The data URL is temporarily stored here for validation and preview
        // It will be processed and uploaded on submit.
        form.setValue("mediaUrl", result, { shouldValidate: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const clearMedia = () => {
    form.setValue("mediaUrl", "", { shouldValidate: true });
    setMediaPreview(null);
    setMediaFileName(null);
    setMediaFileType(undefined);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  function extractParameters(content: string): string[] {
    const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
    const matches = new Set<string>();
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match[1].toLowerCase() !== 'contacto') { 
        matches.add(match[1]);
      }
    }
    return Array.from(matches);
  }

  const handleAutoDetectParams = () => {
    const content = form.getValues("templateContent");
    const params = extractParameters(content);
    form.setValue("templateParameters", params.join(", "));
    toast({
      title: "Parámetros Detectados",
      description: `Se detectaron los siguientes parámetros: ${params.join(", ") || "Ninguno"}.`,
    });
  };

  const handleGenerateContent = async () => {
    if (!aiObjective) {
      toast({ title: "Objetivo no definido", description: "Por favor, describe el objetivo del mensaje.", variant: "destructive" });
      return;
    }
    if (!templateType || templateType === "llamada-ia") {
        form.setError("templateType", { message: "Debes seleccionar un tipo de plantilla de texto (WhatsApp/SMS) para generar el contenido." });
        return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    try {
      const result = await generateTemplate({ objective: aiObjective, type: templateType });
      if (result.generatedContent) {
        form.setValue("templateContent", result.generatedContent, { shouldValidate: true });
        const params = extractParameters(result.generatedContent);
        form.setValue("templateParameters", params.join(", "));
        toast({ title: "Contenido generado", description: "El contenido de la plantilla ha sido actualizado." });
      } else {
        throw new Error("La IA no devolvió contenido.");
      }
    } catch (error: any) {
      console.error("Error generating template with AI:", error);
      const errorMessage = error.message || "Ocurrió un error al generar el contenido.";
      setGenerationError(errorMessage);
      toast({ title: "Error de IA", description: errorMessage, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);

    const detectedParams = extractParameters(values.templateContent);
    const manuallyEnteredParams = values.templateParameters?.split(',').map(p => p.trim()).filter(p => p && p.toLowerCase() !== 'contacto') || [];

    const allParams = Array.from(new Set([...detectedParams, ...manuallyEnteredParams]));

    if (manuallyEnteredParams.length > 0 && values.templateType !== 'llamada-ia') {
      const missingInContent = manuallyEnteredParams.filter(mp => !detectedParams.includes(mp));
      if (missingInContent.length > 0) {
        form.setError("templateParameters", {
          type: "manual",
          message: `Los siguientes parámetros manuales no se encontraron en el contenido: ${missingInContent.join(', ')}. Asegúrate de incluirlos como {{parametro}}.`
        });
        setIsSubmitting(false);
        return;
      }
    }
    
    const paramsInContentButNotManual = detectedParams.filter(dp => !manuallyEnteredParams.includes(dp));
    if (manuallyEnteredParams.length > 0 && paramsInContentButNotManual.length > 0 && values.templateType !== 'llamada-ia') {
         form.setError("templateParameters", {
            type: "manual",
            message: `Los siguientes parámetros del contenido no están en tu lista manual: ${paramsInContentButNotManual.join(', ')}. Añádelos o elimínalos del contenido.`
        });
        setIsSubmitting(false);
        return;
    }

    let uploadedMediaUrl: string | undefined = undefined;
    if (values.mediaUrl && values.mediaUrl.startsWith('data:')) {
      toast({ title: 'Subiendo archivo...', description: 'Por favor, espera un momento.' });
      const uploadResult = await uploadFile(values.mediaUrl, mediaFileType);
      if (uploadResult.error) {
        toast({ title: 'Error al subir archivo', description: uploadResult.error, variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }
      uploadedMediaUrl = uploadResult.url;
    }

    const formData = new FormData();
    formData.append('templateName', values.templateName);
    formData.append('templateType', values.templateType);
    formData.append('templateContent', values.templateContent);
    formData.append('templateParameters', allParams.join(',')); 
    if (uploadedMediaUrl) formData.append('mediaUrl', uploadedMediaUrl);
    if (values.linkUrl) formData.append('linkUrl', values.linkUrl);
    if (values.buttonType) formData.append('buttonType', values.buttonType);
    if (values.buttonText) formData.append('buttonText', values.buttonText);
    if (values.buttonValue) formData.append('buttonValue', values.buttonValue);

    if (values.daysToResolve) formData.append('daysToResolve', values.daysToResolve);
    if (values.channelToResolve) formData.append('channelToResolve', values.channelToResolve);


    const result = await createTemplate(formData);

    if (result.error) {
      toast({
        title: "Error al crear plantilla",
        description: result.error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Plantilla Creada",
        description: `La plantilla "${values.templateName}" ha sido creada exitosamente.`,
      });
      if (result.ruleUpdateResult?.success) {
        toast({
          title: "Regla de Cobranza Actualizada",
          description: "La regla de cobranza pendiente ha sido vinculada a esta nueva plantilla.",
        });
      } else if (result.ruleUpdateResult?.error) {
         toast({
          title: "Error al Actualizar Regla de Cobranza",
          description: result.ruleUpdateResult.error,
          variant: "destructive",
        });
      }
      
      if (fromStrategy) {
        router.push("/dashboard/strategy");
      } else {
        router.push("/dashboard/templates");
      }
    }
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Campos ocultos para pasar daysToResolve y channelToResolve si existen */}
        {initialDaysToResolve && (
            <input type="hidden" {...form.register("daysToResolve")} value={initialDaysToResolve} />
        )}
        {initialChannelToResolve && (
            <input type="hidden" {...form.register("channelToResolve")} value={initialChannelToResolve} />
        )}

        <div className="grid md:grid-cols-2 gap-8">
          <FormField
            control={form.control}
            name="templateName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre de la Plantilla</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Bienvenida VIP" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="templateType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Plantilla</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="llamada-ia">Llamada IA</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="llamada">Llamada</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        {/* Content Section */}
        {templateType !== 'llamada-ia' ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
                <Label htmlFor="templateContent">Contenido de la Plantilla</Label>
                 <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAiAssistantOpen((prev) => !prev)}
                  disabled={isSubmitting}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  {isAiAssistantOpen ? "Ocultar Asistente IA" : "Abrir Asistente IA"}
                </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {isAiAssistantOpen && (
                    <Card className="bg-muted/50 border-border shadow-inner lg:col-span-1">
                        <CardHeader>
                            <CardTitle className="flex items-center text-lg"><Wand2 className="mr-2 h-5 w-5 text-primary" /> Asistente IA</CardTitle>
                            <CardDescription>Describe el objetivo y la IA generará el contenido por ti.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="ai-objective" className="text-sm font-normal">1. Describe el objetivo del mensaje</Label>
                                <Textarea 
                                    id="ai-objective"
                                    placeholder="Ej: Un recordatorio amigable para un cliente sobre un pago que vence pronto. Mencionar el monto y la fecha límite."
                                    value={aiObjective}
                                    onChange={(e) => setAiObjective(e.target.value)}
                                    className="mt-1 bg-background"
                                />
                            </div>
                            <Button type="button" onClick={handleGenerateContent} disabled={isGenerating}>
                                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                {isGenerating ? "Generando..." : "2. Generar Contenido"}
                            </Button>
                            {generationError && (
                                <Alert variant="destructive">
                                    <AlertTitle>Error de Generación</AlertTitle>
                                    <AlertDescription>{generationError}</AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                )}
                 <div
                  className={cn(
                    "transition-all duration-300",
                    isAiAssistantOpen ? "lg:col-span-1" : "lg:col-span-2"
                  )}
                >
                    <FormField
                    control={form.control}
                    name="templateContent"
                    render={({ field }) => (
                        <FormItem>
                        <FormControl>
                            <Textarea
                            id="templateContent"
                            placeholder="El contenido generado por la IA aparecerá aquí. También puedes escribirlo manualmente. Usa {{parametro}} para las variables."
                            className={cn(
                                "min-h-[150px] transition-all duration-300 ease-in-out",
                                isAiAssistantOpen && "lg:min-h-[300px]"
                            )}
                            {...field}
                            />
                        </FormControl>
                        <FormDescription className="flex justify-between items-center">
                            <span>
                                Usa <code>{"{{parametro}}"}</code> para variables.
                            </span>
                            {templateType === 'sms' && (
                            <span className={cn(
                                "font-mono text-xs ml-2",
                                templateContent && templateContent.length > 160 ? "text-destructive" : "text-muted-foreground"
                            )}>
                                {templateContent ? templateContent.length : 0}/160
                            </span>
                            )}
                        </FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
            </div>
          </div>
        ) : (
             <FormField
                control={form.control}
                name="templateContent"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Tipo de Llamada (metadata interna)</FormLabel>
                        <FormControl>
                            <Input placeholder="Ej: ventas, cobranza, recordatorio" {...field} />
                        </FormControl>
                        <FormDescription>
                            Identificador interno de la plantilla (no se envía a DAPTA API).
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
        )}
        
        {/* Additional Content Section */}
        {templateType === "whatsapp" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center"><Paperclip className="mr-2 h-5 w-5" /> Contenido Adicional (Opcional)</CardTitle>
              <CardDescription>Adjunta un archivo, imagen o enlace a tu mensaje.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="linkUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><Link2 className="mr-2 h-4 w-4" />Enlace (URL)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://ejemplo.com/promocion" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="mediaUrl" // This name is just for validation trigger, not direct submission
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Archivo adjunto (Max 5MB)</FormLabel>
                            <FormControl>
                                <Input 
                                    type="file" 
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept="*/*"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                  />

                  {mediaPreview && (
                      <div className="relative mt-2 p-2 border rounded-md">
                          <p className="text-sm text-muted-foreground mb-2">Vista previa:</p>
                          {mediaPreview.startsWith('data:image/') ? (
                            <Image src={mediaPreview} alt="Vista previa" width={100} height={100} className="rounded-md object-cover" />
                          ) : (
                            <div className="flex items-center gap-2 text-sm">
                               <File className="h-5 w-5" />
                               <span>{mediaFileName || 'Archivo cargado'}</span>
                            </div>
                          )}
                           <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={clearMedia}>
                              <X className="h-4 w-4" />
                              <span className="sr-only">Quitar archivo</span>
                          </Button>
                      </div>
                  )}

                </div>
            </CardContent>
          </Card>
        )}
        
        {/* Interactive Button Section */}
        {templateType === 'whatsapp' && (
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl flex items-center"><Pointer className="mr-2 h-5 w-5" /> Botón Interactivo (Opcional)</CardTitle>
                    <CardDescription>Añade un botón de llamada o respuesta rápida a tu mensaje de WhatsApp.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormField
                        control={form.control}
                        name="buttonType"
                        render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormControl>
                            <RadioGroup
                                onValueChange={(value) => {
                                    field.onChange(value);
                                    form.setValue('buttonText', '');
                                    form.setValue('buttonValue', '');
                                }}
                                value={field.value}
                                defaultValue={field.value}
                                className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                            >
                                <FormItem>
                                    <FormControl>
                                        <RadioGroupItem value="none" id="btn-none" className="sr-only peer" />
                                    </FormControl>
                                    <Label htmlFor="btn-none" className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                                        <X className="mb-3 h-6 w-6" />
                                        Sin Botón
                                    </Label>
                                </FormItem>
                                <FormItem>
                                    <FormControl>
                                        <RadioGroupItem value="call" id="btn-call" className="sr-only peer" />
                                    </FormControl>
                                    <Label htmlFor="btn-call" className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                                        <PhoneCall className="mb-3 h-6 w-6" />
                                        Llamada
                                    </Label>
                                </FormItem>
                                <FormItem>
                                    <FormControl>
                                        <RadioGroupItem value="reply" id="btn-reply" className="sr-only peer" />
                                    </FormControl>
                                     <Label htmlFor="btn-reply" className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                                        <MessageSquareReply className="mb-3 h-6 w-6" />
                                        Respuesta Rápida
                                    </Label>
                                </FormItem>
                            </RadioGroup>
                            </FormControl>
                        </FormItem>
                        )}
                    />
                    {buttonType === 'call' && (
                        <div className="mt-4 space-y-2">
                             <FormField
                                control={form.control}
                                name="buttonText"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Texto del botón</FormLabel>
                                    <FormControl><Input placeholder="Ej: Llamar ahora" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="buttonValue"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Número de teléfono</FormLabel>
                                    <FormControl><Input type="tel" placeholder="+50212345678" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>
                    )}
                     {buttonType === 'reply' && (
                        <div className="mt-4 space-y-2">
                             <FormField
                                control={form.control}
                                name="buttonText"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Texto del botón de respuesta</FormLabel>
                                    <FormControl><Input placeholder="Ej: Sí, me interesa" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>
                    )}

                </CardContent>
            </Card>
        )}

        <FormField
          control={form.control}
          name="templateParameters"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {templateType === 'llamada-ia' ? "Parámetros Adicionales (Opcional)" : "Parámetros (Opcional, se autodetectan)"}
              </FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input placeholder={templateType === 'llamada-ia' ? "Ej: producto, precio" : "Ej: nombre_cliente, producto, codigo_descuento"} {...field} />
                </FormControl>
                {templateType !== 'llamada-ia' && (
                    <Button type="button" variant="outline" onClick={handleAutoDetectParams} className="shrink-0">
                        <Wand2 className="mr-2 h-4 w-4" /> Detectar del contenido
                    </Button>
                )}
              </div>
              <FormDescription>
                {templateType === 'llamada-ia'
                    ? "Parámetros opcionales adicionales. El obligatorio 'nombre_cliente' se obtiene de la consulta de campaña."
                    : "Lista los parámetros separados por comas. El sistema los detectará del contenido al guardar. 'contacto' es implícito y no debe listarse."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isSubmitting ? "Guardando..." : "Guardar Plantilla"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
