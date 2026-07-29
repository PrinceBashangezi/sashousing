import Image from 'next/image';
import type { ReactNode } from 'react';

type HousingInfoLayoutProps = {
    title: string;
    description?: string;
    heroImage?: {
        src: string;
        alt: string;
    };
    children: ReactNode;
};

export default function HousingInfoLayout({
    title,
    description,
    heroImage,
    children,
}: HousingInfoLayoutProps) {
    return (
        <div className="min-h-screen bg-sas-mist text-sas-black">
            {heroImage ? (
                <div className="relative h-48 w-full sm:h-64">
                    <Image
                        src={heroImage.src}
                        alt={heroImage.alt}
                        fill
                        priority
                        className="object-cover"
                        sizes="100vw"
                    />
                    <div className="absolute inset-0 bg-sas-black/35" />
                    <div className="absolute inset-0 flex items-end">
                        <div className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6">
                            <h1 className="font-display text-3xl font-semibold text-sas-white sm:text-4xl">
                                {title}
                            </h1>
                            {description && (
                                <p className="mt-2 max-w-2xl text-sas-white/90">
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
            <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                {!heroImage && (
                    <div className="mb-8 border-b border-sas-line pb-5">
                        <h1 className="font-display text-2xl font-semibold text-sas-black sm:text-4xl">
                            {title}
                        </h1>
                        {description && (
                            <p className="mt-2 max-w-2xl text-sas-black/70">
                                {description}
                            </p>
                        )}
                    </div>
                )}
                <div className="prose-housing space-y-6 text-sas-black/80">
                    {children}
                </div>
            </main>
        </div>
    );
}
