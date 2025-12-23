
"use client";

import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { CampaignExclusion } from "@/actions/saturationActions";
import { revertExclusion } from "@/actions/saturationActions";
import { Search, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useDebounce } from 'use-debounce';

interface ExclusionsTableProps {
  initialExclusions: CampaignExclusion[];
}

export function ExclusionsTable({ initialExclusions }: ExclusionsTableProps) {
  const [exclusions, setExclusions] = useState(initialExclusions);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
  const { toast } = useToast();

  const filteredExclusions = exclusions.filter(
    (ex) =>
      ex.contact.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      ex.campaignName.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
  );

  const handleRevertExclusion = async (exclusionId: string) => {
    const result = await revertExclusion(exclusionId);
    if (result.success) {
      toast({
        title: "Exclusión Revertida",
        description: "El contacto volverá a ser incluido en la campaña en futuras ejecuciones.",
      });
      setExclusions((prev) => prev.filter((ex) => ex.id !== exclusionId));
    } else {
      toast({
        title: "Error",
        description: result.error || "No se pudo revertir la exclusión.",
        variant: "destructive",
      });
    }
  };
  
  const formatDate = (dateString: string) => {
    try {
        return format(new Date(dateString), "d 'de' LLLL 'de' yyyy, HH:mm", { locale: es });
    } catch {
        return "Fecha inválida";
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por contacto o campaña..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-8"
        />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contacto</TableHead>
              <TableHead>Campaña Excluida</TableHead>
              <TableHead>Fecha de Exclusión</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExclusions.length > 0 ? (
              filteredExclusions.map((exclusion) => (
                <TableRow key={exclusion.id}>
                  <TableCell className="font-medium">{exclusion.contact}</TableCell>
                  <TableCell><Badge variant="secondary">{exclusion.campaignName}</Badge></TableCell>
                  <TableCell>{formatDate(exclusion.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                       <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Revertir
                          </Button>
                       </AlertDialogTrigger>
                       <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Revertir esta exclusión?</AlertDialogTitle>
                            <AlertDialogDescription>
                                El contacto <strong>{exclusion.contact}</strong> volverá a ser elegible para recibir mensajes de la campaña <strong>"{exclusion.campaignName}"</strong> en futuras ejecuciones si coincide con la consulta SQL.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRevertExclusion(exclusion.id)}>
                                Sí, revertir exclusión
                              </AlertDialogAction>
                          </AlertDialogFooter>
                       </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No se encontraron exclusiones.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
