
"use client";

import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UserRecord } from "@/actions/userActions";
import { updateUserRole, updateUserGerencia } from "@/actions/userActions";
import { useToast } from '@/hooks/use-toast';
import { Check, Edit, Loader2, ShieldCheck, User, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';
import type { User as SessionUser } from 'next-auth';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import type { Gerencia } from '@/actions/gerenciaActions';

type UserForTable = Omit<UserRecord, 'hashedPassword' | 'createdAt' | 'updatedAt'>;

interface UserTableProps {
  initialUsers: UserForTable[];
  currentUser: SessionUser;
  gerencias: Gerencia[];
}

export function UserTable({ initialUsers, currentUser, gerencias }: UserTableProps) {
  const [users, setUsers] = useState(initialUsers);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'colaborador'>('colaborador');
  const [selectedGerenciaId, setSelectedGerenciaId] = useState<string | null>(null);

  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isSavingGerencia, setIsSavingGerencia] = useState(false);

  const { toast } = useToast();
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const totalPages = Math.ceil(users.length / itemsPerPage);

  const paginatedUsers = useMemo(() => {
    return users.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [users, currentPage, itemsPerPage]);

  const handleEditClick = (user: UserForTable, field: 'role' | 'gerencia') => {
    setEditingUserId(user.id);
    if(field === 'role') {
        setSelectedRole(user.role);
    } else {
        setSelectedGerenciaId(user.gerencia_id || null);
    }
  };

  const handleCancelClick = () => {
    setEditingUserId(null);
  };

  const handleSaveRoleClick = async (userId: string) => {
    setIsSavingRole(true);
    const result = await updateUserRole(userId, selectedRole);
    if (result.success) {
      toast({ title: 'Éxito', description: 'El rol del usuario ha sido actualizado.' });
      setUsers(users.map(u => u.id === userId ? { ...u, role: selectedRole } : u));
      setEditingUserId(null);
    } else {
      toast({ title: 'Error', description: result.error || 'No se pudo actualizar el rol.', variant: 'destructive' });
    }
    setIsSavingRole(false);
  };

  const handleSaveGerenciaClick = async (userId: string) => {
    if (!selectedGerenciaId) {
        toast({ title: 'Error', description: 'Debe seleccionar una gerencia.', variant: 'destructive'});
        return;
    }
    setIsSavingGerencia(true);
    const result = await updateUserGerencia(userId, selectedGerenciaId);
    if (result.success) {
      toast({ title: 'Éxito', description: 'La gerencia del usuario ha sido actualizada.' });
      const newGerenciaNombre = gerencias.find(g => g.id === selectedGerenciaId)?.nombre;
      setUsers(users.map(u => u.id === userId ? { ...u, gerencia_id: selectedGerenciaId, gerencia_nombre: newGerenciaNombre } : u));
      setEditingUserId(null);
    } else {
      toast({ title: 'Error', description: result.error || 'No se pudo actualizar la gerencia.', variant: 'destructive' });
    }
    setIsSavingGerencia(false);
  };


  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'default';
      case 'colaborador':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return '??';
    const parts = name.split(' ').filter(p => p);
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };


  return (
    <>
      <div className="relative w-full overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo Electrónico</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Gerencia</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                     <Avatar className="h-9 w-9">
                        <AvatarImage src={user.image || undefined} alt={user.name || 'Avatar'} data-ai-hint="user avatar" />
                        <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                  </div>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  {editingUserId === user.id ? (
                     <Select value={selectedRole} onValueChange={(value: 'admin' | 'colaborador') => setSelectedRole(value)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Seleccionar rol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <div className="flex items-center">
                            <ShieldCheck className="mr-2 h-4 w-4" /> Administrador
                          </div>
                        </SelectItem>
                        <SelectItem value="colaborador">
                          <div className="flex items-center">
                            <User className="mr-2 h-4 w-4" /> Colaborador
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={getRoleBadgeVariant(user.role)}>{user.role}</Badge>
                  )}
                </TableCell>
                <TableCell>
                    {editingUserId === user.id ? (
                        <Select value={selectedGerenciaId || ''} onValueChange={(value) => setSelectedGerenciaId(value)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Seleccionar gerencia" />
                            </SelectTrigger>
                            <SelectContent>
                                {gerencias.map((g) => (
                                     <SelectItem key={g.id} value={g.id}>
                                        <div className="flex items-center">
                                            <Building2 className="mr-2 h-4 w-4" /> {g.nombre}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <span className="text-sm">{user.gerencia_nombre || <span className="italic text-muted-foreground">N/A</span>}</span>
                    )}
                </TableCell>
                <TableCell className="text-right">
                  {user.id === currentUser.id ? (
                     <span className="text-xs text-muted-foreground italic">Tú</span>
                  ) : editingUserId === user.id ? (
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={handleCancelClick}>Cancelar</Button>
                      <Button size="sm" onClick={() => handleSaveRoleClick(user.id)} disabled={isSavingRole}>
                        {isSavingRole ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        Guardar Rol
                      </Button>
                      <Button size="sm" onClick={() => handleSaveGerenciaClick(user.id)} disabled={isSavingGerencia}>
                        {isSavingGerencia ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        Guardar Gerencia
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handleEditClick(user, 'role')}>
                            <Edit className="mr-2 h-4 w-4" /> Rol
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditClick(user, 'gerencia')}>
                            <Building2 className="mr-2 h-4 w-4" /> Gerencia
                        </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
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
    </>
  );
}
