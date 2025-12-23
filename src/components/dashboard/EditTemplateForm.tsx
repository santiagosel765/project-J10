

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
import { useRouter } from "next/navigation"; 
import { Save, Info, Paperclip, Link2, X, File, Image as ImageIcon, PhoneCall, MessageSquareReply, Pointer, Loader2, Bot, Download } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { updateTemplate } from "@/actions/templateActions"; 
import React, { useState, useEffect } from "react";
import type { Template } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Image from "next/image";
import { uploadFile } from "@/actions/fileActions";
import { getPresignedUrlForFile } from "@/actions/fileActions";

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

interface EditTemplateFormProps {
    template: Template;
}

export function EditTemplateForm({ template }: EditTemplateFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null); // Only for new files
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [mediaFileType, setMediaFileType] = useState<string | undefined>(undefined);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [signedOriginalUrl, setSignedOriginalUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  useEffect(() => {
    if (template.mediaUrl && !template.mediaUrl.startsWith('data:')) {
      const fetchSignedUrl = async () => {
        setIsLoadingUrl(true);
        const result = await getPresignedUrlForFile(template.mediaUrl!);
        if (result.signedUrl) {
          setSignedOriginalUrl(result.signedUrl);
        } else {
          console.error("Failed to get signed URL for original media:", result.error);
        }
        setIsLoadingUrl(false);
      };
      fetchSignedUrl();
    }
  }, [template.mediaUrl]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      templateName: template.name || "",
      templateType: template.type || undefined,
      templateContent: template.content || "",
      templateParameters: template.parameters?.join(", ") || "",
      linkUrl: template.linkUrl || "",
      mediaUrl: template.mediaUrl || "",
      buttonType: template.buttonType || 'none',
      buttonText: template.buttonText || '',
      buttonValue: template.buttonValue || '',
    },
  });

  const templateType = form.watch("templateType");
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
    
    let finalMediaUrl: string | null | undefined = values.mediaUrl;

    // Check if a new file has been selected (it will be a data URL)
    if (values.mediaUrl && values.mediaUrl.startsWith('data:')) {
        toast({ title: 'Subiendo nuevo archivo...', description: 'Por favor, espera un momento.' });
        const uploadResult = await uploadFile(values.mediaUrl, mediaFileType);
        if (uploadResult.error) {
            toast({ title: 'Error al subir archivo', description: uploadResult.error, variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        finalMediaUrl = uploadResult.url;
    } else if (values.mediaUrl === '') {
        // This case handles when the user clears the file input, intending to remove the media.
        finalMediaUrl = null;
    }
    // If values.mediaUrl is a regular URL (not a data URL), it means the user hasn't changed it,
    // so finalMediaUrl will correctly hold the original URL.


    const templateDataToUpdate: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'userId'>> = {
        name: values.templateName,
        type: values.templateType,
        content: values.templateContent,
        parameters: allParams,
        linkUrl: values.linkUrl || null,
        mediaUrl: finalMediaUrl,
        buttonType: values.buttonType || 'none',
        buttonText: values.buttonType === 'reply' ? (values.buttonText || null) : null,
        buttonValue: values.buttonType === 'call' ? (values.buttonValue || null) : null,
    };

    const result = await updateTemplate(template.id, templateDataToUpdate);

    if (result.error) {
      toast({
        title: "Error al actualizar la plantilla",
        description: result.error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Plantilla Actualizada",
        description: `La plantilla "${values.templateName}" ha sido guardada exitosamente.`,
      });
      router.push("/dashboard/templates");
    }
    setIsSubmitting(false);
  }
  
  const getFileNameFromUrl = (url: string) => {
    try {
      const urlObject = new URL(url);
      const pathParts = urlObject.pathname.split('/');
      return decodeURIComponent(pathParts[pathParts.length - 1]);
    } catch (e) {
      return "archivo_adjunto";
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        <div className="grid md:grid-cols-2 gap-8">
          <FormField
            control={form.control}
            name="templateName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre de la Plantilla</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Bienvenida VIP" {...field} disabled={isSubmitting} />
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
                <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={isSubmitting}>
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
        
        <FormField
          control={form.control}
          name="templateContent"
          render={({ field }) => (
            <FormItem>
                <FormLabel>{templateType === 'llamada-ia' ? "Tipo de Llamada (call_type)" : "Contenido de la Plantilla"}</FormLabel>
                <FormControl>
                    {templateType === 'llamada-ia' ? (
                       <Input placeholder="Ej: ventas, cobranza, recordatorio" {...field} disabled={isSubmitting} />
                    ) : (
                       <Textarea
                        id="templateContent"
                        placeholder="Usa {{parametro}} para las variables."
                        className="min-h-[150px]"
                        {...field}
                        disabled={isSubmitting}
                        />
                    )}
                </FormControl>
                {templateType === 'llamada-ia' ? (
                    <FormDescription>
                        Este es el valor que se enviará a la API como <code>call_type</code>.
                    </FormDescription>
                ) : (
                    <FormDescription>
                        Usa <code>{"{{parametro}}"}</code> para variables.
                    </FormDescription>
                )}
                <FormMessage />
            </FormItem>
            )}
        />
        
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
                        <Input placeholder="https://ejemplo.com/promocion" {...field} disabled={isSubmitting}/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-4">
                  {form.getValues('mediaUrl') && !mediaPreview && !isLoadingUrl && (
                      <div className="mt-2 text-sm">
                          <p className="font-medium mb-2">Archivo adjunto actual:</p>
                           <a href={signedOriginalUrl || '#'} target="_blank" rel="noopener noreferrer" download={getFileNameFromUrl(form.getValues('mediaUrl')!)}>
                            <Button variant="outline" size="sm" type="button" disabled={isLoadingUrl || !signedOriginalUrl}>
                                <Download className="mr-2 h-4 w-4" />
                                {isLoadingUrl ? 'Cargando...' : getFileNameFromUrl(form.getValues('mediaUrl')!)}
                            </Button>
                        </a>
                          <p className="text-xs text-muted-foreground mt-2">Sube un nuevo archivo abajo para reemplazarlo, o quítalo para eliminar el adjunto.</p>
                          <Button type="button" variant="link" size="sm" className="text-destructive h-auto p-0 mt-1" onClick={clearMedia}>Quitar archivo actual</Button>
                      </div>
                  )}

                  {isLoadingUrl && <p className="text-sm text-muted-foreground">Cargando archivo actual...</p>}

                  <FormField
                      control={form.control}
                      name="mediaUrl" // For validation trigger
                      render={() => (
                          <FormItem>
                              <FormLabel>Reemplazar archivo adjunto (Max 5MB)</FormLabel>
                              <FormControl>
                                  <Input 
                                      type="file" 
                                      ref={fileInputRef}
                                      onChange={handleFileChange}
                                      accept="*/*"
                                      disabled={isSubmitting}
                                  />
                              </FormControl>
                              <FormMessage />
                          </FormItem>
                      )}
                  />
                  {mediaPreview && (
                      <div className="relative mt-2 p-2 border rounded-md">
                          <p className="text-sm text-muted-foreground mb-2">Vista previa (nuevo archivo):</p>
                          {mediaPreview.startsWith('data:image/') || mediaPreview.includes('.png') || mediaPreview.includes('.jpg') || mediaPreview.includes('.jpeg') || mediaPreview.startsWith('https') ? (
                            <Image src={mediaPreview} alt="Vista previa" width={100} height={100} className="rounded-md object-cover" />
                          ) : (
                            <div className="flex items-center gap-2 text-sm">
                               <File className="h-5 w-5" />
                               <span>{mediaFileName || 'Archivo cargado'}</span>
                            </div>
                          )}
                           <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={clearMedia} disabled={isSubmitting}>
                              <X className="h-4 w-4" />
                              <span className="sr-only">Quitar archivo</span>
                          </Button>
                      </div>
                  )}
                </div>
            </CardContent>
          </Card>
        )}
        
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
                                disabled={isSubmitting}
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
                                    <FormControl><Input placeholder="Ej: Llamar ahora" {...field} disabled={isSubmitting} /></FormControl>
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
                                    <FormControl><Input type="tel" placeholder="+50212345678" {...field} disabled={isSubmitting}/></FormControl>
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
                                    <FormControl><Input placeholder="Ej: Sí, me interesa" {...field} disabled={isSubmitting}/></FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>
                    )}

                </CardContent>
            </Card>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Sobre los Parámetros</AlertTitle>
          <AlertDescription>
            Los parámetros como <code>{"{{nombre}}"}</code> se usarán para personalizar los mensajes. El parámetro <code>contacto</code> es implícito y no necesita ser añadido.
          </AlertDescription>
        </Alert>

        <FormField
          control={form.control}
          name="templateParameters"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parámetros (Detectados automáticamente o manuales)</FormLabel>
              <FormControl>
                <Input placeholder="Ej: nombre_cliente, producto, codigo_descuento" {...field} disabled={isSubmitting}/>
              </FormControl>
              <FormDescription>
                Ej: <code>nombre</code>, <code>fecha_cita</code>. Sin llaves y separados por comas.
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
            {isSubmitting ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
