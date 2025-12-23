
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
import { CalendarIcon, Database, Save, Send, Info, FileText, AlertCircle, Loader2, Filter, PieChart, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Template, CampaignCategory } from "@/lib/mock-data";
import { createCampaign } from "@/actions/campaignActions";
import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useDebounce } from "use-debounce";
import { getDistinctColumnValues } from "@/actions/queryActions";
import { Parser } from 'node-sql-parser';
import { Label } from "@/components/ui/label";
import { SaturationPreviewDialog } from "./SaturationPreviewDialog";
import { getContactInCampaignsFrequency } from "@/actions/saturationActions";
import type { ContactFrequencyInCampaigns } from "@/actions/saturationActions";


const formSchema = z.object({
  campaignName: z.string().min(3, { message: "El nombre de la campaña debe tener al menos 3 caracteres." }),
  templateId: z.string({ required_error: "Debes seleccionar una plantilla." }),
  category: z.string({ required_error: "Debes seleccionar una categoría." }),
  dbQuery: z.string().min(1, { message: "La consulta SQL no puede estar vacía." }),
  scheduleFrequency: z.enum(["once", "daily", "weekdays", "weekly", "monthly"], { required_error: "Define la frecuencia de envío." }),
  scheduleTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Hora inválida. Usa el formato HH:MM (ej. 09:30)." }),
  scheduleDate: z.date().optional(), 
}).refine(data => {
    if (data.scheduleFrequency !== 'daily') {
        return !!data.scheduleDate;
    }
    return true;
}, {
    message: "Debes seleccionar una fecha de inicio si la frecuencia no es 'Diaria'.",
    path: ["scheduleDate"],
});

interface CreateCampaignFormProps {
  availableTemplates: Template[];
  isAdmin: boolean;
}

interface DynamicFilter {
    column: string;
    values: string[];
}

const campaignCategories: CampaignCategory[] = ["Ventas", "Marketing", "Cobranza", "Prevencion", "Comunicado"];

export function CreateCampaignForm({ availableTemplates, isAdmin }: CreateCampaignFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = React.useState<Template | null>(null);

  const [dynamicFilters, setDynamicFilters] = useState<DynamicFilter[]>([]);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);

  const [saturationData, setSaturationData] = useState<ContactFrequencyInCampaigns[] | null>(null);
  const [isCheckingSaturation, setIsCheckingSaturation] = useState(false);
  const [saturationError, setSaturationError] = useState<string | null>(null);
  const [isSaturationDialogOpen, setIsSaturationDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      campaignName: "",
      templateId: undefined,
      category: undefined,
      dbQuery: "",
      scheduleFrequency: "once",
      scheduleTime: "09:00",
      scheduleDate: new Date(),
    },
  });

  const scheduleFrequency = form.watch("scheduleFrequency");
  const templateIdWatcher = form.watch("templateId");
  const dbQueryWatcher = form.watch("dbQuery");
  const [debouncedDbQuery] = useDebounce(dbQueryWatcher, 1000); // 1-second debounce

  const fetchFilters = useCallback(async (query: string) => {
    if (query.trim().length < 15) { // Simple validation to avoid running on empty/trivial queries
      setDynamicFilters([]);
      setFilterError(null);
      return;
    }
    
    setIsLoadingFilters(true);
    setFilterError(null);
    try {
      const result = await getDistinctColumnValues(query);
      if (result.error) {
        setFilterError(result.error);
        setDynamicFilters([]);
      } else if (result.data) {
        setDynamicFilters(result.data);
      }
    } catch (e: any) {
      setFilterError("Error de red al obtener filtros.");
      setDynamicFilters([]);
    } finally {
      setIsLoadingFilters(false);
    }
  }, []);

  useEffect(() => {
    fetchFilters(debouncedDbQuery);
  }, [debouncedDbQuery, fetchFilters]);

  useEffect(() => {
    if (templateIdWatcher) {
      const template = availableTemplates.find(t => t.id === templateIdWatcher);
      setSelectedTemplate(template || null);
    } else {
      setSelectedTemplate(null);
    }
  }, [templateIdWatcher, availableTemplates]);

  const applyFilter = (column: string, value: string) => {
    if (!value) return;

    const currentQuery = form.getValues("dbQuery").trim().replace(/;$/, '');
    const sqlParser = new Parser();
    
    try {
        let ast = sqlParser.astify(currentQuery);
        // Ensure we're working with the main query object if it's a multi-statement query
        if (Array.isArray(ast)) {
            ast = ast[0];
        }

        const newCondition = {
            type: 'binary_expr',
            operator: '=',
            left: { type: 'column_ref', table: null, column },
            right: { type: 'string', value: value }
        };

        if (ast.where) {
            // Append to existing WHERE clause
            ast.where = {
                type: 'binary_expr',
                operator: 'AND',
                left: ast.where,
                right: newCondition
            };
        } else {
            // Add new WHERE clause
            ast.where = newCondition;
        }

        const newQuery = sqlParser.sqlify(ast);
        form.setValue("dbQuery", newQuery);

    } catch (error) {
        console.error("Failed to parse SQL, falling back to simple append:", error);
        // Fallback for very complex queries the parser might not handle
        const whereKeyword = currentQuery.toLowerCase().includes(' where ') ? 'AND' : 'WHERE';
        const newQuery = `${currentQuery} ${whereKeyword} "${column}" = '${value.replace(/'/g, "''")}'`;
        form.setValue("dbQuery", newQuery);
        toast({ title: "Filtro Aplicado (Modo Simple)", description: "No se pudo analizar la consulta, se añadió la condición al final.", variant: "default" });
    }
  };


  async function onSubmit(values: z.infer<typeof formSchema>) {
    const formData = new FormData();
    formData.append('campaignName', values.campaignName);
    formData.append('templateId', values.templateId);
    formData.append('category', values.category);
    formData.append('dbQuery', values.dbQuery);
    
    formData.append('scheduleFrequency', values.scheduleFrequency);
    formData.append('scheduleTime', values.scheduleTime);
    if (values.scheduleDate) {
      formData.append('scheduleDate', values.scheduleDate.toISOString());
    }

    const result = await createCampaign(formData);

    if (result.error) {
        toast({
            title: "Error al crear campaña",
            description: result.error,
            variant: "destructive",
        });
    } else {
        const campaignStatus = result.campaign?.status;
        toast({
          title: "Campaña Creada",
          description: `La campaña "${values.campaignName}" ha sido configurada. Estado: ${campaignStatus}.`,
          duration: 7000, 
        });
        router.push("/dashboard/campaigns");
    }
  }

  const handleSaturationCheck = async () => {
    setIsCheckingSaturation(true);
    setSaturationError(null);
    setSaturationData(null);
    const result = await getContactInCampaignsFrequency({ page: 1, limit: 1000 });
    if (result.error) {
        setSaturationError(result.error);
    } else {
        setSaturationData(result.stats || []);
        setIsSaturationDialogOpen(true);
    }
    setIsCheckingSaturation(false);
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
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={availableTemplates.length === 0 && !field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={availableTemplates.length === 0 ? "No hay plantillas disponibles" : "Elige una plantilla existente"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableTemplates.length > 0 ? (
                        availableTemplates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} ({template.type.toUpperCase()})
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-4 text-sm text-muted-foreground">
                           {!isAdmin && "No hay plantillas aprobadas. "}
                           {isAdmin && "No hay plantillas disponibles. "}
                           <Link href="/dashboard/templates/create" className="text-primary hover:underline">Crear una plantilla</Link>.
                        </div>
                      )}
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
        
        {!selectedTemplate && templateIdWatcher && availableTemplates.length > 0 && (
            <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Plantilla no válida</AlertTitle>
                <AlertDescription>
                La plantilla seleccionada no se pudo cargar o no existe. Por favor, elige otra plantilla.
                </AlertDescription>
            </Alert>
        )}

        <div className="mt-4 p-4 border rounded-md space-y-6">
            <h3 className="text-lg font-medium flex items-center"><Database className="mr-2 h-5 w-5 text-primary" /> Fuente de Destinatarios</h3>
            <FormField
            control={form.control}
            name="dbQuery"
            render={({ field }) => (
                <FormItem>
                <div className="flex justify-between items-center">
                    <FormLabel>Consulta SQL</FormLabel>
                    <Button type="button" variant="outline" size="sm" onClick={handleSaturationCheck} disabled={isCheckingSaturation || !dbQueryWatcher}>
                        {isCheckingSaturation ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PieChart className="mr-2 h-4 w-4"/>}
                        {isCheckingSaturation ? "Analizando..." : "Analizar Saturación"}
                    </Button>
                </div>
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
             {saturationError && (
                 <Alert variant="destructive" className="mt-2"><AlertCircle className="h-4 w-4"/><AlertTitle>Error de Análisis</AlertTitle><AlertDescription>{saturationError}</AlertDescription></Alert>
             )}


            {/* Dynamic Filters Section */}
            <div className="p-4 border border-dashed rounded-md">
                 <h4 className="text-md font-medium flex items-center">
                    <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                    Filtros Dinámicos
                </h4>
                {isLoadingFilters && <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Analizando consulta...</div>}
                {filterError && <Alert variant="destructive" className="mt-2"><AlertCircle className="h-4 w-4"/><AlertTitle>Error de Filtro</AlertTitle><AlertDescription>{filterError}</AlertDescription></Alert>}
                {!isLoadingFilters && !filterError && dynamicFilters.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {dynamicFilters.map(filter => (
                            <div key={filter.column}>
                                <Label className="text-xs capitalize">{filter.column.replace(/_/g, ' ')}</Label>
                                <Select onValueChange={(value) => applyFilter(filter.column, value)}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Filtrar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {filter.values.map(val => (
                                            <SelectItem key={val} value={val}>{val}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>
                )}
                {!isLoadingFilters && !filterError && dynamicFilters.length === 0 && debouncedDbQuery.length > 15 && (
                    <p className="text-sm text-muted-foreground">No se encontraron columnas adicionales para filtrar o la consulta es demasiado compleja.</p>
                )}
            </div>
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
                        <FormDescription>
                            {scheduleFrequency === "weekly" && "Elige cualquier día de la semana deseada para el primer envío."}
                            {scheduleFrequency === "monthly" && "Elige cualquier día del mes deseado para el primer envío."}
                        </FormDescription>
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
          <Button type="submit" disabled={availableTemplates.length === 0 && !form.getValues("templateId")}>
            <Save className="mr-2 h-4 w-4" /> Guardar Campaña
          </Button>
        </div>
      </form>
      <SaturationPreviewDialog
        isOpen={isSaturationDialogOpen}
        onOpenChange={setIsSaturationDialogOpen}
        saturationData={saturationData}
      />
    </Form>
  );
}
