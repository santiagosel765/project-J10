
"use client";

import type React from 'react';
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, AlertTriangle, Users, Loader2, Send, Power, PowerOff, CheckCircle } from "lucide-react";
import type { CollectionsConfiguration } from "@/lib/mock-data";
import {
  getPreventiveCollectionCustomersPreview,
  runPreventiveCollectionsTest,
  setCollectionsEnabled
} from "@/actions/collectionsActions";

type CustomerPreview = Record<string, any>;

interface PreventiveCollectionsClientViewProps {
    initialConfig: Partial<CollectionsConfiguration>;
    initialPreviewCustomers: CustomerPreview[];
    initialError?: string;
}

export function PreventiveCollectionsClientView({ initialConfig, initialPreviewCustomers, initialError }: PreventiveCollectionsClientViewProps) {
  const [config, setConfig] = useState(initialConfig);
  const [isEnabled, setIsEnabled] = useState(initialConfig.is_enabled ?? true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);

  const [previewCustomers, setPreviewCustomers] = useState<CustomerPreview[]>(initialPreviewCustomers);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  
  const { toast } = useToast();
  
  const handleToggleEnabled = async (enabled: boolean) => {
    setIsToggling(true);
    const result = await setCollectionsEnabled(enabled);
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      setIsEnabled(!enabled); // Revert UI
    } else {
      toast({ title: "Estado Actualizado", description: `El proceso automático ha sido ${enabled ? 'habilitado' : 'deshabilitado'}.` });
      setIsEnabled(enabled);
    }
    setIsToggling(false);
  };

  const handleRunTest = async () => {
    setIsTesting(true);
    toast({ title: "Iniciando prueba de prevención", description: "Se están procesando los clientes sin mora y enviando mensajes reales..." });
    
    const result = await runPreventiveCollectionsTest();
    
    if (result.error) {
        toast({ title: "Error en la prueba", description: result.error, variant: "destructive" });
    } else {
        toast({
            title: "Prueba de Prevención Completada",
            description: `Se procesaron ${result.totalCustomers ?? 0} clientes. Enviados: ${result.processed}, Fallidos: ${result.errors}. Revisa los logs de mensajes con la campaña 'preventive-collections-test'.`,
            duration: 10000,
        });
    }
    setIsTesting(false);
  };
  
  const previewTableHeaders = previewCustomers.length > 0 ? Object.keys(previewCustomers[0]) : [];

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Cargando...</span></div>;
  }

  if (error) {
    return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /> <AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  }

  return (
     <div className="space-y-8">
       <Card className="shadow-lg">
         <CardHeader>
           <CardTitle className="text-3xl font-headline flex items-center">
             <ShieldCheck className="mr-3 h-8 w-8 text-primary" />
             Gestión de Prevención de Cobranza
           </CardTitle>
           <CardDescription>
             Ejecuta y prueba el proceso para clientes que aún no tienen mora (días de atraso &lt;= 0).
           </CardDescription>
         </CardHeader>
       </Card>
      
       {!config.id && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Configuración Requerida</AlertTitle>
            <AlertDescription>
                No se ha definido una consulta SQL principal. Por favor, ve a la sección de "Estrategia" para configurar la consulta y la hora de procesamiento.
            </AlertDescription>
          </Alert>
        )}

      <Card>
        <CardHeader>
            <CardTitle className="flex items-center"><Power className="mr-2 h-6 w-6 text-primary"/>Estado del Proceso Automático</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex items-center space-x-3">
                <Switch
                    id="isEnabled"
                    checked={isEnabled}
                    onCheckedChange={handleToggleEnabled}
                    disabled={isToggling || !config.id}
                    aria-label="Activar o desactivar el proceso automático"
                />
                <Label htmlFor="isEnabled" className="text-lg">
                    {isToggling ? "Actualizando..." : (isEnabled ? "Proceso Automático Habilitado" : "Proceso Automático Deshabilitado")}
                </Label>
                {isEnabled ? <CheckCircle className="h-6 w-6 text-green-500"/> : <PowerOff className="h-6 w-6 text-destructive"/>}
            </div>
            <p className="text-sm text-muted-foreground mt-2">Este interruptor controla si los envíos automáticos de cobranza y prevención se ejecutarán diariamente a la hora programada.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center"><Users className="mr-2 h-6 w-6 text-primary"/>Previsualización de Clientes para Prevención</CardTitle>
              <CardDescription>
                Muestra de los clientes con días de atraso cero o negativos que serían procesados por este módulo.
              </CardDescription>
            </div>
            <Button onClick={handleRunTest} disabled={isTesting || isPreviewLoading || !config.main_collections_query} variant="outline">
              {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar prueba
            </Button>
        </CardHeader>
        <CardContent>
          {isPreviewLoading && (
            <div className="flex items-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Cargando previsualización de clientes...</span>
            </div>
          )}

          {previewError && (
             <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error al Cargar Muestra</AlertTitle>
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          )}

          {!isPreviewLoading && !previewError && previewCustomers.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="text-sm text-muted-foreground mb-2">Mostrando los primeros {previewCustomers.length} resultados.</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewTableHeaders.map(header => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewCustomers.map((customer, index) => (
                    <TableRow key={index}>
                      {previewTableHeaders.map(header => (
                        <TableCell key={header}>{String(customer[header])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!isPreviewLoading && !previewError && previewCustomers.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
               {config.main_collections_query ? 'No se encontraron clientes para prevención según la consulta de configuración.' : 'Define la consulta de destinatarios en la página de Estrategia para ver una previsualización.'}
            </p>
          )}
           <p className="mt-4 text-sm text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3 flex items-start">
              <AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                  <strong>Atención:</strong> Al presionar el botón de envío de prueba, se enviarán mensajes reales a los contactos obtenidos por la consulta guardada. No es una simulación.
              </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
