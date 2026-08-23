'use client';

import { initializeAuth } from '@/hooks/useAuth';
import { backendUrl } from '@/utils/api';
import { getFirebaseAuth } from '@/utils/firebase';
import { useEffect } from 'react';

let apiFetchInstalled = false;

const installApiFetchAuth = () => {
    if (apiFetchInstalled || typeof window === 'undefined') return;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
        const requestUrl =
            typeof input === 'string'
                ? input
                : input instanceof Request
                  ? input.url
                  : String(input);

        if (!requestUrl.startsWith(backendUrl)) {
            return originalFetch(input, init);
        }

        const firebaseUser = getFirebaseAuth().currentUser;
        const token = firebaseUser ? await firebaseUser.getIdToken() : null;
        const headers = new Headers(
            input instanceof Request ? input.headers : undefined
        );

        new Headers(init?.headers).forEach((value, key) => {
            headers.set(key, value);
        });

        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        return originalFetch(input, { ...init, headers });
    };

    apiFetchInstalled = true;
};

export default function AuthProvider({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    useEffect(() => {
        // MOBILE AUTH COMPATIBILITY: remove when same-site domains are available.
        installApiFetchAuth();
        initializeAuth();
    }, []);

    return <>{children}</>;
}
