'use client';
import { OwnerProvider } from './owner-context';

// Panel del dueño: menú lateral + datos de la organización compartidos por todas sus páginas
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <OwnerProvider>{children}</OwnerProvider>;
}
