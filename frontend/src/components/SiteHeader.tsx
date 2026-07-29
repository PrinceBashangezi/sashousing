'use client';

import { setSessionHint, useAuth } from '@/hooks/useAuth';
import { backendUrl } from '@/utils/api';
import { getFirebaseAuth } from '@/utils/firebase';
import { renderGoogleSignInButton } from '@/utils/googleSignIn';
import { signOut } from 'firebase/auth';
import Image from 'next/image';
import Link from 'next/link';
import { memo, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const navLinks = [
    {
        href: '/campus/housing',
        label: 'Rooms',
        shortLabel: 'Rooms',
        rememberLastRoomsPath: true,
    },
    {
        href: '/campus/housing/process',
        label: 'Housing Process',
        shortLabel: 'Process',
        rememberLastRoomsPath: false,
    },
    {
        href: '/campus/housing/accommodation',
        label: 'Accommodation',
        shortLabel: 'Accommodation',
        rememberLastRoomsPath: false,
    },
] as const;

const LAST_ROOMS_PATH_KEY = 'sas:lastRoomsPath';
const ROOMS_HOME_PATH = '/campus/housing';
const nonRoomHousingPaths = new Set([
    '/campus/housing/process',
    '/campus/housing/accommodation',
    '/campus/housing/preferences',
]);

const isRoomBrowsingPath = (pathname: string) =>
    pathname === ROOMS_HOME_PATH ||
    (pathname.startsWith(`${ROOMS_HOME_PATH}/`) &&
        !Array.from(nonRoomHousingPaths).some(
            (nonRoomPath) =>
                pathname === nonRoomPath ||
                pathname.startsWith(`${nonRoomPath}/`)
        ));

type SiteHeaderProps = {
    onNavigate?: (href: string) => void;
};

export default function SiteHeader({ onNavigate }: SiteHeaderProps = {}) {
    const pathname = usePathname();
    const [lastRoomsHref, setLastRoomsHref] = useState(ROOMS_HOME_PATH);

    useEffect(() => {
        const savedHref = window.localStorage.getItem(LAST_ROOMS_PATH_KEY);
        if (savedHref) {
            setLastRoomsHref(savedHref);
        }
    }, []);

    useEffect(() => {
        if (!isRoomBrowsingPath(pathname)) {
            return;
        }

        const currentHref = `${pathname}${window.location.search}`;
        window.localStorage.setItem(LAST_ROOMS_PATH_KEY, currentHref);
        setLastRoomsHref(currentHref);
    }, [pathname]);

    const handleNavigation = (
        event: React.MouseEvent<HTMLAnchorElement>,
        href: string
    ) => {
        if (!onNavigate) return;

        event.preventDefault();
        onNavigate(href);
    };

    return (
        <header className="border-b border-sas-line bg-sas-white">
            <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                        href="/campus/housing"
                        onClick={(event) =>
                            handleNavigation(event, '/campus/housing')
                        }
                        className="flex min-w-0 items-center gap-2 text-sas-black sm:gap-3"
                    >
                        <Image
                            src="/logos/saslogo.png"
                            alt="SAS"
                            width={56}
                            height={54}
                            priority
                            className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12"
                        />

                        <span className="truncate font-display text-lg font-semibold leading-none sm:text-2xl">
                            Housing Platform
                        </span>
                    </Link>

                    <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                        <span className="hidden text-sm uppercase text-sas-green sm:inline">
                            Scripps Associated Students
                        </span>

                        <SiteHeaderAuthControls onNavigate={onNavigate} />
                    </div>
                </div>

                <nav
                    aria-label="Main navigation"
                    className="mt-3 flex flex-wrap gap-2 border-t border-sas-line pt-3"
                >
                    {navLinks.map((link) => {
                        const href = link.rememberLastRoomsPath
                            ? lastRoomsHref
                            : link.href;
                        const isActive =
                            pathname === link.href ||
                            (link.href !== '/campus/housing' &&
                                pathname.startsWith(link.href));

                        return (
                            <Link
                                key={link.href}
                                href={href}
                                onClick={(event) =>
                                    handleNavigation(event, href)
                                }
                                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-smooth ${
                                    isActive
                                        ? 'bg-sas-green text-sas-white shadow-sm'
                                        : 'text-sas-black hover:bg-sas-mist hover:text-sas-green'
                                }`}
                            >
                                <span className="sm:hidden">
                                    {link.shortLabel}
                                </span>
                                <span className="hidden sm:inline">
                                    {link.label}
                                </span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </header>
    );
}

const SiteHeaderAuthControls = memo(function SiteHeaderAuthControls({
    onNavigate,
}: SiteHeaderProps) {
    const { user, loading } = useAuth();
    const [loggingOut, setLoggingOut] = useState(false);
    const googleButtonRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (loading || user || !googleButtonRef.current) return;

        renderGoogleSignInButton(
            googleButtonRef.current,
            () => window.location.reload(),
            (error) => console.error('Login failed:', error)
        );
    }, [loading, user]);

    const logout = async () => {
        setLoggingOut(true);

        try {
            setSessionHint(false);
            await signOut(getFirebaseAuth());

            await fetch(`${backendUrl}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });

            window.location.href = ROOMS_HOME_PATH;
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            setLoggingOut(false);
        }
    };

    const handleNavigation = (
        event: React.MouseEvent<HTMLAnchorElement>,
        href: string
    ) => {
        if (!onNavigate) return;

        event.preventDefault();
        onNavigate(href);
    };

    return (
        <>
            {user?.isAdmin && (
                <Link
                    href="/admin/housing-data"
                    onClick={(event) =>
                        handleNavigation(event, '/admin/housing-data')
                    }
                    className="rounded-md border border-sas-line px-3 py-2 text-sm font-medium text-sas-black hover:border-sas-green hover:text-sas-green"
                >
                    Dashboard
                </Link>
            )}

            {user ? (
                <button
                    type="button"
                    onClick={logout}
                    disabled={loggingOut}
                    className="rounded-md border border-sas-green px-3 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60"
                >
                    {loggingOut ? (
                        '...'
                    ) : (
                        <>
                            <span className="sm:hidden">Out</span>
                            <span className="hidden sm:inline">
                                Sign out
                            </span>
                        </>
                    )}
                </button>
            ) : (
                <div ref={googleButtonRef} />
            )}
        </>
    );
});
