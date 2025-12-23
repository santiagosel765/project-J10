
"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MessageLog, Template, MessageStatus } from "@/lib/mock-data";
import { format, isValid } from "date-fns";
import { es } from "date-fns/locale";

interface MessageLogTableProps {
  messageLogs: MessageLog[];
  templates: Template[];
  // Pagination props from server
  currentPage: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading: boolean;
  itemsPerPage?: number; // Configurable items per page
  // Pagination handlers
  onNextPage: () => void;
  onPreviousPage: () => void;
  onGoToPage: (page: number) => void;
}

export function MessageLogTable({ 
  messageLogs, 
  templates,
  currentPage,
  totalCount,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  isLoading,
  itemsPerPage = 10,
  onNextPage,
  onPreviousPage,
  onGoToPage
}: MessageLogTableProps) {

  const getTemplateNameById = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    return template ? template.name : "Desconocida";
  };

  const getStatusVariant = (status: MessageStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'Enviado':
      case 'Enviado (Prueba)':
        return 'default'; 
      case 'En Proceso':
        return 'secondary';
      case 'Error':
      case 'Error (Prueba)':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) {
      return "Fecha inválida";
    }
    const dateObj = new Date(dateString);
    if (isValid(dateObj)) {
      return format(dateObj, "PPpp", { locale: es });
    }
    return "Fecha inválida";
  };

  return (
    <>
      <div className="relative w-full overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Destinatario (Teléfono)</TableHead>
              <TableHead>Plantilla</TableHead>
              <TableHead>Fecha y Hora</TableHead>
              <TableHead className="text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messageLogs.length > 0 ? (
              messageLogs.map((log) => (
                <TableRow key={log.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">{log.recipientContact}</TableCell>
                  <TableCell>{getTemplateNameById(log.templateId)}</TableCell>
                  <TableCell>{formatDate(log.sent_at)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={getStatusVariant(log.status)}>{log.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  No hay logs de mensajes para mostrar según los filtros aplicados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-600">
            Mostrando {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalCount)} de {totalCount} registros
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPreviousPage}
              disabled={!hasPreviousPage || isLoading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            
            <div className="flex items-center space-x-1">
              {/* Show page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const page = Math.max(1, currentPage - 2) + i;
                if (page > totalPages) return null;
                
                return (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => onGoToPage(page)}
                    disabled={isLoading}
                    className="w-8 h-8 p-0"
                  >
                    {page}
                  </Button>
                );
              })}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={onNextPage}
              disabled={!hasNextPage || isLoading}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

    </>
  );
}
