

"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Edit3, Eye, PlusCircle, Trash2, LayoutDashboard, ShieldAlert, ChevronLeft, ChevronRight, Mail, Phone, Bot, Tag } from "lucide-react";
import type { Campaign, Template, CampaignStatus } from "@/lib/mock-data";
import { WhatsappIcon } from "@/components/icons/WhatsappIcon";
import { SmsIcon } from "@/components/icons/SmsIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { deleteCampaign, approveCampaign } from "@/actions/campaignActions";
import { useRouter } from "next/navigation"; 
import type { User } from "next-auth";
import type { UserRecord } from "@/actions/userActions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface CampaignTableProps {
  campaigns: Campaign[];
  templates: Template[]; 
  users: Omit<UserRecord, 'hashedPassword'>[];
  currentUser?: User | null;
}

export function CampaignTable({ campaigns, templates, users, currentUser }: CampaignTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const isAdmin = currentUser?.role === 'admin';
  const [showPendingOnly, setShowPendingOnly] = React.useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const userMap = useMemo(() => {
    return new Map(users.map(user => [user.id, user]));
  }, [users]);
  
  const filteredCampaigns = React.useMemo(() => {
    if (isAdmin && showPendingOnly) {
      return campaigns.filter(campaign => campaign.status === 'Solicitud');
    }
    return campaigns;
  }, [campaigns, isAdmin, showPendingOnly]);

  const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage);
  const paginatedCampaigns = useMemo(() => {
      return filteredCampaigns.slice(
          (currentPage - 1) * itemsPerPage,
          currentPage * itemsPerPage
      );
  }, [filteredCampaigns, currentPage, itemsPerPage]);

  const getInitials = (name?: string | null) => {
    if (!name) return '??';
    const parts = name.split(' ').filter(p => p);
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getTemplateNameById = (templateId: string): string => {
    const template = templates.find(t => t.id === templateId);
    return template ? template.name : "ID: " + templateId; 
  };

  const handleDelete = async (campaignId: string, campaignName: string) => {
    const result = await deleteCampaign(campaignId);
    if (result.success) {
      toast({
        title: "Campaña Eliminada",
        description: `La campaña "${campaignName}" ha sido eliminada.`,
      });
      router.refresh();
    } else {
      toast({
        title: "Error al eliminar",
        description: result.error || "No se pudo eliminar la campaña.",
        variant: "destructive",
      });
    }
  };

  const handleApprove = async (campaignId: string, campaignName: string) => {
     const campaignToApprove = campaigns.find(c => c.id === campaignId);
     if (!campaignToApprove) return;

     if (!campaignToApprove.schedule.nextRun || !campaignToApprove.schedule.time) {
        toast({
            title: "Acción Requerida",
            description: `La campaña "${campaignName}" debe tener una fecha y hora de programación definidas para ser aprobada. Edita la campaña para establecerlas.`,
            variant: "destructive",
            duration: 7000,
        });
        return;
     }

    const result = await approveCampaign(campaignId);
    if (result.success) {
      toast({
        title: "Campaña Aprobada",
        description: `La campaña "${campaignName}" ha sido aprobada y está lista para su procesamiento.`,
      });
      router.refresh();
    } else {
      toast({
        title: "Error al Aprobar",
        description: result.error || "No se pudo aprobar la campaña.",
        variant: "destructive",
      });
    }
  };
  
  const getStatusVariant = (status: CampaignStatus): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case 'Aprobada':
        return 'default'; // Blue/theme accent
      case 'Solicitud':
        return 'default'; // Use a prominent color like yellow/amber, will be customized below
      case 'Enviada':
        return 'secondary'; // Gray/less prominent
      case 'Borrador':
        return 'outline'; // Bordered, neutral
      case 'Error Interno':
      case 'Pausada':
        return 'destructive'; // Red
      default:
        return 'outline';
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-wrap gap-4">
        <div>
          <CardTitle className="text-2xl font-headline flex items-center">
             <LayoutDashboard className="mr-3 h-7 w-7 text-primary" />
            Campañas
          </CardTitle>
          <CardDescription>Gestiona, crea y aprueba tus campañas de comunicación.</CardDescription>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <div className="flex items-center space-x-2">
              <Switch
                id="pending-campaigns"
                checked={showPendingOnly}
                onCheckedChange={setShowPendingOnly}
              />
              <Label htmlFor="pending-campaigns" className="text-sm font-medium whitespace-nowrap">Solo Solicitudes</Label>
            </div>
          )}
          <Button asChild size="sm">
            <Link href="/dashboard/campaign/create"> 
              <PlusCircle className="mr-2 h-4 w-4" /> Crear Campaña
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre Campaña</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Creador</TableHead>
                <TableHead className="text-center">Tipo</TableHead>
                <TableHead>Plantilla Usada</TableHead>
                <TableHead>Programación</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCampaigns.map((campaign) => {
                const isPendingApproval = campaign.status === 'Solicitud';
                const creator = campaign.userId ? userMap.get(campaign.userId) : null;
                const canEdit = isAdmin || campaign.userId === currentUser?.id;

                return (
                  <TableRow key={campaign.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <Tag className="h-3 w-3" />
                            {campaign.category || "N/A"}
                        </Badge>
                    </TableCell>
                    <TableCell>
                      {creator ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={creator.image || undefined} alt={creator.name || 'Avatar'} data-ai-hint="creator avatar" />
                                <AvatarFallback>{getInitials(creator.name)}</AvatarFallback>
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{creator.name}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {campaign.type === "whatsapp" ? (
                        <WhatsappIcon className="h-6 w-6 mx-auto text-green-500" />
                      ) : campaign.type === "sms" ? (
                        <SmsIcon className="h-6 w-6 mx-auto text-blue-500" />
                      ) : campaign.type === 'email' ? (
                        <Mail className="h-6 w-6 mx-auto text-gray-500" />
                      ) : campaign.type === 'llamada-ia' ? (
                        <Bot className="h-6 w-6 mx-auto text-cyan-500" />
                      ) : (
                        <Phone className="h-6 w-6 mx-auto text-purple-500" />
                      )}
                    </TableCell>
                    <TableCell>{getTemplateNameById(campaign.templateId)}</TableCell>
                    <TableCell>{campaign.schedule.frequency} a las {campaign.schedule.time} {campaign.schedule.nextRun ? `(Próx: ${new Date(campaign.schedule.nextRun + 'T00:00:00').toLocaleDateString()})` : ''}</TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant={getStatusVariant(campaign.status)}
                        className={campaign.status === 'Solicitud' ? 'bg-amber-500 text-white' : ''}
                      >
                        {campaign.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menú</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/campaign/${campaign.id}`} className="flex items-center cursor-pointer">
                              <Eye className="mr-2 h-4 w-4" /> Ver Detalles
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && (
                              <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/campaign/edit/${campaign.id}`} className="flex items-center cursor-pointer">
                                      <Edit3 className="mr-2 h-4 w-4" /> Editar
                                  </Link>
                              </DropdownMenuItem>
                          )}
                          {isPendingApproval && isAdmin && (
                             <DropdownMenuItem onClick={() => handleApprove(campaign.id, campaign.name)} className="flex items-center cursor-pointer text-green-600 focus:text-green-700">
                               <ShieldAlert className="mr-2 h-4 w-4" /> Aprobar Campaña
                             </DropdownMenuItem>
                          )}
                          {isAdmin && <DropdownMenuSeparator />}
                          {isAdmin && (
                              <AlertDialog>
                              <AlertDialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                  </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                  <AlertDialogHeader>
                                  <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                      Esta acción no se puede deshacer. Esto eliminará permanentemente la campaña
                                      "{campaign.name}" y sus destinatarios asociados.
                                  </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                      onClick={() => handleDelete(campaign.id, campaign.name)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                      Eliminar
                                  </AlertDialogAction>
                                  </AlertDialogFooter>
                              </AlertDialogContent>
                              </AlertDialog>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
              </span>
              <div className="flex gap-2">
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                  >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Anterior
                  </Button>
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage >= totalPages}
                  >
                      Siguiente
                      <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
              </div>
          </div>
        )}

        {filteredCampaigns.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            {showPendingOnly ? "No hay campañas pendientes de aprobación."
            : <>Aún no hay campañas. <Link href="/dashboard/campaign/create" className="text-primary hover:underline">Crea tu primera campaña</Link>.</>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
