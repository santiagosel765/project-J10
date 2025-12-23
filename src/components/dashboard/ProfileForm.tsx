
"use client";

import type React from 'react';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { UserRecord } from '@/actions/userActions';
import { updateUserProfile } from '@/actions/userActions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface ProfileFormProps {
  user: Omit<UserRecord, 'hashedPassword'>;
}

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const { toast } = useToast();

  const [preview, setPreview] = useState<string | null>(user.image || null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
          setError("El archivo es demasiado grande. El límite es 2MB.");
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getInitials = (name?: string | null, email?: string) => {
    if (name) {
      const parts = name.split(' ').filter(p => p);
      if (parts.length > 1) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!preview || preview === user.image) {
        toast({ title: 'Sin cambios', description: 'No has seleccionado una nueva imagen para guardar.'});
        return;
    }
    
    setIsSaving(true);
    const formData = new FormData();
    formData.append('image', preview); // The preview is the Data URI

    const result = await updateUserProfile(user.id, formData);

    if (result.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else {
        toast({ title: 'Éxito', description: 'Tu foto de perfil ha sido actualizada.' });
        // The session doesn't store the image, so no need to update it.
        // But we refresh the router to show the new image if the page logic re-fetches it.
        router.refresh();
    }
    setIsSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto de Perfil</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="h-32 w-32 border-2 border-primary">
              <AvatarImage src={preview || undefined} alt={user.name || 'Avatar'} data-ai-hint="user avatar" />
              <AvatarFallback className="text-4xl">
                {getInitials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="picture" className="flex items-center justify-center cursor-pointer text-sm text-primary hover:underline">
                <Camera className="mr-2 h-4 w-4" />
                Cambiar foto
              </Label>
              <Input id="picture" type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
            </div>
            {error && <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving || !preview || preview === user.image}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isSaving ? 'Guardando...' : 'Guardar Foto'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
