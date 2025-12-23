
'use server';

import type { QueryResult, Client } from 'pg';
import bcrypt from 'bcryptjs';
import { getDbPool, getDbPoolSafe } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import type { Gerencia } from './gerenciaActions';

export interface UserRecord {
  id: string;
  name?: string | null;
  email: string;
  hashedPassword?: string;
  role: 'admin' | 'colaborador';
  image?: string | null;
  gerencia_id?: string | null;
  gerencia_nombre?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getUserByEmail(email: string): Promise<{ user?: UserRecord; error?: string }> {
  if (!email) {
    return { error: 'Email no proporcionado.' };
  }
  try {
    const db = getDbPoolSafe(); // Could be called during auth/session management
    if (!db) {
        return { error: 'Database not available during build time or connection failed.' };
    }
    const query = `
      SELECT 
        u.id, u.name, u.email, u."hashedPassword", u.role, '' as image,
        u.gerencia_id, g.nombre as gerencia_nombre,
        u.created_at AS "createdAt", u.updated_at AS "updatedAt"
      FROM users u
      LEFT JOIN gerencias g ON u.gerencia_id = g.id
      WHERE u.email = $1;
    `;
    const result: QueryResult<UserRecord> = await db.query(query, [email.toLowerCase()]);
    const user = result.rows[0];

    if (!user) {
      return { user: undefined };
    }
    return { user };
  } catch (err: any) {
    console.error('Error de base de datos al obtener usuario por email:', err);
    return { error: `Error de base de datos: ${err.message}` };
  }
}

/**
 * Obtiene un usuario por su ID, con la opción de usar un cliente de BD existente para transacciones.
 * @param userId El ID del usuario.
 * @param dbClient (Opcional) Un cliente de la pool de PostgreSQL ya conectado.
 * @returns El registro del usuario o un error.
 */
export async function getUserById(userId: string, dbClient?: Client): Promise<{ user?: UserRecord; error?: string }> {
  if (!userId) {
    return { error: 'ID de usuario no proporcionado.' };
  }
  try {
    // If dbClient is provided, use it (runtime operation with transaction)
    // Otherwise use safe pool for potential build-time calls
    const db = dbClient || getDbPoolSafe();
    if (!db) {
        return { error: 'Database not available during build time or connection failed.' };
    }
    const query = `
      SELECT 
        u.id, u.name, u.email, u."hashedPassword", u.role, u.image,
        u.gerencia_id, g.nombre as gerencia_nombre,
        u.created_at AS "createdAt", u.updated_at AS "updatedAt"
      FROM users u
      LEFT JOIN gerencias g ON u.gerencia_id = g.id
      WHERE u.id = $1;
    `;
    const result: QueryResult<UserRecord> = await db.query(query, [userId]);
    const user = result.rows[0];

    if (!user) {
      return { user: undefined, error: 'Usuario no encontrado.' };
    }
    return { user };
  } catch (err: any) {
    console.error(`Error de base de datos al obtener usuario por ID ${userId}:`, err);
    return { error: `Error de base de datos: ${err.message}` };
  }
}

interface CreateUserArgs {
    name: string;
    email: string;
    password_unhashed: string;
    gerencia_id: string;
}

export async function createUser(
    userData: CreateUserArgs
): Promise<{ user?: Omit<UserRecord, 'hashedPassword'>; error?: string }> {
  try {
    const db = getDbPool(); // Runtime operation
    const { name, email, password_unhashed, gerencia_id } = userData;

    if (!gerencia_id) {
        return { error: "La gerencia es requerida." };
    }

    const existingUserResult = await getUserByEmail(email);
    if (existingUserResult.error) {
      return { error: existingUserResult.error };
    }
    if (existingUserResult.user) {
      return { error: 'El correo electrónico ya está en uso.' };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password_unhashed, salt);

    const role = 'colaborador'; // Default role for new sign-ups

    const query = `
      INSERT INTO users (name, email, "hashedPassword", role, gerencia_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, email, role, '' as image, gerencia_id, created_at AS "createdAt", updated_at AS "updatedAt";
    `;
    const result = await db.query(query, [name, email.toLowerCase(), hashedPassword, role, gerencia_id]);
    const newUser = result.rows[0];

    if (!newUser) {
        return { error: "No se pudo crear el usuario en la base de datos."}
    }

    return { user: newUser };
  } catch (err: any) {
    console.error('Error creando usuario:', err);
    if (err.code === '23505') { 
      return { error: 'El correo electrónico ya está en uso (error de constraint).' };
    }
    if (err.code === '23503') { // Foreign key violation
      return { error: 'La gerencia seleccionada no es válida.' };
    }
    return { error: `Error de BD al crear usuario: ${err.message}` };
  }
}

// --- Admin Actions ---

export async function getAllUsers(): Promise<{ users?: (Omit<UserRecord, 'hashedPassword' | 'createdAt' | 'updatedAt'>)[], error?: string }> {
    const user = await getCurrentUser();
    if (!user) {
        return { error: "Acción no autorizada." };
    }

    try {
        const db = getDbPoolSafe(); // Could be called during build
        if (!db) {
            return { error: 'Database not available during build time or connection failed.' };
        }
        const query = `
          SELECT 
            u.id, u.name, u.email, u.role, '' as image, u.gerencia_id, g.nombre AS gerencia_nombre 
          FROM users u
          LEFT JOIN gerencias g ON u.gerencia_id = g.id
          ORDER BY u.name ASC`;
        const result = await db.query(query);
        return { users: result.rows };
    } catch (err: any) {
        return { error: `Error de BD: ${err.message}` };
    }
}

export async function updateUserRole(userId: string, newRole: 'admin' | 'colaborador'): Promise<{ success?: boolean, error?: string }> {
    const currentUser = await getCurrentUser();
    if (currentUser?.role !== 'admin') {
        return { error: "Acción no autorizada." };
    }

    if (currentUser.id === userId) {
        return { error: "No puedes cambiar tu propio rol." };
    }

    try {
        const db = getDbPool(); // Runtime operation
        const query = 'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id';
        const result = await db.query(query, [newRole, userId]);

        if (result.rowCount === 0) {
            return { error: 'Usuario no encontrado.' };
        }
        
        revalidatePath('/dashboard/users');
        return { success: true };

    } catch (err: any) {
        return { error: `Error de BD: ${err.message}` };
    }
}

export async function updateUserGerencia(userId: string, newGerenciaId: string): Promise<{ success?: boolean, error?: string }> {
    const currentUser = await getCurrentUser();
    if (currentUser?.role !== 'admin') {
        return { error: "Acción no autorizada." };
    }

    try {
        const db = getDbPool(); // Runtime operation
        const query = 'UPDATE users SET gerencia_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id';
        const result = await db.query(query, [newGerenciaId, userId]);

        if (result.rowCount === 0) {
            return { error: 'Usuario no encontrado.' };
        }
        
        revalidatePath('/dashboard/users');
        return { success: true };

    } catch (err: any) {
       if (err.code === '23503') { // Foreign key violation
            return { error: 'La gerencia seleccionada no es válida.' };
        }
        return { error: `Error de BD: ${err.message}` };
    }
}

export async function updateUserProfile(
  userId: string,
  formData: FormData
): Promise<{ success?: boolean; error?: string; user?: { image: string } }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.id !== userId) {
    return { error: 'Acción no autorizada.' };
  }

  const image = formData.get('image') as string | null;

  if (!image) {
    return { error: 'No se proporcionó ninguna imagen.' };
  }

  try {
    const db = getDbPool(); // Runtime operation
    const query = 'UPDATE users SET image = $1, updated_at = NOW() WHERE id = $2 RETURNING image';
    const result = await db.query(query, [image, userId]);
    
    if (result.rowCount === 0) {
      return { error: 'Usuario no encontrado.' };
    }
    
    revalidatePath('/dashboard/profile');
    revalidatePath('/dashboard'); // For header to update
    return { success: true, user: result.rows[0] };

  } catch (err: any) {
    console.error('Error actualizando perfil:', err);
    return { error: `Error de BD: ${err.message}` };
  }
}
