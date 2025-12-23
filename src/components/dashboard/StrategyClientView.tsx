
"use client";

import type React from 'react';
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Info, PlusCircle, HelpCircle, Network, Settings, FileText, Clock, Database, Loader2 } from "lucide-react";
import type { CollectionsMatrixRule, Template, CollectionsConfiguration } from "@/lib/mock-data";
import {
  getCollectionsMatrixRules,
  updateCollectionsConfiguration,
  loadMatrixFromSql,
} from "@/actions/collectionsActions";
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface StrategyClientViewProps {
  initialRules: CollectionsMatrixRule[];
  initialTemplates: Template[];
  initialConfig: Partial<CollectionsConfiguration>;
}

export function StrategyClientView({ initialRules, initialTemplates, initialConfig }: StrategyClientViewProps) {
  // Config state
  const [config, setConfig] = useState(initialConfig);
  const [mainCollectionsQuery, setMainCollectionsQuery] = useState(initialConfig.main_collections_query || '');
  const [processingTime, setProcessingTime] = useState(initialConfig.processing_time || '08:00');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Matrix state
  const [rules, setRules] = useState(initialRules);
  const [templates, setTemplates] = useState(initialTemplates);
  const [matrixSql, setMatrixSql] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  const { toast } = useToast();

  const handleConfigSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingConfig(true);
    const formData = new FormData();
    formData.append('mainCollectionsQuery', mainCollectionsQuery);
    formData.append('processingTime', processingTime);

    const result = await updateCollectionsConfiguration(formData);
    if (result.error) {
      toast({ title: "Error al guardar configuración", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Configuración Guardada", description: "La configuración general ha sido actualizada." });
      if (result.config) {
        setConfig(result.config);
        setMainCollectionsQuery(result.config.main_collections_query || '');
        setProcessingTime(result.config.processing_time || '08:00');
      }
    }
    setIsSavingConfig(false);
  };

  const handleMatrixUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matrixSql) {
      toast({ title: "Consulta SQL vacía", description: "Por favor, escribe una consulta SQL para obtener las reglas.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    
    const formData = new FormData();
    formData.append('matrixSql', matrixSql);

    const result = await loadMatrixFromSql(formData);
    setIsUploading(false);

    if (result.error) {
      toast({ title: "Error al cargar matriz desde SQL", description: result.error, variant: "destructive", duration: 10000 });
    } else {
        const baseDescription = `${result.rulesSavedCount || 0} reglas fueron guardadas exitosamente.`;
        if (result.errorsInQuery && result.errorsInQuery.length > 0) {
            toast({
                title: "Carga de Reglas Completada con Avisos",
                description: (
                    <div className="flex flex-col gap-2">
                        <p>{baseDescription}</p>
                        <p className="font-bold">Las siguientes reglas no se guardaron:</p>
                        <ul className="list-disc list-inside text-xs">
                            {result.errorsInQuery.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    </div>
                ),
                duration: 15000,
            });
        } else {
            toast({ title: "Matriz de Cobranza Actualizada", description: baseDescription, duration: 7000 });
        }
    }
    
    // Re-fetch rules to update the table
    const rulesResult = await getCollectionsMatrixRules();
    if (rulesResult.rules) {
      setRules(rulesResult.rules);
    }
  };
  
  const getTemplateDisplayInfo = (rule: CollectionsMatrixRule) => {
    if (rule.template_id) {
        const template = templates.find(t => t.id === rule.template_id);
        return template ? template.name : <span className="text-muted-foreground italic">ID: {rule.template_id} (No encontrada)</span>;
    }
    if (rule.pending_template_name) {
        return <span className="text-amber-600 italic">{rule.pending_template_name}</span>;
    }
    return <span className="text-destructive italic">No Asignada</span>;
  };
  
  return (
     <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center">
            <Network className="mr-3 h-8 w-8 text-primary" />
            Estrategia de Cobranza y Prevención
          </CardTitle>
          <CardDescription>
            Define y gestiona la lógica central que determina qué comunicación se envía, cuándo y a quién.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Accordion type="single" collapsible className="w-full space-y-6" defaultValue={!mainCollectionsQuery ? "config-general" : undefined}>
        <AccordionItem value="config-general" className="border-b-0">
            <Card className="shadow-md">
                <AccordionTrigger className="w-full text-left p-6 hover:no-underline [&[data-state=open]>svg]:-rotate-180">
                   <div className="flex-1">
                     <CardTitle className="flex items-center"><Settings className="mr-2 h-6 w-6 text-primary"/>Configuración General del Proceso</CardTitle>
                     <CardDescription className="pt-2 text-left">
                        Define la consulta SQL principal para obtener los clientes y la hora a la que se ejecutará el proceso.
                     </CardDescription>
                   </div>
                </AccordionTrigger>
                <AccordionContent>
                    <CardContent className="pt-2">
                      <form onSubmit={handleConfigSave} className="space-y-6">
                        <div>
                          <Label htmlFor="mainCollectionsQuery" className="flex items-center mb-1">
                            <FileText className="mr-2 h-4 w-4 text-muted-foreground"/>
                            Consulta SQL de Destinatarios
                          </Label>
                          <Textarea
                            id="mainCollectionsQuery"
                            value={mainCollectionsQuery}
                            onChange={(e) => setMainCollectionsQuery(e.target.value)}
                            placeholder="Ej: SELECT id_cliente as contacto, dias_mora as dias_de_atraso, nombre_cliente as nombre FROM vista_clientes_con_mora;"
                            rows={5}
                            className="font-mono text-sm"
                            required
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Debe devolver al menos las columnas: <code>contacto</code>, <code>dias_de_atraso</code>. 
                            Otras columnas pueden usarse como parámetros en las plantillas.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="processingTime" className="flex items-center mb-1">
                                  <Clock className="mr-2 h-4 w-4 text-muted-foreground"/>
                                  Hora de Procesamiento Diario (HH:MM)
                              </Label>
                              <Input
                                  id="processingTime"
                                  type="time"
                                  value={processingTime}
                                  onChange={(e) => setProcessingTime(e.target.value)}
                                  className="w-full md:w-auto"
                                  required
                              />
                            </div>
                        </div>
                        <Button type="submit" disabled={isSavingConfig}>
                          {isSavingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                          {isSavingConfig ? "Guardando..." : "Guardar Configuración General"}
                        </Button>
                      </form>
                    </CardContent>
                </AccordionContent>
            </Card>
        </AccordionItem>
        <AccordionItem value="matriz-reglas" className="border-b-0">
            <Card className="shadow-md">
                <AccordionTrigger className="w-full text-left p-6 hover:no-underline [&[data-state=open]>svg]:-rotate-180">
                   <div className="flex-1">
                    <CardTitle className="flex items-center"><Database className="mr-2 h-6 w-6 text-primary"/>Fuente de la Matriz de Reglas</CardTitle>
                    <CardDescription className="pt-2 text-left">
                        Carga o reemplaza la matriz de reglas (qué mensaje enviar según los días de atraso) usando una consulta SQL.
                    </CardDescription>
                   </div>
                </AccordionTrigger>
                <AccordionContent>
                    <CardContent className="pt-2">
                       <form onSubmit={handleMatrixUpload} className="space-y-4 mb-6">
                        <div className="grid w-full gap-1.5">
                          <Label htmlFor="matrixSql">Consulta SQL de Reglas</Label>
                          <Textarea 
                            id="matrixSql" 
                            placeholder="SELECT dias_mora AS dias_de_atraso, 'whatsapp' AS canal, 'nombre_plantilla_de_whatsapp' AS template_name FROM origen_de_reglas"
                            className="font-mono text-sm"
                            rows={6}
                            value={matrixSql}
                            onChange={(e) => setMatrixSql(e.target.value)}
                          />
                           <p className="text-xs text-muted-foreground mt-1">
                            Columnas requeridas: <code>dias_de_atraso</code>, <code>canal</code> ('whatsapp', 'sms', 'email', 'llamada'), <code>template_name</code>.
                          </p>
                        </div>
                        <Button type="submit" disabled={isUploading || !matrixSql}>
                          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                          {isUploading ? "Cargando..." : "Cargar y Reemplazar Matriz desde SQL"}
                        </Button>
                      </form>
                    </CardContent>
                </AccordionContent>
            </Card>
        </AccordionItem>
      </Accordion>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Reglas Actuales en Sistema</CardTitle>
          <CardDescription>Esta es la matriz que se está utilizando actualmente para los envíos automáticos.</CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Días de Atraso</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Plantilla</TableHead>
                    <TableHead>Estado/Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id} className={!rule.template_id && (rule.channel === 'whatsapp' || rule.channel === 'sms') ? "bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-950" : "hover:bg-muted/50"}>
                      <TableCell>{rule.days_of_arrears}</TableCell>
                      <TableCell><Badge variant={rule.channel === 'whatsapp' ? 'default' : rule.channel === 'sms' ? 'secondary' : 'outline'}>{rule.channel.toUpperCase()}</Badge></TableCell>
                      <TableCell>
                        {getTemplateDisplayInfo(rule)}
                      </TableCell>
                      <TableCell>
                        {!rule.template_id && rule.pending_template_name && (rule.channel === 'whatsapp' || rule.channel === 'sms') ? (
                          <>
                            <Badge variant="outline" className="mb-1 border-amber-500 text-amber-700 dark:text-amber-300 dark:border-amber-700">
                                <HelpCircle className="mr-1 h-3 w-3" />
                                Pendiente de Plantilla
                            </Badge>
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/dashboard/templates/create?name=${encodeURIComponent(rule.pending_template_name || '')}&type=${rule.channel}&daysToResolve=${rule.days_of_arrears}&channelToResolve=${rule.channel}&from=strategy`}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Crear Plantilla
                              </Link>
                            </Button>
                          </>
                        ) : !rule.template_id && (rule.channel === 'email' || rule.channel === 'llamada') ? (
                            <Badge variant="outline" className="border-cyan-500 text-cyan-700 dark:text-cyan-300 dark:border-cyan-700">
                                Visualización
                            </Badge>
                        ) : rule.template_id ? (
                          <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-300 dark:border-green-700">Activa</Badge>
                        ) : (
                          <Badge variant="destructive">Error de Config.</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>No hay reglas cargadas</AlertTitle>
              <AlertDescription>
                Usa el formulario de arriba para cargar las reglas de tu estrategia usando una consulta SQL.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
