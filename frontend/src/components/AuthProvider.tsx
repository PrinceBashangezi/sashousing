'use client';

import { initializeAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

export default function AuthProvider({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    useEffect(() => {
        initializeAuth();
    }, []);

    return <>{children}</>;
}
