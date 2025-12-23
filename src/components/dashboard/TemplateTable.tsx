

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
import { Edit3, PlusCircle, Trash2, FileText, ShieldAlert, ChevronLeft, ChevronRight, Mail, Phone, Bot } from "lucide-react";
import type { Template, TemplateStatus } from "@/lib/mock-data";
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
import { WhatsappIcon } from "@/components/icons/WhatsappIcon";
import { SmsIcon } from "@/components/icons/SmsIcon";
import { deleteTemplate, approveTemplate } from "@/actions/templateActions"; 
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import type { UserRecord } from "@/actions/userActions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface TemplateTableProps {
  templates: Template[];
  users: Omit<UserRecord, 'hashedPassword'>[];
  currentUser?: User | null;
}

export function TemplateTable({ templates, users, currentUser }: TemplateTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const isAdmin = currentUser?.role === 'admin';
  const [showPendingOnly, setShowPendingOnly] = React.useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const userMap = useMemo(() => {
    return new Map(users.map(user => [user.id, user]));
  }, [users]);
  
  const filteredTemplates = React.useMemo(() => {
    if (isAdmin && showPendingOnly) {
      return templates.filter(template => template.status === 'Solicitud');
    }
    return templates;
  }, [templates, isAdmin, showPendingOnly]);

  const totalPages = Math.ceil(filteredTemplates.length / itemsPerPage);
  const paginatedTemplates = useMemo(() => {
    return filteredTemplates.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredTemplates, currentPage, itemsPerPage]);

  const getInitials = (name?: string | null) => {
    if (!name) return '??';
    const parts = name.split(' ').filter(p => p);
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleDelete = async (templateId: string, templateName: string) => {
    const result = await deleteTemplate(templateId);
    if (result.success) {
      toast({
        title: "Plantilla Eliminada",
        description: `La plantilla "${templateName}" ha sido eliminada.`,
      });
      router.refresh();
    } else {
      toast({
        title: "Error al eliminar",
        description: result.error || "No se pudo eliminar la plantilla.",
        variant: "destructive",
      });
    }
  };

  const handleApprove = async (templateId: string, templateName: string) => {
    const result = await approveTemplate(templateId);
    if (result.success) {
        toast({ title: "Plantilla Aprobada", description: `La plantilla "${templateName}" ha sido aprobada.` });
        router.refresh();
    } else {
        toast({ title: "Error al aprobar", description: result.error || "No se pudo aprobar la plantilla.", variant: "destructive" });
    }
  };

  const getStatusVariant = (status: TemplateStatus): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case 'Aprobada': return 'default';
      case 'Solicitud': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-wrap gap-4">
        <div>
          <CardTitle className="text-2xl font-headline flex items-center">
            <FileText className="mr-3 h-7 w-7 text-primary" />
            Plantillas de Mensajes
          </CardTitle>
          <CardDescription>Gestiona tus plantillas para campañas de WhatsApp y SMS.</CardDescription>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="pending-templates"
                  checked={showPendingOnly}
                  onCheckedChange={setShowPendingOnly}
                />
                <Label htmlFor="pending-templates" className="text-sm font-medium whitespace-nowrap">Solo Solicitudes</Label>
              </div>
            )}
          <Button asChild size="sm">
            <Link href="/dashboard/templates/create">
              <PlusCircle className="mr-2 h-4 w-4" /> Crear Plantilla
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Creador</TableHead>
                <TableHead className="text-center">Tipo</TableHead>
                <TableHead>Parámetros</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead>Fecha Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTemplates.map((template) => {
                const canEdit = isAdmin || template.userId === currentUser?.id;
                const isPendingApproval = template.status === 'Solicitud';
                const creator = template.userId ? userMap.get(template.userId) : null;

                return (
                <TableRow key={template.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">{template.name}</TableCell>
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
                    {template.type === "whatsapp" ? (
                      <WhatsappIcon className="h-6 w-6 mx-auto text-green-500" />
                    ) : template.type === "sms" ? (
                      <SmsIcon className="h-6 w-6 mx-auto text-blue-500" />
                    ) : template.type === "email" ? (
                      <Mail className="h-6 w-6 mx-auto text-gray-500" />
                    ) : template.type === "llamada-ia" ? (
                      <Bot className="h-6 w-6 mx-auto text-cyan-500" />
                    ) : (
                      <Phone className="h-6 w-6 mx-auto text-purple-500" />
                    )}
                  </TableCell>
                  <TableCell>
                    {template.parameters && template.parameters.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {template.parameters.map(param => (
                          <Badge key={param} variant="secondary" className="text-xs">{"{{" + param + "}}"}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ninguno</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                      <Badge variant={getStatusVariant(template.status)} className={isPendingApproval ? 'bg-amber-500 text-white' : ''}>
                          {template.status}
                      </Badge>
                  </TableCell>
                  <TableCell>{new Date(template.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isAdmin && isPendingApproval && (
                           <DropdownMenuItem onClick={() => handleApprove(template.id, template.name)} className="flex items-center cursor-pointer text-green-600 focus:text-green-700">
                             <ShieldAlert className="mr-2 h-4 w-4" /> Aprobar Plantilla
                           </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/templates/edit/${template.id}`} className="flex items-center cursor-pointer">
                              <Edit3 className="mr-2 h-4 w-4" /> Editar
                            </Link>
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
                                  Esta acción no se puede deshacer. Esto eliminará permanentemente la plantilla
                                  "{template.name}". Las campañas que usen esta plantilla podrían fallar si no se actualizan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(template.id, template.name)}
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
              )})}
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

        {filteredTemplates.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            {showPendingOnly ? "No hay plantillas pendientes de aprobación." : 
            <>Aún no hay plantillas creadas. <Link href="/dashboard/templates/create" className="text-primary hover:underline">Crea tu primera plantilla</Link>.</>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
