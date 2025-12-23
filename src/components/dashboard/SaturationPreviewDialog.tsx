

"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, MessageCircleWarning } from "lucide-react";
import type { ContactFrequencyInCampaigns } from "@/actions/saturationActions";
import { format, isValid, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface SaturationPreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saturationData: ContactFrequencyInCampaigns[] | null;
}

export function SaturationPreviewDialog({
  isOpen,
  onOpenChange,
  saturationData,
}: SaturationPreviewDialogProps) {

  const getSaturationBadge = (count: number) => {
    if (count > 5) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1.5">
          <MessageCircleWarning className="h-3.5 w-3.5" />
          Muy Alta
        </Badge>
      );
    }
    if (count > 2) {
      return (
        <Badge className="bg-amber-500 text-white flex items-center gap-1.5">
            <MessageCircleWarning className="h-3.5 w-3.5" />
            Media
        </Badge>
      );
    }
    return <Badge variant="secondary">Baja</Badge>;
  };

  const totalContacts = saturationData?.length || 0;
  const saturatedContacts = saturationData?.filter(s => s.count > 1).length || 0;
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Análisis de Saturación de Destinatarios</DialogTitle>
          <DialogDescription>
            Revisa la frecuencia de contacto para la audiencia seleccionada. Contactos con nivel 'Alto' o 'Medio' podrían ignorar tus mensajes.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
            {totalContacts > 0 ? (
                <>
                <Alert variant={saturatedContacts > 0 ? "destructive" : "default"} className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Resumen del Análisis</AlertTitle>
                    <AlertDescription>
                        Se encontraron <strong>{saturatedContacts} de {totalContacts}</strong> contactos con un nivel de saturación medio o alto. Considera ajustar tu consulta SQL para excluirlos si es necesario.
                    </AlertDescription>
                </Alert>
                <ScrollArea className="h-[50vh] pr-4">
                    <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                        <TableHead>Contacto</TableHead>
                        <TableHead className="text-center">Nivel</TableHead>
                        <TableHead className="text-center">Campañas</TableHead>
                        <TableHead>Nombres de Campañas</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {saturationData?.map((item) => (
                        <TableRow key={item.contact}>
                            <TableCell className="font-medium">{item.contact}</TableCell>
                            <TableCell className="text-center">
                            {getSaturationBadge(item.count)}
                            </TableCell>
                            <TableCell className="text-center font-mono">{item.count}</TableCell>
                            <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-md">
                                    {item.campaigns.map(c => <Badge key={c.id} variant="outline">{c.name}</Badge>)}
                                </div>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                </ScrollArea>
                </>
            ) : (
                <p className="text-center text-muted-foreground py-8">La consulta no devolvió destinatarios para analizar.</p>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
