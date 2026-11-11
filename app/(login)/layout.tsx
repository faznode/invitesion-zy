import { AuthProvider } from '@/components/auth/auth-provider';

export default function LoginGroupLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
