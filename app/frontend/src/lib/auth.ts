import { client } from './api';

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  last_login?: string;
}

export const authApi = {
  async getCurrentUser(): Promise<AppUser | null> {
    try {
      const response = await client.auth.me();
      return (response?.data as AppUser) ?? null;
    } catch (error: any) {
      const status = error?.response?.status ?? error?.status ?? error?.statusCode;
      if (status === 401) {
        return null;
      }
      throw error;
    }
  },

  async login(): Promise<void> {
    await client.auth.toLogin();
  },

  async logout(): Promise<void> {
    await client.auth.logout();
  },
};
