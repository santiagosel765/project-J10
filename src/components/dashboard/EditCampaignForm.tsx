
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Database, Save, Info, FileText, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import type { Template, Campaign, CampaignCategory } from "@/lib/mock-data";
import { updateCampaign } from "@/actions/campaignActions";
import React from "react";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  campaignName: z.string().min(3, { message: "El nombre de la campaña debe tener al menos 3 caracteres." }),
  templateId: z.string({ required_error: "Debes seleccionar una plantilla." }),
  category: z.string({ required_error: "Debes seleccionar una categoría." }),
  dbQuery: z.string().min(1, { message: "La consulta SQL no puede estar vacía." }),
  scheduleFrequency: z.enum(["once", "daily", "weekdays", "weekly", "monthly"], { required_error: "Define la frecuencia de envío." }),
  scheduleTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Hora inválida. Usa el formato HH:MM (ej. 09:30)." }),
  scheduleDate: z.date().optional(),
}).refine(data => {
    if (data.scheduleFrequency === 'once' || data.scheduleFrequency === 'weekly' || data.scheduleFrequency === 'monthly' || data.scheduleFrequency === 'weekdays') {
        return !!data.scheduleDate;
    }
    return true;
}, {
    message: "Debes seleccionar una fecha de inicio si la frecuencia no es 'Diaria'.",
    path: ["scheduleDate"],
});

interface EditCampaignFormProps {
  campaign: Campaign;
  availableTemplates: Template[];
}

const campaignCategories: CampaignCategory[] = ["Ventas", "Marketing", "Cobranza", "Prevencion", "Comunicado"];

export function EditCampaignForm({ campaign, availableTemplates }: EditCampaignFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = React.useState<Template | null>(
    availableTemplates.find(t => t.id === campaign.templateId) || null
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      campaignName: campaign.name || "",
      templateId: campaign.templateId || undefined,
      category: campaign.category || undefined,
      dbQuery: campaign.recipientDbQuery || "",
      scheduleFrequency: campaign.schedule.frequency as "once" | "daily" | "weekdays" | "weekly" | "monthly" || "once",
      scheduleTime: campaign.schedule.time || "09:00",
      scheduleDate: campaign.schedule.nextRun ? new Date(campaign.schedule.nextRun + 'T00:00:00') : undefined,
    },
  });

  const scheduleFrequency = form.watch("scheduleFrequency");
  const templateIdWatcher = form.watch("templateId");

  React.useEffect(() => {
    if (templateIdWatcher) {
      const template = availableTemplates.find(t => t.id === templateIdWatcher);
      setSelectedTemplate(template || null);
    } else {
      setSelectedTemplate(null);
    }
  }, [templateIdWatcher, availableTemplates]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const templateForType = availableTemplates.find(t => t.id === values.templateId);
    if (!templateForType) {
        toast({ title: "Error", description: "La plantilla seleccionada no es válida.", variant: "destructive" });
        return;
    }

    const campaignDataToUpdate: Partial<Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'userId'>> = {
      name: values.campaignName,
      templateId: values.templateId,
      type: templateForType.type, // Important: update type based on template
      category: values.category as CampaignCategory,
      recipientDbQuery: values.dbQuery,
      schedule: {
        frequency: values.scheduleFrequency,
        time: values.scheduleTime,
        nextRun: values.scheduleDate ? format(values.scheduleDate, "yyyy-MM-dd") : undefined
      },
      // Status is handled by approval flow, not here.
    };

    const result = await updateCampaign(campaign.id, campaignDataToUpdate);

    if (result.error) {
        toast({
            title: "Error al actualizar campaña",
            description: result.error,
            variant: "destructive",
        });
    } else {
        toast({
          title: "Campaña Actualizada",
          description: `La campaña "${values.campaignName}" ha sido guardada exitosamente.`,
        });
        router.push("/dashboard/campaigns");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="campaignName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Campaña</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Promoción Verano 2024" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="templateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seleccionar Plantilla</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Elige una plantilla existente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableTemplates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} ({template.type.toUpperCase()})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplate && (
                    <FormDescription className="pt-2">
                       Parámetros requeridos: {selectedTemplate.parameters.length === 0 ? "Ninguno." : ""}
                       {selectedTemplate.parameters.length > 0 && 
                          <span className="flex flex-wrap gap-1 mt-1">
                            {selectedTemplate.parameters.map(p => <Badge key={p} variant="secondary" className="text-xs">{"{{" + p + "}}"}</Badge>)}
                          </span>
                       }
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><Tag className="mr-2 h-4 w-4"/>Categoría</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Elige una categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {campaignCategories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>
        
        <div className="mt-4 p-4 border rounded-md space-y-6">
            <h3 className="text-lg font-medium flex items-center"><Database className="mr-2 h-5 w-5 text-primary" /> Fuente de Destinatarios</h3>
            <FormField
            control={form.control}
            name="dbQuery"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Consulta SQL</FormLabel>
                <FormControl>
                    <Textarea
                    placeholder="SELECT telefono AS contacto, nombre, producto FROM clientes_activos WHERE sucursal = 'Zona 10';"
                    className="min-h-[100px] font-mono text-sm"
                    {...field}
                    />
                </FormControl>
                 <FormDescription>
                    La consulta debe devolver una columna llamada <strong>contacto</strong> y columnas para cada parámetro requerido por la plantilla.
                </FormDescription>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <div className="space-y-6 p-4 border rounded-md">
            <h3 className="text-lg font-medium">Programación de Envío</h3>
            <div className="grid md:grid-cols-3 gap-6">
                <FormField
                control={form.control}
                name="scheduleFrequency"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Frecuencia</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona la frecuencia" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        <SelectItem value="once">Una Vez</SelectItem>
                        <SelectItem value="daily">Diaria (L-D)</SelectItem>
                        <SelectItem value="weekdays">Días Hábiles (L-V)</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensual</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="scheduleTime"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Hora de Envío</FormLabel>
                    <FormControl>
                        <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                {(scheduleFrequency !== "daily") && (
                <FormField
                    control={form.control}
                    name="scheduleDate"
                    render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>
                        {scheduleFrequency === "once" && "Fecha de Envío"}
                        {scheduleFrequency === "weekly" && "Próximo Envío Semanal"}
                        {scheduleFrequency === "monthly" && "Próximo Envío Mensual"}
                        {scheduleFrequency === 'weekdays' && "Fecha de Inicio"}
                        </FormLabel>
                        <Popover>
                        <PopoverTrigger asChild>
                            <FormControl>
                            <Button
                                variant={"outline"}
                                className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                                )}
                            >
                                {field.value ? (
                                format(field.value, "PPP", { locale: es })
                                ) : (
                                <span>Selecciona una fecha</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                                date < new Date(new Date().setHours(0,0,0,0)) 
                            }
                            initialFocus
                            locale={es}
                            />
                        </PopoverContent>
                        </Popover>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                )}
            </div>
        </div>

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit">
            <Save className="mr-2 h-4 w-4" /> Guardar Cambios
          </Button>
        </div>
      </form>
    </Form>
  );
}
