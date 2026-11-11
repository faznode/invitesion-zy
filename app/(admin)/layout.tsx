import { AuthProvider } from '@/components/auth/auth-provider';

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
