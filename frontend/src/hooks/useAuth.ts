'use client';

import { useSyncExternalStore } from 'react';
import { User } from '@/types';
import { backendUrl } from '@/utils/api';
import { getFirebaseAuth } from '@/utils/firebase';

type AuthState = {
    user: User | null;
    loading: boolean;
};

const SESSION_HINT_KEY = 'sas:hasSession';
const SESSION_HINT_COOKIE = 'sas_has_session=true';

export const hasSessionHint = () => {
    if (typeof window === 'undefined') {
        return false;
    }

    return (
        window.localStorage.getItem(SESSION_HINT_KEY) === 'true' ||
        document.cookie.includes(SESSION_HINT_COOKIE)
    );
};

const SERVER_AUTH_STATE: AuthState = {
    user: null,
    loading: true,
};

let authState: AuthState =
    typeof window === 'undefined'
        ? SERVER_AUTH_STATE
        : {
              user: null,
              loading: hasSessionHint(),
          };
let authPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

const notifySubscribers = () => {
    subscribers.forEach((subscriber) => subscriber());
};

const subscribeToAuth = (subscriber: () => void) => {
    subscribers.add(subscriber);

    return () => {
        subscribers.delete(subscriber);
    };
};

const getAuthSnapshot = () => authState;

const getServerAuthSnapshot = () => SERVER_AUTH_STATE;

const resolveSignedOutWithoutSessionHint = () => {
    if (hasSessionHint()) {
        return;
    }

    if (!authState.loading && authState.user === null) {
        return;
    }

    authState = {
        user: null,
        loading: false,
    };
    authPromise = null;
    notifySubscribers();
};

export const setSessionHint = (hasSession: boolean) => {
    if (typeof window === 'undefined') {
        return;
    }

    if (hasSession) {
        window.localStorage.setItem(SESSION_HINT_KEY, 'true');
        document.cookie = 'sas_has_session=true; path=/; max-age=86400; SameSite=Lax';
        return;
    }

    window.localStorage.removeItem(SESSION_HINT_KEY);
    document.cookie = 'sas_has_session=; path=/; max-age=0; SameSite=Lax';
};

const loadAuth = () => {
    if (authPromise) {
        return authPromise;
    }

    authPromise = getFirebaseAuth()
        .authStateReady()
        .then(() =>
            fetch(`${backendUrl}/api/auth/current_user`, {
                credentials: 'include',
            })
        )
        .then(async (response) => {
            if (!response.ok) {
                setSessionHint(false);
            }
            if (response.ok) {
                setSessionHint(true);
            }

            authState = {
                user: response.ok ? (await response.json()).user : null,
                loading: false,
            };
        })
        .catch((error) => {
            console.error('Auth check error:', error);
            authState = {
                user: null,
                loading: false,
            };
            setSessionHint(false);
        })
        .finally(() => {
            notifySubscribers();
        });

    return authPromise;
};

export const initializeAuth = () => {
    if (hasSessionHint()) {
        void loadAuth();
        return;
    }

    resolveSignedOutWithoutSessionHint();
};

export function useAuth() {
    return useSyncExternalStore(
        subscribeToAuth,
        getAuthSnapshot,
        getServerAuthSnapshot
    );
}

export function useCurrentUser() {
    const { user } = useAuth();

    return user;
}
