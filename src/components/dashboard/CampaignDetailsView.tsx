
"use client";

import type { Campaign, Template } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit3, Users, CalendarDays, MessageSquareText, FileText, Clock, AlertTriangle, PlayCircle, Send, CheckCircle, Database, ShieldAlert, Mail, Phone, Link2, Paperclip, PhoneCall, MessageSquareReply, Bot, Tag, Download } from "lucide-react";
import { WhatsappIcon } from "@/components/icons/WhatsappIcon";
import { SmsIcon } from "@/components/icons/SmsIcon";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { runTestCampaign, approveCampaign } from "@/actions/campaignActions"; 
import { getPresignedUrlForFile } from "@/actions/fileActions";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import Image from "next/image";
import { Skeleton } from "../ui/skeleton";
import { parseISO, isPast, format } from 'date-fns';
import { es } from 'date-fns/locale';


interface CampaignDetailsViewProps {
  campaign: Campaign;
  template: Template; 
  currentUser?: User | null;
}

export function CampaignDetailsView({ campaign, template, currentUser }: CampaignDetailsViewProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isTesting, setIsTesting] = React.useState(false);
  const [isApproving, setIsApproving] = React.useState(false);

  const [signedMediaUrl, setSignedMediaUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  
  const isAdmin = currentUser?.role === 'admin';
  const isOwner = campaign.userId === currentUser?.id;
  const canEdit = isAdmin || isOwner;

  useEffect(() => {
    if (template.mediaUrl) {
      const fetchSignedUrl = async () => {
        setIsLoadingUrl(true);
        const result = await getPresignedUrlForFile(template.mediaUrl!);
        if (result.signedUrl) {
          setSignedMediaUrl(result.signedUrl);
        } else {
          console.error("Failed to get signed URL:", result.error);
        }
        setIsLoadingUrl(false);
      };
      fetchSignedUrl();
    }
  }, [template.mediaUrl]);


  const getStatusVariant = (status: Campaign['status']): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case 'Aprobada': return 'default';
      case 'Solicitud': return 'outline';
      case 'Enviada': return 'secondary';
      case 'Borrador': return 'outline';
      case 'Pausada': return 'destructive';
      case 'Error Interno': return 'destructive';
      default: return 'outline';
    }
  };

  const handleRunTest = async () => {
    if (!campaign.id) return;
    
    const campaignDateTime = campaign.schedule.nextRun ? parseISO(`${campaign.schedule.nextRun}T${campaign.schedule.time || '00:00:00'}`) : null;
    if (campaign.schedule.frequency === 'once' && campaignDateTime && isPast(campaignDateTime)) {
        toast({
            title: "Campaña Caducada",
            description: `La fecha de envío (${format(campaignDateTime, 'Pp', { locale: es })}) ya ha pasado. Para poder probarla, por favor edita la campaña y elige una fecha futura.`,
            variant: "destructive",
            duration: 8000,
        });
        return;
    }

    if (!campaign.recipientDbQuery) {
      toast({
        title: "Consulta no definida",
        description: "No se puede ejecutar una prueba porque no se ha especificado una consulta SQL en la campaña.",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    toast({
      title: "Iniciando Envío de Prueba REAL",
      description: "Obteniendo destinatarios de la consulta SQL y enviando mensajes de prueba. Esto puede tardar...",
    });

    const result = await runTestCampaign(campaign.id);

    if (result.error) {
      toast({
        title: "Error en el Envío de Prueba",
        description: result.error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Envío de Prueba Completado",
        description: `Se procesaron ${result.processedRecipients ?? 0} destinatarios. Enviados: ${result.sent ?? 0}, Fallidos: ${result.failed ?? 0}. Revisa los logs de mensajes y la consola para detalles del proveedor.`,
        duration: 10000,
      });
    }
    setIsTesting(false);
  };

  const handleApproveCampaign = async () => {
    if (!campaign.id) return;
    setIsApproving(true);
    toast({
      title: "Aprobando Campaña",
      description: "Actualizando el estado de la campaña a Aprobada...",
    });
    const result = await approveCampaign(campaign.id);
    if (result.error) {
      toast({ title: "Error al Aprobar", description: result.error, variant: "destructive" });
    } else if (result.success && result.campaign) {
      toast({ title: "Campaña Aprobada", description: "La campaña está lista para ser procesada según su programación." });
      router.refresh(); 
    } else {
      toast({ title: "Respuesta inesperada al aprobar", description: "No se pudo confirmar la aprobación.", variant: "destructive" });
    }
    setIsApproving(false);
  };
  
  const getFileNameFromUrl = (url: string) => {
    try {
      const urlObject = new URL(url);
      const pathParts = urlObject.pathname.split('/');
      return decodeURIComponent(pathParts[pathParts.length - 1]);
    } catch (e) {
      return "archivo_adjunto";
    }
  };

  const isImageUrl = (url: string) => {
    return /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(url);
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href="/dashboard/campaigns">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Campañas
          </Link>
        </Button>
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
             <Button variant="outline" asChild>
               <Link href={`/dashboard/campaign/edit/${campaign.id}`}>
                 <Edit3 className="mr-2 h-4 w-4" /> Editar Campaña
               </Link>
             </Button>
           )}
          {isAdmin && (campaign.status === 'Borrador' || campaign.status === 'Aprobada' || campaign.status === 'Programada') && (
            <Button onClick={handleRunTest} disabled={isTesting || !campaign.recipientDbQuery} variant="outline">
              <Send className="mr-2 h-4 w-4" /> 
              {isTesting ? "Enviando Prueba..." : "Enviar Campaña de Prueba (Real)"}
            </Button>
          )}
          {isAdmin && (campaign.status === 'Borrador' || campaign.status === 'Solicitud') && (
            <Button onClick={handleApproveCampaign} disabled={isApproving} variant="default">
              <ShieldAlert className="mr-2 h-4 w-4" />
              {isApproving ? "Aprobando..." : "Aprobar y Programar Campaña"}
            </Button>
          )}
        </div>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-3xl font-headline flex items-center">
                {campaign.type === "whatsapp" ? (
                  <WhatsappIcon className="h-8 w-8 mr-3 text-green-500" />
                ) : campaign.type === "sms" ? (
                  <SmsIcon className="h-8 w-8 mr-3 text-blue-500" />
                ) : campaign.type === "email" ? (
                  <Mail className="h-8 w-8 mr-3 text-gray-500" />
                ) : campaign.type === "llamada-ia" ? (
                  <Bot className="h-8 w-8 mr-3 text-cyan-500" />
                ) : (
                  <Phone className="h-8 w-8 mr-3 text-purple-500" />
                )}
                {campaign.name}
              </CardTitle>
              <CardDescription>Creada el: {new Date(campaign.createdAt).toLocaleDateString()}</CardDescription>
            </div>
            <Badge 
              variant={getStatusVariant(campaign.status)} 
              className={`text-sm px-3 py-1 ${campaign.status === 'Solicitud' ? 'bg-amber-500 text-white' : ''}`}
            >
                {campaign.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <InfoItem icon={<Tag className="h-5 w-5 text-primary" />} label="Categoría" value={campaign.category || 'No especificada'} />
            <InfoItem icon={<Users className="h-5 w-5 text-primary" />} label="Destinatarios (Conteo Actual)" value={`${campaign.recipientsCount.toLocaleString()} contactos`} />
            <InfoItem icon={<CalendarDays className="h-5 w-5 text-primary" />} label="Frecuencia de Programación" value={campaign.schedule.frequency} />
            <InfoItem icon={<Clock className="h-5 w-5 text-primary" />} label="Hora Programada" value={campaign.schedule.time} />
            {campaign.schedule.nextRun && <InfoItem icon={<CalendarDays className="h-5 w-5 text-primary" />} label="Próxima Ejecución" value={new Date(campaign.schedule.nextRun + 'T00:00:00').toLocaleDateString()} />}
             {!campaign.schedule.nextRun && campaign.status === 'Borrador' && (
                <div className="flex items-center space-x-2 text-sm text-amber-600 bg-amber-50 p-2 rounded-md">
                    <AlertTriangle className="h-4 w-4"/>
                    <span>Para aprobar, primero define la fecha de envío en "Editar Campaña".</span>
                </div>
            )}
            <InfoItem icon={<FileText className="h-5 w-5 text-primary" />} label="Nombre de Plantilla" value={template.name} />
            
             <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1"><Database className="h-5 w-5 text-primary" /></div>
                <div>
                    <p className="text-sm font-medium text-muted-foreground">Consulta SQL para Destinatarios (BD Principal)</p>
                    {campaign.recipientDbQuery ? (
                         <ScrollArea className="h-24 mt-1 w-full max-w-md border rounded-md bg-muted/30 p-2">
                            <pre className="text-xs whitespace-pre-wrap break-all">{campaign.recipientDbQuery}</pre>
                        </ScrollArea>
                    ) : (
                         <p className="text-base font-semibold">No especificada</p>
                    )}
                </div>
            </div>
            
            {template.parameters && template.parameters.length > 0 && (
                 <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1"><FileText className="h-5 w-5 text-primary" /></div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Parámetros de Plantilla</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {template.parameters.map(p => <Badge key={p} variant="secondary" className="text-xs">{"{{" + p + "}}"}</Badge>)}
                        </div>
                    </div>
                </div>
            )}
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center">
                <MessageSquareText className="mr-2 h-5 w-5 text-primary" />
                Contenido de Plantilla ({template.name})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-40 w-full rounded-md border p-4 bg-muted/30">
                <p className="text-sm whitespace-pre-wrap">{template.content || "No hay contenido disponible."}</p>
              </ScrollArea>
              {template.mediaUrl && (
                  <div className="mt-4">
                      <h4 className="text-sm font-medium flex items-center mb-2"><Paperclip className="mr-2 h-4 w-4 text-muted-foreground"/>Adjunto</h4>
                      <div className="flex items-center gap-4">
                        {isLoadingUrl && <Skeleton className="w-16 h-16 rounded-md" />}
                        {!isLoadingUrl && signedMediaUrl && isImageUrl(template.mediaUrl) && (
                            <Image src={signedMediaUrl} alt="Vista previa del adjunto" width={60} height={60} className="rounded-md border object-cover" />
                        )}
                        <a href={signedMediaUrl || '#'} target="_blank" rel="noopener noreferrer" download={getFileNameFromUrl(template.mediaUrl)}>
                            <Button variant="outline" size="sm" disabled={isLoadingUrl || !signedMediaUrl}>
                                <Download className="mr-2 h-4 w-4" />
                                Descargar
                            </Button>
                        </a>
                      </div>
                  </div>
              )}
              {template.linkUrl && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium flex items-center mb-2"><Link2 className="mr-2 h-4 w-4 text-muted-foreground"/>Enlace</h4>
                  <a href={template.linkUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">{template.linkUrl}</a>
                </div>
              )}
              {template.buttonType && template.buttonType !== 'none' && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium flex items-center mb-2">
                    {template.buttonType === 'call' && <PhoneCall className="mr-2 h-4 w-4 text-muted-foreground" />}
                    {template.buttonType === 'reply' && <MessageSquareReply className="mr-2 h-4 w-4 text-muted-foreground" />}
                    Botón Interactivo
                  </h4>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{template.buttonType === 'call' ? 'Llamada' : 'Respuesta Rápida'}</Badge>
                    <p className="text-sm font-mono bg-muted px-2 py-1 rounded">{template.buttonText}: {template.buttonValue}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoItem: React.FC<InfoItemProps> = ({ icon, label, value}) => (
  <div className="flex items-start space-x-3">
    <div className="flex-shrink-0 mt-1">{icon}</div>
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  </div>
);
