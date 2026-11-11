import { AuthProvider } from '@/components/auth/auth-provider';

export default function CustomerGroupLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
